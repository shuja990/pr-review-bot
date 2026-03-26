import { randomUUID } from 'crypto';
import db from './schema.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  repo_slug: string;
  pr_id: number;
  pr_title: string;
  pr_author: string;
  status: 'pending' | 'completed' | 'partial' | 'failed';
  files_reviewed: number;
  files_skipped: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  summary_comment_id: number | null;
  file_hashes: string;
  created_at: string;
}

export interface Comment {
  id: string;
  review_id: string;
  file_path: string;
  line: number;
  severity: 'critical' | 'warning' | 'info';
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  bitbucket_comment_id: number | null;
  is_resolved: number;
  created_at: string;
}

export interface ReviewWithComments extends Review {
  comments: Comment[];
}

// ─── Reviews ────────────────────────────────────────────────────────────────

const insertReview = db.prepare(`
  INSERT INTO reviews (id, repo_slug, pr_id, pr_title, pr_author, status, files_reviewed, files_skipped, input_tokens, output_tokens, cost_usd, file_hashes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectReviews = db.prepare(`
  SELECT * FROM reviews ORDER BY created_at DESC LIMIT ? OFFSET ?
`);

const countReviews = db.prepare(`SELECT COUNT(*) as count FROM reviews`);

const selectReviewById = db.prepare(`SELECT * FROM reviews WHERE id = ?`);

const updateReviewStatus = db.prepare(`
  UPDATE reviews SET status = ? WHERE id = ?
`);

const selectLatestReviewForPR = db.prepare(`
  SELECT * FROM reviews WHERE repo_slug = ? AND pr_id = ? ORDER BY created_at DESC LIMIT 1
`);

const updateReviewSummaryCommentId = db.prepare(`
  UPDATE reviews SET summary_comment_id = ? WHERE id = ?
`);

const updateReviewResults = db.prepare(`
  UPDATE reviews SET status = ?, pr_title = ?, pr_author = ?, files_reviewed = ?, files_skipped = ?,
    input_tokens = ?, output_tokens = ?, cost_usd = ?, file_hashes = ? WHERE id = ?
`);

// ─── Comments ───────────────────────────────────────────────────────────────

const insertComment = db.prepare(`
  INSERT INTO comments (id, review_id, file_path, line, severity, body) VALUES (?, ?, ?, ?, ?, ?)
`);

const selectCommentsByReview = db.prepare(`
  SELECT * FROM comments WHERE review_id = ? ORDER BY file_path, line
`);

const selectCommentById = db.prepare(`SELECT * FROM comments WHERE id = ?`);

const updateCommentStatus = db.prepare(`
  UPDATE comments SET status = ? WHERE id = ?
`);

const updateCommentBody = db.prepare(`
  UPDATE comments SET body = ? WHERE id = ?
`);

const updateCommentBitbucketId = db.prepare(`
  UPDATE comments SET bitbucket_comment_id = ? WHERE id = ?
`);

const approveAllPending = db.prepare(`
  UPDATE comments SET status = 'approved' WHERE review_id = ? AND status = 'pending'
`);

const selectApprovedComments = db.prepare(`
  SELECT * FROM comments WHERE review_id = ? AND status = 'approved' AND bitbucket_comment_id IS NULL
`);

const updateCommentResolved = db.prepare(`
  UPDATE comments SET is_resolved = ? WHERE id = ?
`);

// ─── Stats ──────────────────────────────────────────────────────────────────

const selectStats = db.prepare(`
  SELECT
    COUNT(*) as total_reviews,
    COALESCE(SUM(input_tokens), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens), 0) as total_output_tokens,
    COALESCE(SUM(cost_usd), 0) as total_cost_usd
  FROM reviews
`);

const selectStatsByRepo = db.prepare(`
  SELECT
    repo_slug,
    COUNT(*) as total_reviews,
    COALESCE(SUM(input_tokens), 0) as total_input_tokens,
    COALESCE(SUM(output_tokens), 0) as total_output_tokens,
    COALESCE(SUM(cost_usd), 0) as total_cost_usd
  FROM reviews
  GROUP BY repo_slug
  ORDER BY total_reviews DESC
`);

const selectCommentStats = db.prepare(`
  SELECT
    COUNT(*) as total_comments,
    SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
    SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) as warning_count,
    SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) as info_count,
    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
    SUM(CASE WHEN bitbucket_comment_id IS NOT NULL THEN 1 ELSE 0 END) as posted_count
  FROM comments
`);

const selectRecentReviews = db.prepare(`
  SELECT r.*, 
    (SELECT COUNT(*) FROM comments c WHERE c.review_id = r.id) as comment_count,
    (SELECT COUNT(*) FROM comments c WHERE c.review_id = r.id AND c.severity = 'critical') as critical_count
  FROM reviews r
  ORDER BY r.created_at DESC
  LIMIT ?
