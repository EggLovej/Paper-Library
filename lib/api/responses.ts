export function missingSupabaseResponse() {
  return Response.json(
    {
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and a server-only Supabase key to .env.local.",
    },
    { status: 500 },
  );
}

export function invalidJsonResponse() {
  return Response.json(
    { error: "Request body must be valid JSON." },
    { status: 400 },
  );
}

export function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
