/**
 * SudokuPad's loadFPuzzle base64 codec. This is the LZ-String base64 codec used
 * by the captured 0.612.0 build, kept here so native SCL/CTC decoding does not
 * depend on a heuristic collection of lz-string entry points.
 */
const KEY_STR_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const reverseCache = new Map<string, Record<string, number>>();

function getBaseValue(alphabet: string, character: string): number {
  let table = reverseCache.get(alphabet);
  if (!table) {
    table = {};
    for (let i = 0; i < alphabet.length; i += 1) table[alphabet.charAt(i)] = i;
    reverseCache.set(alphabet, table);
  }
  return table[character] ?? 0;
}

function decompressInternal(
  length: number,
  resetValue: number,
  getNextValue: (index: number) => number,
): string | null {
  const dictionary: string[] = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  const result: string[] = [];
  let i: number;
  let w: string;
  let bits: number;
  let resb: number;
  let maxpower: number;
  let power: number;
  let c: string | number;
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (i = 0; i < 3; i += 1) dictionary[i] = String(i);

  bits = 0;
  maxpower = 4;
  power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.val = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (bits) {
    case 0:
      bits = 0; maxpower = 256; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 1:
      bits = 0; maxpower = 65536; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 2:
      return "";
    default:
      return null;
  }

  dictionary[3] = String(c);
  w = String(c);
  result.push(String(c));

  for (;;) {
    if (data.index > length) return "";

    bits = 0;
    maxpower = 2 ** numBits;
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    c = bits;
    if (c === 0) {
      bits = 0; maxpower = 256; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      dictionary[dictSize++] = String.fromCharCode(bits);
      c = dictSize - 1;
      enlargeIn -= 1;
    } else if (c === 1) {
      bits = 0; maxpower = 65536; power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      dictionary[dictSize++] = String.fromCharCode(bits);
      c = dictSize - 1;
      enlargeIn -= 1;
    } else if (c === 2) {
      return result.join("");
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }

    const index = Number(c);
    if (dictionary[index]) entry = dictionary[index];
    else if (index === dictSize) entry = w + w.charAt(0);
    else return null;

    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn -= 1;
    w = entry;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits += 1;
    }
  }
}

export function decompressPuzzleBase64(input: string | null | undefined): string | null {
  if (input == null) return "";
  if (input === "") return null;
  return decompressInternal(input.length, 32, (index) => getBaseValue(KEY_STR_BASE64, input.charAt(index)));
}

/** Matches loadFPuzzle.saveDecompress in the captured build. */
export function saveDecompressPuzzle(input: string): string {
  try {
    const result = decompressPuzzleBase64(input);
    return result == null || result.length < input.length * 0.5 ? input : result;
  } catch {
    return input;
  }
}

/** Matches loadFPuzzle.saveDecodeURIComponent. */
export function saveDecodeURIComponent(input: string): string {
  const decoded = decodeURIComponent(input);
  return decoded.length < input.length ? decoded : input;
}

/**
 * Repairs historical f-puzzles/base64 slash loss. PuzzleLoader applies this to
 * every registered payload before saveDecompress, including SCL/CTC.
 */
export function fixPuzzleSlashes(input: string, maxTimeMs = 1000, maxChecks = 400): string | undefined {
  if (decompressPuzzleBase64(input)) return input;
  const start = Date.now();
  let checks = 0;
  const slashFirst = /^[/](?=([^/]|$))/gm;
  const slash = /[^/][/](?=([^/]|$))/gm;

  const slashPositions = (data: string): number[] => {
    const positions: number[] = [];
    slashFirst.lastIndex = 0;
    const first = slashFirst.exec(data);
    if (first) positions.push(first.index);
    slash.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = slash.exec(data)) !== null) positions.push(match.index + 1);
    return positions;
  };

  const doubleSlashes = (data: string, depth: number): string | undefined => {
    if (depth <= 0 || Date.now() - start >= maxTimeMs || checks++ >= maxChecks) return undefined;
    const positions = slashPositions(data);
    for (const position of positions) {
      const candidate = `${data.slice(0, position)}/${data.slice(position)}`;
      if (depth === 1) {
        if (decompressPuzzleBase64(candidate)) return candidate;
      } else {
        const nested = doubleSlashes(candidate, depth - 1);
        if (nested) return nested;
      }
    }
    return undefined;
  };

  for (let depth = 1; checks < maxChecks && Date.now() - start < maxTimeMs; depth += 1) {
    const fixed = doubleSlashes(input, depth);
    if (fixed) return fixed;
  }
  return undefined;
}

function compressInternal(
  input: string,
  bitsPerChar: number,
  getCharFromInt: (value: number) => string,
): string {
  if (input == null) return "";
  const dictionary: Record<string, number> = {};
  const toCreate: Record<string, boolean> = {};
  let c = "";
  let wc = "";
  let w = "";
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const data: string[] = [];
  let dataVal = 0;
  let dataPosition = 0;

  const writeBit = (bit: number): void => {
    dataVal = (dataVal << 1) | bit;
    if (dataPosition === bitsPerChar - 1) {
      dataPosition = 0;
      data.push(getCharFromInt(dataVal));
      dataVal = 0;
    } else dataPosition += 1;
  };
  const writeValue = (value: number, bits: number): void => {
    for (let i = 0; i < bits; i += 1) {
      writeBit(value & 1);
      value >>= 1;
    }
  };

  for (let ii = 0; ii < input.length; ii += 1) {
    c = input.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
      dictionary[c] = dictSize++;
      toCreate[c] = true;
    }
    wc = w + c;
    if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
      w = wc;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(toCreate, w)) {
      if (w.charCodeAt(0) < 256) {
        writeValue(0, numBits);
        writeValue(w.charCodeAt(0), 8);
      } else {
        writeValue(1, numBits);
        writeValue(w.charCodeAt(0), 16);
      }
      enlargeIn -= 1;
      if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits += 1; }
      delete toCreate[w];
    } else {
      writeValue(dictionary[w], numBits);
    }

    enlargeIn -= 1;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits += 1; }
    dictionary[wc] = dictSize++;
    w = String(c);
  }

  if (w !== "") {
    if (Object.prototype.hasOwnProperty.call(toCreate, w)) {
      if (w.charCodeAt(0) < 256) {
        writeValue(0, numBits);
        writeValue(w.charCodeAt(0), 8);
      } else {
        writeValue(1, numBits);
        writeValue(w.charCodeAt(0), 16);
      }
      enlargeIn -= 1;
      if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits += 1; }
      delete toCreate[w];
    } else writeValue(dictionary[w], numBits);
    enlargeIn -= 1;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits += 1; }
  }

  writeValue(2, numBits);
  for (;;) {
    dataVal <<= 1;
    if (dataPosition === bitsPerChar - 1) {
      data.push(getCharFromInt(dataVal));
      break;
    }
    dataPosition += 1;
  }
  return data.join("");
}

/** Matches loadFPuzzle.compressPuzzle in the captured build. */
export function compressPuzzleBase64(input: string): string {
  if (input == null) return "";
  const result = compressInternal(input, 6, (value) => KEY_STR_BASE64.charAt(value));
  switch (result.length % 4) {
    case 0: return result;
    case 1: return `${result}===`;
    case 2: return `${result}==`;
    case 3: return `${result}=`;
    default: return result;
  }
}
