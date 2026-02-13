import type { Db } from './db.js';
import type { VulnerabilitySummary, VulnSeverity, ComponentSet } from '../core/types.js';

export function metaGet(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any;
  return row?.value ?? null;
}

export function metaSet(db: Db, key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Best-effort distributed lock using SQLite.
 * Returns true if acquired, false otherwise.
 */
export function tryAcquireLock(db: Db, name: string, owner: string, ttlMs: number): boolean {
  const now = Date.now();
  const expiresAt = now + Math.max(1000, ttlMs);

  const stmt = db.prepare(
    `INSERT INTO locks(name, owner, expires_at)
     VALUES (@name, @owner, @expiresAt)
     ON CONFLICT(name) DO UPDATE SET
       owner=excluded.owner,
       expires_at=excluded.expires_at
     WHERE locks.expires_at <= @now`
  );

  const info = stmt.run({ name, owner, expiresAt, now });
  return info.changes > 0;
}

export function releaseLock(db: Db, name: string, owner: string) {
  db.prepare('DELETE FROM locks WHERE name = ? AND owner = ?').run(name, owner);
}

export function insertEvent(db: Db, e: {
  ts: number;
  userId: number;
  chatId: number;
  command: string;
  origin?: string | null;
  durationMs?: number | null;
  result: string;
  errorCode?: string | null;
}) {
  db.prepare(
    `INSERT INTO events(ts, user_id, chat_id, command, origin, duration_ms, result, error_code)
     VALUES (@ts, @userId, @chatId, @command, @origin, @durationMs, @result, @errorCode)`
  ).run({
    ts: e.ts,
    userId: e.userId,
    chatId: e.chatId,
    command: e.command,
    origin: e.origin ?? null,
    durationMs: e.durationMs ?? null,
    result: e.result,
    errorCode: e.errorCode ?? null
  });
}

export function cacheGet(db: Db, origin: string): string | null {
  const now = Date.now();
  const row = db.prepare('SELECT payload_json, expires_at FROM cache WHERE origin = ?').get(origin) as any;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM cache WHERE origin = ?').run(origin);
    return null;
  }
  return row.payload_json as string;
}

export function cacheSet(db: Db, origin: string, payloadJson: string, ttlSec: number) {
  const expiresAt = Date.now() + Math.max(0, ttlSec) * 1000;
  db.prepare(
    'INSERT OR REPLACE INTO cache(origin, payload_json, expires_at) VALUES (?, ?, ?)'
  ).run(origin, payloadJson, expiresAt);
}

export function pruneExpiredCache(db: Db) {
  db.prepare('DELETE FROM cache WHERE expires_at <= ?').run(Date.now());
}

export function pruneExpiredLocks(db: Db) {
  db.prepare('DELETE FROM locks WHERE expires_at <= ?').run(Date.now());
}

export function upsertVulnerability(db: Db, v: {
  id: string;
  title: string;
  description?: string | null;
  cve?: string | null;
  cvssScore?: number | null;
  cvssRating?: VulnSeverity | string | null;
  published?: string | null;
  updated?: string | null;
  informational?: boolean | null;
  referenceUrl?: string | null;
  remediation?: string | null;
}) {
  db.prepare(
    `INSERT INTO vulns(id, title, description, cve, cvss_score, cvss_rating, published, updated, informational, reference_url, remediation, last_seen_ts)
     VALUES (@id, @title, @description, @cve, @cvssScore, @cvssRating, @published, @updated, @informational, @referenceUrl, @remediation, @lastSeen)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       cve=excluded.cve,
       cvss_score=excluded.cvss_score,
       cvss_rating=excluded.cvss_rating,
       published=excluded.published,
       updated=excluded.updated,
       informational=excluded.informational,
       reference_url=excluded.reference_url,
       remediation=excluded.remediation,
       last_seen_ts=excluded.last_seen_ts`
  ).run({
    id: v.id,
    title: v.title,
    description: v.description ?? null,
    cve: v.cve ?? null,
    cvssScore: v.cvssScore ?? null,
    cvssRating: v.cvssRating ?? 'Unknown',
    published: v.published ?? null,
    updated: v.updated ?? null,
    informational: v.informational ? 1 : 0,
    referenceUrl: v.referenceUrl ?? null,
    remediation: v.remediation ?? null,
    lastSeen: Date.now()
  });
}

