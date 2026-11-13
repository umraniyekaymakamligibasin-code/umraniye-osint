/*
 * UMRANIYE OSINT - SPOR ICERIK FILTRESI
 * Yalnizca Umraniyespor futbol kulubunu engeller.
 * Diger Umraniye spor haberlerini korur.
 */

const BLOCK_PATTERNS = [
  /\bumraniyespor[a-z0-9]*\b/,
  /\bumraniye[\s._-]+spor[\s._-]+(?:kulubu|fk|sk)\b/
];

const FIELDS = [
  "title", "headline", "text", "body", "content",
  "description", "summary", "caption", "message",
  "url", "link", "permalink", "source_url",
  "sourceUrl", "source_name", "sourceName",
  "account", "username", "page_name", "pageName",
  "name", "tags", "hashtags"
];

const NESTED = [
  "sources", "eventSources", "eventEvidence", "source", "author", "post", "article",
  "event", "payload", "data", "metadata"
];

function normalize(value) {
  let text = String(value ?? "");

  try {
    text = decodeURIComponent(text);
  } catch {
    // Bozuk URL kodlamasi filtreyi durdurmaz.
  }

  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u0131/g, "i")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function collect(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === "string") return [value];

  if (!value || typeof value !== "object" || depth > 5)
    return [];

  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap(v => collect(v, seen, depth + 1));
  }

  const result = [];

  for (const key of [...FIELDS, ...NESTED]) {
    result.push(...collect(value[key], seen, depth + 1));
  }

  return result;
}

export function isUmraniyesporContent(item) {
  const content = normalize(collect(item).join(" "));

  return BLOCK_PATTERNS.some(pattern => pattern.test(content));
}

export function filterUmraniyespor(items) {
  if (!Array.isArray(items)) return [];

  return items.filter(item => !isUmraniyesporContent(item));
}
