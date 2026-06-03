(async function () {
  const clipper = window.SieveClipper;
  const ratingSelect = document.getElementById("rating");
  const submitButton = document.getElementById("submit");
  const settingsButton = document.getElementById("settings");
  const status = document.getElementById("status");
  const pageStatus = document.getElementById("page-status");

  for (const rating of clipper.RATINGS) {
    const option = document.createElement("option");
    option.value = rating.value;
    option.textContent = rating.label;
    ratingSelect.append(option);
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone || "neutral";
  }

  function setBusy(isBusy) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Adding..." : "Add to Sieve";
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const pageUrl = tab?.url || "";
  const arxivUrl = clipper.getArxivUrl(pageUrl);

  if (arxivUrl) {
    pageStatus.textContent = arxivUrl;
  } else {
    pageStatus.textContent = "Open an arXiv abs or PDF page first.";
    submitButton.disabled = true;
  }

  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  submitButton.addEventListener("click", async () => {
    setBusy(true);
    setStatus("Sending to Sieve...", "neutral");

    try {
      const result = await clipper.submitPaper({
        pageUrl,
        rating: ratingSelect.value,
      });
      const verdict = ratingSelect.value
        ? ` · ${clipper.RATINGS.find((item) => item.value === ratingSelect.value).label}`
        : "";

      setStatus(`Queued arXiv ${result.arxivId}${verdict}.`, "good");
    } catch (error) {
      setStatus(error.message || "Could not add this paper.", "bad");
    } finally {
      setBusy(false);
    }
  });
})();
