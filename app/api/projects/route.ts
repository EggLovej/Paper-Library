import {
  getNonEmptyString,
  invalidJsonResponse,
  missingSupabaseResponse,
} from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { requireAdminRequest } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ProjectRequestBody = {
  paperId?: unknown;
  ideaText?: unknown;
};

type SavedProjectIdeaRow = {
  id: string;
  paper_id: string;
  idea_text: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  paper?: unknown;
};

const PROJECT_COLUMNS = `
  id,
  paper_id,
  idea_text,
  status,
  notes,
  created_at,
  updated_at,
  paper:papers (
    id,
    arxiv_id,
    url,
    title,
    authors,
    rating,
    processing_status,
    created_at
  )
`;

export async function GET() {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  const { data, error } = await supabase
    .from("saved_project_ideas")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false })
    .returns<SavedProjectIdeaRow[]>();

  if (error) {
    return Response.json(
      {
        error: "The saved projects could not be loaded.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  return Response.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  let body: ProjectRequestBody;

  try {
    body = (await request.json()) as ProjectRequestBody;
  } catch {
    return invalidJsonResponse();
  }

  const paperId = getNonEmptyString(body.paperId);
  const ideaText = getNonEmptyString(body.ideaText);

  if (!paperId || !ideaText) {
    return Response.json(
      { error: "Please provide paperId and ideaText." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("saved_project_ideas")
    .insert({
      paper_id: paperId,
      idea_text: ideaText,
      status: "saved",
    })
    .select(PROJECT_COLUMNS)
    .single<SavedProjectIdeaRow>();

  if (error) {
    if (error.code === "23505") {
      const { data: existingProject, error: existingError } = await supabase
        .from("saved_project_ideas")
        .select(PROJECT_COLUMNS)
        .eq("paper_id", paperId)
        .eq("idea_text", ideaText)
        .maybeSingle<SavedProjectIdeaRow>();

      if (existingError) {
        return Response.json(
          {
            error: "The saved project could not be loaded.",
            details: existingError.message,
          },
          { status: 500 },
        );
      }

      return Response.json({
        status: "already_saved",
        project: existingProject,
      });
    }

    return Response.json(
      {
        error: "The project idea could not be saved.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  await logAdminAuditEvent(supabase, request, {
    action: "project_idea_saved",
    resourceType: "saved_project_idea",
    resourceId: data.id,
    metadata: {
      paperId,
    },
  });

  return Response.json(
    {
      status: "saved",
      project: data,
    },
    { status: 201 },
  );
}
