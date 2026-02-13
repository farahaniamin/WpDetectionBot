import type { MiddlewareFn } from 'grammy';

type Bucket = { count: number; windowStart: number; blockedUntil: number };

export function rateLimitMiddleware(opt: {
  windowSec: number;
  max: number;
  penaltySec: number;
}): MiddlewareFn {
  const buckets = new Map<number, Bucket>();

  return async (ctx: any, next: any) => {
    const userId = ctx.from?.id;
    const text = ctx.msg?.text || '';
    console.log(`[rateLimit] user=${userId}, text="${text.substring(0, 50)}"`);
    if (!userId) return next();

    const now = Date.now();
    const b = buckets.get(userId) ?? { count: 0, windowStart: now, blockedUntil: 0 };

    if (b.blockedUntil > now) {
      await ctx.reply(`⏳ کمی صبر کن. شما موقتاً محدود شدی.`, {
        reply_parameters: { message_id: ctx.msg?.message_id }
      });
      buckets.set(userId, b);
      return;
    }

    if (now - b.windowStart > opt.windowSec * 1000) {
      b.windowStart = now;
      b.count = 0;
    }

    b.count += 1;
    if (b.count > opt.max) {
      b.blockedUntil = now + opt.penaltySec * 1000;
      buckets.set(userId, b);
      await ctx.reply(`🚦 خیلی سریع درخواست دادی. ${opt.penaltySec} ثانیه بعد دوباره امتحان کن.`, {
        reply_parameters: { message_id: ctx.msg?.message_id }
      });
      return;
    }

    buckets.set(userId, b);
    await next();
  };
}
