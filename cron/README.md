# NDI GDPR Cron Worker

A small, dependency-free Cloudflare Worker that runs on a daily cron trigger
to enforce GDPR data-retention limits for the Nuit de l'Info registration
database.

It does not build or serve any HTTP routes - it only exports a `scheduled`
handler that calls `checkAllExpirations(env.DB)` from the main `astro-ndi`
codebase (`../src/database/db.archives.js`) and logs the outcome.

## How it is deployed

This worker is deployed by `astro-maestro` as the `ndi-cron` project (see
`maestro.config.ts`). It binds the **same** D1 database as the main NDI site
(`ndi-db`), but maestro does not create, seed, migrate, or back up that
database when deploying this project (`manageDatabase: false`) - the main
`ndi` project owns the database's lifecycle. This worker only reads/writes
expiration state in that existing database.

`deploy/ndi-cron/wrangler.toml` is copied into this directory before
`wrangler deploy` runs, exactly like the other projects managed by maestro:

```bash
cp deploy/ndi-cron/wrangler.toml projects/astro-ndi/cron/wrangler.toml
cd projects/astro-ndi/cron
bunx wrangler deploy            # production
bunx wrangler deploy --env dev  # development
```

The copied `wrangler.toml` is git-ignored (see `projects/astro-ndi/.gitignore`).

## Schedule

The worker runs daily at 03:00 UTC (`0 3 * * *`), configured in
`deploy/ndi-cron/wrangler.toml`.

## Local testing

```bash
cd projects/astro-ndi/cron
cp ../../../deploy/ndi-cron/wrangler.toml .
bunx wrangler dev --test-scheduled
# then, in another terminal:
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```
