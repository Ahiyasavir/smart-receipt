/**
 * textSanitize — the single canonical pre-parse normalizer.
 *
 * Every channel (email ingestion frontend, inbound webhook twin, OCR line
 * handling) must sanitize through the SAME deterministic steps before
 * pattern-matching, so behaviour can't drift between them. No AI, no network,
 * no guessing — pure string normalization.
 *
 * Order matters:
 *   1. Unicode NFC            (compose look-alike sequences)
 *   2. strip BiDi / zero-width control marks (RTL Hebrew artifacts)
 *   3. decode common HTML entities
 *   4. normalize exotic whitespace (NBSP, tabs, NBSP variants)
 *   5. repair broken line wraps  ("PAZ\nGAS" → "PAZ GAS")
 *   6. collapse runs of whitespace
 */

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#34;': '"',
  '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
  '&shy;': '', '&zwnj;': '', '&zwj;': '', '&lrm;': '', '&rlm;': '',
};

// BiDi controls, zero-width, BOM. Explicit escapes (no literal invisibles).
const INVISIBLE_RE =
  /[\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Whitespace that isn't a normal space/newline (NBSP, narrow-NBSP, tabs…).
const EXOTIC_WS_RE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000\t\f\v]/g;

export function sanitizeText(raw: unknown): string {
  if (raw == null) return '';
  let s = String(raw);

  // 1. Unicode normalize (guarded — older runtimes may lack it).
  try { s = s.normalize('NFC'); } catch { /* keep as-is */ }

  // 2. Strip BiDi / zero-width / soft-hyphen.
  s = s.replace(INVISIBLE_RE, '');

  // 3. HTML entities (named + numeric).
  s = s.replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => {
    if (m in HTML_ENTITIES) return HTML_ENTITIES[m];
    const num = /^&#(\d+);$/.exec(m);
    if (num) {
      const code = Number(num[1]);
      if (code > 0 && code < 0x10ffff) {
        try { return String.fromCodePoint(code); } catch { return ' '; }
      }
    }
    return ' ';
  });

  // 4. Exotic whitespace → plain space.
  s = s.replace(EXOTIC_WS_RE, ' ');

  // 5. Repair broken single-line-wraps: a newline between two word chars
  //    becomes a space (handles "STORE\nNAME"); keep paragraph breaks readable
  //    by also collapsing in step 6 anyway.
  s = s.replace(/([^\s])\r?\n([^\s])/g, '$1 $2');

  // 6. Collapse all remaining whitespace.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/** Deterministic reason codes for a failed/empty parse (observability). */
export type ParseFailReason =
  | 'empty_body'
  | 'no_pattern_match'
  | 'invalid_amount'
  | 'invalid_date';

export interface ParseDiagnostic {
  ok: boolean;
  reason?: ParseFailReason;
  /** Sanitized length — cheap signal of garbled vs absent input. */
  sanitizedLength: number;
}
