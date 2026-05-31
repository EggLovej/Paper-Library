import type { SupabaseServerClient } from "@/lib/supabase/server";

const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_ATTEMPTS = 5;

type LoginAttemptRow = {
  id: string;
};

export async function isLoginRateLimited(
  supabase: SupabaseServerClient | null,
  identifier: string,
) {
  if (!supabase) {
    return false;
  }

  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("admin_login_attempts")
    .select("id")
    .eq("identifier", identifier)
    .eq("success", false)
    .gte("created_at", windowStart)
    .returns<LoginAttemptRow[]>();

  if (error) {
    return false;
  }

  return (data?.length ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt({
  supabase,
  identifier,
  success,
}: {
  supabase: SupabaseServerClient | null;
  identifier: string;
  success: boolean;
}) {
  if (!supabase) {
    return;
  }

  await supabase.from("admin_login_attempts").insert({
    identifier,
    success,
  });
}
