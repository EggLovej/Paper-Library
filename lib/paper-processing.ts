import { GoogleGenAI } from "@google/genai";

import { logSystemAuditEvent } from "./auth/audit";
import { sendPaperReportEmail } from "./email/paper-report";
import { formatModelName } from "./model-names";
import type { SupabaseServerClient } from "./supabase/server";

type PaperSummary = {
  title: string | null;
  authors: string[];
  abstract: string | null;
  overview: string;
  overview_easy: string;
  overview_caveman: string;
  main_contributions: string;
  main_contributions_easy: string;
  main_contributions_caveman: string;
  prior_work_delta: string;
  prior_work_delta_easy: string;
  prior_work_delta_caveman: string;
  project_ideas: string[];
};

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    null
  );
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

function parseJsonResponse(text?: string) {
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const cleanedText = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleanedText) as PaperSummary;
}

async function summarizePaper(arxivId: string) {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error(
      "Gemini is not configured. Add GEMINI_API_KEY to .env.local.",
    );
  }

  const pdfResponse = await fetch(`https://arxiv.org/pdf/${arxivId}`);

  if (!pdfResponse.ok) {
    throw new Error(`Could not fetch arXiv PDF (${pdfResponse.status}).`);
  }

  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModel();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          data: pdfBuffer.toString("base64"),
          mimeType: "application/pdf",
        },
      },
      {
        text:
          "Read this research paper and return only JSON with these fields: " +
          "title, authors, abstract, overview, overview_easy, overview_caveman, " +
          "main_contributions, main_contributions_easy, main_contributions_caveman, " +
          "prior_work_delta, prior_work_delta_easy, prior_work_delta_caveman, project_ideas. " +
          "Keep normal fields concise but specific. Easy fields should use simpler language for a smart non-specialist. " +
          "Caveman fields should be extremely plain and blunt, using short sentences and no jargon. " +
          "Return 1-2 project ideas as an array. If a string field is unavailable, use an empty string.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          authors: {
            type: "array",
            items: { type: "string" },
          },
          abstract: { type: "string" },
          overview: { type: "string" },
          overview_easy: { type: "string" },
          overview_caveman: { type: "string" },
          main_contributions: { type: "string" },
          main_contributions_easy: { type: "string" },
          main_contributions_caveman: { type: "string" },
          prior_work_delta: { type: "string" },
          prior_work_delta_easy: { type: "string" },
          prior_work_delta_caveman: { type: "string" },
          project_ideas: {
            type: "array",
            items: { type: "string" },
            maxItems: 2,
          },
        },
        required: [
          "title",
          "authors",
          "abstract",
          "overview",
          "overview_easy",
          "overview_caveman",
          "main_contributions",
          "main_contributions_easy",
          "main_contributions_caveman",
          "prior_work_delta",
          "prior_work_delta_easy",
          "prior_work_delta_caveman",
          "project_ideas",
        ],
      },
    },
  });

  return {
    model,
    summary: parseJsonResponse(response.text),
  };
}

export async function processPaper(
  supabase: SupabaseServerClient,
  paperId: string,
  arxivId: string,
) {
  await supabase
    .from("papers")
    .update({
      processing_status: "processing",
      processing_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paperId);

  try {
    const { model, summary } = await summarizePaper(arxivId);

    const { error } = await supabase
      .from("papers")
      .update({
        title: summary.title,
        authors: summary.authors,
        abstract: summary.abstract || null,
        summary_overview: summary.overview,
        summary_overview_easy: summary.overview_easy,
        summary_overview_caveman: summary.overview_caveman,
        summary_contributions: summary.main_contributions,
        summary_contributions_easy: summary.main_contributions_easy,
        summary_contributions_caveman: summary.main_contributions_caveman,
        summary_prior_work_delta: summary.prior_work_delta,
        summary_prior_work_delta_easy: summary.prior_work_delta_easy,
        summary_prior_work_delta_caveman: summary.prior_work_delta_caveman,
        summary_project_ideas: summary.project_ideas,
        processing_status: "completed",
        processing_error: null,
        processing_model: model,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paperId);

    if (error) {
      throw new Error(error.message);
    }

    try {
      const emailResult = await sendPaperReportEmail({
        paperId,
        arxivId,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        title: summary.title,
        authors: summary.authors,
        abstract: summary.abstract,
        overview: summary.overview,
        contributions: summary.main_contributions,
        priorWorkDelta: summary.prior_work_delta,
        projectIdeas: summary.project_ideas,
        model: formatModelName(model),
      });

      if (emailResult.status === "sent") {
        await supabase
          .from("papers")
          .update({
            report_email_sent_at: new Date().toISOString(),
            report_email_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paperId);

        await logSystemAuditEvent(supabase, {
          action: "paper_report_email_sent",
          resourceType: "paper",
          resourceId: paperId,
          metadata: {
            source: "queue_runner",
            arxivId,
            model,
            emailId: emailResult.id ?? null,
          },
        });
      } else {
        await logSystemAuditEvent(supabase, {
          action: "paper_report_email_skipped",
          resourceType: "paper",
          resourceId: paperId,
          metadata: {
            source: "queue_runner",
            arxivId,
            model,
            reason: "email_not_configured",
          },
        });
      }
    } catch (emailError) {
      const emailErrorMessage =
        emailError instanceof Error
          ? emailError.message
          : "Unknown email error.";

      await supabase
        .from("papers")
        .update({
          report_email_error: emailErrorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paperId);

      await logSystemAuditEvent(supabase, {
        action: "paper_report_email_failed",
        resourceType: "paper",
        resourceId: paperId,
        metadata: {
          source: "queue_runner",
          arxivId,
          model,
          error: emailErrorMessage,
        },
      });
    }

    return { status: "completed", summary };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error.";

    await supabase
      .from("papers")
      .update({
        processing_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paperId);

    return { status: "failed", error: message };
  }
}
