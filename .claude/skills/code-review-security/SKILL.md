---
name: code-review-security
description: >
  Security code review skill for Next.js/TypeScript projects. Identifies OWASP
  vulnerabilities, injection risks, authentication issues, data exposure, and
  security misconfigurations. Use when auditing code security, performing
  security reviews, or validating authentication/authorization implementations.
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
  tags: "security, code review, owasp, nextjs, typescript"

# MoAI Extension: Triggers
triggers:
  keywords: ["security review", "security audit", "vulnerability", "owasp", "injection", "xss", "authentication", "authorization", "csrf", "sql injection"]
  agents: ["security-reviewer"]
  phases: ["review"]
  languages: ["typescript", "javascript"]
---

# Security Code Review Skill

## Core Focus Areas
- **OWASP Top 10**: Injection, broken authentication, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, vulnerable components, insufficient logging
- **Next.js Specifics**: Server Actions security, route handlers validation, middleware auth checks, data fetching security, client-side exposure
- **TypeScript Safety**: Type validation boundaries, any type usage at trust boundaries, unsafe type assertions
- **Prisma Security**: SQL injection prevention, query sanitization, sensitive field handling

## High-Risk Patterns to Grep

Always grep for these dangerous patterns:
```
dangerouslySetInnerHTML
eval(
innerHTML =
document.write
user-provided HTML
unsanitized
Prisma.sql`
prisma.$queryRaw
prisma.$executeRaw
```

## Review Methodology
1. **Identify trust boundaries**: Where untrusted data enters the system
2. **Trace data flow**: How user input flows through components
3. **Verify validation**: Ensure validation exists on both client and server
4. **Check authentication**: Verify auth checks protect sensitive routes
5. **Inspect sensitive data**: Ensure proper encryption, redaction, minimal exposure
6. **Audit dependencies**: Check package.json for known vulnerable dependencies

## Severity Levels
- **Critical**: Immediate fix required
- **High**: Fix soon
- **Medium**: Fix when convenient
- **Low**: Suggestion for improvement

## Project-Specific Context
Jira ETL Dashboard - focus on:
- Jira API credentials handling
- ETL pipeline data safety
- Access control to sensitive Jira data
- Prisma query security
- Server Actions validation