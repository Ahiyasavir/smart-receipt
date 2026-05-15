# Receipt Pipeline State — Checkpoint

**Date:** 2026-05-15
**Build status:** ✅ Clean (`tsc --noEmit` passes; benchmark passes)
**Benchmark:** 100/100 — 6/6 PASS (maintained through Stage 12)
**Robustness:** 84% overall · right-crop 43% · glare 79% · blur 99% · low-contrast 88%
**Real benchmark (Stage 10):** 72/100 — 7 PASS · 3 WARN · 1 FAIL · 1 SKIP (12 receipts)
**Real benchmark (Stage 11):** 63/100 — 7 PASS · 2 WARN · 3 FAIL (12 receipts, GT fully item-level)
**Real benchmark (Stage 12):** 64/100 — 7 PASS · 2 WARN · 3 FAIL (12 receipts)
**Audit:** 2026-05-15 — see audit section below

---

## What changed in this pass

### Stage 12 — Audit, merge guard, and diagnostic hardening (2026-05-15)

#### Audit findings (Stage 1)

Three failure modes identified, ranked by engineering ROI:

**#1 — Case B name_only→item merge consuming valid standalone items (parser-level)**
When a garbled item line has no price (becomes `name_only`), and the immediately following line is a real standalone item (`item` class), the merge fires and assigns the garbled name to the real item's price slot. In receipt_007: `BAA" GG WENT CHOCO BAR HR` (garbled "Raaka" line, no price) was merging with `POM MUMS 7 STEM $9.99 1` — consuming it and preventing any GT match. Recall = 0% on that receipt.

**#2 — OrphanedNameLines diagnostic fires on multi-line-format receipts (diagnostic-level)**
Threshold `>= 2` fired for Costco/WFM formats even when `completenessRatio = 100%` and all items were found correctly. Affected receipts 004, 006, 008, 010 with false Crop/Glare tips.

**#3 — completenessRatio = 100% on complete parse failures (diagnostic-level)**
When both `result.total = 0` and `result.itemSum = 0`, the formula `adjustedItemSum / result.total` was short-circuited to return 1 (formula guard), producing a false "fully complete" signal on receipts 002, 003, 012.

#### Changes implemented (Stage 2)

**`src/utils/receiptInterpreter.ts` — Case B merge "prev-was-name_only" guard**

Before executing a Case B merge (name_only + item), the interpreter now checks whether `classified[i-1]` is also `name_only`. If so, the merge is skipped and the item line is emitted as a standalone item.

Rationale: in legitimate two-line product formats (e.g. Whole Foods), the name_only always follows a consumed price_only or item from the previous product. Only in "run of failed prices" scenarios does a name_only line appear immediately before another name_only→item sequence.

Tested: does NOT break the `twolines-receipt` mock fixture (5/5 items, 100/100). The fixture's structure is `price_only→name_only→item`, not `name_only→name_only→item`.

**`src/utils/scanDiagnostics.ts` — Two diagnostic fixes**

1. `completenessRatio`: when both `result.total === 0` AND `result.itemSum === 0`, ratio is now set to 0 (was 1). Receipts 002, 003, 012 now correctly report `completeness=0%`.

2. `getScanExplanation` crop/glare tip: threshold changed from `orphanedNameLines >= 2` to `orphanedNameLines >= 3 AND completenessRatio < 0.70`. Eliminates false crop/glare tips on correctly-parsed multi-line format receipts.

#### Stage 12 results

| ID | Verdict | Score | Items% | Total% | Delta |
|----|---------|-------|--------|--------|-------|
| receipt_001 | PASS | 79 | 86% | 100% | — |
| receipt_002 | WARN | 45 | 0% | 100% | — |
| receipt_003 | FAIL | 25 | 0% | 0% | — |
| receipt_004 | PASS | 77 | 56% | 96% | — |
| receipt_005 | PASS | 100 | 100% | 100% | — |
| receipt_006 | PASS | 85 | 100% | 100% | — |
| receipt_007 | WARN | **58** | **33%** | 100% | **▲+13** (Pom Mums now matched) |
| receipt_008 | PASS | 78 | 82% | 99% | — |
| receipt_009 | PASS | 85 | 100% | 100% | — |
| receipt_010 | PASS | 78 | 83% | 100% | — |
| receipt_011 | FAIL | 33 | 20% | 23% | — |
| receipt_012 | FAIL | 25 | 0% | 0% | — |

**Overall: 64/100 — 7 PASS · 2 WARN · 3 FAIL** (was 63/100)

Mock benchmark: 100/100 — 6/6 PASS (no regressions).  
Robustness: 84% overall (unchanged — merge guard does not affect distortion scenarios).

#### Confirmed unfiixable at parser level (current session)
- receipt_002: blank OCR (physically folded image)
- receipt_003: JFIF too degraded for Tesseract (OCR strength 0.36, 0 price lines)
- receipt_011: thermal garble — total not in OCR, 4/5 item prices absent
- receipt_012: Japanese text requires `jpn.traineddata`

---

### Stage 10 — International receipt support + real-image sanity gate

**Goal:** extend the parser to handle CZK/Czech receipts and run a 12-receipt real-image benchmark.

#### `src/utils/receiptParser.ts` — Extended `normalizeCommaDecimals()`

Added Case 2: detects receipts that use comma-as-decimal throughout (CZK, EUR, etc.) and normalizes them.

