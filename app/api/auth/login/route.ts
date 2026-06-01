import {
  createAdminCookie,
  createAdminSessionToken,
  forbiddenOriginResponse,
  isTrustedOriginRequest,
  isValidAdminPassword,
} from "@/lib/auth/admin";
import { invalidJsonResponse } from "@/lib/api/responses";
import { logAdminAuditEvent } from "@/lib/auth/audit";
import {
  isLoginRateLimited,
  recordLoginAttempt,
} from "@/lib/auth/login-rate-limit";
import { getRequestIdentifier } from "@/lib/auth/request-metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LoginRequestBody = {
  password?: unknown;
};

export async function POST(request: Request) {
  if (!isTrustedOriginRequest(request)) {
    return forbiddenOriginResponse();
  }

  const supabase = createSupabaseServerClient();
  const identifier = getRequestIdentifier(request);

  if (await isLoginRateLimited(supabase, identifier)) {
    await logAdminAuditEvent(supabase, request, {
      action: "admin_login_rate_limited",
      metadata: { identifier },
    });

    return Response.json(
      { error: "Too many failed login attempts. Try again later." },
      { status: 429 },
    );
  }

  let body: LoginRequestBody;

  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return invalidJsonResponse();
  }

  if (typeof body.password !== "string" || body.password.length === 0) {
    return Response.json({ error: "Password is required." }, { status: 400 });
  }

  try {
    if (!isValidAdminPassword(body.password)) {
      await recordLoginAttempt({ supabase, identifier, success: false });
      await logAdminAuditEvent(supabase, request, {
        action: "admin_login_failed",
        metadata: { identifier },
      });

      return Response.json({ error: "Invalid password." }, { status: 401 });
    }

    await recordLoginAttempt({ supabase, identifier, success: true });
    await logAdminAuditEvent(supabase, request, {
      action: "admin_login_succeeded",
      metadata: { identifier },
    });

    return Response.json(
      { isAdmin: true },
      {
        headers: {
          "Set-Cookie": createAdminCookie(createAdminSessionToken()),
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Admin auth is not configured.",
      },
      { status: 500 },
    );
  }
}
