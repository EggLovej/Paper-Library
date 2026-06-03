# ArXiv Sieve Clipper

Local dev-mode Chrome extension for adding arXiv papers to ArXiv Sieve.

## Install

1. Set `EXTENSION_API_SECRET` in Vercel and locally if needed.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this `chrome-extension` folder.
6. Open the extension options and save:
   - Sieve app URL, for example `https://paperadar.app`
   - the same `EXTENSION_API_SECRET`

## Use

On arXiv abs/PDF pages, use the right-edge **Sieve** button when it appears.
Chrome's built-in PDF viewer may block injected page UI, so the toolbar popup is
the fallback and uses the current tab URL.

## Debug

- After editing extension files, click **Reload** on `chrome://extensions`.
- Click **service worker** on the extension details page to inspect background
  request errors.
- If the popup says it cannot reach Sieve, check that:
  - the app is deployed with `/api/extension/papers`
  - `EXTENSION_API_SECRET` is set in Vercel
  - the extension options contain the same secret
  - the app URL matches a host in `manifest.json`
