import type { Db } from '../db/db.js';
import { cacheGet, cacheSet, queryRecentVulns, queryVulnsForComponents } from '../db/repos.js';
import type { AnalysisResult, ComponentSet, VulnSeverity } from '../core/types.js';
import { fetchHome, detectWordPress } from './analyzers/wordpressDetector.js';
import { detectTheme } from './analyzers/themeDetector.js';
import { detectPlugins } from './analyzers/pluginDetector.js';
import { enrichPluginVersions } from './analyzers/versionHints.js';
import { detectHostingHints } from './analyzers/hostingHints.js';
import { getSecurityHints } from './security/securityHints.js';

export type AnalyzeOptions = {
  timeoutMs: number;
  userAgent: string;
  cacheTtlSec: number;
  enableVersionHints: boolean;
  maxVersionHintProbes: number;
  /** concurrency for passive version-hint probes (e.g., readme.txt). */
  versionHintConcurrency?: number;
  maxPluginsInReport: number;
  includeVulnData: boolean;
  vulnRecentDays: number;
  onProgress?: (stage: string, percent: number) => void | Promise<void>;
};

export async function analyzeSite(db: Db, origin: string, normalizedUrl: string, opt: AnalyzeOptions): Promise<AnalysisResult> {
  const progress = opt.onProgress;
  const ping = (stage: string, percent: number) => {
    try { void progress?.(stage, percent); } catch {}
  };

  // persistent cache
  if (opt.cacheTtlSec > 0) {
    const cached = cacheGet(db, origin);
    if (cached) {
      try {
        return JSON.parse(cached) as AnalysisResult;
      } catch {
        // ignore
      }
    }
  }
  ping('اتصال به سایت', 10);
  const home = await fetchHome(normalizedUrl, opt);
  ping('تشخیص وردپرس', 25);
  const wordpress = await detectWordPress(home, opt);

  ping('تشخیص افزونه‌ها', 35);
  let theme = undefined;
  let plugins = detectPlugins(home.html);

  if (wordpress.isWordpress) {
    ping('تشخیص قالب', 45);
    theme = await detectTheme(home.html, home.finalUrl, opt);

    if (opt.enableVersionHints) {
      ping('استخراج نسخه‌ها (best-effort)', 55);
      plugins = await enrichPluginVersions(home.finalUrl, plugins, {
        timeoutMs: opt.timeoutMs,
        userAgent: opt.userAgent,
        maxProbes: opt.maxVersionHintProbes,
        concurrency: opt.versionHintConcurrency ?? 3
      });
    }
  }

  ping('تحلیل هاست/پرفورمنس', 70);
  const hosting = detectHostingHints(home.finalUrl, home.status, home.headers);
  const performance = { ttfbMs: home.ttfbMs, htmlBytes: home.html?.length ?? 0 };
  ping('بررسی امنیت', 78);
  const security = await getSecurityHints(home.finalUrl, home.headers, opt);

  // trim plugins for report
  if (plugins.length > opt.maxPluginsInReport) {
    plugins = plugins.slice(0, opt.maxPluginsInReport);
  }

  const components: ComponentSet = {
    theme: theme?.slug ? { slug: theme.slug, versionHint: theme.version } : undefined,
    plugins: plugins.map(p => ({ slug: p.slug, versionHint: p.versionHints[0] }))
  };

  const result: AnalysisResult = {
    origin,
    finalUrl: home.finalUrl,
    wordpress,
    theme,
    plugins,
    hosting,
    security,
    performance,
    components
  };

  if (opt.includeVulnData) {
    ping('بررسی آسیب‌پذیری‌ها', 85);
    const sev: VulnSeverity[] = ['Critical', 'High'];
    const recentGlobal = queryRecentVulns(db, opt.vulnRecentDays, sev);
    const recentForComponents = wordpress.isWordpress ? queryVulnsForComponents(db, components, opt.vulnRecentDays, sev) : [];
    result.vulns = {
      recentGlobalCriticalHigh: recentGlobal,
      recentForComponentsCriticalHigh: recentForComponents
    };
  }

  ping('تکمیل گزارش', 100);

  if (opt.cacheTtlSec > 0) {
    cacheSet(db, origin, JSON.stringify(result), opt.cacheTtlSec);
  }

  return result;
}
