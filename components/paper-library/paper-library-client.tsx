"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AdminPanel } from "./admin-panel";
import { ActivityView } from "./activity-view";
import { DirectoryBrowser, DirectoryControls } from "./directory-browser";
import { PaperDetailPanel } from "./paper-detail-panel";
import {
  buildAuthorItems,
  buildModelItems,
  filterDirectoryItems,
  filterPapers,
  filterProjects,
  getResultSummary,
  getViewTitle,
} from "./paper-selectors";
import { PaperTable } from "./paper-table";
import {
  AUTO_PROCESS_DELAY_MS,
  RATING_OPTIONS,
  getPaperTitle,
  isActivePaper,
  isInboxPaper,
} from "./paper-ui";
import { ProcessStatus } from "./process-status";
import { SavedProjectsView } from "./saved-projects-view";
import { SidebarNavigation } from "./sidebar-navigation";
import { useActivity } from "./use-activity";
import { useAdminSession } from "./use-admin-session";
import { useSavedProjects } from "./use-saved-projects";
import type {
  DirectoryLayout,
  DirectorySort,
  Paper,
  PapersState,
  ProcessState,
  RatingFilter,
  SubmitState,
  ViewMode,
} from "./types";

export function PaperLibraryClient() {
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
  const {
    adminPassword,
    authMessage,
    handleLogin,
    handleLogout,
    isAdmin,
    isAuthBusy,
    setAdminPassword,
  } = useAdminSession();
  const autoProcessTimeoutRef = useRef<number | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [busyPaperIds, setBusyPaperIds] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isThemeChanging, setIsThemeChanging] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("inbox");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("any");
  const [searchQuery, setSearchQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [directoryLayout, setDirectoryLayout] =
    useState<DirectoryLayout>("grid");
  const [directorySort, setDirectorySort] = useState<DirectorySort>("score");
  const {
    busyProjectIds,
    busyProjectIdeaTexts,
    deleteProjectIdea,
    saveProjectIdea,
    savedProjects,
    setSavedProjects,
  } = useSavedProjects({ isAdmin, setSubmitState });
  const { activityState, loadActivity } = useActivity({
    enabled: isAdmin && viewMode === "activity",
  });

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

  const loadPapers = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setPapersState((current) => ({
          status: "loading",
          papers: current.papers,
        }));
      }

      setPapersState(await fetchPapers());
    },
    [fetchPapers],
  );

  const runProcessingQueue = useCallback(
    async (options?: { limit?: number | "all"; silent?: boolean }) => {
      if (!isAdmin) {
        setProcessState({
          status: "error",
          message: "Super secret passphrase required.",
        });
        return;
      }

      if (processState.status === "running") {
        return;
      }

      setProcessState({
        status: "running",
        message: options?.silent
          ? "Summarizing the queued paper..."
          : "Summarizing queued papers...",
      });

      try {
        const limit = options?.limit ?? 1;
        const response = await fetch(
          `/api/jobs/process?limit=${encodeURIComponent(String(limit))}`,
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
    [isAdmin, loadPapers, processState.status],
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
    const hasActiveProcessing = papersState.papers.some(isActivePaper);

    if (!hasActiveProcessing) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadPapers({ silent: true });
    }, 15_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [loadPapers, papersState.papers]);

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

    if (!isAdmin) {
      setSubmitState({
        status: "error",
        message: "Super secret passphrase required.",
      });
      return;
    }

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
    if (!isAdmin) {
      return;
    }

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
    if (!isAdmin) {
      return;
    }

    const shouldDelete = window.confirm(`Toss "${title}" from the sieve?`);

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
      setSavedProjects((current) =>
        current.filter((project) => project.paper_id !== paperId),
      );

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
    if (!isAdmin) {
      return;
    }

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
    if (!isAdmin) {
      return;
    }

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

  async function resendReportEmail(paperId: string) {
    if (!isAdmin) {
      return;
    }

    setPaperBusy(paperId, true);
    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch(
        `/api/papers/${paperId}/report-email/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        paper?: Partial<Paper> & { id: string };
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        setSubmitState({
          status: "error",
          message:
            result.details ??
            result.error ??
            "The report email could not be resent.",
        });
        await loadActivity();
        return;
      }

      if (result.paper) {
        setPapersState((current) => ({
          ...current,
          papers: current.papers.map((paper) =>
            paper.id === paperId ? { ...paper, ...result.paper } : paper,
          ),
        }));
      }

      setSubmitState({
        status: "success",
        message: "Report email sent.",
      });
      await Promise.all([loadPapers({ silent: true }), loadActivity()]);
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the email resend endpoint.",
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

  const authorItems = useMemo(() => {
    return buildAuthorItems(papersState.papers);
  }, [papersState.papers]);

  const modelItems = useMemo(() => {
    return buildModelItems(papersState.papers);
  }, [papersState.papers]);

  const paperCounts = useMemo(() => {
    const papers = papersState.papers;

    return {
      all: papers.length,
      inbox: papers.filter(isInboxPaper).length,
      active: papers.filter(isActivePaper).length,
      failed: papers.filter((paper) => paper.processing_status === "failed")
        .length,
      readingStack: papers.filter((paper) => paper.rating === "read_later")
        .length,
      tossPile: papers.filter((paper) => paper.rating === "not_interested")
        .length,
      authors: authorItems.length,
      models: modelItems.length,
      projects: savedProjects.length,
      activity: activityState.activity?.summary.openIssueCount ?? 0,
    };
  }, [
    activityState.activity?.summary.openIssueCount,
    authorItems.length,
    modelItems.length,
    papersState.papers,
    savedProjects.length,
  ]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const visibleAuthorItems = useMemo(() => {
    return filterDirectoryItems({
      items: authorItems,
      searchQuery: viewMode === "authors" ? normalizedSearchQuery : "",
      sort: directorySort,
    });
  }, [authorItems, directorySort, normalizedSearchQuery, viewMode]);

  const visibleModelItems = useMemo(() => {
    return filterDirectoryItems({
      items: modelItems,
      searchQuery: viewMode === "models" ? normalizedSearchQuery : "",
      sort: directorySort,
    });
  }, [directorySort, modelItems, normalizedSearchQuery, viewMode]);

  const visibleProjects = useMemo(() => {
    return filterProjects({
      projects: savedProjects,
      searchQuery: viewMode === "projects" ? normalizedSearchQuery : "",
    });
  }, [normalizedSearchQuery, savedProjects, viewMode]);

  const visiblePapers = useMemo(() => {
    return filterPapers({
      authorFilter,
      modelFilter,
      papers: papersState.papers,
      ratingFilter,
      searchQuery: normalizedSearchQuery,
      viewMode,
    });
  }, [
    authorFilter,
    modelFilter,
    normalizedSearchQuery,
    papersState.papers,
    ratingFilter,
    viewMode,
  ]);

  const isPaperView =
    viewMode !== "authors" &&
    viewMode !== "models" &&
    viewMode !== "projects" &&
    viewMode !== "activity";
  const hasFilters =
    viewMode !== "inbox" ||
    ratingFilter !== "any" ||
    searchQuery.trim().length > 0 ||
    Boolean(authorFilter) ||
    Boolean(modelFilter);
  const selectedPaper =
    papersState.papers.find((paper) => paper.id === selectedPaperId) ?? null;
  const selectedVisibleIndex = selectedPaperId
    ? visiblePapers.findIndex((paper) => paper.id === selectedPaperId)
    : -1;
  const hasPreviousPaper = selectedVisibleIndex > 0;
  const hasNextPaper =
    selectedVisibleIndex >= 0 && selectedVisibleIndex < visiblePapers.length - 1;

  function clearFilters() {
    setViewMode("inbox");
    setRatingFilter("any");
    setSearchQuery("");
    setAuthorFilter(null);
    setModelFilter(null);
  }

  function selectPreviousPaper() {
    if (hasPreviousPaper) {
      setSelectedPaperId(visiblePapers[selectedVisibleIndex - 1].id);
    }
  }

  function selectNextPaper() {
    if (hasNextPaper) {
      setSelectedPaperId(visiblePapers[selectedVisibleIndex + 1].id);
    }
  }

  function showAuthorPapers(author: string) {
    setAuthorFilter(author);
    setModelFilter(null);
    setRatingFilter("any");
    setViewMode("all");
  }

  function showModelPapers(model: string) {
    setModelFilter(model);
    setAuthorFilter(null);
    setRatingFilter("any");
    setViewMode("all");
  }

  return (
    <div
      className={`${isDarkMode ? "dark" : ""} ${
        isThemeChanging ? "theme-changing" : ""
      }`}
    >
      <div className="paper-app min-h-screen px-6 py-10 text-[var(--desk-ink)] transition-colors">
        <div className="mx-auto grid min-h-screen w-full max-w-[96rem] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <SidebarNavigation
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            paperCounts={paperCounts}
          />

          <main className="min-w-0">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <label className="relative flex min-h-12 flex-1 items-center rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] shadow-sm">
                  <span className="pl-4 text-[var(--desk-muted)]">Search</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="papers, authors, arXiv IDs, keywords..."
                    className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--desk-ink)] outline-none placeholder:text-[var(--desk-muted)]"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <AdminPanel
                    isAdmin={isAdmin}
                    isAuthBusy={isAuthBusy}
                    password={adminPassword}
                    authMessage={authMessage}
                    onPasswordChange={setAdminPassword}
                    onLogin={handleLogin}
                    onLogout={() => void handleLogout()}
                  />
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] text-lg font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
                    aria-label={
                      isDarkMode
                        ? "Switch to light mode"
                        : "Switch to dark mode"
                    }
                    title={isDarkMode ? "Light mode" : "Dark mode"}
                  >
                    {isDarkMode ? "☀" : "☾"}
                  </button>
                </div>
              </div>

              {isAdmin ? (
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-5 shadow-sm"
                >
                  <label
                    htmlFor="arxiv-url"
                    className="text-sm font-medium text-[var(--desk-ink)]"
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
                      className="min-h-12 flex-1 rounded-md border border-[var(--desk-border)] bg-[var(--desk-bg)] px-4 text-base text-[var(--desk-ink)] outline-none transition placeholder:text-[var(--desk-muted)] focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
                      required
                    />
                    <button
                      type="submit"
                      disabled={submitState.status === "submitting"}
                      className="min-h-12 rounded-md bg-[var(--desk-accent)] px-5 text-base font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitState.status === "submitting"
                        ? "Adding"
                        : "Add paper"}
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
              ) : null}

              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="font-serif text-3xl font-semibold tracking-tight">
                        {getViewTitle(viewMode)}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--desk-muted)]">
                        {getResultSummary({
                          viewMode,
                          papersState,
                          visiblePapersCount: visiblePapers.length,
                          visibleAuthorCount: visibleAuthorItems.length,
                          visibleModelCount: visibleModelItems.length,
                          visibleProjectCount: visibleProjects.length,
                        })}
                      </p>
                      {authorFilter || modelFilter || searchQuery.trim() ? (
                        <p className="mt-2 text-sm text-[var(--desk-muted)]">
                          {[
                            authorFilter ? `Author: ${authorFilter}` : null,
                            modelFilter ? `Model: ${modelFilter}` : null,
                            searchQuery.trim()
                              ? `Search: ${searchQuery.trim()}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {viewMode === "authors" || viewMode === "models" ? (
                        <DirectoryControls
                          layout={directoryLayout}
                          sort={directorySort}
                          onLayoutChange={setDirectoryLayout}
                          onSortChange={setDirectorySort}
                        />
                      ) : null}
                      {isPaperView ? (
                        <label className="flex items-center gap-2 text-sm font-medium text-[var(--desk-muted)]">
                          Verdict
                          <select
                            value={ratingFilter}
                            onChange={(event) =>
                              setRatingFilter(
                                event.target.value as RatingFilter,
                              )
                            }
                            className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm text-[var(--desk-ink)] outline-none transition focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
                          >
                            <option value="any">Any verdict</option>
                            <option value="unrated">No verdict</option>
                            {RATING_OPTIONS.filter(
                              (option) => option.value,
                            ).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {hasFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
                        >
                          Clear
                        </button>
                      ) : null}
                      {isAdmin && isPaperView ? (
                        <button
                          type="button"
                          disabled={processState.status === "running"}
                          onClick={() =>
                            void runProcessingQueue({
                              limit: "all",
                              silent: false,
                            })
                          }
                          className="min-h-10 rounded-md border border-[var(--desk-accent)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {processState.status === "running"
                            ? "Summarizing"
                            : "Summarize"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (viewMode === "activity") {
                            void loadActivity();
                          } else {
                            void loadPapers();
                          }
                        }}
                        className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
                      >
                        Sync
                      </button>
                    </div>
                  </div>
                  <ProcessStatus state={processState} />
                </div>

                {papersState.status === "error" ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {papersState.message}
                  </p>
                ) : null}

                {viewMode === "authors" ? (
                  <DirectoryBrowser
                    emptyLabel="No authors match this search."
                    items={visibleAuthorItems}
                    layout={directoryLayout}
                    noun="paper"
                    onSelect={showAuthorPapers}
                  />
                ) : null}

                {viewMode === "models" ? (
                  <DirectoryBrowser
                    emptyLabel="No models match this search."
                    items={visibleModelItems}
                    layout={directoryLayout}
                    noun="paper"
                    onSelect={showModelPapers}
                  />
                ) : null}

                {viewMode === "projects" ? (
                  <SavedProjectsView
                    isAdmin={isAdmin}
                    projects={visibleProjects}
                    busyProjectIds={busyProjectIds}
                    onOpenPaper={setSelectedPaperId}
                    onDeleteProject={(projectId) =>
                      void deleteProjectIdea(projectId)
                    }
                  />
                ) : null}

                {viewMode === "activity" ? (
                  <ActivityView
                    isAdmin={isAdmin}
                    activityState={activityState}
                    papers={papersState.papers}
                    searchQuery={searchQuery}
                    busyPaperIds={busyPaperIds}
                    onRefresh={() => void loadActivity()}
                    onOpenPaper={setSelectedPaperId}
                    onResendReportEmail={(paperId) =>
                      void resendReportEmail(paperId)
                    }
                  />
                ) : null}

                {isPaperView ? (
                  <PaperTable
                    isAdmin={isAdmin}
                    papers={visiblePapers}
                    totalPaperCount={papersState.papers.length}
                    selectedPaperId={selectedPaperId}
                    busyPaperIds={busyPaperIds}
                    onSelectPaper={setSelectedPaperId}
                    onRatingChange={(paperId, rating) =>
                      void updatePaperRating(paperId, rating)
                    }
                    onDelete={(paperId, title) =>
                      void deletePaper(paperId, title)
                    }
                    onRetry={(paperId) => void retryPaper(paperId)}
                    onReprocess={(paperId) => void reprocessPaper(paperId)}
                  />
                ) : null}
              </section>
            </div>
          </main>

          {selectedPaper ? (
            <PaperDetailPanel
              isAdmin={isAdmin}
              key={selectedPaper.id}
              paper={selectedPaper}
              isBusy={busyPaperIds.has(selectedPaper.id)}
              hasPrevious={hasPreviousPaper}
              hasNext={hasNextPaper}
              onClose={() => setSelectedPaperId(null)}
              onPrevious={selectPreviousPaper}
              onNext={selectNextPaper}
              onRatingChange={(rating) =>
                void updatePaperRating(selectedPaper.id, rating)
              }
              onDelete={() =>
                void deletePaper(selectedPaper.id, getPaperTitle(selectedPaper))
              }
              onRetry={() => void retryPaper(selectedPaper.id)}
              onReprocess={() => void reprocessPaper(selectedPaper.id)}
              onSaveProjectIdea={(ideaText) =>
                void saveProjectIdea(selectedPaper.id, ideaText)
              }
              savedProjectIdeas={savedProjects.filter(
                (project) => project.paper_id === selectedPaper.id,
              )}
              busyProjectIdeaTexts={busyProjectIdeaTexts}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
