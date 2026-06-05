const statusDiv = document.getElementById('status');
const openTabsDiv = document.getElementById('open-tabs');
const suggestedDiv = document.getElementById('suggested-list');

const DEFAULT_SCAN_LIMIT = 50;
const DEFAULT_SUGGEST_LIMIT = 15;

document.getElementById('scan-btn').addEventListener('click', async () => {
  statusDiv.textContent = 'Scanning...';
  try {
    const scanLimit = DEFAULT_SCAN_LIMIT;
    const suggestLimit = DEFAULT_SUGGEST_LIMIT;

    // Get currently open tabs
    const openTabs = await chrome.tabs.query({});
    renderOpenTabs(openTabs);

    // Get history
    const historyItems = await chrome.history.search({ text: '', maxResults: scanLimit });

    // Attempt to get other-device sessions if permission enabled
    let otherDeviceUrls = [];
    try {
      const devices = await chrome.sessions.getDevices();
      for (const d of devices) {
        if (d.sessions) for (const s of d.sessions) {
          if (s.window && s.window.tabs) {
            for (const t of s.window.tabs) otherDeviceUrls.push(t.url);
          } else if (s.tab) {
            otherDeviceUrls.push(s.tab.url);
          }
        }
      }
    } catch (e) {
      // sessions permission may not be available; continue without other-device filtering
    }

    // Get lastEarliestOpenedDate from storage
    const storage = await chrome.storage.local.get(['lastEarliestOpenedDate']);
    const afterTimestamp = storage.lastEarliestOpenedDate ? Number(new Date(storage.lastEarliestOpenedDate).getTime()) : 0;

    // Filter candidates
    const candidates = filterHistoryCandidates(historyItems, openTabs.map(t => t.url), otherDeviceUrls, {
      emailDomains: ['gmail.com','mail.google.com', 'outlook.com','live.com', 'hotmail.com', 'yahoo.com'],
      excludeOtherDevices: true,
      afterTimestamp,
      suggestLimit,
    });

    renderSuggested(candidates);

    // Save snapshot
    const snap = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      earliestOpenedDate: null,
      candidates: candidates.map(c => ({ url: c.url, lastVisitTime: c.lastVisitTime }))
    };

    const s = await chrome.storage.local.get(['historySnapshots']);
    const snaps = s.historySnapshots || [];
    snaps.unshift(snap);
    const keep = snaps.slice(0, 10);
    await chrome.storage.local.set({ historySnapshots: keep });

    statusDiv.textContent = `Scan complete — ${candidates.length} suggestions.`;
  } catch (err) {
    statusDiv.textContent = `Error: ${err.message}`;
    console.error(err);
  }
});

document.getElementById('open-selected-btn').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('.suggest-check:checked')).map(cb => cb.value);
  if (checked.length === 0) {
    statusDiv.textContent = 'No tabs selected.';
    return;
  }
  statusDiv.textContent = `Opening ${checked.length} tabs...`;
  try {
    for (const url of checked) {
      await chrome.tabs.create({ url, active: false });
    }

    // After opening, record earliest opened date from history for these URLs
    const hist = await chrome.history.search({ text: '', maxResults: 1000 });
    const times = [];
    for (const u of checked) {
      const found = hist.find(h => normalizeUrl(h.url) === normalizeUrl(u));
      if (found && found.lastVisitTime) times.push(found.lastVisitTime);
    }
    const earliest = times.length ? new Date(Math.min(...times)).toISOString() : new Date().toISOString();

    // update lastEarliestOpenedDate and snapshots
    const stor = await chrome.storage.local.get(['historySnapshots']);
    const snaps = stor.historySnapshots || [];
    if (snaps && snaps.length > 0) {
      snaps[0].earliestOpenedDate = earliest;
      await chrome.storage.local.set({ historySnapshots: snaps, lastEarliestOpenedDate: earliest });
    } else {
      await chrome.storage.local.set({ lastEarliestOpenedDate: earliest });
    }

    statusDiv.textContent = `Opened ${checked.length} tabs.`;
  } catch (err) {
    statusDiv.textContent = `Error: ${err.message}`;
    console.error(err);
  }
});

document.getElementById('export-btn').addEventListener('click', async () => {
  statusDiv.textContent = 'Exporting snapshot...';
  try {
    const stor = await chrome.storage.local.get(['historySnapshots']);
    const snaps = stor.historySnapshots || [];
    const blob = new Blob([JSON.stringify(snaps, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: `tab_recovery_snapshot_${Date.now()}.json` });
    statusDiv.textContent = 'Export started.';
  } catch (err) {
    statusDiv.textContent = `Error: ${err.message}`;
    console.error(err);
  }
});

// Helper to minimize false negatives (e.g., matching http vs https, trailing slashes)
function normalizeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    // Drop hashes and trailing slashes for cleaner matching
    let cleanPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    return `${url.hostname}${cleanPath}${url.search}`;
  } catch (e) {
    return urlStr;
  }
}

function renderOpenTabs(tabs) {
  openTabsDiv.innerHTML = tabs.map(t => `<div style="font-size:0.9em;">${t.title || t.url}</div>`).join('');
}

function renderSuggested(items) {
  suggestedDiv.innerHTML = items.map((it, idx) => {
    return `<div style="margin-bottom:6px;"><input class="suggest-check" id="s${idx}" type="checkbox" value="${it.url}"> <label for="s${idx}">${it.url}</label></div>`;
  }).join('');
}

function filterHistoryCandidates(historyItems = [], openTabs = [], otherDeviceTabs = [], options = {}) {
  const {
    emailDomains = ['gmail.com','mail.google.com', 'outlook.com','live.com', 'hotmail.com', 'yahoo.com'],
    excludeOtherDevices = true,
    afterTimestamp = 0,
    suggestLimit = 15,
  } = options;

  const openSet = new Set(openTabs.map(u => normalizeUrl(u)));
  const otherSet = new Set((otherDeviceTabs || []).map(u => normalizeUrl(u)));

  const candidates = historyItems
    .filter(item => {
      if (!item || !item.url) return false;
      if (item.lastVisitTime && item.lastVisitTime < afterTimestamp) return false;
      const n = normalizeUrl(item.url);
      if (openSet.has(n)) return false;
      if (excludeOtherDevices && otherSet.has(n)) return false;
      if (isEmailDomain(item.url, emailDomains)) return false;
      if (containsInkblot(item.url)) return false;
      if (isLinkedInExcluded(item.url)) return false;
      return true;
    })
    .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
    .slice(0, suggestLimit);

  return candidates;
}

function isEmailDomain(urlStr, domains = []) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return domains.some(d => host.includes(d.toLowerCase()));
  } catch (e) { return false; }
}

function containsInkblot(urlStr) { return String(urlStr).toLowerCase().includes('inkblot'); }

function isLinkedInExcluded(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.endsWith('linkedin.com')) return false;
    return !url.pathname.startsWith('/learning');
  } catch (e) { return false; }
}