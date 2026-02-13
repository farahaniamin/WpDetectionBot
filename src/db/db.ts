import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      command TEXT NOT NULL,
      origin TEXT,
      duration_ms INTEGER,
      result TEXT NOT NULL,
      error_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, ts);

    CREATE TABLE IF NOT EXISTS cache (
      origin TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);

    CREATE TABLE IF NOT EXISTS vulns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      cve TEXT,
      cvss_score REAL,
      cvss_rating TEXT,
      published TEXT,
      updated TEXT,
      informational INTEGER,
      reference_url TEXT,
      remediation TEXT,
      last_seen_ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vulns_published ON vulns(published);
    CREATE INDEX IF NOT EXISTS idx_vulns_updated ON vulns(updated);
    CREATE INDEX IF NOT EXISTS idx_vulns_rating ON vulns(cvss_rating);

    CREATE TABLE IF NOT EXISTS vuln_software (
      vuln_id TEXT NOT NULL,
      type TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT,
      patched INTEGER,
      patched_versions_json TEXT,
      affected_versions_json TEXT,
      PRIMARY KEY (vuln_id, type, slug),
      FOREIGN KEY (vuln_id) REFERENCES vulns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vuln_software_slug ON vuln_software(type, slug);

    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      origin TEXT NOT NULL,
      components_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_notified_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, origin)
    );

    CREATE INDEX IF NOT EXISTS idx_watches_user ON watches(user_id);
    `
  },
  {
    version: 2,
    sql: `
    CREATE TABLE IF NOT EXISTS locks (
      name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_locks_expires ON locks(expires_at);
    `
  }
  ,
  {
    version: 3,
    sql: `
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      notify_vulns INTEGER NOT NULL DEFAULT 1,
      notify_updates INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sent_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      origin TEXT,
      kind TEXT NOT NULL,
      notif_key TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      UNIQUE(user_id, kind, notif_key)
    );

    CREATE INDEX IF NOT EXISTS idx_sent_notif_user ON sent_notifications(user_id, sent_at);
    `
  }
];

export function openDb(dbPath: string): Db {
  const abs = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const db = new Database(abs);
  db.pragma('foreign_keys = ON');

  // Determine current schema version
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value?: string } | undefined;
  const current = row?.value ? Number(row.value) : 0;

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run('schema_version', String(m.version));
    }
  }

  return db;
}
