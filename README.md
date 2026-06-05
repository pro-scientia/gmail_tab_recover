# gmail_tab_recover
A quick attempt at building a tool with an AI-aided process.
# Gmail Tab Recover — Extension

This repo contains a Chrome extension to scan your browser history for items not currently open and offer to reopen them.

Quick start

1. Load unpacked extension in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this folder (`gmail_tab_recover`)

2. Use the popup UI (click the extension icon):
   - `Scan History` — scans recent history (default 50) and shows up to 15 suggested items not currently open or on other devices, excluding email sites, inkblot, and LinkedIn (except `/learning`).
   - `Open Selected` — open checked suggestions as background tabs and record earliest opened date.
   - `Export Snapshot` — downloads a JSON snapshot of the last 10 saved snapshots to your Downloads folder.

Storage and snapshots

- Snapshots (up to 10 recent) are stored in `chrome.storage.local` under the key `historySnapshots`.
- The extension also stores `lastEarliestOpenedDate` to filter future scans by date.
- Note: browser extensions cannot write arbitrary folders on disk; exported snapshots are saved to the user's Downloads folder.

Tests

- Unit tests for filtering and snapshot rotation live in `test/` and use Jest.
- To run tests locally:

```bash
npm install
npm test
```

Files created

- `src/filters.js` — filter helpers and snapshot rotation (used for tests)
- `get_tabs.html`, `get_tabs.js` — popup UI and logic
- `manifest.json` — updated permissions (`history`, `tabs`, `storage`, `sessions`, `downloads`)
- `test/` — Jest tests
- `README_TESTS.md` — quick test notes

Limitations

- `npm` is not available in this environment; run tests locally.
- If you require saving files in a specific local subdirectory (not Downloads), we'll need to implement native messaging.

Reinstalling packages
## Recreating dependencies

Requirements:
- Node.js version: [e.g. 18.x] (use .nvmrc or engines in package.json)

To install the exact dependency tree (recommended when `package-lock.json` is present):

npm ci

If `package-lock.json` is not committed, install with:

npm install

Notes:
- `npm ci` is deterministic and faster for CI; it requires `package-lock.json`.
- If you pin Node version, include `.nvmrc` or add `engines` in `package.json`.



Next steps

- Add a small settings pane to configure domains, scan/suggest limits, and other-device filtering.
- Polish UI and error handling.

If you'd like, I can implement the settings UI next. Please confirm.
