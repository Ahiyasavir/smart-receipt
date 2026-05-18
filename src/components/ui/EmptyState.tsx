import { ReactNode } from 'react';
import Button from './Button';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4 text-brand-600">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="text-sm text-ink-muted mt-1.5 max-w-xs">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5" size="md">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

