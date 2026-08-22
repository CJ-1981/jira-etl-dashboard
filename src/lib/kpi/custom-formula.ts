/**
 * Sandboxed Custom Formula Compiler
 *
 * @MX:WARN: SECURITY BOUNDARY — user-supplied plugin formulas arrive over HTTP
 * (POST /api/kpi/calculate, /api/jira/extract) with no authentication. They must
 * never be compiled with `new Function`, `eval`, or `vm`, which would allow
 * arbitrary code execution on the server.
 * @MX:REASON: This module replaces the previous `new Function('context', formula)`
 * path with a hand-written recursive-descent parser + tree-walking interpreter that
 * supports only a restricted expression grammar. There is no way to reach global
 * scope, constructors, prototypes, imports, or the filesystem from a formula.
 *
 * Two languages are supported:
 *  - 'dsl':        COUNT / AVG / SUM / PERCENTAGE formulas (see custom_plugin_guide.md)
 *  - 'javascript': restricted expression subset (no statements, no assignment,
 *                  no `new`, allow-listed callees only)
 */

import { applyFilter, getFieldValue, splitByTopLevelOperator } from './engine-utils';
import type { TransformedIssue } from './types';

// ─── Limits ──────────────────────────────────────────────────────────────────

/** @MX:WARN: Hard cap on formula size — oversized input is rejected before parsing */
const MAX_FORMULA_LENGTH = 10_000;
/** @MX:WARN: Hard cap on AST nesting — prevents stack overflow on hostile input */
const MAX_AST_DEPTH = 40;

// ─── Errors ──────────────────────────────────────────────────────────────────

