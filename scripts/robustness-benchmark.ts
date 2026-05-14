#!/usr/bin/env node
/**
 * Receipt pipeline robustness benchmark.
 *
 * Applies 6 text-level distortions that simulate image capture defects
 * (blur, glare, right-crop, low contrast, perspective, slight rotation)
 * to all 6 mock receipt fixtures and measures the parser's degradation.
 *
 * Run:  npm run robustness
 */

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
const RESULTS_FILE = join(ROOT, 'robustness-results.json');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface Fixture {
  name: string;
  text: string;
  expectedItemCount: number;
  expectedTotal: number;    // 0 = not checked
  minItems: number;
  maxItems: number;
}

const FIXTURES: Fixture[] = [
  { name: 'clean-receipt',    text: MOCK_RECEIPT_TEXT,    expectedItemCount: 10, expectedTotal: 47.18, minItems: 8,  maxItems: 12 },
  { name: 'abbrev-receipt',   text: MOCK_ABBREV_RECEIPT,  expectedItemCount: 10, expectedTotal: 47.41, minItems: 8,  maxItems: 12 },
  { name: 'noisy-receipt',    text: MOCK_NOISY_RECEIPT,   expectedItemCount: 5,  expectedTotal: 24.47, minItems: 3,  maxItems: 8  },
  { name: 'twolines-receipt', text: MOCK_TWOLINES_RECEIPT,expectedItemCount: 5,  expectedTotal: 36.95, minItems: 3,  maxItems: 8  },
  { name: 'blurry-receipt',   text: MOCK_BLURRY_RECEIPT,  expectedItemCount: 9,  expectedTotal: 0,     minItems: 7,  maxItems: 11 },
  { name: 'category-receipt', text: MOCK_CATEGORY_RECEIPT,expectedItemCount: 10, expectedTotal: 67.99, minItems: 8,  maxItems: 12 },
];

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// ─── Distortions ──────────────────────────────────────────────────────────────

type DistortFn = (text: string, seed: number) => string;

/**
 * Blur — out-of-focus capture.
 * Substitutes visually similar characters (0↔O, 1↔l, 5↔S, 8↔B, .→,/space).
 * Decimal points are dropped at a higher rate — blur makes them disappear.
 */
function distortBlur(text: string, seed: number): string {
  const rng = makeRng(seed);
  const CONFUSABLE: Record<string, string> = {
    '0': 'O', 'O': '0', 'Q': '0',
    '1': 'l', 'l': '1', 'I': '1',
    '5': 'S', 'S': '5',
    '8': 'B', 'B': '8',
    '6': 'b', 'G': '6',
    '9': 'q',
  };
  return text.split('').map(c => {
    if (c === '.') return rng() < 0.18 ? ' ' : c;        // decimal drops out 18%
    if (CONFUSABLE[c] && rng() < 0.09) return CONFUSABLE[c]; // 9% char confusion
    return c;
  }).join('');
}

/**
 * Glare — bright spot or reflection covers part of the receipt.
 * In ~30% of content lines, replaces a contiguous span with spaces.
 * Spans are biased toward the right side (where prices live).
 */
function distortGlare(text: string, seed: number): string {
  const rng = makeRng(seed);
  return text.split('\n').map(line => {
    if (line.trim().length < 5 || rng() > 0.30) return line;
    const chars = line.split('');
    const len = chars.length;
    // Bias start toward right half (price column)
    const startMin = Math.floor(len * 0.4);
    const startMax = Math.max(startMin, len - 5);
    const start = startMin + Math.floor(rng() * (startMax - startMin + 1));
    const spanLen = 4 + Math.floor(rng() * 8);
    for (let i = start; i < Math.min(len, start + spanLen); i++) chars[i] = ' ';
    return chars.join('');
  }).join('\n');
}

/**
 * Right-crop — portrait photo cuts off right edge of wide receipt.
 * Removes 5–9 characters from the end of each non-empty line.
 * This systematically truncates or destroys the price column.
 */
function distortRightCrop(text: string, seed: number): string {
  const rng = makeRng(seed);
  return text.split('\n').map(line => {
    if (!line.trim()) return line;
    const cut = 5 + Math.floor(rng() * 5);    // 5–9 chars removed
    return line.length > cut ? line.slice(0, line.length - cut) : '';
  }).join('\n');
}

