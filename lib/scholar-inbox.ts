import { findArxivUrlInText, normalizeArxivUrl } from "./arxiv";
import { redactSensitiveText, redactSensitiveUrl } from "./redact";

export type ScholarInboxPaperLink = {
  url: URL;
  shaKey: string;
  paperId: string;
  date: string | null;
};

export type ResolvedScholarInboxPaper = {
  source: "scholar_inbox";
  sourcePaperId: string;
  arxivId: string;
  absUrl: string;
  pdfUrl: string;
};

export function parseScholarInboxUrl(rawUrl: string): ScholarInboxPaperLink | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.hostname !== "scholar-inbox.com" &&
    url.hostname !== "www.scholar-inbox.com"
  ) {
    return null;
  }

  const shaKey = url.searchParams.get("sha_key");
  const paperId = url.searchParams.get("paper_id");

  if (!shaKey || !paperId) {
    return null;
  }

  return { url, shaKey, paperId, date: url.searchParams.get("date") };
}

export function htmlDecode(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function describeScholarInboxResponse(html: string) {
  const lowerHtml = html.toLowerCase();

  if (lowerHtml.includes("login")) {
    return "The fetched page looked like a login page.";
  }

  if (lowerHtml.includes("<script") && lowerHtml.includes("__next")) {
    return "The fetched page looked like a client-rendered app shell.";
  }

  if (lowerHtml.includes("paper_id")) {
    return "The fetched page contained Scholar Inbox paper data, but no recognizable arXiv URL or arXiv ID.";
  }

  return "The fetched page did not contain a recognizable arXiv URL or arXiv ID.";
}

export async function fetchScholarInboxPaperPage(rawUrl: string) {
  const parsed = parseScholarInboxUrl(rawUrl);

  if (!parsed) {
    return null;
  }

  const response = await fetch(parsed.url, {
    redirect: "follow",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 PaperLibrary/0.1",
    },
  });
  const rawBody = await response.text();
  const decodedBody = htmlDecode(rawBody);

  return {
    paperId: parsed.paperId,
    status: response.status,
    ok: response.ok,
    finalUrl: redactSensitiveUrl(response.url),
    contentType: response.headers.get("content-type"),
    body: redactSensitiveText(decodedBody, [
      parsed.url.searchParams.get("sha_key") ?? "",
    ]),
  };
}

function cookieHeaderFromResponse(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookie =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : response.headers.get("set-cookie")?.split(/,(?=[^;,]+=)/) ?? [];

  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

function scholarInboxHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    Accept: "application/json, text/plain, */*",
    Origin: "https://www.scholar-inbox.com",
    Referer: "https://www.scholar-inbox.com/",
    "User-Agent": "PaperLibrary/0.1",
    "X-Client-Fingerprint": "paper-library-server",
    ...extraHeaders,
  };
}

