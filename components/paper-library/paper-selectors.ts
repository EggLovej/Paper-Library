import { formatModelName } from "@/lib/model-names";

import { isActivePaper, isInboxPaper } from "./paper-ui";
import type {
  DirectoryItem,
  DirectorySort,
  Paper,
  PapersState,
  SavedProjectIdea,
  ViewMode,
} from "./types";

export function getViewTitle(viewMode: ViewMode) {
  const titles: Record<ViewMode, string> = {
    inbox: "Inbox",
    all: "All Papers",
    active: "Processing",
    failed: "Failed",
    reading_stack: "Reading Stack",
    toss_pile: "Toss Pile",
    authors: "Authors",
    models: "Models",
    projects: "Projects",
  };

  return titles[viewMode];
}

export function getResultSummary({
  viewMode,
  papersState,
  visiblePapersCount,
  visibleAuthorCount,
  visibleModelCount,
  visibleProjectCount,
}: {
  viewMode: ViewMode;
  papersState: PapersState;
  visiblePapersCount: number;
  visibleAuthorCount: number;
  visibleModelCount: number;
  visibleProjectCount: number;
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

  if (viewMode === "projects") {
    return `${visibleProjectCount} saved project${
      visibleProjectCount === 1 ? "" : "s"
    }`;
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

export function sortDirectoryItems(items: DirectoryItem[], sort: DirectorySort) {
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

export function buildAuthorItems(papers: Paper[]) {
  const items = new Map<string, DirectoryItem>();

  for (const paper of papers) {
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
}

export function buildModelItems(papers: Paper[]) {
  const items = new Map<string, DirectoryItem>();

  for (const paper of papers) {
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
}

export function filterDirectoryItems({
  items,
  searchQuery,
  sort,
}: {
  items: DirectoryItem[];
  searchQuery: string;
  sort: DirectorySort;
}) {
  const filteredItems = searchQuery
    ? items.filter((item) => item.name.toLowerCase().includes(searchQuery))
    : items;

  return sortDirectoryItems(filteredItems, sort);
}

export function filterProjects({
  projects,
  searchQuery,
}: {
  projects: SavedProjectIdea[];
  searchQuery: string;
}) {
  if (!searchQuery) {
    return projects;
  }

  return projects.filter((project) => {
    const searchableText = [
      project.idea_text,
      project.paper?.title,
      project.paper?.arxiv_id,
      ...(project.paper?.authors ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchQuery);
  });
}

export function filterPapers({
  authorFilter,
  modelFilter,
  papers,
  ratingFilter,
  searchQuery,
  viewMode,
}: {
  authorFilter: string | null;
  modelFilter: string | null;
  papers: Paper[];
  ratingFilter: string;
  searchQuery: string;
  viewMode: ViewMode;
}) {
  return papers.filter((paper) => {
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

    if (modelFilter && formatModelName(paper.processing_model) !== modelFilter) {
      return false;
    }

    if (searchQuery) {
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

      if (!searchableText.includes(searchQuery)) {
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
}
