import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ReviewList from './pages/ReviewList';
import ReviewDetail from './pages/ReviewDetail';
import Dashboard from './pages/Dashboard';
import { AuthProvider, useAuth } from './auth';

function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">PR Review</h1>
        <p className="text-sm text-slate-500 mb-6">AI-powered code reviews for Bitbucket</p>
        <a
          href="/auth/login"
          className="inline-flex items-center gap-2 w-full justify-center bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.65 3C2.3 3 2 3.3 2 3.65c0 .1 0 .15.05.25l2.75 16.6c.1.5.5.85 1 .85h12.6c.35 0 .65-.25.7-.6L21.95 3.9c.05-.35-.2-.65-.55-.7H2.65zm11.9 13.6H9.5L8.35 9.65h7.35l-1.15 6.95z" />
          </svg>
          Login with Bitbucket
        </a>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        {/* Top nav */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-semibold text-slate-900 text-lg">PR Review</span>
              </div>
              <div className="flex items-center gap-4">
                <nav className="flex items-center gap-1">
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`
                    }
                  >
                    Dashboard
                  </NavLink>
                  <NavLink
                    to="/reviews"
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`
                    }
                  >
                    Reviews
                  </NavLink>
                </nav>
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-7 h-7 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-sm text-slate-600 hidden sm:inline">{user.displayName}</span>
                  <button
                    onClick={logout}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-1"
                    title="Logout"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reviews" element={<ReviewList />} />
            <Route path="/reviews/:id" element={<ReviewDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App
