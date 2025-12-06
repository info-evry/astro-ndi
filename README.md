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

- **Framework**: Astro 5.x (SSR mode)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare KV (configuration)
- **Design**: Shared design system via git submodule
- **Content**: Shared knowledge base via git submodule
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
│   │   ├── router.js         # API router
│   │   ├── validation.js     # Input validation
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
├── core/                     # Shared code library (submodule)
├── design/                   # Shared design system (submodule)
├── knowledge/                # Shared content (submodule)
├── test/                     # API tests
├── public/                   # Static assets
└── docs/
    └── setup.md              # Cloudflare setup guide
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (v3+)
- Cloudflare account with Workers, D1, and KV access

### Installation

```bash
# Clone with submodules
git clone --recursive https://github.com/info-evry/astro-ndi.git
cd astro-ndi

# Install dependencies
bun install
```

### Local Development

```bash
bun run dev
```

Visit `http://localhost:4321`

### Database Setup

See [docs/setup.md](./docs/setup.md) for Cloudflare D1 and KV configuration.

### Testing

```bash
# Build first (required for Workers tests)
bun run build

# Run tests
bun run test
```

## Environment Configuration

### Cloudflare Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 Database | SQLite database for teams/members |
| `CONFIG` | KV Namespace | Dynamic configuration storage |

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

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Event configuration and pizza menu |
| `GET` | `/api/teams` | List all teams with member counts |
| `GET` | `/api/stats` | Registration statistics |
| `POST` | `/api/register` | Register new team or join existing |
| `POST` | `/api/teams/:id/view` | View team members (requires password) |

### Admin (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/stats` | Detailed statistics |
| `GET` | `/api/admin/settings` | Get all settings |
| `PUT` | `/api/admin/settings` | Update settings |
| `GET` | `/api/admin/export` | Export all data to CSV |
| `GET` | `/api/admin/export/ndi` | Export in official NDI format |
| `POST` | `/api/admin/import` | Import members from CSV |
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
