"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActivityData, ActivityState } from "./types";

export function useActivity({ enabled }: { enabled: boolean }) {
  const [activityState, setActivityState] = useState<ActivityState>({
    status: "idle",
    activity: null,
  });

  const loadActivity = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setActivityState((current) => ({
      status: "loading",
      activity: current.activity,
    }));

    try {
      const response = await fetch("/api/activity");
      const result = (await response.json().catch(() => ({}))) as
        | ActivityData
        | { error?: string };

      if (!response.ok || !isActivityData(result)) {
        setActivityState({
          status: "error",
          activity: null,
          message:
            "error" in result && result.error
              ? result.error
              : "Activity could not be loaded.",
        });
        return;
      }

      setActivityState({
        status: "ready",
        activity: result,
      });
    } catch {
      setActivityState({
        status: "error",
        activity: null,
        message: "Could not reach the activity endpoint.",
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadActivity();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [enabled, loadActivity]);

  return {
    activityState,
    loadActivity,
  };
}

function isActivityData(value: unknown): value is ActivityData {
  return (
    typeof value === "object" &&
    value !== null &&
    "summary" in value &&
    "ingestedMessages" in value &&
    "jobs" in value &&
    "emailReports" in value &&
    "auditEvents" in value
  );
}
