/**
 * Custom Formula Compiler Tests
 *
 * Covers the sandboxed replacement for the former `new Function` plugin
 * compiler: the DSL branch (COUNT/AVG/SUM/PERCENTAGE) and the restricted
 * JavaScript expression interpreter, including security rejection cases.
 */

import { describe, it, expect } from 'vitest';
import { compileCustomFormula } from '../custom-formula';
import type { TransformedIssue } from '../types';
import { KpiEngine } from '../engine';
import type { JiraIssue } from '../../jira/client';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<TransformedIssue> & { key: string }): TransformedIssue {
  return {
    project: 'TEST',
    summary: 'Test issue',
    issueType: 'Task',
    priority: 'Medium',
    status: 'Open',
    statusCategory: 'In Progress',
    assignee: 'alice@example.com',
    reporter: 'bob@example.com',
    issueOwnerTeam: null,
    created: new Date('2026-01-05T10:00:00Z'),
    updated: new Date('2026-01-06T10:00:00Z'),
    resolved: null,
    dueDate: null,
    storyPoints: null,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...overrides,
  };
}

const ISSUES: TransformedIssue[] = [
  makeIssue({ key: 'TEST-1', status: 'Done', statusCategory: 'Done', storyPoints: 3, summary: 'Implement login', resolved: new Date('2026-01-10T10:00:00Z') }),
  makeIssue({ key: 'TEST-2', status: 'Done', statusCategory: 'Done', storyPoints: 5, summary: 'CLONE of TEST-1' }),
  makeIssue({ key: 'TEST-3', status: 'Open', storyPoints: 8, summary: 'Fix logout bug' }),
  makeIssue({ key: 'TEST-4', status: 'In Progress', storyPoints: 2, summary: 'Improve performance' }),
];

function makeContext(issues: TransformedIssue[] = ISSUES) {
  return {
    issues,
    holidays: {
      dates: new Set<string>(),
      regions: [],
      workStartHour: 9,
      workEndHour: 17,
      isHoliday: () => false,
      isWorkingDay: () => true,
    },
    period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
  };
}

// ─── DSL ─────────────────────────────────────────────────────────────────────

