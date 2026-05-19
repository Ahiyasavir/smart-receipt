import { useState } from 'react';
import { ClassifiedLine, LineClass } from '../utils/lineClassifier';

interface Props {
  lines: ClassifiedLine[];
}

const CLASS_STYLES: Record<LineClass, string> = {
  item:       'bg-green-100 text-green-800',
  total:      'bg-[var(--brand-100)] text-[var(--brand-800)]',
  tax:        'bg-yellow-100 text-yellow-800',
  payment:    'bg-purple-100 text-purple-800',
  discount:   'bg-orange-100 text-orange-800',
  name_only:  'bg-teal-100 text-teal-800',
  price_only: 'bg-red-100 text-red-800',
  noise:      'bg-gray-100 text-gray-500',
};

export default function ParserDebugPanel({ lines }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const nonEmpty = lines.filter((l) => l.trimmed.length > 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-700 text-sm">Parser Debug</span>
        <span className="text-gray-400 text-xs">
          {expanded ? '▲ collapse' : `▼ ${nonEmpty.length} lines classified`}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1">
          <p className="text-xs text-gray-400 mb-2">
            Hover a row to see why it was classified that way. Green = item, red = price_only (name rejected), gray = noise/metadata.
          </p>
          <div className="space-y-0.5 font-mono text-xs">
            {nonEmpty.map((cl, idx) => (
              <div
                key={idx}
                className="relative"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div className={`flex items-baseline gap-2 rounded px-2 py-1 cursor-default ${CLASS_STYLES[cl.lineClass]}`}>
                  <span className="shrink-0 w-20 font-semibold opacity-70">{cl.lineClass}</span>
                  <span className="truncate flex-1 text-gray-700">{cl.trimmed}</span>
                  {cl.price !== null && (
                    <span className="shrink-0 text-right font-bold">${cl.price.toFixed(2)}</span>
                  )}
                </div>

                {hoveredIdx === idx && cl.debugReason && (
                  <div className="absolute left-0 right-0 z-10 mt-0.5 bg-gray-900 text-white text-xs rounded px-2 py-1.5 shadow-lg whitespace-normal">
                    {cl.debugReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
