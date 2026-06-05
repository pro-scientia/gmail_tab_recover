const {
  normalizeUrl,
  isEmailDomain,
  containsInkblot,
  isLinkedInExcluded,
  filterCandidates,
} = require('../src/filters');

test('normalizeUrl removes protocol and www', () => {
  const inUrl = 'https://www.Example.com/path/page?x=1#frag';
  expect(normalizeUrl(inUrl)).toBe('example.com/path/page?x=1');
});

test('isEmailDomain matches common email hosts', () => {
  expect(isEmailDomain('https://mail.google.com/mail/u/0/#inbox', ['mail.google.com'])).toBe(true);
  expect(isEmailDomain('https://gmail.com/mail/u/0/#inbox', ['gmail.com'])).toBe(true);
  expect(isEmailDomain('https://outlook.live.com/mail/', ['outlook.com'])).toBe(false);
  expect(isEmailDomain('https://outlook.live.com/mail/', ['live.com'])).toBe(true);
  expect(isEmailDomain('https://outlook.live.com/mail/', ['outlook.com', 'live.com'])).toBe(true);
  expect(isEmailDomain('https://example.com', ['gmail.com'])).toBe(false);
});

test('containsInkblot detects inkblot in url', () => {
  expect(containsInkblot('https://app.inkblot.example.com/session')).toBe(true);
  expect(containsInkblot('https://example.com')).toBe(false);
});

test('isLinkedInExcluded excludes linkedin except /learning', () => {
  expect(isLinkedInExcluded('https://www.linkedin.com/in/someone')).toBe(true);
  expect(isLinkedInExcluded('https://www.linkedin.com/learning/some-course')).toBe(false);
  expect(isLinkedInExcluded('https://otherdomain.com/linkedin.com')).toBe(false);
});

test('filterCandidates filters out open tabs, other-device tabs and email/inkblot/linkedin', () => {
  const history = [
    { url: 'https://example.com/page1', lastVisitTime: 2000 },
    { url: 'https://example.com/page2', lastVisitTime: 1500 },
    { url: 'https://mail.google.com/mail/u/0/#inbox', lastVisitTime: 1800 },
    { url: 'https://app.inkblot.test/session', lastVisitTime: 1700 },
    { url: 'https://www.linkedin.com/in/foo', lastVisitTime: 1600 },
    { url: 'https://other.com', lastVisitTime: 1400 },
  ];

  const openTabs = ['https://example.com/page2'];
  const otherTabs = ['https://other.com'];

  const candidates = filterCandidates(history, openTabs, otherTabs, {
    emailDomains: ['mail.google.com'],
    excludeOtherDevices: true,
    afterTimestamp: 0,
    suggestLimit: 10,
  });

  const urls = candidates.map((c) => c.url);
  expect(urls).toEqual(['https://example.com/page1']);
});

test('filterCandidates respects beforeTimestamp (excludes items >= before)', () => {
  const history = [
    { url: 'https://old.com', lastVisitTime: 1000 },
    { url: 'https://mid.com', lastVisitTime: 2000 },
    { url: 'https://new.com', lastVisitTime: 3000 },
  ];

  const candidates = filterCandidates(history, [], [], {
    afterTimestamp: 0,
    beforeTimestamp: 2500,
    suggestLimit: 10,
  });

  const urls = candidates.map((c) => c.url);
  // should include items with lastVisitTime < 2500, newest-first
  expect(urls).toEqual(['https://mid.com', 'https://old.com']);
});

test('filterCandidates excludes items equal to beforeTimestamp (boundary excluded)', () => {
  const history = [
    { url: 'https://old.com', lastVisitTime: 1000 },
    { url: 'https://eq.com', lastVisitTime: 2500 },
  ];

  const candidates = filterCandidates(history, [], [], {
    afterTimestamp: 0,
    beforeTimestamp: 2500,
    suggestLimit: 10,
  });

  const urls = candidates.map((c) => c.url);
  expect(urls).toEqual(['https://old.com']);
});

test('filterCandidates supports combined afterTimestamp and beforeTimestamp (range)', () => {
  const history = [
    { url: 'https://old.com', lastVisitTime: 1000 },
    { url: 'https://mid.com', lastVisitTime: 2000 },
    { url: 'https://new.com', lastVisitTime: 3000 },
  ];

  const candidates = filterCandidates(history, [], [], {
    afterTimestamp: 1500,
    beforeTimestamp: 3000,
    suggestLimit: 10,
  });

  const urls = candidates.map((c) => c.url);
  expect(urls).toEqual(['https://mid.com']);
});
