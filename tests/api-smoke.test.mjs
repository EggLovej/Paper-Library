import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import test from "node:test";

const READY_TIMEOUT_MS = 30_000;

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert(address && typeof address === "object");
  const { port } = address;

  server.close();
  await once(server, "close");

  return port;
}

async function waitForServer(baseUrl, child) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    assert.equal(child.exitCode, null, "Next dev server exited early");

    try {
      const response = await fetch(`${baseUrl}/api/auth/session`);

      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Next is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for the Next dev server.");
}

async function startTestServer() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ADMIN_PASSWORD: "test-password",
        ADMIN_SESSION_SECRET: "test-session-secret",
        APP_BASE_URL: baseUrl,
        EMAIL_INGEST_SECRET: "test-ingest-secret",
        NEXT_PUBLIC_SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n\nServer output:\n${output}`);
  }

  return {
    baseUrl,
    async close() {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");

      try {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
      } finally {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
    },
  };
}

test("API routes enforce auth boundaries and return JSON", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const sessionResponse = await fetch(`${server.baseUrl}/api/auth/session`);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), { isAdmin: false });

  const unauthenticatedPost = await fetch(`${server.baseUrl}/api/papers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: server.baseUrl,
    },
    body: JSON.stringify({ url: "https://arxiv.org/abs/2401.00001" }),
  });
  assert.equal(unauthenticatedPost.status, 401);
  assert.match((await unauthenticatedPost.json()).error, /Admin login required/i);

  const unauthenticatedActivity = await fetch(`${server.baseUrl}/api/activity`);
  assert.equal(unauthenticatedActivity.status, 401);

  const badLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: JSON.stringify({ password: "test-password" }),
  });
  assert.equal(badLogin.status, 403);
  assert.match((await badLogin.json()).error, /Untrusted request origin/i);

  const loginResponse = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: server.baseUrl,
    },
    body: JSON.stringify({ password: "test-password" }),
  });
  assert.equal(loginResponse.status, 200);
  assert.equal((await loginResponse.json()).isAdmin, true);

  const cookie = loginResponse.headers.get("set-cookie");
  assert(cookie, "login should set an admin cookie");

  const authenticatedSession = await fetch(`${server.baseUrl}/api/auth/session`, {
    headers: { Cookie: cookie },
  });
  assert.deepEqual(await authenticatedSession.json(), { isAdmin: true });

  const authenticatedActivity = await fetch(`${server.baseUrl}/api/activity`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authenticatedActivity.status, 500);
  assert.match(
    (await authenticatedActivity.json()).error,
    /Supabase is not configured/i,
  );

  const resendReport = await fetch(
    `${server.baseUrl}/api/papers/test-paper/report-email/resend`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: server.baseUrl,
      },
    },
  );
  assert.equal(resendReport.status, 500);
  assert.match((await resendReport.json()).error, /Supabase is not configured/i);
});

test("configured API routes fail clearly when Supabase is missing", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const papersResponse = await fetch(`${server.baseUrl}/api/papers`);
  assert.equal(papersResponse.status, 500);
  assert.match((await papersResponse.json()).error, /Supabase is not configured/i);

  const projectsResponse = await fetch(`${server.baseUrl}/api/projects`);
  assert.equal(projectsResponse.status, 500);
  assert.match(
    (await projectsResponse.json()).error,
    /Supabase is not configured/i,
  );

  const unauthenticatedProjectPost = await fetch(`${server.baseUrl}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: server.baseUrl,
    },
    body: JSON.stringify({ paperId: "paper-id", ideaText: "Build something" }),
  });
  assert.equal(unauthenticatedProjectPost.status, 401);

  const ingestUnauthorized = await fetch(
    `${server.baseUrl}/api/ingest/scholar-email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: "test", body: "empty" }),
    },
  );
  assert.equal(ingestUnauthorized.status, 401);

  const ingestMissingSupabase = await fetch(
    `${server.baseUrl}/api/ingest/scholar-email`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test-ingest-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId: "test", body: "empty" }),
    },
  );
  assert.equal(ingestMissingSupabase.status, 500);
  assert.match(
    (await ingestMissingSupabase.json()).error,
    /Supabase is not configured/i,
  );
});

test("signed email rating route records an email-link audit event", async () => {
  const routeSource = await readFile(
    "app/api/papers/[id]/rate/route.ts",
    "utf8",
  );

  assert.match(routeSource, /logAdminAuditEvent/);
  assert.match(routeSource, /action:\s*"paper_rating_updated"/);
  assert.match(routeSource, /resourceType:\s*"paper"/);
  assert.match(routeSource, /source:\s*"email_link"/);
});
