## Plan: Tab Recovery + History-based Suggestions

TL;DR — Add UI and logic to list currently open tabs, scan recent history (default 50), filter candidates by the requested rules, persist up to 10 past snapshots in `chrome.storage.local`, allow the user to select (checkboxes) which suggested tabs to open, open them, then record the earliest opened date from Chrome history. Provide export (JSON) to Downloads. Add unit tests for filtering/selection logic and a small test harness for integration.

**Steps**
1. Update permissions and metadata in [manifest.json](manifest.json) (*depends: none*).
2. Extend the popup UI in [get_tabs.html](get_tabs.html) to show:
   - Current open tabs list
   - Suggested history candidates with checkboxes
   - Controls: `Scan`, `Show Openable`, `Open Selected`, `Export Snapshot`
   (*parallel with step 3*)
3. Implement logic in [get_tabs.js](get_tabs.js):
   - Enumerate current open tabs via `chrome.tabs.query({})` (feature a)
   - Fetch recent history via `chrome.history.search({text:'',maxResults:scanLimit})`
   - Optionally fetch other-device sessions via `chrome.sessions.getDevices()` when enabled
   - Normalize URLs and filter out:
     - URLs currently open in this browser
     - URLs open on other devices (if enabled)
     - Email domains (gmail.com, outlook.com, yahoo.com by default)
     - URLs containing `inkblot`
     - `linkedin.com` pages except `linkedin.com/learning`
     - Items older than the last saved earliest-opened date (if present)
   - Save candidate lists and a snapshot record into `chrome.storage.local` (keep latest 10 snapshots)
   - Present candidates in the popup with checkboxes (feature c)
   - When user opens selected items, create tabs (`chrome.tabs.create`) and then read history to save the earliest opened date for the snapshot
4. Data model & persistence:
   - Use `chrome.storage.local` keys:
     - `historySnapshots`: array of up to 10 `{id, timestamp, earliestOpenedDate, candidates}`
     - `lastEarliestOpenedDate`: ISO timestamp for filtering next runs
   - Provide `Export Snapshot` to download a JSON file into Downloads using `chrome.downloads.download`
5. Session/other-device support:
   - If user agreed, use `sessions` permission and `chrome.sessions.getDevices()` to gather open tabs on other devices for filtering
6. Create tests (in `test/`):
   - Unit tests with Jest for URL normalization, filtering rules, and snapshot rotation (keep last 10)
   - Optional E2E note (Puppeteer) for later if desired
7. Add dev tooling:
   - `package.json` with `jest` and test scripts
   - tests in `test/urlFilters.test.js` and `test/historySelector.test.js`
8. Verification & documentation:
   - Add short `README.md` describing how to load the extension and run tests
   - Provide commands to run tests and install dev deps

**Verification**
1. Unit tests: `npm install` then `npm test` (Jest) — verify URL filters and snapshot rotation pass
2. Manual: Load unpacked extension at `chrome://extensions`, click popup, run `Scan`, confirm suggested list excludes current tabs, other-device tabs, emails, inkblot, linkedin pages (except learning)
3. Open selected suggested tabs and verify they open; check `chrome.storage.local` shows updated snapshot and `lastEarliestOpenedDate`
4. Export snapshot and confirm JSON is saved to Downloads

**Decisions (based on your answers)**
- Storage: use `chrome.storage.local` with export to Downloads (you chose this).
- Email domains to exclude: `gmail.com` and `outlook.com`/`hotmail.com` (you chose these). Will add `yahoo.com` as optional config.
- Inkblot: exclude URLs containing `inkblot` (you chose this).
- LinkedIn: exclude `linkedin.com` but allow `linkedin.com/learning` (you chose this).
- Other devices: exclude tabs open on other devices (we will use `sessions` permission and `chrome.sessions.getDevices()` — you chose this).
- Scan/suggest limits: no explicit numbers provided; default to `scanLimit=50` and `suggestLimit=15`. These will be configurable in UI.
- Tests: you asked about how to download testing libraries; plan uses Node + Jest for unit tests. We'll include `package.json` and `npm install` instructions.

**Further Considerations**
1. Chrome extensions cannot create arbitrary subdirectories on the user's filesystem. The requested subdirectory of files will be implemented as JSON export files saved to the user's Downloads folder, and snapshots will be kept internally in `chrome.storage.local` (this preserves the "last 10" requirement). If you need real files in a specific local folder, we must use native messaging (requires extra install).
2. For "not a tab open to an email account", we will implement domain-based exclusions and make the list user-configurable in the UI.
3. If you want continuous background syncing (e.g., automatic daily scans), we'll need to add background service worker handling and optionally alarms; currently plan is manual scan from popup.

---

Additional requirement (enforced): write the outline into files in `./` and implement tests before proceeding with further implementation.

Write the extension outline into new files under the current directory (keeping any existing logic). Based on those outline files, implement the Jest unit tests and run them; do not proceed to modify core logic or other files until the tests pass.

Operational constraints:

```
- You are strictly in "auto-pilot" mode for the current subdirectory only.
- DO NOT attempt to use tools to modify, create, or read files outside of the current directory (`./`) and its subdirectories.
- If a task requires modifying a parent or sibling directory, stop and ask the user for permission first.
```

If this plan looks good I will save it to session memory (done) and then implement the changes in the repo: update `manifest.json`, extend `get_tabs.html`, and implement the logic and tests. Would you like me to proceed with implementation now, or change any of the defaults (scan/suggest limits, exclude domains, export behavior)?