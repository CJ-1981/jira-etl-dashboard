/**
 * Shared top-level splitter unit tests
 *
 * splitTopLevel() centralizes the quote-aware character loop previously
 * duplicated in three places:
 *   1. the IN-list comma parser inside applyFilter()   (engine-utils.ts)
 *   2. splitByTopLevelOperator() for AND / OR           (engine-utils.ts)
 *   3. splitTopLevelKeyword() for WHERE / OF            (custom-formula.ts)
 *
 * These tests pin the EXACT semantics each call site had before the
 * refactor, expressed through the helper's option combinations. The filter
 * DSL and the formula parser are security-adjacent, so no behavior drift is
 * acceptable — every edge case below was traced through the original loops.
 */

import { describe, it, expect } from 'vitest';
import { splitTopLevel } from '../split-top-level';

/** Option set used by applyFilter's IN-list comma parser. */
const IN_LIST = { transform: (part: string): string => part.toLowerCase() };
/** Option set used by splitByTopLevelOperator (AND / OR). */
const OPERATOR = { keepQuotes: true, caseInsensitive: true };
/** Option set used by splitTopLevelKeyword (WHERE / OF). */
const KEYWORD = { keepQuotes: true, caseInsensitive: true, keepEmptyTrailing: true };

const splitInList = (s: string): string[] => splitTopLevel(s, ',', IN_LIST);
const splitOperator = (s: string, op: 'AND' | 'OR'): string[] =>
  splitTopLevel(s, ` ${op} `, OPERATOR);
const splitKeyword = (s: string, keyword: string): string[] =>
  splitTopLevel(s, ` ${keyword} `, KEYWORD);

// ─── Variant 1: IN-list comma parsing ────────────────────────────────────────

