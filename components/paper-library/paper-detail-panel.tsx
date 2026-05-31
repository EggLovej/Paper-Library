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
      className="fixed inset-0 z-40 flex justify-end bg-zinc-950/20 backdrop-blur-sm dark:bg-black/50"
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
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={paper.processing_status} />
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getRatingClasses(
                      paper.rating,
                    )}`}
                  >
                    {formatLabel(paper.rating)}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700">
                    {paper.arxiv_id}
                  </span>
                </div>
                <h2 className="text-2xl font-semibold leading-8 tracking-tight text-zinc-950 dark:text-zinc-50">
                  {title}
                </h2>
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {paper.authors?.length
                    ? paper.authors.join(", ")
                    : "Authors pending"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
              {isAdmin ? (
                <div className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <span>Rating</span>
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
                  className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  Open PDF
                </a>
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onDelete}
                    className="min-h-10 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                ) : null}
                {isAdmin && paper.processing_status === "failed" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onRetry}
                    className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                  >
                    Retry
                  </button>
                ) : null}
                {isAdmin && paper.processing_status === "completed" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onReprocess}
                    className="min-h-10 rounded-md border border-sky-200 bg-sky-50 px-4 text-sm font-medium text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-sky-300 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
                  >
                    Reprocess
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Explanation Level
              </h3>
              <div className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                {COMPLEXITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setComplexityMode(option.value)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium transition ${
                      complexityMode === option.value
                        ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-white/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <DetailSection
              label="Overview"
              value={getComplexityValue({
                normal: paper.summary_overview,
                easy: paper.summary_overview_easy,
                caveman: paper.summary_overview_caveman,
                mode: complexityMode,
              })}
            />
            <DetailSection
              label="Main Contributions"
              value={getComplexityValue({
                normal: paper.summary_contributions,
                easy: paper.summary_contributions_easy,
                caveman: paper.summary_contributions_caveman,
                mode: complexityMode,
              })}
            />
            <DetailSection
              label="Difference From Prior Work"
              value={getComplexityValue({
                normal: paper.summary_prior_work_delta,
                easy: paper.summary_prior_work_delta_easy,
                caveman: paper.summary_prior_work_delta_caveman,
                mode: complexityMode,
              })}
            />
            <DetailList
              label="Project Ideas"
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
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
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
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          tone === "error"
            ? "text-red-700 dark:text-red-300"
            : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {label}
      </h3>
      <p
        className={`mt-2 text-sm leading-7 ${
          tone === "error"
            ? "text-red-700 dark:text-red-300"
            : "text-zinc-700 dark:text-zinc-300"
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
    <section className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </h3>
      {values?.length ? (
        <ol className="mt-3 grid gap-3">
          {values.map((value, index) => (
            <li
              key={value}
              className="grid grid-cols-[2rem_1fr] gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-200 dark:bg-zinc-950 dark:text-teal-300 dark:ring-teal-900">
                {index + 1}
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          Pending
        </p>
      )}
    </section>
  );
}
