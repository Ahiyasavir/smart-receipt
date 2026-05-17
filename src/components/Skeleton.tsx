/**
 * Skeleton — reusable shimmer placeholders for async states.
 * Deterministic, dependency-free. `.skeleton` styles live in index.css and
 * respect prefers-reduced-motion.
 */

interface SkeletonProps {
  className?: string;
}

/** A single shimmering block. Size via className (h-/w-/rounded-). */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton rounded ${className}`} aria-hidden="true" />;
}

/** One transaction/receipt card placeholder — matches the real card layout. */
export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex gap-1.5 pt-0.5">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-7 w-14 shrink-0" />
      </div>
    </div>
  );
}

/** A list of card placeholders. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Compact stat-tile placeholder (dashboard summary). */
export function SkeletonStat() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-2">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-6 w-2/3" />
    </div>
  );
}
