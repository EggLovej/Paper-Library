import { isPaperRating } from "@/lib/paper-ratings";
import { invalidJsonResponse, missingSupabaseResponse } from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { requireAdminRequest } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RatingRequestBody = {
  rating?: unknown;
};

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/papers/[id]">,
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

  let body: RatingRequestBody;

  try {
    body = (await request.json()) as RatingRequestBody;
  } catch {
    return invalidJsonResponse();
  }

  if (
    body.rating !== null &&
    body.rating !== undefined &&
    !isPaperRating(body.rating)
  ) {
    return Response.json(
      { error: "Please provide a valid rating." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("papers")
    .update({
      rating: body.rating ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "The paper could not be updated.", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  await logAdminAuditEvent(supabase, request, {
    action: "paper_rating_updated",
    resourceType: "paper",
    resourceId: id,
    metadata: { rating: body.rating ?? null },
  });

  return Response.json({ paper: data });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/papers/[id]">,
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
    .from("papers")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "The paper could not be deleted.", details: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return Response.json({ error: "Paper not found." }, { status: 404 });
  }

  await logAdminAuditEvent(supabase, request, {
    action: "paper_deleted",
    resourceType: "paper",
    resourceId: id,
  });

  return Response.json({ status: "deleted", paperId: id });
}
