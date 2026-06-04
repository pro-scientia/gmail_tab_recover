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
  expect(isEmailDomain('https://mail.google.com/mail/u/0/#inbox', ['gmail.com'])).toBe(true);
  expect(isEmailDomain('https://outlook.live.com/mail/', ['outlook.com'])).toBe(true);
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
    emailDomains: ['gmail.com'],
    excludeOtherDevices: true,
    afterTimestamp: 0,
    suggestLimit: 10,
  });

  const urls = candidates.map((c) => c.url);
  expect(urls).toEqual(['https://example.com/page1']);
});
