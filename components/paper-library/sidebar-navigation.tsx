import Image from "next/image";

import type { PaperCounts, ViewMode } from "./types";

export function SidebarNavigation({
  viewMode,
  onViewModeChange,
  paperCounts,
}: {
  viewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  paperCounts: PaperCounts;
}) {
  const mainItems: Array<{
    value: ViewMode;
    label: string;
    count: number;
  }> = [
    { value: "inbox", label: "Inbox", count: paperCounts.inbox },
    { value: "all", label: "All Papers", count: paperCounts.all },
    {
      value: "reading_stack",
      label: "Reading Stack",
      count: paperCounts.readingStack,
    },
    { value: "toss_pile", label: "Toss Pile", count: paperCounts.tossPile },
    { value: "projects", label: "Projects", count: paperCounts.projects },
    { value: "authors", label: "Authors", count: paperCounts.authors },
    { value: "models", label: "Models", count: paperCounts.models },
    { value: "activity", label: "Activity", count: paperCounts.activity },
  ];

  return (
    <aside className="rounded-xl border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex flex-col items-center border-b border-[var(--desk-border)] pb-5 text-center">
        <Image
          src="/logo.webp"
          alt="ArXiv Sieve"
          width={332}
          height={240}
          priority
          className="h-auto w-40 rounded-md object-contain"
        />
        <h1 className="mt-2 font-serif text-3xl font-semibold text-[var(--desk-ink)]">
          ArXiv Sieve
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--desk-muted)]">
          Sort papers before they rot in your inbox.
        </p>
      </div>

      <nav aria-label="Paper views" className="mt-5 grid gap-1">
        {mainItems.map((item) => (
          <SidebarButton
            key={item.value}
            label={item.label}
            count={item.count}
            isActive={viewMode === item.value}
            onClick={() => onViewModeChange(item.value)}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarButton({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium transition ${
        isActive
          ? "bg-[var(--desk-surface-2)] text-[var(--desk-accent)] ring-1 ring-inset ring-[var(--desk-accent)]/25"
          : "text-[var(--desk-ink)] hover:bg-[var(--desk-surface-2)]"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 rounded-full bg-[var(--desk-bg)] px-2 py-0.5 text-xs text-[var(--desk-muted)] ring-1 ring-inset ring-[var(--desk-border)]">
        {count}
      </span>
    </button>
  );
}
