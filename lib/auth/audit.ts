import type { SupabaseServerClient } from "@/lib/supabase/server";

import { getRequestIp, getRequestUserAgent } from "./request-metadata";

type AuditEvent = {
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

export async function logAdminAuditEvent(
  supabase: SupabaseServerClient | null,
  request: Request,
  event: AuditEvent,
) {
  if (!supabase) {
    return;
  }

  await supabase.from("admin_audit_events").insert({
    action: event.action,
    resource_type: event.resourceType ?? null,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
    ip_address: getRequestIp(request),
    user_agent: getRequestUserAgent(request),
  });
}
