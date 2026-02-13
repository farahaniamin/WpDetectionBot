# wpinfo-telegram-bot (Phase 4)

Features:
- WordPress detection
- Theme detection (slug + style.css metadata when accessible)
- Detected plugins (from public assets)
- Passive version hints (readme.txt + asset ?ver=)
- SQLite analytics (events)
- SQLite persistent cache
- Wordfence vulnerability feed sync (local DB) + `/recent` + component risk section (periodic sync; user requests never call the API directly)
- Watch & notifications for newly published/updated serious vulns affecting watched sites

## Requirements
- Node.js 18+
- Build tooling for native modules (better-sqlite3)

## Setup
```bash
npm i
cp .env.example .env
# set BOT_TOKEN (and optionally WORDFENCE_API_KEY)
npm run dev
```

## UX / Flow
After `/start` you get a main menu with buttons:
- 🔎 Analyze site
- 👀 Watch (monitor)
- 🚨 Recent vulnerabilities
- ⚙️ Settings
- 📌 My watched sites
- ❓ Help

The bot also shows a live progress indicator while analyzing (message edits + a simple progress bar).

## Commands
- `/start` or `/menu`
- `/analyze <url>` (or send a URL as a message)
- `/recent [days]` show Critical/High vulnerabilities in last N days (default: 30)
- `/recent_site <url> [days]` show Critical/High vulnerabilities (from detected components) for a specific site
- `/watch <url>` start monitoring a site (uses detected components)
- `/unwatch <url>`
- `/mywatches`
- `/settings` toggle notifications per category
- `/stats` (admin only)
- `/sync_status` (admin only) show Wordfence sync status
- `/sync_vulns` (admin only) trigger a manual Wordfence sync

## Code quality
This repository includes ESLint + Prettier so naming/style stays consistent as the project grows:
```bash
npm run lint
npm run format
```

## Notes
- Detected plugins are **not** guaranteed to include all installed plugins.
- Version hints are best-effort and may be unavailable if public files are blocked.
- Wordfence sync uses a SQLite lock + backoff (HTTP 429) so running multiple instances won't accidentally hammer the API.
