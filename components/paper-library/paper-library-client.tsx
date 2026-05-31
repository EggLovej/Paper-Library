"use client";

import Image from "next/image";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PaperDetailPanel } from "./paper-detail-panel";
import { PaperTable } from "./paper-table";
import {
  AUTO_PROCESS_DELAY_MS,
  RATING_OPTIONS,
  formatModelName,
  getPaperTitle,
  isActivePaper,
  isInboxPaper,
} from "./paper-ui";
import type {
  Paper,
  PapersState,
  ProcessState,
  RatingFilter,
  SubmitState,
  ViewMode,
} from "./types";

type PaperCounts = {
  all: number;
  inbox: number;
  active: number;
  failed: number;
  readingStack: number;
  tossPile: number;
  authors: number;
  models: number;
};

type DirectoryItem = {
  name: string;
  count: number;
  averageScore: number;
  score: number;
  signalScore: number;
};

type DirectoryLayout = "grid" | "list";
type DirectorySort = "score" | "count" | "name";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
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
    async (options?: { limit?: number; silent?: boolean }) => {
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

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session");
        const result = (await response.json()) as { isAdmin?: boolean };

        if (!ignore) {
          setIsAdmin(Boolean(response.ok && result.isAdmin));
        }
      } catch {
        if (!ignore) {
          setIsAdmin(false);
        }
      }
    }

    void loadSession();

    return () => {
      ignore = true;
    };
  }, []);

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

  function toggleTheme() {
    setIsThemeChanging(true);
    setIsDarkMode((current) => !current);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsThemeChanging(false);
      });
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthBusy(true);
    setAuthMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: adminPassword }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        isAdmin?: boolean;
        error?: string;
      };

      if (!response.ok || !result.isAdmin) {
        setAuthMessage(result.error ?? "Login failed.");
        return;
      }

      setIsAdmin(true);
      setAdminPassword("");
      setAuthMessage(null);
    } catch {
      setAuthMessage("Could not reach the login endpoint.");
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleLogout() {
    setIsAuthBusy(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setIsAdmin(false);
      setAuthMessage(null);
      setIsAuthBusy(false);
    }
  }

  const authorItems = useMemo(() => {
    const items = new Map<string, DirectoryItem>();

    for (const paper of papersState.papers) {
      const score = getPaperRatingScore(paper.rating);

      for (const author of paper.authors ?? []) {
        const current = items.get(author) ?? {
          name: author,
          count: 0,
          averageScore: 0,
          score: 0,
          signalScore: 0,
        };

        items.set(author, {
          ...current,
          count: current.count + 1,
          signalScore: current.signalScore + score,
        });
      }
    }

    return sortDirectoryItems(finalizeDirectoryItems([...items.values()]), "score");
  }, [papersState.papers]);

  const modelItems = useMemo(() => {
    const items = new Map<string, DirectoryItem>();

    for (const paper of papersState.papers) {
      const model = paper.processing_model
        ? formatModelName(paper.processing_model)
        : "Model unknown";
      const current = items.get(model) ?? {
        name: model,
        count: 0,
        averageScore: 0,
        score: 0,
        signalScore: 0,
      };

      items.set(model, {
        ...current,
        count: current.count + 1,
        signalScore: current.signalScore + getPaperRatingScore(paper.rating),
      });
    }

    return sortDirectoryItems(finalizeDirectoryItems([...items.values()]), "score");
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
    };
  }, [authorItems.length, modelItems.length, papersState.papers]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const visibleAuthorItems = useMemo(() => {
    const items =
      normalizedSearchQuery && viewMode === "authors"
        ? authorItems.filter((author) =>
            author.name.toLowerCase().includes(normalizedSearchQuery),
          )
        : authorItems;

    return sortDirectoryItems(items, directorySort);
  }, [authorItems, directorySort, normalizedSearchQuery, viewMode]);

  const visibleModelItems = useMemo(() => {
    const items =
      normalizedSearchQuery && viewMode === "models"
        ? modelItems.filter((model) =>
            model.name.toLowerCase().includes(normalizedSearchQuery),
          )
        : modelItems;

    return sortDirectoryItems(items, directorySort);
  }, [directorySort, modelItems, normalizedSearchQuery, viewMode]);

  const visiblePapers = useMemo(() => {
    return papersState.papers.filter((paper) => {
      const matchesView =
        viewMode === "all" ||
        (viewMode === "inbox" && isInboxPaper(paper)) ||
        (viewMode === "active" && isActivePaper(paper)) ||
        (viewMode === "failed" && paper.processing_status === "failed") ||
        (viewMode === "reading_stack" && paper.rating === "read_later") ||
        (viewMode === "toss_pile" && paper.rating === "not_interested");

      if (!matchesView) {
        return false;
      }

      if (authorFilter && !(paper.authors ?? []).includes(authorFilter)) {
        return false;
      }

      if (
        modelFilter &&
        formatModelName(paper.processing_model) !== modelFilter
      ) {
        return false;
      }

      if (normalizedSearchQuery) {
        const searchableText = [
          paper.title,
          paper.arxiv_id,
          paper.abstract,
          paper.summary_overview,
          paper.summary_contributions,
          paper.summary_prior_work_delta,
          ...(paper.authors ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchableText.includes(normalizedSearchQuery)) {
          return false;
        }
      }

      if (ratingFilter === "any") {
        return true;
      }

      if (ratingFilter === "unrated") {
        return !paper.rating;
      }

      return paper.rating === ratingFilter;
    });
  }, [
    authorFilter,
    modelFilter,
    normalizedSearchQuery,
    papersState.papers,
    ratingFilter,
    viewMode,
  ]);

  const isPaperView = viewMode !== "authors" && viewMode !== "models";
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
                      {!isPaperView ? (
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
                              limit: 2,
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
                        onClick={() => void loadPapers()}
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
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getViewTitle(viewMode: ViewMode) {
  const titles: Record<ViewMode, string> = {
    inbox: "Inbox",
    all: "All Papers",
    active: "Processing",
    failed: "Failed",
    reading_stack: "Reading Stack",
    toss_pile: "Toss Pile",
    authors: "Authors",
    models: "Models",
  };

  return titles[viewMode];
}

function getResultSummary({
  viewMode,
  papersState,
  visiblePapersCount,
  visibleAuthorCount,
  visibleModelCount,
}: {
  viewMode: ViewMode;
  papersState: PapersState;
  visiblePapersCount: number;
  visibleAuthorCount: number;
  visibleModelCount: number;
}) {
  if (papersState.papers.length === 0 && papersState.status === "loading") {
    return "Loading papers";
  }

  if (viewMode === "authors") {
    return `${visibleAuthorCount} author${
      visibleAuthorCount === 1 ? "" : "s"
    }`;
  }

  if (viewMode === "models") {
    return `${visibleModelCount} model${visibleModelCount === 1 ? "" : "s"}`;
  }

  return `${visiblePapersCount} shown of ${papersState.papers.length}`;
}

function getPaperRatingScore(rating?: string | null) {
  switch (rating) {
    case "not_interested":
      return -2;
    case "read_later":
      return 1.75;
    case "interested":
      return 3;
    case "maybe":
      return 1;
    default:
      return 0.5;
  }
}

function finalizeDirectoryItems(items: DirectoryItem[]) {
  return items.map((item) => {
    const averageScore = item.count > 0 ? item.signalScore / item.count : 0;

    return {
      ...item,
      averageScore,
      score: averageScore * Math.log2(item.count + 1),
    };
  });
}

function sortDirectoryItems(items: DirectoryItem[], sort: DirectorySort) {
  return [...items].sort((left, right) => {
    if (sort === "name") {
      return left.name.localeCompare(right.name);
    }

    if (sort === "count") {
      return right.count - left.count || left.name.localeCompare(right.name);
    }

    return (
      right.score - left.score ||
      right.count - left.count ||
      left.name.localeCompare(right.name)
    );
  });
}

function SidebarNavigation({
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
    { value: "authors", label: "Authors", count: paperCounts.authors },
    { value: "models", label: "Models", count: paperCounts.models },
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

function DirectoryControls({
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

function DirectoryBrowser({
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

function AdminPanel({
  isAdmin,
  isAuthBusy,
  password,
  authMessage,
  onPasswordChange,
  onLogin,
  onLogout,
}: {
  isAdmin: boolean;
  isAuthBusy: boolean;
  password: string;
  authMessage: string | null;
  onPasswordChange: (password: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}) {
  if (isAdmin) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="rounded-full border border-[var(--desk-accent)] bg-[var(--desk-surface)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--desk-accent)]">
          Curator mode
        </p>
        <button
          type="button"
          disabled={isAuthBusy}
          onClick={onLogout}
          className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Lock controls
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onLogin}
      className="flex w-full max-w-xl flex-col gap-2 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-3 shadow-sm sm:w-[32rem]"
    >
      <label
        htmlFor="admin-password"
        className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]"
      >
        For CRUD operations
      </label>
      <div className="grid gap-2 sm:grid-cols-[minmax(16rem,1fr)_auto]">
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Super secret passphrase"
          className="min-h-10 min-w-0 rounded-md border border-[var(--desk-border)] bg-[var(--desk-bg)] px-3 text-sm text-[var(--desk-ink)] outline-none transition placeholder:text-[var(--desk-muted)] focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
        />
        <button
          type="submit"
          disabled={isAuthBusy}
          className="min-h-10 whitespace-nowrap rounded-md bg-[var(--desk-accent)] px-4 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAuthBusy ? "Checking" : "Unlock"}
        </button>
      </div>
      {authMessage ? (
        <p className="text-sm text-[var(--desk-danger)]">{authMessage}</p>
      ) : null}
    </form>
  );
}

function ProcessStatus({ state }: { state: ProcessState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "running") {
    return (
      <p className="rounded-md bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
        {state.message}
      </p>
    );
  }

  if (state.status === "success") {
    return (
      <p className="rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
        {state.message}
      </p>
    );
  }

  return (
    <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
      {state.message}
    </p>
  );
}
