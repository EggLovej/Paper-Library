"use client";

import { useState } from "react";

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
import type { ComplexityMode, Paper } from "./types";

type PaperDetailPanelProps = {
  isAdmin: boolean;
  paper: Paper;
  isBusy: boolean;
  onClose: () => void;
  onRatingChange: (rating: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  onReprocess: () => void;
};

export function PaperDetailPanel({
  isAdmin,
  paper,
  isBusy,
  onClose,
  onRatingChange,
  onDelete,
  onRetry,
  onReprocess,
}: PaperDetailPanelProps) {
  const title = getPaperTitle(paper);
  const source =
    paper.source === "scholar_inbox" ? "Scholar Inbox" : "Manual entry";
  const latestJob = paper.latest_job;
  const [complexityMode, setComplexityMode] =
    useState<ComplexityMode>("normal");

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-zinc-950/25 backdrop-blur-sm dark:bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-[var(--desk-surface)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-[var(--desk-border)] bg-[var(--desk-surface)]/95 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-accent)]">
                  Paper dossier
                </p>
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
                <h2 className="font-serif text-3xl font-semibold leading-9 tracking-tight text-[var(--desk-ink)]">
                  {title}
                </h2>
                <p className="text-sm leading-6 text-[var(--desk-muted)]">
                  {paper.authors?.length
                    ? paper.authors.join(", ")
                    : "Authors pending"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <InfoTile label="Added" value={formatDate(paper.created_at)} />
              <InfoTile label="Source" value={source} />
              <InfoTile
                label="Source ID"
                value={paper.source_paper_id ?? paper.arxiv_id}
              />
              <InfoTile
                label="Job Status"
                value={formatLabel(latestJob?.status)}
              />
              <InfoTile
                label="Retry Count"
                value={getDetailRetryLabel(paper)}
              />
              <InfoTile
                label="Model"
                value={
                  paper.processing_status === "completed"
                    ? formatModelName(paper.processing_model)
                    : "Pending completion"
                }
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--desk-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              {isAdmin ? (
                <div className="flex flex-col gap-1 text-sm font-medium text-[var(--desk-ink)]">
                  <span>Verdict</span>
                  <RatingPicker
                    value={paper.rating}
                    disabled={isBusy}
                    label={`Rating for ${title}`}
                    onChange={onRatingChange}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center rounded-md bg-[var(--desk-accent)] px-4 text-sm font-medium text-white transition hover:brightness-110"
                >
                  Open PDF
                </a>
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
                {isAdmin && paper.processing_status === "failed" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onRetry}
                    className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
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
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-3 border-t border-[var(--desk-border)] pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
                Explanation lens
              </h3>
              <p className="text-sm text-[var(--desk-muted)]">
                Choose how aggressively the digest should simplify the paper.
              </p>
              <div className="inline-flex w-fit rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface-2)] p-1">
                {COMPLEXITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setComplexityMode(option.value)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
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
            <DetailSection
              label="Digest"
              value={getComplexityValue({
                normal: paper.summary_overview,
                easy: paper.summary_overview_easy,
                caveman: paper.summary_overview_caveman,
                mode: complexityMode,
              })}
            />
            <DetailSection
              label="Why it matters"
              value={getComplexityValue({
                normal: paper.summary_contributions,
                easy: paper.summary_contributions_easy,
                caveman: paper.summary_contributions_caveman,
                mode: complexityMode,
              })}
            />
            <DetailSection
              label="What changed"
              value={getComplexityValue({
                normal: paper.summary_prior_work_delta,
                easy: paper.summary_prior_work_delta_easy,
                caveman: paper.summary_prior_work_delta_caveman,
                mode: complexityMode,
              })}
            />
            <DetailList
              label="Field notes"
              values={paper.summary_project_ideas}
            />
            <DetailSection label="Abstract" value={paper.abstract} />
            {paper.processing_error || paper.latest_job?.last_error ? (
              <DetailSection
                label="Processing Error"
                value={paper.processing_error ?? paper.latest_job?.last_error}
                tone="error"
              />
            ) : null}
          </div>
        </div>
      </aside>
    </div>
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

function DetailSection({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value?: string | null;
  tone?: "default" | "error";
}) {
  return (
    <section
      className={`border-t pt-5 ${
        tone === "error"
          ? "border-red-200 dark:border-red-900"
          : "border-[var(--desk-border)]"
      }`}
    >
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === "error"
            ? "text-red-700 dark:text-red-300"
            : "text-[var(--desk-muted)]"
        }`}
      >
        {label}
      </h3>
      <p
        className={`mt-2 text-sm leading-7 ${
          tone === "error"
            ? "text-red-700 dark:text-red-300"
            : "text-[var(--desk-ink)]"
        }`}
      >
        {value || "Pending"}
      </p>
    </section>
  );
}

function DetailList({
  label,
  values,
}: {
  label: string;
  values?: string[] | null;
}) {
  return (
    <section className="border-t border-[var(--desk-border)] pt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
        {label}
      </h3>
      {values?.length ? (
        <ol className="mt-3 grid gap-3">
          {values.map((value, index) => (
            <li
              key={value}
              className="grid grid-cols-[2rem_1fr] gap-3 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] p-3 text-sm leading-6 text-[var(--desk-ink)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--desk-surface)] text-xs font-semibold text-[var(--desk-accent)] ring-1 ring-inset ring-[var(--desk-border)]">
                {index + 1}
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm leading-7 text-[var(--desk-ink)]">
          Pending
        </p>
      )}
    </section>
  );
}
