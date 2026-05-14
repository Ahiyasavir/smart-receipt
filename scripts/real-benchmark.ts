#!/usr/bin/env node
/**
 * Real-image receipt pipeline benchmark.
 * Evaluates the full text-parsing pipeline against 7 ground-truth labeled receipts.
 *
 * Run:         npm run real-benchmark
 * Fresh OCR:   npm run real-benchmark -- --fresh   (re-runs Tesseract, ignores cache)
 * Verbose:     npm run real-benchmark -- --verbose  (show OCR text per receipt)
 *
 * OCR is cached in eval/ocr-cache/ so re-runs measure the parser only.
 * Use --fresh when the OCR pipeline changes (new PSM mode, preprocessing, etc.)
 */

// Node.js 18+ crypto polyfill
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  (globalThis as any).crypto = webcrypto;
}

import { createWorker } from 'tesseract.js';
import { parseReceiptText, ParseResult } from '../src/utils/receiptParser.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVAL_DIR    = join(ROOT, 'eval');
const IMAGES_DIR  = join(EVAL_DIR, 'images');
const CACHE_DIR   = join(EVAL_DIR, 'ocr-cache');
const GT_FILE     = join(EVAL_DIR, 'ground-truth.json');
const RESULTS_FILE = join(ROOT, 'real-benchmark-results.json');
const REPORT_FILE  = join(ROOT, 'real-benchmark-report.txt');

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const FRESH   = process.argv.includes('--fresh');
const VERBOSE = process.argv.includes('--verbose');

// ─── Types ────────────────────────────────────────────────────────────────────

interface GTItem     { name: string; price: number; }
interface GTReceipt  {
  id: string;
  image: string;
  merchant: string | null;
  total: number;
  itemsCount: number;
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
  itemRecall: number;          // matched / gt positive items
  itemPrecision: number;       // matched / detected items
  itemF1: number;
  noiseItems: number;          // detected items not in ground truth
  totalDeltaPct: number;       // |detected - gt| / gt  (0 = no gt check)
  merchantCorrect: boolean | null;
  isIncomplete: boolean;
  mismatch: boolean;
  suspiciousCount: number;
  detectedTotal: number;
  detectedItemCount: number;
  matches: ItemMatch[];
  verdict: 'PASS' | 'WARN' | 'FAIL';
  overallScore: number;        // 0-100
}

// ─── Ground truth ─────────────────────────────────────────────────────────────

const groundTruth: GTReceipt[] = JSON.parse(readFileSync(GT_FILE, 'utf-8'));

// ─── OCR (with caching) ───────────────────────────────────────────────────────

// Mirrors ocrResultStrength() from ocr.ts so we can score cached text
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

async function ocrImage(imagePath: string): Promise<string> {
  const id        = basename(imagePath, extname(imagePath));
  const cacheFile = join(CACHE_DIR, `${id}.txt`);

  if (!FRESH && existsSync(cacheFile)) {
    if (VERBOSE) console.log(`  [cached] ${id}`);
    return readFileSync(cacheFile, 'utf-8');
  }

  console.log(`  [ocr] ${id} ...`);
  const worker = await createWorker('eng', 1);

  // Try PSM 6 first (single uniform block — best for receipts)
  await (worker as any).setParameters({ tessedit_pageseg_mode: '6' });
  const r1 = await worker.recognize(imagePath);
  const s1 = ocrStrength(r1.data.text);

  let best = r1.data.text;
  let bestStrength = s1;

  // If weak, try PSM 4 (single column, variable sizes)
  if (s1 < 0.45) {
    await (worker as any).setParameters({ tessedit_pageseg_mode: '4' });
    const r2 = await worker.recognize(imagePath);
    const s2 = ocrStrength(r2.data.text);
    if (s2 > bestStrength) { best = r2.data.text; bestStrength = s2; }
  }

  // If still weak, try PSM 3 (fully automatic)
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
  const wa = wordSet(a);
  const wb = wordSet(b);
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

const PRICE_TOL = 0.05; // 5% tolerance, or at least $0.10

function priceClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.10, Math.abs(b) * PRICE_TOL);
}

