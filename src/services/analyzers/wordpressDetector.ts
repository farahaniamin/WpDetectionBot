import { fetchText } from '../fetcher.js';
import type { WordPressDetection } from '../../core/types.js';

export type HomeFetch = {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  ttfbMs?: number;
};

export async function fetchHome(url: string, opt: { timeoutMs: number; userAgent: string }): Promise<HomeFetch> {
  const r = await fetchText(url, { timeoutMs: opt.timeoutMs, userAgent: opt.userAgent, retries: 1 });
  return { finalUrl: r.finalUrl, status: r.status, headers: r.headers, html: r.text, ttfbMs: r.ttfbMs };
}

export async function detectWordPress(home: HomeFetch, opt: { timeoutMs: number; userAgent: string }): Promise<WordPressDetection> {
  const signals: string[] = [];
  const html = home.html || '';

  if (html.includes('/wp-content/')) signals.push('html:wp-content');
  if (html.includes('/wp-includes/')) signals.push('html:wp-includes');
  if (/wp-emoji-release\.min\.js/i.test(html)) signals.push('html:wp-emoji');

  // Strong signal: /wp-json/
  try {
    const wpJsonUrl = new URL('/wp-json/', home.finalUrl).toString();
    const wpjson = await fetchText(wpJsonUrl, { timeoutMs: opt.timeoutMs, userAgent: opt.userAgent, retries: 0 });
    if (wpjson.ok && (wpjson.text.includes('routes') || wpjson.text.includes('namespaces'))) {
      signals.push('endpoint:wp-json');
    }
  } catch {
    // ignore
  }

  return { isWordpress: signals.length > 0, signals };
}
