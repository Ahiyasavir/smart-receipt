import { useState } from 'react';

interface Props {
  onDone: () => void;
}

const STEPS = [
  {
    emoji: '📷',
    title: 'Scan any receipt',
    body: 'Take a photo of any printed receipt — supermarket, restaurant, pharmacy. SmartReceipt reads it in seconds using AI.',
    accent: 'bg-blue-600',
    light: 'bg-blue-50',
  },
  {
    emoji: '📊',
    title: 'Track your spending',
    body: 'See exactly where your money goes — by category, store, and day. Set budgets and get alerts before you overspend.',
    accent: 'bg-emerald-600',
    light: 'bg-emerald-50',
  },
  {
    emoji: '💰',
    title: 'Save money',
    body: 'Track return deadlines, catch recurring charges, and get weekly spending summaries. Your receipts work for you.',
    accent: 'bg-purple-600',
    light: 'bg-purple-50',
  },
];

export default function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-6">
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-10">
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
            i === step ? 'w-6 bg-blue-600' : 'w-1.5 bg-gray-200 dark:bg-gray-700'
          }`} />
        ))}
      </div>

      {/* Illustration */}
      <div className={`w-28 h-28 rounded-3xl ${current.light} flex items-center justify-center text-6xl mb-8 shadow-sm`}>
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
          className={`w-full ${current.accent} text-white py-3.5 rounded-2xl font-semibold text-base shadow-sm hover:opacity-90 active:scale-[0.98] transition-all`}
        >
          {isLast ? 'Get Started 🚀' : 'Next →'}
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
