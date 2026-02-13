import type { HostingHints } from '../../core/types.js';

export function detectHostingHints(finalUrl: string, status: number, headers: Record<string, string>): HostingHints {
  const h = (k: string) => headers[k.toLowerCase()];
  const server = h('server');
  const poweredBy = h('x-powered-by');
  const cacheControl = h('cache-control');
  const contentEncoding = h('content-encoding');

  let cdn: string | undefined;
  if (h('cf-ray') || (server || '').toLowerCase().includes('cloudflare')) cdn = 'Cloudflare';
  else if (h('x-amz-cf-id') || h('via')?.includes('CloudFront')) cdn = 'CloudFront';
  else if (h('x-served-by') && h('x-cache') && h('x-timer')) cdn = 'Fastly (hint)';
  else if (h('akamai-grn') || h('x-akamai-transformed')) cdn = 'Akamai (hint)';

  let cache: string | undefined;
  const xCache = h('x-cache') || h('x-cache-hits');
  if (xCache) cache = xCache;
  else if (h('x-litespeed-cache')) cache = 'LiteSpeed Cache (hint)';
  else if (h('x-varnish')) cache = 'Varnish (hint)';

  return {
    finalUrl,
    status,
    server,
    poweredBy,
    cdn,
    cache,
    contentEncoding,
    cacheControl
  };
}
