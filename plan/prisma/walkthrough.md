# Vercel & Prisma Postgres Preparation Walkthrough

I have prepared the codebase for deployment to Vercel using the Prisma Postgres service.

## Changes Made

### 1. Robust Build Scripts
Modified [prisma-setup.mjs](file:///Users/chimin/Documents/script/jira-etl-dashboard/scripts/prisma-setup.mjs) to:
- Prioritize `process.env.DATABASE_URL` (provided by Vercel at build time).
- Handle missing `.env` files gracefully (standard in CI/CD).
- Prevent accidental `.env` creation/modification in production environments.

### 2. Deployment Scripts
Added a `db:deploy` script to [package.json](file:///Users/chimin/Documents/script/jira-etl-dashboard/package.json) to allow running migrations safely in production.

## How to Deploy

### Step 1: Provision the Database
1. Go to your **Vercel Dashboard**.
2. Select your project (or import it from GitHub).
3. Navigate to **Storage** -> **Browse Marketplace**.
4. Select **Prisma Postgres** and provision a free tier instance.
5. Vercel will automatically add the `DATABASE_URL` to your environment variables.

### Step 2: Configure Build Settings
In your Vercel Project Settings -> **Build & Development Settings**:
- **Build Command**: `npm run db:deploy && npm run build`
  - *Note: You only strictly need `npm run db:deploy` for the first deployment or when you have new migrations. You can change it back to `npm run build` later.*

### Step 3: Trigger Deployment
Push your changes to GitHub. Vercel will:
1. Run `postinstall` (which triggers `prisma-setup.mjs`).
2. Detect the PostgreSQL URL.
3. Synchronize `prisma/schema.prisma` from `schema.postgresql.prisma`.
4. Generate the Prisma Client.
5. Run migrations (`db:deploy`).
6. Build the Next.js app.

## Verification
You can verify the script logic locally by running:
```bash
DATABASE_URL="postgresql://user:pass@host:5432/db" node scripts/prisma-setup.mjs
```
This should output `> Target Database: PostgreSQL` and synchronize the correct schema without needing a `.env` file.
