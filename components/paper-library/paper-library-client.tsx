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
      className={`paper-app min-h-screen px-6 py-10 transition-colors ${
        isDarkMode
          ? "dark bg-[var(--desk-bg)] text-[var(--desk-ink)]"
          : "bg-[var(--desk-bg)] text-[var(--desk-ink)]"
      } ${isThemeChanging ? "theme-changing" : ""}`}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--desk-accent)]">
              Personal research desk
            </p>
            <h1 className="font-serif text-5xl font-semibold tracking-tight">
              ArXiv Sieve
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[var(--desk-muted)]">
              Triage papers, extract summaries, and keep only what matters
              before your reading stack gets out of hand.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
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
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDarkMode ? "Light mode" : "Dark mode"}
            >
              {isDarkMode ? "☀" : "☾"}
            </button>
          </div>
        </header>

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
                {submitState.status === "submitting" ? "Adding" : "Add paper"}
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
                {viewMode === "inbox" ? "Priority pile" : "Paper stack"}
              </h2>
              <p className="text-sm text-[var(--desk-muted)]">
                {papersState.papers.length > 0 ||
                papersState.status !== "loading"
                  ? `${visiblePapers.length} shown of ${papersState.papers.length}`
                  : "Loading papers"}
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "inbox", label: "Priority", count: paperCounts.inbox },
                  { value: "all", label: "All papers", count: paperCounts.all },
                  {
                    value: "active",
                    label: "Reading",
                    count: paperCounts.active,
                  },
                  {
                    value: "failed",
                    label: "Needs retry",
                    count: paperCounts.failed,
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setViewMode(option.value as ViewMode)}
                    className={`min-h-10 rounded-md border px-3 text-sm font-medium transition ${
                      viewMode === option.value
                        ? "border-[var(--desk-accent)] bg-[var(--desk-surface)] text-[var(--desk-accent)]"
                        : "border-[var(--desk-border)] bg-[var(--desk-surface)] text-[var(--desk-ink)] hover:bg-[var(--desk-surface-2)]"
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
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--desk-muted)]">
                  Verdict
                  <select
                    value={ratingFilter}
                    onChange={(event) =>
                      setRatingFilter(event.target.value as RatingFilter)
                    }
                    className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm text-[var(--desk-ink)] outline-none transition focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
                  >
                    <option value="any">Any verdict</option>
                    <option value="unrated">No verdict</option>
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
                    className="min-h-10 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
                  >
                    Clear
                  </button>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={processState.status === "running"}
                    onClick={() =>
                      void runProcessingQueue({ limit: 2, silent: false })
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
      className="flex max-w-md flex-col gap-2 rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-3 shadow-sm"
    >
      <label
        htmlFor="admin-password"
        className="text-xs font-semibold uppercase tracking-wide text-[var(--desk-muted)]"
      >
        For CRUD operations
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Super secret passphrase"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-[var(--desk-border)] bg-[var(--desk-bg)] px-3 text-sm text-[var(--desk-ink)] outline-none transition placeholder:text-[var(--desk-muted)] focus:border-[var(--desk-accent)] focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950"
        />
        <button
          type="submit"
          disabled={isAuthBusy}
          className="min-h-10 rounded-md bg-[var(--desk-accent)] px-4 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
