import { invalidJsonResponse, missingSupabaseResponse } from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { requireAdminRequest } from "@/lib/auth/admin";
import { sendPaperReportEmail } from "@/lib/email/paper-report";
import { formatModelName } from "@/lib/model-names";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReportPaperRow = {
  id: string;
  arxiv_id: string;
  title: string | null;
  authors: string[] | null;
  abstract: string | null;
  summary_overview: string | null;
  summary_contributions: string | null;
  summary_prior_work_delta: string | null;
  summary_project_ideas: string[] | null;
  processing_status: string | null;
  processing_model: string | null;
};

const REPORT_PAPER_COLUMNS = [
  "id",
  "arxiv_id",
  "title",
  "authors",
  "abstract",
  "summary_overview",
  "summary_contributions",
  "summary_prior_work_delta",
  "summary_project_ideas",
  "processing_status",
  "processing_model",
].join(", ");

function getMissingReportField(paper: ReportPaperRow) {
  if (paper.processing_status !== "completed") {
    return "paper is not completed";
  }

  if (!paper.summary_overview) {
    return "overview";
  }

  if (!paper.summary_contributions) {
    return "main contributions";
  }

  if (!paper.summary_prior_work_delta) {
    return "prior-work delta";
  }

  if (!paper.processing_model) {
    return "model";
  }

  return null;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/papers/[id]/report-email/resend">,
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

  try {
    await request.json();
  } catch {
    // Empty POST bodies are fine; reject only malformed non-empty JSON.
    const contentLength = request.headers.get("content-length");

    if (contentLength && contentLength !== "0") {
      return invalidJsonResponse();
    }
  }

  const { data: paper, error: loadError } = await supabase
    .from("papers")
    .select(REPORT_PAPER_COLUMNS)
    .eq("id", id)
    .maybeSingle<ReportPaperRow>();

  if (loadError) {
    return Response.json(
      { error: "The paper could not be loaded.", details: loadError.message },
      { status: 500 },
    );
  }

  if (!paper) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  const missingField = getMissingReportField(paper);

  if (missingField) {
    return Response.json(
      { error: `The report email cannot be sent yet: missing ${missingField}.` },
      { status: 400 },
    );
  }

  try {
    const emailResult = await sendPaperReportEmail({
      paperId: paper.id,
      arxivId: paper.arxiv_id,
      pdfUrl: `https://arxiv.org/pdf/${paper.arxiv_id}`,
      title: paper.title,
      authors: paper.authors ?? [],
      abstract: paper.abstract,
      overview: paper.summary_overview!,
      contributions: paper.summary_contributions!,
      priorWorkDelta: paper.summary_prior_work_delta!,
      projectIdeas: paper.summary_project_ideas ?? [],
      model: formatModelName(paper.processing_model!),
    });

    if (emailResult.status !== "sent") {
      await logAdminAuditEvent(supabase, request, {
        action: "paper_report_email_skipped",
        resourceType: "paper",
        resourceId: paper.id,
        metadata: {
          source: "app",
          arxivId: paper.arxiv_id,
          model: paper.processing_model,
          reason: "email_not_configured",
        },
      });

      return Response.json(
        { error: "Report email is not configured." },
        { status: 400 },
      );
    }

    const sentAt = new Date().toISOString();
    const { data: updatedPaper, error: updateError } = await supabase
      .from("papers")
      .update({
        report_email_sent_at: sentAt,
        report_email_error: null,
        updated_at: sentAt,
      })
      .eq("id", paper.id)
      .select("id, report_email_sent_at, report_email_error, updated_at")
      .single();

    if (updateError) {
      return Response.json(
        {
          error: "The report email was sent, but the paper could not be updated.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    await logAdminAuditEvent(supabase, request, {
      action: "paper_report_email_resent",
      resourceType: "paper",
      resourceId: paper.id,
      metadata: {
        source: "app",
        arxivId: paper.arxiv_id,
        model: paper.processing_model,
        emailId: emailResult.id ?? null,
      },
    });

    return Response.json({ status: "sent", paper: updatedPaper });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown report email error.";

    await supabase
      .from("papers")
      .update({
        report_email_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paper.id);

    await logAdminAuditEvent(supabase, request, {
      action: "paper_report_email_failed",
      resourceType: "paper",
      resourceId: paper.id,
      metadata: {
        source: "app",
        arxivId: paper.arxiv_id,
        model: paper.processing_model,
        error: message,
      },
    });

    return Response.json(
      { error: "The report email could not be sent.", details: message },
      { status: 502 },
    );
  }
}
