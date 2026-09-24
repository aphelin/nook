import { Parser } from 'htmlparser2';

export interface PagePreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

const clip = (s: string | undefined, n: number) => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null;
};

/** Open Graph first, then Twitter cards, then plain <title>/<meta name="description">. */
export function parsePreview(html: string, pageUrl: string): PagePreview {
  const meta = new Map<string, string>();
  let title = '';
  let inTitle = false;
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'title') inTitle = true;
      if (name === 'meta') {
        const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
        if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
      }
    },
    ontext(text) {
      if (inTitle) title += text;
    },
    onclosetag(name) {
      if (name === 'title') inTitle = false;
      // Everything needed lives in <head>.
      if (name === 'head') parser.pause();
    },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();

  let imageUrl: string | null = null;
  const rawImage = meta.get('og:image') ?? meta.get('twitter:image');
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, pageUrl);
      // Only https images: shown directly in the browser, they must not downgrade the page.
      if (resolved.protocol === 'https:') imageUrl = resolved.toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    title: clip(meta.get('og:title') ?? meta.get('twitter:title') ?? title, 200),
    description: clip(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 300),
    imageUrl,
    siteName: clip(meta.get('og:site_name'), 80) ?? new URL(pageUrl).hostname.replace(/^www\./, ''),
  };
}
