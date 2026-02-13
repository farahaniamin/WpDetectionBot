import PQueue from 'p-queue';
import { fetchText } from '../fetcher.js';
import type { PluginInfo, ThemeInfo } from '../../core/types.js';

function parseReadmeVersion(text: string): string | null {
  const head = text.slice(0, 5000);
  const stable = head.match(/^\s*Stable tag\s*:\s*(.+)$/im)?.[1]?.trim();
  if (stable && stable !== 'trunk') return stable;
  const ver = head.match(/^\s*Version\s*:\s*(.+)$/im)?.[1]?.trim();
  if (ver) return ver;
  return null;
}

export async function enrichPluginVersions(
  originOrFinalUrl: string,
  plugins: PluginInfo[],
  opt: { timeoutMs: number; userAgent: string; maxProbes: number; concurrency?: number }
): Promise<PluginInfo[]> {
  const maxProbes = Math.max(0, opt.maxProbes);
  if (maxProbes === 0 || plugins.length === 0) return plugins;

  const concurrency = Math.max(1, Math.min(10, opt.concurrency ?? 3));
  const queue = new PQueue({ concurrency });

  // Only probe a bounded subset to keep runtime predictable.
  const toProbe = plugins.slice(0, maxProbes);
  const probedVersions = new Map<string, string>();

  await Promise.all(
    toProbe.map(p =>
      queue.add(async () => {
        const readmeUrl = new URL(`/wp-content/plugins/${p.slug}/readme.txt`, originOrFinalUrl).toString();
        try {
          const r = await fetchText(readmeUrl, { timeoutMs: opt.timeoutMs, userAgent: opt.userAgent, retries: 0 });
          if (r.ok && r.text) {
            const v = parseReadmeVersion(r.text);
            if (v) probedVersions.set(p.slug, v);
          }
        } catch {
          // ignore
        }
      })
    )
  );

  return plugins.map(p => {
    const versionHints = new Set<string>(p.versionHints || []);
    const hint = probedVersions.get(p.slug);
    if (hint) versionHints.add(hint);
    return { slug: p.slug, versionHints: [...versionHints] };
  });
}

export async function enrichThemeVersion(
  finalUrl: string,
  theme: ThemeInfo | undefined,
  opt: { timeoutMs: number; userAgent: string }
): Promise<ThemeInfo | undefined> {
  // Theme version is usually in style.css already. No extra probes for now.
  return theme;
}
