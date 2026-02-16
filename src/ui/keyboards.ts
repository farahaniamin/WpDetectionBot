import { InlineKeyboard } from 'grammy';

export const MENU = {
  ANALYZE: 'menu:analyze',
  WATCH: 'menu:watch',
  RECENT: 'menu:recent',
  SETTINGS: 'menu:settings',
  MY_WATCHES: 'menu:my_watches',
  HELP: 'menu:help',
  CANCEL: 'menu:cancel',
  BACK: 'menu:back'
} as const;

function cleanSiteName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\.+$/, '');
}

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text('🔍 بررسی سایت', MENU.ANALYZE)
    .row()
    .text('👁️ مانیتورینگ', MENU.WATCH)
    .row()
    .text('⚡ آسیب‌پذیری‌های اخیر', MENU.RECENT)
    .row()
    .text('📁 سایت‌های من', MENU.MY_WATCHES)
    .row()
    .text('⚙️ تنظیمات', MENU.SETTINGS)
    .text('❓ راهنما', MENU.HELP);
}

export function cancelKeyboard() {
  return new InlineKeyboard().text('✖️ انصراف', MENU.CANCEL);
}

export function backToMenuKeyboard() {
  return new InlineKeyboard().text('⬅️ بازگشت به منو', MENU.BACK);
}

export function settingsKeyboard(opts: { notifyVulns: boolean; notifyUpdates: boolean }) {
  const kb = new InlineKeyboard();
  kb.text(
    opts.notifyVulns ? '🔴 آسیب‌پذیری‌ها: روشن' : '⚪ آسیب‌پذیری‌ها: خاموش',
    'settings:toggle:vulns'
  ).row();
  kb.text(opts.notifyUpdates ? '🔵 آپدیت‌ها: روشن' : '⚪ آپدیت‌ها: خاموش', 'settings:toggle:updates').row();
  kb.text('⬅️ بازگشت به منو', MENU.BACK);
  return kb;
}

export function analyzeKeyboard() {
  return new InlineKeyboard().text('⬅️ بازگشت به منو', MENU.BACK);
}

export function siteListKeyboard(sites: { origin: string }[]) {
  const kb = new InlineKeyboard();
  for (const site of sites) {
    const name = cleanSiteName(site.origin);
    kb.text(`✅ ${name}`, `watch:view:${site.origin}`).row();
  }
  kb.text('⬅️ بازگشت به منو', MENU.BACK);
  return kb;
}

export function watchManageKeyboard(siteOrigin: string) {
  const name = cleanSiteName(siteOrigin);
  const kb = new InlineKeyboard();
  kb.text('🗑️ حذف سایت', `watch:delete:${siteOrigin}`).row();
  kb.text('⏹️ توقف مانیتورینگ', `watch:stop:${siteOrigin}`).row();
  kb.text('⬅️ بازگشت', MENU.MY_WATCHES);
  return kb;
}
