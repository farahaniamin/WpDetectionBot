import type { Bot } from 'grammy';
import type { Db } from '../../db/db.js';
import { queryStats } from '../../db/repos.js';
import type { AppConfig } from '../../core/config.js';

import type { MyContext } from '../context.js';

export function registerStats(bot: Bot<MyContext>, deps: { db: Db; cfg: AppConfig }) {
  bot.command('stats', async (ctx: MyContext) => {
    const id = ctx.from?.id;
    if (!id || !deps.cfg.ADMIN_USER_ID_SET.has(id)) {
      await ctx.reply('⛔️ دسترسی ندارید.');
      return;
    }

    const s1 = queryStats(deps.db, 1);
    const s30 = queryStats(deps.db, 30);

    await ctx.reply(
      [
        '📊 <b>Bot Stats</b>',
        '',
        `<b>Last 1 day</b>: requests=${s1.total}, users=${s1.users}, errors=${s1.errors}, avg=${s1.avgMs}ms`,
        `<b>Last 30 days</b>: requests=${s30.total}, users=${s30.users}, errors=${s30.errors}, avg=${s30.avgMs}ms`
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  });
}
