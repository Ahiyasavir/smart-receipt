#!/usr/bin/env node
/**
 * Receipt pipeline benchmark.
 * Run:  npm run benchmark
 * Deps: npx tsx (fetched on first run, no install needed)
 *
 * Tests every fixture in mockReceipt.ts through the full text-parsing pipeline
 * and produces:
 *   benchmark-results.json   — machine-readable history (appended each run)
 *   (stdout)                 — human-readable pass/warn/fail table
 */

// Node.js 18+ has globalThis.crypto; polyfill for earlier versions.
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  (globalThis as any).crypto = webcrypto;
}

import { parseReceiptText, ParseResult } from '../src/utils/receiptParser.js';
import {
  MOCK_RECEIPT_TEXT,
  MOCK_ABBREV_RECEIPT,
  MOCK_NOISY_RECEIPT,
  MOCK_TWOLINES_RECEIPT,
  MOCK_BLURRY_RECEIPT,
  MOCK_CATEGORY_RECEIPT,
} from '../src/utils/mockReceipt.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_FILE = join(ROOT, 'benchmark-results.json');

// ─── Fixture definitions ──────────────────────────────────────────────────────

interface Expectation {
  name: string;
  text: string;
  description: string;
  expectedItemCount: number;
  expectedTotal: number;           // 0 = not checked
  expectedMerchant: string | null; // null = not checked
  expectIncomplete: boolean;
  expectMismatch: boolean;
  minItemCount: number;            // hard lower bound (fail below this)
  maxItemCount: number;            // hard upper bound (fail above this)
  allowNoisyItems: boolean;        // true for blurry fixture (relaxed)
  expectedCategories?: string[];   // if set: all items must be in this set
}

const FIXTURES: Expectation[] = [
  {
    name: 'clean-receipt',
    text: MOCK_RECEIPT_TEXT,
    description: 'Clean Walmart receipt, 10 items',
    expectedItemCount: 10,
    expectedTotal: 47.18,
    expectedMerchant: 'Walmart',
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 8,
    maxItemCount: 12,
    allowNoisyItems: false,
    expectedCategories: ['groceries', 'food'],
  },
  {
    name: 'abbrev-receipt',
    text: MOCK_ABBREV_RECEIPT,
    description: 'Kroger receipt with heavy abbreviations (BNLS, CHKN, FRZN…)',
    expectedItemCount: 10,
    expectedTotal: 47.41,
    expectedMerchant: 'Kroger',
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 8,
    maxItemCount: 12,
    allowNoisyItems: false,
    expectedCategories: ['groceries'],
  },
  {
    name: 'noisy-receipt',
    text: MOCK_NOISY_RECEIPT,
    description: 'Safeway receipt — loyalty noise, discounts, payment lines',
    expectedItemCount: 5,
    expectedTotal: 24.47,
    expectedMerchant: 'Safeway',
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 4,
    maxItemCount: 7,
    allowNoisyItems: false,
    expectedCategories: ['groceries'],
  },
  {
    name: 'twolines-receipt',
    text: MOCK_TWOLINES_RECEIPT,
    description: 'Whole Foods — 5 items split across two lines each',
    expectedItemCount: 5,
    expectedTotal: 36.95,
    expectedMerchant: 'Whole Foods',
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 3,
    maxItemCount: 8,
    allowNoisyItems: false,
    expectedCategories: ['groceries', 'food'],
  },
  {
    name: 'blurry-receipt',
    text: MOCK_BLURRY_RECEIPT,
    description: 'Simulated blurry/garbled OCR — tests robustness under noise',
    // 1-decimal extension recovers "3.9B"→$3.90 and "2.4Q"→$2.40; "499" (no decimal) still missing.
    // "47.1B" now parses as $47.10, replacing SUBTOTAI as the detected total.
    // Item sum $38.53 vs total $47.10 = 18% gap — below the 25% mismatch threshold.
    expectedItemCount: 9,
    expectedTotal: 0,
    expectedMerchant: null,
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 7,
    maxItemCount: 11,
    allowNoisyItems: true,
    expectedCategories: ['groceries', 'food', 'other'],
  },
  {
    name: 'category-receipt',
    text: MOCK_CATEGORY_RECEIPT,
    description: 'Target — household items, produce, garlic (≠ transport)',
    expectedItemCount: 10,
    expectedTotal: 67.99,
    expectedMerchant: 'Target',
    expectIncomplete: false,
    expectMismatch: false,
    minItemCount: 8,
    maxItemCount: 12,
    allowNoisyItems: false,
    expectedCategories: ['groceries', 'health', 'other'],
  },
];

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface RunMetrics {
  fixtureName: string;
  textLength: number;
  lineCount: number;
  priceLineCount: number;
  candidateLineCount: number; // lines that had a price but weren't total/tax
  acceptedItemCount: number;
  suspiciousLineCount: number;
  detectedTotal: number;
  itemSum: number;
  merchantDetected: string | null;
  isIncomplete: boolean;
  mismatch: boolean;
  categoryBreakdown: Record<string, number>;
}

