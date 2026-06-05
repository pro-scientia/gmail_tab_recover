const statusDiv = document.getElementById('status');
const openTabsDiv = document.getElementById('open-tabs');
const suggestedDiv = document.getElementById('suggested-list');
const snapshotsDiv = document.getElementById('snapshots');
const searchBox = document.getElementById('search-box');
const groupToggle = document.getElementById('group-toggle');

const DEFAULT_SCAN_LIMIT = 50;
const DEFAULT_SUGGEST_LIMIT = 30;

let currentSuggestions = [];
let currentOpenTabs = [];
let selectedCheckboxes = new Set();
let groupByDomain = true;
// Cutoff controls (populated from DOM)
const cutoffInput = document.getElementById('cutoff-input');
const cutoffModeSelect = document.getElementById('cutoff-mode');
const cutoffSampleBtn = document.getElementById('cutoff-sample-btn');

function toDatetimeLocalString(value) {
  if (!value) return '';
  const d = new Date(value);
  // Shift to local timezone for datetime-local input
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function loadCutoffSettings() {
  try {
    chrome.storage.local.get(['cutoffValue', 'cutoffMode'], (res) => {
      if (res.cutoffMode && cutoffModeSelect) cutoffModeSelect.value = res.cutoffMode;
      if (res.cutoffValue && cutoffInput) cutoffInput.value = toDatetimeLocalString(res.cutoffValue);
    });
  } catch (e) {
    // ignore (not running in extension env during tests)
  }
}

if (cutoffInput) {
  cutoffInput.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) {
      chrome.storage.local.remove(['cutoffValue']);
      return;
    }
    const iso = new Date(val).toISOString();
    chrome.storage.local.set({ cutoffValue: iso });
  });
}

if (cutoffModeSelect) {
  cutoffModeSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ cutoffMode: e.target.value });
  });
}

if (cutoffSampleBtn) {
  cutoffSampleBtn.addEventListener('click', () => {
    const sampleMs = 1779949926788.142;
    const iso = new Date(Math.floor(sampleMs)).toISOString();
    if (cutoffInput) cutoffInput.value = toDatetimeLocalString(iso);
    chrome.storage.local.set({ cutoffValue: iso, cutoffMode: 'before' });
    setStatus('Sample cutoff set', 'info');
  });
}

loadCutoffSettings();

// Domain color palette
const DOMAIN_COLORS = {
  github: '#333',
  stackoverflow: '#f48024',
  google: '#4285f4',
  gmail: '#c5221f',
  notion: '#000',
  youtube: '#ff0000',
  twitter: '#1da1f2',
  reddit: '#ff4500',
  medium: '#000',
  dev: '#0a0e27',
  default: '#8b8b8b'
};

function getDomainColor(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [domain, color] of Object.entries(DOMAIN_COLORS)) {
      if (domain !== 'default' && hostname.includes(domain)) return color;
    }
  } catch (e) {}
  return DOMAIN_COLORS.default;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return 'unknown';
  }
}

function getFaviconUrl(url) {
  try {
    const parsed = new URL(url);
    // chrome://favicon cannot be used for internal or non-http(s) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `chrome://favicon/size/16@2x/${url}`;
  } catch (e) {
    return '';
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

document.getElementById('scan-btn').addEventListener('click', async () => {
  setStatus('Scanning...', 'info');
  try {
    const scanLimit = DEFAULT_SCAN_LIMIT;
    const suggestLimit = DEFAULT_SUGGEST_LIMIT;

    // Get currently open tabs
    const openTabs = await chrome.tabs.query({});
    currentOpenTabs = openTabs;
    renderOpenTabs(openTabs);

    // Get history
    // TEMPORARY TEST: start the history search near the provided sample timestamp
    // This uses a 1-day window before the sample timestamp to capture nearby visits.
    const SAMPLE_TS_MS = 1779949926788; // user-provided sample timestamp
    const WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day
    const startTime = Math.max(0, SAMPLE_TS_MS - WINDOW_MS);
    console.log('Temporary history search startTime (ms):', startTime);
    const historyItems = await chrome.history.search({ text: '', startTime, maxResults: 1000 });

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

    // Get lastEarliestOpenedDate and optional cutoff from storage
    const storage = await chrome.storage.local.get(['lastEarliestOpenedDate', 'cutoffValue', 'cutoffMode']);
    // default afterTimestamp comes from lastEarliestOpenedDate
    let afterTimestamp = storage.lastEarliestOpenedDate ? Number(new Date(storage.lastEarliestOpenedDate).getTime()) : 0;
    let beforeTimestamp = null;
    if (storage.cutoffValue) {
      const cutoffEpoch = Number(new Date(storage.cutoffValue).getTime());
      if (storage.cutoffMode === 'after') {
        afterTimestamp = cutoffEpoch;
      } else {
        beforeTimestamp = cutoffEpoch;
      }
    }

    // Filter candidates
    const candidates = filterHistoryCandidates(historyItems, openTabs.map(t => t.url), otherDeviceUrls, {
      emailDomains: ['gmail.com','mail.google.com', 'outlook.com','live.com', 'hotmail.com', 'yahoo.com'],
      excludeOtherDevices: true,
      afterTimestamp,
      beforeTimestamp,
      suggestLimit,
    });

    currentSuggestions = candidates;
    renderSuggested(candidates, groupByDomain);
    loadSnapshots();

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

    setStatus(`Scan complete — ${candidates.length} suggestions.`, 'success');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    console.error(err);
  }
});

document.getElementById('open-selected-btn').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('.suggest-check:checked')).map(cb => cb.value);
  if (checked.length === 0) {
    setStatus('No tabs selected.', 'info');
    return;
  }
  setStatus(`Opening ${checked.length} tabs...`, 'info');
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

    setStatus(`Opened ${checked.length} tabs.`, 'success');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    console.error(err);
  }
});