export class FormulaSyntaxError extends Error {
  position?: number;
  constructor(message: string, position?: number) {
    super(position !== undefined ? `${message} (at position ${position})` : message);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

export class FormulaSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaSecurityError';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compile a custom plugin formula into a function of `context`.
 *
 * @MX:WARN: The returned function is a tree-walking interpreter over a validated
 * AST. It can only touch the `context` object passed in and the allow-listed
 * globals below — never the surrounding Node.js environment.
 *
 * @throws {FormulaSyntaxError} on parse failures (includes position when known)
 * @throws {FormulaSecurityError} on forbidden identifiers/properties
 * @throws {Error} when the formula exceeds MAX_FORMULA_LENGTH
 */
export function compileCustomFormula(
  formula: string,
  language: 'dsl' | 'javascript'
): (context: unknown) => unknown {
  if (typeof formula !== 'string') {
    throw new FormulaSyntaxError('Formula must be a string');
  }
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula exceeds maximum length of ${MAX_FORMULA_LENGTH} characters`
    );
  }
  return language === 'javascript'
    ? compileJavaScriptFormula(formula)
    : compileDslFormula(formula);
}

// ═══════════════════════════════════════════════════════════════════════════
// DSL: COUNT / AVG / SUM / PERCENTAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compile a DSL formula. Returns the raw numeric value; the engine wraps it
 * into a KpiResult (mirroring the previous executeCustomFormula behavior).
 */
function compileDslFormula(formula: string): (context: unknown) => unknown {
  const match = formula.trim().match(/^(\w+)\((.+)\)([\s\S]*)$/i);
  if (!match) {
    throw new FormulaSyntaxError(
      `Invalid DSL formula "${truncate(formula)}": expected FUNC(...)`
    );
  }
  const func = match[1].toUpperCase();
  const args = match[2];
  const trailing = match[3].trim();

  switch (func) {
    case 'COUNT': {
      assertNoTrailingText(trailing, 'COUNT');
      const pred = compileCondition(args);
      return (context) => issuesFromContext(context).filter(pred).length;
    }
    case 'AVG': {
      assertNoTrailingText(trailing, 'AVG');
      const { field, predicate } = parseFieldWhere(args);
      return (context) => {
        const filtered = issuesFromContext(context).filter(predicate);
        if (filtered.length === 0) return 0;
        let sum = 0;
        let numericCount = 0;
        for (const issue of filtered) {
          const v = resolveFieldValue(issue, field);
          if (typeof v === 'number') {
            sum += v;
            numericCount++;
          }
        }
        if (numericCount === 0) return 0;
        return Math.round((sum / numericCount) * 100) / 100;
      };
    }
    case 'SUM': {
      assertNoTrailingText(trailing, 'SUM');
      const { field, predicate } = parseFieldWhere(args);
      return (context) => {
        const filtered = issuesFromContext(context).filter(predicate);
        const total = filtered.reduce((acc, issue) => {
          const v = resolveFieldValue(issue, field);
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);
        return Math.round(total * 100) / 100;
      };
    }
    case 'PERCENTAGE': {
      // Accept both documented shapes:
      //   PERCENTAGE(<numerator>) OF <denominator>   (guide syntax, OF outside)
      //   PERCENTAGE(<numerator> OF <denominator>)   (legacy syntax, OF inside)
      let numeratorText: string;
      let denominatorText: string;
      if (trailing) {
        const ofMatch = trailing.match(/^OF\s+([\s\S]+)$/i);
        if (!ofMatch) {
          throw new FormulaSyntaxError(
            `Unexpected text after PERCENTAGE(...): "${truncate(trailing)}"`
          );
        }
        numeratorText = args;
        denominatorText = ofMatch[1];
      } else {
        const parts = splitTopLevelKeyword(args, 'OF');
        numeratorText = parts[0];
        denominatorText = parts[1] || 'true';
      }
      const numerator = compileCondition(numeratorText);
      const denominator = compileCondition(denominatorText);
      return (context) => {
        const issues = issuesFromContext(context);
        const num = issues.filter(numerator).length;
        const den = issues.filter(denominator).length;
        return den > 0 ? Math.round((num / den) * 10000) / 100 : 0;
      };
    }
    default:
      throw new FormulaSyntaxError(`Unknown DSL function "${func}"`);
  }
}

function assertNoTrailingText(trailing: string, funcName: string): void {
  if (trailing) {
    throw new FormulaSyntaxError(
      `Unexpected text after ${funcName}(...): "${truncate(trailing)}"`
    );
  }
}

function issuesFromContext(context: unknown): TransformedIssue[] {
  const issues = (context as { issues?: unknown })?.issues;
  return Array.isArray(issues) ? issues : [];
}

/** Parse `<field> WHERE <condition>` (WHERE is optional). */
function parseFieldWhere(args: string): { field: string; predicate: Predicate } {
  const parts = splitTopLevelKeyword(args, 'WHERE');
  const field = parts[0].trim();
  if (!field) throw new FormulaSyntaxError('Missing field name in AVG/SUM formula');
  const predicate = compileCondition(parts[1] || '');
  return { field, predicate };
}

/**
 * Split on a top-level (unquoted, whitespace-delimited) keyword such as
 * WHERE or OF. Quote-aware, mirroring splitByTopLevelOperator.
 */
function splitTopLevelKeyword(text: string, keyword: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  const search = ` ${keyword} `;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ((char === '"' || char === "'") && (i === 0 || text[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }
    if (!inQuotes && text.substring(i).toUpperCase().startsWith(search)) {
      parts.push(current.trim());
      current = '';
      i += search.length - 1;
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

// ─── DSL condition compilation ───────────────────────────────────────────────

type Predicate = (issue: TransformedIssue) => boolean;

/**
 * Compile a DSL condition into a per-issue predicate.
 * Semantics for =, !=, CONTAINS, NOT CONTAINS and IN match applyFilter()
 * exactly (case-insensitive comparisons); numeric comparisons >, >=, <, <=
 * are an extension of the documented DSL.
 *
 * @MX:WARN: Text matching no recognized condition shape is rejected with a
 * FormulaSyntaxError. The previous fallback delegated to applyFilter(), which
 * returns the input unchanged for unknown conditions — silently matching
 * EVERY issue (e.g. COUNT(status="Done") without the space after "=").
 */
function compileCondition(condition: string, depth: number = 0): Predicate {
  if (depth > MAX_AST_DEPTH) {
    throw new FormulaSyntaxError('Condition nesting too deep');
  }
  const trimmed = condition.trim();
  if (!trimmed || trimmed === 'true' || trimmed === '*') return () => true;

  // Guide syntax `COUNT(issues WHERE <condition>)`: the "issues WHERE" prefix
  // carries no semantics here — strip it and compile the inner condition.
  const issuesWherePrefix = trimmed.match(/^issues\s+WHERE\s+([\s\S]+)$/i);
  if (issuesWherePrefix) {
    return compileCondition(issuesWherePrefix[1], depth + 1);
  }

  // OR (lowest precedence)
  const orParts = splitByTopLevelOperator(trimmed, 'OR');
  if (orParts.length > 1) {
    const preds = orParts.map((p) => compileCondition(p, depth + 1));
    return (issue) => preds.some((pred) => pred(issue));
  }

  // AND
  const andParts = splitByTopLevelOperator(trimmed, 'AND');
  if (andParts.length > 1) {
    const preds = andParts.map((p) => compileCondition(p, depth + 1));
    return (issue) => preds.every((pred) => pred(issue));
  }

  // Atomic conditions (order matters: check != before =, multi-char ops first)
  const cmpMatch = trimmed.match(/^([\w.-]+)\s*(>=|<=|>|<)\s*(.+)$/i);
  if (cmpMatch) {
    const [, field, op, rawValue] = cmpMatch;
    const literal = parseLiteralValue(rawValue.trim());
    const rhs = Number(literal);
    return (issue) => {
      const lhs = Number(resolveFieldValue(issue, field));
      if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false;
      switch (op) {
        case '>': return lhs > rhs;
        case '>=': return lhs >= rhs;
        case '<': return lhs < rhs;
        default: return lhs <= rhs;
      }
    };
  }

  const containsMatch = trimmed.match(
    /^([\w.-]+)\s+(NOT\s+)?CONTAINS\s+("([^"]*)"|'([^']*)'|(\S+))$/i
  );
  if (containsMatch) {
    const [, field, not, , dq, sq, uq] = containsMatch;
    const val = (dq ?? sq ?? uq ?? '').toLowerCase();
    const isNot = Boolean(not);
    return (issue) => {
      const fieldValue = String(resolveFieldValue(issue, field) || '').toLowerCase();
      const contains = fieldValue.includes(val);
      return isNot ? !contains : contains;
    };
  }

  const eqMatch = trimmed.match(
    /^([\w.-]+)\s*={1,2}\s+("([^"]*)"|'([^']*)'|(\S+))$/i
  );
  if (eqMatch) {
    const [, field, , dq, sq, uq] = eqMatch;
    const val = (dq ?? sq ?? uq ?? '').toLowerCase();
    return (issue) => {
      const fieldValue = resolveFieldValue(issue, field);
      if (val === 'true') return Boolean(fieldValue);
      if (val === 'false') return !fieldValue;
      return String(fieldValue || '').toLowerCase() === val;
    };
  }

  const neqMatch = trimmed.match(
    /^([\w.-]+)\s*!=\s+("([^"]*)"|'([^']*)'|(\S+))$/i
  );
  if (neqMatch) {
    const [, field, , dq, sq, uq] = neqMatch;
    const val = (dq ?? sq ?? uq ?? '').toLowerCase();
    return (issue) => String(resolveFieldValue(issue, field) || '').toLowerCase() !== val;
  }

  const inMatch = trimmed.match(/^([\w.-]+)\s+(NOT\s+)?IN\s*\(.*\)$/i);
  if (inMatch) {
    // @MX:REASON: IN-list quote parsing is non-trivial; delegate to the
    // battle-tested applyFilter() for identical semantics. Safe: the shape is
    // already validated by the regex above, and applyFilter recognizes it.
    return (issue) => applyFilter([issue], trimmed).length === 1;
  }

  // Nothing recognized the condition — fail loudly instead of silently
  // matching every issue.
  throw new FormulaSyntaxError(`Unrecognized condition "${truncate(trimmed)}"`);
}

/** Strip surrounding quotes from a DSL literal value. */
function parseLiteralValue(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

/**
 * Resolve a field against an issue. Checks the standard field map first,
 * then flattens one level: direct property, then issue.fields[field].
 */
function resolveFieldValue(issue: TransformedIssue, field: string): unknown {
  const mapped = getFieldValue(issue, field);
  if (mapped !== null && mapped !== undefined) return mapped;
  const anyIssue = issue as unknown as Record<string, unknown>;
  if (anyIssue[field] !== undefined && anyIssue[field] !== null) return anyIssue[field];
  const fields = anyIssue.fields as Record<string, unknown> | undefined;
  if (fields && fields[field] !== undefined && fields[field] !== null) return fields[field];
  return mapped;
}

// ═══════════════════════════════════════════════════════════════════════════
// Restricted JavaScript: tokenizer
// ═══════════════════════════════════════════════════════════════════════════

type JsToken =
  | { type: 'num'; value: number; pos: number }
  | { type: 'str'; value: string; pos: number }
  | { type: 'ident'; value: string; pos: number }
  | { type: 'punct'; value: string; pos: number }
  | { type: 'eof'; pos: number };

const PUNCTUATORS = [
  '===', '!==', '==', '!=', '>=', '<=', '=>', '**',
  '&&', '||', '!', '>', '<',
  '+', '-', '*', '/', '%',
  '(', ')', '[', ']', '{', '}', '.', ',', '?', ':', '=', ';',
];

// @MX:WARN: Identifiers that would grant access to the JS object model or the
// Node.js environment. Blocked both as root identifiers and as property names.
const BLOCKED_IDENTIFIERS = new Set([
  'constructor', '__proto__', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__', 'prototype',
  'globalThis', 'global', 'window', 'self',
  'process', 'require', 'module', 'exports', 'import',
  'Function', 'eval', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'this', 'arguments', 'new',
]);

// @MX:WARN: Property names blocked on every member access, regardless of the
// base object. This cuts off the classic obj['constructor'] escape routes.
const BLOCKED_PROPERTIES = new Set([
  'constructor', '__proto__', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__', 'prototype',
]);

function tokenizeJs(src: string): JsToken[] {
  const tokens: JsToken[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
      continue;
    }

    // Comments (allowed so guide-style snippets keep working; content is inert)
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) throw new FormulaSyntaxError('Unterminated block comment', i);
      i = end + 2;
      continue;
    }

    // Numbers
    if (c >= '0' && c <= '9') {
      const m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
      tokens.push({ type: 'num', value: Number(m![0]), pos: i });
      i += m![0].length;
      continue;
    }
    // Number starting with ".5"
    if (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
      const m = /^\.\d+/.exec(src.slice(i));
      tokens.push({ type: 'num', value: Number(m![0]), pos: i });
      i += m![0].length;
      continue;
    }

    // Strings (double or single quoted; escapes \n \t \\ \" \' \r \0)
    if (c === '"' || c === "'") {
      const start = i;
      i++;
      let value = '';
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') {
          i++;
          if (i >= n) throw new FormulaSyntaxError('Unterminated string escape', start);
          const esc = src[i];
          switch (esc) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case 'r': value += '\r'; break;
            case '0': value += '\0'; break;
            case '\\': value += '\\'; break;
            case '"': value += '"'; break;
            case "'": value += "'"; break;
            default: throw new FormulaSyntaxError(`Unsupported escape "\\${esc}"`, i - 1);
          }
        } else {
          value += src[i];
        }
        i++;
      }
      if (i >= n) throw new FormulaSyntaxError('Unterminated string literal', start);
      i++; // closing quote
      tokens.push({ type: 'str', value, pos: start });
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))!;
      tokens.push({ type: 'ident', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }

    // Punctuators (longest match first)
    const punct = PUNCTUATORS.find((p) => src.startsWith(p, i));
    if (punct) {
      tokens.push({ type: 'punct', value: punct, pos: i });
      i += punct.length;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character "${c}"`, i);
  }

