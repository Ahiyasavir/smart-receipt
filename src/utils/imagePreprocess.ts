// Canvas-based image preprocessing to improve Tesseract OCR accuracy on receipts.
// Modes:
//   standard  — grayscale + mild contrast stretch (1.5×)
//   sharp     — grayscale + strong contrast (2.0×) + unsharp mask
//   adaptive  — grayscale + percentile histogram stretch + unsharp mask
//   clahe     — grayscale + block-wise CLAHE + unsharp mask (best for glare / uneven lighting)
//   rotate90  — rotate 90° CW then standard preprocessing (landscape phone, rotated left)
//   rotate270 — rotate 270° CW then standard preprocessing (landscape phone, rotated right)
// Small images are upscaled; large images are downscaled to a safe OCR range.

export type PreprocessMode = 'standard' | 'sharp' | 'adaptive' | 'clahe' | 'rotate90' | 'rotate270' | 'padRight';

const MAX_SIDE = 1800;
const MIN_LONG = 1000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image failed to load')); };
    img.src = url;
  });
}

function scaleDimensions(natW: number, natH: number): { scale: number; w: number; h: number } {
  const naturalMax = Math.max(natW, natH);
  let scale = 1;
  if (naturalMax > MAX_SIDE) scale = MAX_SIDE / naturalMax;
  else if (naturalMax < MIN_LONG) scale = MIN_LONG / naturalMax;
  return { scale, w: Math.round(natW * scale), h: Math.round(natH * scale) };
}

async function buildCanvas(
  file: File,
): Promise<{ ctx: CanvasRenderingContext2D; w: number; h: number }> {
  const img = await loadImage(file);
  const { w, h } = scaleDimensions(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.drawImage(img, 0, 0, w, h);
  return { ctx, w, h };
}

// Build a canvas with the source image rotated 90° or 270° clockwise.
// 90°:  phone held landscape with the top pointing right → receipt reads upward
// 270°: phone held landscape with the top pointing left  → receipt reads downward
async function buildRotatedCanvas(
  file: File,
  degrees: 90 | 270,
): Promise<{ ctx: CanvasRenderingContext2D; w: number; h: number }> {
  const img = await loadImage(file);
  const { w: srcW, h: srcH } = scaleDimensions(img.naturalWidth, img.naturalHeight);
  // After 90°/270° the canvas dimensions swap
  const w = srcH;
  const h = srcW;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.save();
  if (degrees === 90) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(img, 0, 0, srcW, srcH);
  ctx.restore();
  return { ctx, w, h };
}

// Perceptual grayscale + midpoint contrast stretch.
// factor 1.0 = grayscale only; 1.5 = mild; 2.0 = aggressive.
function grayscaleContrast(ctx: CanvasRenderingContext2D, w: number, h: number, factor: number): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const stretched = Math.max(0, Math.min(255, Math.round((gray - 128) * factor + 128)));
    d[i] = d[i + 1] = d[i + 2] = stretched;
  }
  ctx.putImageData(imgData, 0, 0);
}

// 4-neighbour Laplacian unsharp mask. Sharpens text edges for blurry receipts.
function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = new ImageData(w, h);
  const s = src.data;
  const d = dst.data;
  const STRENGTH = 1.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255;
        continue;
      }
      const center = s[i];
      const avg4 = (s[i - 4] + s[i + 4] + s[i - w * 4] + s[i + w * 4]) / 4;
      const v = Math.round(center + STRENGTH * (center - avg4));
      const clamped = Math.max(0, Math.min(255, v));
      d[i] = d[i + 1] = d[i + 2] = clamped;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// Percentile histogram stretch: maps p2–p98 range → 0–255.
function histogramStretch(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const n = Math.floor(d.length / 4);

  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;

  const p2Target = Math.floor(n * 0.02);
  const p98Target = Math.floor(n * 0.98);
  let lo = 0, hi = 255, count = 0;
  for (let v = 0; v <= 255; v++) {
    count += hist[v];
    if (count <= p2Target) lo = v;
    if (count <= p98Target) hi = v;
  }

  const range = hi - lo;
  if (range < 20) return;

  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round((d[i] - lo) / range * 255);
    const clamped = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = clamped;
  }
  ctx.putImageData(imgData, 0, 0);
}

// Build an equalization LUT for one CLAHE tile.
// clipLimit is the absolute pixel count cap per histogram bin.
function buildTileLut(
  src: Uint8ClampedArray,
  w: number,
  x0: number, y0: number, x1: number, y1: number,
  clipLimit: number,
): Uint8ClampedArray {
  const pixCount = (x1 - x0) * (y1 - y0);
  const hist = new Uint32Array(256);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      hist[src[(y * w + x) * 4]]++;
    }
  }

  // Clip and uniformly redistribute excess
  let excess = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > clipLimit) { excess += hist[i] - clipLimit; hist[i] = clipLimit; }
  }
  const addPerBin = Math.floor(excess / 256);
  const remainder = excess - addPerBin * 256;
  for (let i = 0; i < 256; i++) hist[i] += addPerBin;
  for (let i = 0; i < remainder; i++) hist[i]++;

  // CDF → equalisation LUT
  const cdf = new Uint32Array(256);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

  const cdfMin = cdf.find(v => v > 0) ?? 0;
  const denom = pixCount - cdfMin;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = denom > 0 ? Math.round((cdf[i] - cdfMin) / denom * 255) : 0;
  }
  return lut;
}

