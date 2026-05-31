import {
  PAPER_RATING_LABELS,
  PAPER_RATINGS,
  type PaperRating,
} from "@/lib/paper-ratings";
import { signRatingAction } from "@/lib/rating-action-tokens";

type PaperReportEmail = {
  paperId: string;
  arxivId: string;
  pdfUrl: string;
  title: string | null;
  authors: string[];
  abstract: string | null;
  overview: string;
  contributions: string;
  priorWorkDelta: string;
  projectIdeas: string[];
  model: string;
};

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAppBaseUrl() {
  const configuredUrl =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function getReportEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  const to = process.env.REPORT_EMAIL_TO;

  if (!apiKey || !from || !to) {
    return null;
  }

  return {
    apiKey,
    from,
    to: to
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean),
  };
}

function getRatingUrl(paperId: string, rating: PaperRating) {
  const params = new URLSearchParams({
    rating,
    token: signRatingAction(paperId, rating),
  });

  return `${getAppBaseUrl()}/api/papers/${paperId}/rate?${params.toString()}`;
}

function buttonHtml(label: string, href: string, variant: "primary" | "soft") {
  const background = variant === "primary" ? "#0f766e" : "#f4f4f5";
  const color = variant === "primary" ? "#ffffff" : "#18181b";
  const border = variant === "primary" ? "#0f766e" : "#d4d4d8";

  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:6px;border:1px solid ${border};background:${background};color:${color};font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`;
}

function sectionHtml(label: string, value: string | null | undefined) {
  return `
    <h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${escapeHtml(label)}</h2>
    <p style="margin:0;font-size:15px;line-height:1.65;color:#3f3f46;">${escapeHtml(value || "Pending")}</p>
  `;
}

function getSubject(report: PaperReportEmail) {
  return `Paper summary: ${report.title ?? `arXiv ${report.arxivId}`}`;
}

function getHtml(report: PaperReportEmail) {
  const title = report.title ?? `arXiv ${report.arxivId}`;
  const buttons = PAPER_RATINGS.map((rating, index) =>
    buttonHtml(
      PAPER_RATING_LABELS[rating],
      getRatingUrl(report.paperId, rating),
      index === 0 ? "primary" : "soft",
    ),
  ).join("");
  const projectIdeas = report.projectIdeas.length
    ? `<ol style="margin:8px 0 0;padding-left:20px;color:#3f3f46;font-size:15px;line-height:1.65;">${report.projectIdeas
        .map((idea) => `<li>${escapeHtml(idea)}</li>`)
        .join("")}</ol>`
    : `<p style="margin:0;font-size:15px;line-height:1.65;color:#3f3f46;">Pending</p>`;

  return `
    <div style="background:#f4f4f5;padding:24px;">
      <main style="max-width:720px;margin:0 auto;border:1px solid #e4e4e7;border-radius:8px;background:#ffffff;padding:28px;font-family:Arial,sans-serif;color:#18181b;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Paper Library</p>
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#18181b;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#52525b;">${escapeHtml(report.authors.length ? report.authors.join(", ") : "Authors pending")}</p>
        <p style="margin:0 0 20px;font-size:13px;color:#71717a;">arXiv ${escapeHtml(report.arxivId)} · ${escapeHtml(report.model)}</p>

        <div style="margin:20px 0 24px;">
          ${buttonHtml("Open PDF", report.pdfUrl, "soft")}
        </div>

        <div style="margin:0 0 24px;padding:16px;border-radius:8px;background:#f0fdfa;border:1px solid #ccfbf1;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#115e59;">Rate this paper</p>
          ${buttons}
        </div>

        ${sectionHtml("Overview", report.overview)}
        ${sectionHtml("Main Contributions", report.contributions)}
        ${sectionHtml("Difference From Prior Work", report.priorWorkDelta)}

        <h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Project Ideas</h2>
        ${projectIdeas}

        ${sectionHtml("Abstract", report.abstract)}
      </main>
    </div>
  `;
}

function getText(report: PaperReportEmail) {
  const title = report.title ?? `arXiv ${report.arxivId}`;
  const ratingLinks = PAPER_RATINGS.map(
    (rating) =>
      `${PAPER_RATING_LABELS[rating]}: ${getRatingUrl(report.paperId, rating)}`,
  ).join("\n");

  return [
    title,
    report.authors.length ? report.authors.join(", ") : "Authors pending",
    `arXiv ${report.arxivId}`,
    `Model: ${report.model}`,
    `PDF: ${report.pdfUrl}`,
    "",
    "Rate this paper:",
    ratingLinks,
    "",
    "Overview",
    report.overview,
    "",
    "Main Contributions",
    report.contributions,
    "",
    "Difference From Prior Work",
    report.priorWorkDelta,
    "",
    "Project Ideas",
    ...(report.projectIdeas.length
      ? report.projectIdeas.map((idea) => `- ${idea}`)
      : ["Pending"]),
    "",
    "Abstract",
    report.abstract ?? "Pending",
  ].join("\n");
}

export async function sendPaperReportEmail(report: PaperReportEmail) {
  const config = getReportEmailConfig();

  if (!config) {
    return { status: "skipped" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: config.to,
      subject: getSubject(report),
      html: getHtml(report),
      text: getText(report),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as ResendResponse;

  if (!response.ok) {
    throw new Error(
      result.message ??
        result.name ??
        `Resend email request failed with ${response.status}.`,
    );
  }

  return { status: "sent" as const, id: result.id };
}
