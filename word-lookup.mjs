// Source records remain intact. Matching describes retrieval, not a selected sense.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function text(value, label, {empty = false, max = 20000} = {}) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > max || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`Invalid ${label}.`);
}
function source(value) {
  keys(value, ['title', 'locator', 'url'], 'source');
  text(value.title, 'source title', {max: 500});
  text(value.locator, 'source locator', {max: 500});
  if (value.url !== undefined) {
    text(value.url, 'source URL', {max: 2000});
    if (!/^https:\/\//.test(value.url)) throw new Error('Invalid source URL.');
  }
}
export function validateCollection(value) {
  keys(value, ['schemaVersion', 'title', 'description', 'publicationStatus', 'entries'], 'dictionary collection');
  if (value.schemaVersion !== 1 || !['review', 'public'].includes(value.publicationStatus)) throw new Error('Unsupported dictionary collection.');
  text(value.title, 'collection title', {max: 500});
  text(value.description, 'collection description', {empty: true, max: 2000});
  if (!Array.isArray(value.entries) || value.entries.length > 2000) throw new Error('Invalid dictionary entries.');
  const seen = new Set();
  for (const entry of value.entries) {
    keys(entry, ['id', 'headword', 'senses', 'examples', 'dialect', 'source', 'pronunciation', 'alternates', 'roman'], 'dictionary entry');
    text(entry.id, 'entry ID', {max: 100});
    if (seen.has(entry.id)) throw new Error('Duplicate dictionary entry ID.');
    seen.add(entry.id);
    text(entry.headword, 'headword', {max: 1000});
    text(entry.dialect, 'dialect', {max: 200});
    source(entry.source);
    if (!Array.isArray(entry.senses) || !entry.senses.length || entry.senses.length > 50) throw new Error('Invalid dictionary senses.');
    for (const sense of entry.senses) {
      keys(sense, ['language', 'text'], 'sense');
      if (!['en', 'ur', 'bsk'].includes(sense.language)) throw new Error('Invalid sense language.');
      text(sense.text, 'sense');
    }
    if (!Array.isArray(entry.examples) || entry.examples.length > 20) throw new Error('Invalid dictionary examples.');
    for (const example of entry.examples) {
      keys(example, ['text', 'translation', 'language', 'source'], 'example');
      text(example.text, 'example');
      text(example.translation, 'example translation', {empty: true});
      if (!['en', 'ur', 'bsk', 'unspecified'].includes(example.language)) throw new Error('Invalid example language.');
      source(example.source);
    }
    if (!Array.isArray(entry.alternates) || entry.alternates.length > 20) throw new Error('Invalid alternate forms.');
    for (const alternate of entry.alternates) text(alternate, 'alternate form', {max: 1000});
    if (entry.pronunciation !== null) {
      keys(entry.pronunciation, ['text', 'notation', 'source'], 'pronunciation');
      text(entry.pronunciation.text, 'pronunciation', {max: 1000});
      text(entry.pronunciation.notation, 'pronunciation notation', {max: 200});
      source(entry.pronunciation.source);
    }
    if (entry.roman !== undefined && entry.roman !== null) {
      keys(entry.roman, ['text', 'source'], 'source Roman spelling');
      text(entry.roman.text, 'source Roman spelling', {max: 1000});
      source(entry.roman.source);
    }
  }
  return value;
}

export function searchWords(collection, query, {limit = 50} = {}) {
  text(query, 'search query', {empty: true, max: 500});
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error('Invalid search limit.');
  const found = [];
  for (const entry of collection.entries) {
    let best = query === '' ? {field: 'headword', kind: 'browse', rank: 4} : null;
    const fields = [
      {field: 'headword', value: entry.headword},
      ...entry.alternates.map(value => ({field: 'alternate', value})),
      ...entry.senses.map(sense => ({field: sense.language === 'en' ? 'English meaning' : sense.language === 'ur' ? 'Urdu meaning' : 'meaning', value: sense.text, english: sense.language === 'en'})),
      ...(entry.roman ? [{field: 'source Roman spelling', value: entry.roman.text}] : []),
    ];
    if (query !== '') for (const item of fields) {
      let kind, rank;
      if (item.value === query) { kind = 'exact'; rank = 0; }
      else if (item.english && item.value.toLowerCase() === query.toLowerCase()) { kind = 'English case-insensitive'; rank = 1; }
      else if (item.value.startsWith(query)) { kind = 'prefix'; rank = 2; }
      else if (item.value.includes(query)) { kind = 'contains'; rank = 3; }
      else if (item.english && item.value.toLowerCase().includes(query.toLowerCase())) { kind = 'English case-insensitive contains'; rank = 3; }
      else continue;
      if (!best || rank < best.rank) best = {field: item.field, kind, rank};
    }
    if (best) found.push({entry, match: {field: best.field, kind: best.kind}, rank: best.rank});
  }
  found.sort((left, right) => left.rank - right.rank);
  return {results: found.slice(0, limit).map(({entry, match}) => ({entry, match})), total: found.length, truncated: found.length > limit};
}