// CLAHE — Contrast Limited Adaptive Histogram Equalization.
// Divides the image into gridX × gridY tiles, equalizes each independently, then
// bilinearly interpolates between tile LUTs to eliminate block boundaries.
// clipFactor = multiple of the average bin count at which to clip each tile histogram.
// A higher clipFactor → more contrast amplification (and more noise); 2–4 is typical.
function applyClahe(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gridX = 8,
  gridY = 8,
  clipFactor = 3.0,
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = imgData.data;

  const tileW = Math.ceil(w / gridX);
  const tileH = Math.ceil(h / gridY);

  // Build per-tile LUTs
  const luts: Uint8ClampedArray[][] = Array.from({ length: gridY }, () => new Array(gridX));
  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      const x0 = gx * tileW;
      const y0 = gy * tileH;
      const x1 = Math.min(x0 + tileW, w);
      const y1 = Math.min(y0 + tileH, h);
      const pixCount = (x1 - x0) * (y1 - y0);
      const clipLimit = Math.max(1, Math.round(clipFactor * pixCount / 256));
      luts[gy][gx] = buildTileLut(src, w, x0, y0, x1, y1, clipLimit);
    }
  }

  // Apply LUTs with bilinear interpolation (centre-of-tile alignment)
  const dst = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const v = src[idx];

      const gxf = (x + 0.5) / w * gridX - 0.5;
      const gyf = (y + 0.5) / h * gridY - 0.5;
      const gx0 = Math.max(0, Math.floor(gxf));
      const gy0 = Math.max(0, Math.floor(gyf));
      const gx1 = Math.min(gridX - 1, gx0 + 1);
      const gy1 = Math.min(gridY - 1, gy0 + 1);
      const fx = Math.max(0, gxf - gx0);
      const fy = Math.max(0, gyf - gy0);

      const mapped = Math.round(
        luts[gy0][gx0][v] * (1 - fx) * (1 - fy) +
        luts[gy0][gx1][v] * fx       * (1 - fy) +
        luts[gy1][gx0][v] * (1 - fx) * fy +
        luts[gy1][gx1][v] * fx       * fy,
      );

      dst[idx] = dst[idx + 1] = dst[idx + 2] = Math.max(0, Math.min(255, mapped));
      dst[idx + 3] = 255;
    }
  }

  ctx.putImageData(new ImageData(dst, w, h), 0, 0);
}

export async function preprocessForOCR(
  file: File,
  mode: PreprocessMode = 'standard',
): Promise<string> {
  if (mode === 'rotate90' || mode === 'rotate270') {
    const { ctx, w, h } = await buildRotatedCanvas(file, mode === 'rotate90' ? 90 : 270);
    grayscaleContrast(ctx, w, h, 1.5);
    return ctx.canvas.toDataURL('image/png');
  }

  if (mode === 'padRight') {
    // Adds 80px white padding on the right edge to prevent Tesseract from clipping
    // the price column when the receipt fills the frame edge-to-edge.
    // Uses direct ImageData copy to avoid a lossy data-URL round-trip.
    const PAD = 80;
    const { ctx: srcCtx, w, h } = await buildCanvas(file);
    grayscaleContrast(srcCtx, w, h, 1.5);
    const srcData = srcCtx.getImageData(0, 0, w, h);
    const padded = document.createElement('canvas');
    padded.width = w + PAD;
    padded.height = h;
    const pCtx = padded.getContext('2d');
    if (!pCtx) throw new Error('Canvas 2D not available');
    pCtx.fillStyle = '#ffffff';
    pCtx.fillRect(0, 0, w + PAD, h);
    pCtx.putImageData(srcData, 0, 0);
    return padded.toDataURL('image/png');
  }

  const { ctx, w, h } = await buildCanvas(file);

  switch (mode) {
    case 'sharp':
      grayscaleContrast(ctx, w, h, 2.0);
      sharpen(ctx, w, h);
      break;
    case 'adaptive':
      grayscaleContrast(ctx, w, h, 1.0);
      histogramStretch(ctx, w, h);
      sharpen(ctx, w, h);
      break;
    case 'clahe':
      grayscaleContrast(ctx, w, h, 1.0);
      applyClahe(ctx, w, h);
      sharpen(ctx, w, h);
      break;
    default: // 'standard'
      grayscaleContrast(ctx, w, h, 1.5);
      break;
  }

  return ctx.canvas.toDataURL('image/png');
}
