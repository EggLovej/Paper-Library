import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE_NAME = "paper_library_admin";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type AdminSessionPayload = {
  sub: "admin";
  exp: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.AUTH_SECRET ?? null;
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? null;
}

export function createAdminSessionToken() {
  const secret = getAdminSessionSecret();

  if (!secret) {
    throw new Error("Admin auth is not configured. Add ADMIN_SESSION_SECRET.");
  }

  const payload: AdminSessionPayload = {
    sub: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyAdminSessionToken(token: string | null | undefined) {
  const secret = getAdminSessionSecret();

  if (!secret || !token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<
      AdminSessionPayload
    >;

    return (
      payload.sub === "admin" &&
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export function getAdminCookieValue(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((value) =>
    value.startsWith(`${ADMIN_COOKIE_NAME}=`),
  );

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(ADMIN_COOKIE_NAME.length + 1));
}

export function isAdminRequest(request: Request) {
  return verifyAdminSessionToken(getAdminCookieValue(request));
}

export function unauthorizedResponse() {
  return Response.json({ error: "Admin login required." }, { status: 401 });
}

export function createAdminCookie(token: string) {
  return [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function clearAdminCookie() {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function isValidAdminPassword(password: string) {
  const configuredPassword = getAdminPassword();

  if (!configuredPassword) {
    throw new Error("Admin auth is not configured. Add ADMIN_PASSWORD.");
  }

  return safeEqual(password, configuredPassword);
}
