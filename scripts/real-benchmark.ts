#!/usr/bin/env node
/**
 * Real-image receipt pipeline benchmark.
 * Evaluates the full text-parsing pipeline against ground-truth labeled receipts.
 *
 * Run:         npm run real-benchmark
 * Fresh OCR:   npm run real-benchmark -- --fresh   (re-runs Tesseract, ignores cache)
 * Verbose:     npm run real-benchmark -- --verbose  (show OCR text per receipt)
 *
 * OCR is cached in eval/ocr-cache/ so re-runs measure the parser only.
 * Use --fresh when the OCR pipeline changes (new PSM mode, preprocessing, etc.)
 *
 * Image lookup order (for each entry in ground-truth.json):
 *   1. DATASET_DIR  — C:\Users\savir\OneDrive\Personal\Creative_Projects\receipt dataset
 *   2. eval/images  — legacy location for receipts 001-007
 * .jfif extension is tried automatically when .jpg is not found.
 */

if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  (globalThis as any).crypto = webcrypto;
}

import { createWorker } from 'tesseract.js';
import { parseReceiptText, ParseResult } from '../src/utils/receiptParser.js';
import { classifyFailureMode, ScanDiagnostic } from '../src/utils/scanDiagnostics.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL_DIR    = join(ROOT, 'eval');
const IMAGES_DIR  = join(EVAL_DIR, 'images');                         // legacy 001-007
const DATASET_DIR = 'C:\\Users\\savir\\OneDrive\\Personal\\Creative_Projects\\receipt dataset';
const CACHE_DIR   = join(EVAL_DIR, 'ocr-cache');
const GT_FILE     = join(EVAL_DIR, 'ground-truth.json');
const RESULTS_FILE = join(ROOT, 'real-benchmark-results.json');
const REPORT_FILE  = join(ROOT, 'real-benchmark-report.txt');

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const FRESH   = process.argv.includes('--fresh');
const VERBOSE = process.argv.includes('--verbose');

// ─── Types ────────────────────────────────────────────────────────────────────

interface GTItem    { name: string; price: number; }
interface GTReceipt {
  id: string;
  image: string;
  merchant: string | null;
  total: number;        // 0 = unverifiable (folded/cut receipt)
  itemsCount: number;   // 0 = unknown
  items: GTItem[];
  notes: string;
}

interface ItemMatch {
  gtItem: GTItem;
  detected: { name: string; price: number } | null;
  nameSim: number;
  priceMatch: boolean;
  matched: boolean;
}

interface ReceiptScore {
  id: string;
  ocrChars: number;
  ocrPriceLines: number;
  ocrStrength: number;
  itemRecall: number;
  itemPrecision: number;
  itemF1: number;
  noiseItems: number;
  totalDeltaPct: number;
  merchantCorrect: boolean | null;
  isIncomplete: boolean;
  mismatch: boolean;
  suspiciousCount: number;
  detectedTotal: number;
  detectedItemCount: number;
  discountLineCount: number;
  discountSum: number;
  orphanedNameLines: number;
  completenessRatio: number;
  diagnosticMode: string;
  matches: ItemMatch[];
  verdict: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  overallScore: number;
  unverifiable: boolean;   // true when total=0 in GT (folded/cut)
  gtItemsUnknown: boolean; // true when items=[] but itemsCount>0
}

// ─── Image path resolution ────────────────────────────────────────────────────
// Try the OneDrive dataset dir first (full 12-image set), fall back to eval/images.
// Also handles .jfif vs .jpg extension mismatch.

