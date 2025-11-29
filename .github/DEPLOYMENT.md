# Deployment Configuration Guide

This guide explains how to set up automatic deployment to Cloudflare Workers using GitHub Actions.

## Prerequisites

- A Cloudflare account
- A GitHub repository with this project
- The Cloudflare resources already created (D1 database, KV namespace)

## Step 1: Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Configure permissions:

| Permission | Access |
|------------|--------|
| Account > Workers Scripts | Edit |
| Account > Workers KV Storage | Edit |
| Account > D1 | Edit |
| Zone > Workers Routes | Edit |

5. Set **Account Resources** to your account
6. Click **Continue to summary** → **Create Token**
7. **Copy the token** (you won't see it again!)

## Step 2: Get Your Account ID

Your Cloudflare Account ID can be found:

- In the URL when logged into Cloudflare dashboard: `dash.cloudflare.com/<ACCOUNT_ID>/...`
- Or in **Workers & Pages** → **Overview** → right sidebar

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

| Secret Name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | The API token from Step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from Step 2 |

## Step 4: Configure wrangler.toml

Ensure your `wrangler.toml` has the correct resource IDs:

```toml
name = "ndi-registration"
main = "src/index.js"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

assets = { directory = "public" }

# D1 Database - Update with your database ID
[[d1_databases]]
binding = "DB"
database_name = "ndi-db"
database_id = "YOUR_D1_DATABASE_ID"

# KV Namespace - Update with your KV ID
[[kv_namespaces]]
binding = "CONFIG"
id = "YOUR_KV_NAMESPACE_ID"

[vars]
ADMIN_EMAIL = "your-email@example.com"
REPLY_TO_EMAIL = "contact@example.com"
MAX_TEAM_SIZE = "15"
MAX_TOTAL_PARTICIPANTS = "200"
MIN_TEAM_SIZE = "1"
```

### Finding Resource IDs

**D1 Database ID:**
```bash
bunx wrangler d1 list
```

**KV Namespace ID:**
```bash
bunx wrangler kv namespace list
```

## Step 5: Set Admin Token Secret

The admin token must be set as a Cloudflare secret (not in wrangler.toml):

```bash
bunx wrangler secret put ADMIN_TOKEN
# Enter your secure admin token when prompted
```

## Workflow Configuration

The workflow file (`.github/workflows/deploy.yml`) is configured to:

### Triggers

```yaml
on:
  push:
    branches:
      - main          # Deploy on push to main
  workflow_dispatch:  # Allow manual trigger
```

### Jobs

1. **test** - Runs the test suite
   - Sets up Bun runtime
   - Installs dependencies
   - Runs all 90 tests

2. **deploy** - Deploys to Cloudflare (only if tests pass)
   - Uses official `cloudflare/wrangler-action`
   - Deploys worker and assets

### Customizing the Workflow

#### Deploy to Different Environment

```yaml
- name: Deploy to Cloudflare Workers
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: deploy --env production  # Add environment flag
```

#### Skip Tests (Not Recommended)

Remove the `needs: test` line from the deploy job:

```yaml
deploy:
  name: Deploy
  runs-on: ubuntu-latest
  # needs: test  # Remove this line to skip tests
```

#### Deploy on Tags Only

```yaml
on:
  push:
    tags:
      - 'v*'  # Only deploy on version tags
```

#### Add Staging Environment

```yaml
deploy-staging:
  name: Deploy to Staging
  runs-on: ubuntu-latest
  needs: test
  if: github.ref == 'refs/heads/develop'
  steps:
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        command: deploy --env staging

deploy-production:
  name: Deploy to Production
  runs-on: ubuntu-latest
  needs: test
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: cloudflare/wrangler-action@v3
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        command: deploy --env production
```

## Database Migrations

Database migrations are **not** automatically run by the workflow. Run them manually:

```bash
# Apply schema
bunx wrangler d1 execute ndi-db --remote --file=./db/schema.sql

# Apply seed data
bunx wrangler d1 execute ndi-db --remote --file=./db/seed.sql

# Apply settings migration
bunx wrangler d1 execute ndi-db --remote --file=./db/migrate-add-settings.sql
```

### Adding Migration to Workflow (Optional)

Add this step before deployment if you want automatic migrations:

```yaml
- name: Run Database Migrations
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: d1 execute ndi-db --remote --file=./db/schema.sql
```

> ⚠️ **Warning:** Be careful with automatic migrations in production. Consider using a separate migration workflow with manual approval.

## Troubleshooting

### "Authentication error"

- Verify your API token has the correct permissions
- Check that `CLOUDFLARE_API_TOKEN` secret is set correctly
- Ensure the token hasn't expired

### "Database not found"

- Verify `database_id` in `wrangler.toml` matches your D1 database
- Run `bunx wrangler d1 list` to confirm the ID

### "KV namespace not found"

- Verify `id` in `wrangler.toml` matches your KV namespace
- Run `bunx wrangler kv namespace list` to confirm the ID

### Tests Failing in CI

- Run tests locally: `bun run test`
- Check for environment-specific issues
- Ensure all dependencies are in `package.json`

## Monitoring Deployments

### GitHub Actions

- Go to **Actions** tab in your repository
- View deployment logs and status

### Cloudflare Dashboard

- Go to **Workers & Pages** → **ndi-registration**
- View deployments, logs, and analytics

### Worker Logs

```bash
bunx wrangler tail
```

## Rolling Back

To rollback to a previous version:

1. Go to Cloudflare Dashboard → Workers & Pages → ndi-registration
2. Click **Deployments**
3. Find the previous working deployment
4. Click **Rollback to this deployment**

Or revert the git commit and push:

```bash
git revert HEAD
git push origin main
```
