// Generates public/icon-192.png and public/icon-512.png from public/icon.svg
// Run once: node scripts/generate-icons.mjs
// Requires: npm install -D sharp

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath    = resolve(__dirname, '../public/icon.svg');
const publicDir  = resolve(__dirname, '../public');

mkdirSync(publicDir, { recursive: true });

const svg = readFileSync(svgPath);

for (const size of [192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}
console.log('Icons generated.');
