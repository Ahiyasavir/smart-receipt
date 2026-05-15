---
name: project-receipt-scanner
description: Receipt scanner pipeline project state — benchmarks, robustness scores, current weaknesses, and next steps
metadata:
  type: project
---

Pipeline is at Stage 7. Authoritative checkpoint is RECEIPT_PIPELINE_STATE.md.

**Current scores (2026-05-14):**
- Main benchmark: 100/100 — 6/6 PASS
- Overall robustness: 84% (up from 80% before Stage 7)

**Robustness by distortion type:**
- blur: 99% (fixed Stage 7 — 1-decimal price extension recovers `3.9B` → $3.90)
- low-contrast: 88% (fixed Stage 7 — dropped-decimal fallback recovers `3 98` → $3.98)
- glare: 79% (unfixed — image-level problem, patches erase prices entirely)
- rotation: 94% (unfixed — minor line merge losses)
- right-crop: 43% (unfixed — prices under $10 are 4 chars, 5+ char cut destroys them)
- perspective: 100% (not a parser problem)

**Weakest remaining failure mode:** right-crop (43%) — requires image-level receipt boundary detection, not a parser fix. Attempting to fix at parser level risks false positives.

**Stage 7 parser changes (lineClassifier.ts):**
1. `PRICE_RE_GLOBAL` extended from `\d{2}` to `\d{1,2}` — accepts 1-decimal prices
2. Secondary fallback: `\s{3,}(\d{1,3})\s(\d{2})\s*[A-Za-z]{0,3}$` — recovers dropped decimal
3. Name-candidate stripping updated to match both new patterns

**Blurry fixture now detects 9 items** (was 7): `3.9B` → $3.90, `2.4Q` → $2.40 recovered.

**Why:** No regressions on clean fixtures (all prices are 2-decimal, extensions never fire).

**Next best step:** Glare robustness (79%) — could add CLAHE pass specifically for high-brightness regions. Alternatively, document right-crop as a known image-capture issue and add UI guidance to users to frame the receipt fully.

**Rules (per user):** No Hebrew, no backend/auth/Firebase/payments/social. Keep app buildable. Update RECEIPT_PIPELINE_STATE.md after each major step. Stay focused on pipeline/benchmark/robustness only.