  tokens.push({ type: 'eof', pos: n });
  return tokens;
}

// ─── Restricted JavaScript: AST ──────────────────────────────────────────────

type JsNode =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'str'; value: string; pos: number }
  | { kind: 'bool'; value: boolean; pos: number }
  | { kind: 'null'; pos: number }
  | { kind: 'undefined'; pos: number }
  | { kind: 'array'; elements: JsNode[]; pos: number }
  | { kind: 'object'; properties: Array<{ key: string; keyPos: number; value: JsNode }>; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'member'; object: JsNode; property: string; computed: boolean; pos: number }
  | { kind: 'call'; callee: JsNode; args: JsNode[]; pos: number }
  | { kind: 'unary'; op: string; operand: JsNode; pos: number }
  | { kind: 'binary'; op: string; left: JsNode; right: JsNode; pos: number }
  | { kind: 'logical'; op: '&&' | '||'; left: JsNode; right: JsNode; pos: number }
  | { kind: 'ternary'; test: JsNode; consequent: JsNode; alternate: JsNode; pos: number }
  | { kind: 'arrow'; params: Array<{ name: string; pos: number }>; body: JsNode; pos: number };

// ─── Restricted JavaScript: parser ───────────────────────────────────────────

class JsParser {
  private pos = 0;

