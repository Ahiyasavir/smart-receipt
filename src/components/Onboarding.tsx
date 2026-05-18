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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-6">
      {/* Brand */}
      <img
        src="/spendora-logo.png"
        alt="Spendora"
        className="h-7 w-auto mb-10 dark:brightness-0 dark:invert"
      />

      {/* Progress dots */}
      <div className="flex gap-1.5 mb-10">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
            i === step ? 'w-6 bg-teal-700' : 'w-1.5 bg-gray-200 dark:bg-gray-700'
          }`} />
        ))}
      </div>

      {/* Illustration */}
      <div className="w-28 h-28 rounded-3xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-6xl mb-8">
        {current.emoji}
      </div>

      {/* Copy */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
        {current.title}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-center text-base leading-relaxed max-w-xs">
        {current.body}
      </p>

      {/* Actions */}
      <div className="mt-10 w-full max-w-xs space-y-3">
        <button
          onClick={() => isLast ? onDone() : setStep((s) => s + 1)}
          className="w-full bg-teal-700 hover:bg-teal-800 text-white py-3.5 rounded-2xl font-semibold text-base shadow-sm active:scale-[0.98] transition-all"
        >
          {isLast ? 'Get started' : 'Continue'}
        </button>
        {!isLast && (
          <button onClick={onDone} className="w-full text-gray-400 text-sm py-1 hover:text-gray-600 transition-colors">
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
