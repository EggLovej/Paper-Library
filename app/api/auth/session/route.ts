import { isAdminRequest } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return Response.json({ isAdmin: isAdminRequest(request) });
}
