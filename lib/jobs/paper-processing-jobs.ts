import { processPaper } from "@/lib/paper-processing";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type PaperProcessingJob = {
  id: string;
  paper_id: string;
  arxiv_id: string;
  attempts: number;
  max_attempts: number;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [
  2 * 60_000,
  60 * 60_000,
  24 * 60 * 60_000,
];

export async function enqueuePaperProcessingJob(
  supabase: SupabaseServerClient,
  paperId: string,
  arxivId: string,
) {
  const { data: existingJob, error: existingJobError } = await supabase
    .from("paper_processing_jobs")
    .select("id, status")
    .eq("paper_id", paperId)
    .in("status", ["pending", "processing"])
    .maybeSingle<{ id: string; status: string }>();

  if (existingJobError) {
    throw new Error(existingJobError.message);
  }

  if (existingJob) {
    return existingJob;
  }

  const { data, error } = await supabase
    .from("paper_processing_jobs")
    .insert({
      paper_id: paperId,
      arxiv_id: arxivId,
      status: "pending",
      max_attempts: DEFAULT_MAX_ATTEMPTS,
    })
    .select("id, status")
    .single<{ id: string; status: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function claimNextPaperProcessingJob(supabase: SupabaseServerClient) {
  const staleLockCutoff = new Date(Date.now() - 15 * 60_000).toISOString();

  await supabase
    .from("paper_processing_jobs")
    .update({
      status: "pending",
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("locked_at", staleLockCutoff);

  const { data: jobs, error: loadError } = await supabase
    .from("paper_processing_jobs")
    .select("id, paper_id, arxiv_id, attempts, max_attempts")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<PaperProcessingJob[]>();

  if (loadError) {
    throw new Error(loadError.message);
  }

  const job = jobs?.[0];

  if (!job) {
    return null;
  }

  const { data: claimedJob, error: claimError } = await supabase
    .from("paper_processing_jobs")
    .update({
      status: "processing",
      attempts: job.attempts + 1,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id, paper_id, arxiv_id, attempts, max_attempts")
    .maybeSingle<PaperProcessingJob>();

  if (claimError) {
    throw new Error(claimError.message);
  }

  return claimedJob;
}

async function markJobCompleted(
  supabase: SupabaseServerClient,
  jobId: string,
) {
  const { error } = await supabase
    .from("paper_processing_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function markJobFailed(
  supabase: SupabaseServerClient,
  job: PaperProcessingJob,
  errorMessage: string,
) {
  const shouldRetry = job.attempts < job.max_attempts;
  const retryDelayMs =
    RETRY_DELAYS_MS[job.attempts - 1] ??
    RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const runAfter = new Date(Date.now() + retryDelayMs);

  const { error } = await supabase
    .from("paper_processing_jobs")
    .update({
      status: shouldRetry ? "pending" : "failed",
      run_after: shouldRetry ? runAfter.toISOString() : new Date().toISOString(),
      locked_at: null,
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function processPaperProcessingJobs(
  supabase: SupabaseServerClient,
  limit = 1,
) {
  const results: Array<{
    jobId: string;
    paperId: string;
    arxivId: string;
    status: string;
    error?: string;
  }> = [];

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextPaperProcessingJob(supabase);

    if (!job) {
      break;
    }

    const result = await processPaper(supabase, job.paper_id, job.arxiv_id);

    if (result.status === "completed") {
      await markJobCompleted(supabase, job.id);
    } else {
      await markJobFailed(
        supabase,
        job,
        result.error ?? "Unknown processing error.",
      );
    }

    results.push({
      jobId: job.id,
      paperId: job.paper_id,
      arxivId: job.arxiv_id,
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  return results;
}
