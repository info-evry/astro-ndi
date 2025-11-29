# Deployment Guide - NDI Registration

## Quick Deploy

```bash
# Build and deploy
bun run deploy

# Or use the script
./deploy.sh
```

## Manual Deployment Steps

### 1. Update Submodules

```bash
git submodule update --remote --merge
```

### 2. Build the Project

```bash
bun run build
```

### 3. Deploy to Cloudflare

```bash
bunx wrangler deploy
```

## GitHub Actions (Automatic)

The repository includes a GitHub Actions workflow that automatically deploys on push to `main`.

### Required Secrets

Set these in your GitHub repository settings (Settings > Secrets and variables > Actions):

| Secret | Description | How to get |
|--------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers edit permission | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Dashboard URL or wrangler whoami |

### Creating the API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Add permissions:
   - Workers Scripts: Edit
   - Workers KV Storage: Edit
   - D1: Edit
5. Set Account Resources to your account
6. Create token and copy it

## Deployment Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Commit    │────▶│   Build     │────▶│   Deploy    │
│   to main   │     │   Astro     │     │   Workers   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Environment-Specific Deployments

### Staging

```bash
bunx wrangler deploy --env staging
```

### Production

```bash
bunx wrangler deploy --env production
```

## Rolling Back

If a deployment has issues:

```bash
# List recent deployments
bunx wrangler deployments list

# Rollback to previous
bunx wrangler rollback
```

## Database Migrations

Run migrations after schema changes:

```bash
# Apply migrations to production
bunx wrangler d1 execute ndi-db --remote --file=./migrations/XXXX_migration.sql
```

## Monitoring

- **Logs**: `bunx wrangler tail`
- **Analytics**: Cloudflare Dashboard > Workers > Your Worker
- **Errors**: Cloudflare Dashboard > Workers > Your Worker > Logs

## Checklist Before Deploy

- [ ] Submodules updated (`git submodule update --remote`)
- [ ] Build succeeds locally (`bun run build`)
- [ ] Tests pass (`bun run test`)
- [ ] Environment variables correct in wrangler.toml
- [ ] Database migrations applied if needed
