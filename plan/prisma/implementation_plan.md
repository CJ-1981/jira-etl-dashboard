# Deployment to Vercel with Prisma Postgres

This plan outlines the necessary preparations and code changes to deploy the application to Vercel using the Prisma Postgres service.

## User Review Required

> [!IMPORTANT]
> You will need to provision a **Prisma Postgres** database via the Vercel Marketplace or the Prisma Data Platform. Once provisioned, you will receive a `DATABASE_URL`.

> [!NOTE]
> The current setup uses a custom `prisma-setup.mjs` script. We need to ensure this script works in Vercel's build environment where `.env` files are not typically present.

## Proposed Changes

### Build Scripts & Configuration

#### [MODIFY] [prisma-setup.mjs](file:///Users/chimin/Documents/script/jira-etl-dashboard/scripts/prisma-setup.mjs)
- Update to check `process.env.DATABASE_URL` first before attempting to read `.env`.
- Ensure it handles missing `.env` gracefully in production.

#### [MODIFY] [package.json](file:///Users/chimin/Documents/script/jira-etl-dashboard/package.json)
- Add a `prisma:deploy` script that runs `prisma db push` (or `prisma migrate deploy`).
- Ensure `postinstall` or `prebuild` correctly triggers the setup in Vercel.

## Deployment Steps (Manual)

1. **GitHub Integration**: Push your code to a GitHub repository.
2. **Vercel Project**: Import the repository into Vercel.
3. **Provision Database**:
   - In the Vercel Dashboard, go to your project.
   - Click **Storage** -> **Browse Marketplace** -> **Prisma Postgres**.
   - Follow the steps to create a database. This will automatically add `DATABASE_URL` to your project's Environment Variables.
4. **Deploy**: Vercel will trigger a build. The `prebuild` script will detect the PostgreSQL URL and synchronize the correct schema.

## Verification Plan

### Automated Tests
- Run `node scripts/prisma-setup.mjs` locally with a temporary `DATABASE_URL` set in the environment to verify it detects the provider correctly without needing to edit `.env`.

### Manual Verification
- Deploy to Vercel and check the build logs to ensure `prisma generate` and schema synchronization work as expected.
