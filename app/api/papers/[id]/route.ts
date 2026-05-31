import { isPaperRating } from "@/lib/paper-ratings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RatingRequestBody = {
  rating?: unknown;
};

function missingSupabaseResponse() {
  return Response.json(
    {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
    },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/papers/[id]">,
) {
  const { id } = await context.params;
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return missingSupabaseResponse();
  }

  let body: RatingRequestBody;

  try {
    body = (await request.json()) as RatingRequestBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
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

  return Response.json({ paper: data });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/papers/[id]">,
) {
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

  return Response.json({ status: "deleted", paperId: id });
}
