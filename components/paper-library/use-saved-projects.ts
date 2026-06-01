"use client";

import { useEffect, useState } from "react";

import type { SavedProjectIdea, SubmitState } from "./types";

export function useSavedProjects({
  isAdmin,
  setSubmitState,
}: {
  isAdmin: boolean;
  setSubmitState: (state: SubmitState) => void;
}) {
  const [savedProjects, setSavedProjects] = useState<SavedProjectIdea[]>([]);
  const [busyProjectIds, setBusyProjectIds] = useState<Set<string>>(new Set());
  const [busyProjectIdeaTexts, setBusyProjectIdeaTexts] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    let ignore = false;

    void fetch("/api/projects")
      .then(async (response) => {
        const result = (await response.json()) as {
          projects?: SavedProjectIdea[];
        };

        if (!ignore && response.ok) {
          setSavedProjects(result.projects ?? []);
        }
      })
      .catch(() => {
        // Project loading is non-critical; the paper list should still render.
      });

    return () => {
      ignore = true;
    };
  }, []);

  function setProjectBusy(projectId: string, isBusy: boolean) {
    setBusyProjectIds((current) => {
      const next = new Set(current);

      if (isBusy) {
        next.add(projectId);
      } else {
        next.delete(projectId);
      }

      return next;
    });
  }

  function setProjectIdeaBusy(ideaText: string, isBusy: boolean) {
    setBusyProjectIdeaTexts((current) => {
      const next = new Set(current);

      if (isBusy) {
        next.add(ideaText);
      } else {
        next.delete(ideaText);
      }

      return next;
    });
  }

  async function saveProjectIdea(paperId: string, ideaText: string) {
    if (!isAdmin) {
      return;
    }

    setProjectIdeaBusy(ideaText, true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paperId, ideaText }),
      });
      const result = (await response.json()) as {
        project?: SavedProjectIdea;
        error?: string;
      };

      if (!response.ok || !result.project) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The project idea could not be saved.",
        });
        return;
      }

      setSavedProjects((current) => {
        if (current.some((project) => project.id === result.project?.id)) {
          return current;
        }

        return [result.project, ...current].filter(
          (project): project is SavedProjectIdea => Boolean(project),
        );
      });
      setSubmitState({
        status: "success",
        message: "Project idea saved.",
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setProjectIdeaBusy(ideaText, false);
    }
  }

  async function deleteProjectIdea(projectId: string) {
    if (!isAdmin) {
      return;
    }

    setProjectBusy(projectId, true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setSubmitState({
          status: "error",
          message: result.error ?? "The saved project could not be deleted.",
        });
        return;
      }

      setSavedProjects((current) =>
        current.filter((project) => project.id !== projectId),
      );
    } catch {
      setSubmitState({
        status: "error",
        message: "Could not reach the backend. Please try again.",
      });
    } finally {
      setProjectBusy(projectId, false);
    }
  }

  return {
    busyProjectIds,
    busyProjectIdeaTexts,
    deleteProjectIdea,
    saveProjectIdea,
    savedProjects,
    setSavedProjects,
  };
}
