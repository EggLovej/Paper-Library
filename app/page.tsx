"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ProcessState =
  | { status: "idle" }
  | { status: "running"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type Paper = {
  id: string;
  arxiv_id: string;
  url: string;
  title?: string | null;
  authors?: string[] | null;
  abstract?: string | null;
  summary_overview?: string | null;
  summary_overview_easy?: string | null;
  summary_overview_caveman?: string | null;
  summary_contributions?: string | null;
  summary_contributions_easy?: string | null;
  summary_contributions_caveman?: string | null;
  summary_prior_work_delta?: string | null;
  summary_prior_work_delta_easy?: string | null;
  summary_prior_work_delta_caveman?: string | null;
  summary_project_ideas?: string[] | null;
  rating?: string | null;
  processing_status?: string | null;
  processing_error?: string | null;
  processing_model?: string | null;
  created_at?: string | null;
  source?: string | null;
  source_paper_id?: string | null;
  latest_job?: PaperProcessingJob | null;
};

type PaperProcessingJob = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after?: string | null;
  locked_at?: string | null;
  completed_at?: string | null;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PapersState =
  | { status: "loading"; papers: Paper[]; message?: string }
  | { status: "ready"; papers: Paper[]; message?: string }
  | { status: "error"; papers: Paper[]; message: string };

const RATING_OPTIONS = [
  { value: "", label: "None" },
  { value: "interested", label: "Interested" },
  { value: "maybe", label: "Maybe" },
  { value: "not_interested", label: "Not interested" },
  { value: "read_later", label: "Read later" },
];

const COMPLEXITY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "easy", label: "Easy" },
  { value: "caveman", label: "Caveman" },
] as const;

type ComplexityMode = (typeof COMPLEXITY_OPTIONS)[number]["value"];
type ViewMode = "inbox" | "all" | "active" | "failed";
type RatingFilter = "any" | "unrated" | string;

const AUTO_PROCESS_DELAY_MS = 2500;

