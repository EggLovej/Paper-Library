import { formatDate } from "./paper-ui";
import type { SavedProjectIdea } from "./types";

export function SavedProjectsView({
  isAdmin,
  projects,
  busyProjectIds,
  onOpenPaper,
  onDeleteProject,
}: {
  isAdmin: boolean;
  projects: SavedProjectIdea[];
  busyProjectIds: Set<string>;
  onOpenPaper: (paperId: string) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  if (!projects.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--desk-border)] bg-[var(--desk-surface)] px-4 py-10 text-center text-sm text-[var(--desk-muted)]">
        No saved projects yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {projects.map((project) => {
        const title = getProjectPaperTitle(project);
        const isBusy = busyProjectIds.has(project.id);

        return (
          <article
            key={project.id}
            className="flex min-h-56 flex-col justify-between rounded-lg border border-[var(--desk-border)] bg-[var(--desk-surface)] p-5 shadow-sm"
          >
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--desk-muted)]">
                <span className="rounded-full bg-[var(--desk-surface-2)] px-2.5 py-1 font-medium ring-1 ring-inset ring-[var(--desk-border)]">
                  {formatDate(project.created_at)}
                </span>
                {project.paper?.arxiv_id ? (
                  <span className="rounded-full bg-[var(--desk-surface-2)] px-2.5 py-1 font-medium ring-1 ring-inset ring-[var(--desk-border)]">
                    {project.paper.arxiv_id}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-base leading-7 text-[var(--desk-ink)]">
                {project.idea_text}
              </p>
            </div>

            <div className="mt-5 border-t border-[var(--desk-border)] pt-4">
              <p className="line-clamp-2 font-serif text-lg font-semibold leading-6 text-[var(--desk-ink)]">
                {title}
              </p>
              <p className="mt-1 line-clamp-1 text-sm text-[var(--desk-muted)]">
                {project.paper?.authors?.length
                  ? project.paper.authors.join(", ")
                  : "Source paper"}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {project.paper_id ? (
                  <button
                    type="button"
                    onClick={() => onOpenPaper(project.paper_id)}
                    className="min-h-9 rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface-2)] px-3 text-sm font-medium text-[var(--desk-accent)] transition hover:bg-[var(--desk-surface)]"
                  >
                    Open paper
                  </button>
                ) : null}
                {project.paper?.url ? (
                  <a
                    href={project.paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center rounded-md border border-[var(--desk-border)] bg-[var(--desk-surface)] px-3 text-sm font-medium text-[var(--desk-ink)] transition hover:bg-[var(--desk-surface-2)]"
                  >
                    arXiv
                  </a>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onDeleteProject(project.id)}
                    className="min-h-9 rounded-md border border-red-200 bg-transparent px-3 text-sm font-medium text-[var(--desk-danger)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    {isBusy ? "Removing" : "Remove"}
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function getProjectPaperTitle(project: SavedProjectIdea) {
  return project.paper?.title || `arXiv ${project.paper?.arxiv_id ?? project.paper_id}`;
}