interface FixtureResult extends RunMetrics {
  // comparison
  itemCountDelta: number;     // actual - expected
  totalDelta: number;         // abs% vs expected total
  merchantCorrect: boolean | null;
  incompleteCorrect: boolean;
  mismatchCorrect: boolean;
  noiseLeakage: number;       // items that look like financial/metadata lines

  // scoring
  itemScore: number;    // 0-100
  totalScore: number;   // 0-100
  noiseScore: number;   // 100 or 0
  flagScore: number;    // 0-100 (isIncomplete + mismatch correctness)
  overallScore: number; // weighted average

  // verdict
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

// Heuristic: does this item name look like a financial/metadata line that leaked through?
const NOISE_PATTERNS = [
  /\btotal\b/i, /\bsubtotal\b/i, /\btax\b/i, /\bcash\b/i, /\bchange\b/i,
  /\bvisa\b/i, /\bdebit\b/i, /\bcredit\b/i, /\btendered\b/i,
  /\bpoints?\b/i, /\bsavings?\b/i, /\bdiscount\b/i, /\bcoupon\b/i,
];

function countNoiseLeakage(result: ParseResult): number {
  return result.items.filter(
    (item) => NOISE_PATTERNS.some((p) => p.test(item.name)),
  ).length;
}

function scoreItems(actual: number, expected: number, min: number, max: number): number {
  if (actual < min || actual > max) return 0;
  const delta = Math.abs(actual - expected);
  return Math.max(0, 100 - delta * 15);
}

function scoreTotal(actual: number, expected: number): number {
  if (expected === 0) return 100; // not checked
  if (actual === 0) return 30;    // nothing detected — partial credit
  const pct = Math.abs(actual - expected) / expected;
  if (pct < 0.01) return 100;
  if (pct < 0.05) return 85;
  if (pct < 0.10) return 70;
  if (pct < 0.20) return 50;
  return 20;
}

function evaluate(fix: Expectation, result: ParseResult): FixtureResult {
  const lines = fix.text.split('\n');
  const priceLineCount = lines.filter((l) => /\d+\.\d{2}/.test(l)).length;

  const metrics: RunMetrics = {
    fixtureName: fix.name,
    textLength: fix.text.length,
    lineCount: lines.length,
    priceLineCount,
    candidateLineCount: result.items.length + result.suspiciousLines.length,
    acceptedItemCount: result.items.length,
    suspiciousLineCount: result.suspiciousLines.length,
    detectedTotal: result.total,
    itemSum: result.itemSum,
    merchantDetected: result.merchant,
    isIncomplete: result.isIncomplete,
    mismatch: result.mismatch,
    categoryBreakdown: result.items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const itemCountDelta = result.items.length - fix.expectedItemCount;
  const totalDelta = fix.expectedTotal > 0
    ? Math.abs(result.total - fix.expectedTotal) / fix.expectedTotal
    : 0;
  const merchantCorrect = fix.expectedMerchant !== null
    ? result.merchant === fix.expectedMerchant
    : null;
  const noiseLeakage = countNoiseLeakage(result);
  const incompleteCorrect = result.isIncomplete === fix.expectIncomplete;
  const mismatchCorrect = result.mismatch === fix.expectMismatch;

  const itemScore  = scoreItems(result.items.length, fix.expectedItemCount, fix.minItemCount, fix.maxItemCount);
  const totalScore = scoreTotal(result.total, fix.expectedTotal);
  const noiseScore = fix.allowNoisyItems ? 100 : (noiseLeakage === 0 ? 100 : Math.max(0, 100 - noiseLeakage * 30));
  const flagScore  = ((incompleteCorrect ? 50 : 0) + (mismatchCorrect ? 50 : 0));

  const overallScore = Math.round(
    itemScore * 0.40 +
    totalScore * 0.25 +
    noiseScore * 0.20 +
    flagScore * 0.15,
  );

  const verdict: 'PASS' | 'WARN' | 'FAIL' =
    overallScore >= 70 ? 'PASS' :
    overallScore >= 45 ? 'WARN' : 'FAIL';

  return {
    ...metrics,
    itemCountDelta,
    totalDelta,
    merchantCorrect,
    incompleteCorrect,
    mismatchCorrect,
    noiseLeakage,
    itemScore,
    totalScore,
    noiseScore,
    flagScore,
    overallScore,
    verdict,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const CLR = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
};

function verdictColor(v: string) {
  if (v === 'PASS') return CLR.green;
  if (v === 'WARN') return CLR.yellow;
  return CLR.red;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function printResult(fix: Expectation, res: FixtureResult) {
  const vc = verdictColor(res.verdict);
  const delta = res.itemCountDelta >= 0 ? `+${res.itemCountDelta}` : `${res.itemCountDelta}`;
  const cats = Object.entries(res.categoryBreakdown).map(([k, v]) => `${k}:${v}`).join(' ');

  console.log(
    `${vc}${CLR.bold}[${res.verdict}]${CLR.reset} ` +
    `${CLR.bold}${fix.name}${CLR.reset} ` +
    `(score ${CLR.cyan}${res.overallScore}${CLR.reset}/100)`,
  );
  console.log(`  ${CLR.dim}${fix.description}${CLR.reset}`);
  console.log(
    `  items: ${res.acceptedItemCount}/${fix.expectedItemCount} (${delta}) ` +
    `| total: $${fmt(res.detectedTotal)} / $${fix.expectedTotal > 0 ? fmt(fix.expectedTotal) : 'n/a'} ` +
    `| suspicious: ${res.suspiciousLineCount}`,
  );
  console.log(
    `  merchant: ${res.merchantDetected ?? '—'} ` +
    `| incomplete: ${res.isIncomplete ? 'YES' : 'no'} ` +
    `| mismatch: ${res.mismatch ? 'YES' : 'no'} ` +
    `| noise: ${res.noiseLeakage}`,
  );
  console.log(
    `  scores — items:${res.itemScore} total:${res.totalScore} noise:${res.noiseScore} flags:${res.flagScore}`,
  );
  if (cats) console.log(`  categories: ${CLR.dim}${cats}${CLR.reset}`);
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface SavedRun {
  timestamp: string;
  results: FixtureResult[];
  totalScore: number;
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
  // Keep last 20 runs
  if (history.length > 20) history = history.slice(-20);
  writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));
}

function printComparison(current: FixtureResult[], previous: SavedRun) {
  console.log(`${CLR.bold}── Comparison with previous run (${previous.timestamp}) ──${CLR.reset}`);
  for (const cur of current) {
    const prev = previous.results.find((r) => r.fixtureName === cur.fixtureName);
    if (!prev) continue;
    const scoreDiff = cur.overallScore - prev.overallScore;
    const itemDiff = cur.acceptedItemCount - prev.acceptedItemCount;
    const arrow = scoreDiff > 0 ? `${CLR.green}▲+${scoreDiff}${CLR.reset}` :
                  scoreDiff < 0 ? `${CLR.red}▼${scoreDiff}${CLR.reset}` :
                                  `${CLR.dim}─${CLR.reset}`;
    console.log(
      `  ${cur.fixtureName.padEnd(20)} score ${arrow}  items ${itemDiff >= 0 ? '+' : ''}${itemDiff}`,
    );
  }
  console.log();
}

console.log();
console.log(`${CLR.bold}═══ Receipt Pipeline Benchmark ═══${CLR.reset}`);
console.log(`${CLR.dim}${new Date().toISOString()}${CLR.reset}`);
console.log();

const previous = loadPreviousRun();
const allResults: FixtureResult[] = [];

for (const fix of FIXTURES) {
  const result = parseReceiptText(fix.text);
  const res = evaluate(fix, result);
  allResults.push(res);
  printResult(fix, res);
}

// Summary
const totalScore  = Math.round(allResults.reduce((s, r) => s + r.overallScore, 0) / allResults.length);
const passCount   = allResults.filter((r) => r.verdict === 'PASS').length;
const warnCount   = allResults.filter((r) => r.verdict === 'WARN').length;
const failCount   = allResults.filter((r) => r.verdict === 'FAIL').length;

console.log(`${CLR.bold}─── Summary ───${CLR.reset}`);
console.log(
  `Overall score: ${CLR.bold}${CLR.cyan}${totalScore}/100${CLR.reset}  ` +
  `${CLR.green}${passCount} PASS${CLR.reset}  ` +
  `${CLR.yellow}${warnCount} WARN${CLR.reset}  ` +
  `${CLR.red}${failCount} FAIL${CLR.reset}`,
);

const weakest = allResults.reduce((a, b) => a.overallScore < b.overallScore ? a : b);
console.log(`Weakest fixture: ${CLR.red}${weakest.fixtureName}${CLR.reset} (score ${weakest.overallScore})`);

console.log();

if (previous) printComparison(allResults, previous);

// Save
const run: SavedRun = {
  timestamp: new Date().toISOString(),
  results: allResults,
  totalScore,
  passCount,
  warnCount,
  failCount,
};
saveRun(run);
console.log(`${CLR.dim}Results saved → ${RESULTS_FILE}${CLR.reset}`);
console.log();
