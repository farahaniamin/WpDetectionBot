import type { MyContext } from '../bot/context.js';

function progressBar(percent: number) {
  const total = 10;
  const filled = Math.max(0, Math.min(total, Math.round((percent / 100) * total)));
  return '▰'.repeat(filled) + '▱'.repeat(total - filled);
}

export type ProgressReporter = {
  step: (stage: string, percent: number) => Promise<void>;
  done: (finalLine?: string) => Promise<void>;
};

export async function createProgressReporter(ctx: MyContext): Promise<ProgressReporter> {
  const msg = await ctx.reply(`🔎 <b>WPInfo</b>\nدر حال شروع…\n${progressBar(0)} 0%`, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }
  });

  const chatId = ctx.chat!.id;
  const messageId = msg.message_id;

  let lastEditAt = 0;
  let lastText = '';

  const safeEdit = async (text: string, force = false) => {
    const now = Date.now();
    // throttle edits to avoid Telegram flood limits
    if (!force && now - lastEditAt < 700) return;
    if (text === lastText) return;

    try {
      await ctx.api.editMessageText(chatId, messageId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }
      });
      lastEditAt = now;
      lastText = text;
    } catch {
      // ignore: message might be unchanged or editing too fast
    }
  };

  return {
    step: async (stage: string, percent: number) => {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      const text = `🔎 <b>WPInfo</b>\nدر حال بررسی: <b>${escapeHtml(stage)}</b>\n${progressBar(p)} ${p}%`;
      await safeEdit(text);
    },
    done: async (finalLine) => {
      const text = `✅ <b>WPInfo</b>\n${escapeHtml(finalLine ?? 'گزارش آماده شد.')}\n${progressBar(100)} 100%`;
      await safeEdit(text, true);
    }
  };
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
