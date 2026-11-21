# Working in astro-ndi

Nuit de l'Info registration, a Cloudflare Worker (Astro, SSR) with D1 and two KV namespaces. It only builds inside the maestro
workspace: read `../../AGENTS.md` first (commands, gates, commit order, what needs the owner). This file holds what is specific to NDI.

## Test

`bun run build && bunx vitest run && bunx vitest run -c vitest.dom.config.js` (from this directory, after `bun install` at the
maestro root). The worker tests run against `dist/server/entry.mjs`: **build after every source change**. Client modules are
tested in `test/dom/` (happy-dom, no Cloudflare bindings). Probe pages in a browser before claiming they work (`browser-probe`
skill at the maestro root).

## Where things are

| Thing | Where |
|---|---|
| Routes, rate-limit rules | `src/routes.js` |
| Public API handlers | `src/api/` (`register`, `teams`, `team-view`, `team-pizza`, `config`); the code-secret check is `team-auth.js` |
| Admin API | `src/api/admin/`, `src/features/admin/` (settings, CSV import) |
| D1 access | `src/lib/db.js`, `src/database/` |
| Constants shared by worker and browser | `src/shared/constants.js` (pure, no imports) |
| Public page client | `src/client/registration/` |
| Admin client | `src/client/admin/` |
| Schema and migrations | `db/` (`schema.sql`, `migrate-NNN-*.sql`, `seed.sql`) |

## Rules specific to NDI

- **Settings are a closed list.** A new admin setting needs an entry in `SETTINGS_SCHEMA` (`features/admin/admin.settings.js`), a
  reader with a default in `database/db.settings.js`, and a field the admin client loads. Unknown keys are rejected; retired keys
  are listed in `RETIRED_KEYS` so a cached admin page does not fail its save.
- **The team code secret is the only credential a participant has.** Everything a team does (join, view, change a pizza) goes
  through `checkTeamSecret`, which also upgrades legacy hashes and tells a team *without* a secret from a wrong one
  (`password_not_set`). The Organisation team has no secret until an organiser sets one in the admin.
- **A pizza is an id of the `pizzas` setting.** `food_diet` may also hold ids of earlier catalogues and several spellings of "no
  pizza" (`isNoPizza`). The admin form keeps an unknown stored value selectable and does not send it back unless changed; the
  server validates a changed one against the current catalogue. Never display an id: map it through the catalogue.
- **Capacity and payment ignore the Organisation team** (`ORGANISATION_TEAM_NAME`); it has no size limit.
- **Payment is on site only.** `payment_*` columns and `payment_events` are historical: read, never written.
- **Dates are computed per request** from the NDI date module of `astro-knowledge`; never hard-code an edition or a date.
- Migrations are additive, numbered, idempotent where SQLite allows, and covered by a test against a real SQLite
  (`tests/ndi-migration-*.test.ts` in maestro). A migration that must run before the code needs the owner's go.
- Every error body is `{ error, code }` in French; 500s never leak `error.message`.
