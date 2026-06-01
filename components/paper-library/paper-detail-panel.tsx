"use client";

import { useMemo, useState } from "react";

import {
  COMPLEXITY_OPTIONS,
  formatDate,
  formatLabel,
  formatModelName,
  getComplexityValue,
  getDetailRetryLabel,
  getPaperTitle,
  getRatingClasses,
} from "./paper-ui";
import { RatingPicker } from "./rating-picker";
import { StatusPill } from "./status-pill";
import type { ComplexityMode, Paper, SavedProjectIdea } from "./types";

type DossierTab = "digest" | "contributions" | "prior" | "ideas" | "abstract" | "details";

type PaperDetailPanelProps = {
  isAdmin: boolean;
  paper: Paper;
  isBusy: boolean;
  onClose: () => void;
  onRatingChange: (rating: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  onReprocess: () => void;
  onSaveProjectIdea: (ideaText: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  savedProjectIdeas: SavedProjectIdea[];
  busyProjectIdeaTexts: Set<string>;
  hasPrevious: boolean;
  hasNext: boolean;
};

const DOSSIER_TABS: Array<{ value: DossierTab; label: string }> = [
  { value: "digest", label: "Digest" },
  { value: "contributions", label: "Contributions" },
  { value: "prior", label: "Prior Work" },
  { value: "ideas", label: "Ideas" },
  { value: "abstract", label: "Abstract" },
  { value: "details", label: "Details" },
];

export function PaperDetailPanel({
  isAdmin,
  paper,
  isBusy,
  onClose,
  onRatingChange,
  onDelete,
  onRetry,
  onReprocess,
  onSaveProjectIdea,
  onPrevious,
  onNext,
  savedProjectIdeas,
  busyProjectIdeaTexts,
  hasPrevious,
  hasNext,
}: PaperDetailPanelProps) {
  const title = getPaperTitle(paper);
  const source =
    paper.source === "scholar_inbox" ? "Scholar Inbox" : "Manual entry";
  const [activeTab, setActiveTab] = useState<DossierTab>("digest");
  const [complexityMode, setComplexityMode] =
    useState<ComplexityMode>("normal");

  const tabContent = useMemo(() => {
    return {
      digest: getComplexityValue({
        normal: paper.summary_overview,
        easy: paper.summary_overview_easy,
        caveman: paper.summary_overview_caveman,
        mode: complexityMode,
      }),
      contributions: getComplexityValue({
        normal: paper.summary_contributions,
        easy: paper.summary_contributions_easy,
        caveman: paper.summary_contributions_caveman,
        mode: complexityMode,
      }),
      prior: getComplexityValue({
        normal: paper.summary_prior_work_delta,
        easy: paper.summary_prior_work_delta_easy,
        caveman: paper.summary_prior_work_delta_caveman,
        mode: complexityMode,
      }),
    };
  }, [complexityMode, paper]);

  return (
    <div
      className="fixed inset-0 z-40 bg-zinc-950/30 p-4 backdrop-blur-sm dark:bg-black/70"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-xl border border-[var(--desk-border)] bg-[var(--desk-surface)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-[var(--desk-border)] bg-[var(--desk-surface)]/95 px-5 py-4 backdrop-blur">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusPill status={paper.processing_status} />
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getRatingClasses(
                    paper.rating,
                  )}`}
                >
                  {formatLabel(paper.rating)}
                </span>
                <span className="rounded-full bg-[var(--desk-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--desk-muted)] ring-1 ring-inset ring-[var(--desk-border)]">
                  {paper.arxiv_id}
                </span>
                {paper.processing_status === "completed" ? (
                  <span className="rounded-full bg-[var(--desk-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--desk-muted)] ring-1 ring-inset ring-[var(--desk-border)]">
                    {formatModelName(paper.processing_model)}
                  </span>
                ) : null}
              </div>
              <h2 className="line-clamp-2 font-serif text-2xl font-semibold leading-8 text-[var(--desk-ink)] lg:text-3xl">
                {title}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--desk-muted)]">
                {paper.authors?.length
                  ? paper.authors.join(", ")
                  : "Authors pending"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {isAdmin ? (
                <RatingPicker
                  value={paper.rating}
                  disabled={isBusy}
                  label={`Verdict for ${title}`}
                  onChange={onRatingChange}
                />
              ) : null}
              <a
                href={paper.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-md bg-[var(--desk-accent)] px-4 text-sm font-medium text-white transition hover:brightness-110"
              >
                Open PDF
              </a>
              {isAdmin && paper.processing_status === "failed" ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onRetry}
                  className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  Try again
                </button>
              ) : null}
              {isAdmin && paper.processing_status === "completed" ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onReprocess}
                  className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-4 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Re-read
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onDelete}
                  className="min-h-10 rounded-md border border-red-200 bg-transparent px-4 text-sm font-medium text-[var(--desk-danger)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                >
                  Toss
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <nav
              aria-label="Dossier sections"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {DOSSIER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={`min-h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition ${
                    activeTab === tab.value
                      ? "border-[var(--desk-accent)] bg-[var(--desk-surface-2)] text-[var(--desk-accent)]"
                      : "border-[var(--desk-border)] bg-[var(--desk-surface)] text-[var(--desk-ink)] hover:bg-[var(--desk-surface-2)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
                Explanation lens
              </span>
              <div className="inline-flex w-fit rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface-2)] p-1">
                {COMPLEXITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setComplexityMode(option.value)}
                    className={`min-h-8 rounded-md px-3 text-sm font-medium transition ${
                      complexityMode === option.value
                        ? "bg-[var(--desk-surface)] text-[var(--desk-ink)] shadow-sm"
                        : "text-[var(--desk-muted)] hover:bg-[var(--desk-surface)]/70"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto max-w-4xl">
            {activeTab === "digest" ? (
              <ReadingSection title="Digest" value={tabContent.digest} />
            ) : null}
            {activeTab === "contributions" ? (
              <ReadingSection
                title="Contributions"
                value={tabContent.contributions}
              />
            ) : null}
            {activeTab === "prior" ? (
              <ReadingSection title="Prior Work" value={tabContent.prior} />
            ) : null}
            {activeTab === "ideas" ? (
              <ProjectIdeas
                isAdmin={isAdmin}
                values={paper.summary_project_ideas}
                savedProjectIdeas={savedProjectIdeas}
                busyProjectIdeaTexts={busyProjectIdeaTexts}
                onSaveProjectIdea={onSaveProjectIdea}
              />
            ) : null}
            {activeTab === "abstract" ? (
              <ReadingSection title="Abstract" value={paper.abstract} />
            ) : null}
            {activeTab === "details" ? (
              <DossierDetails paper={paper} source={source} />
            ) : null}
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--desk-border)] bg-[var(--desk-surface)]/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <button
              type="button"
              disabled={!hasPrevious}
              onClick={onPrevious}
              className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <p className="hidden text-sm text-[var(--desk-muted)] sm:block">
              Move through the current paper stack
            </p>
            <button
              type="button"
              disabled={!hasNext}
              onClick={onNext}
              className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ReadingSection({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  return (
    <article className="rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-6">
      <h3 className="font-serif text-3xl font-semibold text-[var(--desk-ink)]">
        {title}
      </h3>
      <p className="mt-5 whitespace-pre-wrap text-base leading-8 text-[var(--desk-ink)]">
        {value || "Pending"}
      </p>
    </article>
  );
}

function ProjectIdeas({
  isAdmin,
  values,
  savedProjectIdeas,
  busyProjectIdeaTexts,
  onSaveProjectIdea,
}: {
  isAdmin: boolean;
  values?: string[] | null;
  savedProjectIdeas: SavedProjectIdea[];
  busyProjectIdeaTexts: Set<string>;
  onSaveProjectIdea: (ideaText: string) => void;
}) {
  const savedIdeaTexts = new Set(
    savedProjectIdeas.map((project) => project.idea_text),
  );

  return (
    <section>
      <h3 className="font-serif text-3xl font-semibold text-[var(--desk-ink)]">
        Ideas
      </h3>
      {values?.length ? (
        <ol className="mt-5 grid gap-4">
          {values.map((value, index) => (
            <li
              key={value}
              className="grid gap-4 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-5 text-base leading-8 text-[var(--desk-ink)] sm:grid-cols-[2.5rem_1fr_auto]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--desk-surface-2)] text-sm font-semibold text-[var(--desk-accent)] ring-1 ring-inset ring-[var(--desk-border)]">
                {index + 1}
              </span>
              <span>{value}</span>
              {isAdmin ? (
                <button
                  type="button"
                  disabled={
                    savedIdeaTexts.has(value) || busyProjectIdeaTexts.has(value)
                  }
                  onClick={() => onSaveProjectIdea(value)}
                  className="min-h-10 self-start rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savedIdeaTexts.has(value)
                    ? "Saved"
                    : busyProjectIdeaTexts.has(value)
                      ? "Saving"
                      : "Save project"}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-6 text-base leading-8 text-[var(--desk-ink)]">
          Pending
        </p>
      )}
    </section>
  );
}

function DossierDetails({ paper, source }: { paper: Paper; source: string }) {
  const details = [
    { label: "Added", value: formatDate(paper.created_at) },
    { label: "Source", value: source },
    { label: "Source ID", value: paper.source_paper_id ?? paper.arxiv_id },
    { label: "Job Status", value: formatLabel(paper.latest_job?.status) },
    { label: "Tries", value: getDetailRetryLabel(paper) },
    {
      label: "Model",
      value:
        paper.processing_status === "completed"
          ? formatModelName(paper.processing_model)
          : "Pending completion",
    },
  ];

  return (
    <section>
      <h3 className="font-serif text-3xl font-semibold text-[var(--desk-ink)]">
        Details
      </h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {details.map((detail) => (
          <InfoTile
            key={detail.label}
            label={detail.label}
            value={detail.value}
          />
        ))}
      </div>
      {paper.processing_error || paper.latest_job?.last_error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <h4 className="text-xs font-semibold uppercase tracking-wide">
            Processing Error
          </h4>
          <p className="mt-2">
            {paper.processing_error ?? paper.latest_job?.last_error}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--desk-muted)]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-[var(--desk-ink)]">
        {value}
      </div>
    </div>
  );
}
