const DEFAULT_APP_BASE_URL = "https://paperadar.app";

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
}

function getSettings() {
  return chrome.storage.sync.get({
    appBaseUrl: DEFAULT_APP_BASE_URL,
    extensionApiSecret: "",
  });
}

async function submitPaper({ pageUrl, rating }) {
  const settings = await getSettings();
  const appBaseUrl = normalizeBaseUrl(settings.appBaseUrl);
  const secret = String(settings.extensionApiSecret || "").trim();

  if (!secret) {
    throw new Error("Add your extension API secret in the extension options.");
  }

  let response;

  try {
    response = await fetch(`${appBaseUrl}/api/extension/papers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: pageUrl,
        ...(rating ? { rating } : {}),
      }),
    });
  } catch (error) {
    throw new Error(
      `Could not reach Sieve at ${appBaseUrl}. Check the app URL, deployment, and extension host permissions. ${error.message || ""}`.trim(),
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.details || result.error || `Sieve returned ${response.status}.`,
    );
  }

  return result;
}

async function openOptions() {
  if (typeof chrome.runtime.openOptionsPage === "function") {
    await chrome.runtime.openOptionsPage();
    return;
  }

  await chrome.tabs.create({
    url: chrome.runtime.getURL("options.html"),
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open_options") {
    openOptions()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message || "Could not open extension options.",
        }),
      );

    return true;
  }

  if (message?.type === "submit_paper") {
    submitPaper(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message || "Could not add this paper.",
        }),
      );

    return true;
  }

  return false;
});
