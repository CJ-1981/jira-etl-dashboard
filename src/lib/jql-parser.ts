/**
 * Lightweight JQL context parser for autocomplete.
 *
 * Instead of brittle position-based token lookups, this walks the text before
 * the cursor with a small state machine that understands quoted strings,
 * nested parentheses, and multi-word operators (NOT IN, NOT CONTAINS, IS NOT).
 * It answers two questions the autocomplete needs:
 *
 *  1. Which field is the user currently typing a value for? (`field`)
 *  2. Is the cursor sitting right after an IN-family operator, where an
 *     opening parenthesis should be offered? (`afterInOperator`)
 *
 * The parser is intentionally lenient: it never throws, and on ambiguous input
 * it falls back to "no field context", which makes the autocomplete suggest
 * field names — a safe default.
 */

export interface JqlFieldContext {
  /** Lowercased field name when the cursor is in a value position, else null. */
  field: string | null;
  /** True when the last meaningful token is IN / NOT IN (offer `(` next). */
  afterInOperator: boolean;
}

type Token =
  | { type: 'word'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

const OPERATOR_CHARS = new Set(['=', '!', '<', '>', '~']);

const SINGLE_OPERATORS = new Set(['=', '==', '!=', '~', '!~', '>', '<', '>=', '<=']);

const KEYWORD_OPERATORS = new Set([
  'IN',
  'CONTAINS',
  'IS',
  'WAS',
  'CHANGED',
  'STARTS',
  'ENDS',
]);

const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT', 'EMPTY', 'NULL']);

/**
 * Tokenize JQL text. Quoted strings are collapsed into a single `word` token so
 * they can never be mistaken for fields/operators; escape sequences inside
 * quotes are respected.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    // Whitespace separates tokens but carries no meaning itself.
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Quoted string -> one word token (value position, never a field).
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') {
          j += 2; // skip escaped char
          continue;
        }
        if (text[j] === quote) break;
        j++;
      }
      tokens.push({ type: 'word', value: text.slice(i, Math.min(j + 1, n)) });
      i = j + 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }

    // Symbolic operators (=, ==, !=, ~, >=, ...) — greedily match up to 2 chars.
    if (OPERATOR_CHARS.has(ch)) {
      const two = text.slice(i, i + 2);
      if (SINGLE_OPERATORS.has(two)) {
        tokens.push({ type: 'operator', value: two });
        i += 2;
        continue;
      }
      const one = text.slice(i, i + 1);
      tokens.push({ type: 'operator', value: one });
      i += 1;
      continue;
    }

    // Word (field name, keyword, or bare value).
    let j = i;
    while (j < n && !/[\s(),=~!<>]/.test(text[j])) {
      j++;
    }
    const word = text.slice(i, j);
    const upper = word.toUpperCase();
    const isOperator =
      KEYWORD_OPERATORS.has(upper) || LOGICAL_OPERATORS.has(upper);
    tokens.push(isOperator ? { type: 'operator', value: upper } : { type: 'word', value: word });
    i = j;
  }

  return tokens;
}

/**
 * True when a word token is a fully closed quoted string (starts and ends with
 * the same quote). Such a token is a completed value, not a partial word.
 */
function isCompleteQuotedString(value: string): boolean {
  if (value.length < 2) return false;
  const quote = value[0];
  return (quote === '"' || quote === "'") && value[value.length - 1] === quote;
}

/**
 * Find the field word immediately before the operator at `opIndex`, skipping a
 * leading NOT so "field NOT IN" and "field NOT CONTAINS" resolve correctly.
 */
function fieldBeforeOperator(tokens: Token[], opIndex: number): string | null {
  let idx = opIndex - 1;
  let candidate: Token | undefined = tokens[idx];
  if (candidate && candidate.type === 'operator' && candidate.value === 'NOT') {
    idx--;
    candidate = tokens[idx];
  }
  return candidate && candidate.type === 'word' ? candidate.value.toLowerCase() : null;
}

/**
 * Parse the text that appears before the cursor and return the autocomplete
 * field context.
 */
export function parseJqlFieldContext(textBeforeCursor: string): JqlFieldContext {
  const tokens = tokenize(textBeforeCursor);
  if (tokens.length === 0) {
    return { field: null, afterInOperator: false };
  }

  const last = tokens[tokens.length - 1];
  const endsWithSpace = /\s$/.test(textBeforeCursor);

  // If the cursor sits immediately after an operator (no trailing space), the
  // user may still be composing it — e.g. having typed only "=" of "==", or the
  // "NOT" of "NOT IN". In that case treat the position as right after the
  // preceding field so both the partial and complete operators stay useful.
  if (!endsWithSpace && last.type === 'operator') {
    return {
      field: fieldBeforeOperator(tokens, tokens.length - 1),
      afterInOperator: last.value === 'IN',
    };
  }

  // If the cursor is mid-word, drop that trailing partial token so it does not
  // influence the context (e.g. typing "stat" after "priority = High AND"). A
  // fully closed quoted string is a completed value, so it is kept.
  if (!endsWithSpace && last.type === 'word' && !isCompleteQuotedString(last.value)) {
    tokens.pop();
    if (tokens.length === 0) {
      return { field: null, afterInOperator: false };
    }
  }

  const tail = tokens[tokens.length - 1];

  // Inside an unclosed IN (...) list: scan backwards for the nearest unmatched
  // "(" and, if it is preceded by an IN operator, return that field.
  let depth = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === 'rparen') {
      depth++;
      continue;
    }
    if (t.type === 'lparen') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const prev = tokens[i - 1];
      if (prev && prev.type === 'operator' && prev.value === 'IN') {
        return { field: fieldBeforeOperator(tokens, i - 1), afterInOperator: false };
      }
      // Paren not tied to IN (e.g. a grouping paren) — no field context.
      return { field: null, afterInOperator: false };
    }
  }

  // Not inside parentheses. Inspect the trailing token.
  if (tail.type === 'operator' && tail.value === 'IN') {
    return {
      field: fieldBeforeOperator(tokens, tokens.length - 1),
      afterInOperator: true,
    };
  }

  if (tail.type === 'operator' && !LOGICAL_OPERATORS.has(tail.value)) {
    return {
      field: fieldBeforeOperator(tokens, tokens.length - 1),
      afterInOperator: false,
    };
  }

  // After a completed value or a logical operator -> suggest fields/operators.
  return { field: null, afterInOperator: false };
}
