const URL_PATTERN = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'")\]]/g;

/** The first few distinct http(s) links in a message, in order. */
export function extractUrls(body: string, limit = 3): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(URL_PATTERN)) {
    try {
      seen.add(new URL(match[0]).toString());
    } catch {
      // Not a parseable URL after all; skip it.
    }
    if (seen.size >= limit) break;
  }
  return [...seen];
}
