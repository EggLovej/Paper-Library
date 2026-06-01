import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
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
});

test("configured API routes fail clearly when Supabase is missing", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const papersResponse = await fetch(`${server.baseUrl}/api/papers`);
  assert.equal(papersResponse.status, 500);
  assert.match((await papersResponse.json()).error, /Supabase is not configured/i);

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
