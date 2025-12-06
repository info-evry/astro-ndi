# Initial Setup Guide - NDI Registration

This guide walks you through setting up the NDI registration platform from scratch on Cloudflare.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+) or Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- Cloudflare account with Workers paid plan (for D1)

## Step 1: Clone the Repository

```bash
# Clone with submodules
git clone --recursive git@github.com:info-evry/astro-ndi.git
cd astro-ndi

# Install dependencies
bun install
```

## Step 2: Create Cloudflare Resources

### Create D1 Database

```bash
bunx wrangler d1 create ndi-db
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ndi-db"
database_id = "YOUR_DATABASE_ID"
```

### Create KV Namespace

```bash
bunx wrangler kv namespace create CONFIG
```

Copy the `id` from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CONFIG"
id = "YOUR_KV_ID"
```

## Step 3: Initialize Database

Run migrations to create the database schema:

```bash
# Apply schema
bunx wrangler d1 execute ndi-db --remote --file=./db/schema.sql

# Apply migrations in order
bunx wrangler d1 execute ndi-db --remote --file=./db/migrate-001-settings.sql
bunx wrangler d1 execute ndi-db --remote --file=./db/migrate-002-attendance.sql
# ... continue with remaining migrations
```

Or create the schema manually:

```bash
bunx wrangler d1 execute ndi-db --remote --command="
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  password_hash TEXT NOT NULL,
  is_organisation INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  bac_level INTEGER DEFAULT 0,
  food_diet TEXT,
  is_leader INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"
```

## Step 4: Set Secrets

```bash
# Set the admin authentication token
bunx wrangler secret put ADMIN_TOKEN
# Enter a secure random token when prompted
```

## Step 5: Configure Environment Variables

Edit `wrangler.toml` to customize:

```toml
[vars]
ADMIN_EMAIL = "your-admin@example.com"
REPLY_TO_EMAIL = "contact@example.com"
MAX_TEAM_SIZE = "15"
MAX_TOTAL_PARTICIPANTS = "200"
MIN_TEAM_SIZE = "1"
```

## Step 6: Deploy

```bash
bun run deploy
```

## Step 7: Verify Deployment

1. Visit your Worker URL (shown after deploy)
2. Access `/admin` and enter your admin token
3. Verify the dashboard loads correctly

## Troubleshooting

### "D1_ERROR: no such table"

Run the database schema and migrations:
```bash
bunx wrangler d1 execute ndi-db --remote --file=./db/schema.sql
```

### "Invalid binding SESSION"

The Astro Cloudflare adapter expects a KV binding for sessions. Either:
- Add a KV binding named `SESSION` in wrangler.toml
- Or add an empty `.assetsignore` to public/ to suppress the warning

### "Unauthorized" on admin page

Verify ADMIN_TOKEN secret is set:
```bash
bunx wrangler secret list
```

## Next Steps

- See [deploy.md](./deploy.md) for deployment workflow
- Configure GitHub Actions for CI/CD