export async function fetchScholarInboxApiDataFromUrl(rawUrl: string) {
  const parsed = parseScholarInboxUrl(rawUrl);

  if (!parsed) {
    return null;
  }

  const loginResponse = await fetch(
    `https://api.scholar-inbox.com/api/login/${encodeURIComponent(
      parsed.shaKey,
    )}/`,
    {
      redirect: "follow",
      headers: scholarInboxHeaders(),
    },
  );
  const cookie = cookieHeaderFromResponse(loginResponse);
  const isCacheFileName =
    parsed.paperId.endsWith(".pdf") || !/^\d+$/.test(parsed.paperId);
  const apiUrl = isCacheFileName
    ? new URL(
        `https://api.scholar-inbox.com/api/papers/${encodeURIComponent(
          parsed.paperId.replace(/\.pdf$/i, ""),
        )}`,
      )
    : new URL("https://api.scholar-inbox.com/api/");

  if (!isCacheFileName) {
    if (parsed.date) {
      apiUrl.searchParams.set("date", parsed.date);
    }

    apiUrl.searchParams.set("paper_id", parsed.paperId);
  }

  const paperResponse = await fetch(apiUrl, {
    redirect: "follow",
    headers: scholarInboxHeaders(cookie ? { Cookie: cookie } : {}),
  });
  const body = await paperResponse.text();

  return {
    loginStatus: loginResponse.status,
    paperStatus: paperResponse.status,
    endpoint: isCacheFileName ? "paper_detail" : "digest",
    ok: loginResponse.ok && paperResponse.ok,
    contentType: paperResponse.headers.get("content-type"),
    body: redactSensitiveText(body, [parsed.shaKey]),
  };
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(object: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function matchesPaperId(object: JsonObject, paperId: string) {
  const candidateIds = [
    object.paper_id,
    object.id,
    object.paperId,
    object.cache_file_name,
  ];

  return candidateIds.some((candidateId) => {
    if (typeof candidateId !== "string" && typeof candidateId !== "number") {
      return false;
    }

    const normalizedCandidateId = String(candidateId).replace(/\.pdf$/i, "");
    const normalizedPaperId = paperId.replace(/\.pdf$/i, "");

    return normalizedCandidateId === normalizedPaperId;
  });
}

function findPaperObjectById(value: unknown, paperId: string): JsonObject | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPaperObjectById(item, paperId);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (!isJsonObject(value)) {
    return null;
  }

  if (matchesPaperId(value, paperId)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findPaperObjectById(child, paperId);

    if (found) {
      return found;
    }
  }

  return null;
}

function findArxivUrlInPaperObject(paper: JsonObject) {
  const arxivId = getStringField(paper, ["arxiv_id", "arxivId"]);

  if (arxivId) {
    return `https://arxiv.org/abs/${arxivId}`;
  }

  const directUrl = getStringField(paper, [
    "arxiv_url",
    "arxivUrl",
    "url",
    "paper_link",
    "pdf_url",
    "html_link",
  ]);

  if (directUrl) {
    const arxivUrl = findArxivUrlInText(directUrl);

    if (arxivUrl) {
      return arxivUrl;
    }
  }

  return findArxivUrlInText(JSON.stringify(paper));
}

function findArxivUrlInApiBody(apiBody: string, paperId: string) {
  try {
    const parsedJson = JSON.parse(apiBody) as unknown;
    const selectedPaper = findPaperObjectById(parsedJson, paperId);

    if (selectedPaper) {
      return findArxivUrlInPaperObject(selectedPaper);
    }
  } catch {
    // Fall through to the raw text fallback for non-JSON responses.
  }

  return findArxivUrlInText(apiBody);
}

export async function resolveScholarInboxPaperUrl(rawUrl: string) {
  const parsed = parseScholarInboxUrl(rawUrl);

  if (!parsed) {
    return null;
  }

  const apiData = await fetchScholarInboxApiDataFromUrl(rawUrl);

  if (apiData?.ok) {
    const apiArxivUrl = findArxivUrlInApiBody(apiData.body, parsed.paperId);

    if (apiArxivUrl) {
      const normalized = normalizeArxivUrl(apiArxivUrl);

      if (!normalized) {
        throw new Error(
          "Scholar Inbox API contained an unsupported arXiv link.",
        );
      }

      return {
        source: "scholar_inbox",
        sourcePaperId: parsed.paperId,
        ...normalized,
      } satisfies ResolvedScholarInboxPaper;
    }
  }

  const page = await fetchScholarInboxPaperPage(rawUrl);

  if (!page) {
    return null;
  }

  if (!page.ok) {
    throw new Error(
      `Scholar Inbox page request failed (${page.status}) for ${redactSensitiveUrl(
        rawUrl,
      )}.`,
    );
  }

  const arxivUrl = findArxivUrlInText(page.body);

  if (!arxivUrl) {
    const apiStatus = apiData
      ? ` API login status: ${apiData.loginStatus}. API paper status: ${apiData.paperStatus}.`
      : "";

    throw new Error(
      `Scholar Inbox paper page could not be resolved. ${describeScholarInboxResponse(
        page.body,
      )}${apiStatus} Final URL: ${page.finalUrl}`,
    );
  }

  const normalized = normalizeArxivUrl(arxivUrl);

  if (!normalized) {
    throw new Error("Scholar Inbox page contained an unsupported arXiv link.");
  }

  return {
    source: "scholar_inbox",
    sourcePaperId: page.paperId,
    ...normalized,
  } satisfies ResolvedScholarInboxPaper;
}
