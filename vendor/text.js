export function characterCount(value) {
  return Array.from(String(value)).length;
}

export function wordCount(value) {
  const trimmed = String(value).trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function utf8ByteCount(value) {
  return new TextEncoder().encode(String(value)).length;
}

export function deletePreviousGrapheme(value, cursor) {
  const text = String(value);
  if (cursor <= 0) return { text, cursor: 0 };
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(before));
  const last = segments.at(-1);
  if (!last) return { text, cursor };
  return {
    text: before.slice(0, last.index) + after,
    cursor: last.index,
  };
}

export function codePointLabel(character) {
  if (!character) return "";
  return Array.from(character)
    .map((item) => `U+${item.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}
