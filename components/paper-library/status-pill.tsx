import type { Paper } from "./types";
import { formatLabel, formatModelName, getJobSummaryLabel, getStatusClasses } from "./paper-ui";

export function StatusPill({ status }: { status?: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusClasses(
        status,
      )}`}
    >
      {formatLabel(status)}
    </span>
  );
}

export function PaperStatusSummary({ paper }: { paper: Paper }) {
  return (
    <div className="flex min-w-36 flex-col items-start gap-1.5">
      <StatusPill status={paper.processing_status} />
      <span className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {paper.processing_status === "completed"
          ? formatModelName(paper.processing_model)
          : getJobSummaryLabel(paper)}
      </span>
    </div>
  );
}