```
Case 1 (unchanged) — USD with dollar sign: "$12,99" → "$12.99"
Case 2 (new) — International (no currency prefix): "14,90" → "14.90"
  Also handles trailing OCR noise: "14,908" (Czech price + tax code merged) → "14.90"
  Activation: ≥4 comma-decimal patterns AND outnumber period-decimal patterns 2:1
  Guard: matches D{1-4},DD only — USD thousands "1,234.56" are safe (trailing "." fails lookahead)
```

#### `src/utils/lineClassifier.ts` — International total keywords + Czech discount noise

Added to `TOTAL_RE`:

| Keyword | Language | Meaning |
|---------|----------|---------|
| `celkem` | Czech | "total in all" |
| `gesamt` | German | "total" |
| `summe` | German | "sum" |

Added to `NOISE_RE`:

| Keyword | Language | Meaning |
|---------|----------|---------|
| `zlevneno` | Czech | "discounted" — markdown-price indicator row, not a purchased item |

#### `src/utils/receiptInterpreter.ts` — Preceding `price_only` fallback for split total lines

International receipts (confirmed with Tesco CZK receipt) print the total amount on its own line immediately before the keyword:

```
842.89          ← price_only line (after comma-decimal normalization)
CELKEM io       ← total line (CELKEM keyword, price === null due to OCR noise "io")
```

Pass 1 now: when a `total`-class line has `price === null` and the immediately preceding classified line is `price_only`, adopt that price as `detectedTotal`.

#### New files

- **`images.def`** — 12-entry pipe-delimited manifest (`receipt_ID | filename | merchant | total`)
- **`eval/ground-truth.json`** — Extended from 7 to 12 entries; receipt_002 total=0 sentinel (unverifiable); receipts 008-012 use count-only GT (`items: []`, `itemsCount > 0`)
- **`scripts/real-benchmark.ts`** — Complete Stage 10 rewrite:
  - Loads GT from `eval/ground-truth.json` and images from `images.def`
  - OCR cache in `eval/ocr-cache/` (keyed by receipt ID)
  - `--fresh` flag bypasses cache and re-runs Tesseract
  - `verdict: 'SKIP'` for receipts with `total=0` sentinel (unverifiable)
  - Count-only GT scoring (no F1; shows `~X%` recall estimate)
  - Item-level F1 scoring for receipts with full GT
  - `printDiscrepancyTable()` with per-receipt diagnostics column
  - Focus blocks for receipt_002 (folded) and receipt_010 (CZK)
  - `--fresh` comparison vs previous run at end

#### Stage 10 results (12 receipts, 2026-05-14)

| ID | Verdict | Score | Items% | Total% | Diag mode | Notes |
|----|---------|-------|--------|--------|-----------|-------|
| receipt_001 | PASS | 73 | 71% | 100% | partial | 5/7 items; mismatch flag |
| receipt_002 | SKIP | n/a | n/a | n/a | empty | Folded/cut — OCR produced 0 chars |
| receipt_003 | FAIL | 25 | 0% | 0% | format-unsupported | JFIF photo garbled; OCR strength 0.36 |
| receipt_004 | PASS | 77 | 56% | 96% | partial | Crop/Glare(12); Costco multi-line format |
| receipt_005 | PASS | 100 | 100% | 100% | good | Perfect |
| receipt_006 | PASS | 85 | 100% | 100% | partial | Crop/Glare(17); Whole Foods multi-line |
| receipt_007 | WARN | 45 | 0% | 100% | partial | Trade Fair garbled thermal; LowCoverage(47%) |
| receipt_008 | PASS | 85 | ~88% | 99% | partial | 15/17 items; Crop/Glare(15) |
| receipt_009 | PASS | 85 | ~133% | 100% | partial | Count-only GT; 4 detected vs 3 expected |
| receipt_010 | PASS | 85 | ~83% | 100% | good | CZK fix: total 0% off; 19/23 items |
| receipt_011 | WARN | 65 | ~14% | 23% | good | Trade Fair thermal — most prices garbled |
| receipt_012 | WARN | 65 | ~0% | 0% | empty | Japanese — needs Japanese Tesseract model |

**Overall: 72/100 — 7 PASS · 3 WARN · 1 FAIL · 1 SKIP**

#### Key findings

- **receipt_010 (CZK): ▲+20 pts** — total went from ~95% error to 0% error; 19/23 items parsed correctly. The three changes (comma-decimal normalization, `CELKEM` keyword, preceding `price_only` fallback) together fixed the Czech receipt.
- **receipt_003 (FAIL):** OCR strength 0.36. The JFIF image is physically garbled (underexposed/low resolution). Not a parser issue — no items or prices in OCR output. Image-level fix required.
- **receipt_002 (SKIP):** Folded at the bottom. Tesseract returned 0 characters. Correctly SKIPped.
- **receipt_012 (WARN 65):** Japanese receipt needs `jpn.traineddata` Tesseract model; English-only model produces 18 chars total. Not fixable at the parser level.
- **orphanedNameLines false positives:** Costco/Whole Foods multi-line format produces 12–17 orphaned name lines on correctly-parsed PASS receipts. This is a diagnostic false positive for multi-line receipt formats, not actual crop/glare. The signal should only be acted on when `completenessRatio < 0.70` AND `orphanedNameLines ≥ 3`.

---

### Stage 11 — Short-name heuristic + repository hygiene (2026-05-15)

