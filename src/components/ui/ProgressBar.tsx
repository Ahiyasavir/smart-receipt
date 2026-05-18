import { cn } from '../../lib/cn';

interface Props {
  value: number;
  className?: string;
  color?: string;
}

export default function ProgressBar({ value, className, color }: Props) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('w-full bg-surface-muted rounded-full h-1.5 overflow-hidden', className)}>
      <div
        className="h-1.5 rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${pct}%`,
          backgroundColor: color ?? 'var(--color-brand)',
        }}
      />
    </div>
  );
}