// Match detected items against ground truth items (positive prices only).
// Each GT item matched at most once, each detected item used at most once.
function matchItems(
  detected: Array<{ name: string; price: number }>,
  gt: GTItem[],
): ItemMatch[] {
  const gtPositive = gt.filter(i => i.price >= 0);
  const usedDetected = new Set<number>();

  return gtPositive.map(gtItem => {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < detected.length; i++) {
      if (usedDetected.has(i)) continue;
      const d = detected[i];
      const ns = nameSimilarity(d.name, gtItem.name);
      const pm = priceClose(d.price, gtItem.price);
      // Score: price match weighted heavily since names can be OCR-garbled
      const score = (pm ? 0.6 : 0) + ns * 0.4;
      if (score > bestScore && (pm || ns >= 0.25)) {
        bestScore = score;
        bestIdx   = i;
      }
    }

    if (bestIdx >= 0) {
      usedDetected.add(bestIdx);
      const d = detected[bestIdx];
      const ns = nameSimilarity(d.name, gtItem.name);
      const pm = priceClose(d.price, gtItem.price);
      return { gtItem, detected: d, nameSim: ns, priceMatch: pm, matched: true };
    }

    return { gtItem, detected: null, nameSim: 0, priceMatch: false, matched: false };
  });
}

// Items in detected that have no GT match (noise / false positives)
function detectNoiseItems(
  detected: Array<{ name: string; price: number }>,
  matches: ItemMatch[],
): Array<{ name: string; price: number }> {
  const matchedPrices = new Set(
    matches.filter(m => m.detected).map(m => m.detected!.price),
  );
  return detected.filter(d => d.price >= 0 && !matchedPrices.has(d.price));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
  /\btotal\b/i, /\bsubtotal\b/i, /\btax\b/i, /\bcash\b/i,
  /\bchange\b/i, /\bvisa\b/i, /\bdebit\b/i, /\btendered\b/i,
  /\bpoints?\b/i, /\bsavings?\b/i, /\bcoupon\b/i,
];

function isFinancialNoise(name: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(name));
}

function scoreReceipt(gt: GTReceipt, result: ParseResult, ocrText: string): ReceiptScore {
  const detected = result.items.map(i => ({ name: i.name, price: i.amount }));
  const gtPositive = gt.items.filter(i => i.price >= 0);

  const matches      = matchItems(detected, gt.items);
  const matchedCount = matches.filter(m => m.matched).length;

  // Precision: of what we detected, how many are real?
  const noiseItems = detectNoiseItems(detected, matches)
    .filter(d => isFinancialNoise(d.name) || !gtPositive.some(g => priceClose(g.price, d.price)));
  const itemPrecision = detected.length > 0
    ? Math.max(0, detected.length - noiseItems.length) / detected.length
    : 1.0;

  const itemRecall = gtPositive.length > 0 ? matchedCount / gtPositive.length : 1.0;
  const itemF1 = (itemPrecision + itemRecall) > 0
    ? 2 * itemPrecision * itemRecall / (itemPrecision + itemRecall)
    : 0;

  const totalDeltaPct = gt.total > 0
    ? Math.abs(result.total - gt.total) / gt.total
    : 0;

  const merchantCorrect = gt.merchant !== null
    ? (result.merchant !== null &&
       normalize(result.merchant).includes(normalize(gt.merchant).split(' ')[0]))
    : null;

  const ocrLines = ocrText.split('\n').filter(l => l.trim().length > 2);
  const ocrPriceLines = ocrLines.filter(l => /\d+\.\d{2}/.test(l)).length;
  const ocrStr = ocrStrength(ocrText);

  // Scoring weights
  const recallScore    = Math.round(itemRecall * 100);
  const precisionScore = Math.round(itemPrecision * 100);
  const totalScore     = gt.total > 0
    ? (totalDeltaPct < 0.02 ? 100 : totalDeltaPct < 0.10 ? 80 : totalDeltaPct < 0.25 ? 50 : 20)
    : 100;
  const merchantScore  = merchantCorrect === null ? 100 : (merchantCorrect ? 100 : 0);

  const overallScore = Math.round(
    recallScore    * 0.40 +
    precisionScore * 0.20 +
    totalScore     * 0.25 +
    merchantScore  * 0.15,
  );

  const verdict: 'PASS' | 'WARN' | 'FAIL' =
    overallScore >= 70 ? 'PASS' : overallScore >= 45 ? 'WARN' : 'FAIL';

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
    matches,
    verdict,
    overallScore,
  };
}