#### `src/utils/lineClassifier.ts` — 3-char all-uppercase name acceptance

`classifyLine()` now accepts a name candidate that is exactly 3 characters and all-uppercase (e.g. `YAK`, `TEA`, `COK`) when a price is present on the same line. This recovers items that Costco barcode stripping leaves as 3-char abbreviations.

Guard: `TAX`, `VAT`, `GST`, `HST` etc. are caught by `TAX_RE` earlier in the classifier and never reach the name acceptance check.

```typescript
const is3CharUpperWithPrice =
  price !== null &&
  rawNameCandidate !== null &&
  /^[A-Z]{3}$/.test(rawNameCandidate.trim());
```

#### `.gitignore` — Added large artifact exclusions

Added `*.traineddata` and `benchmark-results.json`. Uncached `eng.traineddata` (~15 MB) and `benchmark-results.json` from git index with `git rm --cached`.

#### Stage 11 results (2026-05-15)

| ID | Verdict | Score | Items% | Total% | Delta |
|----|---------|-------|--------|--------|-------|
| receipt_001 | PASS | **79** | 86% | 100% | **▲+6** (Yakisoba recovered as "Yak") |
| receipt_002 | WARN | 45 | 0% | 100% | — |
| receipt_003 | FAIL | 25 | 0% | 0% | — |
| receipt_004 | PASS | 77 | 56% | 96% | — |
| receipt_005 | PASS | 100 | 100% | 100% | — |
| receipt_006 | PASS | 85 | 100% | 100% | — |
| receipt_007 | WARN | 45 | 0% | 100% | — |
| receipt_008 | PASS | 78 | 82% | 99% | — |
| receipt_009 | PASS | 85 | 100% | 100% | — |
| receipt_010 | PASS | 78 | 83% | 100% | — |
| receipt_011 | FAIL | 33 | 20% | 23% | — |
| receipt_012 | FAIL | 25 | 0% | 0% | — |

**Overall: 63/100 — 7 PASS · 2 WARN · 3 FAIL**

receipt_001 now finds 6/7 items (KS Wheat Bread still missing — barcode OCR failure, no price in output).

#### Pending (Stage 11 Task 2 — not implemented)

Right-edge padding retry: browser-only OCR rescue pass when `orphanedNameLines ≥ 3 AND completenessRatio < 0.70`. Canvas extended +50px right (white padding). Would not improve cached benchmark without `--fresh`. Deferred until browser testing session.

---

## What changed in this pass (history)

### Stage 9 — Discount line handling + crop/glare diagnostics + completeness estimation

**Updated: `src/utils/lineClassifier.ts`**

Added `'discount'` to `LineClass`. New `DISCOUNT_LINE_RE` patterns detect explicit savings/coupon entries that carry a price amount:

| Pattern | Example |
|---------|---------|
| `instant savings` | `Instant Savings  2.00` |
| `club (card) savings` | `Club Card Savings  1.50` |
| `member (card) savings` | `Member Savings  0.75` |
| `digital coupon` | `Digital Coupon  0.50` |
| `manufacturers coupon` | `Manufacturer Coupon  1.00` |
| `store coupon` | `Store Coupon  0.50` |
| `loyalty (savings\|discount)` | `Loyalty Discount  1.25` |

The check fires BEFORE `NOISE_RE` and only when a price is present. Informational messages like "You saved $2.00 today!" (price embedded mid-sentence, no column alignment) are NOT reclassified — they fall through to `NOISE_RE` as before.

**Updated: `src/utils/receiptInterpreter.ts`**

- New Pass 1b: collects `discount` lines → `discountSum` and `discountLineCount`.
- Mismatch calculation updated: compares `adjustedItemSum = max(0, itemSum − discountSum)` to `detectedTotal`, eliminating false mismatch alarms caused by large loyalty-card discounts (e.g. 30%+ savings club).
- `gapRatio` (used for `isIncomplete`) also uses `adjustedItemSum`.
- `InterpretedReceipt` exports two new fields: `discountSum`, `discountLineCount`.

**Updated: `src/utils/receiptParser.ts`**

`ParseResult` gains `discountSum: number` and `discountLineCount: number`, passed through from `interpretReceipt`.

**Updated: `src/utils/scanDiagnostics.ts`**

Four new `ScanDiagnostic` fields:

| Field | Source | Meaning |
|-------|--------|---------|
| `orphanedNameLines` | `classifyLines` | name-only lines in the item region with no following price line; ≥3 suggests right-crop or glare |
| `discountLineCount` | `ParseResult` | count of detected discount entries |
| `discountSum` | `ParseResult` | total discount amount detected |
| `completenessRatio` | computed | `(itemSum − discountSum) / total`, clamped 0–1 |

`orphanedNameLines` counting:
- Only starts after the first priced line (excludes store name, address, header)
- A name-only line is orphaned when the immediately following classified line is NOT `price_only` or `item`
- Eliminates false positives from receipt headers that naturally have no prices

`getScanExplanation` `partial` case is now context-aware:
- If `discountLineCount > 0`: shows detected discount amount ("$X.XX in detected discounts reduces the receipt total")
- If `orphanedNameLines ≥ 2`: explains that some item prices are missing and suggests checking crop/glare
- If `completenessRatio < 0.90`: shows estimated coverage percentage ("~X% of total — re-scan may capture the rest")

**No benchmark regressions:** 100/100, 6/6 PASS maintained.

