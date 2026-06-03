import type { SupabaseServerClient } from "@/lib/supabase/server";

import { getRequestIp, getRequestUserAgent } from "./request-metadata";

type AuditEvent = {
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

async function insertAuditEvent(
  supabase: SupabaseServerClient | null,
  event: AuditEvent,
  request?: Request,
) {
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }

  const { error } = await supabase.from("admin_audit_events").insert({
    action: event.action,
    resource_type: event.resourceType ?? null,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
    ip_address: request ? getRequestIp(request) : null,
    user_agent: request ? getRequestUserAgent(request) : null,
  });

  if (error) {
    console.error("Admin audit event could not be recorded", {
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      error: error.message,
    });

    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function logAdminAuditEvent(
  supabase: SupabaseServerClient | null,
  request: Request,
  event: AuditEvent,
) {
  return insertAuditEvent(supabase, event, request);
}

export async function logSystemAuditEvent(
  supabase: SupabaseServerClient | null,
  event: AuditEvent,
) {
  return insertAuditEvent(supabase, event);
}
