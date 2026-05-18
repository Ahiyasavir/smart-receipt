import { ReactNode, useEffect } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Sheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={cn(
          'relative bg-surface-card rounded-t-3xl shadow-nav max-h-[85vh] overflow-hidden',
          'animate-slide-up',
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-muted" />
        </div>
        {title && (
          <div className="px-5 pb-3 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
        )}
        <div className="overflow-y-auto max-h-[calc(85vh-4rem)] px-5 py-4 pb-8 safe-area-inset-bottom">
          {children}
        </div>
      </div>
    </div>
  );
}

