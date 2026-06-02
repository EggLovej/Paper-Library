"use client";

import { useMemo, useState } from "react";

import { formatModelName } from "@/lib/model-names";
import { isPaperRating, PAPER_RATING_LABELS } from "@/lib/paper-ratings";

import { formatDateTime, formatLabel, getRatingClasses } from "./paper-ui";
import type {
  ActivityAuditEvent,
  ActivityData,
  ActivityEmailReport,
  ActivityIngestedMessage,
  ActivityJob,
  ActivityState,
  Paper,
} from "./types";

type ActivityCategory = "all" | "jobs" | "ingests" | "reports" | "audit";
type ActivityStatus =
  | "all"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "sent"
  | "waiting"
  | "error";

type ActivityEvent = {
  id: string;
  category: Exclude<ActivityCategory, "all">;
  title: string;
  subtitle: string;
  titleLinksToPaper?: boolean;
  subtitleLinksToPaper?: boolean;
  status: string;
  statusTone: "neutral" | "good" | "warn" | "bad" | "info";
  timestamp?: string | null;
  detail?: string | null;
  detailTone?: "neutral" | "bad" | "info";
  chips?: ActivityChip[];
  paperId?: string | null;
  searchableText: string;
};

type ActivityChip = {
  label: string;
  className?: string;
};

type ActivityInsightId = "open_issues" | "queue" | "failed_jobs";

type ActivityInsight = {
  id: ActivityInsightId;
  title: string;
  description: string;
  emptyMessage: string;
  items: ActivityInsightItem[];
};

type ActivityInsightItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusTone: ActivityEvent["statusTone"];
  detail?: string | null;
  chips?: ActivityChip[];
  paperId?: string | null;
  action?: {
    label: string;
    busyLabel: string;
    kind: "resend_report_email";
  };
};

const CATEGORY_OPTIONS: Array<{ value: ActivityCategory; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "jobs", label: "Jobs" },
  { value: "ingests", label: "Emails" },
  { value: "reports", label: "Reports" },
  { value: "audit", label: "Audit" },
];

const STATUS_OPTIONS: Array<{ value: ActivityStatus; label: string }> = [
  { value: "all", label: "Any status" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "sent", label: "Sent" },
  { value: "waiting", label: "Waiting" },
  { value: "error", label: "Error" },
];

