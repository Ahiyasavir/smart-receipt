import { cn } from '../../lib/cn';

type Variant = 'default' | 'category' | 'source' | 'status' | 'warning';

interface Props {
  children: React.ReactNode;
  variant?: Variant;
  color?: string;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-surface-muted text-ink-secondary',
  category: '',
  source: 'bg-brand-50 text-brand-700',
  status: 'bg-emerald-50 text-status-success',
  warning: 'bg-amber-50 text-status-warning',
};

export default function Badge({
  children,
  variant = 'default',
  color,
  className,
}: Props) {
  const style =
    variant === 'category' && color
      ? { backgroundColor: color + '22', color }
      : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
        variantStyles[variant],
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