export function replaceVulnSoftware(
  db: Db,
  vulnId: string,
  software: Array<{ type: 'core' | 'plugin' | 'theme'; slug: string; name?: string | null; patched?: boolean; patchedVersions?: string[]; affectedVersions?: any }>
) {
  const del = db.prepare('DELETE FROM vuln_software WHERE vuln_id = ?');
  const ins = db.prepare(
    `INSERT INTO vuln_software(vuln_id, type, slug, name, patched, patched_versions_json, affected_versions_json)
     VALUES (@vulnId, @type, @slug, @name, @patched, @patchedVersionsJson, @affectedVersionsJson)
     ON CONFLICT(vuln_id, type, slug) DO UPDATE SET
       name=excluded.name,
       patched=excluded.patched,
       patched_versions_json=excluded.patched_versions_json,
       affected_versions_json=excluded.affected_versions_json`
  );

  const tx = db.transaction(() => {
    del.run(vulnId);
    for (const s of software) {
      ins.run({
        vulnId,
        type: s.type,
        slug: s.slug,
        name: s.name ?? null,
        patched: s.patched ? 1 : 0,
        patchedVersionsJson: s.patchedVersions ? JSON.stringify(s.patchedVersions) : null,
        affectedVersionsJson: s.affectedVersions ? JSON.stringify(s.affectedVersions) : null
      });
    }
  });

  tx();
}

export function queryRecentVulns(db: Db, days: number, severity: Array<VulnSeverity>) : VulnerabilitySummary[] {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');

  const rows = db.prepare(
    `SELECT id, title, cve, cvss_score, cvss_rating, published, updated, reference_url, remediation
     FROM vulns
     WHERE (published >= @since OR updated >= @since)
       AND cvss_rating IN (${severity.map(() => '?').join(',')})
       AND (informational IS NULL OR informational = 0)
     ORDER BY COALESCE(updated, published) DESC
     LIMIT 50`
  ).all({ since: sinceStr }, ...severity) as any[];

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    cve: r.cve,
    cvssScore: r.cvss_score,
    cvssRating: (r.cvss_rating as VulnSeverity) || 'Unknown',
    published: r.published,
    updated: r.updated,
    referenceUrl: r.reference_url,
    remediation: r.remediation,
    software: []
  }));
}

export function queryVulnsForComponents(db: Db, comp: ComponentSet, days: number, severity: Array<VulnSeverity>): VulnerabilitySummary[] {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');

  const items: Array<{ type: 'core' | 'plugin' | 'theme'; slug: string }> = [];
  if (comp.theme?.slug) items.push({ type: 'theme', slug: comp.theme.slug });
  for (const p of comp.plugins || []) items.push({ type: 'plugin', slug: p.slug });

  if (items.length === 0) return [];

  const placeholders = items.map(() => '(?, ?)').join(',');
  const params: any[] = [];
  for (const it of items) { params.push(it.type, it.slug); }

  const rows = db.prepare(
    `SELECT v.id, v.title, v.cve, v.cvss_score, v.cvss_rating, v.published, v.updated, v.reference_url, v.remediation
     FROM vulns v
     JOIN vuln_software s ON s.vuln_id = v.id
     WHERE (v.published >= ? OR v.updated >= ?)
       AND v.cvss_rating IN (${severity.map(() => '?').join(',')})
       AND (v.informational IS NULL OR v.informational = 0)
       AND (s.type, s.slug) IN (${placeholders})
     ORDER BY COALESCE(v.updated, v.published) DESC
     LIMIT 50`
  ).all(sinceStr, sinceStr, ...severity, ...params) as any[];

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    cve: r.cve,
    cvssScore: r.cvss_score,
    cvssRating: (r.cvss_rating as VulnSeverity) || 'Unknown',
    published: r.published,
    updated: r.updated,
    referenceUrl: r.reference_url,
    remediation: r.remediation,
    software: []
  }));
}

