import { normalizeArxivUrl, type NormalizedArxivPaper } from "@/lib/arxiv";
import { enqueuePaperProcessingJob } from "@/lib/jobs/paper-processing-jobs";
import { resolveScholarInboxPaperUrl } from "@/lib/scholar-inbox";
import type { SupabaseServerClient } from "@/lib/supabase/server";

type PaperInsertResult = {
  id: string;
  arxiv_id: string;
  processing_status: string;
};

type ResolvedSubmittedPaper = NormalizedArxivPaper & {
  source?: "scholar_inbox";
  sourcePaperId?: string;
};

type SubmitPaperOptions = {
  sourceMessageId?: string | null;
};

export async function resolveSubmittedPaperUrl(
  submittedUrl: string,
): Promise<ResolvedSubmittedPaper | null> {
  const arxivPaper = normalizeArxivUrl(submittedUrl);

  if (arxivPaper) {
    return arxivPaper;
  }

  const scholarInboxPaper = await resolveScholarInboxPaperUrl(submittedUrl);

  if (scholarInboxPaper) {
    return scholarInboxPaper;
  }

  return null;
}

export async function submitPaperUrl(
  supabase: SupabaseServerClient,
  submittedUrl: string,
  options: SubmitPaperOptions = {},
) {
  const resolvedPaper = await resolveSubmittedPaperUrl(submittedUrl);

  if (!resolvedPaper) {
    return {
      status: "invalid_url" as const,
      error: "Please enter a valid arXiv URL or Scholar Inbox paper URL.",
    };
  }

  const { data, error } = await supabase
    .from("papers")
    .insert({
      arxiv_id: resolvedPaper.arxivId,
      url: resolvedPaper.pdfUrl,
      processing_status: "pending",
      processing_model: null,
      source: resolvedPaper.source ?? null,
      source_paper_id: resolvedPaper.sourcePaperId ?? null,
      source_message_id: options.sourceMessageId ?? null,
    })
    .select("id, arxiv_id, processing_status")
    .single<PaperInsertResult>();

  if (error) {
    if (error.code !== "23505") {
      throw new Error(error.message);
    }

    const { data: existingPaper } = await supabase
      .from("papers")
      .select("id, arxiv_id, processing_status")
      .eq("arxiv_id", resolvedPaper.arxivId)
      .single<PaperInsertResult>();

    const shouldRetryExistingPaper =
      existingPaper?.processing_status === "pending" ||
      existingPaper?.processing_status === "failed";

    if (existingPaper && shouldRetryExistingPaper) {
      const job = await enqueuePaperProcessingJob(
        supabase,
        existingPaper.id,
        existingPaper.arxiv_id,
      );

      return {
        status: "already_exists" as const,
        paperId: existingPaper.id,
        arxivId: existingPaper.arxiv_id,
        processingStatus: existingPaper.processing_status,
        jobId: job.id,
        url: resolvedPaper.pdfUrl,
      };
    }

    return {
      status: "already_exists" as const,
      paperId: existingPaper?.id,
      arxivId: resolvedPaper.arxivId,
      processingStatus: existingPaper?.processing_status,
      url: resolvedPaper.pdfUrl,
    };
  }

  const job = await enqueuePaperProcessingJob(supabase, data.id, data.arxiv_id);

  return {
    status: "accepted" as const,
    paperId: data.id,
    arxivId: data.arxiv_id,
    processingStatus: data.processing_status,
    jobId: job.id,
    url: resolvedPaper.pdfUrl,
  };
}
