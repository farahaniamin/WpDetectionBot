import { Readable } from 'node:stream';
import chain from 'stream-chain';
import streamJson from 'stream-json';
import StreamObject from 'stream-json/streamers/StreamObject.js';
const parser = (streamJson as any).parser;
import type { Db } from '../../db/db.js';
import {
  upsertVulnerability,
  replaceVulnSoftware,
  metaGet,
  metaSet,
  tryAcquireLock,
  releaseLock
} from '../../db/repos.js';
import type { VulnSeverity } from '../../core/types.js';

type FeedType = 'production' | 'scanner';

export type WordfenceSyncOptions = {
  apiKey: string;
  feedType: FeedType;
  timeoutMs: number;
  userAgent: string;
};

const ENDPOINTS: Record<FeedType, string> = {
  production: 'https://www.wordfence.com/api/intelligence/v3/vulnerabilities/production',
  scanner: 'https://www.wordfence.com/api/intelligence/v3/vulnerabilities/scanner'
};

export class WordfenceHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'WordfenceHttpError';
    this.status = status;
  }
}

function normalizeRating(r: unknown): VulnSeverity {
  const s = String(r || '').toLowerCase();
  if (s === 'critical') return 'Critical';
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  if (s === 'low') return 'Low';
  if (s === 'none') return 'None';
  return 'Unknown';
}

export async function syncWordfenceFeed(db: Db, opt: WordfenceSyncOptions): Promise<{ processed: number }> {
  if (!opt.apiKey) throw new Error('Missing WORDFENCE_API_KEY');
  const url = ENDPOINTS[opt.feedType];

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opt.timeoutMs);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      authorization: `Bearer ${opt.apiKey}`,
      'user-agent': opt.userAgent,
      accept: 'application/json'
    }
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new WordfenceHttpError(res.status, `Wordfence feed HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  if (!res.body) throw new Error('No response body');

  // Stream parse root object: { uuid: record, ... }
  const nodeStream = Readable.fromWeb(res.body as any);

  let processed = 0;

  const pipeline = new chain([nodeStream, parser(), StreamObject.streamObject()]);

  for await (const chunk of pipeline as any as AsyncIterable<{ key: string; value: any }>) {
    const id = chunk.key;
    const v = chunk.value || {};

    upsertVulnerability(db, {
      id,
      title: v.title ?? id,
      description: v.description ?? null,
      cve: v.cve ?? null,
      cvssScore: v.cvss?.score ?? null,
      cvssRating: normalizeRating(v.cvss?.rating),
      published: v.published ?? null,
      updated: v.updated ?? null,
      informational: v.informational ?? false,
      referenceUrl: Array.isArray(v.references) ? (v.references[0] ?? null) : null,
      remediation: v.software?.[0]?.remediation ?? v.remediation ?? null
    });

    const sw = Array.isArray(v.software) ? v.software : [];
    const software = sw
      .filter((s: any) => s?.type && s?.slug)
      .map((s: any) => ({
        type: s.type,
        slug: s.slug,
        name: s.name ?? null,
        patched: !!s.patched,
        patchedVersions: Array.isArray(s.patched_versions) ? s.patched_versions : [],
        affectedVersions: s.affected_versions ?? null
      }));

    replaceVulnSoftware(db, id, software as any);

    processed += 1;
  }

  return { processed };
}

export type WordfenceSyncJobOptions = WordfenceSyncOptions & {
  /** lock name to avoid multiple instances syncing simultaneously */
  lockName?: string;
  /** identifies this instance in the lock table */
  lockOwner: string;
  /** lock TTL in milliseconds */
  lockTtlMs: number;
  /** backoff duration in milliseconds after HTTP 429 */
  backoffMs: number;
};

export const META_WORDFENCE_BACKOFF_UNTIL_MS = 'wordfence_backoff_until_ms';
export const META_WORDFENCE_LAST_SYNC_TS_MS = 'wordfence_last_sync_ts_ms';
export const META_WORDFENCE_LAST_ATTEMPT_TS_MS = 'wordfence_last_attempt_ts_ms';
export const META_WORDFENCE_LAST_STATUS = 'wordfence_last_status';
export const META_WORDFENCE_LAST_ERROR = 'wordfence_last_error';
export const META_WORDFENCE_LAST_PROCESSED = 'wordfence_last_processed';

/**
 * Syncs Wordfence feed with:
 * - SQLite-based lock (safe for multi-process / multi-instance)
 * - 429 backoff persisted in meta table
 */
export async function runWordfenceSyncJob(
  db: Db,
  opt: WordfenceSyncJobOptions
): Promise<{
  status: 'skipped_no_key' | 'skipped_locked' | 'skipped_backoff' | 'synced' | 'failed';
  processed?: number;
  error?: string;
}> {
  if (!opt.apiKey) return { status: 'skipped_no_key' };

  const now = Date.now();
  metaSet(db, META_WORDFENCE_LAST_ATTEMPT_TS_MS, String(now));

  const backoffUntil = Number(metaGet(db, META_WORDFENCE_BACKOFF_UNTIL_MS) || '0');
  if (Number.isFinite(backoffUntil) && backoffUntil > now) {
    metaSet(db, META_WORDFENCE_LAST_STATUS, 'skipped_backoff');
    return { status: 'skipped_backoff' };
  }

  const lockName = opt.lockName ?? 'wordfence_sync';
  const acquired = tryAcquireLock(db, lockName, opt.lockOwner, opt.lockTtlMs);
  if (!acquired) {
    metaSet(db, META_WORDFENCE_LAST_STATUS, 'skipped_locked');
    return { status: 'skipped_locked' };
  }

  try {
    const r = await syncWordfenceFeed(db, opt);
    metaSet(db, META_WORDFENCE_LAST_SYNC_TS_MS, String(Date.now()));
    metaSet(db, META_WORDFENCE_LAST_STATUS, 'synced');
    metaSet(db, META_WORDFENCE_LAST_ERROR, '');
    metaSet(db, META_WORDFENCE_LAST_PROCESSED, String(r.processed));
    // clear any previous backoff
    metaSet(db, META_WORDFENCE_BACKOFF_UNTIL_MS, '0');
    return { status: 'synced', processed: r.processed };
  } catch (e: any) {
    if (e instanceof WordfenceHttpError && e.status === 429) {
      const until = Date.now() + Math.max(60_000, opt.backoffMs);
      metaSet(db, META_WORDFENCE_BACKOFF_UNTIL_MS, String(until));
    }
    const msg = e?.message ? String(e.message) : 'unknown error';
    metaSet(db, META_WORDFENCE_LAST_STATUS, 'failed');
    metaSet(db, META_WORDFENCE_LAST_ERROR, msg.slice(0, 400));
    return { status: 'failed', error: msg };
  } finally {
    releaseLock(db, lockName, opt.lockOwner);
  }
}
