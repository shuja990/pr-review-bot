import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { resolve } from 'path';

// Resolve DB to the server package root (works from both src/ and dist/)
const PKG_ROOT = resolve(import.meta.dirname, '../../');
const DB_PATH = process.env.DATABASE_PATH ?? resolve(PKG_ROOT, 'data.db');

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    repo_slug TEXT NOT NULL,
    pr_id INTEGER NOT NULL,
    pr_title TEXT NOT NULL DEFAULT '',
    pr_author TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'partial')),
    files_reviewed INTEGER NOT NULL DEFAULT 0,
    files_skipped INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    summary_comment_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line INTEGER NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    bitbucket_comment_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_comments_review ON comments(review_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_repo_pr ON reviews(repo_slug, pr_id);
`);

// ─── Migrations (additive, safe to re-run) ──────────────────────────────────

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

if (!columnExists('reviews', 'input_tokens')) {
  db.exec(`ALTER TABLE reviews ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0`);
}
if (!columnExists('reviews', 'output_tokens')) {
  db.exec(`ALTER TABLE reviews ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0`);
}
if (!columnExists('reviews', 'cost_usd')) {
  db.exec(`ALTER TABLE reviews ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0`);
}
if (!columnExists('reviews', 'summary_comment_id')) {
  db.exec(`ALTER TABLE reviews ADD COLUMN summary_comment_id INTEGER`);
}
if (!columnExists('comments', 'is_resolved')) {
  db.exec(`ALTER TABLE comments ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 0`);
}
if (!columnExists('reviews', 'file_hashes')) {
  db.exec(`ALTER TABLE reviews ADD COLUMN file_hashes TEXT NOT NULL DEFAULT '{}'`);
}

// Migration: update CHECK constraint to allow 'failed' status
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews_new (
      id TEXT PRIMARY KEY,
      repo_slug TEXT NOT NULL,
      pr_id INTEGER NOT NULL,
      pr_title TEXT NOT NULL DEFAULT '',
      pr_author TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'partial', 'failed')),
      files_reviewed INTEGER NOT NULL DEFAULT 0,
      files_skipped INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      summary_comment_id INTEGER,
      file_hashes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO reviews_new SELECT id, repo_slug, pr_id, pr_title, pr_author, status, files_reviewed, files_skipped, input_tokens, output_tokens, cost_usd, summary_comment_id, file_hashes, created_at FROM reviews;
    DROP TABLE reviews;
    ALTER TABLE reviews_new RENAME TO reviews;
    CREATE INDEX IF NOT EXISTS idx_reviews_repo_pr ON reviews(repo_slug, pr_id);
  `);
} catch {
  // Already migrated
}

export default db;
