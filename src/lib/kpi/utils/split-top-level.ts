/**
 * Shared quote-aware top-level splitter for the KPI filter DSL and the
 * custom-formula parser.
 *
 * Consolidates three previously duplicated character-loop implementations:
 *  1. the IN-list comma parser inside applyFilter()      (engine-utils.ts)
 *  2. splitByTopLevelOperator() for AND / OR              (engine-utils.ts)
 *  3. splitTopLevelKeyword() for WHERE / OF               (custom-formula.ts)
 *
 * The loop mechanics are identical across all three (single/double quotes,
 * backslash-escape check, no parenthesis/depth tracking); the variants differ
 * only in how the delimiter is matched, whether quote characters are kept in
 * the output, how segments are transformed, and when the trailing segment is
 * emitted. Those differences are expressed via options — they are deliberately
 * preserved, not unified, because the filter DSL and the formula parser are
 * security-adjacent and any behavior drift is unacceptable.
 *
 * Pure and dependency-free.
 */

export interface SplitTopLevelOptions {
  /**
   * Match the delimiter case-insensitively against the input.
   * The keyword splitters (AND / OR / WHERE / OF) do; the IN-list comma
   * splitter does not need to (the comma has no case).
   * Default: false.
   */
  caseInsensitive?: boolean;

  /**
   * Keep quote characters in the emitted parts.
   * - false (default): opening/closing quotes are consumed but not emitted —
   *   the IN-list parser strips them so values compare cleanly.
   * - true: quote characters are copied into the parts verbatim — the
   *   operator/keyword splitters preserve them so each part stays a valid
   *   sub-expression for recursive parsing.
   */
  keepQuotes?: boolean;

  /**
   * Transform applied to every emitted part (the segment, trimmed first).
   * - undefined (default): identity — operator/keyword splitters emit
   *   trimmed parts verbatim.
   * - IN-list parsing passes `s => s.toLowerCase()` to normalize values.
   */
  transform?: (part: string) => string;

  /**
   * Emit the trailing segment even when empty (after trimming).
   * - false (default): an empty/whitespace-only trailing segment is dropped,
   *   and empty input yields []. Matches applyFilter's IN-list parser
   *   (`if (current.trim())`) and splitByTopLevelOperator (`if (current)`):
   *   the two guards are observably identical because parts are trimmed on
   *   push — a whitespace-only tail trims to '' either way.
   * - true: the trailing segment is always emitted, so empty input yields
   *   [''] and there is always at least one part. Matches
   *   splitTopLevelKeyword, whose callers rely on `parts[1] || 'true'`.
   */
  keepEmptyTrailing?: boolean;
}

/**
 * Split `input` on every occurrence of `delimiter` that lies outside quotes.
 *
 * Quote mechanics (identical in all three original copies):
 *  - `"` and `'` open a quoted region when not already inside one.
 *  - Inside a region, only the matching quote character closes it; the other
 *    quote kind is treated as content.
 *  - A quote character preceded by a backslash is literal content — it never
 *    opens or closes a region (same escape rule in all three copies).
 *  - An unclosed quote simply keeps the region open to the end of the input.
 *
 * @param input     the text to split
 * @param delimiter the literal delimiter; keyword callers pass the
 *                  space-padded word (e.g. ' AND ') so matches are
 *                  word-bounded and e.g. "FAND" never splits on "AND"
 * @param options   variant behavior, see SplitTopLevelOptions
 */
export function splitTopLevel(
  input: string,
  delimiter: string,
  options: SplitTopLevelOptions = {}
): string[] {
  const { caseInsensitive = false, keepQuotes = false, transform, keepEmptyTrailing = false } = options;

  // Mirrors the original loops exactly, including the O(n²) substring match,
  // so multi-character delimiter behavior cannot drift.
  const matchesAt = (pos: number): boolean => {
    if (caseInsensitive) {
      return input.substring(pos).toUpperCase().startsWith(delimiter.toUpperCase());
    }
    return input.startsWith(delimiter, pos);
  };

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  const emit = (): void => {
    const part = transform ? transform(current.trim()) : current.trim();
    parts.push(part);
    current = '';
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    // Same escape rule as all three originals: a quote preceded by a
    // backslash is literal content, whether inside or outside a region.
    if ((char === '"' || char === "'") && (i === 0 || input[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        if (keepQuotes) current += char;
      } else if (char === quoteChar) {
        inQuotes = false;
        if (keepQuotes) current += char;
      } else {
        // The other quote kind inside a quoted region is content.
        current += char;
      }
      continue;
    }

    if (!inQuotes && matchesAt(i)) {
      emit();
      i += delimiter.length - 1; // the for-loop's i++ lands after the delimiter
      continue;
    }

    current += char;
  }

  // Trailing segment. splitTopLevelKeyword pushed unconditionally
  // (keepEmptyTrailing=true); the other two guarded on non-emptiness.
  // The guards were textually different — `current.trim()` in the IN-list
  // parser vs raw `current` in splitByTopLevelOperator — but observably
  // identical: every pushed part is trimmed, so a whitespace-only tail
  // yields '' under either guard.
  if (keepEmptyTrailing) {
    emit();
  } else if (keepQuotes ? current !== '' : current.trim() !== '') {
    emit();
  }

  return parts;
}
