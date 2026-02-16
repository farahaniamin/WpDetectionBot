import { loadConfig } from '../core/config.js';

const cfg = loadConfig();
const API_URL = cfg.PLUGINYAB_API_URL || 'http://localhost:3001';

export interface PluginyabItem {
  id: number;
  source: string;
  type: 'plugin' | 'theme';
  title: string;
  slug: string;
  variant: 'fa' | 'original';
  category_slug: string;
  category_name: string;
  short_description: string;
  version: string;
  file_size: string;
  publish_date: string;
  download_url: string;
  last_scraped_at: string;
  download_status?: 'ok' | 'timeout' | 'dead' | 'unknown';
}

export interface PluginyabHealth {
  status: string;
  items: number;
  downloads: {
    ok: number;
    timeout: number;
    dead: number;
    unknown: number;
  };
}

export async function getHealth(): Promise<PluginyabHealth> {
  console.log('[pluginyabApi] Checking health at:', `${API_URL}/health`);
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    console.log('[pluginyabApi] Health response status:', response.status);
    if (!response.ok) {
      throw new Error(`Service unavailable: ${response.status}`);
    }
    const data = await response.json();
    console.log('[pluginyabApi] Health response data:', data);
    return data;
  } catch (e: any) {
    console.error('[pluginyabApi] Health check failed:', e?.message || e);
    throw e;
  }
}

export async function listItems(filters?: {
  type?: 'plugin' | 'theme';
  category?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: PluginyabItem[] }> {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.page) params.set('page', filters.page.toString());
  if (filters?.limit) params.set('limit', (filters.limit || 10).toString());

  const queryString = params.toString();
  const url = `${API_URL}/items${queryString ? '?' + queryString : ''}`;

  console.log('[pluginyabApi] Fetching items from:', url);

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    console.log('[pluginyabApi] Items response status:', response.status);

    if (!response.ok) {
      throw new Error(`Failed to fetch items: ${response.status}`);
    }

    const data = await response.json();
    console.log('[pluginyabApi] Items response data:', data);
    return data;
  } catch (e: any) {
    console.error('[pluginyabApi] Failed to fetch items:', e?.message || e);
    throw e;
  }
}

export async function getItem(id: number): Promise<PluginyabItem> {
  const response = await fetch(`${API_URL}/items/${id}`);
  if (!response.ok) {
    throw new Error(`Item not found: ${response.status}`);
  }
  return response.json();
}

export async function getItemWithStatus(id: number): Promise<PluginyabItem> {
  const response = await fetch(`${API_URL}/links/${id}`);
  if (!response.ok) {
    throw new Error(`Item not found: ${response.status}`);
  }
  return response.json();
}

export async function downloadFile(id: number): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const response = await fetch(`${API_URL}/download/${id}`);
    if (!response.ok) return null;

    const contentDisposition = response.headers.get('content-disposition');
    const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] || `plugin-${id}.zip`;
    const buffer = Buffer.from(await response.arrayBuffer());

    return { buffer, filename };
  } catch (error) {
    console.error('[pluginyabApi] Download error:', error);
    return null;
  }
}

// Static categories list for faster UI - Matching Pluginyab database
export const PLUGIN_CATEGORIES = [
  { slug: 'کاربردی', name: '🔧 کاربردی' },
  { slug: 'افزودنی المنتور', name: '✨ افزودنی المنتور' },
  { slug: 'فرم ساز', name: '📝 فرم ساز' },
  { slug: 'امنیتی', name: '🔒 امنیتی' },
  { slug: 'فروشگاهی', name: '🛒 فروشگاهی' },
  { slug: 'سئو', name: '📈 سئو' },
  { slug: 'پروفایل', name: '👤 پروفایل' },
  { slug: 'چند زبانه', name: '🌐 چند زبانه' },
  { slug: 'پشتیبان گیر', name: '💾 پشتیبان گیر' },
  { slug: 'صفحه ساز', name: '🎨 صفحه ساز' },
  { slug: 'همه افزونه ها', name: '🔌 همه افزونه‌ها' },
  { slug: 'اسلایدر', name: '🖼️ اسلایدر' }
];

export async function searchPlugins(query: string): Promise<PluginyabItem[]> {
  // First get all plugins, then filter locally
  // This is inefficient but the API doesn't have search endpoint
  const data = await listItems({ type: 'plugin', limit: 100 });
  const searchTerm = query.toLowerCase();

  return data.items.filter(
    (item) =>
      item.title.toLowerCase().includes(searchTerm) ||
      item.slug.toLowerCase().includes(searchTerm) ||
      item.short_description?.toLowerCase().includes(searchTerm)
  );
}
