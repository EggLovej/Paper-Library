import { normalizeArxivUrl, type NormalizedArxivPaper } from "@/lib/arxiv";
import { logSystemAuditEvent } from "@/lib/auth/audit";
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
  auditSource?: string;
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
  const auditSource = options.auditSource ?? "app";

  if (!resolvedPaper) {
    await logSystemAuditEvent(supabase, {
      action: "paper_submission_rejected",
      resourceType: "paper",
      metadata: {
        source: auditSource,
        reason: "invalid_url",
      },
    });

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

      await logSystemAuditEvent(supabase, {
        action: "paper_already_exists",
        resourceType: "paper",
        resourceId: existingPaper.id,
        metadata: {
          source: auditSource,
          arxivId: existingPaper.arxiv_id,
          processingStatus: existingPaper.processing_status,
          jobId: job.id,
          queuedExisting: true,
        },
      });

      return {
        status: "already_exists" as const,
        paperId: existingPaper.id,
        arxivId: existingPaper.arxiv_id,
        processingStatus: existingPaper.processing_status,
        jobId: job.id,
        url: resolvedPaper.pdfUrl,
      };
    }

    await logSystemAuditEvent(supabase, {
      action: "paper_already_exists",
      resourceType: "paper",
      resourceId: existingPaper?.id,
      metadata: {
        source: auditSource,
        arxivId: resolvedPaper.arxivId,
        processingStatus: existingPaper?.processing_status ?? null,
        queuedExisting: false,
      },
    });

    return {
      status: "already_exists" as const,
      paperId: existingPaper?.id,
      arxivId: resolvedPaper.arxivId,
      processingStatus: existingPaper?.processing_status,
      url: resolvedPaper.pdfUrl,
    };
  }

  const job = await enqueuePaperProcessingJob(supabase, data.id, data.arxiv_id);

  await logSystemAuditEvent(supabase, {
    action: "paper_accepted_for_processing",
    resourceType: "paper",
    resourceId: data.id,
    metadata: {
      source: auditSource,
      arxivId: data.arxiv_id,
      jobId: job.id,
      sourceType: resolvedPaper.source ?? "arxiv",
      sourcePaperId: resolvedPaper.sourcePaperId ?? null,
      sourceMessageId: options.sourceMessageId ?? null,
    },
  });

  return {
    status: "accepted" as const,
    paperId: data.id,
    arxivId: data.arxiv_id,
    processingStatus: data.processing_status,
    jobId: job.id,
    url: resolvedPaper.pdfUrl,
  };
}