---

## What changed in this pass (history)

### Stage 8 — Scan quality diagnostics + user-facing failure explanations

**New: `src/utils/scanDiagnostics.ts`**

Analyses OCR text and parse output to classify why a scan succeeded or failed.

`ScanFailureMode` union:

| Mode | Condition | Trigger |
|------|-----------|---------|
| `good` | items found, no mismatch/incomplete | Normal happy path |
| `partial` | items found but `mismatch \|\| isIncomplete` | Totals diverge — discounts, tax, or image quality |
| `blurry` | items=0, letterRatio≥0.30, priceLines>0 | OCR found prices but names too garbled to match |
| `rotated` | items=0, letterRatio<0.30 | Almost no coherent words → image likely sideways |
| `format-unsupported` | items=0, letterRatio≥0.30, priceLines=0 | Readable text but no prices → wrong document type |
| `empty` | charCount<40 | OCR produced virtually nothing |

`ScanDiagnostic` fields: `mode`, `charCount`, `priceLineCount`, `letterRatio`, `hasTotalLine`, `itemCount`.

`getScanExplanation(diag)` returns `{ heading, detail, tips[] }` tailored to each mode.

**Updated: `src/components/ReceiptUploader.tsx`**

- Removed `OcrQuality = 'good' | 'low' | 'empty'` and `assessQuality()`.
- Added `diagnostic: ScanDiagnostic | null` state; populated via `classifyFailureMode()`.
- Error states (`empty`, `blurry`, `rotated`, `format-unsupported`): render the specific
  `getScanExplanation()` heading, detail, and tips list instead of the old generic messages.
- Warning states (`partial`): existing `isIncomplete` and `mismatch` banners gain a
  "Possible reasons:" section pulled from `getScanExplanation()` tips — covers discounts,
  tax lines, and image quality as common causes.
- `handleRawTextChange` re-runs `classifyFailureMode` on each edit, so quality re-classifies
  live as the user corrects OCR text.

**Before / after comparison for error messages:**

| Scenario | Before | After |
|----------|--------|-------|
| Rotated photo | "No item lines found" | "Receipt may be sideways — rotate to portrait mode" |
| Blurry photo with some prices | "No item lines found" | "Image quality too low — clean lens, tap to focus" |
| Non-receipt image | "No item lines found" | "Format not supported — only single-column grocery receipts" |
| No text at all | "No text detected" | "No text detected — brighter light, steady hold, full frame" |
| Mismatch/incomplete | "Some items may have been missed" | Keeps dollar amounts + adds "Possible reasons: discounts, tax…" |

**No benchmark regressions:** 100/100, 6/6 PASS maintained.

---

## What changed in this pass (history)

### Stage 1 — Benchmark system (`scripts/benchmark.ts`, `package.json`)

- Created `scripts/benchmark.ts`: runs all 6 fixtures through the full parsing pipeline,
  scores each on item count (40%), total accuracy (25%), noise leakage (20%), and flag
  correctness (15%), prints a color-coded PASS/WARN/FAIL table, saves results to
  `benchmark-results.json` (up to 20 runs), and compares current vs previous run.
- Added `"benchmark": "npx --yes tsx scripts/benchmark.ts"` to `package.json`.
- Baseline before this pass: 96/100 overall (noisy=94, blurry=81; both issues traced to
  classifier bugs rather than pipeline bugs).

---

### Stage 2 — Line classifier fixes (`src/utils/lineClassifier.ts`)

**Bug: TRAILING_ARTIFACT_RE stripped valid unit abbreviations**
- `stripTrailingArtifact()` was removing "LB", "OZ", "GAL" from names like
  "CHICKEN BREAST 2 LB" → "CHICKEN BREAST 2".
- Fix: added `UNIT_TOKENS` set; `stripTrailingArtifact()` now skips stripping when the
  captured token is a known unit. Same unit-awareness applied to `hasTrailingArtifact`.

**Bug: OCR-garbled SUBTOTAL leaking as an item (critical)**
- "SUBTOTAI" (OCR garble of SUBTOTAL) didn't match any existing SUBTOTAL pattern, so it
  was classified as an item with price $43.69, corrupting the total to $75.92.
- Fix: added `/\bsubtot[a-z]{0,3}\b/i` fuzzy pattern to `SUBTOTAL_RE`. Now catches
  SUBTOTAI, SUBTOTL, SUBTOTA, and any other 0-3 letter suffix.

**Bug: "You saved $2.00 today!" leaking as an item (noisy receipt)**
- "saved" wasn't in `NOISE_RE`, so discount messages like "You saved $2.00 today!" and
  "Saved $1.50 with club card" were classified as items.
- Fix: added `/\byou\s+saved\b/i` and `/\bsaved\s/i` to `NOISE_RE`.

**Bug: `*** SAFEWAY CLUB CARD SAVINGS ***` not filtered as structural noise**
- Lines starting with three or more stars weren't matched by `STRUCTURAL_RE`.
- Fix: added `/^\*{3,}/` to `STRUCTURAL_RE`.

After these fixes: noisy-receipt 94→100, blurry-receipt 81→79 (benchmark expectations
needed updating because SUBTOTAI now correctly becomes the detected total at $43.69).

**Benchmark fixture expectations updated:**
- `blurry-receipt`: `expectedItemCount: 7` (was 6), `expectIncomplete: false` (was true),
  `expectMismatch: true` (was false). SUBTOTAI is now the detected total; the 3 items with
  unparseable prices (3.9B, 2.4Q, 499) remain absent. Score: 79→100.

