# NDI Registration - Nuit de l'Info

Registration platform for the "Nuit de l'Info" event organized by Asso Info Evry at Université d'Évry Val-d'Essonne.

**Live site**: https://asso.info-evry.fr/nuit-de-linfo

## Features

### Public
- Team registration, protected by a team secret code (no account to create)
- Join existing teams with the team secret code
- View team members (secret code required)
- Tariffs read from the admin settings; payment is **on site only**, on the day
- Edition, dates and deadlines computed per request from the clock (SSR)
- Real-time capacity and team statistics
- Mobile-responsive glassmorphism design
- SF Symbols icons

### Admin Dashboard (`/admin`)
- Secure authentication with admin token
- Full CRUD for teams and members
- Dynamic settings management (capacity, deadlines, pizza menu)
- CSV export (standard format + official NDI format)
- Import members from CSV
- Batch operations

## Tech Stack

- **Framework**: Astro 7.x (SSR mode)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare KV (configuration)
- **Design**: Shared design system (`@info-evry/astro-design`) from the maestro Bun workspace
- **Content**: Shared knowledge base (`@info-evry/knowledge`) from the maestro Bun workspace
- **Testing**: Vitest with Cloudflare Workers pool

## Project Structure

```
astro-ndi/
├── src/
│   ├── pages/
│   │   ├── index.astro       # Public registration page
│   │   ├── admin.astro       # Admin dashboard
│   │   └── api/[...slug].ts  # Catch-all API route (astro-core/api-route: CORS, 404/500)
│   ├── routes.js             # Router: rate limits, admin guard, every route
│   ├── api/                  # API handlers
│   │   ├── admin/            # Admin handlers (members, teams, attendance, pizza, rooms, archives, exports)
│   │   ├── config.js         # Public config endpoint + configured pizza ids
│   │   ├── register.js       # Registration handler
│   │   ├── teams.js          # Team listing / public stats
│   │   └── team-view.js      # View team members
│   ├── database/             # Database helpers
│   │   ├── db.settings.js    # Settings queries (incl. atomic multi-write)
│   │   └── db.archives.js    # Archives, GDPR expiry, data reset
│   ├── features/
│   │   └── admin/            # admin.import.js (CSV import), admin.settings.js (settings schema)
│   ├── lib/
│   │   ├── db.js             # Teams, members, attendance, pizza, rooms (the one place)
│   │   ├── validation.js     # Member / team / registration validation, normalizeTeamPassword
│   │   └── members-csv.js    # CSV export formats and import header aliases
│   ├── shared/
│   │   ├── constants.js      # Shared by the Worker and the browser (see below)
│   │   ├── http.js           # Body / id-list helpers over astro-core
│   │   └── crypto.js         # Password hashing (PBKDF2)
│   ├── client/               # Browser code (admin dashboard, registration page)
│   ├── layouts/ components/  # Astro layouts and components
├── db/                       # Schema, seed and migrations
├── test/                     # Workers tests (test/*.test.js) and happy-dom tests (test/dom/)
├── public/                   # Static assets
└── docs/                     # Setup guide, archive plan
```

### Shared layers

The site keeps no private copy of what the platform provides:

| Concern | Module |
|---------|--------|
| Error bodies, `serverError`, JSON body / id parsing, D1 batches, admin auth, CSV, settings validation, CORS route, rate limits | `astro-core` (`http`, `request`, `ids`, `d1`, `auth`, `csv`, `settings`, `api-route`, `ratelimit`) |
| Login flow, event delegation, downloads, confirm modal, public API client, `escapeHtml`, `numberOrNull` | `@info-evry/astro-design/scripts/*` |
| NDI edition / dates / deadlines for a given clock (`currentNdiEvent`) | `@info-evry/knowledge/ndi/date` |

`src/shared/constants.js` is the single source of the site's own constants
(Organisation team name, `isNoPizza`, the on-site payment tiers, default
prices, request caps). The server and the browser bundles import the same file.

### Error contract

Every error is `{ "error": <message>, "code": <code> }` (messages are French by
default). Malformed id in a path or body: `400 invalid_id`; missing, malformed,
`null` or array JSON: `400 invalid_body`; body too large: `413
payload_too_large`; unique violation: `409 conflict`; unknown parent (team,
member): `404 not_found`; real failures: `500 internal_error` (the cause is
logged, never sent). The regression test `test/api.no-500.test.js` hits every
registered route with hostile input and asserts no 5xx.

### Capacity

The Organisation team does not count against the capacity: the registration
capacity check, the public `available_spots` and the admin statistics all use
the number of participants **excluding** the Organisation team
(`getParticipantsExcludingOrg`). Joining the Organisation team is not limited
by the capacity. A data reset (`POST /api/admin/reset`) deletes every other
team, all members and all payment events, but keeps the Organisation team.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- Wrangler CLI (install via Bun: `bunx wrangler`)
- Cloudflare account with Workers, D1, and KV access

### Installation

