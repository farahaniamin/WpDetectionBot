import { loadConfig } from '../core/config.js';

const cfg = loadConfig();

export type SeoAuditStatus = 'queued' | 'running' | 'done' | 'failed';

export interface SeoAuditResponse {
  audit_id: string;
  status: SeoAuditStatus;
}

export interface SeoReport {
  schema_version: string;
  audit_id: string;
  url: string;
  profile: 'smart' | 'full';
  scores: {
    overall: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    site_type: string;
    pillars: {
      indexability: number;
      crawlability: number;
      onpage: number;
      technical: number;
      freshness: number;
    };
  };
  findings: Array<{
    code: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
  }>;
  coverage: {
    mode: string;
    checked_pages: number;
    discovered_pages: number;
    estimated_total_pages: number;
  };
  wp_api?: {
    available: boolean;
    postTypes: Record<string, number>;
    totalItems: number;
  };
  freshness?: {
    score: number;
    stale_count: number;
    freshness_grade: string;
    latest_products?: Array<{ title: string; modified: string }>;
    latest_posts?: Array<{ title: string; modified: string }>;
  };
}

interface AuditStatusResponse {
  audit_id: string;
  url: string;
  profile: string;
  status: SeoAuditStatus;
  progress?: {
    stage: string;
    value: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

const SEO_AUDIT_API_URL = cfg.SEO_AUDIT_API_URL || 'http://localhost:8787';
const POLL_INTERVAL_MS = cfg.SEO_AUDIT_POLL_INTERVAL_MS || 2000;
const TIMEOUT_MS = cfg.SEO_AUDIT_TIMEOUT_MS || 300000;

export async function createSeoAudit(
  url: string,
  profile: 'smart' | 'full' = 'smart'
): Promise<SeoAuditResponse> {
  const response = await fetch(`${SEO_AUDIT_API_URL}/v1/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, profile })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: 'Unknown error' }
    }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getSeoAuditStatus(auditId: string): Promise<AuditStatusResponse> {
  const response = await fetch(`${SEO_AUDIT_API_URL}/v1/audits/${auditId}`);

  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.status}`);
  }

  return response.json();
}

export async function getSeoReport(auditId: string): Promise<SeoReport | null> {
  const response = await fetch(`${SEO_AUDIT_API_URL}/v1/audits/${auditId}/report`);

  if (response.status === 409) {
    return null; // Not ready yet
  }

  if (!response.ok) {
    throw new Error(`Failed to get report: ${response.status}`);
  }

  return response.json();
}

export async function getSeoTelegramSummary(
  auditId: string,
  lang: 'fa' | 'en' = 'fa'
): Promise<{ text: string; pdf_url: string }> {
  const response = await fetch(`${SEO_AUDIT_API_URL}/v1/audits/${auditId}/telegram?lang=${lang}`);

  if (!response.ok) {
    throw new Error(`Failed to get summary: ${response.status}`);
  }

  return response.json();
}

export function getPdfUrl(auditId: string, lang: 'fa' | 'en' = 'fa'): string {
  return `${SEO_AUDIT_API_URL}/v1/audits/${auditId}/report.pdf?lang=${lang}`;
}

export function isLocalhostUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
}

export async function downloadPdf(auditId: string, lang: 'fa' | 'en' = 'fa'): Promise<Buffer | null> {
  try {
    const response = await fetch(`${SEO_AUDIT_API_URL}/v1/audits/${auditId}/report.pdf?lang=${lang}`);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function pollForCompletion(
  auditId: string,
  onProgress?: (stage: string, value: number) => void
): Promise<SeoReport> {
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    const status = await getSeoAuditStatus(auditId);

    if (status.status === 'done') {
      const report = await getSeoReport(auditId);
      if (report) return report;
    }

    if (status.status === 'failed') {
      throw new Error(status.error?.message || 'Audit failed');
    }

    if (status.progress && onProgress) {
      onProgress(status.progress.stage, status.progress.value);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Timeout: Audit took too long');
}

export function formatStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    queued: '⏳ در صف انتظار...',
    robots: '🤖 بررسی robots.txt...',
    sitemap: '🗺️ تحلیل sitemap...',
    crawl: '🕷️ خزش صفحات...',
    analysis: '🔍 تحلیل نتایج...',
    scoring: '📊 محاسبه نمرات...'
  };
  return labels[stage] || '⏳ در حال پردازش...';
}

export function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    BAD_REQUEST: '❌ آدرس نامعتبر است',
    RATE_LIMITED: '⏳ محدودیت درخواست - لطفاً ۱ دقیقه دیگه تلاش کنید',
    TIMEOUT: '⏱️ زمان بررسی تمام شد',
    SITE_UNREACHABLE: '❌ سایت در دسترس نیست',
    ROBOTS_BLOCKED: '🚫 دسترسی به سایت توسط robots.txt مسدود شده',
    INVALID_URL: '❌ آدرس نامعتبر است'
  };
  return messages[error] || `❌ خطا: ${error}`;
}

function cleanUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
