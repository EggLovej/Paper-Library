import { logAdminAuditEvent } from "@/lib/auth/audit";
import { enqueuePaperProcessingJob } from "@/lib/jobs/paper-processing-jobs";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type QueueMode = "retry" | "reprocess";

type QueueablePaperRow = {
  id: string;
  arxiv_id: string;
  processing_status: string | null;
};

type PaperProcessingJobRow = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
  run_after: string | null;
  locked_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const LATEST_JOB_COLUMNS =
  "id, paper_id, status, attempts, run_after, locked_at, completed_at, last_error, created_at, updated_at";

function validateQueueMode(mode: QueueMode, paper: QueueablePaperRow) {
  if (mode === "retry" && paper.processing_status !== "failed") {
    return "Only failed papers can be retried.";
  }

  if (
    mode === "reprocess" &&
    (paper.processing_status === "pending" ||
      paper.processing_status === "processing")
  ) {
    return "This paper is already queued or processing.";
  }

  return null;
}

export async function queuePaperForProcessing({
  mode,
  paperId,
  request,
  supabase,
}: {
  mode: QueueMode;
  paperId: string;
  request: Request;
  supabase: SupabaseServerClient;
}) {
  const { data: paper, error: loadError } = await supabase
    .from("papers")
    .select("id, arxiv_id, processing_status")
    .eq("id", paperId)
    .maybeSingle<QueueablePaperRow>();

  if (loadError) {
    return Response.json(
      { error: "The paper could not be loaded.", details: loadError.message },
      { status: 500 },
    );
  }

  if (!paper) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  const invalidQueueReason = validateQueueMode(mode, paper);

  if (invalidQueueReason) {
    return Response.json({ error: invalidQueueReason }, { status: 400 });
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
      ...(mode === "reprocess"
        ? { report_email_sent_at: null, report_email_error: null }
        : {}),
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
    .select(LATEST_JOB_COLUMNS)
    .eq("id", job.id)
    .maybeSingle<PaperProcessingJobRow>();

  await logAdminAuditEvent(supabase, request, {
    action: mode === "retry" ? "paper_retry_queued" : "paper_reprocess_queued",
    resourceType: "paper",
    resourceId: paper.id,
    metadata: { source: "app", jobId: job.id, arxivId: paper.arxiv_id },
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
