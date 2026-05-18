import { cn } from '../../lib/cn';

interface Props {
  className?: string;
  lines?: number;
}

export default function Skeleton({ className, lines = 1 }: Props) {
  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn('skeleton-shimmer h-4', i === 0 ? 'w-3/4' : 'w-1/2', className)}
          />
        ))}
      </div>
    );
  }

  return <div className={cn('skeleton-shimmer h-4 w-full', className)} />;
}

