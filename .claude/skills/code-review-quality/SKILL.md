---
name: code-review-quality
description: >
  Code quality and maintainability review skill for Next.js/TypeScript projects.
  Enforces TypeScript best practices, consistent styling, clean architecture,
  test coverage, and maintainability patterns. Use when auditing code quality,
  refactoring, or establishing coding standards.
license: Apache-2.0
compatibility: Designed for Claude Code
allowed-tools: Read, Grep, Glob
user-invocable: true
metadata:
  version: "1.0.0"
  category: "domain"
  status: "active"
  updated: "2026-05-27"
  modularized: "false"
  tags: "code quality, clean code, typescript, maintainability, best practices, test coverage"

# MoAI Extension: Triggers
triggers:
  keywords: ["code quality", "clean code", "maintainability", "best practices", "typescript strict", "test coverage", "code smell", "refactoring"]
  agents: ["code-quality-reviewer"]
  phases: ["review"]
  languages: ["typescript", "javascript"]
---

# Code Quality Review Skill

## Core Focus Areas
- **TypeScript Best Practices**: Strict mode adherence, proper typing, avoiding any, type safety at boundaries
- **Clean Code**: Naming conventions, function size/complexity, SOLID principles, DRY vs WET
- **Architecture**: Separation of concerns, component organization, directory structure
- **Testing**: Test coverage, test quality, test isolation, mocking practices
- **Consistency**: Code style, pattern usage, imports order, naming conventions

## Code Smells to Grep

Look for these patterns indicating quality issues:
```
: any
as any
// TODO
// FIXME
console.log
debugger
function.*\(.*\) \{[\s\S]{200,}  # Long functions
if \(.*\) \{[\s\S]{100,}        # Deep nesting
```

## Review Methodology
1. **Type safety scan**: Check for any type usage, unsafe assertions, missing types
2. **Code smell detection**: Look for common anti-patterns
3. **Architecture consistency**: Verify adherence to project structure and patterns
4. **Test quality review**: Assess test coverage, test effectiveness, and maintainability
5. **Consistency check**: Ensure patterns are applied uniformly across the codebase

## Quality Gates
Verify that:
- TypeScript compiles without errors
- No ESLint errors/warnings
- Test coverage meets project thresholds
- No debug code or console.logs in production paths

## Severity Levels
- **Critical**: Blocking issue (broken build, missing critical tests)
- **High**: Major quality issue (severe duplication, god object)
- **Medium**: Moderate quality issue (inconsistent naming, missing tests)
- **Low**: Minor improvement (formatting, comment improvement)

## Project-Specific Context
Jira ETL Dashboard - focus on:
- ETL pipeline maintainability
- Jira API client quality
- React component organization
- Type safety across layers
- Test coverage for critical paths