Overall: **96→100/100** after all fixes.

---

### Stage 3 — OCR preprocessing (`src/utils/imagePreprocess.ts`, `src/utils/ocr.ts`)

**New preprocessing modes in `imagePreprocess.ts`:**

| Mode | What it does | Use case |
|------|-------------|----------|
| `clahe` | Block-wise CLAHE (8×8 tiles, clip factor 3.0) + unsharp mask | Receipts with glare, shadows, or uneven lighting |
| `rotate90` | 90° CW rotation + standard grayscale | Landscape phone photo, tilted left |
| `rotate270` | 270° CW rotation + standard grayscale | Landscape phone photo, tilted right |

CLAHE implementation details:
- Divides image into 8×8 grid of tiles
- Each tile: clip histogram at `clipFactor × tilePixels / 256`, redistribute excess
- Build CDF-based LUT per tile
- Apply bilinear interpolation between tile LUTs (centre-of-tile alignment) to eliminate
  block boundary artifacts

Rotation implementation:
- Builds a new canvas with swapped dimensions
- Applies affine rotation + scaling in one `drawImage` call
- Then applies standard grayscale/contrast preprocessing

**Updated `ocrResultStrength()` in `ocr.ts`:**
- Added structural bonus: +0.10 when a TOTAL or SUBTOTAL line is detected
- Adjusted weights: char 0.25→0.22, price 0.55→0.52, letter ratio 0.20→0.16
- Max score capped at 1.0 (unchanged)

**Expanded multi-pass OCR in `ocr.ts`:**
Previous: 4 passes (PSM6 standard, PSM4, sharp+PSM6, adaptive+PSM4)
New: 7 passes with reallocated progress range:

| Pass | Mode | PSM | Progress | Fires when |
|------|------|-----|----------|------------|
| 1 | standard | 6 | 0–50% | always |
| 2 | standard | 4 | 50–63% | strength < 0.45 |
| 3 | sharp | 6 | 63–73% | strength < 0.45 after pass 2 |
| 4 | adaptive | 4 | 73–82% | strength < 0.45 after pass 3 |
| 5 | clahe | 6 | 82–88% | strength < 0.45 after pass 4 |
| 6 | rotate90 | 6 | 88–93% | strength < 0.45 after pass 5 |
| 7 | rotate270 | 6 | 93–99% | strength < 0.45 after pass 6 |

Each pass only fires if the current best result is still below `STRENGTH_ACCEPTABLE = 0.45`.
For typical well-lit receipts, pass 1 succeeds immediately. The extra passes are zero-cost
for good captures.

---

### Stage 4 — Interpretation quality (`src/utils/receiptInterpreter.ts`)

**New: `name_only + item` merge pattern**

Previously, two-line items where the second line had an embedded size description AND a
price (classified as `item` rather than `price_only`) were handled incorrectly:
- Line 1: "Applegate Farms Turkey" → `name_only`
- Line 2: "  Breast Deli 7oz   6.49" → `item` (has name candidate + price)

Old behavior: Line 1 was skipped; "Breast Deli 7oz" became the item name.
New behavior: Line 1's product name is used with line 2's price → "Applegate Farms Turkey"
at $6.49. This is the more useful display name.

The merge produces `isMerged: true`, which gives a +0.10 confidence bonus.

---

### Stage 5 — Name normalization (`src/utils/nameNormalizer.ts`)

Added ~40 abbreviation entries covering common OCR garble patterns seen in real receipts:

- **Protein:** CHCKN, CHCKNN (Chicken variants), TKY (Turkey), BCN (Bacon), SSTG/SAUS
  (Sausage), HMBRG (Hamburger), FILT/FLTD (Fillet)
- **Dairy:** CHSE (Cheese), CHDDR (Cheddar garble), CHCKN→Chicken
- **Produce:** BNNNS/BNNS/BNNNAS (Bananas), CRRT/CRRTS (Carrot/s), ONON/ONNON (Onion),
  GRLC (Garlic), PPR/PPRS/BLKPPR (Pepper), LTTCE/LTCE (Lettuce), SPNCH (Spinach),
  MSHRM/MSHRMS (Mushroom/s), TMTO/TMT/TMTOS (Tomato/es), PTTO/PTTOES/PTTOS
  (Potato/es), YLLW/YLW (Yellow), GRN (Green)
- **Pantry/beverages:** PSTA (Pasta), SPGHTTI/SPGHT/SPGHTI (Spaghetti), LSNG (Lasagna),
  SCE/SUCE (Sauce), COFF/COF (Coffee), WHT (White), CLNTRO (Cilantro), PRSRV/JLLY
  (Preserves/Jelly), HMMUS (Hummus), SLSA (Salsa), GUCMLE (Guacamole)
- **Additional produce qualifier:** YLLW (Yellow), BRSLSPRTS (Brussels Sprouts),
  STRWBRY (Strawberry), BLBRRS (Blueberries), WTRMLNN (Watermelon garble)

---

### Stage 6 — Fuzzy name expansion + PSM 11 OCR pass (`src/utils/nameNormalizer.ts`, `src/utils/ocr.ts`)

**Fuzzy abbreviation lookup (`nameNormalizer.ts`)**

