import type { FormEvent } from "react";

export function AdminPanel({
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
