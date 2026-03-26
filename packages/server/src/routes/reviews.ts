import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { reviewPR, postSummaryComment } from '../review/reviewer.js';
import {
  createReview,
  createPendingReview,
  completeReview,
  failReview,
  listReviews,
  getReviewById,
  setCommentStatus,
  editCommentBody,
  approveAll,
  getApprovedComments,
  markCommentPosted,
  markReviewCompleted,
  setCommentResolved,
  getDashboardStats,
} from '../db/repository.js';
import { postInlineComment } from '../bitbucket/comments.js';
import { requireAuth, getAccessToken } from '../auth.js';
import { bitbucketRequest } from '../bitbucket/client.js';

export const reviewsRouter = Router();

// All review routes require authentication
reviewsRouter.use(requireAuth);

// ─── User's workspaces ──────────────────────────────────────────────────────

interface BitbucketWorkspace {
  slug: string;
  name: string;
  uuid: string;
}

reviewsRouter.get('/workspaces', async (req: Request, res: Response) => {
  try {
    const token = await getAccessToken(req);
    const data = await bitbucketRequest<{ values: BitbucketWorkspace[] }>({
      accessToken: token,
      path: '/workspaces?pagelen=100',
    });
    const workspaces = data.values.map((w) => ({
      slug: w.slug,
      name: w.name,
      uuid: w.uuid,
    }));
    res.json(workspaces);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch workspaces';
    res.status(400).json({ error: message });
  }
});

// ─── Repos in a workspace ───────────────────────────────────────────────────

reviewsRouter.get('/workspaces/:workspace/repos', async (req: Request<{ workspace: string }>, res: Response) => {
  try {
    const token = await getAccessToken(req);
    const { workspace } = req.params;
    const data = await bitbucketRequest<{ values: { slug: string; name: string; full_name: string }[] }>({
      accessToken: token,
      path: `/repositories/${encodeURIComponent(workspace)}?pagelen=100&sort=-updated_on`,
    });
    const repos = data.values.map((r) => ({
      slug: r.slug,
      name: r.name,
      full_name: r.full_name,
    }));
    res.json(repos);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch repos';
    res.status(400).json({ error: message });
  }
});

// ─── Open PRs for a repo ────────────────────────────────────────────────────

interface BitbucketPR {
  id: number;
  title: string;
  author: { display_name: string };
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
}

