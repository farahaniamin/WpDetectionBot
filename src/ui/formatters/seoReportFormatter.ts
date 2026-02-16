import type { SeoReport } from '../../services/seoAuditApi.js';

function cleanUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function getGradeEmoji(grade: string): string {
  const emojis: Record<string, string> = {
    'A': '🟢',
    'B': '🟢',
    'C': '🟡',
    'D': '🟠',
    'F': '🔴'
  };
  return emojis[grade] || '⚪';
}

function createProgressBar(value: number, total: number = 100): string {
  const filled = Math.round((value / total) * 10);
  const empty = 10 - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

export function formatSeoReport(report: SeoReport): string {
  const gradeEmoji = getGradeEmoji(report.scores.grade);
  const lines: string[] = [
    '━━━━━━━━━━━━━━━━━━',
    '📊 <b>گزارش SEO</b>',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '🌐 <b>سایت:</b> <code>' + cleanUrl(report.url) + '</code>',
    '',
    gradeEmoji + ' <b>نمره کلی:</b> ' + report.scores.overall + '/100',
    '📊 <b>رتبه:</b> ' + report.scores.grade,
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📈 <b>شاخص‌های کلیدی:</b>',
    '',
    '🎯 Indexability: ' + createProgressBar(report.scores.pillars.indexability) + ' ' + report.scores.pillars.indexability + '%',
    '🕷️ Crawlability: ' + createProgressBar(report.scores.pillars.crawlability) + ' ' + report.scores.pillars.crawlability + '%',
    '📝 On-Page SEO: ' + createProgressBar(report.scores.pillars.onpage) + ' ' + report.scores.pillars.onpage + '%',
    '⚙️ Technical: ' + createProgressBar(report.scores.pillars.technical) + ' ' + report.scores.pillars.technical + '%',
    '🔄 Freshness: ' + createProgressBar(report.scores.pillars.freshness) + ' ' + report.scores.pillars.freshness + '%',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📄 <b>صفحات بررسی شده:</b> ' + report.coverage.checked_pages,
    '🔍 <b>صفحات کشف شده:</b> ' + report.coverage.discovered_pages,
    '━━━━━━━━━━━━━━━━━━'
  ];

  // Add critical issues if any
  const criticalIssues = report.findings.filter(f => 
    f.severity === 'critical' || f.severity === 'high'
  );

  if (criticalIssues.length > 0) {
    lines.push(
      '',
      '⚠️ <b>مشکلات مهم:</b>',
      ''
    );
    
    criticalIssues.slice(0, 5).forEach((issue, index) => {
      const severityEmoji = issue.severity === 'critical' ? '🔴' : '🟠';
      lines.push(severityEmoji + ' <b>' + issue.title + '</b>');
      if (issue.description) {
        lines.push('   <i>' + issue.description.substring(0, 100) + '...</i>');
      }
      if (index < Math.min(criticalIssues.length, 5) - 1) {
        lines.push('');
      }
    });
    
    if (criticalIssues.length > 5) {
      lines.push('', '<i>و ' + (criticalIssues.length - 5) + ' مورد دیگر...</i>');
    }
  }

  // Add WordPress info if available
  if (report.wp_api?.available) {
    lines.push(
      '',
      '━━━━━━━━━━━━━━━━━━',
      '📱 <b>اطلاعات WordPress:</b>',
      ''
    );
    
    Object.entries(report.wp_api.postTypes).forEach(([type, count]) => {
      lines.push('   • ' + type + ': ' + count);
    });
    
    lines.push('   <b>مجموع:</b> ' + report.wp_api.totalItems + ' آیتم');
  }

  // Add freshness info if available
  if (report.freshness) {
    lines.push(
      '',
      '━━━━━━━━━━━━━━━━━━',
      '🔄 <b>تازگی محتوا:</b>',
      '',
      'نمره: ' + report.freshness.score + '/100',
      'محتوای قدیمی: ' + report.freshness.stale_count + ' مورد'
    );

    if (report.freshness.latest_products && report.freshness.latest_products.length > 0) {
      lines.push(
        '',
        '📦 <b>آخرین محصولات:</b>'
      );
      report.freshness.latest_products.slice(0, 3).forEach(product => {
        lines.push('   • ' + product.title);
      });
    }

    if (report.freshness.latest_posts && report.freshness.latest_posts.length > 0) {
      lines.push(
        '',
        '📝 <b>آخرین پست‌ها:</b>'
      );
      report.freshness.latest_posts.slice(0, 3).forEach(post => {
        lines.push('   • ' + post.title);
      });
    }
  }

  lines.push(
    '',
    '━━━━━━━━━━━━━━━━━━',
    '📄 <b>گزارش کامل:</b> PDF آماده دانلود است',
    '━━━━━━━━━━━━━━━━━━'
  );

  return lines.join('\n');
}

export function formatSeoProgress(stage: string, value: number): string {
  const bar = createProgressBar(value, 100);
  
  const stageLabels: Record<string, string> = {
    'queued': '⏳ در صف انتظار...',
    'robots': '🤖 بررسی robots.txt...',
    'sitemap': '🗺️ تحلیل sitemap...',
    'crawl': '🕷️ خزش صفحات (' + value + '%)...',
    'analysis': '🔍 تحلیل نتایج...',
    'scoring': '📊 محاسبه نمرات...',
  };

  return [
    '━━━━━━━━━━━━━━',
    '📊 <b>SEO Audit در حال اجرا</b>',
    '━━━━━━━━━━━━━━',
    '',
    stageLabels[stage] || '⏳ در حال پردازش...',
    '',
    bar,
    '',
    '⏱️ حدود ۲-۳ دقیقه زمان می‌بره',
    '━━━━━━━━━━━━━━'
  ].join('\n');
}

export function formatSeoError(errorCode: string): string {
  const messages: Record<string, string> = {
    'BAD_REQUEST': '❌ آدرس نامعتبر است. لطفاً URL را بررسی کنید.',
    'RATE_LIMITED': '⏳ محدودیت درخواست - لطفاً ۱ دقیقه دیگه تلاش کنید.',
    'TIMEOUT': '⏱️ زمان بررسی تمام شد. سایت خیلی بزرگ یا کند است.',
    'SITE_UNREACHABLE': '❌ سایت در دسترس نیست. لطفاً اتصال اینترنت را بررسی کنید.',
    'ROBOTS_BLOCKED': '🚫 دسترسی به سایت توسط robots.txt مسدود شده.',
    'INVALID_URL': '❌ آدرس نامعتبر است. URL باید با http:// یا https:// شروع شود.',
  };
  
  return messages[errorCode] || '❌ خطا: ' + errorCode;
}
