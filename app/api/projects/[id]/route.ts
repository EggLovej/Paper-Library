import { missingSupabaseResponse } from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { requireAdminRequest } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  const unauthorized = requireAdminRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  const { data, error } = await supabase
    .from("saved_project_ideas")
    .delete()
    .eq("id", id)
    .select("id, paper_id")
    .maybeSingle<{ id: string; paper_id: string }>();

  if (error) {
    return Response.json(
      {
        error: "The saved project could not be deleted.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ error: "Saved project not found." }, { status: 404 });
  }

  await logAdminAuditEvent(supabase, request, {
    action: "project_idea_deleted",
    resourceType: "saved_project_idea",
    resourceId: id,
    metadata: {
      paperId: data.paper_id,
    },
  });

  return Response.json({ status: "deleted", projectId: id });
}
