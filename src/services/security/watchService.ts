import type { Bot } from 'grammy';
import type { Db } from '../../db/db.js';
import { getUserSettings, listAllWatches, updateWatchLastNotifiedAt } from '../../db/repos.js';
import type { ComponentSet, VulnSeverity, VulnerabilitySummary } from '../../core/types.js';

function nowUtcString(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function sinceUtcString(days: number): string {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function buildComponentsFromJson(json: string): ComponentSet {
  return JSON.parse(json) as ComponentSet;
}

export function queryNewVulnsForWatch(
  db: Db,
  comp: ComponentSet,
  days: number,
  minUpdatedUtc: string,
  severity: VulnSeverity[]
): VulnerabilitySummary[] {
  const items: Array<{ type: 'core' | 'plugin' | 'theme'; slug: string }> = [];
  if (comp.theme?.slug) items.push({ type: 'theme', slug: comp.theme.slug });
  for (const p of comp.plugins || []) items.push({ type: 'plugin', slug: p.slug });
  if (items.length === 0) return [];

  const placeholders = items.map(() => '(?, ?)').join(',');
  const params: any[] = [];
  for (const it of items) {
    params.push(it.type, it.slug);
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT v.id, v.title, v.cve, v.cvss_score, v.cvss_rating, v.published, v.updated, v.reference_url
     FROM vulns v
     JOIN vuln_software s ON s.vuln_id = v.id
     WHERE (v.published >= ? OR v.updated >= ?)
       AND COALESCE(v.updated, v.published) >= ?
       AND v.cvss_rating IN (${severity.map(() => '?').join(',')})
       AND (v.informational IS NULL OR v.informational = 0)
       AND (s.type, s.slug) IN (${placeholders})
     ORDER BY COALESCE(v.updated, v.published) DESC
     LIMIT 20`
    )
    .all(sinceUtcString(days), sinceUtcString(days), minUpdatedUtc, ...severity, ...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    cve: r.cve,
    cvssScore: r.cvss_score,
    cvssRating: r.cvss_rating,
    published: r.published,
    updated: r.updated,
    referenceUrl: r.reference_url,
    remediation: null,
    patchedVersions: [],
    software: []
  }));
}

export async function runWatchNotificationPass(bot: Bot<any>, db: Db, opt: { recentDays: number }) {
  const watches = listAllWatches(db);
  const severity: VulnSeverity[] = ['Critical', 'High'];

  for (const w of watches) {
    const settings = getUserSettings(db, w.userId);
    if (!settings.notifyVulns) continue;
    const lastNotifiedUtc =
      w.lastNotifiedAt > 0
        ? new Date(w.lastNotifiedAt).toISOString().slice(0, 19).replace('T', ' ')
        : '1970-01-01 00:00:00';

    const newVulns = queryNewVulnsForWatch(db, w.components, opt.recentDays, lastNotifiedUtc, severity);
    if (newVulns.length === 0) continue;

    const lines = newVulns.map((v) => {
      const when = v.updated || v.published || '';
      const cve = v.cve ? ` (${v.cve})` : '';
      const url = v.referenceUrl ? `\n<a href="${escapeHtml(v.referenceUrl)}">جزئیات</a>` : '';
      return `• <b>${escapeHtml(v.cvssRating)}</b> — ${escapeHtml(v.title)}${escapeHtml(cve)}\n<code>${escapeHtml(when)}</code>${url}`;
    });

    const msg = [
      `🔔 <b>هشدار امنیتی برای سایت تحت مانیتور</b>`,
      `<b>Site:</b> <code>${escapeHtml(w.origin)}</code>`,
      '',
      ...lines
    ].join('\n');

    try {
      await bot.api.sendMessage(w.chatId, msg, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      });
      updateWatchLastNotifiedAt(db, w.id, Date.now());
    } catch {
      // ignore send failures
    }
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function utcNowString(): string {
  return nowUtcString();
}