describe('compileCustomFormula — DSL', () => {
  it('COUNT with equality condition', () => {
    const fn = compileCustomFormula('COUNT(status = "Done")', 'dsl');
    expect(fn(makeContext())).toBe(2);
  });

  it('COUNT with != condition', () => {
    const fn = compileCustomFormula('COUNT(status != "Done")', 'dsl');
    expect(fn(makeContext())).toBe(2);
  });

  it('COUNT with CONTAINS', () => {
    const fn = compileCustomFormula('COUNT(summary CONTAINS "CLONE")', 'dsl');
    expect(fn(makeContext())).toBe(1);
  });

  it('COUNT with NOT CONTAINS', () => {
    const fn = compileCustomFormula('COUNT(summary NOT CONTAINS "CLONE")', 'dsl');
    expect(fn(makeContext())).toBe(3);
  });

  it('COUNT with AND conditions', () => {
    const fn = compileCustomFormula('COUNT(status = "Done" AND storyPoints >= 5)', 'dsl');
    expect(fn(makeContext())).toBe(1);
  });

  it('COUNT with numeric comparisons', () => {
    expect(compileCustomFormula('COUNT(storyPoints > 3)', 'dsl')(makeContext())).toBe(2);
    expect(compileCustomFormula('COUNT(storyPoints <= 3)', 'dsl')(makeContext())).toBe(2);
    expect(compileCustomFormula('COUNT(storyPoints < 5)', 'dsl')(makeContext())).toBe(2);
  });

  it('AVG with WHERE clause', () => {
    const fn = compileCustomFormula('AVG(storyPoints WHERE status = "Done")', 'dsl');
    expect(fn(makeContext())).toBe(4); // (3 + 5) / 2
  });

  it('AVG without WHERE clause averages all numeric values', () => {
    const fn = compileCustomFormula('AVG(storyPoints)', 'dsl');
    expect(fn(makeContext())).toBe(4.5); // (3 + 5 + 8 + 2) / 4
  });

  it('SUM with WHERE clause', () => {
    const fn = compileCustomFormula('SUM(storyPoints WHERE status = "Done")', 'dsl');
    expect(fn(makeContext())).toBe(8);
  });

  it('SUM without WHERE clause', () => {
    const fn = compileCustomFormula('SUM(storyPoints)', 'dsl');
    expect(fn(makeContext())).toBe(18);
  });

  it('PERCENTAGE with OF clause', () => {
    const fn = compileCustomFormula('PERCENTAGE(status = "Done") OF true', 'dsl');
    expect(fn(makeContext())).toBe(50);
  });

  it('PERCENTAGE with restricted denominator', () => {
    const fn = compileCustomFormula('PERCENTAGE(summary CONTAINS "CLONE") OF status != "Open"', 'dsl');
    expect(fn(makeContext())).toBe(33.33); // 1 of 3
  });

  it('returns 0 when the denominator is empty', () => {
    const fn = compileCustomFormula('PERCENTAGE(status = "Done") OF status = "Blocked"', 'dsl');
    expect(fn(makeContext())).toBe(0);
  });

  it('supports single-quoted string literals', () => {
    const fn = compileCustomFormula("COUNT(status = 'Done')", 'dsl');
    expect(fn(makeContext())).toBe(2);
  });

  it('throws descriptive errors for invalid DSL formulas', () => {
    expect(() => compileCustomFormula('not a formula', 'dsl')).toThrow(/Invalid DSL formula/);
    expect(() => compileCustomFormula('MEDIAN(storyPoints)', 'dsl')).toThrow(/Unknown DSL function/);
  });

  it('returns 0-count instead of throwing on an empty issue list', () => {
    const fn = compileCustomFormula('COUNT(status = "Done")', 'dsl');
    expect(fn(makeContext([]))).toBe(0);
  });

  it('never throws on documented guide examples', () => {
    // Examples straight from custom_plugin_guide.md
    const guideFormulas = [
      'PERCENTAGE(summary NOT CONTAINS "CLONE") OF true',
      'AVG(storyPoints WHERE status = "Done")',
      // Syntax section of the guide
      'COUNT(status = "Done")',
      'COUNT(status != "Open")',
      'COUNT(summary CONTAINS "bug")',
      'COUNT(summary NOT CONTAINS "bug")',
      'COUNT(issues WHERE status = "Done")',
      'COUNT(true)',
      'COUNT(status = "Done" AND storyPoints > 1)',
      'COUNT(status = "Done" OR status = "Open")',
      'SUM(storyPoints WHERE status = "Done")',
      'PERCENTAGE(status = "Done") OF true',
    ];
    for (const formula of guideFormulas) {
      const fn = compileCustomFormula(formula, 'dsl');
      expect(() => fn(makeContext())).not.toThrow();
      expect(typeof fn(makeContext())).toBe('number');
    }
  });

  it('supports the guide COUNT(issues WHERE ...) shape', () => {
    const fn = compileCustomFormula('COUNT(issues WHERE status = "Done")', 'dsl');
    expect(fn(makeContext())).toBe(2);
  });

  it('throws on unrecognized conditions instead of matching every issue', () => {
    // Missing space after "=" previously fell through to applyFilter() and
    // silently counted ALL issues.
    expect(() => compileCustomFormula('COUNT(status="Done")', 'dsl'))
      .toThrow(/Unrecognized condition/);
    expect(() => compileCustomFormula('COUNT(this is gibberish)', 'dsl'))
      .toThrow(/Unrecognized condition/);
    expect(() => compileCustomFormula('PERCENTAGE(status = "Done") OF nonsense here', 'dsl'))
      .toThrow(/Unrecognized condition/);
    expect(() => compileCustomFormula('AVG(storyPoints WHERE totally unknown)', 'dsl'))
      .toThrow(/Unrecognized condition/);
  });

  it('includes the offending text in the unrecognized-condition error', () => {
    expect(() => compileCustomFormula('COUNT(status="Done")', 'dsl'))
      .toThrow(/status="Done"/);
  });

  it('supports IN and NOT IN conditions', () => {
    expect(compileCustomFormula('COUNT(status IN ("Done", "Open"))', 'dsl')(makeContext())).toBe(3);
    expect(compileCustomFormula('COUNT(status NOT IN ("Done"))', 'dsl')(makeContext())).toBe(2);
  });
});