function resolveImagePath(filename: string): string {
  const candidates: string[] = [];
  for (const dir of [DATASET_DIR, IMAGES_DIR]) {
    candidates.push(join(dir, filename));
    // try .jfif instead of .jpg / .jpeg
    candidates.push(join(dir, filename.replace(/\.jpe?g$/i, '.jfif')));
    // try .jpg instead of .jfif
    candidates.push(join(dir, filename.replace(/\.jfif$/i, '.jpg')));
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return join(DATASET_DIR, filename); // will fail with a clear missing-file error
}

// ─── Ground truth ─────────────────────────────────────────────────────────────

const groundTruth: GTReceipt[] = JSON.parse(readFileSync(GT_FILE, 'utf-8'));

// ─── OCR (with caching) ───────────────────────────────────────────────────────

function ocrStrength(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const lines = trimmed.split('\n').filter(l => l.trim().length > 2);
  if (!lines.length) return 0;
  const priceLines  = lines.filter(l => /\d+\.\d{2}/.test(l));
  const letterLines = lines.filter(l => /[a-zA-Z]{3,}/.test(l));
  const charScore   = Math.min(1, trimmed.length / 400);
  const priceScore  = Math.min(1, priceLines.length / 6);
  const letterRatio = letterLines.length / lines.length;
  const hasTotal    = lines.some(l => /\b(total|subtotal)\b/i.test(l));
  return Math.min(1, charScore * 0.22 + priceScore * 0.52 + letterRatio * 0.16 + (hasTotal ? 0.10 : 0));
}

async function ocrImage(imagePath: string, cacheId: string): Promise<string> {
  const cacheFile = join(CACHE_DIR, `${cacheId}.txt`);

  if (!FRESH && existsSync(cacheFile)) {
    if (VERBOSE) console.log(`  [cached] ${cacheId}`);
    return readFileSync(cacheFile, 'utf-8');
  }

  console.log(`  [ocr] ${cacheId} ...`);
  const worker = await createWorker('eng', 1);

  await (worker as any).setParameters({ tessedit_pageseg_mode: '6' });
  const r1 = await worker.recognize(imagePath);
  const s1 = ocrStrength(r1.data.text);
  let best = r1.data.text;
  let bestStrength = s1;

  if (s1 < 0.45) {
    await (worker as any).setParameters({ tessedit_pageseg_mode: '4' });
    const r2 = await worker.recognize(imagePath);
    const s2 = ocrStrength(r2.data.text);
    if (s2 > bestStrength) { best = r2.data.text; bestStrength = s2; }
  }

  if (bestStrength < 0.45) {
    await (worker as any).setParameters({ tessedit_pageseg_mode: '3' });
    const r3 = await worker.recognize(imagePath);
    const s3 = ocrStrength(r3.data.text);
    if (s3 > bestStrength) { best = r3.data.text; bestStrength = s3; }
  }

  await worker.terminate();
  writeFileSync(cacheFile, best, 'utf-8');
  return best;
}

// ─── Item matching ────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'with', 'in']);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length >= 2 && !STOPWORDS.has(w)));
}

function nameSimilarity(a: string, b: string): number {
  const wa = wordSet(a); const wb = wordSet(b);
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

const PRICE_TOL = 0.05;
function priceClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.10, Math.abs(b) * PRICE_TOL);
}

function matchItems(detected: Array<{ name: string; price: number }>, gt: GTItem[]): ItemMatch[] {
  const gtPositive   = gt.filter(i => i.price >= 0);
  const usedDetected = new Set<number>();

  return gtPositive.map(gtItem => {
    let bestIdx = -1; let bestScore = -1;
    for (let i = 0; i < detected.length; i++) {
      if (usedDetected.has(i)) continue;
      const d  = detected[i];
      const ns = nameSimilarity(d.name, gtItem.name);
      const pm = priceClose(d.price, gtItem.price);
      const score = (pm ? 0.6 : 0) + ns * 0.4;
      if (score > bestScore && (pm || ns >= 0.25)) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      usedDetected.add(bestIdx);
      const d  = detected[bestIdx];
      const ns = nameSimilarity(d.name, gtItem.name);
      const pm = priceClose(d.price, gtItem.price);
      return { gtItem, detected: d, nameSim: ns, priceMatch: pm, matched: true };
    }
    return { gtItem, detected: null, nameSim: 0, priceMatch: false, matched: false };
  });
}

