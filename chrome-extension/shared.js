(function () {
  const DEFAULT_APP_BASE_URL = "https://paperadar.app";
  const RATINGS = [
    { value: "", label: "No verdict yet" },
    { value: "interested", label: "Save" },
    { value: "maybe", label: "Maybe pile" },
    { value: "read_later", label: "Reading stack" },
    { value: "not_interested", label: "Toss" },
  ];

  function normalizeBaseUrl(value) {
    return String(value || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
  }

  function getSettings() {
    return chrome.storage.sync.get({
      appBaseUrl: DEFAULT_APP_BASE_URL,
      extensionApiSecret: "",
    });
  }

  function saveSettings(settings) {
    return chrome.storage.sync.set({
      appBaseUrl: normalizeBaseUrl(settings.appBaseUrl),
      extensionApiSecret: String(settings.extensionApiSecret || "").trim(),
    });
  }

  function getArxivUrl(rawUrl) {
    let url;

    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }

    if (!/^(www\.)?arxiv\.org$/i.test(url.hostname)) {
      return null;
    }

    if (!/^\/(pdf|abs)\//.test(url.pathname)) {
      return null;
    }

    return url.toString();
  }

  async function submitPaper({ pageUrl, rating }) {
    const settings = await getSettings();
    const appBaseUrl = normalizeBaseUrl(settings.appBaseUrl);
    const secret = String(settings.extensionApiSecret || "").trim();
    const arxivUrl = getArxivUrl(pageUrl);

    if (!secret) {
      throw new Error("Add your extension API secret in the extension options.");
    }

    if (!arxivUrl) {
      throw new Error("This tab is not an arXiv abs or PDF page.");
    }

    const response = await fetch(`${appBaseUrl}/api/extension/papers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: arxivUrl,
        ...(rating ? { rating } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.details || result.error || `Sieve returned ${response.status}.`,
      );
    }

    return result;
  }

  window.SieveClipper = {
    RATINGS,
    DEFAULT_APP_BASE_URL,
    getArxivUrl,
    getSettings,
    normalizeBaseUrl,
    saveSettings,
    submitPaper,
  };
})();
