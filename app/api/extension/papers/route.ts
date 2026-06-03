import { getNonEmptyString, invalidJsonResponse } from "@/lib/api/responses";
import { logSystemAuditEvent } from "@/lib/auth/audit";
import { isPaperRating, type PaperRating } from "@/lib/paper-ratings";
import { submitPaperUrl } from "@/lib/papers/submit-paper";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ExtensionPaperRequestBody = {
  url?: unknown;
  rating?: unknown;
};

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin?.startsWith("chrome-extension://")) {
    return new Headers();
  }

  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

function getResponseHeaders(request: Request, initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);

  for (const [key, value] of getCorsHeaders(request)) {
    headers.set(key, value);
  }

  return headers;
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  return Response.json(body, {
    ...init,
    headers: getResponseHeaders(request, init?.headers),
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.EXTENSION_API_SECRET;
  const bearerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  return Boolean(secret) && bearerToken === secret;
}

async function applyInitialRating({
  paperId,
  rating,
}: {
  paperId: string;
  rating: PaperRating;
}) {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("papers")
    .update({
      rating,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paperId)
    .select("id, rating")
    .maybeSingle<{ id: string; rating: PaperRating | null }>();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "Paper not found." };
  }

  await logSystemAuditEvent(supabase, {
    action: "paper_rating_updated",
    resourceType: "paper",
    resourceId: paperId,
    metadata: {
      rating: data.rating,
      source: "chrome_extension",
    },
  });

  return { paper: data };
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return jsonResponse(request, { error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return jsonResponse(
      request,
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
      },
      { status: 500 },
    );
  }

  let body: ExtensionPaperRequestBody;

  try {
    body = (await request.json()) as ExtensionPaperRequestBody;
  } catch {
    const response = invalidJsonResponse();
    const payload = await response.json();

    return jsonResponse(request, payload, { status: response.status });
  }

  const submittedUrl = getNonEmptyString(body.url);

  if (!submittedUrl) {
    return jsonResponse(
      request,
      { error: "Please provide an arXiv URL." },
      { status: 400 },
    );
  }

  if (
    body.rating !== null &&
    body.rating !== undefined &&
    !isPaperRating(body.rating)
  ) {
    return jsonResponse(
      request,
      { error: "Please provide a valid rating." },
      { status: 400 },
    );
  }

  try {
    const result = await submitPaperUrl(supabase, submittedUrl, {
      auditSource: "chrome_extension",
    });

    if (result.status === "invalid_url") {
      return jsonResponse(request, { error: result.error }, { status: 400 });
    }

    if (!result.paperId) {
      return jsonResponse(
        request,
        { error: "The paper was recognized, but its database row could not be found." },
        { status: 500 },
      );
    }

    let rating: PaperRating | null = null;

    if (isPaperRating(body.rating)) {
      const ratingResult = await applyInitialRating({
        paperId: result.paperId,
        rating: body.rating,
      });

      if ("error" in ratingResult) {
        return jsonResponse(
          request,
          { error: "The paper was added, but its rating could not be saved.", details: ratingResult.error },
          { status: 500 },
        );
      }

      rating = ratingResult.paper.rating;
    }

    return jsonResponse(
      request,
      {
        status: result.status,
        paperId: result.paperId,
        arxivId: result.arxivId,
        processingStatus: result.processingStatus,
        jobId: result.jobId,
        rating,
        url: result.url,
      },
      { status: result.status === "accepted" ? 202 : 200 },
    );
  } catch (error) {
    return jsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "The paper could not be submitted.",
      },
      { status: 500 },
    );
  }
}
