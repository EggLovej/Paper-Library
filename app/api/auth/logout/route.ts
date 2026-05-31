import {
  clearAdminCookie,
  forbiddenOriginResponse,
  isTrustedOriginRequest,
} from "@/lib/auth/admin";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedOriginRequest(request)) {
    return forbiddenOriginResponse();
  }

  await logAdminAuditEvent(createSupabaseServerClient(), request, {
    action: "admin_logout",
  });

  return Response.json(
    { isAdmin: false },
    {
      headers: {
        "Set-Cookie": clearAdminCookie(),
      },
    },
  );
}
