(function () {
  const clipper = window.SieveClipper;
  const pageUrl = clipper.getArxivUrl(window.location.href);

  if (!pageUrl || document.getElementById("sieve-clipper-root")) {
    return;
  }

  const root = document.createElement("div");
  root.id = "sieve-clipper-root";
  root.innerHTML = `
    <button class="sieve-rail-button" type="button" aria-label="Open ArXiv Sieve clipper">
      Sieve
    </button>
    <section class="sieve-panel" aria-label="ArXiv Sieve clipper" hidden>
      <div class="sieve-panel-header">
        <div>
          <p class="sieve-kicker">ArXiv Sieve</p>
          <h2>Add paper</h2>
        </div>
        <button class="sieve-close" type="button" aria-label="Close">x</button>
      </div>
      <label class="sieve-label" for="sieve-rating">Verdict</label>
      <select id="sieve-rating" class="sieve-select"></select>
      <button class="sieve-submit" type="button">Add to Sieve</button>
      <button class="sieve-options" type="button">Settings</button>
      <p class="sieve-status" role="status"></p>
    </section>
  `;
  document.documentElement.append(root);

  const railButton = root.querySelector(".sieve-rail-button");
  const panel = root.querySelector(".sieve-panel");
  const closeButton = root.querySelector(".sieve-close");
  const submitButton = root.querySelector(".sieve-submit");
  const optionsButton = root.querySelector(".sieve-options");
  const ratingSelect = root.querySelector(".sieve-select");
  const status = root.querySelector(".sieve-status");

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

  railButton.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      setStatus("", "neutral");
    }
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
  });

  optionsButton.addEventListener("click", async () => {
    try {
      await clipper.openOptions();
    } catch (error) {
      setStatus(error.message || "Could not open settings.", "bad");
    }
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