const NOISE_PATTERNS = [
  /\btotal\b/i, /\bsubtotal\b/i, /\btax\b/i, /\bcash\b/i,
  /\bchange\b/i, /\bvisa\b/i, /\bdebit\b/i, /\btendered\b/i,
  /\bpoints?\b/i, /\bsavings?\b/i, /\bcoupon\b/i,
];
function isFinancialNoise(name: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(name));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreReceipt(gt: GTReceipt, result: ParseResult, ocrText: string, diag: ScanDiagnostic): ReceiptScore {
  // Unverifiable = total unknown AND no GT items at all (e.g. completely blank/folded).
  // A receipt with total=0 but known GT items IS scoreable (item recall is meaningful
  // even though we cannot verify the total).
  const unverifiable   = gt.total === 0 && gt.items.length === 0;
  const gtItemsUnknown = gt.items.length === 0 && gt.itemsCount > 0;

  const detected    = result.items.map(i => ({ name: i.name, price: i.amount }));
  const gtPositive  = gt.items.filter(i => i.price >= 0);
  const matches     = matchItems(detected, gt.items);
  const matchedCount = matches.filter(m => m.matched).length;

  const noiseItems   = detected.filter(d =>
    d.price >= 0 && isFinancialNoise(d.name) &&
    !gtPositive.some(g => priceClose(g.price, d.price)),
  );
  const itemPrecision = detected.length > 0
    ? Math.max(0, detected.length - noiseItems.length) / detected.length
    : 1.0;
  const itemRecall = gtPositive.length > 0 ? matchedCount / gtPositive.length : 1.0;
  const itemF1     = (itemPrecision + itemRecall) > 0
    ? 2 * itemPrecision * itemRecall / (itemPrecision + itemRecall) : 0;

  const totalDeltaPct = gt.total > 0
    ? Math.abs(result.total - gt.total) / gt.total : 0;

  const merchantCorrect = gt.merchant !== null
    ? (result.merchant !== null &&
       normalize(result.merchant).includes(normalize(gt.merchant).split(' ')[0]))
    : null;

  const ocrLines      = ocrText.split('\n').filter(l => l.trim().length > 2);
  const ocrPriceLines = ocrLines.filter(l => /\d+\.\d{2}/.test(l)).length;
  const ocrStr        = ocrStrength(ocrText);

  let overallScore: number;
  let verdict: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

  if (unverifiable) {
    // Unverifiable receipts are not scored — show what OCR produced for diagnostics only
    overallScore = -1;
    verdict = 'SKIP';
  } else {
    const recallScore    = gtItemsUnknown ? 100 : Math.round(itemRecall * 100);
    const precisionScore = gtItemsUnknown ? 100 : Math.round(itemPrecision * 100);
    const totalScore     = gt.total > 0
      ? (totalDeltaPct < 0.02 ? 100 : totalDeltaPct < 0.10 ? 80 : totalDeltaPct < 0.25 ? 50 : 20)
      : 100;
    const merchantScore  = merchantCorrect === null ? 100 : (merchantCorrect ? 100 : 0);

    overallScore = Math.round(
      recallScore    * 0.40 +
      precisionScore * 0.20 +
      totalScore     * 0.25 +
      merchantScore  * 0.15,
    );
    verdict = overallScore >= 70 ? 'PASS' : overallScore >= 45 ? 'WARN' : 'FAIL';
  }

  return {
    id: gt.id,
    ocrChars: ocrText.trim().length,
    ocrPriceLines,
    ocrStrength: ocrStr,
    itemRecall,
    itemPrecision,
    itemF1,
    noiseItems: noiseItems.length,
    totalDeltaPct,
    merchantCorrect,
    isIncomplete: result.isIncomplete,
    mismatch: result.mismatch,
    suspiciousCount: result.suspiciousLines.length,
    detectedTotal: result.total,
    detectedItemCount: result.items.length,
    discountLineCount: result.discountLineCount,
    discountSum: result.discountSum,
    orphanedNameLines: diag.orphanedNameLines,
    completenessRatio: diag.completenessRatio,
    diagnosticMode: diag.mode,
    matches,
    verdict,
    overallScore,
    unverifiable,
    gtItemsUnknown,
  };
}

