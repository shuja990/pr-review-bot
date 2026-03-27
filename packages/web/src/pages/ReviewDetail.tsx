import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type ReviewWithComments, type Comment } from '../api';

const severityConfig: Record<string, { bg: string; dot: string; label: string }> = {
  critical: { bg: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', label: 'Critical' },
  warning: { bg: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', label: 'Warning' },
  info: { bg: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500', label: 'Info' },
};

const statusStyles: Record<string, string> = {
  pending: 'border-l-slate-300',
  approved: 'border-l-green-400 bg-green-50/40',
  rejected: 'border-l-red-300 bg-red-50/20 opacity-50',
};

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewWithComments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [collapseResolved, setCollapseResolved] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<Map<string, { fixed: boolean; explanation: string }>>(new Map());
  const [externalVerified, setExternalVerified] = useState<{ commentId: string; fixed: boolean; explanation: string; file_path: string; line: number; body: string }[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getReview(id);
      setReview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll while review is pending
  useEffect(() => {
    if (!review || review.status !== 'pending') return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.status, load]);

  const updateComment = async (commentId: string, data: { status?: string; body?: string }) => {
    if (!id) return;
    try {
      await api.updateComment(id, commentId, data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const toggleResolved = async (commentId: string, resolved: boolean) => {
    if (!id) return;
    try {
      await api.resolveComment(id, commentId, resolved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleApproveAll = async () => {
    if (!id) return;
    await api.approveAll(id);
    await load();
  };

  const handlePostAll = async () => {
    if (!id) return;
    setPosting(true);
    try {
      const result = await api.postComments(id);
      if (result.errors.length) {
        setError(`Posted ${result.posted}/${result.total}. Errors: ${result.errors.join('; ')}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    await updateComment(commentId, { body: editBody });
    setEditingId(null);
    setEditBody('');
  };

  const handleVerifyFixes = async () => {
    if (!id) return;
    setVerifying(true);
    setVerifyResults(new Map());
    setExternalVerified([]);
    try {
      const result = await api.verifyFixes(id);
      const map = new Map<string, { fixed: boolean; explanation: string }>();
      const external: typeof result.verified = [];
      for (const v of result.verified) {
        if (v.commentId.startsWith('bb-')) {
          external.push(v);
        } else {
          map.set(v.commentId, { fixed: v.fixed, explanation: v.explanation });
        }
      }
      setVerifyResults(map);
      setExternalVerified(external);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 font-medium">Review not found</p>
        <Link to="/reviews" className="text-indigo-600 hover:text-indigo-700 text-sm mt-2 inline-block">Back to Reviews</Link>
      </div>
    );
  }

  if (review.status === 'pending') {
    return (
      <div className="space-y-6">
        <Link to="/reviews" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Reviews
        </Link>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Review in progress…</h2>
          <p className="text-sm text-slate-500">AI is analyzing the pull request. This page will update automatically.</p>
        </div>
      </div>
    );
  }

  if (review.status === 'failed') {
    return (
      <div className="space-y-6">
        <Link to="/reviews" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Reviews
        </Link>
        <div className="flex flex-col items-center justify-center py-16">
          <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Review failed</h2>
          <p className="text-sm text-slate-500">Something went wrong during the AI review. Check server logs for details.</p>
        </div>
      </div>
    );
  }

  // Filter comments
  let filteredComments = review.comments;
  if (severityFilter !== 'all') {
    filteredComments = filteredComments.filter((c) => c.severity === severityFilter);
  }

  // Group by file
  const byFile = filteredComments.reduce<Record<string, Comment[]>>((acc, c) => {
    (acc[c.file_path] ??= []).push(c);
    return acc;
  }, {});

  const pendingCount = review.comments.filter((c) => c.status === 'pending').length;
  const approvedCount = review.comments.filter((c) => c.status === 'approved' && !c.bitbucket_comment_id).length;
  const postedCount = review.comments.filter((c) => c.bitbucket_comment_id).length;
  const resolvedCount = review.comments.filter((c) => c.is_resolved).length;

  const criticalCount = review.comments.filter((c) => c.severity === 'critical').length;
  const warningCount = review.comments.filter((c) => c.severity === 'warning').length;
  const infoCount = review.comments.filter((c) => c.severity === 'info').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/reviews" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Reviews
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <span className="text-slate-400 font-mono">#{review.pr_id}</span>{' '}
              {review.pr_title}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{review.repo_slug}</span>
              <span>by {review.pr_author}</span>
              <span>{review.files_reviewed} files reviewed</span>
              {review.files_skipped > 0 && <span className="text-slate-400">{review.files_skipped} skipped</span>}
              {review.cost_usd > 0 && <span className="font-mono text-xs text-slate-400">${review.cost_usd.toFixed(4)}</span>}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
          <span className="font-semibold text-slate-900">{review.comments.length}</span>
          <span className="text-slate-500">comments</span>
        </div>
        {criticalCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-semibold">{criticalCount}</span> critical
          </div>
        )}
        {warningCount > 0 && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="font-semibold">{warningCount}</span> warnings
          </div>
        )}
        {infoCount > 0 && (
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm text-blue-700">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-semibold">{infoCount}</span> info
          </div>
        )}
        {postedCount > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-sm text-green-700">
            <span className="font-semibold">{postedCount}</span> posted
          </div>
        )}
        {resolvedCount > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-500">
            <span className="font-semibold">{resolvedCount}</span> resolved
          </div>
        )}
      </div>

      {/* Actions + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={handleVerifyFixes}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 bg-violet-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {verifying ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
            {verifying ? 'Verifying…' : 'Verify Fixes'}
          </button>
          {pendingCount > 0 && (
            <button
              onClick={handleApproveAll}
              className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve All ({pendingCount})
            </button>
          )}
          {approvedCount > 0 && (
            <button
              onClick={handlePostAll}
              disabled={posting}
              className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {posting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
              )}
              {posting ? 'Posting...' : `Post to Bitbucket (${approvedCount})`}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {resolvedCount > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={collapseResolved}
                onChange={(e) => setCollapseResolved(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
              />
              Hide resolved
            </label>
          )}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(['all', 'critical', 'warning', 'info'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  severityFilter === f
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comments grouped by file */}
      {Object.keys(byFile).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
          <p className="text-slate-500 font-medium">No comments match the current filter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byFile).map(([filePath, comments]) => {
            const visibleComments = collapseResolved
              ? comments.filter((c) => !c.is_resolved)
              : comments;
            const hiddenCount = comments.length - visibleComments.length;

            return (
              <div key={filePath} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <code className="text-sm font-medium text-slate-700">{filePath}</code>
                  <span className="text-xs text-slate-400">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleComments.map((c) => {
                    const sev = severityConfig[c.severity];
                    const vr = verifyResults.get(c.id);
                    return (
                      <div key={c.id} className={`px-4 py-3 border-l-4 ${statusStyles[c.status]} transition-all`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${sev?.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev?.dot}`} />
                            {sev?.label}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">L{c.line}</span>

                          {c.bitbucket_comment_id && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Posted
                            </span>
                          )}

                          {c.is_resolved ? (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Resolved
                            </span>
                          ) : null}

                          {vr && (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${vr.fixed ? 'text-green-600' : 'text-orange-600'}`} title={vr.explanation}>
                              {vr.fixed ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                              )}
                              {vr.fixed ? 'Fixed' : 'Not fixed'}
                            </span>
                          )}

                          <div className="ml-auto flex items-center gap-1">
                            {/* Resolve / Unresolve */}
                            {c.bitbucket_comment_id && (
                              <button
                                onClick={() => toggleResolved(c.id, !c.is_resolved)}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                  c.is_resolved
                                    ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {c.is_resolved ? 'Unresolve' : 'Resolve'}
                              </button>
                            )}

                            {c.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => updateComment(c.id, { status: 'approved' })}
                                  className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => updateComment(c.id, { status: 'rejected' })}
                                  className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {c.status !== 'rejected' && !c.bitbucket_comment_id && (
                              <button
                                onClick={() => {
                                  setEditingId(c.id);
                                  setEditBody(c.body);
                                }}
                                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>

                        {editingId === c.id ? (
                          <div className="mt-2">
                            <textarea
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              rows={4}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-y"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleSaveEdit(c.id)}
                                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{c.body}</p>
                        )}

                        {vr && (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${vr.fixed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                            <span className="font-semibold">{vr.fixed ? '✓ Fixed:' : '✗ Not fixed:'}</span>{' '}
                            {vr.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {hiddenCount > 0 && (
                    <div className="px-4 py-2 text-xs text-slate-400 text-center">
                      {hiddenCount} resolved comment{hiddenCount !== 1 ? 's' : ''} hidden
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bitbucket PR comments verification results */}
      {externalVerified.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Bitbucket PR Comments</h3>
          {(() => {
            const byFile = externalVerified.reduce<Record<string, typeof externalVerified>>((acc, v) => {
              (acc[v.file_path] ??= []).push(v);
              return acc;
            }, {});
            return Object.entries(byFile).map(([filePath, items]) => (
              <div key={filePath} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <code className="text-sm font-medium text-slate-700">{filePath}</code>
                  <span className="text-xs text-slate-400">{items.length} comment{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((v) => (
                    <div key={v.commentId} className={`px-4 py-3 border-l-4 ${v.fixed ? 'border-l-green-400 bg-green-50/40' : 'border-l-orange-400 bg-orange-50/30'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-slate-50 text-slate-600 ring-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Bitbucket
                        </span>
                        <span className="text-xs text-slate-400 font-mono">L{v.line}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${v.fixed ? 'text-green-600' : 'text-orange-600'}`}>
                          {v.fixed ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          )}
                          {v.fixed ? 'Fixed' : 'Not fixed'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{v.body}</p>
                      <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${v.fixed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                        <span className="font-semibold">{v.fixed ? '✓ Fixed:' : '✗ Not fixed:'}</span>{' '}
                        {v.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