  constructor(private readonly tokens: JsToken[]) {}

  private peek(): JsToken {
    return this.tokens[this.pos];
  }

  private next(): JsToken {
    return this.tokens[this.pos++];
  }

  private expectPunct(value: string): JsToken {
    const tok = this.peek();
    if (tok.type !== 'punct' || tok.value !== value) {
      throw new FormulaSyntaxError(`Expected "${value}"`, tok.pos);
    }
    return this.next();
  }

  private eatPunct(value: string): boolean {
    const tok = this.peek();
    if (tok.type === 'punct' && tok.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private atPunct(value: string): boolean {
    const tok = this.peek();
    return tok.type === 'punct' && tok.value === value;
  }

  private atIdent(...names: string[]): boolean {
    const tok = this.peek();
    return tok.type === 'ident' && names.includes(tok.value);
  }

  parseProgram(): JsNode {
    const expr = this.parseExpression(0);
    const tok = this.peek();
    if (tok.type !== 'eof') {
      throw new FormulaSyntaxError(
        `Unexpected ${tok.type === 'punct' ? `"${tok.value}"` : `token "${(tok as { value?: unknown }).value}"`} after expression`,
        tok.pos
      );
    }
    return expr;
  }

  parseExpression(depth: number): JsNode {
    if (depth > MAX_AST_DEPTH) {
      throw new FormulaSyntaxError('Expression nesting too deep');
    }
    return this.parseTernary(depth);
  }

  private parseTernary(depth: number): JsNode {
    const test = this.parseLogicalOr(depth);
    if (this.atPunct('?')) {
      const pos = this.next().pos;
      const consequent = this.parseExpression(depth + 1);
      this.expectPunct(':');
      const alternate = this.parseExpression(depth + 1);
      return { kind: 'ternary', test, consequent, alternate, pos };
    }
    return test;
  }

  private parseLogicalOr(depth: number): JsNode {
    let left = this.parseLogicalAnd(depth);
    while (this.atPunct('||')) {
      const pos = this.next().pos;
      const right = this.parseLogicalAnd(depth);
      left = { kind: 'logical', op: '||', left, right, pos };
    }
    return left;
  }

  private parseLogicalAnd(depth: number): JsNode {
    let left = this.parseEquality(depth);
    while (this.atPunct('&&')) {
      const pos = this.next().pos;
      const right = this.parseEquality(depth);
      left = { kind: 'logical', op: '&&', left, right, pos };
    }
    return left;
  }

  private parseEquality(depth: number): JsNode {
    let left = this.parseRelational(depth);
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'punct' && ['==', '!=', '===', '!=='].includes(tok.value)) {
        this.next();
        const right = this.parseRelational(depth);
        left = { kind: 'binary', op: tok.value, left, right, pos: tok.pos };
      } else {
        return left;
      }
    }
  }

