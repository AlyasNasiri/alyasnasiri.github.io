function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordCharacter(value) {
  return Boolean(value) && /[\p{L}\p{M}\p{N}_]/u.test(value);
}

function isWholeWord(text, start, end) {
  const before = Array.from(text.slice(0, start)).at(-1) ?? "";
  const after = Array.from(text.slice(end))[0] ?? "";
  return !isWordCharacter(before) && !isWordCharacter(after);
}

function matches(text, query, options = {}) {
  if (!query) return [];
  const flags = options.matchCase ? "gu" : "giu";
  const expression = new RegExp(escapeRegExp(query), flags);
  const found = [];
  for (const match of text.matchAll(expression)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!options.wholeWord || isWholeWord(text, start, end)) found.push({ start, end });
  }
  return found;
}

export function findNext(text, query, fromIndex = 0, options = {}) {
  const found = matches(String(text), String(query), options);
  if (!found.length) return null;
  const next = found.find((match) => match.start >= fromIndex);
  return next ? { ...next, wrapped: false } : { ...found[0], wrapped: true };
}

export function replaceRange(text, match, replacement) {
  if (!match) return String(text);
  return `${text.slice(0, match.start)}${String(replacement)}${text.slice(match.end)}`;
}

export function replaceAll(text, query, replacement, options = {}) {
  const value = String(text);
  const found = matches(value, String(query), options);
  if (!found.length) return { text: value, count: 0 };
  let cursor = 0;
  let output = "";
  for (const match of found) {
    output += value.slice(cursor, match.start);
    output += String(replacement);
    cursor = match.end;
  }
  output += value.slice(cursor);
  return { text: output, count: found.length };
}
