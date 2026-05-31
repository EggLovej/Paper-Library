import {
  formatDate,
  getPaperTitle,
} from "./paper-ui";
import { RatingPicker } from "./rating-picker";
import { PaperStatusSummary } from "./status-pill";
import type { Paper } from "./types";

type PaperTableProps = {
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
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Paper</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Rating</th>
              <th className="px-4 py-3 font-semibold">Added</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {papers.map((paper) => {
              const isSelected = selectedPaperId === paper.id;
              const displayTitle = getPaperTitle(paper);
              const isBusy = busyPaperIds.has(paper.id);

              return (
                <tr
                  key={paper.id}
                  className={`cursor-pointer align-top transition ${
                    isSelected
                      ? "bg-teal-50/70 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/40 dark:ring-teal-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                  onClick={() => onSelectPaper(paper.id)}
                >
                  <td className="px-4 py-4">
                    <div className="flex max-w-xl flex-col gap-1">
                      <span className="font-medium leading-6 text-zinc-950 dark:text-zinc-50">
                        {displayTitle}
                      </span>
                      <span className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {paper.authors?.length
                          ? paper.authors.slice(0, 4).join(", ")
                          : "Authors pending"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <PaperStatusSummary paper={paper} />
                  </td>
                  <td className="px-4 py-4">
                    <RatingPicker
                      value={paper.rating}
                      disabled={isBusy}
                      label={`Rating for ${displayTitle}`}
                      onChange={(rating) => onRatingChange(paper.id, rating)}
                    />
                  </td>
                  <td className="px-4 py-4 text-zinc-700 dark:text-zinc-300">
                    {formatDate(paper.created_at)}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200"
                      onClick={(event) => event.stopPropagation()}
                    >
                      arXiv
                    </a>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectPaper(paper.id);
                        }}
                        className="min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(paper.id, displayTitle);
                        }}
                        className="min-h-9 rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                      {paper.processing_status === "failed" ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRetry(paper.id);
                          }}
                          className="min-h-9 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                        >
                          Retry
                        </button>
                      ) : null}
                      {paper.processing_status === "completed" ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            onReprocess(paper.id);
                          }}
                          className="min-h-9 rounded-md border border-sky-200 bg-sky-50 px-3 text-sm font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-sky-300 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
                        >
                          Reprocess
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}

            {papers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {totalPaperCount === 0
                    ? "No papers yet."
                    : "No papers match this view."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
