import { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import { env, isProd } from './config.js';
import db from './db/schema.js';

// ─── Session table in SQLite ────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

// ─── SQLite session store ───────────────────────────────────────────────────

class SQLiteStore extends session.Store {
  private getStmt = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?');
  private setStmt = db.prepare(
    'INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)'
  );
  private destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');

  get(sid: string, cb: (err?: Error | null, session?: session.SessionData | null) => void): void {
    try {
      const row = this.getStmt.get(sid, Date.now()) as { sess: string } | undefined;
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err as Error);
    }
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: Error | null) => void): void {
    try {
      const maxAge = sess.cookie?.maxAge ?? 86400000;
      const expired = Date.now() + maxAge;
      this.setStmt.run(sid, JSON.stringify(sess), expired);
      cb?.();
    } catch (err) {
      cb?.(err as Error);
    }
  }

  destroy(sid: string, cb?: (err?: Error | null) => void): void {
    try {
      this.destroyStmt.run(sid);
      cb?.();
    } catch (err) {
      cb?.(err as Error);
    }
  }
}

// ─── Session middleware ─────────────────────────────────────────────────────

export const sessionMiddleware = session({
  store: new SQLiteStore(),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

// ─── Augment session type ───────────────────────────────────────────────────

declare module 'express-session' {
  interface SessionData {
    user?: {
      uuid: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    };
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    oauthState?: string;
  }
}

// ─── Token refresh ──────────────────────────────────────────────────────────

async function refreshAccessToken(req: Request): Promise<string | null> {
  const { refreshToken } = req.session;
  if (!refreshToken) return null;

  const credentials = Buffer.from(`${env.BITBUCKET_CLIENT_ID}:${env.BITBUCKET_CLIENT_SECRET}`).toString('base64');

  const res = await fetch('https://bitbucket.org/site/oauth2/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  req.session.accessToken = data.access_token;
  req.session.refreshToken = data.refresh_token;
  req.session.tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return data.access_token;
}

// ─── Get valid access token (auto-refresh if needed) ────────────────────────

export async function getAccessToken(req: Request): Promise<string> {
  if (!req.session.accessToken) {
    throw new Error('Not authenticated');
  }

  // Refresh if token expires within 5 minutes
  if (req.session.tokenExpiresAt && req.session.tokenExpiresAt < Date.now() + 5 * 60 * 1000) {
    const newToken = await refreshAccessToken(req);
    if (!newToken) throw new Error('Failed to refresh token — please log in again');
    return newToken;
  }

  return req.session.accessToken;
}

// ─── Auth guard middleware ──────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user || !req.session.accessToken) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
