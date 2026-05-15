import { createWorker } from 'tesseract.js';
import { preprocessForOCR } from './imagePreprocess';

export type OCRProgressCallback = (percent: number, status: string) => void;

export const OCR_MIN_CHARS = 40;

// Scores how useful an OCR result is for receipt parsing (0–1).
// Prices are the strongest signal; a TOTAL line adds a structural bonus.
function ocrResultStrength(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  const lines = trimmed.split('\n').filter((l) => l.trim().length > 2);
  if (lines.length === 0) return 0;

  const priceLines  = lines.filter((l) => /\d+\.\d{2}/.test(l));
  const letterLines = lines.filter((l) => /[a-zA-Z]{3,}/.test(l));
  const letterRatio = letterLines.length / lines.length;
  const hasTotalLine = lines.some((l) => /\b(total|subtotal)\b/i.test(l));

  const charScore    = Math.min(1, trimmed.length / 400);
  const priceScore   = Math.min(1, priceLines.length / 6);
  const structBonus  = hasTotalLine ? 0.10 : 0;

  return Math.min(1, charScore * 0.22 + priceScore * 0.52 + letterRatio * 0.16 + structBonus);
}

const STRENGTH_ACCEPTABLE = 0.45;

// Returns true when the OCR text has name-bearing lines but very few price lines —
// the classic symptom of right-edge clipping where prices are cut off.
function needsRightEdgeRescue(text: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim().length > 2);
  if (lines.length < 3) return false;
  const priceLines = lines.filter((l) => /\d+\.\d{2}/.test(l)).length;
  const nameOnlyLines = lines.filter((l) => /[a-zA-Z]{3,}/.test(l) && !/\d+\.\d{2}/.test(l)).length;
  return nameOnlyLines >= 3 && priceLines < nameOnlyLines * 0.4;
}

async function setPSM(worker: Tesseract.Worker, mode: string): Promise<void> {
  await (worker as unknown as { setParameters(p: Record<string, string>): Promise<void> })
    .setParameters({ tessedit_pageseg_mode: mode })
    .catch(() => undefined);
}

