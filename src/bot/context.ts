import type { Context, SessionFlavor } from 'grammy';

export type SessionData = {
  flow: 'idle' | 'awaiting_analyze_url' | 'awaiting_watch_url' | 'awaiting_unwatch_url';
};

export type MyContext = Context & SessionFlavor<SessionData>;

export function initialSession(): SessionData {
  return { flow: 'idle' };
}