export function upsertWatch(db: Db, w: { userId: number; chatId: number; origin: string; components: ComponentSet }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO watches(user_id, chat_id, origin, components_json, created_at, updated_at, last_notified_at)
     VALUES (@userId, @chatId, @origin, @componentsJson, @now, @now, 0)
     ON CONFLICT(user_id, origin) DO UPDATE SET
       chat_id=excluded.chat_id,
       components_json=excluded.components_json,
       updated_at=excluded.updated_at`
  ).run({
    userId: w.userId,
    chatId: w.chatId,
    origin: w.origin,
    componentsJson: JSON.stringify(w.components),
    now
  });
}

export function deleteWatch(db: Db, userId: number, origin: string) {
  db.prepare('DELETE FROM watches WHERE user_id = ? AND origin = ?').run(userId, origin);
}

export function listWatches(db: Db, userId: number): Array<{ origin: string; components: ComponentSet; lastNotifiedAt: number; chatId: number }> {
  const rows = db.prepare('SELECT origin, components_json, last_notified_at, chat_id FROM watches WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as any[];
  return rows.map(r => ({
    origin: r.origin,
    components: JSON.parse(r.components_json),
    lastNotifiedAt: r.last_notified_at,
    chatId: r.chat_id
  }));
}

export function listAllWatches(db: Db): Array<{ id: number; userId: number; chatId: number; origin: string; components: ComponentSet; lastNotifiedAt: number }> {
  const rows = db.prepare('SELECT id, user_id, chat_id, origin, components_json, last_notified_at FROM watches').all() as any[];
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    chatId: r.chat_id,
    origin: r.origin,
    components: JSON.parse(r.components_json),
    lastNotifiedAt: r.last_notified_at
  }));
}

export function updateWatchLastNotifiedAt(db: Db, watchId: number, ts: number) {
  db.prepare('UPDATE watches SET last_notified_at = ? WHERE id = ?').run(ts, watchId);
}

export function queryStats(db: Db, days: number) {
  const since = Date.now() - days * 24 * 3600 * 1000;
  const total = db.prepare('SELECT COUNT(*) as c FROM events WHERE ts >= ?').get(since) as any;
  const users = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM events WHERE ts >= ?').get(since) as any;
  const errors = db.prepare("SELECT COUNT(*) as c FROM events WHERE ts >= ? AND result = 'error'").get(since) as any;
  const avg = db.prepare('SELECT AVG(duration_ms) as v FROM events WHERE ts >= ? AND duration_ms IS NOT NULL').get(since) as any;
  return {
    total: Number(total.c || 0),
    users: Number(users.c || 0),
    errors: Number(errors.c || 0),
    avgMs: Math.round(Number(avg.v || 0))
  };
}

export type UserSettings = {
  userId: number;
  notifyVulns: boolean;
  notifyUpdates: boolean;
  updatedAt: number;
};

export function getUserSettings(db: Db, userId: number): UserSettings {
  const row = db.prepare('SELECT user_id, notify_vulns, notify_updates, updated_at FROM user_settings WHERE user_id = ?').get(userId) as any;
  if (!row) {
    const now = Date.now();
    db.prepare('INSERT OR IGNORE INTO user_settings(user_id, notify_vulns, notify_updates, updated_at) VALUES (?, 1, 1, ?)').run(userId, now);
    return { userId, notifyVulns: true, notifyUpdates: true, updatedAt: now };
  }
  return {
    userId: row.user_id,
    notifyVulns: Boolean(row.notify_vulns),
    notifyUpdates: Boolean(row.notify_updates),
    updatedAt: row.updated_at
  };
}

export function toggleUserSetting(db: Db, userId: number, key: 'notify_vulns' | 'notify_updates'): UserSettings {
  const current = getUserSettings(db, userId);
  const nextVal = key === 'notify_vulns' ? (current.notifyVulns ? 0 : 1) : (current.notifyUpdates ? 0 : 1);
  db.prepare(`UPDATE user_settings SET ${key} = ?, updated_at = ? WHERE user_id = ?`).run(nextVal, Date.now(), userId);
  return getUserSettings(db, userId);
}

