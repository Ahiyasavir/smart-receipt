import { formatMoney } from '../../lib/format';
import { cn } from '../../lib/cn';

interface Props {
  value: number;
  locale: string;
  currency: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  negative?: boolean;
}

const sizeStyles = {
  sm: 'text-sm font-semibold',
  md: 'text-lg font-bold',
  lg: 'text-2xl font-bold',
  hero: 'text-4xl font-bold tracking-tight',
};

export default function Amount({
  value,
  locale,
  currency,
  size = 'md',
  className,
  negative,
}: Props) {
  return (
    <span
      className={cn(
        'tabular-nums text-ink',
        sizeStyles[size],
        negative && 'text-status-error',
        className,
      )}
    >
      {formatMoney(value, locale, currency)}
    </span>
  );
}

