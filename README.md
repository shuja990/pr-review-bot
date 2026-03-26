# PR Review

AI-powered code review tool for Bitbucket Cloud pull requests, powered by Claude (Sonnet 4).

## Features

- **OAuth login** — Login with Bitbucket, no tokens to manage
- **AI code reviews** — Claude analyzes PR diffs and leaves actionable comments
- **Dashboard** — Track review history, costs, and statistics
- **Inline comments** — Post AI review comments directly to Bitbucket PRs
- **Re-review awareness** — Skips unchanged files on subsequent reviews

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, SQLite (better-sqlite3)
- **Frontend**: React 19, Vite, Tailwind CSS v4
- **AI**: Anthropic Claude API (Sonnet 4)
- **Auth**: Bitbucket OAuth 2.0

## Prerequisites

- Node.js 20+
- A [Bitbucket OAuth consumer](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/) with callback URL set to `{APP_URL}/auth/callback`
- An [Anthropic API key](https://console.anthropic.com/)

## Local Development

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.example .env

# Start dev servers (backend + frontend)
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend on port 3001.

## Production Deployment

This app requires a **persistent server** (not serverless) because it uses SQLite and background tasks. Recommended platforms: **Railway**, **Render**, or **Fly.io**.

```bash
# Build everything
npm run build

# Start production server
NODE_ENV=production npm start
```

In production, the Express server serves the built frontend as static files — deploy as a single app.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | No | `development` or `production` (default: `development`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `BITBUCKET_CLIENT_ID` | Yes | Bitbucket OAuth consumer key |
| `BITBUCKET_CLIENT_SECRET` | Yes | Bitbucket OAuth consumer secret |
| `SESSION_SECRET` | Yes | Random string for session encryption (min 8 chars) |
| `APP_URL` | Yes | Public URL of the app (e.g. `https://pr-review.up.railway.app`) |
| `PORT` | No | Server port (default: `3001`) |
| `WEBHOOK_SECRET` | No | Bitbucket webhook HMAC secret |
| `DATABASE_PATH` | No | Custom path for SQLite database file |

### Deploy to Railway

1. Push to GitHub
2. Create a new project on [Railway](https://railway.app)
3. Connect your GitHub repo
4. Set environment variables (see table above)
5. Set build command: `npm run build`
6. Set start command: `npm start`
7. Add a persistent volume mounted at `/app/packages/server/` for SQLite data
8. Update your Bitbucket OAuth consumer callback URL to `{RAILWAY_URL}/auth/callback`
