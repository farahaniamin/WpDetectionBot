import type { Bot } from 'grammy';
import type { Db } from '../../db/db.js';
import type { AppConfig } from '../../core/config.js';
import type { MyContext } from '../context.js';
import {
  MENU,
  cancelKeyboard,
  mainMenuKeyboard,
  siteListKeyboard,
  watchManageKeyboard
} from '../../ui/keyboards.js';
import { renderMenuText } from './settings.js';
import { queryRecentVulns, insertEvent, listWatches, deleteWatch } from '../../db/repos.js';
import type { VulnSeverity } from '../../core/types.js';
import { formatRecentVulns } from '../../ui/formatters/reportFormatter.js';
import { guardAndNormalizeUrl } from '../../services/urlGuard.js';
import { analyzeSite } from '../../services/siteAnalyzer.js';
import { upsertWatch, deleteWatch as dbDeleteWatch } from '../../db/repos.js';
import { createAnalyzeRunner, type AnalyzeRunner } from './analyze.js';

function cleanSiteName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\.+$/, '');
}

function helpText() {
  return [
    '━━━━━━━━━━━━━━',
    '❓ <b>راهنما</b>',
    '━━━━━━━━━━━━━━',
    '',
    '📋 <b>دستورات:</b>',
    '',
    '• /analyze [url]  ← بررسی سایت',
    '• /watch [url]   ← اضافه کردن به مانیتورینگ',
    '• /mywatches     ← لیست سایت‌های من',
    '• /recent [روز] ← آسیب‌پذیری‌های اخیر',
    '• /settings      ← تنظیمات اعلان‌ها',
    '',
    '━━━━━━━━━━━━━━',
    '💡 فقط کافیه آدرس سایت رو بفرستی',
    '━━━━━━━━━━━━━━'
  ].join('\n');
}

