import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import { env } from '../config.js';

export const webhooksRouter = Router();

// Use raw body for HMAC signature verification
webhooksRouter.use(express.raw({ type: 'application/json' }));

function verifySignature(payload: Buffer, signature: string | undefined): boolean {
  if (!env.WEBHOOK_SECRET) return true;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', env.WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (expected.length !== signature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Webhook handler — logs PR events. Reviews are triggered manually via the UI
// since Bitbucket API access is tied to user OAuth sessions.
webhooksRouter.post('/bitbucket', (req: Request, res: Response) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const signature = req.headers['x-hub-signature'] as string | undefined;

    if (!verifySignature(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const parsed = Buffer.isBuffer(req.body) ? JSON.parse(rawBody.toString()) : req.body;
    const event = req.headers['x-event-key'] as string;

    if (event !== 'pullrequest:created' && event !== 'pullrequest:updated') {
      res.status(200).json({ ignored: true, event });
      return;
    }

    const pr = parsed?.pullrequest;
    const repo = parsed?.repository;

    if (!pr || !repo) {
      res.status(400).json({ error: 'Missing pullrequest or repository in payload' });
      return;
    }

    const repoSlug: string = repo.full_name ?? repo.name;
    const prId: number = pr.id;

    console.log(`Webhook received: ${event} for ${repoSlug}#${prId} — trigger review via the UI`);

    res.status(200).json({
      message: 'PR event received. Trigger review via the dashboard.',
      repo: repoSlug,
      pr_id: prId,
      event,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
