type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailMessagePart & {
    headers?: Array<{ name: string; value: string }>;
  };
};

function getGmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    userId: process.env.GMAIL_USER_ID ?? "me",
  };
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return Buffer.from(padded, "base64").toString("utf8");
}

function collectBodyParts(part: GmailMessagePart | undefined, bodies: string[]) {
  if (!part) {
    return;
  }

  if (
    (part.mimeType === "text/html" || part.mimeType === "text/plain") &&
    part.body?.data
  ) {
    bodies.push(decodeBase64Url(part.body.data));
  }

  for (const child of part.parts ?? []) {
    collectBodyParts(child, bodies);
  }
}

export function getGmailHeader(message: GmailMessage, headerName: string) {
  const header = message.payload?.headers?.find(
    (candidate) => candidate.name.toLowerCase() === headerName.toLowerCase(),
  );

  return header?.value ?? null;
}

export function getGmailMessageBody(message: GmailMessage) {
  const bodies: string[] = [];
  collectBodyParts(message.payload, bodies);
  return bodies.join("\n\n");
}

export function getGmailReceivedAt(message: GmailMessage) {
  if (!message.internalDate) {
    return null;
  }

  const timestamp = Number(message.internalDate);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

export async function getGmailAccessToken() {
  const config = getGmailConfig();

  if (!config) {
    throw new Error(
      "Gmail is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description ??
        body.error ??
        `Gmail token request failed with ${response.status}.`,
    );
  }

  return {
    accessToken: body.access_token,
    userId: config.userId,
  };
}

export async function listScholarInboxMessages({
  accessToken,
  userId,
  maxResults = 10,
}: {
  accessToken: string;
  userId: string;
  maxResults?: number;
}) {
  const query =
    process.env.GMAIL_SCHOLAR_QUERY ??
    "from:noreply@cvlibs.net newer_than:30d";
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      userId,
    )}/messages`,
  );

  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as GmailListResponse & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      body.error?.message ?? `Gmail message search failed with ${response.status}.`,
    );
  }

  return body.messages ?? [];
}

export async function getGmailMessage({
  accessToken,
  userId,
  messageId,
}: {
  accessToken: string;
  userId: string;
  messageId: string;
}) {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(
      userId,
    )}/messages/${encodeURIComponent(messageId)}`,
  );

  url.searchParams.set("format", "full");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as GmailMessage & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      body.error?.message ?? `Gmail message fetch failed with ${response.status}.`,
    );
  }

  return body;
}