  private parseRelational(depth: number): JsNode {
    let left = this.parseAdditive(depth);
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'punct' && ['>', '>=', '<', '<='].includes(tok.value)) {
        this.next();
        const right = this.parseAdditive(depth);
        left = { kind: 'binary', op: tok.value, left, right, pos: tok.pos };
      } else {
        return left;
      }
    }
  }

  private parseAdditive(depth: number): JsNode {
    let left = this.parseMultiplicative(depth);
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'punct' && (tok.value === '+' || tok.value === '-')) {
        this.next();
        const right = this.parseMultiplicative(depth);
        left = { kind: 'binary', op: tok.value, left, right, pos: tok.pos };
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(depth: number): JsNode {
    let left = this.parseExponent(depth);
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'punct' && ['*', '/', '%'].includes(tok.value)) {
        this.next();
        const right = this.parseExponent(depth);
        left = { kind: 'binary', op: tok.value, left, right, pos: tok.pos };
      } else {
        return left;
      }
    }
  }

  private parseExponent(depth: number): JsNode {
    const base = this.parseUnary(depth);
    if (this.atPunct('**')) {
      const pos = this.next().pos;
      // Right-associative, matches JS
      const exponent = this.parseExponent(depth);
      return { kind: 'binary', op: '**', left: base, right: exponent, pos };
    }
    return base;
  }

  private parseUnary(depth: number): JsNode {
    const tok = this.peek();
    if (tok.type === 'punct' && (tok.value === '!' || tok.value === '-' || tok.value === '+')) {
      this.next();
      const operand = this.parseUnary(depth);
      return { kind: 'unary', op: tok.value, operand, pos: tok.pos };
    }
    return this.parsePostfix(depth);
  }

  private parsePostfix(depth: number): JsNode {
    let object = this.parsePrimary(depth);
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'punct' && tok.value === '.') {
        this.next();
        const propTok = this.next();
        if (propTok.type !== 'ident') {
          throw new FormulaSyntaxError('Expected property name after "."', propTok.pos);
        }
        assertSafeProperty(propTok.value, propTok.pos);
        object = { kind: 'member', object, property: propTok.value, computed: false, pos: tok.pos };
      } else if (tok.type === 'punct' && tok.value === '[') {
        this.next();
        const keyTok = this.peek();
        // @MX:WARN: Only literal string/number keys are allowed inside brackets.
        // Computed keys could be used to reach blocked properties indirectly.
        if (keyTok.type !== 'str' && keyTok.type !== 'num') {
          throw new FormulaSyntaxError(
            'Only literal string or number keys are allowed in bracket access',
            keyTok.pos
          );
        }
        this.next();
        this.expectPunct(']');
        const property = String(keyTok.value);
        if (keyTok.type === 'str') assertSafeProperty(property, keyTok.pos);
        object = { kind: 'member', object, property, computed: true, pos: tok.pos };
      } else if (tok.type === 'punct' && tok.value === '(') {
        this.next();
        const args: JsNode[] = [];
        if (!this.atPunct(')')) {
          for (;;) {
            args.push(this.parseExpression(depth + 1));
            if (this.eatPunct(',')) continue;
            break;
          }
        }
        this.expectPunct(')');
        object = { kind: 'call', callee: object, args, pos: tok.pos };
      } else {
        return object;
      }
    }
  }

  private parsePrimary(depth: number): JsNode {
    const tok = this.next();

    if (tok.type === 'num') return { kind: 'num', value: tok.value, pos: tok.pos };
    if (tok.type === 'str') return { kind: 'str', value: tok.value, pos: tok.pos };

    if (tok.type === 'ident') {
      switch (tok.value) {
        case 'true': return { kind: 'bool', value: true, pos: tok.pos };
        case 'false': return { kind: 'bool', value: false, pos: tok.pos };
        case 'null': return { kind: 'null', pos: tok.pos };
        case 'undefined': return { kind: 'undefined', pos: tok.pos };
        default: {
          // Bare single-parameter arrow: `i => expr`
          if (this.atPunct('=>')) {
            assertSafeIdentifier(tok.value, tok.pos);
            this.next(); // consume '=>'
            const body = this.parseExpression(depth + 1);
            return {
              kind: 'arrow',
              params: [{ name: tok.value, pos: tok.pos }],
              body,
              pos: tok.pos,
            };
          }
          assertSafeIdentifier(tok.value, tok.pos);
          return { kind: 'ident', name: tok.value, pos: tok.pos };
        }
      }
    }

    if (tok.type === 'punct') {
      switch (tok.value) {
        case '(':
          return this.parseParenthesizedOrArrow(tok.pos, depth);
        case '[': {
          const elements: JsNode[] = [];
          if (!this.atPunct(']')) {
            for (;;) {
              elements.push(this.parseExpression(depth + 1));
              if (this.eatPunct(',')) continue;
              break;
            }
          }
          this.expectPunct(']');
          return { kind: 'array', elements, pos: tok.pos };
        }
        case '{': {
          const properties: Array<{ key: string; keyPos: number; value: JsNode }> = [];
          if (!this.atPunct('}')) {
            for (;;) {
              const keyTok = this.next();
              let key: string;
              if (keyTok.type === 'ident' || keyTok.type === 'str') {
                key = keyTok.value;
              } else if (keyTok.type === 'num') {
                key = String(keyTok.value);
              } else {
                throw new FormulaSyntaxError('Expected property name in object literal', keyTok.pos);
              }
              assertSafeProperty(key, keyTok.pos);
              this.expectPunct(':');
              const value = this.parseExpression(depth + 1);
              properties.push({ key, keyPos: keyTok.pos, value });
              if (this.eatPunct(',')) continue;
              break;
            }
          }
          this.expectPunct('}');
          return { kind: 'object', properties, pos: tok.pos };
        }
        case ';':
          // @MX:WARN: Statements are not part of the restricted grammar
          throw new FormulaSyntaxError('Statements are not allowed in formulas', tok.pos);
        case '=':
          throw new FormulaSyntaxError('Assignments are not allowed in formulas', tok.pos);
        default:
          throw new FormulaSyntaxError(`Unexpected token "${tok.value}"`, tok.pos);
      }
    }

    throw new FormulaSyntaxError('Unexpected end of formula', tok.pos);
  }

  /** '(' may start a parenthesized expression or an arrow function. */
  private parseParenthesizedOrArrow(openPos: number, depth: number): JsNode {
    // Note: the '(' token has already been consumed by parsePrimary.
    const saved = this.pos;

    // Try to recognize "( ident, ident, ... ) =>" or "( ident ) =>"
    if (this.isArrowStart()) {
      this.pos = saved;
      return this.parseArrowParamsAndBody(openPos, depth);
    }

    this.pos = saved;
    const inner = this.parseExpression(depth + 1);
    this.expectPunct(')');
    return inner;
  }

  /**
   * Detects "( ident ) =>" / "( ident, ident ) =>" starting right after '('
   * without consuming tokens permanently (caller restores this.pos).
   */
  private isArrowStart(): boolean {
    if (this.peek().type !== 'ident') return false;
    this.pos++;
    if (this.atPunct('=>')) return true;
    while (this.eatPunct(',')) {
      if (this.peek().type !== 'ident') return false;
      this.pos++;
    }
    if (!this.atPunct(')')) return false;
    this.pos++;
    return this.atPunct('=>');
  }

  /** Parses the parameter list and body of an arrow function. The opening
   * '(' has already been consumed. */
  private parseArrowParamsAndBody(openPos: number, depth: number): JsNode {
    const params: Array<{ name: string; pos: number }> = [];
    if (!this.atPunct(')')) {
      for (;;) {
        const paramTok = this.next();
        if (paramTok.type !== 'ident') {
          throw new FormulaSyntaxError('Expected parameter name', paramTok.pos);
        }
        assertSafeIdentifier(paramTok.value, paramTok.pos);
        params.push({ name: paramTok.value, pos: paramTok.pos });
        if (this.eatPunct(',')) continue;
        break;
      }
    }
    if (this.atPunct(')')) {
      this.next();
    } else if (!(params.length === 1 && this.atPunct('=>'))) {
      // "( a => b )" — parenthesized bare arrow; otherwise ')' is required
      throw new FormulaSyntaxError('Expected ")" in arrow parameter list', this.peek().pos);
    }
    this.expectPunct('=>');
    // @MX:WARN: Only single-expression bodies are allowed — no block bodies,
    // which would permit statements and variable declarations.
    const body = this.parseExpression(depth + 1);
    return { kind: 'arrow', params, body, pos: openPos };
  }
}

