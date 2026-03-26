import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { env } from '../config.js';

export const authRouter = Router();

const BITBUCKET_AUTH_URL = 'https://bitbucket.org/site/oauth2/authorize';
const BITBUCKET_TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token';
const BITBUCKET_USER_URL = 'https://api.bitbucket.org/2.0/user';

// ─── Login — redirect to Bitbucket ─────────────────────────────────────────

authRouter.get('/login', (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: env.BITBUCKET_CLIENT_ID,
    response_type: 'code',
    state,
  });

  res.redirect(`${BITBUCKET_AUTH_URL}?${params.toString()}`);
});

// ─── OAuth callback ─────────────────────────────────────────────────────────

authRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state || state !== req.session.oauthState) {
      res.status(400).json({ error: 'Invalid OAuth state' });
      return;
    }
    delete req.session.oauthState;

    // Exchange code for tokens (Bitbucket requires Basic auth with client_id:secret)
    const credentials = Buffer.from(`${env.BITBUCKET_CLIENT_ID}:${env.BITBUCKET_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch(BITBUCKET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Token exchange failed:', text);
      res.status(400).json({ error: 'Failed to exchange code for token' });
      return;
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Fetch user profile
    const userRes = await fetch(BITBUCKET_USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      res.status(400).json({ error: 'Failed to fetch user profile' });
      return;
    }

    const userData = (await userRes.json()) as {
      uuid: string;
      username: string;
      display_name: string;
      links: { avatar: { href: string } };
    };

    // Store in session
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    req.session.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;
    req.session.user = {
      uuid: userData.uuid,
      username: userData.username,
      displayName: userData.display_name,
      avatarUrl: userData.links.avatar.href,
    };

    // Redirect back to the app
    res.redirect(env.APP_URL);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// ─── Get current user ───────────────────────────────────────────────────────

authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.session.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json(req.session.user);
});

// ─── Logout ─────────────────────────────────────────────────────────────────

authRouter.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});
