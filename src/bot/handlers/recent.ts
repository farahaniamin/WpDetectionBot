import type { Bot } from 'grammy';
import type { Db } from '../../db/db.js';
import { queryRecentVulns, insertEvent } from '../../db/repos.js';
import { formatRecentVulns } from '../../ui/formatters/reportFormatter.js';
import type { AppConfig } from '../../core/config.js';
import type { VulnSeverity } from '../../core/types.js';
import { guardAndNormalizeUrl } from '../../services/urlGuard.js';
import { analyzeSite } from '../../services/siteAnalyzer.js';
import { formatRecentForSite } from '../../ui/formatters/reportFormatter.js';

import type { MyContext } from '../context.js';

export function registerRecent(bot: Bot<MyContext>, deps: { db: Db; cfg: AppConfig }) {
  bot.command('recent', async (ctx: MyContext) => {
    const started = Date.now();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    const arg = ctx.match?.toString().trim();
    const days = arg ? Math.min(365, Math.max(1, Number(arg))) : deps.cfg.WATCH_RECENT_DAYS;

    try {
      const sev: VulnSeverity[] = ['Critical', 'High'];
      const v = queryRecentVulns(deps.db, days, sev);

      if (v.length === 0 && !deps.cfg.WORDFENCE_API_KEY) {
        await ctx.reply(
          `ℹ️ دیتای آسیب‌پذیری‌ها هنوز فعال نیست.
برای فعال‌سازی، WORDFENCE_API_KEY را در فایل .env تنظیم کنید تا فید به صورت دوره‌ای در دیتابیس همگام شود.`,
          { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
        );
      }
      await ctx.reply(formatRecentVulns(v, days), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'recent',
        origin: null,
        durationMs: Date.now() - started,
        result: 'ok'
      });
    } catch (e: any) {
      await ctx.reply('⚠️ خطا در دریافت لیست آسیب‌پذیری‌ها.');
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'recent',
        origin: null,
        durationMs: Date.now() - started,
        result: 'error',
        errorCode: e?.name || 'unknown'
      });
    }
  });

  bot.command('recent_site', async (ctx: MyContext) => {
    const started = Date.now();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    const raw = (ctx.match?.toString() ?? '').trim();
    if (!raw) {
      await ctx.reply(
        'مثال: /recent_site https://example.com\n(اختیاری) /recent_site https://example.com 30'
      );
      return;
    }

    const [url, daysStr] = raw.split(/\s+/);
    const days = daysStr ? Math.min(365, Math.max(1, Number(daysStr))) : deps.cfg.WATCH_RECENT_DAYS;

    try {
      const guarded = await guardAndNormalizeUrl(url);
      if (!guarded.ok) {
        await ctx.reply(`❌ ${guarded.reason}`);
        insertEvent(deps.db, {
          ts: Date.now(),
          userId,
          chatId,
          command: 'recent_site',
          origin: null,
          durationMs: Date.now() - started,
          result: 'error',
          errorCode: 'bad_url'
        });
        return;
      }

      await ctx.reply('⏳ در حال بررسی…');

      // Use the same analyzer. Cache makes it cheap on repeated calls.
      const r = await analyzeSite(deps.db, guarded.origin, guarded.normalizedUrl, {
        timeoutMs: deps.cfg.REQUEST_TIMEOUT_MS,
        userAgent: deps.cfg.USER_AGENT,
        cacheTtlSec: deps.cfg.CACHE_TTL_SEC,
        enableVersionHints: deps.cfg.ENABLE_VERSION_HINTS,
        maxVersionHintProbes: deps.cfg.MAX_VERSION_HINT_PROBES_PER_SITE,
        maxPluginsInReport: deps.cfg.MAX_PLUGINS_IN_REPORT,
        includeVulnData: true,
        vulnRecentDays: days,
        versionHintConcurrency: Math.max(1, Math.min(6, deps.cfg.CONCURRENCY))
      });

      await ctx.reply(formatRecentForSite(r, days), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'recent_site',
        origin: guarded.origin,
        durationMs: Date.now() - started,
        result: 'ok'
      });
    } catch (e: any) {
      await ctx.reply('⚠️ خطا در بررسی آسیب‌پذیری‌های این سایت.');
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'recent_site',
        origin: null,
        durationMs: Date.now() - started,
        result: 'error',
        errorCode: e?.name || 'unknown'
      });
    }
  });
}
