# GitHub Workflows

This directory contains GitHub Actions workflows for continuous integration.

## CI Workflow

The `ci.yml` workflow runs on every push and pull request to the `main` and `develop` branches.

### Jobs

#### Test Job
- Runs tests on Node.js 18.x and 20.x
- Generates coverage reports using Vitest
- Uploads coverage to Codecov
- Archives coverage reports as artifacts

#### Lint Job
- Runs ESLint to check code quality
- Uses Node.js 20.x

#### Type Check Job
- Runs TypeScript type checking
- Uses Node.js 20.x

## Codecov Setup

### 1. Get Your Codecov Token

1. Go to https://codecov.io
2. Sign in with your GitHub account
3. Add your repository
4. Copy your upload token from Settings > Organization > Upload Token

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Name: `CODECOV_TOKEN`
5. Paste your Codecov token
6. Click "Add secret"

### 3. Coverage Configuration

Coverage settings are configured in `codecov.yml` at the repository root:

- **Project coverage target**: 80% (informational)
- **Patch coverage target**: 75% (informational)
- **Ignored paths**: node_modules, .next, type definitions, configs

### 4. View Coverage Reports

Coverage reports will appear:
- As a comment on pull requests
- In the Codecov dashboard: https://codecov.io/gh/CJ-1981/jira-etl-dashboard
- As GitHub checks in the PR/commit status

## Local Development

Run tests with coverage locally:

```bash
npm run test:coverage
```

View the HTML coverage report:

```bash
open coverage/index.html
```