export function registerMenu(bot: Bot<MyContext>, deps: { db: Db; cfg: AppConfig }) {
  const runAnalyze: AnalyzeRunner = createAnalyzeRunner({ db: deps.db, cfg: deps.cfg });

  // /start or /menu
  const showMenu = async (ctx: MyContext) => {
    ctx.session.flow = 'idle';
    await ctx.reply(renderMenuText(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true }
    } as any);
  };

  bot.command('start', showMenu);
  bot.command('menu', showMenu);

  // Callback routes
  bot.callbackQuery(MENU.ANALYZE, async (ctx: MyContext) => {
    ctx.session.flow = 'awaiting_analyze_url';
    await ctx.editMessageText(
      '━━━━━━━━━━━━━━\n🔍 <b>بررسی سایت</b>\n━━━━━━━━━━━━━━\n\nآدرس سایت رو بفرست:\n<code>https://example.com</code>\n\nمی‌تونم اینارو تشخیص بدم:\n• ⚡ نسخه وردپرس\n• 🎨 قالب سایت\n• 📦 افزونه‌ها\n• 🛡️ وضعیت امنیتی\n• 🔴 آسیب‌پذیری‌ها',
      {
        parse_mode: 'HTML',
        reply_markup: cancelKeyboard(),
        link_preview_options: { is_disabled: true }
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(MENU.WATCH, async (ctx: MyContext) => {
    ctx.session.flow = 'awaiting_watch_url';
    await ctx.editMessageText(
      '━━━━━━━━━━━━━━\n👁️ <b>مانیتورینگ</b>\n━━━━━━━━━━━━━━\n\nآدرس سایت رو بفرست تا اضافه کنم\n\n🔴 آسیب‌پذیری جدید پیدا بشه بهت خبر میدم!\n\n<code>https://example.com</code>',
      {
        parse_mode: 'HTML',
        reply_markup: cancelKeyboard(),
        link_preview_options: { is_disabled: true }
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(MENU.MY_WATCHES, async (ctx: MyContext) => {
    console.log('[my_watches] callback received, from:', ctx.from?.id);
    try {
      ctx.session.flow = 'idle';
      const userId = ctx.from?.id;
      if (!userId) {
        await ctx.answerCallbackQuery({ text: 'خطا: شناسه کاربر یافت نشد' });
        return;
      }
      const rows = listWatches(deps.db, userId);
      if (!rows.length) {
        await ctx.editMessageText(
          '━━━━━━━━━━━━━━\n📁 <b>سایت‌های من</b>\n━━━━━━━━━━━━━━\n\nهنوز سایتی اضافه نکردی!\n\nاز دکمه 👁️ مانیتورینگ استفاده کن\nتا سایتت رو اضافه کنی',
          { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
        );
        await ctx.answerCallbackQuery();
        return;
      }
      await ctx.editMessageText(
        '━━━━━━━━━━━━━━\n📁 <b>سایت‌های من</b>\n━━━━━━━━━━━━━━\n\nیکی از سایت‌ها رو انتخاب کن:',
        { parse_mode: 'HTML', reply_markup: siteListKeyboard(rows) }
      );
      await ctx.answerCallbackQuery();
    } catch (e) {
      console.error('[my_watches] error:', e);
      await ctx.answerCallbackQuery({ text: 'خطا: ' + String(e) });
    }
  });

  bot.callbackQuery(/^watch:view:(.+)$/, async (ctx: MyContext) => {
    const origin = ctx.match?.[1];
    if (!origin) {
      await ctx.answerCallbackQuery({ text: 'خطا: آدرس یافت نشد' });
      return;
    }
    const rows = listWatches(deps.db, ctx.from!.id);
    const site = rows.find((r) => r.origin === origin);
    if (!site) {
      await ctx.answerCallbackQuery({ text: 'سایت یافت نشد' });
      return;
    }
    const theme = site.components.theme?.slug || 'نامشخص';
    const plugins = site.components.plugins?.length || 0;
    const text = `━━━━━━━━━━━━━━\n🔗 <b>${cleanSiteName(origin)}</b>\n━━━━━━━━━━━━━━\n\n🎨 <b>قالب:</b> ${theme}\n📦 <b>افزونه‌ها:</b> ${plugins}\n👁️ <b>وضعیت:</b> در حال مانیتورینگ\n\nیکی از گزینه‌ها رو انتخاب کن:`;
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: watchManageKeyboard(origin)
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^watch:delete:(.+)$/, async (ctx: MyContext) => {
    const origin = ctx.match?.[1];
    if (!origin) {
      await ctx.answerCallbackQuery({ text: 'خطا: آدرس یافت نشد' });
      return;
    }
    dbDeleteWatch(deps.db, ctx.from!.id, origin);
    await ctx.editMessageText(
      `━━━━━━━━━━━━━━\n✅ <b>حذف شد</b>\n━━━━━━━━━━━━━━\n\nسایت <b>${cleanSiteName(origin)}</b>\nاز لیست مانیتورینگ حذف شد.`,
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    );
    await ctx.answerCallbackQuery({ text: '🗑️ حذف شد' });
  });

  bot.callbackQuery(/^watch:stop:(.+)$/, async (ctx: MyContext) => {
    const origin = ctx.match?.[1];
    if (!origin) {
      await ctx.answerCallbackQuery({ text: 'خطا: آدرس یافت نشد' });
      return;
    }
    dbDeleteWatch(deps.db, ctx.from!.id, origin);
    await ctx.editMessageText(
      `━━━━━━━━━━━━━━\n⏹️ <b>مانیتورینگ متوقف شد</b>\n━━━━━━━━━━━━━━\n\nسایت <b>${cleanSiteName(origin)}</b>\nدیگر مانیتور نمی‌شه.\n\nبرای دوباره فعال کردن:\nاز دکمه 👁️ مانیتورینگ استفاده کن`,
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    );
    await ctx.answerCallbackQuery({ text: '⏹️ متوقف شد' });
  });

  bot.callbackQuery(MENU.RECENT, async (ctx: MyContext) => {
    const started = Date.now();
    const userId = ctx.from!.id;
    const chatId = ctx.chat!.id;
    try {
      const days = deps.cfg.WATCH_RECENT_DAYS;
      const sev: VulnSeverity[] = ['Critical', 'High'];
      const v = queryRecentVulns(deps.db, days, sev);
      const text = formatRecentVulns(v, days);
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: mainMenuKeyboard()
      });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'recent_menu',
        origin: null,
        durationMs: Date.now() - started,
        result: 'ok'
      });
      await ctx.answerCallbackQuery();
    } catch (e: any) {
      await ctx.answerCallbackQuery({ text: 'خطا در دریافت لیست' });
    }
  });

  bot.callbackQuery(MENU.HELP, async (ctx: MyContext) => {
    ctx.session.flow = 'idle';
    await ctx.editMessageText(helpText(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true }
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(MENU.CANCEL, async (ctx: MyContext) => {
    ctx.session.flow = 'idle';
    await ctx.editMessageText(renderMenuText(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true }
    });
    await ctx.answerCallbackQuery({ text: 'لغو شد' });
  });

  bot.callbackQuery(MENU.BACK, async (ctx: MyContext) => {
    ctx.session.flow = 'idle';
    await ctx.editMessageText(renderMenuText(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true }
    });
    await ctx.answerCallbackQuery();
  });

  // Message router for flows
  bot.on('message:text', async (ctx: MyContext, next) => {
    if (!ctx.message?.text) return;
    const text = ctx.message.text.trim();

    // Let command handlers run
    if (text.startsWith('/')) {
      await next();
      return;
    }

    if (ctx.session.flow === 'awaiting_analyze_url') {
      ctx.session.flow = 'idle';
      await runAnalyze(ctx, text);
      return;
    }

    if (ctx.session.flow === 'awaiting_watch_url') {
      ctx.session.flow = 'idle';
      await handleWatchFromText(ctx, deps, text);
      return;
    }

    if (/^https?:\/\//i.test(text)) {
      await runAnalyze(ctx, text);
    }
  });

  // Keep original commands working
  bot.command('watch', async (ctx: MyContext) => {
    const input = ctx.match?.toString().trim();
    if (!input) {
      await ctx.reply('مثال: /watch https://example.com', { reply_markup: mainMenuKeyboard() });
      return;
    }
    await handleWatchFromText(ctx, deps, input);
  });

  bot.command('unwatch', async (ctx: MyContext) => {
    const input = ctx.match?.toString().trim();
    if (!input) {
      await ctx.reply('مثال: /unwatch https://example.com', { reply_markup: mainMenuKeyboard() });
      return;
    }
    const guarded = await guardAndNormalizeUrl(input);
    if (!guarded.ok) {
      await ctx.reply(`❌ ${guarded.reason}`, { reply_markup: mainMenuKeyboard() });
      return;
    }
    deleteWatch(deps.db, ctx.from!.id, guarded.origin);
    await ctx.reply(`🧹 مانیتور حذف شد: <code>${guarded.origin}</code>`, {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard()
    });
  });

  bot.command('mywatches', async (ctx: MyContext) => {
    const rows = listWatches(deps.db, ctx.from!.id);
    if (!rows.length) {
      await ctx.reply('هیچ Watch فعالی نداری.', { reply_markup: mainMenuKeyboard() });
      return;
    }
    const lines = rows.map((r) => {
      const theme = r.components.theme?.slug ? `theme:${r.components.theme.slug}` : 'theme:-';
      const plugins = r.components.plugins?.length ? `plugins:${r.components.plugins.length}` : 'plugins:0';
      return `• <code>${r.origin}</code> — ${theme}, ${plugins}`;
    });
    await ctx.reply(['📌 <b>Watches</b>', '', ...lines].join('\n'), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard()
    });
  });
}

async function handleWatchFromText(ctx: MyContext, deps: { db: Db; cfg: AppConfig }, input: string) {
  const started = Date.now();
  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;

  try {
    const guarded = await guardAndNormalizeUrl(input);
    if (!guarded.ok) {
      await ctx.reply(`❌ ${guarded.reason}`, { reply_markup: mainMenuKeyboard() });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'watch',
        origin: null,
        durationMs: Date.now() - started,
        result: 'error',
        errorCode: 'bad_url'
      });
      return;
    }

    const r = await analyzeSite(deps.db, guarded.origin, guarded.normalizedUrl, {
      timeoutMs: deps.cfg.REQUEST_TIMEOUT_MS,
      userAgent: deps.cfg.USER_AGENT,
      cacheTtlSec: 0,
      enableVersionHints: deps.cfg.ENABLE_VERSION_HINTS,
      maxVersionHintProbes: Math.min(deps.cfg.MAX_VERSION_HINT_PROBES_PER_SITE, 10),
      maxPluginsInReport: deps.cfg.MAX_PLUGINS_IN_REPORT,
      includeVulnData: false,
      vulnRecentDays: deps.cfg.WATCH_RECENT_DAYS
    });

    if (!r.wordpress.isWordpress) {
      await ctx.reply('این سایت وردپرس تشخیص داده نشد. بنابراین Watch فعال نشد.', {
        reply_markup: mainMenuKeyboard()
      });
      insertEvent(deps.db, {
        ts: Date.now(),
        userId,
        chatId,
        command: 'watch',
        origin: guarded.origin,
        durationMs: Date.now() - started,
        result: 'ok'
      });
      return;
    }

    upsertWatch(deps.db, { userId, chatId, origin: guarded.origin, components: r.components });
    await ctx.reply(
      `✅ مانیتور فعال شد برای <code>${guarded.origin}</code>\nاز الان اگر آسیب‌پذیری <b>High/Critical</b> جدیدی برای پلاگین/تم‌های این سایت ثبت شود، نوتیف می‌گیری.`,
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() }
    );
    insertEvent(deps.db, {
      ts: Date.now(),
      userId,
      chatId,
      command: 'watch',
      origin: guarded.origin,
      durationMs: Date.now() - started,
      result: 'ok'
    });
  } catch (e: any) {
    await ctx.reply('⚠️ خطا در فعال‌سازی Watch.', { reply_markup: mainMenuKeyboard() });
    insertEvent(deps.db, {
      ts: Date.now(),
      userId,
      chatId,
      command: 'watch',
      origin: null,
      durationMs: Date.now() - started,
      result: 'error',
      errorCode: e?.name || 'unknown'
    });
  }
}
