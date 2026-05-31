import {
  formatDate,
  formatLabel,
  formatModelName,
  getPaperTitle,
  getRatingClasses,
} from "./paper-ui";
import { RatingPicker } from "./rating-picker";
import { PaperStatusSummary } from "./status-pill";
import type { Paper } from "./types";

type PaperTableProps = {
  isAdmin: boolean;
  papers: Paper[];
  totalPaperCount: number;
  selectedPaperId: string | null;
  busyPaperIds: Set<string>;
  onSelectPaper: (paperId: string) => void;
  onRatingChange: (paperId: string, rating: string) => void;
  onDelete: (paperId: string, title: string) => void;
  onRetry: (paperId: string) => void;
  onReprocess: (paperId: string) => void;
};

export function PaperTable({
  isAdmin,
  papers,
  totalPaperCount,
  selectedPaperId,
  busyPaperIds,
  onSelectPaper,
  onRatingChange,
  onDelete,
  onRetry,
  onReprocess,
}: PaperTableProps) {
  return (
    <div className="grid gap-3">
      <div className="hidden grid-cols-[minmax(0,1fr)_11rem_12rem_8rem_13rem] gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)] lg:grid">
        <span>Paper</span>
        <span>Status</span>
        <span>Verdict</span>
        <span>Added</span>
        <span>Actions</span>
      </div>

      {papers.map((paper) => {
        const isSelected = selectedPaperId === paper.id;
        const displayTitle = getPaperTitle(paper);
        const isBusy = busyPaperIds.has(paper.id);

        return (
          <article
            key={paper.id}
            role="button"
            tabIndex={0}
            className={`grid cursor-pointer gap-4 rounded-lg border bg-[var(--desk-surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--desk-warm)] hover:shadow-md lg:grid-cols-[minmax(0,1fr)_11rem_12rem_8rem_13rem] lg:items-center ${
              isSelected
                ? "border-[var(--desk-accent)] ring-2 ring-[var(--desk-accent)]/20"
                : "border-[var(--desk-border)]"
            }`}
            onClick={() => onSelectPaper(paper.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectPaper(paper.id);
              }
            }}
          >
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 lg:hidden">
                <PaperStatusSummary paper={paper} />
              </div>
              <h3 className="font-serif text-lg font-semibold leading-6 text-[var(--desk-ink)]">
                {displayTitle}
              </h3>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--desk-muted)]">
                {paper.authors?.length
                  ? paper.authors.slice(0, 4).join(", ")
                  : "Authors pending"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--desk-muted)]">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--desk-accent)] hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  arXiv
                </a>
                {paper.processing_status === "completed" ? (
                  <span>{formatModelName(paper.processing_model)}</span>
                ) : null}
              </div>
            </div>

            <div className="hidden lg:block">
              <PaperStatusSummary paper={paper} />
            </div>

            <div>
              {isAdmin ? (
                <RatingPicker
                  value={paper.rating}
                  disabled={isBusy}
                  label={`Verdict for ${displayTitle}`}
                  onChange={(rating) => onRatingChange(paper.id, rating)}
                />
              ) : (
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getRatingClasses(
                    paper.rating,
                  )}`}
                >
                  {formatLabel(paper.rating)}
                </span>
              )}
            </div>

            <div className="text-sm text-[var(--desk-muted)]">
              {formatDate(paper.created_at)}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectPaper(paper.id);
                }}
                className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:border-[var(--desk-accent)]"
              >
                Open
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(paper.id, displayTitle);
                  }}
                  className="min-h-9 rounded-md border border-red-200 bg-transparent px-3 text-sm font-medium text-[var(--desk-danger)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                >
                  Toss
                </button>
              ) : null}
              {isAdmin && paper.processing_status === "failed" ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetry(paper.id);
                  }}
                  className="min-h-9 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  Try again
                </button>
              ) : null}
              {isAdmin && paper.processing_status === "completed" ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onReprocess(paper.id);
                  }}
                  className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Re-read
                </button>
              ) : null}
            </div>
          </article>
        );
      })}

      {papers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center text-sm text-[var(--desk-muted)]">
          {totalPaperCount === 0
            ? "No papers in the sieve yet."
            : "No papers match this view."}
        </div>
      ) : null}
    </div>
  );
}
