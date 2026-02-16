# WPInfo Telegram Bot v2.1

[![Version](https://img.shields.io/badge/version-2.1-blue.svg)](https://github.com/farahaniamin/WpDetectionBot)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

A comprehensive WordPress security analysis and management bot for Telegram with Persian (Farsi) interface.

---

## ✨ Features

### 🔍 WordPress Analysis

- **WordPress Detection** - Identifies if a site runs WordPress
- **Theme Detection** - Detects active theme (slug + metadata from style.css)
- **Plugin Detection** - Discovers plugins from public assets
- **Version Hints** - Passive version detection via readme.txt and asset queries
- **Security Headers** - Checks HSTS, CSP, X-Frame-Options, etc.
- **Vulnerability Scan** - Cross-references with Wordfence database

### 📊 SEO Audit (v2.0+)

- **5-Pillar Scoring** - Indexability, Crawlability, On-Page SEO, Technical, Freshness
- **Grade System** - A-F grading with visual progress bars
- **WordPress Integration** - Detects post types, content freshness
- **PDF Reports** - Downloadable comprehensive reports
- **Real-time Progress** - Live updates during audit

### 📦 Plugin Download (v2.1+)

- **12 Categories** - 125+ plugins from Pluginyab.ir
- **Direct Download** - Get plugins as zip files via Telegram
- **Category Browse** - Browse by type (SEO, Security, Forms, etc.)
- **File Size Check** - Automatic validation before download
- **Persian Plugins** - Full Persian-language plugin repository

### 👁️ Monitoring & Alerts

- **Watch System** - Monitor multiple sites
- **Vulnerability Alerts** - Real-time notifications for Critical/High severity issues
- **Component Tracking** - Auto-detects themes/plugins for watch list
- **SQLite Analytics** - Event tracking and usage statistics

### 🛡️ Security

- **Wordfence Integration** - Local vulnerability database sync
- **Rate Limiting** - Per-user request limits
- **Private IP Blocking** - Prevents internal network scanning
- **robots.txt Respect** - Follows site crawling policies

---

## 🚀 Quick Start

### Requirements

- Node.js 20+
- Build tooling for native modules (better-sqlite3)

### Setup

```bash
# Clone repository
git clone https://github.com/farahaniamin/WpDetectionBot.git
cd WpDetectionBot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
# - BOT_TOKEN (from @BotFather)
# - WORDFENCE_API_KEY (optional)
# - PLUGINYAB_API_URL (optional, default: http://localhost:3001)

# Run in development mode
npm run dev

# Or build and run production
npm run build
npm start
```

---

## 💬 Usage

### Main Menu

After `/start`, you'll see a menu with these options:

| Button                 | Feature                                 |
| ---------------------- | --------------------------------------- |
| 🔍 بررسی سایت          | Analyze any WordPress site              |
| 📊 SEO Audit           | Full SEO analysis with 5-pillar scoring |
| 📦 دانلود افزونه       | Browse and download 125+ plugins        |
| 👁️ مانیتورینگ          | Add sites to watch list                 |
| ⚡ آسیب‌پذیری‌های اخیر | Recent Critical/High vulnerabilities    |
| 📁 سایت‌های من         | Manage watched sites                    |
| ⚙️ تنظیمات             | Notification preferences                |

### Commands

**Analysis Commands:**

- `/analyze <url>` - Analyze a WordPress site
- `/seo <url>` - Run SEO audit
- Send any URL as message for instant analysis

**Watch Commands:**

- `/watch <url>` - Add site to monitoring
- `/unwatch <url>` - Remove from monitoring
- `/mywatches` - List all watched sites

**Vulnerability Commands:**

- `/recent [days]` - Show recent vulnerabilities (default: 30 days)
- `/recent_site <url> [days]` - Check vulnerabilities for specific site

**Admin Commands:**

- `/stats` - Show bot statistics
- `/sync_status` - Check Wordfence sync status
- `/sync_vulns` - Trigger manual vulnerability sync

---

## 📦 Plugin Categories (v2.1+)

The bot integrates with Pluginyab-Scraper to provide direct plugin downloads:

| Category                          | Persian Name       | Plugins |
| --------------------------------- | ------------------ | ------- |
| public-plugins                    | 🔧 کاربردی         | 19      |
| elementor-addon                   | ✨ افزودنی المنتور | 24      |
| forms-plugins                     | 📝 فرم ساز         | 11      |
| security-plugins                  | 🔒 امنیتی          | 11      |
| ecommerce-plugins                 | 🛒 فروشگاهی        | 10      |
| seo-plugins                       | 📈 سئو             | 9       |
| user-profile-registration-plugins | 👤 پروفایل         | 7       |
| multi-languages-plugins           | 🌐 چند زبانه       | 6       |
| backup-plugins                    | 💾 پشتیبان گیر     | 6       |
| theme-builder-plugin              | 🎨 صفحه ساز        | 6       |
| slider-plugins                    | 🖼️ اسلایدر         | 5       |
| download-wordpress-plugins        | 🔌 همه افزونه‌ها   | 11      |

**Total: 125 plugins available for download!**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           WPInfo Telegram Bot               │
├─────────────────────────────────────────────┤
│                                             │
│  📱 Telegram Interface (Grammy)            │
│       ↓                                     │
│  🎛️ Menu & Command Handlers               │
│       ↓                                     │
│  🔧 Services                                │
│    ├── Site Analyzer (WordPress detection) │
│    ├── SEO Audit API Client                │
│    ├── Pluginyab API Client (v2.1+)        │
│    └── Wordfence Sync                      │
│       ↓                                     │
│  💾 SQLite Database                        │
│    ├── Cache & Analytics                   │
│    ├── Watch List                          │
│    └── Vulnerability DB                    │
│       ↓                                     │
└─────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────┐
│         External Services                   │
│  • Telegram Bot API                        │
│  • Wordfence API                           │
│  • Seo-Audit-API (optional)                │
│  • Pluginyab-Scraper (optional, v2.1+)     │
└─────────────────────────────────────────────┘
```

For detailed technical documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🛠️ Development

### Code Quality

```bash
# Run linter
npm run lint

# Fix formatting
npm run format

# Type check
npx tsc --noEmit
```

### Environment Variables

| Variable            | Required | Default                 | Description               |
| ------------------- | -------- | ----------------------- | ------------------------- |
| `BOT_TOKEN`         | Yes      | -                       | Telegram bot token        |
| `WORDFENCE_API_KEY` | No       | -                       | Wordfence API key         |
| `PLUGINYAB_API_URL` | No       | `http://localhost:3001` | Plugin download service   |
| `SEO_AUDIT_API_URL` | No       | `http://localhost:8787` | SEO audit service         |
| `ADMIN_USER_IDS`    | No       | -                       | Comma-separated admin IDs |

---

## 📝 Changelog

### v2.1 (Latest)

- ✅ **NEW**: Plugin Download feature - Browse and download 125+ plugins from 12 categories
- ✅ **NEW**: Integration with Pluginyab-Scraper service
- ✅ **NEW**: Persian plugin repository with direct Telegram downloads
- ✅ Improved: Better error handling and debugging
- ✅ Fixed: Category slug matching for plugin browser

### v2.0

- ✅ **NEW**: SEO Audit integration with 5-pillar scoring
- ✅ **NEW**: Real-time progress tracking for long operations
- ✅ **NEW**: PDF report downloads
- ✅ **NEW**: WordPress REST API integration for content analysis
- ✅ Improved: Enhanced UI with Persian formatting
- ✅ Fixed: Localhost URL handling for buttons

### v1.0

- ✅ WordPress site analysis (themes, plugins, versions)
- ✅ Vulnerability monitoring with Wordfence
- ✅ Watch system for automated notifications
- ✅ SQLite database for caching and storage
- ✅ Admin commands for sync management
- ✅ Persian (Farsi) interface

---

## ⚠️ Notes

- Detected plugins are **not** guaranteed to include all installed plugins
- Version hints are best-effort and may be unavailable if public files are blocked
- Wordfence sync uses SQLite locking + backoff to prevent API rate limiting
- Plugin downloads require separate [Pluginyab-Scraper](https://github.com/farahaniamin/Pluginyab-Scraper) service
- SEO audits require separate Seo-Audit-API service

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm run build`
5. Submit a pull request

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/farahaniamin/WpDetectionBot/issues)
- **Documentation**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Telegram**: [@WpInfoBot](https://t.me/WpInfoBot)

---

**Made with ❤️ for the Persian WordPress Community**