document.getElementById('open-window-btn').addEventListener('click', async () => {
  const checked = Array.from(document.querySelectorAll('.suggest-check:checked')).map(cb => cb.value);
  if (checked.length === 0) {
    setStatus('No tabs selected.', 'info');
    return;
  }
  setStatus(`Opening ${checked.length} tabs in new window...`, 'info');
  try {
    const newWindow = await chrome.windows.create({ state: 'normal' });
    for (const url of checked) {
      await chrome.tabs.create({ windowId: newWindow.id, url, active: false });
    }
    setStatus(`Opened ${checked.length} tabs in new window.`, 'success');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    console.error(err);
  }
});

document.getElementById('export-btn').addEventListener('click', async () => {
  setStatus('Exporting snapshot...', 'info');
  try {
    const stor = await chrome.storage.local.get(['historySnapshots']);
    const snaps = stor.historySnapshots || [];
    const blob = new Blob([JSON.stringify(snaps, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: `tab_recovery_snapshot_${Date.now()}.json` });
    setStatus('Export started.', 'success');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
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
  openTabsDiv.innerHTML = tabs.slice(0, 8).map(t => {
    const favicon = getFaviconUrl(t.url);
    return `<div class="tab-item">
      <img src="${favicon}" onerror="this.style.display='none'" alt="">
      <span class="url-text" title="${t.url}">${t.title || t.url}</span>
    </div>`;
  }).join('');
  if (tabs.length > 8) {
    openTabsDiv.innerHTML += `<div class="tab-item" style="color: #999; font-size: 0.8em;">+${tabs.length - 8} more</div>`;
  }
}

function renderSuggested(items, grouped = true) {
  if (!items || items.length === 0) {
    suggestedDiv.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">No suggestions</div>';
    return;
  }

  let html = '';
  
  if (grouped) {
    const byDomain = {};
    items.forEach(item => {
      const domain = getDomain(item.url);
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(item);
    });

    Object.entries(byDomain).forEach(([domain, domainItems]) => {
      const color = getDomainColor(domainItems[0].url);
      html += `<div class="suggested-group">
        <div class="group-header">
          <span class="toggle">▼</span>
          <span>${domain}</span>
          <span class="domain-badge" style="background-color: ${color}">${domainItems.length}</span>
        </div>
        <div class="group-items">`;
      
      domainItems.forEach((item, idx) => {
        const favicon = getFaviconUrl(item.url);
        const date = formatDate(item.lastVisitTime);
        const checkboxId = `s${domain}-${idx}`;
        html += `<div class="suggested-item">
          <input class="suggest-check" type="checkbox" value="${item.url}" id="${checkboxId}">
          <img src="${favicon}" onerror="this.style.display='none'" alt="">
          <label for="${checkboxId}">
            <span class="url-text">${item.url}</span>
            <span class="date-text">${date}</span>
          </label>
        </div>`;
      });
      
      html += `</div></div>`;
    });
  } else {
    items.forEach((item, idx) => {
      const favicon = getFaviconUrl(item.url);
      const date = formatDate(item.lastVisitTime);
      const color = getDomainColor(item.url);
      html += `<div class="suggested-item">
        <input class="suggest-check" type="checkbox" value="${item.url}" id="s${idx}">
        <img src="${favicon}" onerror="this.style.display='none'" alt="">
        <label for="s${idx}">
          <span class="url-text">${item.url}</span>
          <span class="date-text">${date}</span>
        </label>
      </div>`;
    });
  }

  suggestedDiv.innerHTML = html;
}

function setStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = type ? type : '';
}

function loadSnapshots() {
  chrome.storage.local.get(['historySnapshots'], (result) => {
    const snaps = result.historySnapshots || [];
    if (snaps.length === 0) {
      snapshotsDiv.innerHTML = '<div style="padding: 6px; color: #999; font-size: 0.85em;">No snapshots yet</div>';
      return;
    }
    snapshotsDiv.innerHTML = snaps.slice(0, 5).map(snap => {
      const date = new Date(snap.timestamp);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
      return `<div class="tab-item" title="${dateStr}"><strong>${snap.candidates.length}</strong> items</div>`;
    }).join('');
  });
}

function filterBySearch(items, query) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(item => item.url.toLowerCase().includes(q));
}

searchBox.addEventListener('input', (e) => {
  const filtered = filterBySearch(currentSuggestions, e.target.value);
  renderSuggested(filtered, groupByDomain);
});

groupToggle.addEventListener('change', (e) => {
  groupByDomain = e.target.checked;
  const filtered = filterBySearch(currentSuggestions, searchBox.value);
  renderSuggested(filtered, groupByDomain);
});

function filterHistoryCandidates(historyItems = [], openTabs = [], otherDeviceTabs = [], options = {}) {
  const {
    emailDomains = ['gmail.com','mail.google.com', 'outlook.com','live.com', 'hotmail.com', 'yahoo.com'],
    excludeOtherDevices = true,
    afterTimestamp = 0,
    beforeTimestamp = null,
    suggestLimit = 15,
  } = options;

  const openSet = new Set(openTabs.map(u => normalizeUrl(u)));
  const otherSet = new Set((otherDeviceTabs || []).map(u => normalizeUrl(u)));

  const candidates = historyItems
    .filter(item => {
      if (!item || !item.url) return false;
      const last = item.lastVisitTime != null ? Number(item.lastVisitTime) : null;
      const after = Number(afterTimestamp) || 0;
      const before = beforeTimestamp != null ? Number(beforeTimestamp) : null;
      if (last !== null && last < after) return false;
      if (last !== null && before != null && last >= before) return false;
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