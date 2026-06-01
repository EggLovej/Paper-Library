const PAPER_LIBRARY_WEBHOOK = "https://paperadar.app/api/ingest/scholar-email";
const PAPER_LIBRARY_SECRET = {secret};
const PROCESSED_LABEL = "PaperLibraryProcessed";

function ingestScholarInbox() {
  const query = 'from:noreply@cvlibs.net newer_than:30d -label:PaperLibraryProcessed';
  const threads = GmailApp.search(query, 0, 10);

  const processedLabel =
    GmailApp.getUserLabelByName(PROCESSED_LABEL) ||
    GmailApp.createLabel(PROCESSED_LABEL);

  console.log(`Scholar ingest start: threads=${threads.length}, query=${query}`);

  for (const thread of threads) {
    const messages = thread.getMessages();

    console.log(
      `Thread: id=${thread.getId()}, subject="${thread.getFirstMessageSubject()}", messages=${messages.length}`
    );

    for (const message of messages) {
      const body = message.getBody();
      const plainBody = message.getPlainBody();
      const subject = message.getSubject();
      const messageId = message.getId();
      const date = message.getDate().toISOString();

      const localPaperUrls = extractScholarInboxUrlsForDebug(body);
      const localPlainUrls = extractScholarInboxUrlsForDebug(plainBody);

      console.log(
        JSON.stringify({
          event: "message_debug",
          messageId,
          subject,
          date,
          bodyChars: body.length,
          plainBodyChars: plainBody.length,
          htmlScholarUrlsFound: localPaperUrls.length,
          plainScholarUrlsFound: localPlainUrls.length,
          htmlScholarUrls: localPaperUrls.map(sanitizeScholarUrl),
          plainScholarUrls: localPlainUrls.map(sanitizeScholarUrl),
          htmlExcerpt: makeScholarExcerpt(body),
          plainExcerpt: makeScholarExcerpt(plainBody),
        })
      );

      const startedAt = Date.now();

      let response;
      try {
        response = UrlFetchApp.fetch(PAPER_LIBRARY_WEBHOOK, {
          method: "post",
          contentType: "application/json",
          headers: {
            Authorization: `Bearer ${PAPER_LIBRARY_SECRET}`,
          },
          payload: JSON.stringify({
            messageId,
            subject,
            date,
            body,
          }),
          muteHttpExceptions: true,
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "webhook_fetch_exception",
            messageId,
            error: String(error),
          })
        );
        continue;
      }

      const status = response.getResponseCode();
      const text = response.getContentText();
      const elapsedMs = Date.now() - startedAt;

      console.log(
        JSON.stringify({
          event: "webhook_response",
          messageId,
          status,
          elapsedMs,
          responsePreview: truncate(sanitizeText(text), 4000),
          parsedResponse: tryParseJson(sanitizeText(text)),
        })
      );

      if (status >= 200 && status < 300) {
        thread.addLabel(processedLabel);
        console.log(
          JSON.stringify({
            event: "message_marked_processed",
            messageId,
            threadId: thread.getId(),
          })
        );
      } else {
        console.error(
          JSON.stringify({
            event: "message_not_processed",
            messageId,
            status,
            reason: "Webhook returned non-2xx. Leaving thread unlabelled for retry.",
          })
        );
      }
    }
  }

  console.log("Scholar ingest done.");
}

function extractScholarInboxUrlsForDebug(text) {
  const urls = new Set();
  const decoded = htmlDecode(String(text || ""));

  const urlRegex = /https?:\/\/(?:www\.)?scholar-inbox\.com\/login\?[^"'<>\\\s)]+/gi;
  let match;

  while ((match = urlRegex.exec(decoded)) !== null) {
    urls.add(cleanUrl(match[0]));
  }

  return Array.from(urls).filter((url) => url.includes("paper_id="));
}

function sanitizeScholarUrl(rawUrl) {
  const cleaned = cleanUrl(rawUrl);

  try {
    const url = new URL(cleaned);
    if (url.searchParams.has("sha_key")) {
      url.searchParams.set("sha_key", "[REDACTED]");
    }
    return url.toString();
  } catch {
    return cleaned.replace(/sha_key=[^&\s]+/gi, "sha_key=[REDACTED]");
  }
}

function sanitizeText(text) {
  return String(text || "")
    .replace(/sha_key["'=:%2F\s]*[^&"'<>\\\s]+/gi, "sha_key=[REDACTED]")
    .replace(/1\/\/[A-Za-z0-9_\-]+/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/ya29\.[A-Za-z0-9_\-.]+/g, "[REDACTED_ACCESS_TOKEN]");
}

function makeScholarExcerpt(text) {
  const sanitized = sanitizeText(htmlDecode(String(text || "")));
  const index = sanitized.toLowerCase().indexOf("scholar-inbox.com");

  if (index === -1) {
    return "[no scholar-inbox.com excerpt found]";
  }

  const start = Math.max(0, index - 350);
  const end = Math.min(sanitized.length, index + 900);

  return truncate(sanitized.slice(start, end).replace(/\s+/g, " "), 1400);
}

function cleanUrl(url) {
  return htmlDecode(String(url || ""))
    .replace(/&amp;/g, "&")
    .replace(/[)\].,;]+$/g, "")
    .trim();
}

function htmlDecode(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function truncate(text, maxLength) {
  const value = String(text || "");
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + `... [truncated ${value.length - maxLength} chars]`;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}