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

### Tips for JavaScript Plugins
- **Single expression**: use arrow functions and ternaries instead of statements
  (`condition ? a : b` instead of `if`).
- **Issue Transitions**: Use `issue.transitions` to track status history.
- **Business Hours**: Implement your own logic using `context.holidays` (calculation
  utilities are not exposed to the sandbox).
- **Return Format**: Always produce an array of `KpiResult` objects: `[{ name, value, unit, dimensions?, details? }]`.

---

## 3. How to Register

Custom plugins are typically registered via the `KpiEngine.registerCustomPlugin` method in the backend or through the **Plugin Studio** in the UI.

- **DSL Plugin**: Set `language: 'dsl'` and provide the formula.
- **JS Plugin**: Set `language: 'javascript'` and provide a single expression (see the sandbox note above).
