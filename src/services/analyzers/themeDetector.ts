import type { ThemeInfo } from '../../core/types.js';
import { fetchText } from '../fetcher.js';

const THEME_RE = /\/wp-content\/themes\/([a-z0-9_-]+)\//gi;

function pickMostCommon(slugs: string[]): string | null {
  const m = new Map<string, number>();
  for (const s of slugs) m.set(s, (m.get(s) || 0) + 1);
  let best: string | null = null;
  let bestC = 0;
  for (const [k, c] of m.entries()) {
    if (c > bestC) { bestC = c; best = k; }
  }
  return best;
}

function parseStyleHeader(css: string): Partial<ThemeInfo> {
  // WordPress style.css header format
  const head = css.slice(0, 5000);
  const get = (label: string) => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im');
    const m = head.match(re);
    return m ? m[1].trim() : undefined;
  };

  return {
    name: get('Theme Name'),
    version: get('Version'),
    author: get('Author'),
    authorUri: get('Author URI'),
    description: get('Description')
  };
}

export async function detectTheme(homeHtml: string, finalUrl: string, opt: { timeoutMs: number; userAgent: string }): Promise<ThemeInfo | undefined> {
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = THEME_RE.exec(homeHtml)) !== null) {
    slugs.push(m[1]);
  }
  const slug = pickMostCommon(slugs);
  if (!slug) return undefined;

  const styleCssUrl = new URL(`/wp-content/themes/${slug}/style.css`, finalUrl).toString();
  try {
    const css = await fetchText(styleCssUrl, { timeoutMs: opt.timeoutMs, userAgent: opt.userAgent, retries: 0 });
    if (css.ok && css.text) {
      const meta = parseStyleHeader(css.text);
      return { slug, styleCssUrl, ...meta };
    }
  } catch {
    // ignore
  }
  return { slug, styleCssUrl };
}
