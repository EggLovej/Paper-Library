import type { ComplexityMode, Paper, PaperProcessingJob } from "./types";
export { formatModelName } from "@/lib/model-names";

export const RATING_OPTIONS = [
  { value: "", label: "No verdict" },
  { value: "interested", label: "Save" },
  { value: "maybe", label: "Maybe pile" },
  { value: "not_interested", label: "Toss" },
  { value: "read_later", label: "Reading stack" },
];

export const COMPLEXITY_OPTIONS: Array<{
  value: ComplexityMode;
  label: string;
}> = [
  { value: "normal", label: "Technical" },
  { value: "easy", label: "Plain English" },
  { value: "caveman", label: "Caveman" },
];

export const AUTO_PROCESS_DELAY_MS = 2500;

export function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatLabel(value?: string | null) {
  if (!value) {
    return "No verdict";
  }

  const labels: Record<string, string> = {
    completed: "Summarized",
    processing: "Reading",
    pending: "Queued",
    failed: "Needs retry",
    interested: "Save",
    maybe: "Maybe pile",
    not_interested: "Toss",
    read_later: "Reading stack",
  };

  if (labels[value]) {
    return labels[value];
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPaperTitle(paper: Paper) {
  return paper.title || `arXiv ${paper.arxiv_id}`;
}

export function isInboxPaper(paper: Paper) {
  return (
    paper.processing_status === "failed" ||
    (paper.processing_status === "completed" && !paper.rating)
  );
}

export function isActivePaper(paper: Paper) {
  return (
    paper.processing_status === "pending" ||
    paper.processing_status === "processing"
  );
}

export function getStatusClasses(value?: string | null) {
  switch (value) {
    case "completed":
      return "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-900";
    case "processing":
      return "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900";
    case "pending":
      return "bg-stone-100 text-stone-700 ring-stone-300 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700";
    case "failed":
      return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900";
    default:
      return "bg-[var(--desk-surface-2)] text-[var(--desk-muted)] ring-[var(--desk-border)]";
  }
}

export function getRatingClasses(value?: string | null) {
  switch (value) {
    case "interested":
      return "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-900";
    case "maybe":
      return "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900";
    case "read_later":
      return "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900";
    case "not_interested":
      return "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700";
    default:
      return "bg-[var(--desk-surface)] text-[var(--desk-muted)] ring-[var(--desk-border)]";
  }
}

export function getRatingSelectClasses(value?: string | null) {
  switch (value) {
    case "interested":
      return "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200";
    case "maybe":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "read_later":
      return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200";
    case "not_interested":
      return "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
    default:
      return "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  }
}

export function getJobAttemptsLabel(job?: PaperProcessingJob | null) {
  if (!job) {
    return "No job";
  }

  return `Tries ${job.attempts}`;
}

export function getJobSummaryLabel(paper: Paper) {
  const job = paper.latest_job;

  if (paper.processing_status === "pending") {
    return "";
  }

  if (!job) {
    return "No job";
  }

  return `${formatLabel(job.status)} · ${getJobAttemptsLabel(job)}`;
}

export function getDetailRetryLabel(paper: Paper) {
  const job = paper.latest_job;

  if (!job) {
    return "No job";
  }

  if (paper.processing_status === "pending") {
    return job.attempts > 0
      ? `Try ${job.attempts + 1} scheduled`
      : "First run scheduled";
  }

  return getJobAttemptsLabel(job);
}

export function getComplexityValue({
  normal,
  easy,
  caveman,
  mode,
}: {
  normal?: string | null;
  easy?: string | null;
  caveman?: string | null;
  mode: ComplexityMode;
}) {
  if (mode === "easy") {
    return easy || normal;
  }

  if (mode === "caveman") {
    return caveman || normal;
  }

  return normal;
}
