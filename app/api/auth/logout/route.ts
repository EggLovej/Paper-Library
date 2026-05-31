import { clearAdminCookie } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { isAdmin: false },
    {
      headers: {
        "Set-Cookie": clearAdminCookie(),
      },
    },
  );
}