// ─── Restricted JavaScript ───────────────────────────────────────────────────

describe('compileCustomFormula — restricted JavaScript', () => {
  it('evaluates issues.filter(...).length', () => {
    const fn = compileCustomFormula('issues.filter(i => i.status == "Done").length', 'javascript');
    expect(fn(makeContext())).toBe(2);
  });

  it('evaluates Math expressions', () => {
    const fn = compileCustomFormula('Math.round(Math.max(1, 2.7) * 10) / 10', 'javascript');
    expect(fn(makeContext())).toBe(2.7);
  });

  it('evaluates a reduce-based average', () => {
    const formula =
      'issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0) / issues.length';
    const fn = compileCustomFormula(formula, 'javascript');
    expect(fn(makeContext())).toBe(4.5);
  });

  it('supports arithmetic, unary and exponent operators', () => {
    expect(compileCustomFormula('1 + 2 * 3', 'javascript')(makeContext())).toBe(7);
    expect(compileCustomFormula('(1 + 2) * 3', 'javascript')(makeContext())).toBe(9);
    expect(compileCustomFormula('2 ** 10', 'javascript')(makeContext())).toBe(1024);
    expect(compileCustomFormula('-5 + 3', 'javascript')(makeContext())).toBe(-2);
    expect(compileCustomFormula('10 % 3', 'javascript')(makeContext())).toBe(1);
  });

  it('supports comparisons, logic and ternary', () => {
    expect(compileCustomFormula('1 < 2 && 2 <= 2', 'javascript')(makeContext())).toBe(true);
    expect(compileCustomFormula('1 === 1 ? "yes" : "no"', 'javascript')(makeContext())).toBe('yes');
    expect(compileCustomFormula('!false', 'javascript')(makeContext())).toBe(true);
    expect(compileCustomFormula('1 !== 2 || false', 'javascript')(makeContext())).toBe(true);
  });

  it('supports context member access', () => {
    const fn = compileCustomFormula('context.issues.length', 'javascript');
    expect(fn(makeContext())).toBe(4);
  });

  it('supports string methods', () => {
    const fn = compileCustomFormula(
      'issues.filter(i => i.summary.includes("bug") || i.summary.startsWith("Improve")).length'
    , 'javascript');
    expect(fn(makeContext())).toBe(2);
  });

  it('rejects String.match (ReDoS) with a friendly hint', () => {
    expect(() => {
      const fn = compileCustomFormula('"abc".match("a")', 'javascript');
      fn(makeContext());
    }).toThrow(/match" is not available; use includes\/startsWith\/endsWith/);
  });

  it('supports replace/replaceAll with literal string patterns', () => {
    // Regex metacharacters must stay literal — no pattern interpretation.
    expect(compileCustomFormula('"a.b".replace(".", "-")', 'javascript')(makeContext())).toBe('a-b');
    expect(compileCustomFormula('"aaa".replaceAll("a", "b")', 'javascript')(makeContext())).toBe('bbb');
  });

  it('rejects replace/replaceAll with non-string patterns', () => {
    expect(() => {
      const fn = compileCustomFormula('"abc".replace(1, "x")', 'javascript');
      fn(makeContext());
    }).toThrow(/requires a string pattern/);
    expect(() => {
      const fn = compileCustomFormula('"abc".replaceAll(false, "x")', 'javascript');
      fn(makeContext());
    }).toThrow(/requires a string pattern/);
  });

  it('supports Object.keys / JSON round-trips / Date.now', () => {
    expect(compileCustomFormula('Object.keys({ a: 1, b: 2 }).length', 'javascript')(makeContext())).toBe(2);
    expect(compileCustomFormula('JSON.parse(JSON.stringify([1, 2])).length', 'javascript')(makeContext())).toBe(2);
    expect(typeof compileCustomFormula('Date.now()', 'javascript')(makeContext())).toBe('number');
  });

  it('supports Number/String/Boolean conversions', () => {
    expect(compileCustomFormula('Number("3.5") + 1', 'javascript')(makeContext())).toBe(4.5);
    expect(compileCustomFormula('String(42)', 'javascript')(makeContext())).toBe('42');
    expect(compileCustomFormula('Boolean(1)', 'javascript')(makeContext())).toBe(true);
  });

  it('supports array literals and methods', () => {
    expect(compileCustomFormula('[1, 2, 3].map(x => x * 2).reduce((a, b) => a + b, 0)', 'javascript')(makeContext())).toBe(12);
    expect(compileCustomFormula('[1, 2, 3].concat([4]).slice(1, 3).join("-")', 'javascript')(makeContext())).toBe('2-3');
    expect(compileCustomFormula('[1, 2, 3].includes(2)', 'javascript')(makeContext())).toBe(true);
    expect(compileCustomFormula('[1, 2, 3].every(x => x > 0)', 'javascript')(makeContext())).toBe(true);
    expect(compileCustomFormula('[1, 2, 3].some(x => x > 2)', 'javascript')(makeContext())).toBe(true);
    expect(compileCustomFormula('[1, 2, 3].find(x => x === 2)', 'javascript')(makeContext())).toBe(2);
  });

  it('supports bracket access with literal string keys', () => {
    const fn = compileCustomFormula('issues[0]["status"]', 'javascript');
    expect(fn(makeContext())).toBe('Done');
  });

  it('returns object/array results as-is for KpiResult wrapping', () => {
    const fn = compileCustomFormula(
      '[{ name: "Done Count", value: issues.filter(i => i.status == "Done").length, unit: "count" }]',
      'javascript'
    );
    const result = fn(makeContext());
    expect(result).toEqual([{ name: 'Done Count', value: 2, unit: 'count' }]);
  });

  it('supports nested arrow callbacks with multiple parameters', () => {
    const fn = compileCustomFormula(
      'issues.map(i => i.storyPoints || 0).reduce((acc, v) => acc + v, 0)',
      'javascript'
    );
    expect(fn(makeContext())).toBe(18);
  });

  it('ignores JS comments', () => {
    const formula = `
      // count done issues
      issues.filter(i => i.status == "Done").length /* trailing comment */
    `;
    expect(compileCustomFormula(formula, 'javascript')(makeContext())).toBe(2);
  });
});

// ─── Security rejections ─────────────────────────────────────────────────────

describe('compileCustomFormula — security rejections', () => {
  const rejectionCases: Array<[string, string]> = [
    ['process.env', 'process.env.SECRET'],
    ['constructor', '"".constructor'],
    ['constructor via bracket', 'issues[0]["constructor"]'],
    ['__proto__', 'issues.__proto__'],
    ['prototype', 'Math.prototype'],
    ['assignment', 'a = 1'],
    ['compound assignment', 'issues.length += 1'],
    ['statements with semicolon', '1 + 1; issues'],
    ['import keyword', 'import'],
    ['require call', 'require("fs")'],
    ['fetch call', 'fetch("http://evil.example")'],
    ['Function identifier', 'Function'],
    ['eval identifier', 'eval("1")'],
    ['globalThis', 'globalThis'],
    ['new expression', 'new Date()'],
    ['this keyword', 'this.issues'],
    ['arguments object', 'arguments'],
    ['template literal', '`hello`'],
    ['block arrow body', 'issues.filter(i => { return true; }).length'],
    ['non-literal bracket key', 'issues[issues.length - 1]'],
    ['array method not in allow-list', '[1, 2].push(3)'],
    ['Math method not in allow-list', 'Math.random()'],
  ];

  for (const [label, formula] of rejectionCases) {
    it(`rejects ${label}: ${formula}`, () => {
      expect(() => {
        const fn = compileCustomFormula(formula, 'javascript');
        fn(makeContext());
      }).toThrow();
    });
  }

  it('rejects formulas longer than 10,000 characters', () => {
    const longFormula = `1 + ${'('.repeat(10_001)}`;
    expect(() => compileCustomFormula(longFormula, 'javascript')).toThrow(/maximum length/);
  });

  it('rejects deeply nested expressions', () => {
    const deep = '('.repeat(100) + '1' + ')'.repeat(100);
    expect(() => compileCustomFormula(deep, 'javascript')).toThrow();
  });

  it('process.env is not reachable even with indirect member chains', () => {
    expect(() => {
      const fn = compileCustomFormula('context.constructor', 'javascript');
      fn(makeContext());
    }).toThrow();
  });
});

// ─── Engine wiring ───────────────────────────────────────────────────────────

describe('KpiEngine.registerCustomPlugin wiring', () => {
  function jiraIssue(key: string, fields: Partial<JiraIssue['fields']> = {}): JiraIssue {
    return {
      key,
      self: `https://example.atlassian.net/rest/api/2/issue/${key}`,
      fields: {
        summary: 'Issue',
        issuetype: { name: 'Task' },
        status: { name: 'Open', statusCategory: { name: 'In Progress' } },
        created: '2026-01-05T10:00:00.000+0000',
        updated: '2026-01-06T10:00:00.000+0000',
        ...fields,
      },
    };
  }

  const baseDef = {
    name: 'Custom Metric',
    description: 'test',
    category: 'custom' as const,
    unit: 'count',
  };

  function buildEngine(): KpiEngine {
    const engine = new KpiEngine();
    engine.clearCustomPlugins();
    return engine;
  }

  it('compiles and runs a DSL plugin through the engine', () => {
    const engine = buildEngine();
    const plugin = engine.registerCustomPlugin({
      id: 'dsl-test',
      ...baseDef,
      formula: 'COUNT(status = "Done")',
      language: 'dsl',
    });
    const issues = [
      jiraIssue('A-1', { status: { name: 'Done', statusCategory: { name: 'Done' } } }),
      jiraIssue('A-2', { status: { name: 'Open', statusCategory: { name: 'In Progress' } } }),
    ];
    const result = engine.calculate(
      'dsl-test', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].value).toBe(1);
    expect(result[0].unit).toBe('count');
    expect(plugin.calculate).toBeDefined();
  });

  it('compiles and runs a restricted-JS plugin through the engine', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'js-test',
      ...baseDef,
      formula: 'issues.filter(i => i.status == "Done").length',
      language: 'javascript',
    });
    const issues = [
      jiraIssue('B-1', { status: { name: 'Done', statusCategory: { name: 'Done' } } }),
      jiraIssue('B-2', { status: { name: 'Done', statusCategory: { name: 'Done' } } }),
      jiraIssue('B-3', { status: { name: 'Open', statusCategory: { name: 'In Progress' } } }),
    ];
    const result = engine.calculate(
      'js-test', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].value).toBe(2);
  });

  it('a restricted-JS plugin returning a KpiResult array is passed through', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'js-result-test',
      ...baseDef,
      formula: '[{ name: "Done", value: issues.filter(i => i.status == "Done").length, unit: "count" }]',
      language: 'javascript',
    });
    const issues = [
      jiraIssue('C-1', { status: { name: 'Done', statusCategory: { name: 'Done' } } }),
    ];
    const result = engine.calculate(
      'js-result-test', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].name).toBe('Done');
    expect(result[0].value).toBe(1);
  });

  it('a malicious formula is rejected and does not crash the engine', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'evil-test',
      ...baseDef,
      formula: 'process.env',
      language: 'javascript',
    });
    const issues = [jiraIssue('D-1')];
    // Must not throw; the plugin returns a safe zero/error result instead.
    const result = engine.calculate(
      'evil-test', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].value).toBe(0);
  });

  it('an invalid DSL formula degrades to a parse-error result, not a crash', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'bad-dsl',
      ...baseDef,
      formula: 'this is not valid',
      language: 'dsl',
    });
    const issues = [jiraIssue('E-1')];
    const result = engine.calculate(
      'bad-dsl', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].value).toBe(0);
  });

  it('an unrecognized DSL condition degrades to a parse-error result, not a wrong count', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'bad-condition',
      ...baseDef,
      // Missing space after "=" — previously counted every issue silently.
      formula: 'COUNT(status="Done")',
      language: 'dsl',
    });
    const issues = [
      jiraIssue('F-1', { status: { name: 'Done', statusCategory: { name: 'Done' } } }),
      jiraIssue('F-2', { status: { name: 'Open', statusCategory: { name: 'In Progress' } } }),
    ];
    const result = engine.calculate(
      'bad-condition', issues, { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].value).toBe(0);
  });

  it('sanitizes JS result objects: NaN becomes 0, name/unit get defaults', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'sanitize-object',
      ...baseDef,
      formula: '{ value: 0 / 0 }',
      language: 'javascript',
    });
    const result = engine.calculate(
      'sanitize-object', [jiraIssue('G-1')], { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0);
    expect(result[0].name).toBe('Custom Metric');
    expect(result[0].unit).toBe('count');
  });

  it('drops non-object entries from JS result arrays', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'sanitize-drop',
      ...baseDef,
      formula: '[{ name: "OK", value: 5, unit: "count" }, 42, null, issues.filter]',
      language: 'javascript',
    });
    const result = engine.calculate(
      'sanitize-drop', [jiraIssue('H-1')], { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OK');
    expect(result[0].value).toBe(5);
  });

  it('coerces function-valued fields: value becomes 0, details entries dropped', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'sanitize-fn-value',
      ...baseDef,
      formula: '[{ name: "F", value: issues.filter, unit: "u", details: [{ label: "x", value: issues.filter }, "junk"] }]',
      language: 'javascript',
    });
    const result = engine.calculate(
      'sanitize-fn-value', [jiraIssue('I-1')], { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0); // Number(function) is NaN → 0
    // The engine's weekly breakdown appends its own detail entries, so assert
    // on containment: the sanitized entry survives, the "junk" string is gone.
    expect(result[0].details).toContainEqual({ label: 'x', value: 0 });
    expect(result[0].details).not.toContainEqual('junk');
  });

  it('handles scalar JS results with an explicit isFinite guard', () => {
    const engine = buildEngine();
    const cases: Array<[string, number]> = [
      ['0', 0],           // legitimate zero must survive
      ['21 * 2', 42],
      ['0 / 0', 0],       // NaN → 0
      ['1 / 0', 0],       // Infinity → 0
    ];
    let idx = 0;
    for (const [formula, expected] of cases) {
      const id = `scalar-case-${idx++}`;
      engine.registerCustomPlugin({ id, ...baseDef, formula, language: 'javascript' });
      const result = engine.calculate(
        id, [jiraIssue('J-1')], { regions: [] },
        { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
      );
      expect(result[0].value).toBe(expected);
      expect(result[0].name).toBe('Custom Metric');
      expect(result[0].unit).toBe('count');
    }
  });

  it('sanitizes details in guide-style JS results but keeps valid entries', () => {
    const engine = buildEngine();
    engine.registerCustomPlugin({
      id: 'sanitize-details',
      ...baseDef,
      formula: '[{ name: "With Details", value: 2, unit: "count", details: [{ label: "Total", value: 4, unit: "issues" }] }]',
      language: 'javascript',
    });
    const result = engine.calculate(
      'sanitize-details', [jiraIssue('K-1')], { regions: [] },
      { start: new Date('2026-01-01'), end: new Date('2026-01-31') }
    );
    expect(result[0].name).toBe('With Details');
    expect(result[0].value).toBe(2);
    expect(result[0].details).toContainEqual({ label: 'Total', value: 4, unit: 'issues' });
  });
});