This project is a package in the maestro Bun workspace and depends on the
shared `astro-core`, `@info-evry/astro-design` and `@info-evry/knowledge`
packages from that workspace (no git submodules involved).

```bash
# Clone the maestro repo, which contains this project as a workspace package
git clone https://github.com/info-evry/astro-maestro.git
cd astro-maestro
bun install
```

### Local Development

#### Via Maestro (recommended)

From the maestro root:
```bash
bun run dev:ndi
```

This sets up the database, environment variables, and starts the dev server on **port 4321**.
Admin interface at: http://localhost:4321/nuit-de-linfo/admin (token: `dev-admin-token`)

#### Standalone

```bash
bun run dev
```

See `docs/setup.md` for database configuration.

### Testing

```bash
# Build, Workers tests, then happy-dom (client) tests
bun run test

# Only the client tests (no build needed)
bun run test:dom

# Workers tests alone (the build must be fresh: they run against dist/)
bun run build && bunx vitest run
```

For detailed development and deployment instructions, see [maestro docs](../../docs/DEVELOPMENT.md).

## Environment Configuration

### Cloudflare Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 Database | SQLite database for teams/members |
| `CONFIG` | KV Namespace | Dynamic configuration storage |
| `RATE_LIMIT` | KV Namespace | Fixed-window rate limiting counters for public/admin endpoints. Optional: if missing, rate limiting fails open (requests are allowed through) and a warning is logged. |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ADMIN_TOKEN` | Secret token for admin authentication |
| `ADMIN_EMAIL` | Email for admin notifications |
| `REPLY_TO_EMAIL` | Reply-to email for notifications |
| `MAX_TEAM_SIZE` | Maximum members per team (default: 15) |
| `MAX_TOTAL_PARTICIPANTS` | Total event capacity (default: 200) |
| `MIN_TEAM_SIZE` | Minimum team size (default: 1) |

### Setting Secrets

```bash
wrangler secret put ADMIN_TOKEN
```

### Rate Limiting

Public and write-heavy endpoints are protected by a fixed-window rate
limiter backed by the `RATE_LIMIT` KV namespace (see
[astro-core's `ratelimit.js`](../astro-core/src/lib/ratelimit.js)), keyed by
client IP:

| Rule | Scope | Limit |
|------|-------|-------|
| `register` | `POST /api/register` | 5 requests / 10 min |
| `team-view` | `POST /api/teams/:id/view` | 10 requests / 10 min |
| `admin` | any method under `/api/admin/` (`ADMIN_RATE_LIMIT` of astro-core) | 60 requests / 1 min |

Paths match on a whole segment (`/api/registerX` is not `/api/register`).
Every `/api/admin` request also goes through the admin guard
(`createAdminGuard()`), and each admin handler is wrapped with `adminOnly`.

If the `RATE_LIMIT` KV binding is not configured, rate limiting fails open
(requests are allowed through) rather than blocking traffic.

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Event configuration and pizza menu |
| `GET` | `/api/teams` | List all teams with member counts |
| `GET` | `/api/stats` | Registration statistics |
| `POST` | `/api/register` | Register new team or join existing |
| `POST` | `/api/teams/:id/view` | View team members (requires the team secret code, body field `password`) |

### Payment: on site only

There is no online payment: everything is paid on the day, on site, and
recorded by an admin in the check-in modal (see "Check-in payment" below). The
former `/api/payment/*` endpoints (checkout, verify, delayed, callback,
pricing) and the SumUp integration were removed; they answer `404`. A stale
cached client that still sends `paymentMethod` in `POST /api/register` is not
rejected: the field is ignored.

The database keeps the historical online columns (`payment_status`,
`payment_method`, `checkout_id`, `transaction_id`, `registration_tier`) and the
`payment_events` table, and the admin screens still display such rows
(escaped); nothing writes them any more.

The team secret code is the API field `password` / `teamPassword` (the field
names are unchanged). It is normalised the same way everywhere (register, join,
view, admin create / update): trimmed and capped at 64 characters
(`normalizeTeamPassword`).

### Admin (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/stats` | Detailed statistics and all teams with members |
| `GET` | `/api/admin/members` | All members |
| `POST` | `/api/admin/members` | Add a member (`teamId`, names, email, `bacLevel`, `isLeader`, `foodDiet`) |
| `PUT` | `/api/admin/members/:id` | Update a member (partial; `teamId` moves it; unknown team: `404`) |
| `DELETE` | `/api/admin/members/:id` | Delete a member |
| `POST` | `/api/admin/members/delete-batch` | Delete members (`{ memberIds }`, 1 to 1000 ids) |
| `POST` | `/api/admin/teams` | Create a team (`409` if the name exists) |
| `PUT` | `/api/admin/teams/:id` | Update a team (name, description, secret code in `password`) |
| `DELETE` | `/api/admin/teams/:id` | Delete a team and its members (not the Organisation team) |
| `GET` | `/api/admin/settings` | Get all settings |
| `PUT` | `/api/admin/settings` | Update settings (validated against a schema, written atomically) |
| `GET` | `/api/admin/export`, `/export/:teamId` | Members CSV (`;`, French headers, UTF-8 BOM) |
| `GET` | `/api/admin/export-official`, `/export-official/:teamId` | Official NDI CSV |
| `POST` | `/api/admin/import` | Import members from CSV (see below) |
| `GET` | `/api/admin/attendance` | Members with attendance and payment, plus statistics |
| `POST` | `/api/admin/attendance/check-in/:id` | Check in. Optional body `{ paymentTier, paymentAmount }`; an absent body is a plain check-in, a malformed one is a `400` |
| `POST` | `/api/admin/attendance/check-out/:id` | Check out |
| `POST` | `/api/admin/attendance/check-in-batch`, `/check-out-batch` | Batch (`{ memberIds }`) |
| `GET` | `/api/admin/pizza` | Members with pizza status, plus statistics |
| `POST` | `/api/admin/pizza/give/:id`, `/revoke/:id` | Hand out / take back a pizza |
| `POST` | `/api/admin/pizza/give-batch`, `/revoke-batch` | Batch (`{ memberIds }`) |
| `GET` | `/api/admin/rooms` | Teams with rooms, statistics |
| `PUT` | `/api/admin/rooms/:teamId` | Assign or clear a room (`{ room }`) |
| `POST` | `/api/admin/rooms/batch` | Assign rooms (`{ assignments: [{ teamId, room }] }`, at most 1000; unknown teams are listed in `skipped`) |
| `GET` / `POST` | `/api/admin/archives` | List / create the yearly archive |
| `GET` | `/api/admin/archives/:year`, `/archives/:year/export` | One archive (`year` between 2000 and 2100) |
| `DELETE` | `/api/admin/archives/:year` | Delete an archive (development environment only) |
| `POST` | `/api/admin/expiration-check` | GDPR expiry check |
| `GET` | `/api/admin/event-year`, `/api/admin/reset/check` | Event year, reset safety check |
| `POST` | `/api/admin/reset` | Reset the event data (`{ confirmation: "SUPPRIMER" }`), keeping the Organisation team |

#### Check-in payment

`paymentTier` must be one of `asso_member`, `non_member`, `late`,
`organisation` (chosen in the check-in modal; prices come from the settings
`price_asso_member`, `price_non_member`, `price_late`, `late_cutoff_time`);
`paymentAmount` is an integer number of cents between 0 and 100000. The former
online tiers (`online_tier1`, `online_tier2`, `tier1`, `tier2`) are no longer
accepted for new check-ins (nothing writes them any more) but historical rows
holding them are still displayed.

#### Public tariffs

The tariff cards of the public page show `price_asso_member` and
`price_non_member` (cents, read per request from the settings; the defaults of
`src/shared/constants.js` apply when a key is missing or invalid), formatted
`5€` or `7,50€`. "Gratuit" stays as is. The three cards look identical.

#### CSV import and export

Exports use `;`, French headers (`ID;Prénom;Nom;Email;Équipe;Niveau BAC;Chef
d'équipe;Pizza;Date d'inscription`), a UTF-8 BOM and the formula-injection guard
of `astro-core/csv`.

The import accepts, with `,`, `;` or tab as delimiter: the English headers
(`firstname,lastname,email,teamname,baclevel,fooddiet,ismanager`), the French
export headers and the official NDI headers, so **an ndi export can be
re-imported**. Leader: `Oui`/`Yes`/`1`/`true`; BAC level: `3` or `BAC+3`; pizza:
a configured pizza id, `Aucune` (no pizza) or empty. At most 2000 data rows
(`400 too_many_rows`). Invalid rows are reported (`stats.errors`, the first 10;
`stats.errorCount`, all of them) and skipped, members that already exist are
skipped without an error. Teams created by the import are assigned a random
16-character password (never a hash of the team name); the plain text passwords
are returned once in the response as `passwords: [{ team, password }]` and are
never logged or persisted anywhere other than the (hashed) `teams.password_hash`
column. Re-importing rows for an already-existing team does not generate or
return a new password.

## Database Schema

### Teams
- `id`, `name`, `description`, `password_hash`
- `is_orga` (organization team flag)
- `created_at`

### Members
- `id`, `team_id`, `first_name`, `last_name`, `email`
- `bac_level` (education level)
- `pizza_choice`, `is_leader`
- `created_at`

### Settings
- Key-value store for dynamic configuration
- `registration_open`, `pizza_enabled`, `pizza_menu`, etc.

## Related Repositories

- [astro-core](https://github.com/info-evry/astro-core) - Shared code library (Router, helpers)
- [astro-design](https://github.com/info-evry/astro-design) - Shared design system
- [astro-knowledge](https://github.com/info-evry/astro-knowledge) - Shared content
- [astro-asso](https://github.com/info-evry/astro-asso) - Association website
- [astro-join](https://github.com/info-evry/astro-join) - Membership portal

## License

AGPL-3.0 - Asso Info Evry
