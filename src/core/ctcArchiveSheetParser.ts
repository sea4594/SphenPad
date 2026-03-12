export type ParsedArchiveSheetRow = {
  values: string[];
  sudokuPadUrl: string;
};

export type ParsedArchiveSheet = {
  header: string[];
  rows: ParsedArchiveSheetRow[];
};

type GvizCell = { v?: unknown; f?: unknown; p?: unknown } | null;

const SUDOKUPAD_URL_IN_ROW_REGEX = /https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\/[^\s"'<>)\\]+/i;
const SUDOKUPAD_URL_BY_ROW_REGEX =
  /\\"3\\":\[2,\\"G(\d+)\\"].{0,12000}?\\"24\\":\\"(https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\/[^\\"]+)\\"/gis;

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

function normalizeHeader(v: string): string {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findIndexByAliases(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases.map(normalizeHeader)) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function findSudokuPadUrlInText(text: string): string {
  const match = text.match(SUDOKUPAD_URL_IN_ROW_REGEX);
  return clean(match?.[0]);
}

function decodeEscapedUrl(url: string): string {
  return url
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
}

function parseSudokuPadUrlByRowNumber(sourcePayload: string): Map<number, string> {
  const urlByRowNumber = new Map<number, string>();
  for (const match of sourcePayload.matchAll(SUDOKUPAD_URL_BY_ROW_REGEX)) {
    const rowNumber = Number(match[1]);
    if (!Number.isFinite(rowNumber) || rowNumber <= 0) continue;
    const sudokuPadUrl = clean(decodeEscapedUrl(match[2]));
    if (!sudokuPadUrl) continue;
    urlByRowNumber.set(rowNumber, sudokuPadUrl);
  }
  return urlByRowNumber;
}

function findSudokuPadUrlInCell(cell: GvizCell): string {
  if (!cell) return "";
  const value = cell.v;
  if (typeof value === "string") {
    const fromValue = findSudokuPadUrlInText(value);
    if (fromValue) return fromValue;
  }
  const formatted = cell.f;
  if (typeof formatted === "string") {
    const fromFormatted = findSudokuPadUrlInText(formatted);
    if (fromFormatted) return fromFormatted;
  }
  const metadataText = JSON.stringify(cell).replace(/\\\//g, "/");
  return findSudokuPadUrlInText(metadataText);
}

function extractSudokuPadUrlForRow(cells: GvizCell[], iSudokuPad: number): string {
  if (iSudokuPad >= 0) {
    const fromSudokuPadCell = findSudokuPadUrlInCell(cells[iSudokuPad] ?? null);
    if (fromSudokuPadCell) return fromSudokuPadCell;
  }
  for (const cell of cells) {
    const found = findSudokuPadUrlInCell(cell);
    if (found) return found;
  }
  return "";
}

export function parseArchiveSheetPayload(payload: string, sourcePayload = ""): ParsedArchiveSheet {
  const prefix = "google.visualization.Query.setResponse(";
  const start = payload.indexOf(prefix);
  if (start < 0) return { header: [], rows: [] };
  let jsonText = payload.slice(start + prefix.length).trim();
  if (jsonText.endsWith(");")) jsonText = jsonText.slice(0, -2);
  const parsed = JSON.parse(jsonText) as {
    table?: {
      cols?: Array<{ label?: string }>;
      rows?: Array<{ c?: GvizCell[] }>;
    };
  };
  const cols = parsed.table?.cols ?? [];
  const rawRows = parsed.table?.rows ?? [];
  const header = cols.map((c) => clean(c.label));
  const iSudokuPad = findIndexByAliases(header, ["sp", "sudokupad", "sudoku pad", "puzzle link", "sudokupadlink"]);
  const sudokuPadUrlByRowNumber = sourcePayload ? parseSudokuPadUrlByRowNumber(sourcePayload) : new Map<number, string>();
  const rows = rawRows
    .map((row, index) => {
      const cells = row.c ?? [];
      const values = cells.map((cell) => {
        if (!cell || cell.v == null) return "";
        const cellValue = cell.v;
        if (typeof cellValue === "string") return clean(cellValue);
        return clean(String(cellValue));
      });
      const rowNumber = index + 2;
      const sudokuPadUrlFromRow = extractSudokuPadUrlForRow(cells, iSudokuPad);
      const sudokuPadUrl = sudokuPadUrlFromRow || clean(sudokuPadUrlByRowNumber.get(rowNumber));
      return { values, sudokuPadUrl };
    })
    .filter((row) => row.values.some((cell) => clean(cell)) || row.sudokuPadUrl);
  return { header, rows };
}
