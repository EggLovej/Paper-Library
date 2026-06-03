import { missingSupabaseResponse } from "@/lib/api/responses";
import { isAdminRequest, unauthorizedResponse } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IngestedMessageRow = {
  id: string;
  gmail_message_id: string;
  thread_id: string | null;
  subject: string | null;
  received_at: string | null;
  status: string;
  paper_urls: string[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityJobRow = {
  id: string;
  paper_id: string;
  arxiv_id: string;
  status: string;
  attempts: number;
  run_after: string | null;
  locked_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  paper?: {
    id: string;
    title: string | null;
    arxiv_id: string;
    processing_status: string | null;
    processing_model: string | null;
    report_email_sent_at: string | null;
    report_email_error: string | null;
  } | null;
};

type EmailReportRow = {
  id: string;
  arxiv_id: string;
  title: string | null;
  processing_status: string | null;
  processing_model: string | null;
  report_email_sent_at: string | null;
  report_email_error: string | null;
  created_at: string;
  updated_at: string | null;
};

type AuditEventRow = {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type AuditResourcePaperRow = {
  id: string;
  arxiv_id: string;
  title: string | null;
};

type AuditSavedProjectIdeaRow = {
  id: string;
  paper_id: string;
  idea_text: string;
  paper?:
    | {
        id: string;
        arxiv_id: string;
        title: string | null;
      }
    | Array<{
        id: string;
        arxiv_id: string;
        title: string | null;
      }>
    | null;
};

const INGEST_COLUMNS =
  "id, gmail_message_id, thread_id, subject, received_at, status, paper_urls, error, created_at, updated_at";

const JOB_COLUMNS = `
  id,
  paper_id,
  arxiv_id,
  status,
  attempts,
  run_after,
  locked_at,
  completed_at,
  last_error,
  created_at,
  updated_at,
  paper:papers (
    id,
    title,
    arxiv_id,
    processing_status,
    processing_model,
    report_email_sent_at,
    report_email_error
  )
`;

const REPORT_COLUMNS =
  "id, arxiv_id, title, processing_status, processing_model, report_email_sent_at, report_email_error, created_at, updated_at";

const AUDIT_COLUMNS =
  "id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return unauthorizedResponse();
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  const [
    ingestsResult,
    jobsResult,
    reportsResult,
    auditResult,
    queueRunResult,
  ] = await Promise.all([
    supabase
      .from("gmail_ingested_messages")
      .select(INGEST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<IngestedMessageRow[]>(),
    supabase
      .from("paper_processing_jobs")
      .select(JOB_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<ActivityJobRow[]>(),
    supabase
      .from("papers")
      .select(REPORT_COLUMNS)
      .in("processing_status", ["completed", "failed"])
      .order("updated_at", { ascending: false })
      .limit(30)
      .returns<EmailReportRow[]>(),
    supabase
      .from("admin_audit_events")
      .select(AUDIT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<AuditEventRow[]>(),
    supabase
      .from("admin_audit_events")
      .select("created_at")
      .eq("action", "processing_queue_run")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
  ]);

  const error =
    ingestsResult.error ??
    jobsResult.error ??
    reportsResult.error ??
    auditResult.error ??
    queueRunResult.error;

  if (error) {
    return Response.json(
      {
        error: "Activity data could not be loaded.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  const ingestedMessages = ingestsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const emailReports = reportsResult.data ?? [];
  const auditEvents = auditResult.data ?? [];
  const directAuditPaperIds = [
    ...new Set(
      auditEvents
        .filter(
          (event) => event.resource_type === "paper" && event.resource_id,
        )
        .map((event) => normalizeUuid(event.resource_id as string)),
    ),
  ];
  const savedProjectIdeaIds = [
    ...new Set(
      auditEvents
        .filter(
          (event) =>
            event.resource_type === "saved_project_idea" && event.resource_id,
        )
        .map((event) => normalizeUuid(event.resource_id as string)),
    ),
  ];
  const metadataPaperIds = [
    ...new Set(
      auditEvents
        .map((event) => getMetadataString(event.metadata, "paperId"))
        .filter((value): value is string => Boolean(value))
        .map(normalizeUuid),
    ),
  ];
  const auditPaperById = new Map<string, AuditResourcePaperRow>();
  const savedProjectById = new Map<string, AuditSavedProjectIdeaRow>();

  if (savedProjectIdeaIds.length > 0) {
    const { data: savedProjects, error: savedProjectsError } = await supabase
      .from("saved_project_ideas")
      .select(
        `
          id,
          paper_id,
          idea_text,
          paper:papers (
            id,
            arxiv_id,
            title
          )
        `,
      )
      .in("id", savedProjectIdeaIds)
      .returns<AuditSavedProjectIdeaRow[]>();

    if (savedProjectsError) {
      return Response.json(
        {
          error: "Activity data could not be loaded.",
          details: savedProjectsError.message,
        },
        { status: 500 },
      );
    }

    for (const project of savedProjects ?? []) {
      savedProjectById.set(normalizeUuid(project.id), project);
    }
  }

  const projectPaperIds = [...savedProjectById.values()].map((project) =>
    normalizeUuid(project.paper_id),
  );
  const auditPaperIds = [
    ...new Set([...directAuditPaperIds, ...metadataPaperIds, ...projectPaperIds]),
  ];

  if (auditPaperIds.length > 0) {
    const { data: auditPapers, error: auditPapersError } = await supabase
      .from("papers")
      .select("id, arxiv_id, title")
      .in("id", auditPaperIds)
      .returns<AuditResourcePaperRow[]>();

    if (auditPapersError) {
      return Response.json(
        {
          error: "Activity data could not be loaded.",
          details: auditPapersError.message,
        },
        { status: 500 },
      );
    }

    for (const paper of auditPapers ?? []) {
      auditPaperById.set(normalizeUuid(paper.id), paper);
    }
  }

  const failedIngests = ingestedMessages.filter(
    (message) => message.status === "failed",
  ).length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const emailErrors = emailReports.filter(
    (report) => report.report_email_error,
  ).length;
  const reportsWaiting = emailReports.filter(
    (report) =>
      report.processing_status === "completed" &&
      !report.report_email_sent_at &&
      !report.report_email_error,
  ).length;

  return Response.json({
    summary: {
      lastQueueRunAt: queueRunResult.data?.created_at ?? null,
      pendingJobs: jobs.filter((job) => job.status === "pending").length,
      processingJobs: jobs.filter((job) => job.status === "processing").length,
      failedJobs,
      failedIngests,
      emailErrors,
      reportsWaiting,
      openIssueCount: failedIngests + failedJobs + emailErrors + reportsWaiting,
    },
    ingestedMessages,
    jobs,
    emailReports,
    auditEvents: auditEvents.map((event) => {
      const paper =
        event.resource_type === "paper" && event.resource_id
          ? auditPaperById.get(normalizeUuid(event.resource_id))
          : null;
      const savedProject =
        event.resource_type === "saved_project_idea" && event.resource_id
          ? savedProjectById.get(normalizeUuid(event.resource_id))
          : null;
      const savedProjectPaper = getSavedProjectPaper(savedProject);
      const metadataPaperId = getMetadataString(event.metadata, "paperId");
      const metadataPaperTitle = getMetadataString(event.metadata, "paperTitle");
      const metadataArxivId = getMetadataString(event.metadata, "arxivId");
      const metadataIdeaText = getMetadataString(event.metadata, "ideaText");
      const metadataPaper = metadataPaperId
        ? auditPaperById.get(normalizeUuid(metadataPaperId))
        : null;
      const resolvedPaper = paper ?? savedProjectPaper ?? metadataPaper ?? null;

      return {
        ...event,
        resource_label: resolvedPaper?.title ?? metadataPaperTitle ?? null,
        resource_arxiv_id: resolvedPaper?.arxiv_id ?? metadataArxivId ?? null,
        related_paper_id:
          resolvedPaper?.id ??
          metadataPaperId ??
          (event.resource_type === "paper" ? event.resource_id : null),
        project_idea_text: savedProject?.idea_text ?? metadataIdeaText ?? null,
      };
    }),
  });
}

function normalizeUuid(value: string) {
  return value.trim().toLowerCase();
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : null;
}

function getSavedProjectPaper(project?: AuditSavedProjectIdeaRow | null) {
  if (!project?.paper) {
    return null;
  }

  if (Array.isArray(project.paper)) {
    return project.paper[0] ?? null;
  }

  return project.paper;
}
