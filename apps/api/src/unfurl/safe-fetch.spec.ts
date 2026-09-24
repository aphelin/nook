import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, BlockedUrlError, fetchPublicHtml, isPublicAddress } from './safe-fetch.js';

describe('isPublicAddress', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['192.168.1.10', false],
    ['172.16.0.1', false],
    ['169.254.169.254', false], // cloud metadata
    ['100.64.0.1', false], // carrier-grade NAT
    ['0.0.0.0', false],
    ['::1', false],
    ['fc00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false], // IPv4-mapped loopback
    ['93.184.216.34', true],
    ['2606:4700:4700::1111', true],
  ])('%s → %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe('assertFetchableUrl', () => {
  it.each([
    'ftp://example.com/file',
    'file:///etc/passwd',
    'http://example.com:22/',
    'http://user:pw@example.com/',
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://10.0.0.5/admin',
  ])('blocks %s', (url) => {
    expect(() => assertFetchableUrl(url)).toThrow(BlockedUrlError);
  });

  it('allows ordinary public pages', () => {
    expect(assertFetchableUrl('https://example.com/a?b=c').hostname).toBe('example.com');
    expect(assertFetchableUrl('http://93.184.216.34/').hostname).toBe('93.184.216.34');
  });
});

describe('fetchPublicHtml', () => {
  it('refuses names that resolve to private addresses, at connect time', async () => {
    // Not merely "nothing listening": the failure must come from the guard.
    const err = (await fetchPublicHtml('http://localhost/').catch((e: unknown) => e)) as Error & { cause?: { code?: string } };
    expect(err.cause?.code ?? (err as { code?: string }).code).toBe('EBLOCKED');
  });
});
