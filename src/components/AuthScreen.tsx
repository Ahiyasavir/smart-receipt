import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

type Mode = 'signin' | 'signup' | 'reset';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  padding: '11px 14px',
  font: '400 14px var(--font-sans)',
  color: 'var(--ink)',
  background: 'var(--surface-card)',
  outline: 'none',
  boxSizing: 'border-box',
};

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
  };

  const brandBtn: React.CSSProperties = {
    width: '100%', background: 'var(--brand-600)', color: 'var(--ink-on-brand)',
    borderRadius: 'var(--radius-lg)', padding: '13px 0',
    font: '600 15px var(--font-sans)', boxShadow: 'var(--shadow-card)',
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'var(--surface-app)', padding: '0 24px' }}
    >
      <div className="w-full" style={{ maxWidth: 320 }}>
        <div className="text-center" style={{ marginBottom: 28 }}>
          <img src="/spendora-logo.png" alt="Spendora" style={{ height: 38, width: 'auto', display: 'inline-block' }} />
          <p className="s-body" style={{ margin: '12px 0 0', color: 'var(--ink-muted)' }}>
            Automatically track, organize, and understand your spending
          </p>
        </div>

        <div
          style={{
            background: 'var(--surface-card)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)',
            padding: 20, marginBottom: 12,
          }}
        >
          {mode !== 'reset' && (
            <div
              className="flex p-1 gap-1"
              style={{ background: 'var(--surface-muted)', borderRadius: 'var(--radius-pill)' }}
            >
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); setInfo(null); }}
                  className="s-button s-pressable flex-1 py-1.5"
                  style={{
                    borderRadius: 'var(--radius-pill)',
                    background: mode === m ? 'var(--surface-card)' : 'transparent',
                    color: mode === m ? 'var(--brand-600)' : 'var(--ink-muted)',
                    boxShadow: mode === m ? 'var(--shadow-card)' : 'none',
                  }}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handle} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'reset' && (
              <p className="s-body" style={{ margin: 0, color: 'var(--ink-secondary)' }}>
                Enter your email and we'll send a reset link.
              </p>
            )}
            <input
              type="email" required placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="s-focus" style={inputStyle}
            />
            {mode !== 'reset' && (
              <input
                type="password" required placeholder="Password" minLength={6}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="s-focus" style={inputStyle}
              />
            )}
            {error && <p style={{ font: '400 12px var(--font-sans)', color: 'var(--status-error)' }}>{error}</p>}
            {info  && <p style={{ font: '400 12px var(--font-sans)', color: 'var(--status-success)' }}>{info}</p>}
            <button type="submit" disabled={loading} className="s-pressable" style={{ ...brandBtn, opacity: loading ? 0.55 : 1 }}>
              {loading
                ? '…'
                : mode === 'reset'
                  ? 'Send reset link'
                  : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(null); setInfo(null); }}
                style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', font: '400 11px var(--font-sans)', color: 'var(--ink-subtle)' }}
              >
                Forgot password?
              </button>
            )}
            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
                style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', font: '400 11px var(--font-sans)', color: 'var(--ink-subtle)' }}
              >
                ‹ Back to sign in
              </button>
            )}
          </form>
        </div>

        <p
          className="text-center"
          style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--ink-subtle)', marginTop: 16 }}
        >
          🔒 Your data is encrypted and synced across all your devices.
        </p>
      </div>
    </div>
  );
}