/**
 * Low contrast — faded thermal print or faint ink.
 * Randomly drops characters (→ space), with decimal points twice as fragile.
 * Occasionally drops an entire price run (all adjacent digits).
 */
function distortLowContrast(text: string, seed: number): string {
  const rng = makeRng(seed);
  const chars = text.split('');
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (c === '.') {
      if (rng() < 0.22) chars[i] = ' ';       // decimal very fragile
    } else if (/\d/.test(c)) {
      if (rng() < 0.10) {
        // Drop this digit and any adjacent digits (erases the full price)
        let j = i;
        while (j < chars.length && /\d/.test(chars[j])) { chars[j] = ' '; j++; }
        i = j;
        continue;
      }
    } else if (c !== ' ' && c !== '\n') {
      if (rng() < 0.09) chars[i] = ' ';       // letter drop
    }
    i++;
  }
  return chars.join('');
}

/**
 * Perspective distortion — keystone effect from angled phone capture.
 * Adds variable leading indent to lines (misaligns the price column).
 * Occasionally compresses multi-space gaps (words or columns run together).
 */
function distortPerspective(text: string, seed: number): string {
  const rng = makeRng(seed);
  return text.split('\n').map(line => {
    if (!line.trim()) return line;
    // Random leading indent shifts left-edge alignment
    const indent = rng() < 0.35 ? ' '.repeat(1 + Math.floor(rng() * 5)) : '';
    // Compress wide spaces in ~20% of lines (price column closes up)
    if (rng() < 0.20) return indent + line.replace(/\s{4,}/g, '  ');
    return indent + line;
  }).join('\n');
}

/**
 * Slight rotation — 5–15° tilt, OCR loses line boundaries.
 * Adjacent non-empty lines merge with ~18% probability.
 * A few lines gain random noise characters at the start.
 */
function distortSlightRotation(text: string, seed: number): string {
  const rng = makeRng(seed);
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur  = lines[i];
    const next = lines[i + 1] ?? '';
    // Merge adjacent non-empty lines (OCR lost the line break)
    if (cur.trim() && next.trim() && rng() < 0.18) {
      out.push(cur + ' ' + next.trim());
      i += 2;
    } else {
      // Occasional noise char at start of line
      const noise = rng() < 0.08 ? (rng() < 0.5 ? '|' : '~') : '';
      out.push(noise + cur);
      i++;
    }
  }
  return out.join('\n');
}

// ─── Distortion registry ──────────────────────────────────────────────────────

interface Distortion {
  id: string;
  label: string;
  fn: DistortFn;
  seed: number;
}

const DISTORTIONS: Distortion[] = [
  { id: 'blur',         label: 'Blur (char confusables + decimal drops)', fn: distortBlur,         seed: 0xA1B2C3D4 },
  { id: 'glare',        label: 'Glare (right-side text erasure)',         fn: distortGlare,        seed: 0xDEADBEEF },
  { id: 'right-crop',   label: 'Right-crop (5–9 chars cut per line)',     fn: distortRightCrop,    seed: 0xCAFEBABE },
  { id: 'low-contrast', label: 'Low contrast (random char + digit drops)',fn: distortLowContrast,  seed: 0xFEEDFACE },
  { id: 'perspective',  label: 'Perspective (column misalignment)',       fn: distortPerspective,  seed: 0x0BADF00D },
  { id: 'rotation',     label: 'Slight rotation (line merging)',          fn: distortSlightRotation,seed: 0x13579BDF },
];

// ─── Noise patterns (leak detection) ─────────────────────────────────────────

const NOISE_PATTERNS = [
  /\btotal\b/i, /\bsubtotal\b/i, /\btax\b/i, /\bcash\b/i, /\bchange\b/i,
  /\bvisa\b/i, /\bdebit\b/i, /\btendered\b/i, /\bpoints?\b/i,
  /\bsavings?\b/i, /\bdiscount\b/i, /\bcoupon\b/i,
];