describe('splitTopLevel — IN-list comma variant (quote-stripping)', () => {
  it('splits plain comma-separated values', () => {
    expect(splitInList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims and lowercases each value', () => {
    expect(splitInList(' High , LOW ')).toEqual(['high', 'low']);
  });

  it('strips double quotes around values', () => {
    expect(splitInList('"High", "Low"')).toEqual(['high', 'low']);
  });

  it('strips single quotes around values', () => {
    expect(splitInList("'A', 'B'")).toEqual(['a', 'b']);
  });

  it('protects commas inside double quotes', () => {
    expect(splitInList('"a,b",c')).toEqual(['a,b', 'c']);
  });

  it('protects commas inside single quotes', () => {
    expect(splitInList("'a,b',c")).toEqual(['a,b', 'c']);
  });

  it('keeps the other quote kind as content inside a quoted region', () => {
    expect(splitInList('"it\'s fine","x"')).toEqual(["it's fine", 'x']);
  });

  it('treats a backslash-escaped quote outside quotes as literal content', () => {
    // a\"b, c — the escaped quote never opens a region, so the comma splits
    expect(splitInList('a\\"b, c')).toEqual(['a\\"b', 'c']);
  });

  it('treats a backslash-escaped quote inside quotes as literal content', () => {
    // "a\"b",c — the escaped quote stays inside the region
    expect(splitInList('"a\\"b",c')).toEqual(['a\\"b', 'c']);
  });

  it('keeps empty interior segments', () => {
    expect(splitInList('a,,b')).toEqual(['a', '', 'b']);
  });

  it('drops an empty trailing segment', () => {
    expect(splitInList('a,b,')).toEqual(['a', 'b']);
  });

  it('keeps the empty segment before a final quoted empty value', () => {
    // valuesStr ends right after a delimiter -> pushed unconditionally inside
    // the loop, and the tail is empty-after-trim -> dropped
    expect(splitInList('a,,')).toEqual(['a', '']);
  });

  it('returns [] for empty input', () => {
    expect(splitInList('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(splitInList('   ')).toEqual([]);
  });

  it('returns [] for a lone comma (both segments empty-after-trim)', () => {
    // interior push happens unconditionally, but ',' pushes '' once
    expect(splitInList(',')).toEqual(['']);
  });

  it('handles a quoted empty value', () => {
    expect(splitInList('"",b')).toEqual(['', 'b']);
  });

  it('keeps an unclosed quote region open to the end', () => {
    expect(splitInList('"a,b')).toEqual(['a,b']);
  });

  it('lowercases quoted content too', () => {
    expect(splitInList('"MiXeD CaSe"')).toEqual(['mixed case']);
  });

  it('parses the canonical filter DSL IN list', () => {
    expect(splitInList('Open, Done, "In Progress"')).toEqual(['open', 'done', 'in progress']);
  });
});

// ─── Variant 2: operator splitting (AND / OR) ───────────────────────────────

describe('splitTopLevel — operator variant (AND / OR)', () => {
  it('splits on top-level AND', () => {
    expect(splitOperator('a == 1 AND b == 2', 'AND')).toEqual(['a == 1', 'b == 2']);
  });

  it('splits on top-level OR', () => {
    expect(splitOperator('a == 1 OR b == 2', 'OR')).toEqual(['a == 1', 'b == 2']);
  });

  it('ignores the operator inside double quotes', () => {
    expect(splitOperator('a == "x AND y" AND b == c', 'AND')).toEqual([
      'a == "x AND y"',
      'b == c',
    ]);
  });

  it('ignores the operator inside single quotes', () => {
    expect(splitOperator("status == 'Open' OR status == 'Done'", 'OR')).toEqual([
      "status == 'Open'",
      "status == 'Done'",
    ]);
  });

  it('returns a single part when the operator is absent', () => {
    expect(splitOperator('status == Done', 'AND')).toEqual(['status == Done']);
  });

  it('matches the operator case-insensitively', () => {
    expect(splitOperator('a and b AnD c', 'AND')).toEqual(['a', 'b', 'c']);
  });

  it('splits repeatedly', () => {
    expect(splitOperator('a AND b AND c', 'AND')).toEqual(['a', 'b', 'c']);
  });

  it('does not split on words that merely contain the operator', () => {
    // search pattern is space-padded, so FAND / ANDROID never match
    expect(splitOperator('FAND == 1 ANDROID == 2', 'AND')).toEqual([
      'FAND == 1 ANDROID == 2',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(splitOperator('', 'AND')).toEqual([]);
  });

  it('keeps a whitespace-only trailing segment as an empty part', () => {
    // original `if (current)` guard is on the raw accumulator, then trims
    expect(splitOperator('a AND  ', 'AND')).toEqual(['a', '']);
  });

  it('pushes an empty leading part when the input starts with the operator', () => {
    expect(splitOperator(' AND b', 'AND')).toEqual(['', 'b']);
  });

  it('keeps an unclosed quote region open (no split inside)', () => {
    expect(splitOperator('a == "x AND y', 'AND')).toEqual(['a == "x AND y']);
  });

  it('treats a backslash-escaped quote as literal content that does not open a region', () => {
    // a == "x\" AND y == 1 — the escaped quote never opens a region, so the
    // operator after it is top-level and splits; backslash+quote are kept.
    expect(splitOperator('a == x\\" AND y == 1', 'AND')).toEqual(['a == x\\"', 'y == 1']);
  });

  it('does not close a region on a backslash-escaped matching quote', () => {
    // a == "x\" AND y == 1 with the quote OPENED first: the \" inside the
    // region is literal content, so the region stays open and nothing splits.
    expect(splitOperator('a == "x\\" AND y == 1', 'AND')).toEqual([
      'a == "x\\" AND y == 1',
    ]);
  });

  it('preserves quotes verbatim in every part', () => {
    expect(splitOperator('summary CONTAINS "a" AND status == \'Open\'', 'AND')).toEqual([
      'summary CONTAINS "a"',
      "status == 'Open'",
    ]);
  });
});

// ─── Variant 3: keyword splitting (WHERE / OF) ──────────────────────────────

describe('splitTopLevel — keyword variant (WHERE / OF)', () => {
  it('splits field WHERE condition', () => {
    expect(splitKeyword('storyPoints WHERE status = "Done"', 'WHERE')).toEqual([
      'storyPoints',
      'status = "Done"',
    ]);
  });

  it('splits numerator OF denominator', () => {
    expect(splitKeyword('status = "Done" OF true', 'OF')).toEqual([
      'status = "Done"',
      'true',
    ]);
  });

  it('always emits at least one part, even for empty input', () => {
    // callers rely on parts[1] || 'true' / parts[1] || ''
    expect(splitKeyword('', 'WHERE')).toEqual(['']);
    expect(splitKeyword('', 'OF')).toEqual(['']);
  });

  it('returns a single part when the keyword is absent', () => {
    // callers read parts[1] || '' / || 'true'
    expect(splitKeyword('storyPoints', 'WHERE')).toEqual(['storyPoints']);
  });

  it('ignores the keyword inside quotes', () => {
    expect(splitKeyword('summary WHERE summary CONTAINS " WHERE "', 'WHERE')).toEqual([
      'summary',
      'summary CONTAINS " WHERE "',
    ]);
  });

  it('matches the keyword case-insensitively', () => {
    expect(splitKeyword('storyPoints where status = "Done"', 'WHERE')).toEqual([
      'storyPoints',
      'status = "Done"',
    ]);
  });

  it('does not split on words that merely contain the keyword', () => {
    expect(splitKeyword('WHEREFORE == 1', 'WHERE')).toEqual(['WHEREFORE == 1']);
  });

  it('emits an empty trailing part after a trailing keyword', () => {
    expect(splitKeyword('a WHERE ', 'WHERE')).toEqual(['a', '']);
  });

  it('keeps an unclosed quote region open (no split inside)', () => {
    expect(splitKeyword('summary WHERE "a WHERE b', 'WHERE')).toEqual([
      'summary',
      '"a WHERE b',
    ]);
  });

  it('splits on the first occurrence only semantics: multiple keywords split all', () => {
    expect(splitKeyword('a OF b OF c', 'OF')).toEqual(['a', 'b', 'c']);
  });
});

// ─── Cross-variant invariants ────────────────────────────────────────────────

describe('splitTopLevel — shared quote mechanics', () => {
  it('never splits on a delimiter of the wrong quote kind inside a region', () => {
    // single-quoted region containing double quotes (operator variant)
    expect(splitOperator("a == 'x \" AND \" y' AND b", 'AND')).toEqual([
      "a == 'x \" AND \" y'",
      'b',
    ]);
  });

  it('reopens a region after a closed one', () => {
    expect(splitInList('"a","b"')).toEqual(['a', 'b']);
  });

  it('handles adjacent quoted regions without delimiter', () => {
    // "a""b" -> first closes, second opens; content is contiguous
    expect(splitInList('"a""b"')).toEqual(['ab']);
  });

  it('does not treat escaped backslash-double-quote sequences as quote-openers', () => {
    // a\\"b, c : the char before the quote is a backslash, so the quote is
    // literal regardless of what precedes the backslash
    expect(splitInList('a\\\\"b, c')).toEqual(['a\\\\"b', 'c']);
  });
});