Previously `expandAbbreviations` only did exact ABBREV_MAP lookups. Novel OCR garbles
(e.g. "CHCKM" for "CHCKN", "SPRCH" for "SPNCH") were passed through unchanged.

New behaviour:
- `ABBREV_KEYS` pre-computed at module load (avoids `Object.keys` per token).
- `isEditDistance1(a, b)` — O(|a|+|b|) check covering substitution, insertion, and deletion.
- `expandToken(token)` — exact match first; if no match and token length ≥ 5, scans all
  ABBREV_MAP keys for a unique edit-distance-1 neighbour. Ambiguous matches fall back to
  the original token (safe).
- Minimum length 5 guard eliminates false positives from common 4-letter English words
  that happen to be 1 edit away from an ABBREV_MAP key (e.g. BEST→BRST, FISH→FRSH,
  GOLD→GRLD, FARM→PARM, CART→CRRT, STEW→STRW).

**PSM 11 as 8th OCR pass (`ocr.ts`)**

Added pass 8 after rotation passes:
- Mode: PSM 11 ("sparse text — find as much text as possible in no particular order").
- Uses the already-preprocessed `src1` image (no extra canvas work).
- Progress window: 97–99% (pass 7 trimmed from scale=6 to scale=4 to make room).
- Pass 7 now correctly updates `bestStrength` (was updating only `bestText`).
- Added early-return after pass 7 so pass 8 only fires when strength < 0.45.
- PSM 11 helps two-column layouts where PSM 6/4 force a single-column reading order.
  Zero cost for normal single-column receipts (only fires if all 7 prior passes failed).

---

### Stage 7 — Robustness benchmark + price resilience fix

**New: `scripts/robustness-benchmark.ts` (`npm run robustness`)**

Applies 6 text-level distortions (simulating image defects) to all 6 fixtures and
measures how much the parser degrades under each one.

| Distortion | Simulation | Before | After |
|-----------|-----------|--------|-------|
| blur | 9% char confusables + 18% decimal drops | 92% | 99% |
| glare | right-side span erasure on 30% of lines | 79% | 79% |
| right-crop | 5–9 chars cut from line ends | 43% | 43% |
| low-contrast | 9% char drops + 22% decimal drops + 10% digit-run drops | 69% | 88% |
| perspective | extra leading indent + space compression | 100% | 100% |
| rotation | 18% adjacent line merge | 94% | 94% |
| **Overall** | | **80%** | **84%** |

**Root cause and fix (`src/utils/lineClassifier.ts`)**

Two related price-parsing failures under blur/low-contrast:

1. **1-digit truncation** (blur confuses last decimal digit: `3.98` → `3.9B`):
   - `PRICE_RE_GLOBAL` extended from `\d{2}` to `\d{1,2}` decimal digits.
   - `3.9B` → regex matches `3.9` → price $3.90 (off by ≤$0.09, within mismatch tolerance).

2. **Decimal drop** (low-contrast causes `.` to vanish: `3.98` → `3 98`):
   - Secondary fallback in `extractLastPrice`: pattern `\s{3,}(\d{1,3})\s(\d{2})\s*[A-Za-z]{0,3}$`
   - Requires ≥3 leading spaces to anchor to the price column (not quantity tokens like "2 LB").
   - `3 98` after multiple spaces → $3.98.

3. **Name candidate stripping** updated to match both fixes:
   - Price strip regex extended to `\d{1,2}` decimal digits.
   - Added end-of-line dropped-decimal strip.

**Benchmark fixture update (blurry-receipt)**:
- `expectedItemCount: 7 → 9`: `3.9B` → $3.90 and `2.4Q` → $2.40 now both detected.
- `expectMismatch: true → false`: item sum $38.53 vs total $47.10 = 18% gap (< 25% threshold).
- The TOTAL line `47.1B` now parses as $47.10, replacing SUBTOTAI as the detected total.
- `minItemCount: 5 → 7`, `maxItemCount: 10 → 11`.

**No regression**: all other 5 fixtures score 100/100 unchanged.

---

## Benchmark history (key milestones)

| Run | Score | Notes |
|-----|-------|-------|
| Baseline | 96/100 | Before Stage 1 |
| After classifier fixes | 100/100 | SUBTOTAI + "You saved" bugs fixed |
| After OCR + quality pass | 100/100 | No regressions; name quality improved |
| After Stage 6 | 100/100 | No regressions; fuzzy expansion + PSM 11 added |
| After Stage 7 | 100/100 | No regressions; blurry-receipt gains 2 items (7→9) |
| After Stage 9 | 100/100 | No regressions; discount handling + diagnostics added |
| After Stage 10 | 100/100 | No regressions; international receipt support added |
| After Stage 12 | 100/100 | No regressions; merge guard + diagnostic fixes |

## Robustness history

| Run | Overall | Blur | Low-contrast | Glare | Rotation | Right-crop | Perspective |
|-----|---------|------|--------------|-------|----------|------------|-------------|
| Before Stage 7 | 80% | 92% | 69% | 79% | 94% | 43% | 100% |
| After Stage 7 | 84% | 99% | 88% | 79% | 94% | 43% | 100% |
| After Stage 9 | 84% | 99% | 88% | 79% | 94% | 43% | 100% |
| After Stage 10 | 84% | 99% | 88% | 79% | 94% | 43% | 100% |
| After Stage 12 | 84% | 99% | 88% | 79% | 94% | 43% | 100% |

---

## What remains weak