function assertSafeIdentifier(name: string, _pos: number): void {
  if (BLOCKED_IDENTIFIERS.has(name)) {
    throw new FormulaSecurityError(`Access to "${name}" is not allowed in formulas`);
  }
}

function assertSafeProperty(name: string, _pos: number): void {
  if (BLOCKED_PROPERTIES.has(name)) {
    throw new FormulaSecurityError(`Access to property "${name}" is not allowed in formulas`);
  }
}

// ─── Restricted JavaScript: interpreter ──────────────────────────────────────

// @MX:WARN: Allow-list of named values a formula may reference. Anything not
// listed here (e.g. `process`, `require`, `fetch`) is a security error at eval.
const ALLOWED_IDENTIFIERS = new Set([
  'context', 'issues', 'Math', 'JSON', 'Object', 'Date', 'Number', 'String', 'Boolean',
]);

/** Math methods a formula may call. */
const ALLOWED_MATH_METHODS = new Set([
  'abs', 'min', 'max', 'round', 'floor', 'ceil', 'sqrt', 'pow',
]);

/** Array methods a formula may call on arrays. */
const ALLOWED_ARRAY_METHODS = new Set([
  'filter', 'map', 'reduce', 'find', 'some', 'every', 'includes', 'indexOf',
  'slice', 'concat', 'flat', 'flatMap', 'join',
]);

/**
 * String methods a formula may call on strings.
 *
 * @MX:WARN: `match` is deliberately NOT on this list. String.prototype.match
 * coerces a string argument to a RegExp, so a hostile pattern such as
 * "(a+)+$" would trigger catastrophic backtracking (ReDoS) on the server.
 * Use includes/startsWith/endsWith instead.
 */
