# NDI Registration - Nuit de l'Info

Registration platform for the "Nuit de l'Info" event organized by Asso Info Evry at Université d'Évry.

## Features

- Team registration with password protection
- Member management (BAC level, food preferences)
- Admin dashboard with full CRUD operations
- Real-time capacity tracking
- CSV export (standard + official NDI format)
- Mobile-responsive glassmorphism design

## Tech Stack

- **Frontend**: Astro 5.x with vanilla JavaScript
- **Backend**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare KV (config/sessions)
- **Design**: Shared design system via git submodule

## Project Structure

```
ndi/
├── src/
│   ├── pages/           # Astro pages (index, admin)
│   ├── layouts/         # Page layouts
│   └── api/             # API routes (Cloudflare Workers)
├── design/              # Shared design system (submodule)
├── knowledge/           # Shared content (submodule)
├── migrations/          # D1 database migrations
├── docs/                # Documentation
│   ├── setup.md         # Initial setup guide
│   └── deploy.md        # Deployment guide
└── wrangler.jsonc       # Cloudflare config
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (v3+)
- Cloudflare account with Workers, D1, and KV access

### Installation

```bash
# Clone with submodules
git clone --recursive git@github.com:info-evry/astro-ndi.git
cd astro-ndi

# Or init submodules if already cloned
git submodule update --init --recursive

# Install dependencies
bun install
```

### Local Development

```bash
# Start dev server with Wrangler
bun run dev
```

Visit `http://localhost:4321`

### Build & Deploy

```bash
# Build and deploy to Cloudflare
bun run deploy

# Or use the deploy script
./deploy.sh
```

## Documentation

- [Setup Guide](./docs/setup.md) - Initial Cloudflare configuration
- [Deployment Guide](./docs/deploy.md) - Deployment instructions

## Environment Variables

Required Cloudflare bindings (configured via wrangler.jsonc):

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 Database | Main database |
| `CONFIG` | KV Namespace | Configuration storage |
| `ADMIN_TOKEN` | Secret | Admin authentication token |
| `ADMIN_EMAIL` | Variable | Admin contact email |
| `REPLY_TO_EMAIL` | Variable | Reply-to email |
| `MAX_TEAM_SIZE` | Variable | Max members per team |
| `MAX_TOTAL_PARTICIPANTS` | Variable | Total capacity |

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get configuration |
| GET | `/api/teams` | List teams |
| GET | `/api/stats` | Registration statistics |
| POST | `/api/register` | Register members |
| POST | `/api/teams/:id/view` | View team members |

### Admin (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Detailed statistics |
| GET | `/api/admin/settings` | Get settings |
| PUT | `/api/admin/settings` | Update settings |
| GET | `/api/admin/export` | Export all to CSV |
| POST/PUT/DELETE | `/api/admin/teams/*` | Team CRUD |
| POST/PUT/DELETE | `/api/admin/members/*` | Member CRUD |

## Related Repositories

- [astro-design](https://github.com/info-evry/astro-design) - Shared design system
- [astro-knowledge](https://github.com/info-evry/astro-knowledge) - Shared content
- [astro-asso](https://github.com/info-evry/astro-asso) - Association website

## License

MIT - Asso Info Evry