function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatLabel(value?: string | null) {
  if (!value) {
    return "None";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPaperTitle(paper: Paper) {
  return paper.title || `arXiv ${paper.arxiv_id}`;
}

function isInboxPaper(paper: Paper) {
  return (
    paper.processing_status === "failed" ||
    (paper.processing_status === "completed" && !paper.rating)
  );
}

function isActivePaper(paper: Paper) {
  return (
    paper.processing_status === "pending" ||
    paper.processing_status === "processing"
  );
}

function getStatusClasses(value?: string | null) {
  switch (value) {
    case "completed":
      return "bg-teal-50 text-teal-800 ring-teal-200";
    case "processing":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    case "pending":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "failed":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}

function getRatingClasses(value?: string | null) {
  switch (value) {
    case "interested":
      return "bg-teal-50 text-teal-800 ring-teal-200";
    case "maybe":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "read_later":
      return "bg-sky-50 text-sky-800 ring-sky-200";
    case "not_interested":
      return "bg-zinc-100 text-zinc-600 ring-zinc-200";
    default:
      return "bg-white text-zinc-600 ring-zinc-200";
  }
}

function getRatingSelectClasses(value?: string | null) {
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

function formatModelName(value?: string | null) {
  if (!value) {
    return "Model unknown";
  }

  const knownModels: Record<string, string> = {
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
  };

  return (
    knownModels[value] ??
    value
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function getJobAttemptsLabel(job?: PaperProcessingJob | null) {
  if (!job) {
    return "No job";
  }

  return `Attempts ${job.attempts}/${job.max_attempts}`;
}

function getJobSummaryLabel(paper: Paper) {
  const job = paper.latest_job;

  if (paper.processing_status === "pending") {
    return "";
  }

  if (!job) {
    return "No job";
  }

  return `${formatLabel(job.status)} · ${getJobAttemptsLabel(job)}`;
}

function getDetailRetryLabel(paper: Paper) {
  const job = paper.latest_job;

  if (!job) {
    return "No job";
  }

  if (paper.processing_status === "pending") {
    return job.attempts > 0
      ? `Retry ${job.attempts + 1} of ${job.max_attempts} scheduled`
      : "First run scheduled";
  }

  return getJobAttemptsLabel(job);
}

function getComplexityValue({
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

export default function Home() {
  const [url, setUrl] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
  });
  const [processState, setProcessState] = useState<ProcessState>({
    status: "idle",
  });
  const [papersState, setPapersState] = useState<PapersState>({
    status: "loading",
    papers: [],
  });
  const autoProcessTimeoutRef = useRef<number | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [busyPaperIds, setBusyPaperIds] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isThemeChanging, setIsThemeChanging] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("inbox");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("any");

  const fetchPapers = useCallback(async (): Promise<PapersState> => {
    try {
      const response = await fetch("/api/papers");
      const result = (await response.json()) as {
        papers?: Paper[];
        error?: string;
      };

      if (!response.ok) {
        return {
          status: "error",
          papers: [],
          message: result.error ?? "The papers could not be loaded.",
        };
      }

      return {
        status: "ready",
        papers: result.papers ?? [],
      };
    } catch {
      return {
        status: "error",
        papers: [],
        message: "Could not reach the backend.",
      };
    }
  }, []);

  const loadPapers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setPapersState((current) => ({
        status: "loading",
        papers: current.papers,
      }));
    }

    setPapersState(await fetchPapers());
  }, [fetchPapers]);

  const runProcessingQueue = useCallback(
    async (options?: { limit?: number; silent?: boolean }) => {
      if (processState.status === "running") {
        return;
      }

      setProcessState({
        status: "running",
        message: options?.silent
          ? "Processing the queued paper..."
          : "Processing queued papers...",
      });

      try {
        const response = await fetch(
          `/api/jobs/process?limit=${options?.limit ?? 1}`,
          {
            method: "POST",
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          processed?: number;
          error?: string;
        };

        if (!response.ok) {
          setProcessState({
            status: "error",
            message: result.error ?? "The processing queue could not be run.",
          });
          return;
        }

        const processed = result.processed ?? 0;
        setProcessState({
          status: "success",
          message:
            processed > 0
              ? `Processed ${processed} queued paper${
                  processed === 1 ? "" : "s"
                }.`
              : "No ready papers in the queue.",
        });
        await loadPapers({ silent: true });
      } catch {
        setProcessState({
          status: "error",
          message: "Could not reach the job processor.",
        });
      }
    },
    [loadPapers, processState.status],
  );

  const scheduleProcessingQueue = useCallback(() => {
    if (autoProcessTimeoutRef.current !== null) {
      window.clearTimeout(autoProcessTimeoutRef.current);
    }

    autoProcessTimeoutRef.current = window.setTimeout(() => {
      autoProcessTimeoutRef.current = null;
      void runProcessingQueue({ limit: 1, silent: true });
    }, AUTO_PROCESS_DELAY_MS);
  }, [runProcessingQueue]);

  useEffect(() => {
    let ignore = false;

    void fetchPapers().then((nextState) => {
      if (!ignore) {
        setPapersState(nextState);
      }
    });

    return () => {
      ignore = true;
    };
  }, [fetchPapers]);

  useEffect(() => {
    return () => {
      if (autoProcessTimeoutRef.current !== null) {
        window.clearTimeout(autoProcessTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasActiveProcessing = papersState.papers.some(
      (paper) =>
        paper.processing_status === "pending" ||
        paper.processing_status === "processing",
    );

    if (!hasActiveProcessing) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadPapers({ silent: true });
    }, 15_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadPapers, papersState]);

  useEffect(() => {
    if (!selectedPaperId) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPaperId(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedPaperId]);

  useEffect(() => {
    if (submitState.status !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSubmitState({ status: "idle" });
    }, 7000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [submitState]);

  useEffect(() => {
    if (processState.status !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setProcessState({ status: "idle" });
    }, 7000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [processState]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUrl = url.trim();
    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/papers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const result = (await response.json()) as {
        error?: string;
        arxivId?: string;
        status?: string;
      };

      if (!response.ok) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The paper URL could not be submitted.",
        });
        return;
      }

      setSubmitState({
        status: "success",
        message:
          result.status === "already_exists"
            ? `arXiv paper ${result.arxivId} is already in the library.`
            : `Accepted arXiv paper ${result.arxivId} for processing. Processing will start shortly.`,
      });
      setUrl("");
      await loadPapers();

      if (result.status === "accepted") {
        scheduleProcessingQueue();
      }
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    }
  }

  function setPaperBusy(paperId: string, isBusy: boolean) {
    setBusyPaperIds((current) => {
      const next = new Set(current);

      if (isBusy) {
        next.add(paperId);
      } else {
        next.delete(paperId);
      }

      return next;
    });
  }

  async function updatePaperRating(paperId: string, rating: string) {
    setPaperBusy(paperId, true);

    try {
      const response = await fetch(`/api/papers/${paperId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rating: rating || null }),
      });
      const result = (await response.json()) as {
        paper?: Paper;
        error?: string;
      };

      if (!response.ok || !result.paper) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The rating could not be updated.",
        });
        return;
      }

      const updatedPaper = result.paper;

      setPapersState((current) => ({
        ...current,
        papers: current.papers.map((paper) =>
          paper.id === paperId
            ? { ...paper, rating: updatedPaper.rating }
            : paper,
        ),
      }));
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setPaperBusy(paperId, false);
    }
  }

  async function deletePaper(paperId: string, title: string) {
    const shouldDelete = window.confirm(`Delete "${title}" from the library?`);

    if (!shouldDelete) {
      return;
    }

    setPaperBusy(paperId, true);

    try {
      const response = await fetch(`/api/papers/${paperId}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The paper could not be deleted.",
        });
        return;
      }

      setPapersState((current) => ({
        ...current,
        papers: current.papers.filter((paper) => paper.id !== paperId),
      }));

      if (selectedPaperId === paperId) {
        setSelectedPaperId(null);
      }
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setPaperBusy(paperId, false);
    }
  }

  async function retryPaper(paperId: string) {
    setPaperBusy(paperId, true);

    try {
      const response = await fetch(`/api/papers/${paperId}/retry`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        paper?: Paper;
        error?: string;
      };

      if (!response.ok || !result.paper) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The paper could not be queued again.",
        });
        return;
      }

      const queuedPaper = result.paper;

      setPapersState((current) => ({
        ...current,
        papers: current.papers.map((paper) =>
          paper.id === paperId ? { ...paper, ...queuedPaper } : paper,
        ),
      }));

      setSubmitState({
        status: "success",
        message: "The paper was queued for retry.",
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setPaperBusy(paperId, false);
    }
  }

  async function reprocessPaper(paperId: string) {
    setPaperBusy(paperId, true);

    try {
      const response = await fetch(`/api/papers/${paperId}/reprocess`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        paper?: Paper;
        error?: string;
      };

      if (!response.ok || !result.paper) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The paper could not be queued again.",
        });
        return;
      }

      const queuedPaper = result.paper;

      setPapersState((current) => ({
        ...current,
        papers: current.papers.map((paper) =>
          paper.id === paperId ? { ...paper, ...queuedPaper } : paper,
        ),
      }));

      setSubmitState({
        status: "success",
        message: "The paper was queued for reprocessing.",
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setPaperBusy(paperId, false);
    }
  }

  function toggleTheme() {
    setIsThemeChanging(true);
    setIsDarkMode((current) => !current);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsThemeChanging(false);
      });
    });
  }

  const paperCounts = useMemo(() => {
    const papers = papersState.papers;

    return {
      all: papers.length,
      inbox: papers.filter(isInboxPaper).length,
      active: papers.filter(isActivePaper).length,
      failed: papers.filter((paper) => paper.processing_status === "failed")
        .length,
    };
  }, [papersState.papers]);

  const visiblePapers = useMemo(() => {
    return papersState.papers.filter((paper) => {
      const matchesView =
        viewMode === "all" ||
        (viewMode === "inbox" && isInboxPaper(paper)) ||
        (viewMode === "active" && isActivePaper(paper)) ||
        (viewMode === "failed" && paper.processing_status === "failed");

      if (!matchesView) {
        return false;
      }

      if (ratingFilter === "any") {
        return true;
      }

      if (ratingFilter === "unrated") {
        return !paper.rating;
      }

      return paper.rating === ratingFilter;
    });
  }, [papersState.papers, ratingFilter, viewMode]);

  const hasFilters = viewMode !== "inbox" || ratingFilter !== "any";
  const selectedPaper =
    papersState.papers.find((paper) => paper.id === selectedPaperId) ?? null;

  return (
    <div
      className={`min-h-screen px-6 py-10 transition-colors ${
        isDarkMode
          ? "dark bg-zinc-950 text-zinc-50"
          : "bg-zinc-50 text-zinc-950"
      } ${isThemeChanging ? "theme-changing" : ""}`}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">
              Paper Library
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              Paper Library
            </h1>
            <p className="max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Add arXiv or Scholar Inbox paper links, track processing state,
              and review details from one table.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-lg font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? "☀" : "☾"}
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label
            htmlFor="arxiv-url"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
          >
            Paper URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="arxiv-url"
              name="arxiv-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://arxiv.org/abs/2401.12345 or Scholar Inbox link"
              className="min-h-12 flex-1 rounded-md border border-zinc-300 bg-white px-4 text-base text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-teal-950"
              required
            />
            <button
              type="submit"
              disabled={submitState.status === "submitting"}
              className="min-h-12 rounded-md bg-zinc-950 px-5 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-teal-600 dark:hover:bg-teal-500 dark:disabled:bg-zinc-700"
            >
              {submitState.status === "submitting" ? "Submitting" : "Submit"}
            </button>
          </div>
          {submitState.status === "success" ? (
            <p className="rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
              {submitState.message}
            </p>
          ) : null}
          {submitState.status === "error" ? (
            <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
              {submitState.message}
            </p>
          ) : null}
        </form>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {viewMode === "inbox" ? "Inbox" : "Papers"}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {papersState.papers.length > 0 ||
                papersState.status !== "loading"
                  ? `${visiblePapers.length} shown of ${papersState.papers.length}`
                  : "Loading papers"}
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "inbox", label: "Inbox", count: paperCounts.inbox },
                  { value: "all", label: "All", count: paperCounts.all },
                  {
                    value: "active",
                    label: "Processing",
                    count: paperCounts.active,
                  },
                  { value: "failed", label: "Failed", count: paperCounts.failed },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setViewMode(option.value as ViewMode)}
                    className={`min-h-10 rounded-md border px-3 text-sm font-medium transition ${
                      viewMode === option.value
                        ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200"
                        : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {option.label}
                    <span className="ml-2 text-xs opacity-70">
                      {option.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Rating
                  <select
                    value={ratingFilter}
                    onChange={(event) =>
                      setRatingFilter(event.target.value as RatingFilter)
                    }
                    className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-teal-950"
                  >
                    <option value="any">Any rating</option>
                    <option value="unrated">Unrated</option>
                    {RATING_OPTIONS.filter((option) => option.value).map(
                      (option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {hasFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("inbox");
                      setRatingFilter("any");
                    }}
                    className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={processState.status === "running"}
                  onClick={() =>
                    void runProcessingQueue({ limit: 2, silent: false })
                  }
                  className="min-h-10 rounded-md border border-teal-200 bg-teal-50 px-4 text-sm font-medium text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200 dark:hover:bg-teal-900"
                >
                  {processState.status === "running" ? "Processing" : "Process"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadPapers()}
                  className="min-h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Refresh
                </button>
              </div>
            </div>
            {processState.status === "running" ? (
              <p className="rounded-md bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                {processState.message}
              </p>
            ) : null}
            {processState.status === "success" ? (
              <p className="rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                {processState.message}
              </p>
            ) : null}
            {processState.status === "error" ? (
              <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
                {processState.message}
              </p>
            ) : null}
          </div>

          {papersState.status === "error" ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {papersState.message}
            </p>
          ) : null}

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
                  {visiblePapers.map((paper) => {
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
                        onClick={() => setSelectedPaperId(paper.id)}
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
                            onChange={(rating) => {
                              void updatePaperRating(
                                paper.id,
                                rating,
                              );
                            }}
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
                                setSelectedPaperId(paper.id);
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
                                void deletePaper(paper.id, displayTitle);
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
                                  void retryPaper(paper.id);
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
                                  void reprocessPaper(paper.id);
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

                  {visiblePapers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                      >
                        {papersState.papers.length === 0
                          ? "No papers yet."
                          : "No papers match this view."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      {selectedPaper ? (
        <PaperDetailPanel
          key={selectedPaper.id}
          paper={selectedPaper}
          isBusy={busyPaperIds.has(selectedPaper.id)}
          onClose={() => setSelectedPaperId(null)}
          onRatingChange={(rating) =>
            void updatePaperRating(selectedPaper.id, rating)
          }
          onDelete={() =>
            void deletePaper(selectedPaper.id, getPaperTitle(selectedPaper))
          }
          onRetry={() => void retryPaper(selectedPaper.id)}
          onReprocess={() => void reprocessPaper(selectedPaper.id)}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
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

function RatingPicker({
  value,
  disabled,
  label,
  onChange,
}: {
  value?: string | null;
  disabled?: boolean;
  label: string;
  onChange: (rating: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className={`min-h-10 rounded-md border px-3 pr-8 text-sm font-medium outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-teal-950 ${getRatingSelectClasses(
        value,
      )}`}
    >
      {RATING_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function PaperStatusSummary({ paper }: { paper: Paper }) {
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

function PaperDetailPanel({
  paper,
  isBusy,
  onClose,
  onRatingChange,
  onDelete,
  onRetry,
  onReprocess,
}: {
  paper: Paper;
  isBusy: boolean;
  onClose: () => void;
  onRatingChange: (rating: string) => void;
  onDelete: () => void;
  onRetry: () => void;
  onReprocess: () => void;
}) {
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
              <div className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                <span>Rating</span>
                <RatingPicker
                  value={paper.rating}
                  disabled={isBusy}
                  label={`Rating for ${title}`}
                  onChange={onRatingChange}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  Open PDF
                </a>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onDelete}
                  className="min-h-10 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Delete
                </button>
                {paper.processing_status === "failed" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onRetry}
                    className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-amber-300 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
                  >
                    Retry
                  </button>
                ) : null}
                {paper.processing_status === "completed" ? (
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
