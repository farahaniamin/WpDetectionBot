import type { Bot } from 'grammy';
import PQueue from 'p-queue';
import type { Db } from '../../db/db.js';
import type { AppConfig } from '../../core/config.js';
import { guardAndNormalizeUrl } from '../../services/urlGuard.js';
import { analyzeSite } from '../../services/siteAnalyzer.js';
import { formatAnalysisReport } from '../../ui/formatters/reportFormatter.js';
import { insertEvent } from '../../db/repos.js';
import type { MyContext } from '../context.js';
import { createProgressReporter } from '../../ui/progress.js';
import { mainMenuKeyboard } from '../../ui/keyboards.js';

export type AnalyzeRunner = (ctx: MyContext, input: string) => Promise<void>;

export function createAnalyzeRunner(deps: { db: Db; cfg: AppConfig }): AnalyzeRunner {
  // Limit only the expensive analysis work (do not queue all Telegram updates).
  const analyzeQueue = new PQueue({ concurrency: deps.cfg.CONCURRENCY });

  return async (ctx: MyContext, input: string) => {
    const started = Date.now();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;

    try {
      const guarded = await guardAndNormalizeUrl(input.trim());
      if (!guarded.ok) {
        await ctx.reply(`❌ ${guarded.reason}`, { reply_markup: mainMenuKeyboard() });
        insertEvent(deps.db, {
          ts: Date.now(),
          userId,
          chatId,
          command: 'analyze',
          origin: null,
          durationMs: Date.now() - started,
          result: 'error',
          errorCode: 'bad_url'
        });
        return;
      }

      const progress = await createProgressReporter(ctx);

      const r = await analyzeQueue.add(() =>
        analyzeSite(deps.db, guarded.origin, guarded.normalizedUrl, {
          timeoutMs: deps.cfg.REQUEST_TIMEOUT_MS,
          userAgent: deps.cfg.USER_AGENT,
          cacheTtlSec: deps.cfg.CACHE_TTL_SEC,
          enableVersionHints: deps.cfg.ENABLE_VERSION_HINTS,
          maxVersionHintProbes: deps.cfg.MAX_VERSION_HINT_PROBES_PER_SITE,
          maxPluginsInReport: deps.cfg.MAX_PLUGINS_IN_REPORT,
          includeVulnData: true,
          vulnRecentDays: deps.cfg.WATCH_RECENT_DAYS,
          versionHintConcurrency: Math.max(1, Math.min(6, deps.cfg.CONCURRENCY)),
          onProgress: (stage, percent) => progress.step(stage, percent)
        })
      );

      await progress.done('تمام شد. در حال آماده‌سازی گزارش…');

      if (!r) {
        await ctx.reply('⚠️ خطا در تولید گزارش.', { reply_markup: mainMenuKeyboard() });
        return;
      }
      const report = formatAnalysisReport(r);
      await ctx.reply(report, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: mainMenuKeyboard()
      });

      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'analyze',
        origin: guarded.origin,
        durationMs: Date.now() - started,
        result: 'ok'
      });
    } catch (e: any) {
      await ctx.reply('⚠️ خطا در بررسی سایت. دوباره امتحان کن.', { reply_markup: mainMenuKeyboard() });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'analyze',
        origin: null,
        durationMs: Date.now() - started,
        result: 'error',
        errorCode: e?.name || 'unknown'
      });
    }
  };
}

export function registerAnalyze(bot: Bot<MyContext>, deps: { db: Db; cfg: AppConfig }) {
  const runAnalyze = createAnalyzeRunner(deps);

  bot.command('analyze', async (ctx: MyContext) => {
    const input = ctx.match?.toString().trim();
    if (!input) {
      await ctx.reply('مثال: /analyze https://example.com', { reply_markup: mainMenuKeyboard() });
      return;
    }
    await runAnalyze(ctx, input);
  });
}
