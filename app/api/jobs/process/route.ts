import { processPaperProcessingJobs } from "@/lib/jobs/paper-processing-jobs";
import { missingSupabaseResponse } from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { isAdminRequest, isTrustedOriginRequest } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  return isTrustedOriginRequest(request) && isAdminRequest(request);
}

function isBearerAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  return (
    Boolean(cronSecret) &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  );
}

function getLimit(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit") ?? "1";

  if (limitParam === "all") {
    return Number.POSITIVE_INFINITY;
  }

  const parsedLimit = Number(limitParam);

  if (!Number.isInteger(parsedLimit)) {
    return 1;
  }

  return Math.max(parsedLimit, 1);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
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

  await logAdminAuditEvent(supabase, request, {
    action: "processing_queue_run",
    resourceType: "paper_processing_jobs",
    metadata: {
      processed: results.length,
      mode: isBearerAuthorized(request) ? "bearer" : "admin",
    },
  });

  return Response.json({
    processed: results.length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
