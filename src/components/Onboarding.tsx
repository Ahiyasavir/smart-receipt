import { useState } from 'react';

interface Props {
  onDone: () => void;
}

const STEPS = [
  {
    emoji: '✉️',
    title: 'Tracking, on autopilot',
    body: 'Connect your email and Spendora records every purchase automatically — no scanning, no manual entry, no spreadsheets.',
  },
  {
    emoji: '📊',
    title: 'Understand where it goes',
    body: 'Clear breakdowns by category, merchant, and time — so you can see your money with confidence.',
  },
  {
    emoji: '🎯',
    title: 'Stay in control',
    body: 'Budgets, recurring-charge detection, and timely nudges keep you organized and ahead.',
  },
];

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center"
      style={{ background: 'var(--surface-card)', padding: '64px 24px 24px' }}
    >
      <img src="/spendora-logo.png" alt="Spendora"
        style={{ height: 24, width: 'auto', marginBottom: 40 }} />

      {/* Progress — animated pill dots */}
      <div className="flex" style={{ gap: 6, marginBottom: 36 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            height: 6, borderRadius: 999,
            width: i === step ? 24 : 6,
            background: i === step ? 'var(--brand-600)' : 'var(--surface-sunken)',
            transition: 'all 300ms var(--ease-out-soft)',
          }} />
        ))}
      </div>

      {/* Illustration tile */}
      <div style={{
        width: 112, height: 112, borderRadius: 28,
        background: 'var(--brand-50)',
        display: 'grid', placeItems: 'center', fontSize: 56, marginBottom: 32,
      }}>{current.emoji}</div>

      <h1 className="s-h1 text-center" style={{ margin: '0 0 12px' }}>{current.title}</h1>
      <p
        className="s-body text-center"
        style={{ margin: 0, maxWidth: 300, color: 'var(--ink-muted)' }}
      >{current.body}</p>

      <div style={{ flex: 1 }} />

      <div className="w-full" style={{ maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
          className="s-button s-pressable w-full"
          style={{
            background: 'var(--brand-600)', color: 'var(--ink-on-brand)',
            borderRadius: 'var(--radius-lg)', padding: '14px 0',
            fontSize: 15, boxShadow: 'var(--shadow-card)',
          }}
        >
          {isLast ? 'Get started' : 'Continue'}
        </button>
        {!isLast && (
          <button
            onClick={onDone}
            className="w-full"
            style={{
              background: 'transparent', border: 'none', padding: 10, cursor: 'pointer',
              font: '500 13px var(--font-sans)', color: 'var(--ink-subtle)',
            }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
