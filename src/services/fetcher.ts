import { setTimeout as delay } from 'node:timers/promises';

export type FetcherOptions = {
  timeoutMs: number;
  userAgent: string;
  maxRedirects?: number;
  retries?: number;
};

export type FetchTextResult = {
  ok: boolean;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  text: string;
  ttfbMs?: number;
};

function headersToObject(headers: Headers): Record<string, string> {
  const o: Record<string, string> = {};
  headers.forEach((v, k) => { o[k.toLowerCase()] = v; });
  return o;
}

export async function fetchText(url: string, opt: FetcherOptions): Promise<FetchTextResult> {
  const retries = opt.retries ?? 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opt.timeoutMs);
    const start = performance.now();
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': opt.userAgent,
          'accept': 'text/html,application/json;q=0.9,*/*;q=0.8'
        }
      });

      const ttfb = performance.now() - start;
      const text = await res.text();
      clearTimeout(t);

      return {
        ok: res.ok,
        status: res.status,
        finalUrl: res.url,
        headers: headersToObject(res.headers),
        text,
        ttfbMs: Math.round(ttfb)
      };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) {
        await delay(150);
        continue;
      }
    }
  }

  throw lastErr;
}

export async function fetchHead(url: string, opt: FetcherOptions): Promise<{ ok: boolean; status: number; finalUrl: string; headers: Record<string, string>; ttfbMs?: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opt.timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': opt.userAgent,
        'accept': '*/*'
      }
    });

    const ttfb = performance.now() - start;
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      headers: headersToObject(res.headers),
      ttfbMs: Math.round(ttfb)
    };
  } finally {
    clearTimeout(t);
  }
}
