import type { ProcessState } from "./types";

export function ProcessStatus({ state }: { state: ProcessState }) {
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