// ─── Display ──────────────────────────────────────────────────────────────────

const CLR = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m',
};

function verdictColor(v: string) {
  return v === 'PASS' ? CLR.green : v === 'WARN' ? CLR.yellow : v === 'SKIP' ? CLR.dim : CLR.red;
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function fmt(n: number) { return n.toFixed(2); }

function printScore(gt: GTReceipt, s: ReceiptScore) {
  const vc = verdictColor(s.verdict);
  const scoreLabel = s.verdict === 'SKIP' ? 'n/a' : `${s.overallScore}/100`;
  console.log(
    `\n${vc}${CLR.bold}[${s.verdict}]${CLR.reset} ` +
    `${CLR.bold}${s.id}${CLR.reset} ` +
    `(score ${CLR.cyan}${scoreLabel}${CLR.reset})`,
  );
  console.log(`  ${CLR.dim}${gt.notes}${CLR.reset}`);
  console.log(`  OCR: ${s.ocrChars} chars, ${s.ocrPriceLines} price-lines, strength ${fmt(s.ocrStrength)}`);

  if (s.unverifiable) {
    console.log(`  ${CLR.yellow}[SKIP] Unverifiable receipt — OCR output captured, no scoring.${CLR.reset}`);
    console.log(`  Detected: ${s.detectedItemCount} items, total $${fmt(s.detectedTotal)}`);
  } else {
    const itemsLabel = s.gtItemsUnknown
      ? `${s.detectedItemCount} detected (GT count only: ${gt.itemsCount})`
      : `${s.detectedItemCount} detected / ${gt.itemsCount} expected  recall=${pct(s.itemRecall)} precision=${pct(s.itemPrecision)} F1=${pct(s.itemF1)}`;
    console.log(`  Items: ${itemsLabel}`);
    console.log(
      `  Total: detected=$${fmt(s.detectedTotal)} / gt=$${fmt(gt.total)} ` +
      `(${pct(s.totalDeltaPct)} off)`,
    );
    console.log(
      `  Merchant: ${s.merchantCorrect === null ? '—' : s.merchantCorrect ? `${CLR.green}✓${CLR.reset}` : `${CLR.red}✗${CLR.reset}`} ` +
      `| noise: ${s.noiseItems} | suspicious: ${s.suspiciousCount} ` +
      `| incomplete: ${s.isIncomplete} | mismatch: ${s.mismatch}`,
    );
  }

  // Stage 9 diagnostics
  const diagParts: string[] = [`mode=${s.diagnosticMode}`];
  if (s.orphanedNameLines >= 2) diagParts.push(`${CLR.yellow}orphaned=${s.orphanedNameLines}${CLR.reset}`);
  if (s.discountLineCount > 0)  diagParts.push(`${CLR.cyan}discounts=${s.discountLineCount}($${fmt(s.discountSum)})${CLR.reset}`);
  diagParts.push(`completeness=${pct(s.completenessRatio)}`);
  console.log(`  Diag: ${diagParts.join(', ')}`);

  // Item-level match detail (only for receipts with full GT items)
  if (!s.gtItemsUnknown && !s.unverifiable && s.matches.length > 0) {
    for (const m of s.matches) {
      const mark = m.matched ? `${CLR.green}✓${CLR.reset}` : `${CLR.red}✗${CLR.reset}`;
      const d = m.detected;
      const detStr = d
        ? `→ "${d.name}" $${fmt(d.price)} (name=${pct(m.nameSim)} price=${m.priceMatch ? '✓' : '✗'})`
        : '→ not found';
      console.log(`    ${mark} $${fmt(m.gtItem.price)} "${m.gtItem.name}" ${CLR.dim}${detStr}${CLR.reset}`);
    }
  }
}

// ─── Discrepancy table ────────────────────────────────────────────────────────

function printDiscrepancyTable(scores: ReceiptScore[], gt: GTReceipt[]) {
  console.log(`\n${CLR.bold}═══ Stage 10 Discrepancy Table ═══${CLR.reset}`);
  console.log(
    CLR.dim +
    'ID           Verdict  Score  Items%  Total%  DiagMode      Diagnostics Triggered' +
    CLR.reset,
  );
  console.log('─'.repeat(90));

  for (const s of scores) {
    const g          = gt.find(g => g.id === s.id)!;
    const vc         = verdictColor(s.verdict);
    const scoreStr   = s.verdict === 'SKIP' ? '  n/a' : `${s.overallScore}`.padStart(5);
    const itemPct    = s.unverifiable ? '  n/a' : s.gtItemsUnknown
      ? `~${Math.round(s.detectedItemCount / g.itemsCount * 100)}%`.padStart(6)
      : pct(s.itemRecall).padStart(6);
    const totalPct   = s.unverifiable ? '  n/a' : `${Math.round((1 - s.totalDeltaPct) * 100)}%`.padStart(6);
    const modeStr    = s.diagnosticMode.padEnd(13);

    const diags: string[] = [];
    if (s.orphanedNameLines >= 2)  diags.push(`Crop/Glare(${s.orphanedNameLines})`);
    if (s.discountLineCount > 0)   diags.push(`Discount Adj($${fmt(s.discountSum)})`);
    if (s.mismatch)                diags.push('Mismatch');
    if (s.isIncomplete)            diags.push('Incomplete');
    if (s.unverifiable)            diags.push('Unverifiable');
    if (s.completenessRatio < 0.6) diags.push(`LowCoverage(${pct(s.completenessRatio)})`);

    console.log(
      `${s.id.padEnd(13)}` +
      `${vc}${s.verdict.padEnd(9)}${CLR.reset}` +
      `${scoreStr}  ` +
      `${itemPct}  ` +
      `${totalPct}  ` +
      `${modeStr}` +
      (diags.length ? diags.join(', ') : `${CLR.dim}none${CLR.reset}`),
    );
  }

  // Focused analysis: 002 (folded) and 010 (CZK)
  console.log(`\n${CLR.bold}── Focus: receipt_002 (folded/cut) ──${CLR.reset}`);
  const s002 = scores.find(s => s.id === 'receipt_002')!;
  if (s002) {
    console.log(`  OCR chars: ${s002.ocrChars} | price-lines: ${s002.ocrPriceLines} | OCR strength: ${fmt(s002.ocrStrength)}`);
    console.log(`  Diagnostic mode: ${s002.diagnosticMode} | Orphaned name lines: ${s002.orphanedNameLines}`);
    console.log(`  Detected items: ${s002.detectedItemCount} | Detected total: $${fmt(s002.detectedTotal)}`);
    if (s002.ocrChars === 0) {
      console.log(`  ${CLR.red}OCR produced no text — receipt image may be too blurry or blank.${CLR.reset}`);
    } else if (s002.orphanedNameLines >= 2) {
      console.log(`  ${CLR.yellow}Crop/glare diagnostic triggered: ${s002.orphanedNameLines} item lines have no price.${CLR.reset}`);
    }
  }

  console.log(`\n${CLR.bold}── Focus: receipt_010 (Tesco / CZK) ──${CLR.reset}`);
  const s010 = scores.find(s => s.id === 'receipt_010')!;
  if (s010) {
    const g010 = gt.find(g => g.id === 'receipt_010')!;
    console.log(`  OCR chars: ${s010.ocrChars} | price-lines: ${s010.ocrPriceLines} | OCR strength: ${fmt(s010.ocrStrength)}`);
    console.log(`  Detected total: ${fmt(s010.detectedTotal)} vs GT: ${fmt(g010.total)} (${pct(s010.totalDeltaPct)} off)`);
    console.log(`  Detected items: ${s010.detectedItemCount} vs GT count: ${g010.itemsCount}`);
    console.log(`  Diagnostic mode: ${s010.diagnosticMode}`);
    if (s010.totalDeltaPct > 0.25) {
      console.log(`  ${CLR.red}Total mismatch >25% — parser likely misread CZK amounts or currency symbol.${CLR.reset}`);
    } else {
      console.log(`  ${CLR.green}Total within acceptable range — CZK decimal format compatible.${CLR.reset}`);
    }
  }
}

// ─── Save / report ────────────────────────────────────────────────────────────

interface SavedRun {
  timestamp: string;
  scores: ReceiptScore[];
  overallScore: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  skipCount: number;
}

function loadPreviousRun(): SavedRun | null {
  if (!existsSync(RESULTS_FILE)) return null;
  try {
    const all: SavedRun[] = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
    return all[all.length - 1] ?? null;
  } catch { return null; }
}

function saveRun(run: SavedRun) {
  let history: SavedRun[] = [];
  if (existsSync(RESULTS_FILE)) {
    try { history = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8')); } catch { /* */ }
  }
  history.push(run);
  if (history.length > 20) history = history.slice(-20);
  writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));
}

