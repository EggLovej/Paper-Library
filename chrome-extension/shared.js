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
    const arxivUrl = getArxivUrl(pageUrl);

    if (!arxivUrl) {
      throw new Error("This tab is not an arXiv abs or PDF page.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "submit_paper",
      payload: {
        pageUrl: arxivUrl,
        rating,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not add this paper.");
    }

    return response.result;
  }

  async function openOptions() {
    const response = await chrome.runtime.sendMessage({
      type: "open_options",
    });

    if (!response?.ok) {
      throw new Error("Could not open extension options.");
    }
  }

  window.SieveClipper = {
    RATINGS,
    DEFAULT_APP_BASE_URL,
    getArxivUrl,
    getSettings,
    normalizeBaseUrl,
    openOptions,
    saveSettings,
    submitPaper,
  };
})();
