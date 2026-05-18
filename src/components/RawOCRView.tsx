import { useState } from 'react';

interface Props {
  rawText: string;
  onTextChange: (text: string) => void;
  startExpanded?: boolean; // true on low-quality scans so the user sees what was read
}

// Collapsible panel showing raw OCR output so users can correct mis-reads
export default function RawOCRView({ rawText, onTextChange, startExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(startExpanded);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-700 text-sm">Raw OCR Text</span>
        <span className="text-gray-400 text-xs">{expanded ? '▲ collapse' : '▼ view & edit'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1">
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
            rows={10}
            value={rawText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="OCR text will appear here…"
          />
          <p className="text-xs text-gray-400">
            Edit to fix OCR errors — items list will re-parse automatically.
          </p>
        </div>
      )}
    </div>
  );
}

