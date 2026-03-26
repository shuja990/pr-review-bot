import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type DashboardStats } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getStats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const approvalRate = stats.totalComments > 0
    ? ((stats.approvedCount / stats.totalComments) * 100).toFixed(0)
    : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <button
          onClick={() => navigate('/reviews')}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Review
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Reviews" value={stats.totalReviews} />
        <StatCard label="Total Comments" value={stats.totalComments} />
        <StatCard label="Approval Rate" value={`${approvalRate}%`} />
        <StatCard label="Total Cost" value={`$${stats.totalCostUsd.toFixed(2)}`} />
      </div>

      {/* Severity breakdown + token usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Comment Breakdown</h3>
          <div className="space-y-3">
            <BarRow label="Critical" count={stats.criticalCount} total={stats.totalComments} color="bg-red-500" />
            <BarRow label="Warning" count={stats.warningCount} total={stats.totalComments} color="bg-amber-500" />
            <BarRow label="Info" count={stats.infoCount} total={stats.totalComments} color="bg-blue-500" />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-sm text-slate-500">
            <span><strong className="text-green-600">{stats.approvedCount}</strong> approved</span>
            <span><strong className="text-red-500">{stats.rejectedCount}</strong> rejected</span>
            <span><strong className="text-indigo-600">{stats.postedCount}</strong> posted</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Token Usage</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Input tokens</span>
              <span className="font-mono font-medium text-slate-900">{stats.totalInputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Output tokens</span>
              <span className="font-mono font-medium text-slate-900">{stats.totalOutputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm pt-3 border-t border-slate-100">
              <span className="text-slate-600 font-medium">Total cost</span>
              <span className="font-mono font-bold text-slate-900">${stats.totalCostUsd.toFixed(4)}</span>
            </div>
          </div>

          {stats.byRepo.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-slate-400 uppercase mt-5 mb-2">By Repository</h4>
              <div className="space-y-2">
                {stats.byRepo.map((r) => (
                  <div key={r.repo_slug} className="flex justify-between text-sm">
                    <span className="text-slate-600 font-mono text-xs">{r.repo_slug}</span>
                    <span className="text-slate-500">{r.total_reviews} reviews &middot; ${r.total_cost_usd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent reviews */}
      {stats.recentReviews.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recent Reviews</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentReviews.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/reviews/${r.id}`)}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-slate-400 font-mono shrink-0">#{r.pr_id}</span>
                  <span className="text-sm font-medium text-slate-900 truncate">{r.pr_title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{r.repo_slug}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.critical_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {r.critical_count}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{r.comment_count} comments</span>
                  <span className="text-xs text-slate-300">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{count}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
