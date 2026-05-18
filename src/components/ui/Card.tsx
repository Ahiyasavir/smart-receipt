import { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export default function Card({ children, className, padding = 'md', onClick }: Props) {
  const base = cn(
    'bg-surface-card rounded-2xl shadow-card border border-[var(--color-border)]',
    paddingMap[padding],
    onClick && 'pressable w-full text-start hover:shadow-card-hover transition-shadow',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}

