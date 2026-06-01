import { isPaperRating } from "@/lib/paper-ratings";
import { invalidJsonResponse, missingSupabaseResponse } from "@/lib/api/responses";
import { verifyRatingActionToken } from "@/lib/rating-action-tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RatingRequestBody = {
  rating?: unknown;
  token?: unknown;
};

async function updateRating({
  paperId,
  rating,
  token,
}: {
  paperId: string;
  rating: unknown;
  token: string | null;
}) {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  if (!isPaperRating(rating)) {
    return Response.json(
      { error: "Please provide a valid rating." },
      { status: 400 },
    );
  }

  if (!verifyRatingActionToken({ paperId, rating, token })) {
    return Response.json(
      { error: "This rating link is invalid." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("papers")
    .update({
      rating,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paperId)
    .select("id, rating")
    .maybeSingle<{ id: string; rating: string | null }>();

  if (error) {
    return Response.json(
      { error: "The rating could not be updated.", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  return Response.json({ paper: data });
}

function confirmationHtml(rating: string) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Rating saved</title>
      </head>
      <body style="margin:0;background:#f4f4f5;color:#18181b;font-family:Arial,sans-serif;">
        <main style="max-width:520px;margin:15vh auto;padding:28px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;">
          <p style="margin:0 0 8px;color:#0f766e;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">ArXiv Sieve</p>
          <h1 style="margin:0 0 12px;font-size:24px;">Rating saved</h1>
          <p style="margin:0;color:#52525b;font-size:15px;line-height:1.6;">Saved as ${rating}. You can close this tab.</p>
        </main>
      </body>
    </html>`;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/papers/[id]/rate">,
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const rating = url.searchParams.get("rating");
  const token = url.searchParams.get("token");
  const response = await updateRating({ paperId: id, rating, token });

  if (!response.ok) {
    return response;
  }

  return new Response(confirmationHtml(rating ?? ""), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/papers/[id]/rate">,
) {
  const { id } = await context.params;
  let body: RatingRequestBody;

  try {
    body = (await request.json()) as RatingRequestBody;
  } catch {
    return invalidJsonResponse();
  }

  return updateRating({
    paperId: id,
    rating: body.rating,
    token: typeof body.token === "string" ? body.token : null,
  });
}