const ALLOWED_STRING_METHODS = new Set([
  'includes', 'startsWith', 'endsWith', 'toLowerCase', 'toUpperCase', 'trim',
  'split', 'replace', 'replaceAll',
]);

// Unique sentinels used to recognize the sandbox-provided namespace objects
// (JSON/Object/Date wrappers) at eval time. Symbols cannot be forged by
// user-supplied data (which arrives as JSON), so this is unambiguous.
const JSON_NS = Symbol('formula JSON namespace');
const OBJECT_NS = Symbol('formula Object namespace');
const DATE_NS = Symbol('formula Date namespace');

function compileJavaScriptFormula(formula: string): (context: unknown) => unknown {
  const tokens = tokenizeJs(formula);
  const parser = new JsParser(tokens);
  const ast = parser.parseProgram();

  return (context: unknown) => {
    // @MX:WARN: Null-prototype scope objects — `in` lookups can never leak
    // Object.prototype members (toString, hasOwnProperty, ...) into formulas.
    const rootScope = Object.create(null) as Record<string, unknown>;
    rootScope.context = context;
    rootScope.issues = (context as { issues?: unknown })?.issues;
    rootScope.Math = Math;
    rootScope.JSON = {
      [JSON_NS]: true,
      stringify: (v: unknown) => JSON.stringify(v),
      parse: (s: string) => JSON.parse(s),
    };
    rootScope.Object = {
      [OBJECT_NS]: true,
      keys: (o: object) => Object.keys(o),
      values: (o: object) => Object.values(o),
      entries: (o: object) => Object.entries(o),
    };
    rootScope.Date = { [DATE_NS]: true, now: () => Date.now() };
    rootScope.Number = (v?: unknown) => Number(v);
    rootScope.String = (v?: unknown) => String(v);
    rootScope.Boolean = (v?: unknown) => Boolean(v);
    return evalNode(ast, rootScope, 0);
  };
}

function evalNode(node: JsNode, scope: Record<string, unknown>, depth: number): unknown {
  if (depth > MAX_AST_DEPTH * 4) {
    throw new FormulaSyntaxError('Evaluation too deep');
  }

  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'bool': return node.value;
    case 'null': return null;
    case 'undefined': return undefined;

    case 'array':
      return node.elements.map((el) => evalNode(el, scope, depth + 1));

    case 'object': {
      const out: Record<string, unknown> = {};
      for (const prop of node.properties) {
        out[prop.key] = evalNode(prop.value, scope, depth + 1);
      }
      return out;
    }

    case 'ident': {
      // @MX:WARN: The scope chain only ever contains sandbox-provided values
      // (rootScope + arrow-function parameters), so any name found there is
      // safe to return. Unknown names are rejected against the allow-list.
      if (node.name in scope) {
        return scope[node.name];
      }
      if (!ALLOWED_IDENTIFIERS.has(node.name)) {
        throw new FormulaSecurityError(`Unknown identifier "${node.name}"`);
      }
      throw new FormulaSecurityError(`Access to "${node.name}" is not allowed in formulas`);
    }

    case 'member': {
      const object = evalNode(node.object, scope, depth + 1);
      assertSafeProperty(node.property, node.pos);
      if (object === null || object === undefined) {
        throw new FormulaSyntaxError(`Cannot read property "${node.property}" of ${object}`);
      }
      return (object as Record<string, unknown>)[node.property];
    }

    case 'call':
      return evalCall(node, scope, depth);

    case 'unary': {
      const operand = evalNode(node.operand, scope, depth + 1);
      switch (node.op) {
        case '!': return !operand;
        case '-': return -(operand as number);
        case '+': return +(operand as number);
        default: throw new FormulaSyntaxError(`Unsupported operator "${node.op}"`, node.pos);
      }
    }

    case 'binary': {
      const left = evalNode(node.left, scope, depth + 1);
      const right = evalNode(node.right, scope, depth + 1);
      switch (node.op) {
        case '+': return (left as never) + (right as never);
        case '-': return (left as number) - (right as number);
        case '*': return (left as number) * (right as number);
        case '/': return (left as number) / (right as number);
        case '%': return (left as number) % (right as number);
        case '**': return (left as number) ** (right as number);
        case '==': return looseEquals(left, right);
        case '!=': return !looseEquals(left, right);
        case '===': return left === right;
        case '!==': return left !== right;
        case '>': return (left as number) > (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<': return (left as number) < (right as number);
        case '<=': return (left as number) <= (right as number);
        default: throw new FormulaSyntaxError(`Unsupported operator "${node.op}"`, node.pos);
      }
    }

    case 'logical': {
      const left = evalNode(node.left, scope, depth + 1);
      if (node.op === '&&') {
        return left ? evalNode(node.right, scope, depth + 1) : left;
      }
      return left ? left : evalNode(node.right, scope, depth + 1);
    }

    case 'ternary': {
      const test = evalNode(node.test, scope, depth + 1);
      return test
        ? evalNode(node.consequent, scope, depth + 1)
        : evalNode(node.alternate, scope, depth + 1);
    }

    case 'arrow': {
      const closureScope = scope;
      const fn = (...args: unknown[]): unknown => {
        // @MX:REASON: Own properties hold parameters; the prototype chain holds
        // the closure scope, so inner arrows see outer parameters/identifiers.
        const local = Object.create(closureScope) as Record<string, unknown>;
        node.params.forEach((p, idx) => {
          local[p.name] = args[idx];
        });
        return evalNode(node.body, local, depth + 1);
      };
      // @MX:WARN: Strip function identity so formulas can never call .call or
      // .apply to rebind or inspect interpreter internals.
      Object.defineProperty(fn, 'name', { value: '' });
      return fn;
    }

    default:
      throw new FormulaSyntaxError('Unsupported syntax node');
  }
}

