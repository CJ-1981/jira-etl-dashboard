# Custom Plugin Guide: DSL & JavaScript

This guide explains how to create custom KPI plugins for the Jira ETL Dashboard. You can use either the built-in **Domain Specific Language (DSL)** for simple filters or **JavaScript** for complex logic.

## 1. Using the DSL (Formula)

The DSL is designed for quick calculations using common functions. Parsing is strict: an
unrecognized condition raises an error (shown as a "Parse Error" result) instead of
silently matching everything — so typos surface immediately.

### Syntax
- `COUNT(issues WHERE <condition>)` — the `issues WHERE` prefix is optional; `COUNT(<condition>)` works too
- `AVG(<field> WHERE <condition>)`
- `SUM(<field> WHERE <condition>)`
- `PERCENTAGE(<numerator_condition>) OF <denominator_condition>`

### Available Conditions
- `field = "value"` — a space **after** `=` is required (`status = "Done"`, not `status="Done"`)
- `field != "value"`
- `field > 5`, `field >= 5`, `field < 5`, `field <= 5` (numeric comparison)
- `field IN ("Done", "Closed")` / `field NOT IN ("To Do", "Blocked")` — comma-separated, quotes optional; for multi-value fields (labels, components) matches if any element is in the list
- `field CONTAINS "substring"` (case-insensitive)
- `field NOT CONTAINS "substring"` (case-insensitive)
- Conditions can be combined with `AND` / `OR` (OR binds loosest) (Case-sensitive)

### Example: Exclude Clones using DSL
To calculate the percentage of tickets that are NOT clones:
```sql
PERCENTAGE(summary NOT CONTAINS "CLONE") OF true
```

### Example: Average Story Points for Done Tasks
```sql
AVG(storyPoints WHERE status = "Done")
```

---

## 2. Using JavaScript

For complex logic like the SLA calculation (which involves transitions and comment-based clock resets), JavaScript is the preferred method.

> **Security note:** custom JavaScript is evaluated by a sandboxed expression interpreter —
> arbitrary code execution (`new Function`/`eval`) was removed. Formulas must be a **single
> expression** (no statements, no `const`/`let`, no `return` keyword): compute the value and
> let the expression itself produce it. Only an allow-list of methods is available
> (Math, Array/String/Object/JSON helpers, Date.now). Access to `process`, `require`,
> `fetch`, constructors, prototypes, and globals is rejected.

### Context Object
Your JavaScript expression has access to a `context` object:
- `context.issues`: Array of transformed Jira issues (also available directly as `issues`).
- `context.holidays`: Holiday and working hour configurations.
- `context.slaTargets`: Per-status SLA targets.
- `context.period`: The analysis date range.

> **Warning:** `context.holidays` is a placeholder for formula plugins — its date set is
> empty and `isWorkingDay`/`isHoliday` are stubs. Holiday-aware business-day math cannot be
> done in a formula; implement such metrics as compiled TypeScript plugins instead
> (`src/lib/kpi/plugins/builtin/...`, using `calculateWorkingDays`/`calculateBusinessHours`
> from `src/lib/holidays/german-holidays.ts`).

### Fields available on issues
DSL conditions and `getFieldValue` resolve these named fields:
`storyPoints`, `priority`, `status`, `statusCategory`, `issueType`, `assignee`, `reporter`,
`labels`, `components`, `resolved`, `key`, `project`, `summary`, `description`, and
`timeInStatus.<StatusName>` (hours spent in a status). Unknown names fall back to raw issue
properties, so DSL can also reach e.g. `issueOwnerTeam`.

JavaScript formulas can additionally use any transformed-issue property directly:
- `issue.comments` — `[{ author, created }]`, chronologically sorted
- `issue.transitions` — `[{ fromStatus, toStatus, author, occurredAt }]`, status history
- `issue.dueDate`, `issue.created`, `issue.updated`, `issue.resolved` — `Date` values (or `null`)

### Example: SLA Plugin excluding Clones
If you wanted to implement the "Exclude CLONE" logic manually in a custom JS plugin, write a
single expression that produces the result array (no intermediate variables — repeat or
compose `filter` calls instead):

```javascript
[{
  name: "SLA (Excl. Clones)",
  value: issues.filter(issue => !issue.summary.includes('CLONE')).length > 0
    ? Math.round((issues.filter(issue => !issue.summary.includes('CLONE') && issue.status === "Done").length / issues.filter(issue => !issue.summary.includes('CLONE')).length) * 1000) / 10
    : 0,
  unit: "%",
  details: [
    { label: "Total Issues Analyzed", value: issues.filter(issue => !issue.summary.includes('CLONE')).length }
  ]
}]
```

### Example: Rework detection from status transitions
Tickets that bounced back to a status they already passed through (A→B→A loops). Note the
accumulator pattern: `new Set()` and assignments are not available in the sandbox, so a
plain object in a `reduce` stands in for a set, and multi-parameter arrow callbacks
(`(t, k) =>`) give you the element index:

```javascript
[{
  name: "Rework Tickets (Status Ping-Pong)",
  value: issues.filter(i => (i.transitions || []).length > 0 &&
    (i.transitions || []).some((t, k) =>
      t.toStatus === i.transitions[0].fromStatus ||
      (i.transitions || []).slice(0, k).some(p => p.toStatus === t.toStatus))).length,
  unit: "tickets"
}]
```

### Tips for JavaScript Plugins
- **Single expression**: use arrow functions and ternaries instead of statements
  (`condition ? a : b` instead of `if`).
- **No mutation**: `new Set`/`new Map`, `new` in general, and assignments are rejected.
  Thread state through `reduce` with a plain-object accumulator instead.
- **Issue Transitions**: Use `issue.transitions` to track status history (see example above).
- **Business Hours**: not possible in formulas — `context.holidays` is a stub (see warning
  above). Use a compiled TypeScript plugin for holiday/weekend-aware metrics.
- **Return Format**: Always produce an array of `KpiResult` objects: `[{ name, value, unit, dimensions?, details? }]`.

---

## 3. How to Register

Custom plugins are typically registered via the `KpiEngine.registerCustomPlugin` method in the backend or through the **Plugin Studio** in the UI.

- **DSL Plugin**: Set `language: 'dsl'` and provide the formula.
- **JS Plugin**: Set `language: 'javascript'` and provide a single expression (see the sandbox note above).
