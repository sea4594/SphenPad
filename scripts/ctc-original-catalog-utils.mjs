/** Pure parsing and key helpers for the original CtC catalogue migration. */
import { createHash } from 'node:crypto';

export const ORIGINAL_CTC_SHEET = 'https://docs.google.com/spreadsheets/d/1rVqAjm-l_Urjd3TNmIc3SmTmz_OlgSoBuhY7RPgiuRg/export?format=xlsx';
export const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
export const MAX_PUZZLE_BYTES = 8_000_000;
export const clean = value => String(value ?? '').trim();
const norm = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

export function fieldIndex(headers, aliases) {
  const normalized = headers.map(norm);
  for (const name of aliases) {
    const exact = normalized.indexOf(norm(name));
    if (exact >= 0) return exact;
  }
  for (const name of aliases) {
    const index = normalized.findIndex(h => h.includes(norm(name)));
    if (index >= 0) return index;
  }
  return -1;
}

export function youtubeId(input) {
  const value = clean(input);
  if (VIDEO_ID_REGEX.test(value)) return value;
  const found = value.match(/(?:[?&]v=|youtu\.be\/|youtube\.com\/(?:shorts|embed|live|v)\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i);
  if (found) return found[1];
  return '';
}

export function youtubeUrlFor(input) {
  const id = youtubeId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

export function urlFromCell(cell) {
  const link = clean(cell?.l?.Target);
  if (link) return link;
  const formula = clean(cell?.f);
  const match = formula.match(/^HYPERLINK\(\s*"((?:[^"]|"")+)"\s*[,;]/i);
  if (match) return match[1].replace(/""/g, '"');
  const raw = clean(cell?.v);
  if (/https?:\/\//i.test(raw)) return raw;
  return '';
}

export function constraintsToLabels(input) {
  const value = clean(input);
  if (!value) return '';
  let parts = [];
  try {
    const data = JSON.parse(value);
    if (Array.isArray(data)) parts = data.map(clean);
  } catch { /* plain text */ }
  if (!parts.length) parts = value.split(/\s*[;,]\s*/);
  return [...new Set(parts.map(clean).filter(Boolean))].join('; ');
}

export function durationSeconds(text) {
  const value = clean(text).toLowerCase();
  if (/^\d+:\d{2}(?::\d{2})?$/.test(value)) {
    const a = value.split(':').map(Number);
    return a.length === 2 ? a[0] * 60 + a[1] : a[0] * 3600 + a[1] * 60 + a[2];
  }
  const h = Number((value.match(/(\d+)\s*h/) || [])[1] || 0);
  const m = Number((value.match(/(\d+)\s*m/) || [])[1] || 0);
  const s = Number((value.match(/(\d+)\s*s/) || [])[1] || 0);
  return h || m || s ? h * 3600 + m * 60 + s : null;
}

function dateInfo(text) {
  const value = clean(text);
  if (!value) return { videoDate: '', videoDateTs: null };
  const ms = Date.parse(value);
  return { videoDate: value, videoDateTs: Number.isFinite(ms) ? ms : null };
}

/** Parse a named table from the ORIGINAL workbook, not a user-maintained link sheet. */
export function parseCatalogTable({ name, headers, rows, cellLinks = [] }) {
  const titleAt = fieldIndex(headers, ['Puzzle Title', 'Puzzle Name']);
  const videoAt = fieldIndex(headers, ['Link YT', 'Youtube Link', 'Video URL', 'Youtube URL', 'Video Link', 'Video']);
  const videoTitleAt = fieldIndex(headers, ['Video Title', 'Video']);
  if (titleAt < 0 || videoAt < 0) return [];
  const idAt = fieldIndex(headers, ['Id', 'Entry ID', 'Catalog ID']);
  const typeAt = fieldIndex(headers, ['Video Type', 'Puzzle Type', 'Type']);
  const constraintsAt = fieldIndex(headers, ['Puzzle Sub-Type / Constraints', 'Constraints', 'Sub-Type']);
  const dateAt = fieldIndex(headers, ['Video Date', 'Date']);
  const authorAt = fieldIndex(headers, ['Setter', 'Puzzle Author', 'Author']);
  const hostAt = fieldIndex(headers, ['Host/Solver', 'Solver', 'Host', 'Video Host']);
  const lengthAt = fieldIndex(headers, ['Video Length', 'Duration']);
  const collectionAt = fieldIndex(headers, ['Collection', 'Series']);
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const val = index => index < 0 ? '' : clean(row[index]);
    const title = val(titleAt);
    if (!title || /^puzzle title$/i.test(title)) continue;
    const links = cellLinks[i] || [];
    const videoRaw = [links[videoAt], val(videoAt), links[videoTitleAt], val(videoTitleAt), ...links, ...row]
      .map(clean).find(x => youtubeId(x));
    const videoId = youtubeId(videoRaw);
    if (!videoId) continue;
    const sourceNumber = val(idAt);
    const stableCatalogId = sourceNumber && /^[\w.-]{1,80}$/.test(sourceNumber)
      ? `ctc-${sourceNumber}`
      : `ctc-${createHash('sha256').update(`${videoId}|${title.toLowerCase()}|${val(dateAt)}`).digest('hex').slice(0, 16)}`;
    const date = dateInfo(val(dateAt));
    const sourceType = val(typeAt) || (/pencil/i.test(name) ? 'Pencil Puzzle' : 'Sudoku');
    result.push({
      id: stableCatalogId,
      title,
      subTypeConstraints: constraintsToLabels(val(constraintsAt)),
      videoTitle: val(videoTitleAt) || title,
      videoLength: val(lengthAt),
      videoLengthSeconds: durationSeconds(val(lengthAt)),
      ...date,
      puzzleAuthor: val(authorAt),
      videoHost: val(hostAt),
      collection: val(collectionAt),
      videoType: sourceType,
      sudokuPadUrl: '',
      youtubeUrl: youtubeUrlFor(videoId),
      sourceId: '',
      stableKey: '',
      cacheKey: '',
    });
  }
  return result;
}

export function parseOriginalWorkbook(XLSX, workbook) {
  const entries = new Map();
  const sheets = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    const headerAt = matrix.slice(0, 25).findIndex(row => {
      const headers = row.map(clean);
      return fieldIndex(headers, ['Puzzle Title', 'Puzzle Name']) >= 0 &&
        fieldIndex(headers, ['Link YT', 'Youtube Link', 'Video URL', 'Video Link', 'Video']) >= 0;
    });
    if (headerAt < 0) continue;
    const headers = matrix[headerAt].map(clean);
    const rows = matrix.slice(headerAt + 1);
    const cellLinks = rows.map((row, index) => Array.from({ length: Math.max(row.length, headers.length) }, (_, col) => {
      const address = XLSX.utils.encode_cell({ r: headerAt + index + 1, c: col });
      return urlFromCell(sheet[address]);
    }));
    const parsed = parseCatalogTable({ name, headers, rows, cellLinks });
    sheets.push(`${name}: ${parsed.length}`);
    for (const item of parsed) {
      const video = youtubeId(item.youtubeUrl);
      const key = /^ctc-[0-9]+$/.test(item.id) ? item.id : `${video}\0${norm(item.title)}`;
      const prior = entries.get(key);
      if (!prior || (item.subTypeConstraints && !prior.subTypeConstraints)) entries.set(key, item);
    }
  }
  return { entries: [...entries.values()], sheets };
}

