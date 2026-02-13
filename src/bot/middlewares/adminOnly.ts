import type { MiddlewareFn } from 'grammy';

export function adminOnly(adminIds: Set<number>): MiddlewareFn {
  return async (ctx: any, next: any) => {
    const id = ctx.from?.id;
    console.log('[adminOnly] checking user:', id, 'against admins:', Array.from(adminIds));
    if (id && adminIds.has(id)) {
      console.log('[adminOnly] access granted for user:', id);
      return next();
    }
    console.log('[adminOnly] access denied for user:', id);
    await ctx.reply('⛔️ دسترسی ندارید.');
  };
}
