# Nuit de l'Info - Registration System

Team registration system for "Nuit de l'Info" event, built on Cloudflare's edge platform.

## Architecture

- **Cloudflare Workers** - API backend (registration, team management)
- **Cloudflare D1** - SQLite database (teams, members)
- **Cloudflare KV** - Configuration storage (optional overrides)
- **Static Assets** - Frontend served from `/public`

## Features

- Create or join teams (max 15 members per team)
- Register multiple members at once
- Pizza preference selection for catering
- Real-time team/slot availability display
- Admin dashboard with CSV export
- Email notifications on registration
- Dark mode support

## Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account

### Installation

```bash
npm install
```

### Create Resources

```bash
# Create D1 database
wrangler d1 create ndi-db

# Create KV namespace
wrangler kv namespace create CONFIG

# Update wrangler.toml with the returned IDs
```

### Initialize Database

```bash
# Local development
npm run db:init

# Production
npm run db:migrate
```

### Set Admin Token

```bash
wrangler secret put ADMIN_TOKEN
# Enter a secure token when prompted
```

### Development

```bash
npm run dev
```

### Deployment

```bash
npm run deploy
```

## Configuration

Environment variables in `wrangler.toml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_TEAM_SIZE` | 15 | Maximum members per team |
| `MAX_TOTAL_PARTICIPANTS` | 200 | Event capacity |
| `MIN_TEAM_SIZE` | 2 | Minimum members to register |
| `ADMIN_EMAIL` | asso@info-evry.fr | Admin notification email |
| `REPLY_TO_EMAIL` | contact@info-evry.fr | Reply-to for emails |

## API Endpoints

### Public

- `GET /api/config` - Get configuration (pizzas, labels)
- `GET /api/teams` - List teams with availability
- `GET /api/teams/:id` - Get team details
- `GET /api/stats` - Registration statistics
- `POST /api/register` - Register members

### Admin (requires Bearer token)

- `GET /api/admin/stats` - Detailed statistics
- `GET /api/admin/members` - All members
- `GET /api/admin/export` - Export all to CSV
- `GET /api/admin/export/:teamId` - Export team to CSV

## URLs

- `/` - Registration form
- `/admin` - Admin dashboard

## Project Structure

```
├── src/
│   ├── index.js          # Worker entry point
│   ├── api/
│   │   ├── teams.js      # Teams endpoints
│   │   ├── register.js   # Registration handler
│   │   ├── admin.js      # Admin endpoints
│   │   └── config.js     # Config endpoint
│   └── lib/
│       ├── router.js     # Minimal router
│       ├── db.js         # D1 helpers
│       └── validation.js # Input validation
├── public/
│   ├── index.html        # Registration page
│   ├── admin.html        # Admin dashboard
│   ├── css/
│   │   ├── style.css     # Main styles
│   │   └── admin.css     # Admin styles
│   └── js/
│       ├── app.js        # Registration app
│       └── admin.js      # Admin app
├── db/
│   ├── schema.sql        # D1 schema
│   ├── seed.sql          # Initial data
│   └── config.json       # Default config
├── wrangler.toml         # Cloudflare config
└── package.json
```

## License

MIT
