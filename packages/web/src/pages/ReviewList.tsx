import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Review, type Workspace, type RepoItem, type PRItem } from '../api';

export default function ReviewList() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Trigger modal state
  const [showTrigger, setShowTrigger] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [repoSlug, setRepoSlug] = useState('');
  const [prId, setPrId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [postSummary, setPostSummary] = useState(true);
  const [triggering, setTriggering] = useState(false);

  // Workspaces / Repos / PRs data
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [repoList, setRepoList] = useState<RepoItem[]>([]);
  const [prList, setPrList] = useState<PRItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listReviews(page);
      setReviews(data.reviews);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  // Load workspaces when modal opens
  useEffect(() => {
    if (!showTrigger) return;
    api.listWorkspaces().then(setWorkspaceList).catch(() => {});
  }, [showTrigger]);

  // Load repos when workspace changes
  useEffect(() => {
    if (!workspace) { setRepoList([]); setRepoSlug(''); return; }
    setLoadingRepos(true);
    setRepoSlug('');
    setPrList([]);
    setPrId('');
    api.listRepos(workspace)
      .then(setRepoList)
      .catch(() => setRepoList([]))
      .finally(() => setLoadingRepos(false));
  }, [workspace]);

  // Load PRs when repo changes
  useEffect(() => {
    if (!workspace || !repoSlug) { setPrList([]); return; }
    setLoadingPRs(true);
    setPrId('');
    api.listPRs(workspace, repoSlug)
      .then(setPrList)
      .catch(() => setPrList([]))
      .finally(() => setLoadingPRs(false));
  }, [workspace, repoSlug]);

  const handleTrigger = async () => {
    if (!workspace || !repoSlug || !prId) return;
    setTriggering(true);
    try {
      const review = await api.triggerReview(workspace, repoSlug, Number(prId), instructions || undefined, postSummary);
      navigate(`/reviews/${review.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger review');
      setTriggering(false);
    }
  };

  const statusConfig: Record<string, { bg: string; dot: string; text: string }> = {
    pending: { bg: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-400', text: 'Reviewing…' },
    completed: { bg: 'bg-green-50 text-green-700 ring-green-200', dot: 'bg-green-400', text: 'Completed' },
    partial: { bg: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-400', text: 'Partial' },
    failed: { bg: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', text: 'Failed' },
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reviews</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total review{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowTrigger(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Review
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Trigger Modal */}
      {showTrigger && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !triggering && setShowTrigger(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">New Review</h2>
                <p className="text-xs text-slate-500">Trigger an AI code review on a pull request</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Workspace</label>
                <select
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors bg-white"
                >
                  <option value="">Select a workspace…</option>
                  {workspaceList.map((w) => (
                    <option key={w.slug} value={w.slug}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Repository</label>
                <select
                  value={repoSlug}
                  onChange={(e) => setRepoSlug(e.target.value)}
                  disabled={!workspace || loadingRepos}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {loadingRepos ? 'Loading repos…' : !workspace ? 'Select a workspace first' : repoList.length === 0 ? 'No repos found' : 'Select a repository…'}
                  </option>
                  {repoList.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pull Request</label>
                <select
                  value={prId}
                  onChange={(e) => setPrId(e.target.value)}
                  disabled={!workspace || !repoSlug || loadingPRs}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {loadingPRs ? 'Loading PRs…' : !repoSlug ? 'Select a repo first' : prList.length === 0 ? 'No open PRs' : 'Select a pull request…'}
                  </option>
                  {prList.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      #{pr.id} — {pr.title} ({pr.source_branch} → {pr.dest_branch})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Custom Instructions <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Focus on security and error handling..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors resize-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={postSummary}
                  onChange={(e) => setPostSummary(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">Post summary comment to PR</span>
              </label>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowTrigger(false)}
                disabled={triggering}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTrigger}
                disabled={triggering || !workspace || !repoSlug || !prId}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {triggering && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {triggering ? 'Reviewing...' : 'Start Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 font-medium">No reviews yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "New Review" to get started</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pull Request</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Repository</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Author</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Files</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {reviews.map((r) => {
                  const cfg = statusConfig[r.status];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/reviews/${r.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-slate-400 font-mono text-xs">#{r.pr_id}</span>
                        <span className="ml-2 font-medium text-slate-900">{r.pr_title || 'Untitled'}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{r.repo_slug}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{r.pr_author}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cfg?.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot}`} />
                          {cfg?.text}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-500 font-mono text-xs">{r.files_reviewed}</td>
                      <td className="px-5 py-3.5 text-right text-slate-500 font-mono text-xs">${r.cost_usd.toFixed(3)}</td>
                      <td className="px-5 py-3.5 text-right text-slate-400 text-xs">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
