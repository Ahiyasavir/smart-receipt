// Diagnoses why a scan succeeded or failed by analysing OCR text and parse output.

import { ParseResult } from './receiptParser';
import { classifyLines } from './lineClassifier';

export type ScanFailureMode =
  | 'good'               // items found, totals match
  | 'partial'            // items found but totals diverge or result is incomplete
  | 'blurry'             // has price-like text but no items could be matched
  | 'rotated'            // very few coherent words — image likely sideways or upside-down
  | 'format-unsupported' // readable text but no price lines — unsupported receipt format
  | 'empty';             // fewer than 40 chars extracted from the image

export interface ScanDiagnostic {
  mode: ScanFailureMode;
  charCount: number;
  priceLineCount: number;
  letterRatio: number;       // fraction of OCR lines that contain ≥3 consecutive letters
  hasTotalLine: boolean;
  itemCount: number;
  orphanedNameLines: number; // name-only lines with no following price → crop/glare signal
  discountLineCount: number; // explicit discount lines detected
  discountSum: number;       // total discount amount (from ParseResult)
  completenessRatio: number; // (itemSum − discounts) / total, clamped 0–1
}

function computeSignals(rawText: string) {
  const trimmed = rawText.trim();
  const charCount = trimmed.length;
  if (charCount === 0) {
    return { charCount: 0, priceLineCount: 0, letterRatio: 0, hasTotalLine: false, orphanedNameLines: 0 };
  }

  const lines = trimmed.split('\n').filter((l) => l.trim().length > 2);
  if (lines.length === 0) {
    return { charCount, priceLineCount: 0, letterRatio: 0, hasTotalLine: false, orphanedNameLines: 0 };
  }

  const priceLineCount = lines.filter((l) => /\d+\.\d{1,2}/.test(l)).length;
  const letterLines    = lines.filter((l) => /[a-zA-Z]{3,}/.test(l)).length;
  const letterRatio    = letterLines / lines.length;
  const hasTotalLine   = lines.some((l) => /\b(total|subtotal)\b/i.test(l));

  // Detect orphaned name-only lines in the receipt BODY (after the first priced line).
  // Header lines (store name, address) are excluded because they appear before any prices.
  // High orphan count → prices are missing for item lines → likely right-crop or glare.
  const classified = classifyLines(rawText);
  let orphanedNameLines = 0;
  let seenFirstPrice = false;
  for (let i = 0; i < classified.length; i++) {
    const cl = classified[i];
    // Mark the start of the item region: first line with a detectable price
    if (!seenFirstPrice && cl.price !== null && cl.lineClass !== 'noise') {
      seenFirstPrice = true;
    }
    if (!seenFirstPrice) continue;
    if (cl.lineClass !== 'name_only') continue;
    const next = classified[i + 1];
    if (!next || (next.lineClass !== 'price_only' && next.lineClass !== 'item')) {
      orphanedNameLines++;
    }
  }

  return { charCount, priceLineCount, letterRatio, hasTotalLine, orphanedNameLines };
}

export function classifyFailureMode(rawText: string, result: ParseResult): ScanDiagnostic {
  const { charCount, priceLineCount, letterRatio, hasTotalLine, orphanedNameLines } =
    computeSignals(rawText);
  const itemCount = result.items.length;

  // Completeness: how much of the total is explained by (items − discounts).
  // Only meaningful when a receipt total was detected (result.total ≠ result.itemSum implies
  // a detectedTotal exists). Clamped to [0, 1].
  // When both total and itemSum are 0 (complete parse failure), ratio is 0 — not 1.
  const adjustedItemSum = Math.max(0, result.itemSum - result.discountSum);
  const completenessRatio =
    result.total > 0 && result.itemSum > 0
      ? Math.min(1, adjustedItemSum / result.total)
      : result.total === 0 && result.itemSum === 0
        ? 0
        : 1;

  let mode: ScanFailureMode;

  if (charCount < 40) {
    mode = 'empty';
  } else if (itemCount > 0) {
    mode = result.isIncomplete || result.mismatch ? 'partial' : 'good';
  } else if (letterRatio < 0.30) {
    // Very few coherent words → text is garbled, most likely the image is rotated
    mode = 'rotated';
  } else if (priceLineCount === 0) {
    // Readable words but no price-like lines → unsupported format or non-receipt image
    mode = 'format-unsupported';
  } else {
    // Has price-like lines but parser could not produce items → image quality issue
    mode = 'blurry';
  }

  return {
    mode, charCount, priceLineCount, letterRatio, hasTotalLine, itemCount,
    orphanedNameLines,
    discountLineCount: result.discountLineCount,
    discountSum: result.discountSum,
    completenessRatio,
  };
}

export interface ScanExplanation {
  heading: string;
  detail: string;
  tips: string[];
}

export function getScanExplanation(diag: ScanDiagnostic): ScanExplanation {
  switch (diag.mode) {
    case 'good':
      return { heading: '', detail: '', tips: [] };

    case 'partial': {
      const tips: string[] = [];

      // Discount explanation — only surfaced when discounts were actually detected
      if (diag.discountLineCount > 0) {
        const amt = diag.discountSum.toFixed(2);
        tips.push(`$${amt} in detected discounts/coupons reduces the receipt total`);
      } else {
        tips.push('Discount, coupon, or loyalty-savings lines are excluded from items');
      }

      // Crop / glare hint — only surface when orphaned lines are high AND completeness
      // is genuinely low. Multi-line receipt formats (Costco, WFM) produce many orphaned
      // name lines even when correctly parsed; gating on completenessRatio < 0.70
      // prevents false positives on those receipts.
      if (diag.orphanedNameLines >= 3 && diag.completenessRatio < 0.70) {
        tips.push(
          `${diag.orphanedNameLines} item line(s) had no price — receipt may be cropped or have glare on the right edge`,
        );
      }

      // Completeness percentage
      const pct = Math.round(diag.completenessRatio * 100);
      if (pct < 90) {
        tips.push(`Estimated coverage: ~${pct}% of total — re-scan with better lighting may capture the rest`);
      }

      tips.push('Tax and fees are in the total but not listed as individual items');

      const detail =
        diag.completenessRatio < 0.70
          ? 'Items were found but a significant portion of the total is unaccounted for.'
          : "Items were found but the totals don't fully add up.";

      return { heading: 'Scan incomplete', detail, tips };
    }

    case 'empty':
      return {
        heading: 'No text detected',
        detail: 'The image produced no readable text.',
        tips: [
          'Move to brighter lighting or enable flash',
          'Make sure the full receipt is in frame',
          'Hold the camera still — tap the screen to focus first',
        ],
      };

    case 'blurry':
      return {
        heading: 'Image quality too low',
        detail: 'Some text was found but item lines and prices could not be matched.',
        tips: [
          'Clean your camera lens',
          'Tap the receipt on-screen to focus before capturing',
          'Move closer and use even overhead lighting',
        ],
      };

    case 'rotated':
      return {
        heading: 'Receipt may be sideways',
        detail: 'Very few readable words were detected — the image may be rotated 90° or upside down.',
        tips: [
          'Rotate the photo so receipt text reads top-to-bottom',
          'Hold your phone vertically (portrait mode) when scanning',
        ],
      };

    case 'format-unsupported':
      return {
        heading: 'Format not supported',
        detail: 'Text was read but no item+price pairs were found. This receipt format may not be supported yet.',
        tips: [
          'Only printed single-column grocery receipts are supported',
          'Handwritten, multi-column, and restaurant receipts are not supported',
          'You can edit the raw OCR text below and re-parse manually',
        ],
      };
  }
}
