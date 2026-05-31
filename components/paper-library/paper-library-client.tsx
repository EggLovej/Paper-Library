"use client";

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
          message: "Admin login required.",
        });
        return;
      }

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
        message: "Admin login required.",
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
            aria-label={
              isDarkMode ? "Switch to light mode" : "Switch to dark mode"
            }
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? "☀" : "☾"}
          </button>
        </header>

        <AdminPanel
          isAdmin={isAdmin}
          isAuthBusy={isAuthBusy}
          password={adminPassword}
          authMessage={authMessage}
          onPasswordChange={setAdminPassword}
          onLogin={handleLogin}
          onLogout={() => void handleLogout()}
        />

        {isAdmin ? (
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
        ) : null}

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
                  {
                    value: "failed",
                    label: "Failed",
                    count: paperCounts.failed,
                  },
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
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={processState.status === "running"}
                    onClick={() =>
                      void runProcessingQueue({ limit: 2, silent: false })
                    }
                    className="min-h-10 rounded-md border border-teal-200 bg-teal-50 px-4 text-sm font-medium text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200 dark:hover:bg-teal-900"
                  >
                    {processState.status === "running"
                      ? "Processing"
                      : "Process"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void loadPapers()}
                  className="min-h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Refresh
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
            onDelete={(paperId, title) => void deletePaper(paperId, title)}
            onRetry={(paperId) => void retryPaper(paperId)}
            onReprocess={(paperId) => void reprocessPaper(paperId)}
          />
        </section>
      </main>

      {selectedPaper ? (
        <PaperDetailPanel
          isAdmin={isAdmin}
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
      <div className="flex flex-col gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-teal-900 dark:bg-teal-950">
        <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
          Admin mode
        </p>
        <button
          type="button"
          disabled={isAuthBusy}
          onClick={onLogout}
          className="min-h-10 rounded-md border border-teal-200 bg-white px-4 text-sm font-medium text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-800 dark:bg-zinc-950 dark:text-teal-200 dark:hover:bg-teal-900"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onLogin}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label
        htmlFor="admin-password"
        className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        Admin
      </label>
      <input
        id="admin-password"
        type="password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        placeholder="Password"
        className="min-h-10 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-teal-950"
      />
      <button
        type="submit"
        disabled={isAuthBusy}
        className="min-h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-teal-600 dark:hover:bg-teal-500 dark:disabled:bg-zinc-700"
      >
        {isAuthBusy ? "Logging in" : "Log in"}
      </button>
      {authMessage ? (
        <p className="text-sm text-red-700 dark:text-red-300">{authMessage}</p>
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
