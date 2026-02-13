import { parse } from 'tldts';
import { promises as dns } from 'node:dns';
import ipaddr from 'ipaddr.js';

export type UrlGuardResult =
  | { ok: true; origin: string; normalizedUrl: string }
  | { ok: false; reason: string };

function isBlockedIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    // ipv4 & ipv6 ranges
    if (addr.range() !== 'unicast') return true;
    const r = addr.range();
    // ipaddr.js uses: private, loopback, linkLocal, uniqueLocal, multicast, etc.
    return ['private', 'loopback', 'linkLocal', 'uniqueLocal', 'multicast', 'unspecified', 'broadcast', 'carrierGradeNat'].includes(r);
  } catch {
    return true;
  }
}

export async function guardAndNormalizeUrl(input: string): Promise<UrlGuardResult> {
  let url: URL;
  try {
    if (!/^https?:\/\//i.test(input)) return { ok: false, reason: 'URL must start with http:// or https://' };
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'Only http/https allowed' };

  // Disallow uncommon ports by default (simple hardening)
  if (url.port && !['80', '443'].includes(url.port)) {
    return { ok: false, reason: 'Only ports 80/443 allowed' };
  }

  const parsed = parse(url.hostname);
  if (!parsed.isIcann || !parsed.domain) {
    // allow IP host? We block IP hosts to avoid SSRF complexity.
    return { ok: false, reason: 'Hostname must be a valid public domain' };
  }

  // DNS resolve and block private ranges
  try {
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (!addrs.length) return { ok: false, reason: 'DNS resolution failed' };
    for (const a of addrs) {
      if (isBlockedIp(a.address)) return { ok: false, reason: 'Blocked IP range' };
    }
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }

  url.hash = '';
  // normalize path: keep as-is, but drop trailing spaces
  const normalizedUrl = url.toString();
  const origin = url.origin;

  return { ok: true, origin, normalizedUrl };
}