function saveReport(scores: ReceiptScore[], gt: GTReceipt[], timestamp: string) {
  const lines: string[] = [
    `Real Receipt Benchmark Report — Stage 10`,
    `Generated: ${timestamp}`,
    ``,
    `ID           | Verdict | Score | Items% | Total% | Mode          | Diagnostics`,
    `─`.repeat(85),
  ];

  for (const s of scores) {
    const g       = gt.find(g => g.id === s.id)!;
    const score   = s.verdict === 'SKIP' ? '  n/a' : `${s.overallScore}`.padStart(5);
    const itemPct = s.unverifiable ? '  n/a' : s.gtItemsUnknown
      ? `~${Math.round(s.detectedItemCount / g.itemsCount * 100)}%`
      : pct(s.itemRecall);
    const totPct  = s.unverifiable ? '  n/a' : `${Math.round((1 - s.totalDeltaPct) * 100)}%`;
    const diags   = [];
    if (s.orphanedNameLines >= 2)  diags.push(`Crop/Glare(${s.orphanedNameLines})`);
    if (s.discountLineCount > 0)   diags.push(`Discount($${s.discountSum.toFixed(2)})`);
    if (s.mismatch)                diags.push('Mismatch');
    if (s.isIncomplete)            diags.push('Incomplete');
    if (s.unverifiable)            diags.push('Unverifiable');
    if (s.completenessRatio < 0.6) diags.push(`LowCov(${pct(s.completenessRatio)})`);
    lines.push(
      `${s.id.padEnd(13)}| ${s.verdict.padEnd(8)}| ${score} | ${itemPct.padStart(6)} | ${totPct.padStart(6)} | ${s.diagnosticMode.padEnd(14)}| ${diags.join(', ') || 'none'}`,
    );
  }

  lines.push(``);
  lines.push(`Notes:`);
  lines.push(`  SKIP = unverifiable receipt (folded/cut; no GT total)`);
  lines.push(`  Items% = item recall for receipts with full GT item list; ~N% = estimated for count-only GT`);
  lines.push(`  Total% = 100% - totalDeltaPct`);

  writeFileSync(REPORT_FILE, lines.join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log();
console.log(`${CLR.bold}═══ Real Receipt Benchmark — Stage 10 Sanity Gate ═══${CLR.reset}`);
if (FRESH) console.log(`${CLR.yellow}[--fresh] Re-running OCR (ignoring cache)${CLR.reset}`);
console.log(`${CLR.dim}Dataset: ${DATASET_DIR}${CLR.reset}`);
console.log(`${CLR.dim}${new Date().toISOString()}${CLR.reset}`);
console.log();

const previous   = loadPreviousRun();
const allScores: ReceiptScore[] = [];

for (const gt of groundTruth) {
  const imagePath = resolveImagePath(gt.image);
  const cacheId   = basename(gt.id); // e.g. "receipt_001"

  if (!existsSync(imagePath)) {
    console.log(`${CLR.red}[ERROR] Image not found: ${imagePath}${CLR.reset}`);
    continue;
  }

  const ocrText = await ocrImage(imagePath, cacheId);

  if (VERBOSE) {
    console.log(`\n--- OCR text for ${gt.id} ---`);
    console.log(ocrText);
    console.log(`--- end ---\n`);
  }

  const result = parseReceiptText(ocrText);
  const diag   = classifyFailureMode(ocrText, result);
  const score  = scoreReceipt(gt, result, ocrText, diag);
  allScores.push(score);
  printScore(gt, score);
}

// Discrepancy table
printDiscrepancyTable(allScores, groundTruth);

// Summary (exclude SKIP from scoring)
const scoreable    = allScores.filter(s => s.verdict !== 'SKIP');
const overallScore = scoreable.length > 0
  ? Math.round(scoreable.reduce((s, r) => s + r.overallScore, 0) / scoreable.length)
  : 0;
const passCount    = allScores.filter(r => r.verdict === 'PASS').length;
const warnCount    = allScores.filter(r => r.verdict === 'WARN').length;
const failCount    = allScores.filter(r => r.verdict === 'FAIL').length;
const skipCount    = allScores.filter(r => r.verdict === 'SKIP').length;

console.log(`\n${CLR.bold}─── Summary ───${CLR.reset}`);
console.log(
  `Overall: ${CLR.bold}${CLR.cyan}${overallScore}/100${CLR.reset}  ` +
  `${CLR.green}${passCount} PASS${CLR.reset}  ` +
  `${CLR.yellow}${warnCount} WARN${CLR.reset}  ` +
  `${CLR.red}${failCount} FAIL${CLR.reset}  ` +
  `${CLR.dim}${skipCount} SKIP${CLR.reset}`,
);

const avgRecall = scoreable.reduce((s, r) => s + r.itemRecall, 0) / (scoreable.length || 1);
const avgF1     = scoreable.reduce((s, r) => s + r.itemF1,     0) / (scoreable.length || 1);
const avgTotal  = scoreable.reduce((s, r) => s + r.totalDeltaPct,0) / (scoreable.length || 1);
console.log(`Avg item recall=${pct(avgRecall)} F1=${pct(avgF1)} | avg total delta=${pct(avgTotal)}`);

if (scoreable.length > 0) {
  const weakest = scoreable.reduce((a, b) => a.overallScore < b.overallScore ? a : b);
  console.log(`Weakest: ${CLR.red}${weakest.id}${CLR.reset} (score ${weakest.overallScore})`);
}

// Regression check
if (previous) {
  console.log(`\n${CLR.bold}── vs previous run (${previous.timestamp}) ──${CLR.reset}`);
  for (const cur of allScores) {
    const prev = previous.scores.find(r => r.id === cur.id);
    if (!prev || cur.verdict === 'SKIP') continue;
    const diff  = cur.overallScore - prev.overallScore;
    const arrow = diff > 0 ? `${CLR.green}▲+${diff}${CLR.reset}`
                : diff < 0 ? `${CLR.red}▼${diff}${CLR.reset}`
                :             `${CLR.dim}─${CLR.reset}`;
    console.log(`  ${cur.id.padEnd(14)} score ${arrow}  recall ${pct(cur.itemRecall).padStart(4)}`);
  }
}
console.log();

// Save
const timestamp = new Date().toISOString();
const run: SavedRun = { timestamp, scores: allScores, overallScore, passCount, warnCount, failCount, skipCount };
saveRun(run);
saveReport(allScores, groundTruth, timestamp);

console.log(`${CLR.dim}Results → ${RESULTS_FILE}${CLR.reset}`);
console.log(`${CLR.dim}Report  → ${REPORT_FILE}${CLR.reset}`);
console.log();
