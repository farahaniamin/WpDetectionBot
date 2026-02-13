import { Bot, session } from 'grammy';
import os from 'node:os';
import { ProxyAgent } from 'undici';
import { pruneExpiredCache, pruneExpiredLocks } from './db/repos.js';
import { loadConfig } from './core/config.js';
import { openDb } from './db/db.js';
import { rateLimitMiddleware } from './bot/middlewares/rateLimit.js';
import { registerAnalyze } from './bot/handlers/analyze.js';
import { registerRecent } from './bot/handlers/recent.js';
import { registerMenu } from './bot/handlers/menu.js';
import { registerSettings } from './bot/handlers/settings.js';
import { registerStats } from './bot/handlers/stats.js';
import { registerSync } from './bot/handlers/sync.js';
import type { MyContext } from './bot/context.js';
import { initialSession } from './bot/context.js';
import { runWordfenceSyncJob } from './services/security/wordfenceFeed.js';
import { runWatchNotificationPass } from './services/security/watchService.js';

const cfg = loadConfig();
const db = openDb(cfg.DB_PATH);

const botConfig: any = {
  client: {
    apiRoot: cfg.API_URL || 'https://api.telegram.org'
  }
};

if (cfg.PROXY_URL) {
  const proxyAgent = new ProxyAgent(cfg.PROXY_URL);
  botConfig.client.baseFetchConfig = {
    dispatcher: proxyAgent
  };
}

const bot = new Bot<MyContext>(cfg.BOT_TOKEN, botConfig);

bot.use(session({ initial: initialSession }));

bot.use(
  rateLimitMiddleware({
    windowSec: cfg.RATE_LIMIT_WINDOW_SEC,
    max: cfg.RATE_LIMIT_MAX,
    penaltySec: cfg.RATE_LIMIT_PENALTY_SEC
  })
);

// Debug: log all incoming messages
bot.on('message', async (ctx, next) => {
  console.log('[DEBUG] Received message:', ctx.message?.text, 'from:', ctx.from?.id);
  await next();
});

// Debug: log callback queries
bot.on('callback_query:data', async (ctx, next) => {
  console.log('[DEBUG] Callback query received:', ctx.callbackQuery?.data, 'from:', ctx.from?.id);
  await next();
});

// Keep DB tidy (cheap housekeeping).
// Important: do NOT run on every request.
setInterval(
  () => {
    try {
      pruneExpiredCache(db);
      pruneExpiredLocks(db);
    } catch (e) {
      console.error('[housekeeping] failed:', e);
    }
  },
  10 * 60 * 1000
);

registerMenu(bot, { db, cfg });
registerSettings(bot, { db });
registerAnalyze(bot, { db, cfg });
registerRecent(bot, { db, cfg });
registerStats(bot, { db, cfg });
registerSync(bot, { db, cfg });
console.log('[info] Admin IDs:', Array.from(cfg.ADMIN_USER_ID_SET));
console.log('[info] Commands registered: /sync_status, /sync_vulns');

bot.catch((err) => console.error('Bot error:', err));

// Periodic Wordfence sync (optional)
if (cfg.WORDFENCE_API_KEY) {
  const runSync = async () => {
    const r = await runWordfenceSyncJob(db, {
      apiKey: cfg.WORDFENCE_API_KEY,
      feedType: cfg.WORDFENCE_FEED_TYPE,
      timeoutMs: Math.max(cfg.REQUEST_TIMEOUT_MS, 20000),
      userAgent: cfg.USER_AGENT,
      lockOwner: `${os.hostname()}:pid:${process.pid}`,
      lockTtlMs: cfg.WORDFENCE_SYNC_LOCK_TTL_SEC * 1000,
      backoffMs: cfg.WORDFENCE_SYNC_BACKOFF_MIN * 60 * 1000
    });

    if (r.status === 'synced') {
      console.log(`[wordfence] synced, processed=${r.processed}`);
    } else if (r.status === 'skipped_locked') {
      console.log('[wordfence] skipped (lock held by another instance)');
    } else if (r.status === 'skipped_backoff') {
      console.log('[wordfence] skipped (backoff active due to rate limit)');
    } else if (r.status === 'failed') {
      console.error('[wordfence] sync failed:', r.error);
    }
  };

  // run at startup (non-blocking) if enabled
  if (cfg.WORDFENCE_SYNC_ON_START) {
    void runSync();
  }

  setInterval(
    () => {
      void runSync();
    },
    cfg.WORDFENCE_SYNC_INTERVAL_MIN * 60 * 1000
  );
} else {
  console.log('[wordfence] WORDFENCE_API_KEY not set → vuln sync disabled (recent data will be empty)');
}

// Watch notifications (depends on local vuln DB)
if (cfg.ENABLE_WATCH_NOTIFICATIONS) {
  const runWatch = async () => {
    try {
      await runWatchNotificationPass(bot, db, { recentDays: cfg.WATCH_RECENT_DAYS });
    } catch (e) {
      console.error('[watch] notification pass failed:', e);
    }
  };

  setInterval(
    () => {
      void runWatch();
    },
    cfg.WATCH_CHECK_INTERVAL_MIN * 60 * 1000
  );

  // also run once shortly after startup to notify fast
  setTimeout(() => {
    void runWatch();
  }, 30 * 1000);
}

// Start polling
bot.start({ allowed_updates: ['message', 'callback_query'] });
console.log('[info] Bot started (long polling).');

function shutdown() {
  try {
    db.close();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
