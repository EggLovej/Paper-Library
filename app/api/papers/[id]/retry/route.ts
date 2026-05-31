import { enqueuePaperProcessingJob } from "@/lib/jobs/paper-processing-jobs";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { requireAdminRequest } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PaperRetryRow = {
  id: string;
  arxiv_id: string;
  processing_status: string | null;
};

type PaperProcessingJobRow = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string | null;
  locked_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function missingSupabaseResponse() {
  return Response.json(
    {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
    },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/papers/[id]/retry">,
) {
  const unauthorized = requireAdminRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  const { data: paper, error: loadError } = await supabase
    .from("papers")
    .select("id, arxiv_id, processing_status")
    .eq("id", id)
    .maybeSingle<PaperRetryRow>();

  if (loadError) {
    return Response.json(
      { error: "The paper could not be loaded.", details: loadError.message },
      { status: 500 },
    );
  }

  if (!paper) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  if (paper.processing_status !== "failed") {
    return Response.json(
      { error: "Only failed papers can be retried." },
      { status: 400 },
    );
  }

  let job: { id: string; status: string };

  try {
    job = await enqueuePaperProcessingJob(supabase, paper.id, paper.arxiv_id);
  } catch (enqueueError) {
    return Response.json(
      {
        error: "Processing could not be queued.",
        details:
          enqueueError instanceof Error
            ? enqueueError.message
            : "Unknown queue error.",
      },
      { status: 500 },
    );
  }

  const { data: updatedPaper, error: updateError } = await supabase
    .from("papers")
    .update({
      processing_status: "pending",
      processing_error: null,
      processing_model: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paper.id)
    .select("*")
    .single();

  if (updateError) {
    return Response.json(
      {
        error: "The paper was queued, but its status could not be updated.",
        details: updateError.message,
      },
      { status: 500 },
    );
  }

  const { data: latestJob } = await supabase
    .from("paper_processing_jobs")
    .select(
      "id, paper_id, status, attempts, max_attempts, run_after, locked_at, completed_at, last_error, created_at, updated_at",
    )
    .eq("id", job.id)
    .maybeSingle<PaperProcessingJobRow>();

  await logAdminAuditEvent(supabase, request, {
    action: "paper_retry_queued",
    resourceType: "paper",
    resourceId: paper.id,
    metadata: { jobId: job.id, arxivId: paper.arxiv_id },
  });

  return Response.json(
    {
      status: "queued",
      paper: {
        ...updatedPaper,
        latest_job: latestJob ?? null,
      },
      jobId: job.id,
    },
    { status: 202 },
  );
}