function evalCall(node: Extract<JsNode, { kind: 'call' }>, scope: Record<string, unknown>, depth: number): unknown {
  const callee = node.callee;
  const args = node.args.map((a) => evalNode(a, scope, depth + 1));

  if (callee.kind === 'member') {
    const object = evalNode(callee.object, scope, depth + 1);
    const property = callee.property;
    assertSafeProperty(property, callee.pos);

    // Math.<method>
    if (object === Math) {
      if (!ALLOWED_MATH_METHODS.has(property)) {
        throw new FormulaSecurityError(`Math.${property} is not allowed in formulas`);
      }
      return (Math as unknown as Record<string, (...a: number[]) => number>)[property](...(args as number[]));
    }

    // JSON.stringify / JSON.parse (sandbox namespace, recognized via symbol)
    if (isPlainObject(object) && (object as Record<symbol, unknown>)[JSON_NS]) {
      if (property === 'stringify') return JSON.stringify(args[0]);
      if (property === 'parse') return JSON.parse(args[0] as string);
    }

    // Object.keys / values / entries (sandbox namespace, recognized via symbol)
    if (isPlainObject(object) && (object as Record<symbol, unknown>)[OBJECT_NS]) {
      if (property === 'keys') return Object.keys(args[0] as object);
      if (property === 'values') return Object.values(args[0] as object);
      if (property === 'entries') return Object.entries(args[0] as object);
    }

    // Date.now (sandbox namespace, recognized via symbol)
    if (isPlainObject(object) && (object as Record<symbol, unknown>)[DATE_NS]) {
      if (property === 'now') return Date.now();
    }

    // Array methods
    if (Array.isArray(object)) {
      if (property === 'length') return object.length; // defensive; member case handles it
      if (!ALLOWED_ARRAY_METHODS.has(property)) {
        throw new FormulaSecurityError(`Array method "${property}" is not allowed in formulas`);
      }
      const method = (object as unknown as Record<string, (...a: unknown[]) => unknown>)[property];
      return method.apply(object, args);
    }

    // String methods
    if (typeof object === 'string') {
      // @MX:WARN: ReDoS guard — `match` coerces string arguments to RegExp, so
      // a hostile pattern like "(a+)+$" would wedge the event loop via
      // catastrophic backtracking. It is rejected with a friendly hint.
      if (property === 'match') {
        throw new FormulaSecurityError(
          'String method "match" is not available; use includes/startsWith/endsWith'
        );
      }
      if (!ALLOWED_STRING_METHODS.has(property)) {
        throw new FormulaSecurityError(`String method "${property}" is not allowed in formulas`);
      }
      // @MX:WARN: Defense-in-depth for replace/replaceAll: the grammar cannot
      // construct RegExp values (no regex literals, RegExp not in scope) and a
      // string pattern is always matched literally by the native methods, but
      // reject any non-string pattern outright in case a RegExp ever reaches
      // this branch (e.g. smuggled through context data).
      if ((property === 'replace' || property === 'replaceAll') && typeof args[0] !== 'string') {
        throw new FormulaSecurityError(
          `String method "${property}" requires a string pattern (RegExp is not allowed)`
        );
      }
      const method = (object as unknown as Record<string, (...a: unknown[]) => unknown>)[property];
      return method.apply(object, args);
    }

    throw new FormulaSyntaxError(`Cannot call "${property}" on this value`);
  }

  // Direct call of an interpreter-created arrow function (callback style)
  if (callee.kind === 'ident') {
    const fn = evalNode(callee, scope, depth + 1);
    if (typeof fn === 'function' && fn.name === '') {
      return fn(...args);
    }
    throw new FormulaSecurityError(`Calling "${callee.name}" is not allowed in formulas`);
  }

  throw new FormulaSyntaxError('Only method calls and callback invocations are supported');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JS loose equality, without allowing object coercion escapes. */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const ta = typeof a;
  const tb = typeof b;
  if (ta === 'number' && tb === 'string') return a === Number(b);
  if (ta === 'string' && tb === 'number') return Number(a) === b;
  if (ta === 'boolean') return looseEquals(Number(a), b);
  if (tb === 'boolean') return looseEquals(a, Number(b));
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max: number = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
