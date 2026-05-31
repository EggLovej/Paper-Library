export function redactSensitiveUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (
      url.hostname === "scholar-inbox.com" ||
      url.hostname === "www.scholar-inbox.com"
    ) {
      if (url.searchParams.has("sha_key")) {
        url.searchParams.set("sha_key", "[REDACTED]");
      }
    }

    return url.toString();
  } catch {
    return rawUrl.replace(/([?&]sha_key=)[^&\s]+/gi, "$1[REDACTED]");
  }
}

export function redactSensitiveText(text: string, secrets: string[] = []) {
  let redactedText = text
    .replace(/([?&]sha_key=)[^&"'<>\s]+/gi, "$1[REDACTED]")
    .replace(/(sha_key["']?\s*[:=]\s*["']?)[^"',&<>\s]+/gi, "$1[REDACTED]");

  for (const secret of secrets) {
    if (secret) {
      redactedText = redactedText.replaceAll(secret, "[REDACTED]");
    }
  }

  return redactedText;
}
