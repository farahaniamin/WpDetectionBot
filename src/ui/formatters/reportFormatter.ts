import type { AnalysisResult, PluginInfo, VulnerabilitySummary } from '../../core/types.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPlugins(plugins: PluginInfo[]): string {
  if (!plugins.length) return '—';
  const lines = plugins.map(p => {
    const v = p.versionHints?.[0];
    return v ? `• <code>${esc(p.slug)}</code> <i>${esc(v)}</i>` : `• <code>${esc(p.slug)}</code>`;
  });
  return lines.join('\n');
}

function fmtSecurity(r: AnalysisResult): string {
  const sh = r.security.securityHeaders;
  const bits: string[] = [];
  bits.push(sh.hsts ? '✅ HSTS' : '❌ HSTS');
  bits.push(sh.csp ? '✅ CSP' : '❌ CSP');
  bits.push(sh.xFrame ? '✅ X-Frame-Options' : '❌ X-Frame-Options');
  bits.push(sh.xcto ? '✅ X-Content-Type-Options' : '❌ X-Content-Type-Options');
  bits.push(sh.referrerPolicy ? '✅ Referrer-Policy' : '❌ Referrer-Policy');
  bits.push(sh.permissionsPolicy ? '✅ Permissions/Feature-Policy' : '❌ Permissions/Feature-Policy');

  const probes: string[] = [];
  if (typeof r.security.wpLoginAccessible === 'boolean') probes.push(`wp-login.php: ${r.security.wpLoginAccessible ? '✅' : '❌'}`);
  if (typeof r.security.xmlrpcAccessible === 'boolean') probes.push(`xmlrpc.php: ${r.security.xmlrpcAccessible ? '✅' : '❌'}`);

  return [bits.join(' | '), probes.length ? probes.join(' | ') : ''].filter(Boolean).join('\n');
}

function fmtVulnLines(v: VulnerabilitySummary[], max: number): string {
  if (!v.length) return '—';
  return v.slice(0, max).map(x => {
    const when = x.updated || x.published || '';
    const cve = x.cve ? ` (${x.cve})` : '';
    const link = x.referenceUrl ? ` — <a href="${esc(x.referenceUrl)}">link</a>` : '';
    return `• <b>${esc(x.cvssRating)}</b> ${esc(x.title)}${esc(cve)}\n<code>${esc(when)}</code>${link}`;
  }).join('\n');
}

export function formatAnalysisReport(r: AnalysisResult): string {
  const wp = r.wordpress.isWordpress ? '✅ WordPress' : '❌ Not WordPress';

  const theme = r.theme
    ? `• <b>Theme</b>: <code>${esc(r.theme.slug)}</code>${r.theme.name ? ` — ${esc(r.theme.name)}` : ''}${r.theme.version ? ` <i>${esc(r.theme.version)}</i>` : ''}`
    : '• <b>Theme</b>: —';

  const hostingBits: string[] = [];
  if (r.hosting.cdn) hostingBits.push(`CDN: ${esc(r.hosting.cdn)}`);
  if (r.hosting.server) hostingBits.push(`Server: ${esc(r.hosting.server)}`);
  if (r.hosting.cache) hostingBits.push(`Cache: ${esc(r.hosting.cache)}`);
  if (r.hosting.contentEncoding) hostingBits.push(`Encoding: ${esc(r.hosting.contentEncoding)}`);

  const perfBits: string[] = [];
  if (r.performance.ttfbMs != null) perfBits.push(`TTFB: <code>${r.performance.ttfbMs}ms</code>`);
  if (r.performance.htmlBytes != null) perfBits.push(`HTML: <code>${r.performance.htmlBytes} bytes</code>`);

  const parts: string[] = [];
  parts.push(`🔎 <b>WPInfo Report</b>`);
  parts.push(`<b>Site</b>: <code>${esc(r.origin)}</code>`);
  if (r.finalUrl !== r.origin) parts.push(`<b>Final</b>: <code>${esc(r.finalUrl)}</code>`);
  parts.push(wp);
  parts.push('');

  if (!r.wordpress.isWordpress) {
    parts.push('این سایت وردپرس تشخیص داده نشد.');
    parts.push(`<b>Signals</b>: ${esc(r.wordpress.signals.join(', ') || '—')}`);
    return parts.join('\n');
  }

  parts.push('🧩 <b>Stack</b>');
  parts.push(theme);
  parts.push(`• <b>Plugins (detected)</b>:`);
  parts.push(fmtPlugins(r.plugins));
  parts.push('');

  parts.push('🛰️ <b>Hosting / Performance</b>');
  parts.push(hostingBits.length ? hostingBits.join(' | ') : '—');
  parts.push(perfBits.length ? perfBits.join(' | ') : '—');
  parts.push('');

  parts.push('🛡️ <b>Security hints</b>');
  parts.push(fmtSecurity(r));

  if (r.vulns) {
    parts.push('');
    parts.push('🚨 <b>Vulnerabilities</b> (last 30 days)');
    parts.push(`<b>For detected components</b>:`);
    parts.push(fmtVulnLines(r.vulns.recentForComponentsCriticalHigh, 6));
    parts.push('');
    parts.push(`<b>Global (Critical/High)</b>:`);
    parts.push(fmtVulnLines(r.vulns.recentGlobalCriticalHigh, 6));
  }

  return parts.join('\n');
}

export function formatRecentVulns(v: VulnerabilitySummary[], days: number): string {
  const parts: string[] = [];
  parts.push(`🚨 <b>Critical/High vulnerabilities</b> — last <b>${days}</b> days`);
  parts.push('');
  parts.push(fmtVulnLines(v, 15));
  return parts.join('\n');
}

export function formatRecentForSite(r: AnalysisResult, days: number): string {
  const parts: string[] = [];
  parts.push(`🧷 <b>Recent vulns for site</b> — last <b>${days}</b> days`);
  parts.push(`<b>Site</b>: <code>${esc(r.origin)}</code>`);
  if (!r.wordpress.isWordpress) {
    parts.push('');
    parts.push('این سایت وردپرس تشخیص داده نشد؛ بنابراین بررسی آسیب‌پذیری بر اساس پلاگین/قالب انجام نشد.');
    return parts.join('\n');
  }

  parts.push('');
  parts.push('🧩 <b>Detected components</b>');
  if (r.theme?.slug) parts.push(`• Theme: <code>${esc(r.theme.slug)}</code>${r.theme.version ? ` <i>${esc(r.theme.version)}</i>` : ''}`);
  if (r.plugins?.length) parts.push(`• Plugins: ${r.plugins.map(p => `<code>${esc(p.slug)}</code>`).join(' ')}`);
  parts.push('');
  parts.push(`🚨 <b>Critical/High</b>`);
  const list = r.vulns?.recentForComponentsCriticalHigh ?? [];
  parts.push(fmtVulnLines(list, 15));

  if (!list.length && !r.vulns) {
    parts.push('');
    parts.push('ℹ️ دیتای آسیب‌پذیری‌ها هنوز در دیتابیس همگام نشده است.');
  }

  return parts.join('\n');
}