export function ActivityView({
  isAdmin,
  activityState,
  papers,
  searchQuery,
  onRefresh,
  onOpenPaper,
  onResendReportEmail,
  busyPaperIds,
}: {
  isAdmin: boolean;
  activityState: ActivityState;
  papers: Paper[];
  searchQuery: string;
  onRefresh: () => void;
  onOpenPaper: (paperId: string) => void;
  onResendReportEmail: (paperId: string) => void;
  busyPaperIds: Set<string>;
}) {
  const [categoryFilter, setCategoryFilter] =
    useState<ActivityCategory>("all");
  const [statusFilter, setStatusFilter] = useState<ActivityStatus>("all");
  const [selectedInsight, setSelectedInsight] =
    useState<ActivityInsightId | null>(null);
  const activity = activityState.activity;

  const events = useMemo(() => {
    if (!activity) {
      return [];
    }

    return buildActivityEvents(activity, papers);
  }, [activity, papers]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleEvents = events.filter((event) => {
    if (categoryFilter !== "all" && event.category !== categoryFilter) {
      return false;
    }

    if (statusFilter !== "all" && !matchesStatusFilter(event, statusFilter)) {
      return false;
    }

    if (normalizedSearch && !event.searchableText.includes(normalizedSearch)) {
      return false;
    }

    return true;
  });
  const focusedInsight = selectedInsight && activity
    ? buildActivityInsight(selectedInsight, activity)
    : null;

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center">
        <p className="font-serif text-2xl font-semibold text-[var(--desk-ink)]">
          Curator mode required
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--desk-muted)]">
          Activity contains webhook diagnostics, job errors, and email delivery
          state. Unlock controls to inspect it.
        </p>
      </div>
    );
  }

  if (activityState.status === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {activityState.message}
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center text-sm text-[var(--desk-muted)]">
        Loading activity
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ActivitySummaryGrid
        activity={activity}
        selectedInsight={selectedInsight}
        onSelectInsight={(insight) =>
          setSelectedInsight((current) => (current === insight ? null : insight))
        }
      />

      {focusedInsight ? (
        <ActivityInsightPanel
          insight={focusedInsight}
          onClose={() => setSelectedInsight(null)}
          onOpenPaper={onOpenPaper}
          onResendReportEmail={onResendReportEmail}
          busyPaperIds={busyPaperIds}
        />
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategoryFilter(option.value)}
              className={`min-h-9 rounded-md border px-3 text-sm font-medium transition ${
                categoryFilter === option.value
                  ? "border-[var(--desk-accent)] bg-[var(--desk-surface-2)] text-[var(--desk-accent)]"
                  : "border-[var(--desk-border)] bg-[var(--desk-surface)] text-[var(--desk-ink)] hover:bg-[var(--desk-surface-2)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--desk-muted)]">
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ActivityStatus)
              }
              className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm text-[var(--desk-ink)] outline-none transition focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onRefresh}
            disabled={activityState.status === "loading"}
            className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {activityState.status === "loading" ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {visibleEvents.map((event) => (
          <ActivityEventCard
            key={event.id}
            event={event}
            onOpenPaper={onOpenPaper}
          />
        ))}
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center text-sm text-[var(--desk-muted)]">
          No activity matches these filters.
        </div>
      ) : null}
    </div>
  );
}

function ActivitySummaryGrid({
  activity,
  selectedInsight,
  onSelectInsight,
}: {
  activity: ActivityData;
  selectedInsight: ActivityInsightId | null;
  onSelectInsight: (insight: ActivityInsightId) => void;
}) {
  const summary = activity.summary;
  const tiles = [
    {
      id: "open_issues",
      label: "Open issues",
      value: summary.openIssueCount,
      detail: "Failures, email gaps, waiting reports",
      tone: summary.openIssueCount > 0 ? "bad" : "good",
    },
    {
      id: "queue",
      label: "Queue",
      value: summary.pendingJobs + summary.processingJobs,
      detail: `${summary.pendingJobs} pending · ${summary.processingJobs} processing`,
      tone: summary.pendingJobs + summary.processingJobs > 0 ? "info" : "neutral",
    },
    {
      id: "failed_jobs",
      label: "Failed jobs",
      value: summary.failedJobs,
      detail: "Recent job failures",
      tone: summary.failedJobs > 0 ? "bad" : "neutral",
    },
    {
      id: null,
      label: "Last queue run",
      value: summary.lastQueueRunAt
        ? formatRelativeAge(summary.lastQueueRunAt)
        : "Never",
      detail: formatDateTime(summary.lastQueueRunAt),
      tone: summary.lastQueueRunAt ? "good" : "warn",
    },
  ] as const;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const isSelected = tile.id === selectedInsight;
        const content = (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
              {tile.label}
            </p>
            <p
              className={`mt-2 font-serif text-3xl font-semibold ${toneText(
                tile.tone,
              )}`}
            >
              {tile.value}
            </p>
            <p className="mt-1 text-sm text-[var(--desk-muted)]">
              {tile.detail}
            </p>
          </>
        );

        if (!tile.id) {
          return (
            <div
              key={tile.label}
              className="rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 shadow-sm"
            >
              {content}
            </div>
          );
        }

        return (
          <button
            key={tile.label}
            type="button"
            onClick={() => onSelectInsight(tile.id)}
            className={`cursor-pointer rounded-lg border bg-[var(--desk-surface)] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--desk-surface-2)] ${
              isSelected
                ? "border-[var(--desk-accent)] ring-2 ring-teal-100 dark:ring-teal-950"
                : "border-[var(--desk-border)]"
            }`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function ActivityInsightPanel({
  insight,
  onClose,
  onOpenPaper,
  onResendReportEmail,
  busyPaperIds,
}: {
  insight: ActivityInsight;
  onClose: () => void;
  onOpenPaper: (paperId: string) => void;
  onResendReportEmail: (paperId: string) => void;
  busyPaperIds: Set<string>;
}) {
  return (
    <section className="rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]">
            Focus
          </p>
          <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--desk-ink)]">
            {insight.title}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--desk-muted)]">
            {insight.description}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface)]"
        >
          Close
        </button>
      </div>

      {insight.items.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {insight.items.map((item) => (
            <article
              key={item.id}
              className="grid gap-3 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] p-3 lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(
                      item.statusTone,
                    )}`}
                  >
                    {item.status}
                  </span>
                  {item.chips?.map((chip) => (
                    <span
                      key={chip.label}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                        chip.className ?? neutralChipClasses()
                      }`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
                <h4 className="mt-2 font-serif text-base font-semibold text-[var(--desk-ink)]">
                  {item.paperId ? (
                    <button
                      type="button"
                      onClick={() => onOpenPaper(item.paperId!)}
                      className="cursor-pointer text-left transition hover:text-[var(--desk-accent)]"
                    >
                      {item.title}
                    </button>
                  ) : (
                    item.title
                  )}
                </h4>
                <p className="mt-1 text-sm leading-6 text-[var(--desk-muted)]">
                  {item.subtitle}
                </p>
                {item.detail ? (
                  <p
                    className={`mt-2 line-clamp-2 rounded-md px-3 py-2 text-sm leading-6 ${detailClasses(
                      item.statusTone === "bad" ? "bad" : "neutral",
                    )}`}
                  >
                    {item.detail}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end lg:self-start">
                {item.action && item.paperId ? (
                  <button
                    type="button"
                    onClick={() => onResendReportEmail(item.paperId!)}
                    disabled={busyPaperIds.has(item.paperId)}
                    className="min-h-9 rounded-md border border-[var(--desk-accent)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyPaperIds.has(item.paperId)
                      ? item.action.busyLabel
                      : item.action.label}
                  </button>
                ) : null}
                {item.paperId ? (
                  <button
                    type="button"
                    onClick={() => onOpenPaper(item.paperId!)}
                    className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface-2)]"
                  >
                    Open paper
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-4 py-8 text-center text-sm text-[var(--desk-muted)]">
          {insight.emptyMessage}
        </div>
      )}
    </section>
  );
}

function buildActivityInsight(
  id: ActivityInsightId,
  activity: ActivityData,
): ActivityInsight {
  if (id === "queue") {
    const queueItems = activity.jobs
      .filter((job) => job.status === "pending" || job.status === "processing")
      .sort(compareJobsByUrgency)
      .map((job) => jobToInsightItem(job));

    return {
      id,
      title: "Queue",
      description:
        "Papers waiting for the runner or currently locked by a processing attempt.",
      emptyMessage: "No papers are currently waiting in the processing queue.",
      items: queueItems,
    };
  }

  if (id === "failed_jobs") {
    const failedItems = activity.jobs
      .filter((job) => job.status === "failed")
      .sort(compareJobsByUpdatedAt)
      .map((job) => jobToInsightItem(job));

    return {
      id,
      title: "Failed Jobs",
      description:
        "Jobs that ended in a failed state. Open the paper, inspect the error, then retry if it should be summarized again.",
      emptyMessage: "No failed jobs in the recent activity window.",
      items: failedItems,
    };
  }

  const failedJobs = activity.jobs
    .filter((job) => job.status === "failed")
    .sort(compareJobsByUpdatedAt)
    .map((job) => jobToInsightItem(job));
  const failedIngests = activity.ingestedMessages
    .filter((message) => message.status === "failed" || Boolean(message.error))
    .map(ingestToInsightItem);
  const reportIssues = activity.emailReports
    .filter(
      (report) =>
        Boolean(report.report_email_error) ||
        (report.processing_status === "completed" &&
          !report.report_email_sent_at),
    )
    .map(reportToInsightItem);

  return {
    id,
    title: "Open Issues",
    description:
      "The current debugging shortlist: failed jobs, failed Scholar Inbox ingests, email delivery errors, and completed papers whose report email has not been sent yet.",
    emptyMessage: "No open issues in the recent activity window.",
    items: [...failedJobs, ...failedIngests, ...reportIssues],
  };
}

function jobToInsightItem(job: ActivityJob): ActivityInsightItem {
  const title = job.paper?.title ?? `arXiv ${job.arxiv_id}`;
  const chips: ActivityChip[] = [
    { label: `Try ${job.attempts}`, className: neutralChipClasses() },
    { label: `arXiv ${job.arxiv_id}`, className: neutralChipClasses() },
  ];

  if (job.run_after) {
    chips.push({
      label: `Next run ${formatDateTime(job.run_after)}`,
      className: neutralChipClasses(),
    });
  }

  return {
    id: `job-insight-${job.id}`,
    title,
    subtitle: getJobInsightSubtitle(job),
    status: formatLabel(job.status),
    statusTone: getStatusTone(job.status),
    detail: job.last_error,
    chips,
    paperId: job.paper_id,
  };
}

function ingestToInsightItem(
  message: ActivityIngestedMessage,
): ActivityInsightItem {
  const paperCount = message.paper_urls?.length ?? 0;

  return {
    id: `ingest-insight-${message.id}`,
    title: message.subject ?? "Scholar Inbox email",
    subtitle: message.gmail_message_id
      ? `Message ${formatShortId(message.gmail_message_id)}`
      : "Scholar Inbox webhook",
    status: formatLabel(message.status),
    statusTone: getStatusTone(message.status),
    detail: message.error,
    chips: [
      {
        label: `${paperCount} paper link${paperCount === 1 ? "" : "s"}`,
        className: neutralChipClasses(),
      },
    ],
  };
}

function reportToInsightItem(
  report: ActivityEmailReport,
): ActivityInsightItem {
  const status = getReportStatus(report);
  const chips: ActivityChip[] = [
    { label: `arXiv ${report.arxiv_id}`, className: neutralChipClasses() },
  ];

  if (report.processing_model) {
    chips.push({
      label: formatModelName(report.processing_model),
      className: sourceChipClasses(),
    });
  }

  return {
    id: `report-insight-${report.id}`,
    title: report.title ?? `arXiv ${report.arxiv_id}`,
    subtitle: report.report_email_error
      ? "Report email failed."
      : "Summary is complete, but the report email has not been sent yet.",
    status: status.label,
    statusTone: status.tone,
    detail: report.report_email_error,
    chips,
    paperId: report.id,
    action:
      report.report_email_error || !report.report_email_sent_at
        ? {
            label: report.report_email_error ? "Resend email" : "Send email",
            busyLabel: "Sending",
            kind: "resend_report_email",
          }
        : undefined,
  };
}

function getJobInsightSubtitle(job: ActivityJob) {
  if (job.status === "processing") {
    return job.locked_at
      ? `Processing since ${formatDateTime(job.locked_at)}.`
      : "Processing lock is active.";
  }

  if (job.status === "pending") {
    return job.run_after
      ? `Ready after ${formatDateTime(job.run_after)}.`
      : "Waiting for the next queue run.";
  }

  if (job.status === "failed") {
    return "No active retry is scheduled for this job.";
  }

  return `Last updated ${formatDateTime(job.updated_at ?? job.created_at)}.`;
}

function compareJobsByUrgency(left: ActivityJob, right: ActivityJob) {
  if (left.status !== right.status) {
    return left.status === "processing" ? -1 : 1;
  }

  return (
    new Date(left.run_after ?? left.created_at ?? 0).getTime() -
    new Date(right.run_after ?? right.created_at ?? 0).getTime()
  );
}

function compareJobsByUpdatedAt(left: ActivityJob, right: ActivityJob) {
  return (
    new Date(right.updated_at ?? right.created_at ?? 0).getTime() -
    new Date(left.updated_at ?? left.created_at ?? 0).getTime()
  );
}

function ActivityEventCard({
  event,
  onOpenPaper,
}: {
  event: ActivityEvent;
  onOpenPaper: (paperId: string) => void;
}) {
  return (
    <article className="grid gap-3 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-4 shadow-sm lg:grid-cols-[8rem_minmax(0,1fr)_10rem]">
      <div className="flex flex-wrap items-center gap-2 lg:block">
        <span className="rounded-full bg-[var(--desk-surface-2)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)] ring-1 ring-inset ring-[var(--desk-border)]">
          {event.category}
        </span>
        <span
          className={`ml-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset lg:mt-2 lg:inline-flex ${statusClasses(
            event.statusTone,
          )}`}
        >
          {event.status}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="font-serif text-lg font-semibold leading-6 text-[var(--desk-ink)]">
          {event.titleLinksToPaper && event.paperId ? (
            <button
              type="button"
              onClick={() => onOpenPaper(event.paperId!)}
              className="cursor-pointer text-left transition hover:text-[var(--desk-accent)]"
            >
              {event.title}
            </button>
          ) : (
            event.title
          )}
        </h3>
        {event.subtitle ? (
          <p className="mt-1 text-sm leading-6 text-[var(--desk-muted)]">
            {event.subtitleLinksToPaper && event.paperId ? (
              <button
                type="button"
                onClick={() => onOpenPaper(event.paperId!)}
                className="cursor-pointer text-left transition hover:text-[var(--desk-accent)]"
              >
                {event.subtitle}
              </button>
            ) : (
              event.subtitle
            )}
          </p>
        ) : null}
        {event.chips?.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {event.chips.map((chip) => (
              <span
                key={chip.label}
                className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                  chip.className ?? neutralChipClasses()
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
        {event.detail ? (
          <p
            className={`mt-3 line-clamp-2 rounded-md px-3 py-2 text-sm leading-6 ${detailClasses(
              event.detailTone,
            )}`}
          >
            {event.detail}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 lg:min-h-full lg:flex-col lg:justify-between">
        {event.paperId ? (
          <button
            type="button"
            onClick={() => onOpenPaper(event.paperId!)}
            className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface)] lg:self-end"
          >
            Open paper
          </button>
        ) : null}
        <span className="text-sm text-[var(--desk-muted)] lg:self-end lg:text-right">
          {formatDateTime(event.timestamp)}
        </span>
      </div>
    </article>
  );
}

function buildActivityEvents(activity: ActivityData, papers: Paper[]) {
  const paperById = new Map(
    papers.map((paper) => [normalizeId(paper.id), paper]),
  );

  return [
    ...activity.jobs.map(jobToEvent),
    ...activity.ingestedMessages.map(ingestToEvent),
    ...activity.emailReports.map(reportToEvent),
    ...activity.auditEvents.map((event) => auditToEvent(event, paperById)),
  ].sort(
    (left, right) =>
      new Date(right.timestamp ?? 0).getTime() -
      new Date(left.timestamp ?? 0).getTime(),
  );
}

function jobToEvent(job: ActivityJob): ActivityEvent {
  const title = job.paper?.title ?? `arXiv ${job.arxiv_id}`;
  const modelName = job.paper?.processing_model
    ? formatModelName(job.paper.processing_model)
    : null;
  const chips: ActivityChip[] = [
    { label: `Try ${job.attempts}`, className: neutralChipClasses() },
  ];

  if (job.run_after) {
    chips.push({
      label: `Next run ${formatDateTime(job.run_after)}`,
      className: neutralChipClasses(),
    });
  }

  if (modelName) {
    chips.push({ label: modelName, className: sourceChipClasses() });
  }

  return {
    id: `job-${job.id}`,
    category: "jobs",
    title,
    subtitle: "",
    status: formatLabel(job.status),
    statusTone: getStatusTone(job.status),
    timestamp: job.updated_at ?? job.created_at,
    detail: job.last_error,
    detailTone: job.last_error ? "bad" : undefined,
    chips,
    paperId: job.paper_id,
    titleLinksToPaper: true,
    searchableText: normalizeSearchText([
      title,
      job.arxiv_id,
      job.status,
      job.last_error,
    ]),
  };
}

function ingestToEvent(message: ActivityIngestedMessage): ActivityEvent {
  const paperCount = message.paper_urls?.length ?? 0;

  return {
    id: `ingest-${message.id}`,
    category: "ingests",
    title: message.subject ?? "Scholar Inbox email",
    subtitle: message.gmail_message_id
      ? `Message ${formatShortId(message.gmail_message_id)}`
      : "Scholar Inbox webhook",
    status: formatLabel(message.status),
    statusTone: getStatusTone(message.status),
    timestamp: message.received_at ?? message.created_at,
    detail: message.error,
    detailTone: message.error ? "bad" : undefined,
    chips: [
      {
        label: `${paperCount} paper link${paperCount === 1 ? "" : "s"}`,
        className: neutralChipClasses(),
      },
    ],
    searchableText: normalizeSearchText([
      message.subject,
      message.gmail_message_id,
      message.status,
      message.error,
      ...(message.paper_urls ?? []),
    ]),
  };
}

function reportToEvent(report: ActivityEmailReport): ActivityEvent {
  const status = getReportStatus(report);
  const chips: ActivityChip[] = [];

  if (report.processing_model) {
    chips.push({
      label: formatModelName(report.processing_model),
      className: sourceChipClasses(),
    });
  }

  return {
    id: `report-${report.id}`,
    category: "reports",
    title: report.title ?? `arXiv ${report.arxiv_id}`,
    subtitle: "Email report delivery",
    status: status.label,
    statusTone: status.tone,
    timestamp:
      report.report_email_sent_at ?? report.updated_at ?? report.created_at,
    detail: report.report_email_error,
    detailTone: report.report_email_error ? "bad" : undefined,
    chips,
    paperId: report.id,
    titleLinksToPaper: true,
    searchableText: normalizeSearchText([
      report.title,
      report.arxiv_id,
      report.processing_status,
      report.processing_model,
      report.report_email_error,
      status.label,
    ]),
  };
}

function auditToEvent(
  event: ActivityAuditEvent,
  paperById: Map<string, Paper>,
): ActivityEvent {
  const resolvedEvent = resolveAuditPaperFields(event, paperById);
  const title = getAuditTitle(resolvedEvent);
  const subtitle = getAuditSubtitle(resolvedEvent);
  const detail = getAuditDetail(resolvedEvent);
  const chips = getAuditChips(resolvedEvent);
  const paperId =
    resolvedEvent.related_paper_id ??
    getMetadataString(resolvedEvent.metadata, "paperId");

  return {
    id: `audit-${resolvedEvent.id}`,
    category: "audit",
    title,
    subtitle,
    status: "Recorded",
    statusTone: "neutral",
    timestamp: resolvedEvent.created_at,
    detail,
    detailTone: getAuditDetailTone(resolvedEvent),
    chips,
    paperId,
    subtitleLinksToPaper: Boolean(paperId && subtitle),
    searchableText: normalizeSearchText([
      resolvedEvent.action,
      resolvedEvent.resource_type,
      resolvedEvent.resource_id,
      resolvedEvent.resource_label,
      resolvedEvent.resource_arxiv_id,
      resolvedEvent.project_idea_text,
      resolvedEvent.related_paper_id,
      resolvedEvent.ip_address,
      resolvedEvent.user_agent,
      detail,
    ]),
  };
}

function resolveAuditPaperFields(
  event: ActivityAuditEvent,
  paperById: Map<string, Paper>,
) {
  if (event.resource_label && event.resource_arxiv_id) {
    return event;
  }

  const candidatePaperIds = [
    event.related_paper_id,
    event.resource_type === "paper" ? event.resource_id : null,
    getMetadataString(event.metadata, "paperId"),
  ].filter((value): value is string => Boolean(value));
  const paper = candidatePaperIds
    .map((id) => paperById.get(normalizeId(id)))
    .find((value): value is Paper => Boolean(value));

  if (!paper) {
    return event;
  }

  return {
    ...event,
    related_paper_id: event.related_paper_id ?? paper.id,
    resource_label: event.resource_label ?? paper.title ?? null,
    resource_arxiv_id: event.resource_arxiv_id ?? paper.arxiv_id,
  };
}

function getAuditTitle(event: ActivityAuditEvent) {
  if (event.action === "paper_rating_updated") {
    return "Paper verdict updated";
  }

  if (event.action === "project_idea_saved") {
    return "Project idea saved";
  }

  if (event.action === "project_idea_deleted") {
    return "Project idea removed";
  }

  return formatLabel(event.action);
}

function getAuditSubtitle(event: ActivityAuditEvent) {
  if (
    event.action === "admin_login_failed" ||
    event.action === "admin_login_succeeded" ||
    event.action === "admin_login_rate_limited"
  ) {
    return getRequestEnvironmentLabel(getAuditIp(event));
  }

  if (event.resource_type === "paper") {
    return getAuditPaperLabel(event);
  }

  if (event.resource_type === "saved_project_idea") {
    return getAuditProjectLabel(event);
  }

  return [
    event.resource_type ? formatLabel(event.resource_type) : null,
    event.resource_id,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getAuditDetail(event: ActivityAuditEvent) {
  if (
    event.action === "admin_login_failed" ||
    event.action === "admin_login_succeeded" ||
    event.action === "admin_login_rate_limited"
  ) {
    return null;
  }

  if (event.action === "paper_rating_updated") {
    return null;
  }

  if (
    event.action === "processing_queue_run" ||
    event.action === "paper_retry_queued" ||
    event.action === "paper_reprocess_queued"
  ) {
    return null;
  }

  if (
    event.action === "project_idea_saved" ||
    event.action === "project_idea_deleted"
  ) {
    return event.project_idea_text ?? null;
  }

  return formatAuditMetadata(event.metadata);
}

function getAuditPaperLabel(event: ActivityAuditEvent) {
  if (event.resource_label) {
    return event.resource_label;
  }

  if (event.resource_arxiv_id) {
    return `arXiv ${event.resource_arxiv_id}`;
  }

  return event.resource_id
    ? `Paper ${formatShortId(event.resource_id)}`
    : "Paper not resolved";
}

function getAuditProjectLabel(event: ActivityAuditEvent) {
  const paperLabel = getAuditPaperLabel({
    ...event,
    resource_id:
      event.related_paper_id ?? getMetadataString(event.metadata, "paperId"),
  });

  return `Source paper: ${paperLabel}`;
}

function getAuditChips(event: ActivityAuditEvent): ActivityChip[] {
  if (
    event.action === "admin_login_failed" ||
    event.action === "admin_login_succeeded" ||
    event.action === "admin_login_rate_limited"
  ) {
    const ip = getAuditIp(event);

    return ip
      ? [{ label: `IP ${ip}`, className: sourceChipClasses() }]
      : [];
  }

  if (event.action === "paper_rating_updated") {
    const rating = getMetadataString(event.metadata, "rating");
    const source = getMetadataString(event.metadata, "source");

    return [
      {
        label: rating ? formatRatingLabel(rating) : "Verdict cleared",
        className: ratingChipClasses(rating),
      },
      {
        label: source === "email_link" ? "Source: email link" : "Source: app",
        className: sourceChipClasses(),
      },
    ];
  }

  if (event.action === "processing_queue_run") {
    const mode = getMetadataString(event.metadata, "mode");
    const processed = getMetadataNumber(event.metadata, "processed");
    const chips: ActivityChip[] = [];

    if (mode) {
      chips.push({
        label: `Mode: ${formatLabel(mode)}`,
        className: sourceChipClasses(),
      });
    }

    if (typeof processed === "number") {
      chips.push({
        label: `Processed: ${processed}`,
        className: neutralChipClasses(),
      });
    }

    return chips;
  }

  if (
    event.action === "paper_retry_queued" ||
    event.action === "paper_reprocess_queued"
  ) {
    const jobId = getMetadataString(event.metadata, "jobId");

    return jobId
      ? [
          {
            label: `Job ${formatShortId(jobId)}`,
            className: sourceChipClasses(),
          },
        ]
      : [];
  }

  if (
    event.action === "project_idea_saved" ||
    event.action === "project_idea_deleted"
  ) {
    return [
      {
        label:
          event.action === "project_idea_saved" ? "Saved idea" : "Removed idea",
        className:
          event.action === "project_idea_saved"
            ? "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-900"
            : "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700",
      },
    ];
  }

  return [];
}

function getAuditDetailTone(
  event: ActivityAuditEvent,
): ActivityEvent["detailTone"] {
  if (
    event.action === "admin_login_failed" ||
    event.action === "admin_login_rate_limited"
  ) {
    return "bad";
  }

  return "neutral";
}

function getAuditIp(event: ActivityAuditEvent) {
  return event.ip_address ?? getMetadataString(event.metadata, "identifier");
}

function getRequestEnvironmentLabel(ip?: string | null) {
  if (!ip) {
    return "Unknown environment";
  }

  if (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "localhost" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.")
  ) {
    return "Local dev";
  }

  return "Production";
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : null;
}

function getMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "number" ? value : null;
}

function formatRatingLabel(value: string) {
  return isPaperRating(value) ? PAPER_RATING_LABELS[value] : formatLabel(value);
}

function formatAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  return Object.entries(metadata)
    .map(
      ([key, value]) =>
        `${formatMetadataKey(key)}: ${formatMetadataValue(value)}`,
    )
    .join(" · ");
}

function neutralChipClasses() {
  return "bg-[var(--desk-surface-2)] text-[var(--desk-muted)] ring-[var(--desk-border)]";
}

function sourceChipClasses() {
  return "bg-zinc-950 text-white ring-zinc-950 dark:bg-zinc-950 dark:text-white dark:ring-zinc-700";
}

function ratingChipClasses(value?: string | null) {
  return isPaperRating(value) ? getRatingClasses(value) : neutralChipClasses();
}

function detailClasses(tone: ActivityEvent["detailTone"]) {
  switch (tone) {
    case "bad":
      return "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900";
    case "info":
      return "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900";
    default:
      return "bg-[var(--desk-surface-2)] text-[var(--desk-ink)]";
  }
}

function formatMetadataKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return "None";
  }

  if (typeof value === "string") {
    return isPaperRating(value) ? PAPER_RATING_LABELS[value] : formatLabel(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatShortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function getReportStatus(report: ActivityEmailReport): {
  label: string;
  tone: ActivityEvent["statusTone"];
} {
  if (report.report_email_error) {
    return { label: "Email error", tone: "bad" };
  }

  if (report.report_email_sent_at) {
    return { label: "Email sent", tone: "good" };
  }

  if (report.processing_status === "completed") {
    return { label: "Waiting", tone: "warn" };
  }

  return { label: formatLabel(report.processing_status), tone: "neutral" };
}

function getStatusTone(status: string): ActivityEvent["statusTone"] {
  if (status === "completed") {
    return "good";
  }

  if (status === "failed") {
    return "bad";
  }

  if (status === "pending") {
    return "warn";
  }

  if (status === "processing") {
    return "info";
  }

  return "neutral";
}

function matchesStatusFilter(event: ActivityEvent, status: ActivityStatus) {
  if (status === "error") {
    return event.statusTone === "bad";
  }

  if (status === "sent") {
    return event.status.toLowerCase().includes("sent");
  }

  if (status === "waiting") {
    return event.status.toLowerCase().includes("waiting");
  }

  return event.status.toLowerCase().includes(status);
}

function normalizeSearchText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function normalizeId(value: string) {
  return value.trim().toLowerCase();
}

function toneText(tone: string) {
  switch (tone) {
    case "good":
      return "text-teal-700 dark:text-teal-300";
    case "bad":
      return "text-red-700 dark:text-red-300";
    case "warn":
      return "text-amber-700 dark:text-amber-300";
    case "info":
      return "text-sky-700 dark:text-sky-300";
    default:
      return "text-[var(--desk-ink)]";
  }
}

function statusClasses(tone: ActivityEvent["statusTone"]) {
  switch (tone) {
    case "good":
      return "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-900";
    case "bad":
      return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-900";
    case "warn":
      return "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900";
    case "info":
      return "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900";
    default:
      return "bg-[var(--desk-surface-2)] text-[var(--desk-muted)] ring-[var(--desk-border)]";
  }
}

function formatRelativeAge(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(Math.floor(diffMs / 60_000), 0);

  if (diffMinutes < 1) {
    return "Now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 48) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}
