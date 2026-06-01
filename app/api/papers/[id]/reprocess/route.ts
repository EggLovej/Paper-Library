import { missingSupabaseResponse } from "@/lib/api/responses";
import { requireAdminRequest } from "@/lib/auth/admin";
import { queuePaperForProcessing } from "@/lib/papers/queue-paper-processing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/papers/[id]/reprocess">,
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

  return queuePaperForProcessing({
    mode: "reprocess",
    paperId: id,
    request,
    supabase,
  });
}
