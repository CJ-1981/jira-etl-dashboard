# Custom Plugin Guide: DSL & JavaScript

This guide explains how to create custom KPI plugins for the Jira ETL Dashboard. You can use either the built-in **Domain Specific Language (DSL)** for simple filters or **JavaScript** for complex logic.

## 1. Using the DSL (Formula)

The DSL is designed for quick calculations using common functions. It now supports `CONTAINS` and `NOT CONTAINS` operators.

### Syntax
- `COUNT(issues WHERE <condition>)`
- `AVG(<field> WHERE <condition>)`
- `SUM(<field> WHERE <condition>)`
- `PERCENTAGE(<numerator_condition>) OF <denominator_condition>`

### Available Conditions
- `field = "value"`
- `field != "value"`
- `field CONTAINS "substring"` (Case-sensitive)
- `field NOT CONTAINS "substring"` (Case-sensitive)

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

### Context Object
Your JavaScript code has access to a `context` object:
- `context.issues`: Array of transformed Jira issues.
- `context.holidays`: Holiday and working hour configurations.
- `context.slaTargets`: Per-status SLA targets.
- `context.period`: The analysis date range.

### Example: SLA Plugin excluding Clones
If you wanted to implement the "Exclude CLONE" logic manually in a custom JS plugin:

```javascript
// 1. Filter the issues
const filteredIssues = context.issues.filter(issue => !issue.summary.includes('CLONE'));

// 2. Re-use existing context with filtered issues
const filteredContext = { ...context, issues: filteredIssues };

// 3. Perform calculation (in a real plugin, you'd implement the logic here)
// This is a simplified example returning a static result
return [{
  name: "SLA (Excl. Clones)",
  value: 85.5,
  unit: "%",
  details: [
    { label: "Total Issues Analyzed", value: filteredIssues.length }
  ]
}];
```

### Tips for JavaScript Plugins
- **Issue Transitions**: Use `issue.transitions` to track status history.
- **Business Hours**: You can call calculation utilities if they are exposed, or implement your own logic using `context.holidays`.
- **Return Format**: Always return an array of `KpiResult` objects: `[{ name, value, unit, dimensions?, details? }]`.

---

## 3. How to Register

Custom plugins are typically registered via the `KpiEngine.registerCustomPlugin` method in the backend or through the **Plugin Studio** in the UI.

- **DSL Plugin**: Set `language: 'dsl'` and provide the formula.
- **JS Plugin**: Set `language: 'javascript'` and provide the function body.
