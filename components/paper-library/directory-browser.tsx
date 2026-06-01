import type { DirectoryItem, DirectoryLayout, DirectorySort } from "./types";

export function DirectoryControls({
  layout,
  sort,
  onLayoutChange,
  onSortChange,
}: {
  layout: DirectoryLayout;
  sort: DirectorySort;
  onLayoutChange: (layout: DirectoryLayout) => void;
  onSortChange: (sort: DirectorySort) => void;
}) {
  return (
    <>
      <div className="inline-flex rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] p-1">
        {(["grid", "list"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onLayoutChange(value)}
            className={`min-h-8 rounded px-3 text-sm font-medium capitalize transition ${
              layout === value
                ? "bg-[var(--desk-surface-2)] text-[var(--desk-accent)] shadow-sm"
                : "text-[var(--desk-muted)] hover:bg-[var(--desk-surface-2)]"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--desk-muted)]">
        Sort
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as DirectorySort)}
          className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm text-[var(--desk-ink)] outline-none transition focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
        >
          <option value="score">Rank score</option>
          <option value="count">Paper count</option>
          <option value="name">Name</option>
        </select>
      </label>
    </>
  );
}

export function DirectoryBrowser({
  items,
  layout,
  noun,
  emptyLabel,
  onSelect,
}: {
  items: DirectoryItem[];
  layout: DirectoryLayout;
  noun: string;
  emptyLabel: string;
  onSelect: (value: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center text-sm text-[var(--desk-muted)]">
        {emptyLabel}
      </div>
    );
  }

  if (layout === "list") {
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_8rem] gap-3 border-b border-[var(--desk-border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)] sm:grid">
          <span>Name</span>
          <span>Papers</span>
          <span>Score</span>
          <span>Action</span>
        </div>
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelect(item.name)}
            className="grid w-full gap-3 border-b border-[var(--desk-border)] px-4 py-4 text-left transition last:border-b-0 hover:bg-[var(--desk-surface-2)] sm:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem] sm:items-center"
          >
            <span className="font-serif text-lg font-semibold leading-6 text-[var(--desk-ink)]">
              {item.name}
            </span>
            <span className="text-sm text-[var(--desk-muted)]">
              {item.count} {noun}
              {item.count === 1 ? "" : "s"}
            </span>
            <DirectoryScore item={item} compact />
            <span className="text-sm font-medium text-[var(--desk-accent)]">
              View papers
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => onSelect(item.name)}
          className="group flex min-h-32 flex-col items-start justify-between rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--desk-warm)] hover:shadow-md"
        >
          <span className="line-clamp-2 font-serif text-xl font-semibold leading-7 text-[var(--desk-ink)]">
            {item.name}
          </span>
          <span className="mt-4 flex w-full flex-col gap-3 text-sm">
            <DirectoryScore item={item} />
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--desk-muted)]">
                {item.count} {noun}
                {item.count === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-[var(--desk-accent)] group-hover:underline">
                View papers
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DirectoryScore({
  item,
  compact,
}: {
  item: DirectoryItem;
  compact?: boolean;
}) {
  const tone = getDirectoryScoreTone(item.score);

  if (compact) {
    return (
      <span className="flex w-full max-w-24 flex-col gap-1">
        <span className={`text-sm font-semibold ${tone.text}`}>
          {formatDirectoryScore(item.score)}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-[var(--desk-surface-2)] ring-1 ring-inset ring-[var(--desk-border)]">
          <span
            className={`block h-full rounded-full ${tone.bar}`}
            style={{ width: getScoreBarWidth(item.score) }}
          />
        </span>
      </span>
    );
  }

  return (
    <span className="flex w-full flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
          Rank
        </span>
        <span className={`font-serif text-2xl font-semibold ${tone.text}`}>
          {formatDirectoryScore(item.score)}
        </span>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-[var(--desk-surface-2)] ring-1 ring-inset ring-[var(--desk-border)]">
        <span
          className={`block h-full rounded-full ${tone.bar}`}
          style={{ width: getScoreBarWidth(item.score) }}
        />
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--desk-muted)]">
        <span>Avg {formatDirectoryScore(item.averageScore)}</span>
        <span>Signal {formatDirectoryScore(item.signalScore)}</span>
      </span>
    </span>
  );
}

function getDirectoryScoreTone(score: number) {
  if (score >= 4) {
    return {
      bar: "bg-teal-500",
      text: "text-teal-700 dark:text-teal-300",
    };
  }

  if (score >= 2) {
    return {
      bar: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
    };
  }

  if (score < 0) {
    return {
      bar: "bg-red-500",
      text: "text-red-700 dark:text-red-300",
    };
  }

  return {
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  };
}

function getScoreBarWidth(score: number) {
  const normalized = Math.min(Math.max((score + 2) / 8, 0.08), 1);

  return `${Math.round(normalized * 100)}%`;
}

function formatDirectoryScore(score: number) {
  return score.toLocaleString("en", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(score) ? 0 : 1,
  });
}
