import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode,     setMode]     = useState<Mode>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [info,     setInfo]     = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === 'reset') {
      const { error: err } = await resetPassword(email);
      setLoading(false);
      if (err) setError(err.message);
      else     setInfo('Check your email for the reset link.');
      return;
    }

    const fn = mode === 'signup' ? signUp : signIn;
    const { error: err } = await fn(email, password);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else if (mode === 'signup') {
      setInfo('Account created! Check your email to confirm, then sign in.');
      setMode('signin');
    }
    // signIn success → useAuth listener updates session automatically
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/spendora-logo.png" alt="Spendora" className="h-10 w-auto mx-auto mb-3" />
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Automatically track, organize, and understand your spending
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          {/* Tab row */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'reset' ? (
            <form onSubmit={handle} className="space-y-3">
              <p className="text-sm text-gray-600">Enter your email and we'll send a reset link.</p>
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              {info  && <p className="text-xs text-emerald-600">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
              >
                ← Back to Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handle} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              {info  && <p className="text-xs text-emerald-600">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? (mode === 'signup' ? 'Creating…' : 'Signing in…') : (mode === 'signup' ? 'Create Account' : 'Sign In')}
              </button>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(null); setInfo(null); }}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
                >
                  Forgot password?
                </button>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Your data is encrypted and synced across all your devices.
        </p>
      </div>
    </div>
  );
}
