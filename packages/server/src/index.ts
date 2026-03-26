import express from 'express';
import cors from 'cors';
import { resolve } from 'path';
import { env, isProd } from './config.js';
import { sessionMiddleware } from './auth.js';
import { reviewsRouter } from './routes/reviews.js';
import { webhooksRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';

const app = express();

// Trust proxy in production (Railway, Render, etc.)
if (isProd) app.set('trust proxy', 1);

app.use(cors({
  origin: env.APP_URL,
  credentials: true,
}));

// Webhooks need raw body for HMAC — mount before express.json()
app.use('/webhooks', webhooksRouter);

app.use(express.json());
app.use(sessionMiddleware);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/auth', authRouter);

// API routes
app.use('/api/reviews', reviewsRouter);

// In production, serve the built frontend
if (isProd) {
  const clientDist = resolve(import.meta.dirname, '../../web/dist');
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`PR Review server listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});