function noiseLeakage(result: ParseResult): number {
  return result.items.filter(i => NOISE_PATTERNS.some(p => p.test(i.name))).length;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface DistortedScore {
  fixtureName: string;
  distortionId: string;
  itemCount: number;
  itemScore: number;    // 0-100
  totalScore: number;   // 0-100
  noiseScore: number;   // 100 or less
  overallScore: number; // weighted
}

function scoreResult(fix: Fixture, result: ParseResult): DistortedScore['itemScore' | 'totalScore' | 'noiseScore' | 'overallScore'] & { itemCount: number } {
  const n    = result.items.length;
  const leak = noiseLeakage(result);

  // Items: full credit if within ±1 of expected, scaled by delta
  const delta    = Math.abs(n - fix.expectedItemCount);
  const inBounds = n >= fix.minItems && n <= fix.maxItems;
  const itemScore = inBounds ? Math.max(0, 100 - delta * 15) : Math.max(0, 50 - delta * 20);

  // Total
  let totalScore = 100;
  if (fix.expectedTotal > 0) {
    if (result.total === 0) totalScore = 20;
    else {
      const pct = Math.abs(result.total - fix.expectedTotal) / fix.expectedTotal;
      totalScore = pct < 0.01 ? 100 : pct < 0.05 ? 85 : pct < 0.10 ? 70 : pct < 0.20 ? 50 : 20;
    }
  }

  const noiseScore  = Math.max(0, 100 - leak * 30);
  const overallScore = Math.round(itemScore * 0.40 + totalScore * 0.25 + noiseScore * 0.20 + 100 * 0.15);

  return { itemCount: n, itemScore, totalScore, noiseScore, overallScore };
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CLR = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', magenta: '\x1b[35m',
};

function scoreColor(s: number): string {
  return s >= 85 ? CLR.green : s >= 65 ? CLR.yellow : CLR.red;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface DistortionSummary {
  id: string;
  label: string;
  fixtureScores: Array<{ fixtureName: string; cleanScore: number; distortedScore: number; drop: number }>;
  avgClean: number;
  avgDistorted: number;
  avgDrop: number;    // percentage-point drop (0 = perfect robustness)
  robustness: number; // 0-100 (100 = no degradation)
}

interface SavedRun {
  timestamp: string;
  distortions: DistortionSummary[];
  cleanBaseline: number;
  overallRobustness: number;
  weakestDistortion: string;
}

console.log();
console.log(`${CLR.bold}═══ Receipt Pipeline Robustness Benchmark ═══${CLR.reset}`);
console.log(`${CLR.dim}${new Date().toISOString()}${CLR.reset}`);
console.log();

// Step 1: clean baseline per fixture
console.log(`${CLR.bold}── Clean baseline ──${CLR.reset}`);
const cleanScores: Record<string, number> = {};
const cleanResults: Record<string, ReturnType<typeof scoreResult>> = {};

for (const fix of FIXTURES) {
  const result = parseReceiptText(fix.text);
  const s      = scoreResult(fix, result);
  cleanScores[fix.name]  = s.overallScore;
  cleanResults[fix.name] = s;
  const col = scoreColor(s.overallScore);
  console.log(`  ${fix.name.padEnd(18)} ${col}${s.overallScore}/100${CLR.reset}  items=${s.itemCount}/${fix.expectedItemCount}`);
}

const avgClean = Math.round(Object.values(cleanScores).reduce((a, b) => a + b, 0) / FIXTURES.length);
console.log(`  ${'AVERAGE'.padEnd(18)} ${CLR.bold}${CLR.cyan}${avgClean}/100${CLR.reset}`);
console.log();

// Step 2: apply each distortion and score
const summaries: DistortionSummary[] = [];

for (const dist of DISTORTIONS) {
  console.log(`${CLR.bold}── ${dist.label} ──${CLR.reset}`);
  const fixtureScores: DistortionSummary['fixtureScores'] = [];

  for (const fix of FIXTURES) {
    const distorted = dist.fn(fix.text, dist.seed);
    const result    = parseReceiptText(distorted);
    const s         = scoreResult(fix, result);
    const clean     = cleanScores[fix.name];
    const drop      = clean - s.overallScore;

    fixtureScores.push({ fixtureName: fix.name, cleanScore: clean, distortedScore: s.overallScore, drop });

    const col    = scoreColor(s.overallScore);
    const dropStr = drop > 0 ? `${CLR.red}-${drop}${CLR.reset}` : `${CLR.dim}±0${CLR.reset}`;
    console.log(
      `  ${fix.name.padEnd(18)} ` +
      `${col}${s.overallScore}/100${CLR.reset} ` +
      `(${dropStr}${CLR.reset}) ` +
      `items=${s.itemCount}/${fix.expectedItemCount}`,
    );
  }

  const avgDist  = Math.round(fixtureScores.reduce((a, b) => a + b.distortedScore, 0) / fixtureScores.length);
  const avgDrop  = Math.round(fixtureScores.reduce((a, b) => a + b.drop, 0) / fixtureScores.length);
  const robust   = Math.max(0, Math.round(avgDist / avgClean * 100));

  summaries.push({
    id: dist.id,
    label: dist.label,
    fixtureScores,
    avgClean,
    avgDistorted: avgDist,
    avgDrop,
    robustness: robust,
  });

  const robCol = scoreColor(robust);
  console.log(
    `  ${'AVERAGE'.padEnd(18)} ${CLR.bold}${robCol}${avgDist}/100${CLR.reset} ` +
    `(drop ${avgDrop}pt, robustness ${robCol}${robust}%${CLR.reset})`,
  );
  console.log();
}

// Step 3: overall robustness summary
console.log(`${CLR.bold}═══ Robustness Summary ═══${CLR.reset}`);
const sortedByRobust = [...summaries].sort((a, b) => a.robustness - b.robustness);

for (const s of sortedByRobust) {
  const col = scoreColor(s.robustness);
  const bar = '█'.repeat(Math.round(s.robustness / 10)).padEnd(10, '░');
  console.log(
    `  ${s.id.padEnd(14)} ${col}${bar}${CLR.reset} ${col}${s.robustness}%${CLR.reset}  avg drop: ${s.avgDrop}pt`,
  );
}

const overallRobustness = Math.round(summaries.reduce((a, b) => a + b.robustness, 0) / summaries.length);
const weakest           = sortedByRobust[0];

console.log();
console.log(`Overall robustness: ${CLR.bold}${CLR.cyan}${overallRobustness}%${CLR.reset}`);
console.log(`Weakest failure mode: ${CLR.red}${CLR.bold}${weakest.id}${CLR.reset} (${weakest.robustness}% robust, avg drop ${weakest.avgDrop}pt)`);

// Step 4: per-fixture degradation matrix
console.log();
console.log(`${CLR.bold}── Degradation matrix (drop in score pts) ──${CLR.reset}`);
const header = '                  ' + DISTORTIONS.map(d => d.id.padStart(12)).join('');
console.log(CLR.dim + header + CLR.reset);

for (const fix of FIXTURES) {
  let row = fix.name.padEnd(18);
  for (const s of summaries) {
    const fs   = s.fixtureScores.find(f => f.fixtureName === fix.name)!;
    const drop = fs.drop;
    const col  = drop === 0 ? CLR.dim : drop <= 10 ? CLR.yellow : CLR.red;
    row += col + `${drop > 0 ? `-${drop}` : '±0'}`.padStart(12) + CLR.reset;
  }
  console.log(row);
}

// Worst-case line per distortion
let avgsRow = 'avg-drop'.padEnd(18);
for (const s of summaries) {
  const col = s.avgDrop === 0 ? CLR.dim : s.avgDrop <= 5 ? CLR.yellow : CLR.red;
  avgsRow += col + (`${s.avgDrop}pt`).padStart(12) + CLR.reset;
}
console.log(avgsRow);
console.log();

// Step 5: diagnosis of the weakest mode
console.log(`${CLR.bold}── Weakest failure mode: ${weakest.id} ──${CLR.reset}`);
console.log(`  ${weakest.label}`);
console.log(`  Avg score: ${weakest.avgDistorted}/100 (clean: ${avgClean}/100)`);
console.log(`  Fixtures most affected:`);
const worst = [...weakest.fixtureScores].sort((a, b) => b.drop - a.drop).slice(0, 3);
for (const f of worst) {
  console.log(`    ${f.fixtureName.padEnd(18)} clean=${f.cleanScore}  distorted=${f.distortedScore}  drop=${f.drop}pt`);
}
console.log();

// Save
function saveRun(run: SavedRun) {
  let history: SavedRun[] = [];
  if (existsSync(RESULTS_FILE)) {
    try { history = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8')); } catch { /* */ }
  }
  history.push(run);
  if (history.length > 20) history = history.slice(-20);
  writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));
}

const run: SavedRun = {
  timestamp: new Date().toISOString(),
  distortions: summaries,
  cleanBaseline: avgClean,
  overallRobustness,
  weakestDistortion: weakest.id,
};
saveRun(run);
console.log(`${CLR.dim}Results saved → ${RESULTS_FILE}${CLR.reset}`);
console.log();
