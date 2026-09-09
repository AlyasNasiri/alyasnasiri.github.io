/**
 * Local, lossless text primitives for Alyas Nasiri tools.
 *
 * The structures emitted here describe JavaScript Unicode runtime categories
 * only. They do not identify words, grammar, language, or translations.
 */

export const MAX_TEXT_BYTES = 1_000_000;
export const MAX_DOCUMENTS = 30;
export const MAX_RESULTS = 200;

export { findNext, replaceAll, replaceRange } from "./vendor/find-replace.js";
export { deletePreviousGrapheme } from "./vendor/text.js";

const encoder = new TextEncoder();
const PACKET_FORMAT = "org.alyasnasiri.text-packet";
const PACKET_VERSION = 1;
const DIAGNOSTICS = [
  {
    code: "TECHNICAL_UNICODE_CLASSIFICATION",
    message:
      "Kinds use JavaScript runtime Unicode property escapes. They are technical structure, not linguistic analysis or a Python Unicode-version compatibility claim.",
  },
];

function fail(message) {
  throw new TypeError(message);
}

function hasLoneSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function textMetrics(text) {
  return {
    byteLength: encoder.encode(text).byteLength,
    scalarCount: Array.from(text).length,
  };
}

/** Validates exact JavaScript text without coercion or normalization. */
export function validateText(text) {
  if (typeof text !== "string") fail("Text must be a string.");
  if (hasLoneSurrogate(text)) fail("Text contains a lone UTF-16 surrogate.");
  const { byteLength } = textMetrics(text);
  if (byteLength > MAX_TEXT_BYTES) {
    fail(`Text exceeds the ${MAX_TEXT_BYTES}-byte local limit.`);
  }
  return text;
}

/** Decodes one UTF-8 text payload exactly, including a leading BOM. */
export function decodeUtf8(bytes) {
  if (!(bytes instanceof Uint8Array)) fail("UTF-8 input must be a Uint8Array.");
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    fail("PDF input is not accepted by the text decoder.");
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail("Input is not valid UTF-8.");
  }
  return validateText(text);
}

function technicalKind(char) {
  if (/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u.test(char)) {
    return "space";
  }
  if (/^\p{L}$/u.test(char)) return "letters";
  if (/^\p{M}$/u.test(char)) return "marks";
  if (/^\p{N}$/u.test(char)) return "numbers";
  if (/^\p{P}$/u.test(char)) return "punctuation";
  if (/^\p{C}$/u.test(char)) return "controls";
  return "other";
}

function codePointLabel(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

function utf8ByteLength(char) {
  const codePoint = char.codePointAt(0);
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for packet hashing.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Produces an exact-scalar technical packet. Run boundaries use scalar indexes;
 * editor/search ranges elsewhere use UTF-16 code-unit offsets.
 */
export async function parseText(value) {
  const text = validateText(value);
  const scalars = [];
  const runs = [];
  let utf16Offset = 0;
  let byteOffset = 0;
  let currentRun = null;

  for (const char of text) {
    const kind = technicalKind(char);
    const index = scalars.length;
    scalars.push({
      index,
      utf16Offset,
      byteOffset,
      codePoint: codePointLabel(char),
      char,
      kind,
    });

    if (!currentRun || currentRun.kind !== kind) {
      currentRun = {
        start: index,
        end: index + 1,
        text: "",
        kind,
        _utf16Start: utf16Offset,
        _utf16End: utf16Offset + char.length,
      };
      runs.push(currentRun);
    } else {
      currentRun.end += 1;
      currentRun._utf16End = utf16Offset + char.length;
    }
    utf16Offset += char.length;
    byteOffset += utf8ByteLength(char);
  }

  for (const run of runs) {
    run.text = text.slice(run._utf16Start, run._utf16End);
    delete run._utf16Start;
    delete run._utf16End;
  }

  return {
    format: PACKET_FORMAT,
    version: PACKET_VERSION,
    text,
    sha256: await sha256(text),
    byteLength: byteOffset,
    scalarCount: scalars.length,
    scalars,
    runs,
    diagnostics: DIAGNOSTICS.map((diagnostic) => ({ ...diagnostic })),
  };
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an invalid shape.`);
  }
}

function sameValue(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the recomputed packet.`);
}

/**
 * Verifies an exported packet by recomputing all offsets, run boundaries, and
 * digest. It returns the original exact text only after every check passes.
 */
export async function reconstructPacket(value) {
  let packet = value;
  if (typeof value === "string") {
    try {
      packet = JSON.parse(value);
    } catch {
      fail("Packet JSON is malformed.");
    }
  }
  exactKeys(
    packet,
    ["format", "version", "text", "sha256", "byteLength", "scalarCount", "scalars", "runs", "diagnostics"],
    "Packet",
  );
  sameValue(packet.format, PACKET_FORMAT, "Packet format");
  sameValue(packet.version, PACKET_VERSION, "Packet version");
  validateText(packet.text);
  if (!Array.isArray(packet.scalars) || !Array.isArray(packet.runs) || !Array.isArray(packet.diagnostics)) {
    fail("Packet scalar, run, and diagnostic fields must be arrays.");
  }

  const expected = await parseText(packet.text);
  for (const field of ["sha256", "byteLength", "scalarCount"]) {
    sameValue(packet[field], expected[field], `Packet ${field}`);
  }
  if (packet.scalars.length !== expected.scalars.length || packet.runs.length !== expected.runs.length || packet.diagnostics.length !== expected.diagnostics.length) {
    fail("Packet array lengths do not match the recomputed packet.");
  }
  for (let index = 0; index < expected.scalars.length; index += 1) {
    exactKeys(packet.scalars[index], ["index", "utf16Offset", "byteOffset", "codePoint", "char", "kind"], `Scalar ${index}`);
    for (const key of Object.keys(expected.scalars[index])) {
      sameValue(packet.scalars[index][key], expected.scalars[index][key], `Scalar ${index}.${key}`);
    }
  }
  for (let index = 0; index < expected.runs.length; index += 1) {
    exactKeys(packet.runs[index], ["start", "end", "text", "kind"], `Run ${index}`);
    for (const key of Object.keys(expected.runs[index])) {
      sameValue(packet.runs[index][key], expected.runs[index][key], `Run ${index}.${key}`);
    }
  }
  for (let index = 0; index < expected.diagnostics.length; index += 1) {
    exactKeys(packet.diagnostics[index], ["code", "message"], `Diagnostic ${index}`);
    for (const key of Object.keys(expected.diagnostics[index])) {
      sameValue(packet.diagnostics[index][key], expected.diagnostics[index][key], `Diagnostic ${index}.${key}`);
    }
  }
  return packet.text;
}

function scalarIndexAt(starts, codeUnitOffset) {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] < codeUnitOffset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) index += 1;
      starts.push(index + 1);
    } else if (codeUnit === 0x0a) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineAt(starts, codeUnitOffset) {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= codeUnitOffset) low = middle + 1;
    else high = middle;
  }
  return low;
}

function validatedLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
    throw new RangeError(`Search limit must be an integer from 1 to ${MAX_RESULTS}.`);
  }
  return limit;
}

/** Literal, case-sensitive, mark-sensitive technical search. */
export function searchDocuments(documents, rawQuery, { limit = MAX_RESULTS } = {}) {
  if (!Array.isArray(documents) || documents.length > MAX_DOCUMENTS) {
    throw new RangeError(`Search accepts at most ${MAX_DOCUMENTS} documents.`);
  }
  const query = validateText(rawQuery);
  if (Array.from(query).length > 256) fail("Search query exceeds 256 scalars.");
  const resultLimit = validatedLimit(limit);
  if (query.length === 0) return { matches: [], total: 0, truncated: false };

  const matches = [];
  let total = 0;
  for (const document of documents) {
    if (!document || typeof document !== "object" || typeof document.id !== "string" || typeof document.title !== "string") {
      fail("Each search document needs string id, title, and text fields.");
    }
    validateText(document.title);
    const text = validateText(document.text);
    const characters = Array.from(text);
    const starts = [];
    let offset = 0;
    for (const character of characters) {
      starts.push(offset);
      offset += character.length;
    }
    const documentLineStarts = lineStarts(text);
    let start = 0;
    while (start <= text.length - query.length) {
      const found = text.indexOf(query, start);
      if (found === -1) break;
      const end = found + query.length;
      total += 1;
      if (matches.length < resultLimit) {
        const startScalar = scalarIndexAt(starts, found);
        const endScalar = scalarIndexAt(starts, end);
        matches.push({
          documentId: document.id,
          title: document.title,
          start: found,
          end,
          line: lineAt(documentLineStarts, found),
          before: characters.slice(Math.max(0, startScalar - 45), startScalar).join(""),
          match: query,
          after: characters.slice(endScalar, Math.min(characters.length, endScalar + 45)).join(""),
        });
      }
      start = end;
    }
  }
  return { matches, total, truncated: total > matches.length };
}

function addChange(changes, type, text) {
  if (!text) return;
  const prior = changes.at(-1);
  if (prior?.type === type) prior.text += text;
  else changes.push({ type, text });
}

function preciseDiff(left, right) {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const width = rightScalars.length + 1;
  const cellCount = (leftScalars.length + 1) * width;
  const table = new Uint32Array(cellCount);
  for (let leftIndex = leftScalars.length - 1; leftIndex >= 0; leftIndex -= 1) {
    const row = leftIndex * width;
    const nextRow = (leftIndex + 1) * width;
    for (let rightIndex = rightScalars.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[row + rightIndex] =
        leftScalars[leftIndex] === rightScalars[rightIndex]
          ? table[nextRow + rightIndex + 1] + 1
          : Math.max(table[nextRow + rightIndex], table[row + rightIndex + 1]);
    }
  }
  const changes = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftScalars.length || rightIndex < rightScalars.length) {
    if (leftScalars[leftIndex] === rightScalars[rightIndex]) {
      addChange(changes, "equal", leftScalars[leftIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < rightScalars.length &&
      (leftIndex === leftScalars.length || table[leftIndex * width + rightIndex + 1] > table[(leftIndex + 1) * width + rightIndex])
    ) {
      addChange(changes, "insert", rightScalars[rightIndex]);
      rightIndex += 1;
    } else {
      addChange(changes, "delete", leftScalars[leftIndex]);
      leftIndex += 1;
    }
  }
  return changes;
}

/**
 * A bounded scalar diff. Small inputs receive a complete LCS diff; larger
 * inputs use an explicit full replacement so no text is omitted or truncated.
 */
export function compareTexts(leftValue, rightValue) {
  const left = validateText(leftValue);
  const right = validateText(rightValue);
  if (left === right) {
    return {
      equal: true,
      changes: left ? [{ type: "equal", text: left }] : [],
      truncated: false,
      strategy: "exact",
    };
  }
  const leftScalars = Array.from(left).length;
  const rightScalars = Array.from(right).length;
  const maxCells = 2_000_000;
  if ((leftScalars + 1) * (rightScalars + 1) <= maxCells) {
    return { equal: false, changes: preciseDiff(left, right), truncated: false, strategy: "bounded-scalar-lcs" };
  }
  const changes = [];
  addChange(changes, "delete", left);
  addChange(changes, "insert", right);
  return { equal: false, changes, truncated: false, strategy: "coarse-full-replace" };
}
