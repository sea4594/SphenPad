/** LMG catalog parsing. Pure helpers: no browser or repository dependencies. */
import { createHash } from 'node:crypto';
import { descriptionLinks, isAllowedHost, isPuzzleHost, normalizeUrl, sourceFromUrl } from './ctc-original-catalog-utils.mjs';

export const LMG_LIST_URL = 'https://logic-masters.de/Raetselportal/Suche/spezial.php?chlang=en&listname=sudokus';
export const LMG_DETAIL_URL = id => `https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=${encodeURIComponent(id)}`;
export const LMG_PAGE_SIZE = 20;
export const LMG_SOURCE_HOSTS = new Set(['logic-masters.de', 'www.logic-masters.de']);
export const VALID_LMG_ID = /^[a-zA-Z0-9]{5,10}$/;

export function decodeHtml(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', rsquo: '’', lsquo: '‘' };
  return String(value ?? '').replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (ent, key) => {
    if (key[0] === '#') {
      const code = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ent;
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : ent;
  });
}
export const stripHtml = text => decodeHtml(String(text ?? '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

function parseLmgId(href, base) {
  try {
    const url = new URL(decodeHtml(href), base);
    if (!LMG_SOURCE_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (!/\/Raetselportal\/Raetsel\/zeigen\.php$/i.test(url.pathname)) return null;
    const id = url.searchParams.get('id') ?? '';
    return VALID_LMG_ID.test(id) ? id : null;
  } catch { return null; }
}

/** Take only puzzle links, not author/page-navigation links. */
export function parseLmgListing(html, baseUrl = LMG_LIST_URL) {
  const found = new Map();
  const re = /<a\b([^>]*?)href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of String(html).matchAll(re)) {
    const id = parseLmgId(match[2] || match[3] || match[4], baseUrl);
    if (!id) continue;
    const title = stripHtml(match[6]);
    if (!title || title.length > 350) continue;
    if (!found.has(id)) found.set(id, { id, title, lmgUrl: LMG_DETAIL_URL(id) });
  }
  return [...found.values()];
}

/** Prevent comment-only links from being treated as author-supplied puzzle links. */
export function puzzleDescriptionHtml(html) {
  let body = String(html ?? '');
  // Cut at first page marker that always follows the puzzle description.
  const endings = [
    /Zuletzt\s+geändert\s+am/i,
    /Last\s+(?:edited|modified)\s+on/i,
    /<h[1-6][^>]*>\s*(?:Kommentare|Comments)\b/i,
    /<[^>]+\b(?:id|class)=["'][^"']*(?:comment-list|comments|kommentare)[^"']*["']/i,
    /<h[1-6][^>]*>\s*(?:Lösung\s+abgeben|Submit\s+solution)\b/i,
  ];
  const boundaries = endings.map(re => re.exec(body)?.index).filter(n => Number.isInteger(n));
  if (boundaries.length) body = body.slice(0, Math.min(...boundaries));
  // The description starts after the heading / publication line. Other page links
  // are discarded below by filtering for recognized puzzle/redirect hosts.
  return body;
}

export function extractDescriptionPuzzleLinks(html) {
  const description = puzzleDescriptionHtml(html);
  const links = new Set(descriptionLinks(decodeHtml(description)));
  const a = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  for (const match of description.matchAll(a)) {
    const candidate = normalizeUrl(decodeHtml(match[1] || match[2]));
    if (candidate && isAllowedHost(candidate) && !LMG_SOURCE_HOSTS.has(new URL(candidate).hostname.toLowerCase())) links.add(candidate);
  }
  return [...links].filter(link => {
    const host = new URL(link).hostname.toLowerCase();
    return isPuzzleHost(link) || (isAllowedHost(link) && !LMG_SOURCE_HOSTS.has(host));
  });
}

export function extractLmgMetadata(html, known = {}) {
  const text = stripHtml(puzzleDescriptionHtml(html));
  const full = stripHtml(html);
  const rating = /(?:Bewertung|Rating)\s*:?\s*(\d{1,3})\s*%/i.exec(full);
  const solves = /(?:Gelöst|Solved)\s*:?\s*(\d[\d.,]*)\s*(?:mal|times)?/i.exec(full);
  const difficultyImg = /(?:alt|title)=["']([^"']*(?:leichtes|mittelschweres|schweres|easy|medium|hard|difficult)[^"']*)["']/i.exec(html);
  const author = /(?:Eingestellt\s+am|Published\s+on)[\s\S]{0,170}?(?:von|by)\s*<a\b[^>]*>([^<]+)<\/a>/i.exec(html);
  const date = /(?:Eingestellt\s+am|Published\s+on)\s*([^<\n]{6,55}?)(?:\s+(?:von|by)\b|<)/i.exec(html)
    || /(?:Eingestellt\s+am|Published\s+on)\s*([^\n]{6,55}?)\s+(?:von|by)\b/i.exec(text);
  const puzzleTags = [...String(html).matchAll(/<a\b[^>]+href=["'][^"']*Suche[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => stripHtml(match[1])).filter(tag => tag && tag.length < 60 && !/^(?:Sudoku|Rätselportal|Search|Raetsel)$/i.test(tag));
  return {
    title: known.title || '',
    puzzleAuthor: known.puzzleAuthor || (author ? stripHtml(author[1]) : ''),
    difficulty: difficultyImg ? stripHtml(difficultyImg[1]) : '',
    rating: rating ? Number(rating[1]) : null,
    solves: solves ? Number(solves[1].replace(/[,.]/g, '')) : null,
    published: date ? stripHtml(date[1]) : '',
    subTypeConstraints: [...new Set(puzzleTags)].join('; '),
  };
}

/** Stable per-creator-page IDs; duplicates within a page get distinct catalog rows. */
export function catalogEntryFromSource(item, link, source, cacheKey, ordinal) {
  if (!VALID_LMG_ID.test(item.id) || !source?.sourceId || !cacheKey) return null;
  return {
    id: `lmg-${item.id}-${ordinal}`,
    title: item.title,
    subTypeConstraints: item.subTypeConstraints || '',
    videoTitle: item.difficulty ? `Difficulty: ${item.difficulty}` : 'LMG puzzle',
    videoLength: '', videoLengthSeconds: null,
    videoDate: item.published || '', videoDateTs: item.dateTs ?? null,
    puzzleAuthor: item.puzzleAuthor || '', videoHost: 'LMG', collection: '',
    videoType: 'Sudoku', sudokuPadUrl: link, youtubeUrl: '',
    lmgUrl: item.lmgUrl || LMG_DETAIL_URL(item.id), lmgId: item.id,
    lmgDifficulty: item.difficulty || '',
    lmgRating: Number.isFinite(item.rating) ? item.rating : null,
    lmgSolves: Number.isFinite(item.solves) ? item.solves : null,
    sourceId: source.sourceId, stableKey: cacheKey, cacheKey,
  };
}

export function nextCacheKey(sourceId, reserved) {
  const safe = String(sourceId).replace(/[^\w.-]/g, '_').replace(/_+/g, '_').slice(0, 180);
  const digest = createHash('sha256').update(sourceId).digest('hex').slice(0, 14);
  const key = safe.length && safe.length < 90 ? safe : `${safe.slice(0, 64)}_${digest}`;
  if (!reserved.has(key) || reserved.get(key) === sourceId) return key;
  return `${key.slice(0, 65)}_${digest}`;
}

export { sourceFromUrl };
