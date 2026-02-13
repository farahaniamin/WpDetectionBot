import type { Bot } from 'grammy';
import type { Db } from '../../db/db.js';
import { getUserSettings, toggleUserSetting } from '../../db/repos.js';
import { mainMenuKeyboard, settingsKeyboard } from '../../ui/keyboards.js';
import type { MyContext } from '../context.js';

function renderSettingsText(opts: { notifyVulns: boolean; notifyUpdates: boolean }) {
  const vulns = opts.notifyVulns ? '🔴 روشن' : '⚪ خاموش';
  const updates = opts.notifyUpdates ? '🔵 روشن' : '⚪ خاموش';
  return [
    '━━━━━━━━━━━━━━',
    '⚙️ <b>تنظیمات اعلان‌ها</b>',
    '━━━━━━━━━━━━━━',
    '',
    `🔴 آسیب‌پذیری‌ها (High/Critical): <b>${vulns}</b>`,
    `🔵 آپدیت افزونه‌ها: <b>${updates}</b>`,
    '',
    '━━━━━━━━━━━━━━',
    'روی دکمه‌ها بزن تا تغییر بدی',
    '━━━━━━━━━━━━━━'
  ].join('\n');
}

export function registerSettings(bot: Bot<MyContext>, deps: { db: Db }) {
  bot.command('settings', async (ctx: MyContext) => {
    const s = getUserSettings(deps.db, ctx.from!.id);
    await ctx.reply(renderSettingsText(s), {
      parse_mode: 'HTML',
      reply_markup: settingsKeyboard(s)
    });
  });

  bot.callbackQuery(/^settings:toggle:(vulns|updates)$/, async (ctx: MyContext) => {
    const kind = ctx.match?.[1] as 'vulns' | 'updates';
    const key = kind === 'vulns' ? 'notify_vulns' : 'notify_updates';
    const s = toggleUserSetting(deps.db, ctx.from!.id, key);
    await ctx.editMessageText(renderSettingsText(s), {
      parse_mode: 'HTML',
      reply_markup: settingsKeyboard(s)
    });
    await ctx.answerCallbackQuery({ text: '✅ ذخیره شد' });
  });

  bot.callbackQuery('menu:settings', async (ctx: MyContext) => {
    const s = getUserSettings(deps.db, ctx.from!.id);
    await ctx.editMessageText(renderSettingsText(s), {
      parse_mode: 'HTML',
      reply_markup: settingsKeyboard(s)
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu:back', async (ctx: MyContext) => {
    await ctx.editMessageText(renderMenuText(), {
      parse_mode: 'HTML',
      reply_markup: mainMenuKeyboard(),
      link_preview_options: { is_disabled: true }
    });
    await ctx.answerCallbackQuery();
  });
}

export function renderMenuText() {
  return [
    '━━━━━━━━━━━━━━━━',
    '👋 <b>خوش اومدی!</b>',
    '━━━━━━━━━━━━━━━━',
    '',
    'من <b>WPInfo Bot</b> هستم 🛡️',
    'می‌تونم سایت‌های وردپرسی رو تحلیل کنم',
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🔍 <b>بررسی سایت</b>',
    '└ تشخیص وردپرس، قالب، افزونه‌ها و امنیت',
    '',
    '👁️ <b>مانیتورینگ</b>',
    '└ دریافت اعلان آسیب‌پذیری‌های جدید',
    '',
    '⚡ <b>آسیب‌پذیری‌های اخیر</b>',
    '└ لیست آخرین مشکلات امنیتی',
    '',
    '━━━━━━━━━━━━━━━━'
  ].join('\n');
}
