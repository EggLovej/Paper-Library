export type NormalizedArxivPaper = {
  arxivId: string;
  absUrl: string;
  pdfUrl: string;
};

const ARXIV_URL_PATTERN =
  /https?:\/\/(?:www\.)?arxiv\.(?:org|com)\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?(?:\.pdf)?\/?/i;
const ARXIV_ID_PATTERN = /\barxiv\s*:\s*([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?\b/i;

export function normalizeArxivUrl(rawUrl: string): NormalizedArxivPaper | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.hostname !== "arxiv.org" &&
    parsedUrl.hostname !== "www.arxiv.org" &&
    parsedUrl.hostname !== "arxiv.com" &&
    parsedUrl.hostname !== "www.arxiv.com"
  ) {
    return null;
  }

  const match = parsedUrl.pathname.match(
    /^\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?(?:\.pdf)?\/?$/,
  );
  const arxivId = match?.[1];

  if (!arxivId) {
    return null;
  }

  return {
    arxivId,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
  };
}

export function findArxivUrlInText(text: string) {
  for (const candidate of createTextCandidates(text)) {
    const urlMatch = candidate.match(ARXIV_URL_PATTERN);

    if (urlMatch?.[0]) {
      return urlMatch[0];
    }

    const idMatch = candidate.match(ARXIV_ID_PATTERN);

    if (idMatch?.[1]) {
      return `https://arxiv.org/abs/${idMatch[1]}`;
    }
  }

  return null;
}

function createTextCandidates(text: string) {
  const slashUnescaped = text.replaceAll("\\/", "/");
  const candidates = new Set([text, slashUnescaped]);

  for (const candidate of [...candidates]) {
    try {
      candidates.add(decodeURIComponent(candidate));
    } catch {
      // Some HTML/JS payloads contain stray `%` characters. Ignore those.
    }
  }

  return candidates;
}
