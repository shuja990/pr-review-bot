const BASE = '/api';

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

export interface User {
  uuid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface Workspace {
  slug: string;
  name: string;
}

export interface RepoItem {
  slug: string;
  name: string;
}

export interface PRItem {
  id: number;
  title: string;
  author: string;
  source_branch: string;
  dest_branch: string;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function authRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface VerifyResult {
  verified: { commentId: string; fixed: boolean; explanation: string; file_path: string; line: number; body: string }[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  message?: string;
}

export const api = {
  // Auth
  getMe: () => authRequest<User>('/auth/me'),
  logout: () => fetch('/auth/logout', { method: 'POST', credentials: 'include' }),

  // Workspaces / Repos / PRs
  listWorkspaces: () => request<Workspace[]>('/reviews/workspaces'),
  listRepos: (workspace: string) =>
    request<RepoItem[]>(`/reviews/workspaces/${encodeURIComponent(workspace)}/repos`),
  listPRs: (workspace: string, repoSlug: string) =>
    request<PRItem[]>(`/reviews/workspaces/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/prs`),

  // Reviews
  listReviews: (page = 1) =>
    request<{ reviews: Review[]; total: number }>(`/reviews?page=${page}`),

  getReview: (id: string) =>
    request<ReviewWithComments>(`/reviews/${encodeURIComponent(id)}`),

  triggerReview: (workspace: string, repoSlug: string, prId: number, instructions?: string, postSummary?: boolean) =>
    request<ReviewWithComments>('/reviews', {
      method: 'POST',
      body: JSON.stringify({ workspace, repo_slug: repoSlug, pr_id: prId, instructions, post_summary: postSummary }),
    }),

  updateComment: (reviewId: string, commentId: string, data: { status?: string; body?: string }) =>
    request<Comment>(`/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  resolveComment: (reviewId: string, commentId: string, resolved: boolean) =>
    request<Comment>(`/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved }),
    }),

  approveAll: (reviewId: string) =>
    request<{ approved: number }>(`/reviews/${encodeURIComponent(reviewId)}/approve-all`, {
      method: 'POST',
    }),

  postComments: (reviewId: string, commentIds?: string[]) =>
    request<{ posted: number; total: number; errors: string[] }>(
      `/reviews/${encodeURIComponent(reviewId)}/comments/post`,
      {
        method: 'POST',
        body: JSON.stringify({ commentIds }),
      }
    ),

  getStats: () => request<DashboardStats>('/reviews/stats'),

  verifyFixes: (reviewId: string) =>
    request<VerifyResult>(`/reviews/${encodeURIComponent(reviewId)}/verify`, {
      method: 'POST',
    }),
};
