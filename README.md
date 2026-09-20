# NDI Registration - Nuit de l'Info

Registration platform for the "Nuit de l'Info" event organized by Asso Info Evry at Université d'Évry Val-d'Essonne.

**Live site**: https://asso.info-evry.fr/nuit-de-linfo

## Features

### Public
- Team registration with password protection
- Join existing teams with team password
- View team members (password protected)
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

- **Framework**: Astro 6.x (SSR mode)
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
│   │   └── api/[...slug].ts  # API route handler
│   ├── api/                  # API handlers
│   │   ├── admin.js          # Admin CRUD operations
│   │   ├── config.js         # Public config endpoint
│   │   ├── register.js       # Registration handler
│   │   ├── teams.js          # Team listing
│   │   └── team-view.js      # View team members
│   ├── database/             # Database helpers
│   │   ├── db.teams.js       # Team queries
│   │   ├── db.members.js     # Member queries
│   │   └── db.settings.js    # Settings queries
│   ├── features/admin/       # Admin features
│   │   ├── admin.import.js   # CSV import
│   │   └── admin.settings.js # Settings management
│   ├── lib/                  # Utilities
│   │   ├── validation.js     # Input validation (re-exports astro-core/validation)
│   │   └── db.js             # D1 helpers
│   ├── shared/               # Shared utilities
│   │   ├── auth.js           # Admin authentication
│   │   ├── crypto.js         # Password hashing
│   │   └── response.js       # JSON responses
│   ├── layouts/
│   │   ├── BaseLayout.astro  # Public layout
│   │   └── AdminLayout.astro # Admin layout
│   └── components/
│       ├── Header.astro      # Site header
│       └── Footer.astro      # Site footer
├── db/
│   ├── schema.sql            # Database schema
│   ├── seed.sql              # Test data
│   └── migrate-*.sql         # Migrations
├── test/                     # API tests
├── public/                   # Static assets
└── docs/
    └── setup.md              # Cloudflare setup guide
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- Wrangler CLI (install via Bun: `bunx wrangler`)
- Cloudflare account with Workers, D1, and KV access

### Installation

This project is a package in the maestro Bun workspace and depends on the
shared `astro-core`, `@info-evry/astro-design`, `@info-evry/knowledge`, and
`astro-payments` packages from that workspace (no git submodules involved).

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
# Build first (required for Workers tests)
bun run build

# Run tests with Vitest
bunx vitest run

# Watch mode
bunx vitest
```

For detailed development and deployment instructions, see [maestro docs](../../docs/DEVELOPMENT.md).

## Environment Configuration

### Cloudflare Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 Database | SQLite database for teams/members |
| `CONFIG` | KV Namespace | Dynamic configuration storage |
| `RATE_LIMIT` | KV Namespace | Fixed-window rate limiting counters for public/admin/payment endpoints. Optional: if missing, rate limiting fails open (requests are allowed through) and a warning is logged. |

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
| `payment` | any method under `/api/payment/*` (excluding `pricing` and `callback`) | 20 requests / 10 min |
| `admin` | any method under `/api/admin/*` | 60 requests / 1 min |

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
| `POST` | `/api/teams/:id/view` | View team members (requires password) |
| `GET` | `/api/payment/pricing` | Current pricing tier information |

### Payment (admin bearer token OR team password required)

These endpoints act on behalf of a specific member's team. Authorize a
request either with an admin `Authorization: Bearer <ADMIN_TOKEN>` header,
or by including the member's team password as `teamPassword` in the JSON
body. Requests without either are rejected with `403`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payment/checkout` | Create a SumUp checkout for a member (`{ memberId, teamPassword? }`) |
| `POST` | `/api/payment/verify` | Verify payment completion for a checkout (`{ checkoutId, teamPassword? }`) |
| `POST` | `/api/payment/delayed` | Mark a member's payment as delayed/pay-at-event (`{ memberId, teamPassword? }`); rejected with `409` if the member has already paid |

The `/api/payment/callback` webhook (called by SumUp, not by end users) never
mutates the database unless `SUMUP_API_KEY` is configured; if it isn't, it
acknowledges the callback without processing it (`{ received: true, processed: false }`).

### Admin (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/stats` | Detailed statistics |
| `GET` | `/api/admin/settings` | Get all settings |
| `PUT` | `/api/admin/settings` | Update settings |
| `GET` | `/api/admin/export` | Export all data to CSV |
| `GET` | `/api/admin/export/ndi` | Export in official NDI format |
| `POST` | `/api/admin/import` | Import members from CSV. Teams created by the import are assigned a random 16-character password (never a hash of the team name); the plain text passwords are returned once in the response as `passwords: [{ team, password }]` and are never logged or persisted anywhere other than the (hashed) `teams.password_hash` column. Re-importing rows for an already-existing team does not generate or return a new password. |
| `GET` | `/api/admin/teams` | List all teams with members |
| `POST` | `/api/admin/teams` | Create team |
| `PUT` | `/api/admin/teams/:id` | Update team |
| `DELETE` | `/api/admin/teams/:id` | Delete team |
| `POST` | `/api/admin/members` | Add member |
| `PUT` | `/api/admin/members/:id` | Update member |
| `DELETE` | `/api/admin/members/:id` | Delete member |
| `PUT` | `/api/admin/members/:id/move` | Move member to different team |

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
