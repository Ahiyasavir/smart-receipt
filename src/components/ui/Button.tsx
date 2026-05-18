import { ReactNode, ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary:
    'bg-surface-card text-ink-secondary border border-[var(--color-border)] hover:bg-surface-muted',
  ghost: 'text-brand-600 hover:bg-brand-50',
  danger:
    'bg-surface-card text-status-error border border-red-200 hover:bg-red-50',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-2 text-sm rounded-xl',
  md: 'px-4 py-3 text-sm rounded-xl',
  lg: 'px-5 py-3.5 text-base rounded-2xl',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  disabled,
  ...props
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'font-semibold pressable transition-colors',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

