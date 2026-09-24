import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';

/** Only ordinary public addresses: no loopback, private, link-local (incl. cloud metadata), CGNAT, multicast… */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
  return ip.range() === 'unicast';
}

export class BlockedUrlError extends Error {}

const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * Checks that don't need DNS: scheme, port, credentials, and IP-literal hosts. The last one
 * matters because Node never calls the lookup hook for an IP literal (e.g. the cloud metadata
 * address 169.254.169.254), so the connect-time guard alone would not see it.
 */
export function assertFetchableUrl(raw: string, allowPrivate = false): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError(`scheme ${url.protocol} not allowed`);
  if (url.username || url.password) throw new BlockedUrlError('credentials in URL not allowed');
  if (allowPrivate) return url;
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedUrlError(`port ${url.port} not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host) && !isPublicAddress(host)) throw new BlockedUrlError(`${host} is not a public address`);
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS resolution that refuses private destinations. It runs inside the connection itself, so
 * the address checked is the address connected to (no DNS-rebinding window between the two).
 */
export function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const blocked = addresses.find((a) => !isPublicAddress(a.address));
      if (blocked && !allowPrivate) {
        return callback(Object.assign(new BlockedUrlError(`${hostname} resolves to a non-public address`), { code: 'EBLOCKED' }), []);
      }
      if (options.all) return callback(null, addresses);
      const first = addresses[0]!;
      callback(null, first.address, first.family);
    });
  };
}

export interface SafeFetchOptions {
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Fetches an HTML page from the public internet, or throws. Every redirect hop is re-checked. */
export async function fetchPublicHtml(raw: string, opts: SafeFetchOptions = {}): Promise<{ url: string; html: string }> {
  const { allowPrivate = false, timeoutMs = 5000, maxBytes = 1_000_000, maxRedirects = 3 } = opts;
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(allowPrivate) as never }, headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  const signal = AbortSignal.timeout(timeoutMs);
  let url = assertFetchableUrl(raw, allowPrivate);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetch(url, {
        dispatcher,
        signal,
        redirect: 'manual',
        headers: { 'user-agent': 'NookBot/1.0 (link previews)', accept: 'text/html,application/xhtml+xml' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel();
        if (!location) throw new BlockedUrlError('redirect without a location');
        url = assertFetchableUrl(new URL(location, url).toString(), allowPrivate);
        continue;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      if (!(res.headers.get('content-type') ?? '').includes('html')) {
        await res.body?.cancel();
        throw new Error('not an HTML page');
      }
      // Read at most maxBytes; a page is only needed as far as its <head>.
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      await reader.cancel();
      return { url: url.toString(), html: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8') };
    }
    throw new BlockedUrlError('too many redirects');
  } finally {
    await dispatcher.close();
  }
}
