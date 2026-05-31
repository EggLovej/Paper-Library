import {
  createAdminCookie,
  createAdminSessionToken,
  isValidAdminPassword,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

type LoginRequestBody = {
  password?: unknown;
};

export async function POST(request: Request) {
  let body: LoginRequestBody;

  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.password !== "string" || body.password.length === 0) {
    return Response.json({ error: "Password is required." }, { status: 400 });
  }

  try {
    if (!isValidAdminPassword(body.password)) {
      return Response.json({ error: "Invalid password." }, { status: 401 });
    }

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