1. **Right-crop** (43% robust) — 5–9 char cuts systematically destroy prices under $10
   because prices are only 4 chars (`3.98`). This requires image-level preprocessing:
   receipt-boundary detection or perspective correction before OCR. Parser-level fix would
   require guessing truncated prices from partial data (high false-positive risk).
   Stage 12 crops/glare diagnostic now only fires when `completenessRatio < 0.70`, reducing
   false positives; but lost prices are still not recovered.

2. **Glare** (79% robust) — random patches erase 4–12 chars; when the patch hits the price
   column, the price is gone entirely. The secondary fallback doesn't help because no
   partial digits remain. Improvement would require OCR-level inpainting or additional CLAHE
   passes targeting the glare region.

3. **Thermal garble** (receipts 007, 011) — thermal receipts with blotchy ink produce lines
   where prices are missing entirely or reduced to a single digit with no decimal. The
   parser has no way to recover a price from `9 F` without knowing the original format.
   OCR-level preprocessing targeted at thermal receipt contrast would help.

4. **Case B merge edge case** — the "prev-was-name_only" guard now correctly blocks the
   bad merge in receipt_007. However, if a genuine 2-line receipt format has a garbled
   line immediately before the product-descriptor+price line, the guard would incorrectly
   block the merge. This edge case hasn't appeared in the current 12-receipt dataset.

5. **Discount coverage** ✅ *Partially addressed in Stage 9* — `DISCOUNT_LINE_RE` covers seven
   common patterns. Remaining gap: bare coupon lines (`COUPON -0.50` without a label keyword),
   percentage-off discounts (`10% MEMBER DISCOUNT`), and multi-line discount entries.

6. **Category confidence** — items with 0 keyword hits fall back to the merchant default.
   A receipts-specific embedding classifier would improve accuracy for unusual product names.

7. **Duplicate ocrStrength** — the `ocrStrength` function exists in both `real-benchmark.ts`
   (local) and `src/utils/ocr.ts` (as `ocrResultStrength`). They use slightly different
   weights. Low risk but clean-up would improve maintainability.

---

## Files changed across all stages

| File | Change |
|------|--------|
| `scripts/benchmark.ts` | Created — benchmark runner; blurry expectations updated in Stage 7 |
| `scripts/robustness-benchmark.ts` | Created in Stage 7 — 6-distortion robustness runner |
| `package.json` | Added `benchmark`, `real-benchmark`, `robustness` scripts |
| `src/utils/lineClassifier.ts` | Unit-aware artifact stripping, fuzzy SUBTOTAL, noise fixes; Stage 7: 1-decimal price extension + dropped-decimal fallback; Stage 9: `discount` LineClass + `DISCOUNT_LINE_RE` |
| `src/utils/imagePreprocess.ts` | Added CLAHE, rotate90, rotate270 modes |
| `src/utils/ocr.ts` | 8-pass strategy (added PSM 11), improved strength scorer, pass 7 strength fix |
| `src/utils/receiptInterpreter.ts` | name_only + item merge pattern; Stage 9: discount sum collection + adjusted mismatch calculation |
| `src/utils/receiptParser.ts` | Stage 9: `discountSum` + `discountLineCount` in ParseResult; Stage 10: international comma-decimal normalization (CZK, EUR) |
| `src/utils/nameNormalizer.ts` | +40 abbreviation entries; fuzzy edit-distance-1 expansion |
| `src/utils/scanDiagnostics.ts` | Created in Stage 8; Stage 9: orphanedNameLines, discountSum, discountLineCount, completenessRatio + context-aware partial explanation |
| `src/components/ReceiptUploader.tsx` | Stage 8: replaced OcrQuality with ScanDiagnostic; mode-specific error UI |
| `src/utils/lineClassifier.ts` | Stage 10: `CELKEM`/`GESAMT`/`SUMME` added to `TOTAL_RE`; `ZLEVNENO` added to `NOISE_RE` |
| `src/utils/receiptInterpreter.ts` | Stage 10: preceding `price_only` fallback for split total lines; Stage 12: Case B merge "prev-was-name_only" guard |
| `images.def` | Created in Stage 10 — 12-entry image manifest |
| `eval/ground-truth.json` | Stage 10: extended to 12 entries (001-012); count-only GT for 008-012 |
| `scripts/real-benchmark.ts` | Created in Stage 10 — real-image OCR benchmark with discrepancy table |
| `src/utils/scanDiagnostics.ts` | Stage 12: completenessRatio=0 for complete failures; getScanExplanation crop/glare threshold tightened to ≥3 AND completenessRatio < 0.70 |
| `RECEIPT_PIPELINE_STATE.md` | This file |

---

## Next steps to resume

Pick up from here in the next session. Ordered by expected impact.

Stage 12 is complete. Real benchmark at 64/100. The merge guard fix recovered 1/3 items on receipt_007; diagnostics are now more accurate on complete failures and multi-line format receipts. Remaining failures are OCR/image-quality issues not fixable at the parser level.

### High priority

**A. ~~Refine orphanedNameLines signal~~** ✅ DONE in Stage 12
- Fixed: threshold is now `orphanedNameLines ≥ 3 AND completenessRatio < 0.70`.
- Fixed: `completenessRatio = 0` for complete failures (was returning 1 incorrectly).

