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
  report_email_sent_at?: string | null;
  report_email_error?: string | null;
  created_at?: string | null;
  source?: string | null;
  source_paper_id?: string | null;
  latest_job?: PaperProcessingJob | null;
};

export type ActivitySummary = {
  lastQueueRunAt?: string | null;
  pendingJobs: number;
  processingJobs: number;
  failedJobs: number;
  failedIngests: number;
  emailErrors: number;
  reportsWaiting: number;
  openIssueCount: number;
};

export type ActivityIngestedMessage = {
  id: string;
  gmail_message_id: string;
  subject?: string | null;
  received_at?: string | null;
  status: string;
  paper_urls?: string[] | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityJob = PaperProcessingJob & {
  arxiv_id: string;
  paper?: Pick<
    Paper,
    | "id"
    | "title"
    | "arxiv_id"
    | "processing_status"
    | "processing_model"
  > & {
    report_email_sent_at?: string | null;
    report_email_error?: string | null;
  } | null;
};

export type ActivityEmailReport = Pick<
  Paper,
  "id" | "arxiv_id" | "title" | "processing_status" | "processing_model"
> & {
  report_email_sent_at?: string | null;
  report_email_error?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type ActivityAuditEvent = {
  id: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  resource_label?: string | null;
  resource_arxiv_id?: string | null;
  related_paper_id?: string | null;
  project_idea_text?: string | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};

export type ActivityData = {
  summary: ActivitySummary;
  ingestedMessages: ActivityIngestedMessage[];
  jobs: ActivityJob[];
  emailReports: ActivityEmailReport[];
  auditEvents: ActivityAuditEvent[];
};

export type ActivityState =
  | { status: "idle"; activity: null; message?: string }
  | { status: "loading"; activity: ActivityData | null; message?: string }
  | { status: "ready"; activity: ActivityData; message?: string }
  | { status: "error"; activity: ActivityData | null; message: string };

export type SavedProjectIdea = {
  id: string;
  paper_id: string;
  idea_text: string;
  status: string;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  paper?: Pick<
    Paper,
    | "id"
    | "arxiv_id"
    | "url"
    | "title"
    | "authors"
    | "rating"
    | "processing_status"
    | "created_at"
  > | null;
};

export type PaperProcessingJob = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
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
export type DirectoryItem = {
  name: string;
  count: number;
  averageScore: number;
  score: number;
  signalScore: number;
};
export type DirectoryLayout = "grid" | "list";
export type DirectorySort = "score" | "count" | "name";
export type PaperCounts = {
  all: number;
  inbox: number;
  active: number;
  failed: number;
  readingStack: number;
  tossPile: number;
  authors: number;
  models: number;
  projects: number;
  activity: number;
};
export type ViewMode =
  | "inbox"
  | "all"
  | "active"
  | "failed"
  | "reading_stack"
  | "toss_pile"
  | "authors"
  | "models"
  | "projects"
  | "activity";
export type RatingFilter = "any" | "unrated" | string;
