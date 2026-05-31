export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type ProcessState =
  | { status: "idle" }
  | { status: "running"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type Paper = {
  id: string;
  arxiv_id: string;
  url: string;
  title?: string | null;
  authors?: string[] | null;
  abstract?: string | null;
  summary_overview?: string | null;
  summary_overview_easy?: string | null;
  summary_overview_caveman?: string | null;
  summary_contributions?: string | null;
  summary_contributions_easy?: string | null;
  summary_contributions_caveman?: string | null;
  summary_prior_work_delta?: string | null;
  summary_prior_work_delta_easy?: string | null;
  summary_prior_work_delta_caveman?: string | null;
  summary_project_ideas?: string[] | null;
  rating?: string | null;
  processing_status?: string | null;
  processing_error?: string | null;
  processing_model?: string | null;
  created_at?: string | null;
  source?: string | null;
  source_paper_id?: string | null;
  latest_job?: PaperProcessingJob | null;
};

export type PaperProcessingJob = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after?: string | null;
  locked_at?: string | null;
  completed_at?: string | null;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PapersState =
  | { status: "loading"; papers: Paper[]; message?: string }
  | { status: "ready"; papers: Paper[]; message?: string }
  | { status: "error"; papers: Paper[]; message: string };

export type ComplexityMode = "normal" | "easy" | "caveman";
export type ViewMode = "inbox" | "all" | "active" | "failed";
export type RatingFilter = "any" | "unrated" | string;
