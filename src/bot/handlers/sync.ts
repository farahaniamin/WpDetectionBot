import type { Bot } from 'grammy';
import os from 'node:os';
import type { Db } from '../../db/db.js';
import type { AppConfig } from '../../core/config.js';
import { adminOnly } from '../middlewares/adminOnly.js';
import {
  runWordfenceSyncJob,
  META_WORDFENCE_BACKOFF_UNTIL_MS,
  META_WORDFENCE_LAST_SYNC_TS_MS,
  META_WORDFENCE_LAST_ATTEMPT_TS_MS,
  META_WORDFENCE_LAST_STATUS,
  META_WORDFENCE_LAST_ERROR,
  META_WORDFENCE_LAST_PROCESSED
} from '../../services/security/wordfenceFeed.js';
import { metaGet } from '../../db/repos.js';

function fmtTs(ms: number): string {
  try {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return String(ms);
  }
}

import type { MyContext } from '../context.js';

export function registerSync(bot: Bot<MyContext>, deps: { db: Db; cfg: AppConfig }) {
  const { db, cfg } = deps;

  // Test command - available to all
  bot.command('ping', async (ctx: MyContext) => {
    console.log('[ping] received from user:', ctx.from?.id);
    await ctx.reply('Pong! Bot is working.');
  });

  // Admin-only commands
  bot.command('sync_vulns', adminOnly(cfg.ADMIN_USER_ID_SET), async (ctx: MyContext) => {
    if (!cfg.WORDFENCE_API_KEY) {
      await ctx.reply('⚠️ WORDFENCE_API_KEY تنظیم نشده. Sync غیرفعال است.');
      return;
    }

    await ctx.reply('⏳ شروع Sync دیتای آسیب‌پذیری‌ها…');

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
      await ctx.reply(`✅ Sync انجام شد. رکورد پردازش‌شده: ${r.processed}`);
      return;
    }
    if (r.status === 'skipped_locked') {
      await ctx.reply('ℹ️ Sync اجرا نشد چون Lock فعال است (احتمالاً یک instance دیگر در حال Sync است).');
      return;
    }
    if (r.status === 'skipped_backoff') {
      const until = Number(metaGet(db, META_WORDFENCE_BACKOFF_UNTIL_MS) || '0');
      await ctx.reply(
        `⏸️ Backoff فعال است (Rate limit). تا ${until ? fmtTs(until) : 'زمان نامشخص'} Sync انجام نمی‌شود.`
      );
      return;
    }
    if (r.status === 'skipped_no_key') {
      await ctx.reply('⚠️ کلید Wordfence موجود نیست.');
      return;
    }
    await ctx.reply(`❌ Sync شکست خورد: ${r.error || 'unknown error'}`);
  });

  bot.command('sync_status', adminOnly(cfg.ADMIN_USER_ID_SET), async (ctx: MyContext) => {
    console.log('[sync_status] called by user:', ctx.from?.id);
    try {
      const last = Number(metaGet(db, META_WORDFENCE_LAST_SYNC_TS_MS) || '0');
      const backoffUntil = Number(metaGet(db, META_WORDFENCE_BACKOFF_UNTIL_MS) || '0');
      const lastAttempt = Number(metaGet(db, META_WORDFENCE_LAST_ATTEMPT_TS_MS) || '0');
      const lastStatus = metaGet(db, META_WORDFENCE_LAST_STATUS) || 'unknown';
      const lastError = metaGet(db, META_WORDFENCE_LAST_ERROR) || '';
      const lastProcessed = Number(metaGet(db, META_WORDFENCE_LAST_PROCESSED) || '0');
      const now = Date.now();

      const vulnsCount = (db.prepare('SELECT COUNT(1) as c FROM vulns').get() as any)?.c ?? 0;
      const linksCount = (db.prepare('SELECT COUNT(1) as c FROM vuln_software').get() as any)?.c ?? 0;

      const lines: string[] = [];
      lines.push('🛡️ وضعیت Sync آسیب‌پذیری‌ها');
      lines.push(`• API Key: ${cfg.WORDFENCE_API_KEY ? 'set' : 'not set'}`);
      lines.push(`• Feed: ${cfg.WORDFENCE_FEED_TYPE}`);
      lines.push(`• Interval: هر ${cfg.WORDFENCE_SYNC_INTERVAL_MIN} دقیقه`);

      lines.push(`• Last attempt: ${lastAttempt ? fmtTs(lastAttempt) : 'never'}`);
      lines.push(`• Last status: ${lastStatus}`);
      lines.push(`• Last sync: ${last ? fmtTs(last) : 'never'}`);
      if (lastProcessed) lines.push(`• Last processed: ${lastProcessed}`);

      if (backoffUntil && backoffUntil > now) {
        lines.push(`• Backoff: فعال تا ${fmtTs(backoffUntil)}`);
      } else {
        lines.push('• Backoff: غیرفعال');
      }

      lines.push(`• Vulns: ${vulnsCount}`);
      lines.push(`• Vuln↔Software links: ${linksCount}`);
      if (lastError) lines.push(`• Last error: ${lastError}`);

      await ctx.reply(lines.join('\n'));
    } catch (error) {
      console.error('[sync_status] error:', error);
      await ctx.reply('❌ خطا در دریافت وضعیت: ' + String(error));
    }
  });
}
