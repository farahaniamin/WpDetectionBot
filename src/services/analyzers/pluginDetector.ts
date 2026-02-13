import type { PluginInfo } from '../../core/types.js';

const PLUGIN_RE = /\/wp-content\/plugins\/([a-z0-9_-]+)\//gi;
const VER_RE = /[?&]ver=([0-9][0-9a-zA-Z._-]*)/g;

export function detectPlugins(homeHtml: string): PluginInfo[] {
  const map = new Map<string, Set<string>>();

  let m: RegExpExecArray | null;
  while ((m = PLUGIN_RE.exec(homeHtml)) !== null) {
    const slug = m[1];
    if (!map.has(slug)) map.set(slug, new Set());
  }

  // Extract ?ver=... around plugin asset URLs (best-effort)
  const lines = homeHtml.split(/\s+/);
  for (const token of lines) {
    const pm = token.match(PLUGIN_RE);
    if (!pm) continue;
    const slugMatch = token.match(/\/wp-content\/plugins\/([a-z0-9_-]+)\//i);
    const slug = slugMatch?.[1];
    if (!slug || !map.has(slug)) continue;
    let vm: RegExpExecArray | null;
    while ((vm = VER_RE.exec(token)) !== null) {
      map.get(slug)!.add(vm[1]);
    }
  }

  return [...map.entries()]
    .map(([slug, versions]) => ({ slug, versionHints: [...versions] }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
