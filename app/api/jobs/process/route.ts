import { processPaperProcessingJobs } from "@/lib/jobs/paper-processing-jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function getConfiguredAppOrigin(requestOrigin: string) {
  const configuredUrl = process.env.APP_BASE_URL?.trim().replace(/^["']|["']$/g, "");

  if (!configuredUrl) {
    return requestOrigin;
  }

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return requestOrigin;
  }
}

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  if (request.method !== "POST") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  const requestOrigin = new URL(request.url).origin;
  const appOrigin = getConfiguredAppOrigin(requestOrigin);

  return origin === requestOrigin || origin === appOrigin;
}

function getLimit(request: Request) {
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get("limit") ?? 1);

  if (!Number.isInteger(parsedLimit)) {
    return 1;
  }

  return Math.min(Math.max(parsedLimit, 1), 5);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
      },
      { status: 500 },
    );
  }

  let results: Awaited<ReturnType<typeof processPaperProcessingJobs>>;

  try {
    results = await processPaperProcessingJobs(supabase, getLimit(request));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The job runner failed unexpectedly.",
      },
      { status: 500 },
    );
  }

  return Response.json({
    processed: results.length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
