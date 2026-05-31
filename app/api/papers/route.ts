import { submitPaperUrl } from "@/lib/papers/submit-paper";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type PaperRequestBody = {
  url?: unknown;
};

type PaperRow = {
  id: string;
  [key: string]: unknown;
};

type PaperProcessingJobRow = {
  id: string;
  paper_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string | null;
  locked_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
      },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("papers")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<PaperRow[]>();

  if (error) {
    return Response.json(
      {
        error: "The papers could not be loaded.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  const papers = data ?? [];
  const paperIds = papers.map((paper) => paper.id);
  const latestJobByPaperId = new Map<string, PaperProcessingJobRow>();

  if (paperIds.length > 0) {
    const { data: jobs, error: jobsError } = await supabase
      .from("paper_processing_jobs")
      .select(
        "id, paper_id, status, attempts, max_attempts, run_after, locked_at, completed_at, last_error, created_at, updated_at",
      )
      .in("paper_id", paperIds)
      .order("created_at", { ascending: false })
      .returns<PaperProcessingJobRow[]>();

    if (jobsError) {
      return Response.json(
        {
          error: "The papers could not be loaded.",
          details: jobsError.message,
        },
        { status: 500 },
      );
    }

    for (const job of jobs ?? []) {
      if (!latestJobByPaperId.has(job.paper_id)) {
        latestJobByPaperId.set(job.paper_id, job);
      }
    }
  }

  return Response.json({
    papers: papers.map((paper) => ({
      ...paper,
      latest_job: latestJobByPaperId.get(paper.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  let body: PaperRequestBody;

  try {
    body = (await request.json()) as PaperRequestBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    return Response.json(
      { error: "Please provide an arXiv or Scholar Inbox URL." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
      },
      { status: 500 },
    );
  }

  try {
    const result = await submitPaperUrl(supabase, body.url.trim());

    if (result.status === "invalid_url") {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(
      {
        status: result.status,
        paperId: result.paperId,
        arxivId: result.arxivId,
        processingStatus: result.processingStatus,
        jobId: result.jobId,
        url: result.url,
      },
      { status: result.status === "accepted" ? 202 : 200 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The paper could not be saved.",
      },
      { status: 500 },
    );
  }
}
