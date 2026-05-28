---
name: code-review-performance
description: >
  Performance code review skill for Next.js/TypeScript projects. Analyzes
  bundle size, render performance, data fetching efficiency, memory leaks,
  and optimization opportunities. Use when optimizing app performance,
  auditing bundle size, or fixing slow page loads.
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
  tags: "performance, code review, bundle size, nextjs, react, prisma"

# MoAI Extension: Triggers
triggers:
  keywords: ["performance review", "optimization", "bundle size", "render performance", "n+1 query", "memory leak", "data fetching", "tanstack query"]
  agents: ["performance-reviewer"]
  phases: ["review"]
  languages: ["typescript", "javascript"]
---

# Performance Code Review Skill

## Core Focus Areas
- **Next.js Performance**: Server vs Client components, data fetching patterns, caching strategies, route optimization
- **React Performance**: Re-render prevention, proper dependency arrays, useMemo/useCallback usage, context optimization
- **Bundle Optimization**: Tree shaking, code splitting, lazy loading, third-party library size audit
- **Data Fetching**: N+1 query detection in Prisma, cache invalidation, over-fetching, request deduplication
- **Memory Leaks**: Uncleaned event listeners, lingering subscriptions, retained references

## Performance Patterns to Grep

Look for these patterns indicating potential issues:
```
useEffect(.*\[.*\])
useMemo
useCallback
prisma.findMany
prisma.findUnique
.map(. => .find)
.map(. => .fetch)
useQuery(
dangerouslySetInnerHTML  # Unrelated but scan anyway
console.log
```

## Review Methodology
1. **Bundle analysis**: Check for large dependencies, unused code, duplication
2. **Render performance**: Identify unnecessary re-renders, expensive computations during render
3. **Data fetching audit**: Look for N+1 queries, missing cache, over-fetching
4. **Memory leak scan**: Check useEffect cleanup, subscription management
5. **Caching strategy**: Verify proper use of React Query cache, Next.js data cache

## Severity Levels
- **Critical**: Severe impact (OOM risk, 10+ second load times)
- **High**: Significant impact (bundle bloat >500KB, N+1 queries)
- **Medium**: Moderate impact (unnecessary re-renders, missing memoization)
- **Low**: Minor optimization opportunity

## Project-Specific Context
Jira ETL Dashboard - focus on:
- ETL pipeline efficiency
- Jira API pagination and batch processing
- Dashboard render performance
- Incremental sync optimization
- Prisma query optimization