export function normalizeUrl(input) {
  let url = clean(input).replace(/^(?:<|\[|\(|["'])+/, '').replace(/[\])}>.,;!?"']+$/g, '');
  url = url.replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
  if (/^www\./i.test(url)) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    // Reject punctuation-only/wrong-domain artifacts from descriptions.
    return parsed.href;
  } catch { return ''; }
}

export const PUZZLE_HOSTS = new Set([
  'sudokupad.app', 'www.sudokupad.app', 'app.crackingthecryptic.com', 'cracking-the-cryptic.web.app',
  'cracking-the-cryptic.firebaseapp.com', 'f-puzzles.com', 'www.f-puzzles.com',
]);
export const REDIRECT_HOSTS = new Set([
  'tinyurl.com', 'www.tinyurl.com', 'bit.ly', 'www.bit.ly', 't.co',
  'shorturl.at', 'www.shorturl.at', 'is.gd', 'v.gd', 'tiny.cc', 'www.tiny.cc',
  'cutt.ly', 'www.cutt.ly', 'rebrand.ly', 'www.rebrand.ly',
  'linktr.ee', 'www.linktr.ee', 'dailykillersudoku.com', 'www.dailykillersudoku.com',
  'sudokumaker.app', 'www.sudokumaker.app',
  'rb.gy', 'tiny.one', 't.ly', 's.id', 'lnkd.in',
  'logic-masters.de', 'www.logic-masters.de',
]);
export function isPuzzleHost(url) { try { return PUZZLE_HOSTS.has(new URL(url).hostname.toLowerCase()); } catch { return false; } }
export function isAllowedHost(url) {
  try { const host = new URL(url).hostname.toLowerCase(); return PUZZLE_HOSTS.has(host) || REDIRECT_HOSTS.has(host); }
  catch { return false; }
}

/** Keep every plausible URL in description order, not merely the first match. */
export function descriptionLinks(description) {
  const result = [];
  const seen = new Set();
  const normalized = clean(description).replace(/&amp;/gi, '&');
  const regex = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  for (const match of normalized.matchAll(regex)) {
    const url = normalizeUrl(match[0]);
    if (!url || !isAllowedHost(url) || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

/** Interpret importable embedded formats and the two remote SudokuPad hosts. */
export function sourceFromUrl(input) {
  const url = normalizeUrl(input);
  if (!url || !isPuzzleHost(url)) return null;
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const param = (u.searchParams.get('load') || u.searchParams.get('puzzle') || '').replace(/ /g, '+');
  const hash = (new URLSearchParams(u.hash.replace(/^#/, '')).get('load') || '').replace(/ /g, '+');
  let decodedPath = '';
  try { decodedPath = decodeURIComponent(u.pathname.replace(/^\/+/, '')); }
  catch { return null; }
  let source = clean(param || hash || decodedPath);
  if (host.includes('f-puzzles.com')) {
    if (!param && !hash) return null;
    if (!/^[A-Za-z0-9+/_=:%.-]{20,}$/.test(source)) return null;
    source = source.startsWith('fpuz') ? source : `fpuz${source}`;
  }
  if (/^(?:sudoku|puzzle|webapp)\//i.test(source)) {
    // Keep the /sudoku/ prefix as current CtC cache identity uses it.
    source = source.replace(/^\/+/, '');
  }
  if (!source || /(?:\.html?|\.js|\.css|\.png|\.svg)$/i.test(source)) return null;
  if (!/^(?:scl|ctc|fpuz|fpuzzles|scf|pack)/.test(source) && !/^[\w/-]{2,200}$/.test(source)) return null;
  return { sourceId: source, sudokuPadUrl: url };
}

export function stableKey(sourceId) {
  const base = clean(sourceId).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 200);
  return base || createHash('sha256').update(sourceId).digest('hex').slice(0, 24);
}
export function looksLikePayload(text) {
  const value = clean(text);
  if (!value || value.length > MAX_PUZZLE_BYTES || /^\s*<(!doctype|html)/i.test(value)) return false;
  if (/^(?:scl|ctc|fpuz|fpuzzles|scf|pack)[\w+/=:%.-]{10,}/.test(value)) return true;
  if (/^\{/.test(value) && /(?:["']?(?:cells|grid|id|size|cs)["']?\s*:)/.test(value)) return true;
  if (/^\[/.test(value) && /(?:cell|grid|puzzle|given|value)/i.test(value)) return true;
  return false;
}

export function reconcileExisting(entries, oldEntries) {
  const byVideoTitle = new Map();
  const byVideo = new Map();
  for (const old of oldEntries || []) {
    const v = youtubeId(old.youtubeUrl);
    if (!v) continue;
    const k = `${v}\0${norm(old.title)}`;
    byVideoTitle.set(k, old);
    const arr = byVideo.get(v) || [];
    arr.push(old);
    byVideo.set(v, arr);
  }
  const usedIds = new Set();
  for (const entry of entries) {
    const video = youtubeId(entry.youtubeUrl);
    const candidate = byVideoTitle.get(`${video}\0${norm(entry.title)}`) ||
      (byVideo.get(video)?.length === 1 ? byVideo.get(video)[0] : null);
    if (!candidate || usedIds.has(candidate.id)) continue;
    usedIds.add(candidate.id);
    entry.id = candidate.id; // preserve saved archive navigation identities
    if (candidate.sourceId && candidate.cacheKey) {
      entry.sourceId = candidate.sourceId;
      entry.sudokuPadUrl = candidate.sudokuPadUrl;
      entry.stableKey = candidate.stableKey;
      entry.cacheKey = candidate.cacheKey;
    }
  }
}
