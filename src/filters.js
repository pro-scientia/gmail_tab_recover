function normalizeUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./i, "");
    return host + url.pathname + url.search;
  } catch (e) {
    return u;
  }
}

function isEmailDomain(urlStr, domains = []) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return domains.some((d) => host.includes(d.toLowerCase()));
  } catch (e) {
    return false;
  }
}

function containsInkblot(urlStr) {
  return String(urlStr).toLowerCase().includes('inkblot');
}

function isLinkedInExcluded(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.endsWith('linkedin.com')) return false;
    // allow linkedin.com/learning
    return !url.pathname.startsWith('/learning');
  } catch (e) {
    return false;
  }
}

function filterCandidates(historyItems = [], openTabs = [], otherDeviceTabs = [], options = {}) {
  const {
    emailDomains = ['gmail.com','mail.google.com', 'outlook.com','live.com', 'hotmail.com', 'yahoo.com'],    excludeOtherDevices = true,
    afterTimestamp = 0,
    beforeTimestamp = null,
    suggestLimit = 15,
  } = options;

  const normalize = (u) => normalizeUrl(u);
  const openSet = new Set(openTabs.map(normalize));
  const otherSet = new Set(otherDeviceTabs.map(normalize));

  const candidates = historyItems
    .filter((item) => {
      if (!item || !item.url) return false;
      const last = item.lastVisitTime != null ? Number(item.lastVisitTime) : null;
      const after = Number(afterTimestamp) || 0;
      const before = beforeTimestamp != null ? Number(beforeTimestamp) : null;
      if (last !== null && last < after) return false;
      if (last !== null && before != null && last >= before) return false;
      const n = normalize(item.url);
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

function rotateSnapshots(snapshots = [], newSnap) {
  const arr = [newSnap, ...snapshots];
  return arr.slice(0, 10);
}

module.exports = {
  normalizeUrl,
  isEmailDomain,
  containsInkblot,
  isLinkedInExcluded,
  filterCandidates,
  rotateSnapshots,
};
