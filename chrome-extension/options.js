(async function () {
  const clipper = window.SieveClipper;
  const form = document.getElementById("settings-form");
  const appBaseUrlInput = document.getElementById("app-base-url");
  const extensionApiSecretInput = document.getElementById("extension-api-secret");
  const status = document.getElementById("status");
  const settings = await clipper.getSettings();

  appBaseUrlInput.value = settings.appBaseUrl;
  extensionApiSecretInput.value = settings.extensionApiSecret;

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone || "neutral";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await clipper.saveSettings({
        appBaseUrl: appBaseUrlInput.value,
        extensionApiSecret: extensionApiSecretInput.value,
      });
      setStatus("Settings saved.", "good");
    } catch (error) {
      setStatus(error.message || "Settings could not be saved.", "bad");
    }
  });
})();