`);

// ─── Repository Functions ───────────────────────────────────────────────────

export function createReview(data: {
  repoSlug: string;
  prId: number;
  prTitle: string;
  prAuthor: string;
  filesReviewed: number;
  filesSkipped: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  fileHashes?: Record<string, string>;
  comments: { filePath: string; line: number; severity: string; body: string }[];
}): ReviewWithComments {
  const reviewId = randomUUID();

  const insertAll = db.transaction(() => {
    insertReview.run(
      reviewId,
      data.repoSlug,
      data.prId,
      data.prTitle,
      data.prAuthor,
      'pending',
      data.filesReviewed,
      data.filesSkipped,
      data.inputTokens ?? 0,
      data.outputTokens ?? 0,
      data.costUsd ?? 0,
      JSON.stringify(data.fileHashes ?? {})
    );

    for (const c of data.comments) {
      insertComment.run(randomUUID(), reviewId, c.filePath, c.line, c.severity, c.body);
    }
  });

  insertAll();

  return getReviewById(reviewId)!;
}

export function listReviews(page = 1, limit = 20): { reviews: Review[]; total: number } {
  const offset = (page - 1) * limit;
  const reviews = selectReviews.all(limit, offset) as Review[];
  const { count } = countReviews.get() as { count: number };
  return { reviews, total: count };
}

export function getReviewById(id: string): ReviewWithComments | null {
  const review = selectReviewById.get(id) as Review | undefined;
  if (!review) return null;

  const comments = selectCommentsByReview.all(id) as Comment[];
  return { ...review, comments };
}

export function getLatestReviewForPR(repoSlug: string, prId: number): Review | null {
  return (selectLatestReviewForPR.get(repoSlug, prId) as Review) ?? null;
}

export function setCommentStatus(commentId: string, status: 'approved' | 'rejected'): Comment | null {
  updateCommentStatus.run(status, commentId);
  return selectCommentById.get(commentId) as Comment | null;
}

export function editCommentBody(commentId: string, body: string): Comment | null {
  updateCommentBody.run(body, commentId);
  return selectCommentById.get(commentId) as Comment | null;
}

export function approveAll(reviewId: string): number {
  const result = approveAllPending.run(reviewId);
  return result.changes;
}

export function getApprovedComments(reviewId: string): Comment[] {
  return selectApprovedComments.all(reviewId) as Comment[];
}

export function markCommentPosted(commentId: string, bitbucketCommentId: number): void {
  updateCommentBitbucketId.run(bitbucketCommentId, commentId);
}

export function markReviewCompleted(reviewId: string): void {
  updateReviewStatus.run('completed', reviewId);
}

export function createPendingReview(repoSlug: string, prId: number): ReviewWithComments {
  const reviewId = randomUUID();
  insertReview.run(reviewId, repoSlug, prId, '', '', 'pending', 0, 0, 0, 0, 0, '{}');
  return getReviewById(reviewId)!;
}

export function completeReview(reviewId: string, data: {
  prTitle: string;
  prAuthor: string;
  filesReviewed: number;
  filesSkipped: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fileHashes: Record<string, string>;
  comments: { filePath: string; line: number; severity: string; body: string }[];
}): void {
  const updateAll = db.transaction(() => {
    updateReviewResults.run(
      'completed', data.prTitle, data.prAuthor,
      data.filesReviewed, data.filesSkipped,
      data.inputTokens, data.outputTokens, data.costUsd,
      JSON.stringify(data.fileHashes), reviewId
    );
    for (const c of data.comments) {
      insertComment.run(randomUUID(), reviewId, c.filePath, c.line, c.severity, c.body);
    }
  });
  updateAll();
}

export function failReview(reviewId: string): void {
  updateReviewStatus.run('failed', reviewId);
}

export function setReviewSummaryCommentId(reviewId: string, commentId: number): void {
  updateReviewSummaryCommentId.run(commentId, reviewId);
}

export function setCommentResolved(commentId: string, resolved: boolean): Comment | null {
  updateCommentResolved.run(resolved ? 1 : 0, commentId);
  return selectCommentById.get(commentId) as Comment | null;
}

export interface DashboardStats {
  totalReviews: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalComments: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  approvedCount: number;
  rejectedCount: number;
  postedCount: number;
  byRepo: { repo_slug: string; total_reviews: number; total_input_tokens: number; total_output_tokens: number; total_cost_usd: number }[];
  recentReviews: (Review & { comment_count: number; critical_count: number })[];
}

export function getDashboardStats(): DashboardStats {
  const reviewStats = selectStats.get() as {
    total_reviews: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
  };

  const commentStatsRow = selectCommentStats.get() as {
    total_comments: number;
    critical_count: number;
    warning_count: number;
    info_count: number;
    approved_count: number;
    rejected_count: number;
    posted_count: number;
  };

  const byRepo = selectStatsByRepo.all() as {
    repo_slug: string;
    total_reviews: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
  }[];

  const recentReviews = selectRecentReviews.all(10) as (Review & {
    comment_count: number;
    critical_count: number;
  })[];

  return {
    totalReviews: reviewStats.total_reviews,
    totalInputTokens: reviewStats.total_input_tokens,
    totalOutputTokens: reviewStats.total_output_tokens,
    totalCostUsd: reviewStats.total_cost_usd,
    totalComments: commentStatsRow.total_comments,
    criticalCount: commentStatsRow.critical_count,
    warningCount: commentStatsRow.warning_count,
    infoCount: commentStatsRow.info_count,
    approvedCount: commentStatsRow.approved_count,
    rejectedCount: commentStatsRow.rejected_count,
    postedCount: commentStatsRow.posted_count,
    byRepo,
    recentReviews,
  };
}