export async function runOCR(
  image: File | string,
  onProgress?: OCRProgressCallback,
): Promise<string> {
  const prog = { offset: 0, scale: 50 };

  const worker = await createWorker('eng', 1, {
    logger: (msg: { status: string; progress: number }) => {
      if (!onProgress) return;
      if (msg.status === 'recognizing text') {
        const pct = Math.min(99, Math.round(prog.offset + prog.scale * msg.progress));
        onProgress(pct, msg.status);
      } else {
        onProgress(prog.offset, msg.status);
      }
    },
  });

  let src1: string | File = image;
  if (image instanceof File) {
    try {
      src1 = await preprocessForOCR(image, 'standard');
    } catch {
      src1 = image;
    }
  }

  try {
    // ── Pass 1: PSM 6, standard preprocessing ───────────────────────────────
    prog.offset = 0; prog.scale = 50;
    await setPSM(worker, '6');
    const r1 = await worker.recognize(src1);

    let bestText = r1.data.text;
    let bestStrength = ocrResultStrength(r1.data.text);

    // ── Pass 1b: right-edge rescue ───────────────────────────────────────────
    // Fires immediately when the crop signal is present — regardless of overall
    // strength. A right-cropped receipt can score strength >= 0.45 (plenty of
    // readable text words) yet have every price missing. Without this early
    // check, the strength-gated early return at the bottom would skip padRight
    // entirely and return a result with no prices.
    if (image instanceof File && needsRightEdgeRescue(bestText)) {
      onProgress?.(50, 'rescuing right-edge prices…');
      try {
        const srcPad = await preprocessForOCR(image as File, 'padRight');
        await setPSM(worker, '6');
        const r1b = await worker.recognize(srcPad);
        const s1b = ocrResultStrength(r1b.data.text);
        if (s1b > bestStrength) { bestText = r1b.data.text; bestStrength = s1b; }
      } catch { /* canvas unavailable or file corrupt — ignore */ }
    }

    if (bestStrength >= STRENGTH_ACCEPTABLE || !(image instanceof File)) {
      onProgress?.(100, 'done');
      return bestText;
    }

    // ── Pass 2: PSM 4 (single column, variable sizes), same image ───────────
    prog.offset = 50; prog.scale = 13;
    await setPSM(worker, '4');
    const r2 = await worker.recognize(src1);
    const s2 = ocrResultStrength(r2.data.text);
    if (s2 > bestStrength) { bestText = r2.data.text; bestStrength = s2; }

    if (bestStrength >= STRENGTH_ACCEPTABLE || !(image instanceof File)) {
      onProgress?.(100, 'done');
      return bestText;
    }

    // ── Pass 3: sharp preprocessing + PSM 6 ─────────────────────────────────
    onProgress?.(63, 'enhancing image…');
    try {
      const src2 = await preprocessForOCR(image as File, 'sharp');
      prog.offset = 63; prog.scale = 10;
      await setPSM(worker, '6');
      const r3 = await worker.recognize(src2);
      const s3 = ocrResultStrength(r3.data.text);
      if (s3 > bestStrength) { bestText = r3.data.text; bestStrength = s3; }
    } catch { /* canvas unavailable or file corrupt */ }

    if (bestStrength >= STRENGTH_ACCEPTABLE) { onProgress?.(100, 'done'); return bestText; }

    // ── Pass 4: adaptive (percentile stretch) + PSM 4 ───────────────────────
    onProgress?.(73, 'enhancing image…');
    try {
      const src3 = await preprocessForOCR(image as File, 'adaptive');
      prog.offset = 73; prog.scale = 9;
      await setPSM(worker, '4');
      const r4 = await worker.recognize(src3);
      const s4 = ocrResultStrength(r4.data.text);
      if (s4 > bestStrength) { bestText = r4.data.text; bestStrength = s4; }
    } catch { /* ignore */ }

    if (bestStrength >= STRENGTH_ACCEPTABLE) { onProgress?.(100, 'done'); return bestText; }

    // ── Pass 5: CLAHE + PSM 6 (uneven lighting / glare) ────────────────────
    onProgress?.(82, 'enhancing image…');
    try {
      const src4 = await preprocessForOCR(image as File, 'clahe');
      prog.offset = 82; prog.scale = 6;
      await setPSM(worker, '6');
      const r5 = await worker.recognize(src4);
      const s5 = ocrResultStrength(r5.data.text);
      if (s5 > bestStrength) { bestText = r5.data.text; bestStrength = s5; }
    } catch { /* ignore */ }

    if (bestStrength >= STRENGTH_ACCEPTABLE) { onProgress?.(100, 'done'); return bestText; }

    // ── Pass 6: rotate 90° + PSM 6 (landscape photo, phone tilted left) ─────
    onProgress?.(88, 'trying rotation…');
    try {
      const src5 = await preprocessForOCR(image as File, 'rotate90');
      prog.offset = 88; prog.scale = 5;
      await setPSM(worker, '6');
      const r6 = await worker.recognize(src5);
      const s6 = ocrResultStrength(r6.data.text);
      if (s6 > bestStrength) { bestText = r6.data.text; bestStrength = s6; }
    } catch { /* ignore */ }

    if (bestStrength >= STRENGTH_ACCEPTABLE) { onProgress?.(100, 'done'); return bestText; }

    // ── Pass 7: rotate 270° + PSM 6 (landscape photo, phone tilted right) ───
    onProgress?.(93, 'trying rotation…');
    try {
      const src6 = await preprocessForOCR(image as File, 'rotate270');
      prog.offset = 93; prog.scale = 4;
      await setPSM(worker, '6');
      const r7 = await worker.recognize(src6);
      const s7 = ocrResultStrength(r7.data.text);
      if (s7 > bestStrength) { bestText = r7.data.text; bestStrength = s7; }
    } catch { /* ignore */ }

    if (bestStrength >= STRENGTH_ACCEPTABLE) { onProgress?.(100, 'done'); return bestText; }

    // ── Pass 8: PSM 11 sparse text (multi-column / two-column layouts) ────────
    onProgress?.(97, 'trying sparse text mode…');
    try {
      prog.offset = 97; prog.scale = 2;
      await setPSM(worker, '11');
      const r8 = await worker.recognize(src1);
      const s8 = ocrResultStrength(r8.data.text);
      if (s8 > bestStrength) { bestText = r8.data.text; bestStrength = s8; }
    } catch { /* ignore */ }

    // ── Pass 9: right-edge rescue fallback ───────────────────────────────────
    // Safety net for the rare case where all 8 quality passes failed AND the
    // combined result still shows crop signal. The main crop rescue runs at
    // pass 1b (before the strength-gated early return) so this only fires
    // when the receipt is also very low quality overall.
    if (image instanceof File && needsRightEdgeRescue(bestText)) {
      onProgress?.(99, 'rescuing right-edge prices…');
      try {
        const srcPad = await preprocessForOCR(image, 'padRight');
        await setPSM(worker, '6');
        const r9 = await worker.recognize(srcPad);
        const s9 = ocrResultStrength(r9.data.text);
        if (s9 > bestStrength) { bestText = r9.data.text; bestStrength = s9; }
      } catch { /* ignore */ }
    }

    onProgress?.(100, 'done');
    return bestText;
  } finally {
    await worker.terminate();
  }
}