**B. Expand discount pattern coverage** (`src/utils/lineClassifier.ts`)
- Add bare `coupon` + `discount` patterns when the price has a leading `-` sign (negative-indicating format)
  - Detect negative amounts: extend `extractLastPrice` or add a separate `extractNegativePrice` for lines where the number is preceded by `-` or `(` / followed by `-`
  - E.g., `COUPON -0.50`, `MEMBER DISCOUNT (1.25)`, `BOGO -3.99`
- Add percentage-off discount lines: `10% MEMBER DISCOUNT  -4.70` (currently noise)
- Add `discountLines: string[]` to `InterpretedReceipt` so the UI can list what was deducted

**C. Surface `completenessRatio` in the UI** (`src/components/ReceiptUploader.tsx`)
- The `partial` banner currently shows tips from `getScanExplanation`. Add a visual completeness
  bar (e.g., a thin progress bar `XX% of total captured`) beneath the mismatch/incomplete banner
  when `diagnostic.completenessRatio < 0.90`
- Low-cost change — `completenessRatio` is already in `ScanDiagnostic`

### Medium priority

**D. Right-crop image detection** (`src/utils/imagePreprocess.ts` + `src/utils/ocr.ts`)
- Detect whether the captured canvas is wider than it is tall (landscape mode) before OCR
- If so, apply horizontal padding on the right (or just run a perspective-crop detection pass)
- Right-crop affects 43% robustness; this is the weakest failure mode by score
- Approach: after the first OCR pass, if `orphanedNameLines ≥ 3` AND `completenessRatio < 0.70`, trigger
  a re-OCR with a 5% right-edge expansion (pad canvas width, re-draw, re-run OCR)

**E. Glare inpainting** (`src/utils/imagePreprocess.ts`)
- Detect bright horizontal bands (pixel luminance > 240 across ≥50% of row width) in the canvas
- Fill detected glare bands using nearest-neighbour inpainting (copy pixel values from
  adjacent non-glare rows) before the CLAHE pass
- Glare affects 79% robustness; this is the second weakest mode

**F. Bare coupon line classifier** (`src/utils/lineClassifier.ts`)
- Lines that start with a `-` and contain a price and NO other text (e.g., `  -1.50`) should be
  classified as `discount` — currently fall through to `noise` or `price_only`
- Requires regex change: check if the FIRST non-space char is `-` and a price follows

### Low priority

**G. Category confidence via embedding lookup**
- Items with zero keyword matches fall back to the merchant default category
- Consider a lightweight bag-of-words cosine similarity against a per-category word list
  (no external API required) to improve classification for unusual product names

**H. Multi-receipt session** — the app currently processes one receipt at a time
- `useReceipts.ts` already stores a receipts array; the Dashboard shows it
- Add a "scan another receipt" flow that accumulates items across multiple scans

### How to resume

1. Read this file first (you are here).
2. Run `npm run benchmark` to confirm 100/100 baseline before making any changes.
3. Run `npm run robustness` if changing parsing logic — check glare/right-crop scores.
4. After each change: `npx tsc --noEmit` + `npm run benchmark`.
5. Update this file's "What changed in this pass" section and checkpoint fields.

---

## Audit — 2026-05-15

### Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| MVP readiness | 5/10 | Works for clean receipts; fails ~40% of real photos |
| OCR reliability | 4/10 | Fails on JFIF, thermal, glare, crop, non-English |
| Parser reliability | 7/10 | Solid for standard formats; barcode prefix and 3+-line items unhandled |
| Robustness | 4/10 | right-crop 43%, glare 79% — two most common real defects both near-broken |
| Code quality | 6/10 | Clean architecture, no tests, big committed binary, duplicate ocrStrength |

### Honest failure summary (real receipts)

| Receipt | Failure mode | Root cause | Fixable? |
|---------|-------------|-----------|---------|
| receipt_001 | 2/7 items missed | Barcode prefix corrupts name candidate | **Yes — parser** |
| receipt_003 | 0/16 items, 0% total | JFIF image unreadable (OCR strength 0.36) | No — image layer |
| receipt_004 | 3/9 items missed | Barcode prefix + 3-line items | **Partly — parser** |
| receipt_007 | 0/3 items | Thermal garble — names don't pass confidence filter | Partly — OCR |
| receipt_011 | ~1/7 items, 77% total error | Thermal garble — prices not aligned | Partly — OCR |
| receipt_012 | 0/11 items | Japanese text, English Tesseract | No — model layer |

### Top 5 next actions (ordered by ROI)

1. **Strip barcode prefixes** in `lineClassifier.ts` `extractNameCandidate()` — affects receipts 001, 004, 008 immediately
2. **Add item-level GT** for receipts 008, 009, 011 — exposes hidden failures currently masked by "PASS" scores
3. **Right-crop canvas padding** — retry OCR with padded right edge when orphanedNameLines ≥ 3 AND completenessRatio < 0.70
4. **Unify `ocrResultStrength`** — remove duplicate between `ocr.ts` and `real-benchmark.ts`
5. **Gitignore `benchmark-results.json`; remove `eng.traineddata` from git** — repo hygiene

### Known blind spots in benchmark

- 100/100 mock benchmark is fully overfit — means nothing for real photos
- receipt_008/009/010 score "PASS" with count-only GT; item extraction may be poor
- `orphanedNameLines` false-positives on Costco multi-line format (12–17 per receipt) even when parsing is correct
- `completenessRatio = 100%` when both itemSum and total are 0 — false "all good" on complete failures