// ─── Display ──────────────────────────────────────────────────────────────────

const CLR = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m',
};

function verdictColor(v: string) {
  return v === 'PASS' ? CLR.green : v === 'WARN' ? CLR.yellow : CLR.red;
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function fmt(n: number) { return n.toFixed(2); }

function printScore(gt: GTReceipt, s: ReceiptScore) {
  const vc = verdictColor(s.verdict);
  console.log(
    `\n${vc}${CLR.bold}[${s.verdict}]${CLR.reset} ` +
    `${CLR.bold}${s.id}${CLR.reset} ` +
    `(score ${CLR.cyan}${s.overallScore}${CLR.reset}/100)`,
  );
  console.log(`  ${CLR.dim}${gt.notes}${CLR.reset}`);
  console.log(
    `  OCR: ${s.ocrChars} chars, ${s.ocrPriceLines} price-lines, strength ${fmt(s.ocrStrength)}`,
  );
  console.log(
    `  Items: ${s.detectedItemCount} detected / ${gt.itemsCount} expected  ` +
    `recall=${pct(s.itemRecall)} precision=${pct(s.itemPrecision)} F1=${pct(s.itemF1)}`,
  );
  console.log(
    `  Total: detected=$${fmt(s.detectedTotal)} / gt=$${fmt(gt.total)} ` +
    `(${pct(s.totalDeltaPct)} off)`,
  );
  console.log(
    `  Merchant: ${s.merchantCorrect === null ? '—' : s.merchantCorrect ? `${CLR.green}✓${CLR.reset}` : `${CLR.red}✗${CLR.reset}`} ` +
    `| noise: ${s.noiseItems} | suspicious: ${s.suspiciousCount} ` +
    `| incomplete: ${s.isIncomplete}`,
  );

  // Show match detail
  for (const m of s.matches) {
    const mark = m.matched ? `${CLR.green}✓${CLR.reset}` : `${CLR.red}✗${CLR.reset}`;
    const d = m.detected;
    const detStr = d
      ? `→ "${d.name}" $${fmt(d.price)} (name=${pct(m.nameSim)} price=${m.priceMatch ? '✓' : '✗'})`
      : '→ not found';
    console.log(`    ${mark} $${fmt(m.gtItem.price)} "${m.gtItem.name}" ${CLR.dim}${detStr}${CLR.reset}`);
  }

  if (s.noiseItems > 0) {
    console.log(`  ${CLR.yellow}Noise items not in GT:${CLR.reset}`);
    // Print first few suspicious items from result
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface SavedRun {
  timestamp: string;
  scores: ReceiptScore[];
  overallScore: number;
  passCount: number;
  warnCount: number;
  failCount: number;
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
    `Real Receipt Benchmark Report`,
    `Generated: ${timestamp}`,
    ``,
  ];
  for (const s of scores) {
    const g = gt.find(g => g.id === s.id)!;
    lines.push(`${s.id} [${s.verdict}] score=${s.overallScore}/100`);
    lines.push(`  OCR: ${s.ocrChars} chars, strength=${s.ocrStrength.toFixed(3)}`);
    lines.push(`  Items: recall=${pct(s.itemRecall)} precision=${pct(s.itemPrecision)} F1=${pct(s.itemF1)}`);
    lines.push(`  Total: $${s.detectedTotal.toFixed(2)} / $${g.total.toFixed(2)} (${pct(s.totalDeltaPct)} off)`);
    lines.push(`  Merchant: ${s.merchantCorrect === null ? 'n/a' : s.merchantCorrect ? 'correct' : 'wrong'}`);
    lines.push(``);
  }
  writeFileSync(REPORT_FILE, lines.join('\n'));
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log();
console.log(`${CLR.bold}═══ Real Receipt Benchmark ═══${CLR.reset}`);
if (FRESH) console.log(`${CLR.yellow}[--fresh] Re-running OCR (ignoring cache)${CLR.reset}`);
console.log(`${CLR.dim}${new Date().toISOString()}${CLR.reset}`);
console.log();

const previous = loadPreviousRun();
const allScores: ReceiptScore[] = [];

for (const gt of groundTruth) {
  const imagePath = join(IMAGES_DIR, gt.image);
  const ocrText   = await ocrImage(imagePath);

  if (VERBOSE) {
    console.log(`\n--- OCR text for ${gt.id} ---`);
    console.log(ocrText);
    console.log(`--- end ---\n`);
  }

  const result = parseReceiptText(ocrText);
  const score  = scoreReceipt(gt, result, ocrText);
  allScores.push(score);
  printScore(gt, score);
}

// Summary
const overallScore = Math.round(allScores.reduce((s, r) => s + r.overallScore, 0) / allScores.length);
const passCount    = allScores.filter(r => r.verdict === 'PASS').length;
const warnCount    = allScores.filter(r => r.verdict === 'WARN').length;
const failCount    = allScores.filter(r => r.verdict === 'FAIL').length;

console.log(`\n${CLR.bold}─── Summary ───${CLR.reset}`);
console.log(
  `Overall: ${CLR.bold}${CLR.cyan}${overallScore}/100${CLR.reset}  ` +
  `${CLR.green}${passCount} PASS${CLR.reset}  ` +
  `${CLR.yellow}${warnCount} WARN${CLR.reset}  ` +
  `${CLR.red}${failCount} FAIL${CLR.reset}`,
);

// Per-category breakdown
const avgRecall    = allScores.reduce((s, r) => s + r.itemRecall, 0)    / allScores.length;
const avgPrecision = allScores.reduce((s, r) => s + r.itemPrecision, 0) / allScores.length;
const avgF1        = allScores.reduce((s, r) => s + r.itemF1, 0)        / allScores.length;
const avgTotal     = allScores.reduce((s, r) => s + r.totalDeltaPct, 0) / allScores.length;
console.log(
  `Avg item recall=${pct(avgRecall)} precision=${pct(avgPrecision)} ` +
  `F1=${pct(avgF1)} | avg total delta=${pct(avgTotal)}`,
);

const weakest = allScores.reduce((a, b) => a.overallScore < b.overallScore ? a : b);
console.log(`Weakest: ${CLR.red}${weakest.id}${CLR.reset} (score ${weakest.overallScore})`);

// Regression check
if (previous) {
  console.log(`\n${CLR.bold}── vs previous run (${previous.timestamp}) ──${CLR.reset}`);
  for (const cur of allScores) {
    const prev = previous.scores.find(r => r.id === cur.id);
    if (!prev) continue;
    const diff = cur.overallScore - prev.overallScore;
    const arrow = diff > 0 ? `${CLR.green}▲+${diff}${CLR.reset}`
                : diff < 0 ? `${CLR.red}▼${diff}${CLR.reset}`
                :             `${CLR.dim}─${CLR.reset}`;
    console.log(`  ${cur.id.padEnd(14)} score ${arrow}  ` +
      `recall ${pct(cur.itemRecall).padStart(4)} (prev ${pct(prev.itemRecall).padStart(4)})`);
  }
}
console.log();

// Save
const timestamp = new Date().toISOString();
const run: SavedRun = { timestamp, scores: allScores, overallScore, passCount, warnCount, failCount };
saveRun(run);
saveReport(allScores, groundTruth, timestamp);

console.log(`${CLR.dim}Results → ${RESULTS_FILE}${CLR.reset}`);
console.log(`${CLR.dim}Report  → ${REPORT_FILE}${CLR.reset}`);
console.log();
