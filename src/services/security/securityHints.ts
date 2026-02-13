import { fetchHead } from '../fetcher.js';
import type { SecurityHints } from '../../core/types.js';

export async function getSecurityHints(finalUrl: string, headers: Record<string,string>, opt: { timeoutMs: number; userAgent: string }): Promise<SecurityHints> {
  const h = (k: string) => headers[k.toLowerCase()];
  const securityHeaders = {
    hsts: !!h('strict-transport-security'),
    csp: !!h('content-security-policy'),
    xFrame: !!h('x-frame-options'),
    xcto: !!h('x-content-type-options'),
    referrerPolicy: !!h('referrer-policy'),
    permissionsPolicy: !!h('permissions-policy') || !!h('feature-policy')
  };

  const result: SecurityHints = { securityHeaders };

  // Light probes: HEAD to wp-login.php and xmlrpc.php
  try {
    const wpLogin = await fetchHead(new URL('/wp-login.php', finalUrl).toString(), opt);
    result.wpLoginAccessible = wpLogin.status !== 404;
  } catch {
    result.wpLoginAccessible = undefined;
  }

  try {
    const xmlrpc = await fetchHead(new URL('/xmlrpc.php', finalUrl).toString(), opt);
    result.xmlrpcAccessible = xmlrpc.status !== 404;
  } catch {
    result.xmlrpcAccessible = undefined;
  }

  return result;
}
