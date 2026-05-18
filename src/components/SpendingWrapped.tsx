import { useRef, useEffect, useCallback } from 'react';
import { Receipt } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';

interface Props {
  receipts: Receipt[];
  onClose: () => void;
}

function buildStats(receipts: Receipt[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthly = receipts.filter((r) => new Date(r.date) >= monthStart);

  const total = monthly.reduce((s, r) => s + r.total, 0);

  // Top category
  const catMap: Record<string, number> = {};
  for (const r of monthly)
    for (const item of r.items)
      catMap[item.category] = (catMap[item.category] ?? 0) + item.amount;
  const topCatKey = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
  const topCat = CATEGORY_META[topCatKey as keyof typeof CATEGORY_META];
  const topCatPct = total > 0 ? Math.round((catMap[topCatKey] / total) * 100) : 0;

  // Most visited store
  const storeCounts: Record<string, number> = {};
  for (const r of monthly) storeCounts[r.storeName] = (storeCounts[r.storeName] ?? 0) + 1;
  const topStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0];

  // Receipt count
  const count = monthly.length;
  const monthName = now.toLocaleString('default', { month: 'long' });

  return { total, topCat, topCatPct, topStore, count, monthName, topCatKey };
}

export default function SpendingWrapped({ receipts, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = buildStats(receipts);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 600, H = 900;
    canvas.width  = W;
    canvas.height = H;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1e40af');
    grad.addColorStop(0.5, '#4f46e5');
    grad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(W * 0.15, H * 0.12, 200, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.88, 220, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const centeredText = (text: string, y: number, fontSize: number, weight: string, color = '#ffffff') => {
      ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, y);
    };

    // App name
    centeredText('Spendora', 80, 22, '600', 'rgba(255,255,255,0.6)');

    // Month title
    centeredText(`${stats.monthName} Recap`, 140, 36, '700');

    // Big total
    centeredText(`$${stats.total.toFixed(2)}`, 270, 88, '800');
    centeredText('total spent', 310, 20, '400', 'rgba(255,255,255,0.65)');

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 350); ctx.lineTo(W - 60, 350); ctx.stroke();

    // Stats grid
    const statBoxes = [
      { label: 'Receipts', value: String(stats.count), emoji: '🧾' },
      { label: 'Top Category', value: `${stats.topCat?.emoji} ${stats.topCatPct}%`, emoji: '' },
      { label: 'Fav Store', value: stats.topStore?.[0] ?? '—', emoji: '🏪' },
    ];

    statBoxes.forEach((box, i) => {
      const x = 60 + i * 165;
      const y = 380;

      // Box background
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect?: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect?.(x, y, 150, 120, 16) ?? ctx.rect(x, y, 150, 120);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.font = `600 28px -apple-system, sans-serif`;
      ctx.fillStyle = '#ffffff';
      const valX = x + 75;
      // Truncate long store names
      const val = box.value.length > 12 ? box.value.slice(0, 11) + '…' : box.value;
      ctx.fillText(val, valX, y + 52);

      ctx.font = `400 14px -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(box.label, valX, y + 76);
    });

    // Insight text
    centeredText(`${stats.topCat?.label ?? 'Other'} was your biggest`, 560, 22, '500', 'rgba(255,255,255,0.8)');
    centeredText('spending category this month', 588, 22, '500', 'rgba(255,255,255,0.8)');

    // CTA
    centeredText('Track yours with Spendora', 820, 18, '400', 'rgba(255,255,255,0.45)');
  }, [stats]);

  useEffect(() => { draw(); }, [draw]);

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'spending-wrapped.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${stats.monthName} spending recap` });
      } else {
        // Fallback: download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `spending-wrapped-${stats.monthName.toLowerCase()}.png`;
        a.click();
      }
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-end justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-h-[92vh] bg-white dark:bg-gray-900 rounded-t-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{stats.monthName} Spending Recap</h2>
            <p className="text-xs text-gray-400 mt-0.5">Share your spending wrapped</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Canvas preview */}
        <div className="flex-1 overflow-auto px-4 py-4 flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-2xl shadow-xl max-w-full"
            style={{ maxHeight: '55vh', width: 'auto' }}
          />
        </div>

        {/* Actions */}
        <div className="px-4 pb-6 pt-2 flex gap-3">
          <button onClick={handleShare}
            className="flex-1 bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-base hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm">
            📤 Share Card
          </button>
          <button onClick={onClose}
            className="border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 px-5 py-3.5 rounded-2xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
