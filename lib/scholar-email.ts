import { parseScholarInboxUrl } from "./scholar-inbox";

function decodeEmailHtml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function extractScholarInboxPaperUrls(emailBody: string) {
  const decodedBody = decodeEmailHtml(emailBody);
  const matches = decodedBody.matchAll(
    /https?:\/\/www\.scholar-inbox\.com\/login\?[^"'<>\s]+/gi,
  );
  const paperUrls = new Map<string, string>();

  for (const match of matches) {
    const rawUrl = match[0];
    const parsed = parseScholarInboxUrl(rawUrl);

    if (parsed) {
      paperUrls.set(parsed.paperId, parsed.url.toString());
    }
  }

  return [...paperUrls.values()];
}