reviewsRouter.get('/workspaces/:workspace/repos/:slug/prs', async (req: Request<{ workspace: string; slug: string }>, res: Response) => {
  try {
    const token = await getAccessToken(req);
    const { workspace, slug } = req.params;
    const data = await bitbucketRequest<{ values: BitbucketPR[] }>({
      accessToken: token,
      path: `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}/pullrequests?state=OPEN&pagelen=50`,
    });
    const prs = data.values.map((pr) => ({
      id: pr.id,
      title: pr.title,
      author: pr.author.display_name,
      source_branch: pr.source.branch.name,
      dest_branch: pr.destination.branch.name,
    }));
    res.json(prs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch PRs';
    res.status(400).json({ error: message });
  }
});

// ─── Dashboard stats ────────────────────────────────────────────────────────

reviewsRouter.get('/stats', (_req: Request, res: Response) => {
  const stats = getDashboardStats();
  res.json(stats);
});

// ─── Trigger a new review ───────────────────────────────────────────────────

const triggerSchema = z.object({
  workspace: z.string().min(1),
  repo_slug: z.string().min(1),
  pr_id: z.coerce.number().int().positive(),
  instructions: z.string().optional(),
  post_summary: z.boolean().optional(),
});

reviewsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const token = await getAccessToken(req);
    const { workspace, repo_slug, pr_id, instructions, post_summary } = triggerSchema.parse(req.body);

    // Create a pending review immediately and respond
    const review = createPendingReview(`${workspace}/${repo_slug}`, pr_id);
    res.status(201).json(review);

    // Run the AI review in the background
    (async () => {
      try {
        console.log(`[review] Starting background review ${review.id} for ${workspace}/${repo_slug} PR #${pr_id}`);
        const result = await reviewPR(token, workspace, repo_slug, pr_id, instructions);

        completeReview(review.id, {
          prTitle: result.prInfo.title,
          prAuthor: result.prInfo.author,
          filesReviewed: result.filesReviewed,
          filesSkipped: result.filesSkipped,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          fileHashes: result.fileHashes,
          comments: result.comments,
        });

        console.log(`[review] Background review ${review.id} completed successfully`);

        if (post_summary) {
          await postSummaryComment(token, workspace, repo_slug, pr_id, review.id, result);
        }
      } catch (err) {
        console.error(`[review] Background review ${review.id} failed:`, err);
        try { failReview(review.id); } catch { /* already failed or constraint issue */ }
      }
    })();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

// ─── List reviews ───────────────────────────────────────────────────────────

reviewsRouter.get('/', (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const data = listReviews(page, limit);
  res.json(data);
});

// ─── Get review by ID ───────────────────────────────────────────────────────

reviewsRouter.get('/:id', (req: Request<{ id: string }>, res: Response) => {
  const review = getReviewById(req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  res.json(review);
});

// ─── Update comment status or body ──────────────────────────────────────────

const patchCommentSchema = z.object({
  status: z.enum(['approved', 'rejected']).optional(),
  body: z.string().min(1).optional(),
});

reviewsRouter.patch('/:id/comments/:commentId', (req: Request<{ id: string; commentId: string }>, res: Response) => {
  const { status, body } = patchCommentSchema.parse(req.body);

  let comment = null;
  if (status) {
    comment = setCommentStatus(req.params.commentId, status);
  }
  if (body) {
    comment = editCommentBody(req.params.commentId, body);
  }

  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  res.json(comment);
});

// ─── Approve all pending comments ───────────────────────────────────────────

reviewsRouter.post('/:id/approve-all', (req: Request<{ id: string }>, res: Response) => {
  const review = getReviewById(req.params.id);
  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }

  const count = approveAll(req.params.id);
  res.json({ approved: count });
});

// ─── Post approved comments to Bitbucket ────────────────────────────────────

const postCommentsSchema = z.object({
  commentIds: z.array(z.string()).optional(),
});

reviewsRouter.post('/:id/comments/post', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const token = await getAccessToken(req);
    const review = getReviewById(req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }

    // repo_slug stored as "workspace/repo"
    const [workspace, repoSlug] = review.repo_slug.includes('/')
      ? review.repo_slug.split('/', 2)
      : ['', review.repo_slug];

    if (!workspace) {
      res.status(400).json({ error: 'Review missing workspace info' });
      return;
    }

    const { commentIds } = postCommentsSchema.parse(req.body);
    let comments = getApprovedComments(review.id);

    if (commentIds?.length) {
      const set = new Set(commentIds);
      comments = comments.filter((c) => set.has(c.id));
    }

    if (comments.length === 0) {
      res.json({ posted: 0, message: 'No approved comments to post' });
      return;
    }

    let posted = 0;
    const errors: string[] = [];

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      try {
        const result = await postInlineComment(token, workspace, repoSlug, review.pr_id, {
          filePath: comment.file_path,
          line: comment.line,
          body: comment.body,
        });
        markCommentPosted(comment.id, result.id);
        posted++;

        // Rate-limit: small delay between posts to avoid throttling
        if (i < comments.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Comment ${comment.id}: ${msg}`);
      }
    }

    if (posted === comments.length) {
      markReviewCompleted(review.id);
    }

    res.json({ posted, total: comments.length, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

// ─── Toggle comment resolved ────────────────────────────────────────────────

reviewsRouter.patch('/:id/comments/:commentId/resolve', (req: Request<{ id: string; commentId: string }>, res: Response) => {
  const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
  const comment = setCommentResolved(req.params.commentId, resolved);
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  res.json(comment);
});
