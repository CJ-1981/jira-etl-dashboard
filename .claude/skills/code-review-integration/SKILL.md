---
name: code-review-integration
description: >
  Integration QA review skill for Next.js/TypeScript projects. Verifies end-to-end
  coherence, API ↔ frontend contracts, routing integrity, state consistency, and
  cross-component compatibility. Uses "both sides read simultaneously" principle.
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
  tags: "integration, qa, contract testing, api, frontend, routing, state consistency"

# MoAI Extension: Triggers
triggers:
  keywords: ["integration review", "contract testing", "api frontend", "routing integrity", "state consistency", "end-to-end", "component integration"]
  agents: ["integration-qa"]
  phases: ["review"]
  languages: ["typescript", "javascript"]
---

# Integration QA Review Skill

## Core Principle: "Both Sides Read Simultaneously"
For every boundary review:
1. **Read both sides** of the boundary simultaneously
2. **Compare contracts** (types, validation, expected behavior)
3. **Verify consistency** - mismatches are bugs
4. **Validate end-to-end** - does the data flow correctly through all layers?

## Core Focus Areas
- **API ↔ Frontend Contract**: Type consistency between API responses and frontend expectations
- **Routing Integrity**: Link correctness, route parameter validation, middleware execution
- **State Consistency**: Server state (Prisma) ↔ Client state (TanStack Query) synchronization
- **Component Integration**: Parent-child component data flow, context provider/consumer contracts
- **ETL Pipeline End-to-End**: Jira API → transformation → Prisma → Dashboard flow
- **Electron IPC**: Main ↔ Renderer process communication contracts

## Boundary Review Checklist

### API ↔ Frontend
- Read API Route Handler definition
- Read frontend TanStack Query usage
- Compare types, parameters, error handling
- Verify validation exists on both sides

### Routing & Navigation
- Read page component and its expected params
- Read link destinations pointing to it
- Read middleware protecting it
- Verify consistency across all

### State Flow
- Read Prisma schema for data model
- Read Server Action that modifies it
- Read frontend component that displays it
- Read TanStack Query invalidation logic
- Verify end-to-end consistency

## Severity Levels
- **Critical**: Broken integration (type mismatch causes crash)
- **High**: Major integration issue (missing cache invalidation)
- **Medium**: Moderate integration issue (type mismatch but still works)
- **Low**: Minor improvement (better type sharing possible)

## Project-Specific Context
Jira ETL Dashboard - focus on:
- ETL pipeline end-to-end flow
- Jira API ↔ Prisma ↔ Dashboard consistency
- Electron main ↔ renderer IPC contracts
- Form submission flows