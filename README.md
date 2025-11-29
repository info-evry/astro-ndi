# Nuit de l'Info - Registration System

Team registration system for "Nuit de l'Info" event, built on Cloudflare's edge platform.

[![Deploy to Cloudflare](https://github.com/YOUR_USERNAME/ndi-registration/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/ndi-registration/actions/workflows/deploy.yml)

## Features

- **Team Management**: Create or join teams with password protection
- **Member Registration**: Register multiple members at once (up to 15 per team)
- **Pizza Preferences**: Catering management with customizable pizza options
- **Real-time Availability**: Live team/slot availability display
- **Admin Dashboard**: Full CRUD operations, CSV export, collapsible sections
- **Dynamic Settings**: Edit capacity limits and pizza options from admin UI
- **Dark Mode**: Automatic theme based on system preference

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  Workers (API)  │  D1 (SQLite)  │  KV (Config)  │  Assets  │
└─────────────────────────────────────────────────────────────┘
```

- **Cloudflare Workers** - API backend (registration, team management, admin)
- **Cloudflare D1** - SQLite database (teams, members, settings)
- **Cloudflare KV** - Configuration storage (optional overrides)
- **Static Assets** - Frontend served from `/public`

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) or Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ndi-registration.git
cd ndi-registration

# Install dependencies
bun install
```

### Create Cloudflare Resources

```bash
# Create D1 database
bunx wrangler d1 create ndi-db

# Create KV namespace
bunx wrangler kv namespace create CONFIG

# Update wrangler.toml with the returned IDs
```

### Initialize Database

```bash
# Local development
bun run db:init
bun run db:seed

# Production
bunx wrangler d1 execute ndi-db --remote --file=./db/schema.sql
bunx wrangler d1 execute ndi-db --remote --file=./db/seed.sql
bunx wrangler d1 execute ndi-db --remote --file=./db/migrate-add-settings.sql
```

### Set Admin Token

```bash
bunx wrangler secret put ADMIN_TOKEN
# Enter a secure token when prompted
```

### Development

```bash
bun run dev
# Opens http://localhost:8787
```

### Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch
```

### Deployment

```bash
bun run deploy
```

## Configuration

### Environment Variables

Set in `wrangler.toml` or via Cloudflare dashboard:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_TEAM_SIZE` | 15 | Maximum members per team |
| `MAX_TOTAL_PARTICIPANTS` | 200 | Event capacity |
| `MIN_TEAM_SIZE` | 1 | Minimum members to register |
| `ADMIN_EMAIL` | asso@info-evry.fr | Admin notification email |
| `REPLY_TO_EMAIL` | contact@info-evry.fr | Reply-to for emails |

### Secrets

```bash
bunx wrangler secret put ADMIN_TOKEN
```

### Dynamic Settings (Admin UI)

The following can be edited from the admin panel:
- Team size limits (min/max)
- Total participant capacity
- Pizza options (add/edit/delete)

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get configuration (pizzas, BAC levels) |
| GET | `/api/teams` | List teams with availability |
| GET | `/api/teams/:id` | Get team details |
| GET | `/api/stats` | Registration statistics |
| POST | `/api/register` | Register members |
| POST | `/api/teams/:id/view` | View team members (password required) |

### Admin (requires Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Detailed statistics with teams |
| GET | `/api/admin/members` | List all members |
| GET | `/api/admin/settings` | Get all settings |
| PUT | `/api/admin/settings` | Update settings |
| GET | `/api/admin/export` | Export all to CSV |
| GET | `/api/admin/export/:teamId` | Export team to CSV |
| POST | `/api/admin/teams` | Create team |
| PUT | `/api/admin/teams/:id` | Update team |
| DELETE | `/api/admin/teams/:id` | Delete team |
| POST | `/api/admin/members` | Add member |
| PUT | `/api/admin/members/:id` | Update member |
| DELETE | `/api/admin/members/:id` | Delete member |
| POST | `/api/admin/members/delete-batch` | Batch delete members |

## Project Structure

```
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions CI/CD
├── src/
│   ├── index.js              # Worker entry point
│   ├── routes.js             # Route definitions
│   ├── api/
│   │   ├── admin.js          # Admin CRUD endpoints
│   │   ├── config.js         # Configuration endpoint
│   │   ├── register.js       # Registration handler
│   │   ├── teams.js          # Teams endpoints
│   │   └── team-view.js      # Public team view
│   ├── database/
│   │   ├── db.members.js     # Member queries
│   │   ├── db.settings.js    # Settings queries
│   │   └── db.teams.js       # Team queries
│   ├── features/
│   │   └── admin/
│   │       └── admin.settings.js  # Settings API handlers
│   ├── lib/
│   │   ├── db.js             # D1 helpers
│   │   ├── router.js         # Minimal router
│   │   └── validation.js     # Input validation
│   └── shared/
│       ├── auth.js           # Authentication helpers
│       ├── crypto.js         # Password hashing
│       └── response.js       # HTTP response helpers
├── public/
│   ├── index.html            # Registration page
│   ├── admin.html            # Admin dashboard
│   ├── css/
│   │   ├── style.css         # Main styles
│   │   └── admin.css         # Admin styles
│   └── js/
│       ├── app.js            # Registration app
│       ├── admin.js          # Admin app
│       ├── admin/
│       │   └── admin-settings.js  # Settings management
│       ├── components/
│       │   ├── modal.js      # Modal utilities
│       │   └── toast.js      # Toast notifications
│       └── core/
│           ├── api.js        # API client
│           └── utils.js      # Utility functions
├── db/
│   ├── schema.sql            # D1 schema
│   ├── seed.sql              # Initial data
│   ├── migrate-add-settings.sql  # Settings migration
│   └── config.json           # Default config
├── test/
│   ├── api.test.js           # API tests (42 tests)
│   ├── router.test.js        # Router tests (14 tests)
│   ├── settings.test.js      # Settings tests (11 tests)
│   └── validation.test.js    # Validation tests (23 tests)
├── wrangler.toml             # Cloudflare config
├── vitest.config.js          # Test config
└── package.json
```

## URLs

| Path | Description |
|------|-------------|
| `/` | Registration form |
| `/admin` | Admin dashboard (token required) |

## Testing

The project includes 90 tests covering:

- API endpoints (registration, teams, admin CRUD)
- Settings management
- Input validation
- Router functionality
- Organisation team special handling
- CSV export format
- Team capacity limits

```bash
bun run test           # Run once
bun run test:watch     # Watch mode
bun run test:ui        # UI mode
```

## Deployment

### Manual

```bash
bun run deploy
```

### GitHub Actions (Automatic)

Push to `main` branch triggers automatic deployment. Required secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

## License

MIT

## Author

Guillaume Coquard - [Info-Evry](https://info-evry.fr)
