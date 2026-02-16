import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(10),
  API_URL: z.string().url().optional().default(''),
  PROXY_URL: z.string().optional().default(''),

  CONCURRENCY: z.coerce.number().int().min(1).max(50).default(4),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  USER_AGENT: z.string().default('WpInfoBot/0.4'),

  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().min(1).max(3600).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  RATE_LIMIT_PENALTY_SEC: z.coerce.number().int().min(0).max(3600).default(30),

  DB_PATH: z.string().default('./data/wpinfo.db'),

  CACHE_TTL_SEC: z.coerce.number().int().min(0).max(86400).default(600),
  CACHE_MAX_ENTRIES: z.coerce.number().int().min(0).max(100000).default(500),

  MAX_PLUGINS_IN_REPORT: z.coerce.number().int().min(1).max(200).default(30),

  ENABLE_VERSION_HINTS: z.coerce.boolean().default(true),
  MAX_VERSION_HINT_PROBES_PER_SITE: z.coerce.number().int().min(0).max(200).default(15),

  WORDFENCE_API_KEY: z.string().optional().default(''),
  WORDFENCE_FEED_TYPE: z.enum(['production', 'scanner']).default('production'),
  WORDFENCE_SYNC_INTERVAL_MIN: z.coerce
    .number()
    .int()
    .min(30)
    .max(7 * 24 * 60)
    .default(360),
  WORDFENCE_SYNC_ON_START: z.coerce.boolean().default(true),
  WORDFENCE_SYNC_LOCK_TTL_SEC: z.coerce.number().int().min(30).max(3600).default(900),
  WORDFENCE_SYNC_BACKOFF_MIN: z.coerce
    .number()
    .int()
    .min(30)
    .max(7 * 24 * 60)
    .default(720),

  ENABLE_WATCH_NOTIFICATIONS: z.coerce.boolean().default(true),
  WATCH_CHECK_INTERVAL_MIN: z.coerce
    .number()
    .int()
    .min(30)
    .max(7 * 24 * 60)
    .default(360),
  WATCH_RECENT_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  ADMIN_USER_IDS: z.string().optional().default(''),

  SEO_AUDIT_API_URL: z.string().url().default('http://localhost:8787'),
  SEO_AUDIT_TIMEOUT_MS: z.coerce.number().int().min(60000).max(600000).default(300000),
  SEO_AUDIT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(10000).default(2000)
});

export type AppConfig = z.infer<typeof schema> & { ADMIN_USER_ID_SET: Set<number> };

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
    throw new Error(`Invalid env config: ${msg}`);
  }

  const ids = parsed.data.ADMIN_USER_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  return { ...parsed.data, ADMIN_USER_ID_SET: new Set(ids) };
}
