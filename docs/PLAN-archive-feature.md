# NDI Archive Feature - Implementation Plan

## Overview

Add archiving capabilities to the NDI registration app with:
- Batch save yearly event data
- Read-only archived data consultation
- ZIP export functionality
- GDPR-compliant automatic data expiration
- Data reset with archive safety check

## Data Audit - GDPR Classification

### Members Table (Current Fields)

| Field | GDPR Sensitive | Archive Action | Post-Expiration |
|-------|---------------|----------------|-----------------|
| `id` | No | Keep as-is | Keep |
| `team_id` | No | Keep as-is | Keep |
| `first_name` | **Yes** | Archive | Anonymize → "Participant" |
| `last_name` | **Yes** | Archive | Anonymize → "" |
| `email` | **Yes** | Archive | Delete → null |
| `bac_level` | No | Archive | Keep |
| `is_leader` | No | Archive | Keep |
| `food_diet` | Partial* | Archive | Keep (statistical value) |
| `checked_in` | No | Archive | Keep |
| `checked_in_at` | No | Archive | Keep |
| `created_at` | No | Archive | Keep |
| `payment_status` | No | Archive | Keep |
| `payment_method` | No | Archive | Keep |
| `checkout_id` | No | Archive | Delete → null (external ref) |
| `transaction_id` | No | Archive | Delete → null (external ref) |
| `registration_tier` | No | Archive | Keep |
| `payment_amount` | No | Archive | Keep |
| `payment_confirmed_at` | No | Archive | Keep |
| `payment_tier` | No | Archive | Keep |

*food_diet may contain allergy info but has statistical value for event planning

### Teams Table

| Field | GDPR Sensitive | Archive Action | Post-Expiration |
|-------|---------------|----------------|-----------------|
| `id` | No | Keep | Keep |
| `name` | No | Keep | Keep |
| `description` | No | Keep | Keep |
| `password_hash` | Security | **Do not archive** | N/A |
| `created_at` | No | Keep | Keep |
| `room_id` | No | Keep | Keep |

### Payment Events Table

| Field | GDPR Sensitive | Archive Action | Post-Expiration |
|-------|---------------|----------------|-----------------|
| `id` | No | Keep | Keep |
| `member_id` | No | Keep (as archive ref) | Keep |
| `checkout_id` | No | Archive | Delete → null |
| `event_type` | No | Keep | Keep |
| `amount` | No | Keep | Keep |
| `tier` | No | Keep | Keep |
| `metadata` | Maybe | Archive | Scrub sensitive fields |
| `created_at` | No | Keep | Keep |

---

## Database Schema Changes

### New Migration: `migrate-008-archives.sql`

```sql
-- Archives table for storing yearly event snapshots
CREATE TABLE IF NOT EXISTS archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_year INTEGER NOT NULL UNIQUE,
    archived_at TEXT NOT NULL DEFAULT (datetime('now')),
    expiration_date TEXT NOT NULL,
    is_expired INTEGER DEFAULT 0,
    
    -- Archived data as JSON (immutable after creation)
    teams_json TEXT NOT NULL,
    members_json TEXT NOT NULL,
    payment_events_json TEXT,
    
    -- Summary statistics (always available, even after expiration)
    stats_json TEXT NOT NULL,
    
    -- Metadata
    total_teams INTEGER NOT NULL,
    total_participants INTEGER NOT NULL,
    total_revenue INTEGER DEFAULT 0,
    
    -- Integrity
    data_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archives_year ON archives(event_year);
CREATE INDEX IF NOT EXISTS idx_archives_expired ON archives(is_expired);

-- Add event_year setting (for identifying current event)
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('event_year', '2024', 'Current event year'),
    ('gdpr_retention_years', '3', 'Years to retain personal data before anonymization');
```

---

## Event Year Detection Logic

Hybrid approach combining Option A and B:

1. **Admin sets `event_year` setting** before each event (Option B)
2. **Fallback detection** from registration dates (Option A):
   - If most `created_at` dates are in Nov-Dec of year X → event year is X
   - If most dates are in Jan of year X → event year is X-1 (late registrations)

```javascript
async function detectEventYear(db) {
  // First, check if admin has set it
  const settingYear = await getSetting(db, 'event_year');
  if (settingYear) return parseInt(settingYear, 10);
  
  // Fallback: infer from registration dates
  const result = await db.prepare(`
    SELECT 
      strftime('%Y', created_at) as year,
      strftime('%m', created_at) as month,
      COUNT(*) as count
    FROM members
    GROUP BY year, month
    ORDER BY count DESC
    LIMIT 1
  `).first();
  
  if (!result) return new Date().getFullYear();
  
  const year = parseInt(result.year, 10);
  const month = parseInt(result.month, 10);
  
  // If January registrations, likely for previous year's event
  return month === 1 ? year - 1 : year;
}
```

---

## API Endpoints

### Archives Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/archives` | List all archives (year, stats, expired status) |
| GET | `/api/admin/archives/:year` | Get full archive data for a year |
| POST | `/api/admin/archives` | Create new archive for current event |
| GET | `/api/admin/archives/:year/export` | Download ZIP export |
| POST | `/api/admin/archives/check-expiration` | Trigger GDPR expiration check |

### Settings Extensions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/settings/event-year` | Get/detect current event year |
| PUT | `/api/admin/settings/event-year` | Set event year |
| POST | `/api/admin/reset` | Reset all data (with archive check) |

---

## Archive Data Structure

### `archives.stats_json` (Always readable, even after expiration)

```json
{
  "total_teams": 15,
  "total_participants": 120,
  "participants_by_bac_level": {
    "0": 5, "1": 20, "2": 35, "3": 40, "4": 15, "5": 5
  },
  "food_preferences": {
    "margherita": 30,
    "vegetarienne": 15,
    "0-rien": 10
  },
  "attendance": {
    "checked_in": 110,
    "no_show": 10
  },
  "payments": {
    "total_revenue": 60000,
    "paid_online": 80,
    "paid_onsite": 30,
    "unpaid": 10
  },
  "registration_timeline": {
    "2024-11-15": 20,
    "2024-11-16": 35
  }
}
```

### `archives.teams_json`

```json
[
  {
    "id": 1,
    "name": "Team Alpha",
    "description": "Notre super équipe",
    "member_count": 8,
    "room_id": 3,
    "created_at": "2024-11-15T10:30:00Z"
  }
]
```

### `archives.members_json` (Before expiration)

```json
[
  {
    "id": 1,
    "team_id": 1,
    "first_name": "Jean",
    "last_name": "Dupont",
    "email": "jean.dupont@example.com",
    "bac_level": 3,
    "is_leader": true,
    "food_diet": "margherita",
    "checked_in": true,
    "checked_in_at": "2024-12-07T18:30:00Z",
    "payment_status": "paid",
    "payment_amount": 500
  }
]
```

### `archives.members_json` (After expiration - anonymized)

```json
[
  {
    "id": 1,
    "team_id": 1,
    "first_name": "Participant",
    "last_name": "",
    "email": null,
    "bac_level": 3,
    "is_leader": true,
    "food_diet": "margherita",
    "checked_in": true,
    "checked_in_at": "2024-12-07T18:30:00Z",
    "payment_status": "paid",
    "payment_amount": 500
  }
]
```

---

## ZIP Export Structure

```
ndi-2024-archive.zip
├── metadata.json          # Archive info, dates, hash
├── statistics.json        # Always full stats
├── teams.csv              # Team list
├── participants.csv       # Member list (anonymized if expired)
├── participants.json      # Same as CSV but JSON format
├── payment_events.csv     # Payment audit trail
└── README.txt             # Human-readable summary
```

---

## UI Components

### Settings Tab Additions

```
┌─────────────────────────────────────────────────────────┐
│ ⚙️ Paramètres de l'événement                            │
├─────────────────────────────────────────────────────────┤
│ Année de l'événement: [2024 ▼]                          │
│ Rétention GDPR: [3] années                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📦 Archiver l'événement actuel                      │ │
│ │                                                     │ │
│ │ Crée une sauvegarde immuable des données de        │ │
│ │ l'événement 2024. Les données personnelles seront  │ │
│ │ automatiquement anonymisées après 3 ans.           │ │
│ │                                                     │ │
│ │ [Archiver l'événement 2024]                         │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🗑️ Réinitialiser les données                        │ │
│ │                                                     │ │
│ │ Supprime toutes les équipes, participants et       │ │
│ │ paiements. Les archives ne sont pas affectées.     │ │
│ │                                                     │ │
│ │ [Réinitialiser toutes les données]                  │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### New Archives Tab

```
┌─────────────────────────────────────────────────────────┐
│ 📚 Archives                                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📅 2024                                    [Ouvrir] │ │
│ │ Archivé le 08/12/2024 • 15 équipes • 120 participants│
│ │ Expiration: 08/12/2027 • 💰 600€                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📅 2023                         ⚠️ Expiré  [Ouvrir] │ │
│ │ Archivé le 10/12/2023 • 12 équipes • 95 participants│
│ │ Données personnelles anonymisées                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Archive Detail View (Modal or Subpage)

```
┌─────────────────────────────────────────────────────────┐
│ 📅 Archive 2024                              [Exporter] │
├─────────────────────────────────────────────────────────┤
│ [Statistiques] [Équipes] [Participants] [Paiements]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 📊 Statistiques                                         │
│ ┌──────────────┬──────────────┬──────────────┐          │
│ │ 15 équipes   │ 120 inscrits │ 110 présents │          │
│ └──────────────┴──────────────┴──────────────┘          │
│                                                         │
│ 💰 Revenus: 600€ (80 en ligne, 30 sur place)            │
│                                                         │
│ 🍕 Pizzas les plus populaires:                          │
│   1. Margherita (30)                                    │
│   2. 4 Fromages (25)                                    │
│   3. Reine (20)                                         │
│                                                         │
│ 🎓 Répartition BAC:                                     │
│   [===========] BAC+3 (40)                              │
│   [========]    BAC+2 (35)                              │
│   [=====]       BAC+1 (20)                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Reset Flow

```
User clicks "Réinitialiser toutes les données"
                │
                ▼
┌─────────────────────────────────────────┐
│ Vérifier si une archive existe pour     │
│ l'année en cours (2024)                 │
└─────────────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
    Archive         Pas d'archive
    existe              │
        │               ▼
        │   ┌─────────────────────────────────────────┐
        │   │ ⚠️ Aucune archive pour 2024             │
        │   │                                         │
        │   │ Voulez-vous créer une archive avant    │
        │   │ de réinitialiser les données ?          │
        │   │                                         │
        │   │ [Créer archive et réinitialiser]        │
        │   │ [Réinitialiser sans archive]            │
        │   │ [Annuler]                               │
        │   └─────────────────────────────────────────┘
        │               │
        ▼               ▼
┌─────────────────────────────────────────┐
│ ⚠️ Confirmation finale                  │
│                                         │
│ Cette action supprimera définitivement: │
│ • 15 équipes                            │
│ • 120 participants                      │
│ • Tous les paiements                    │
│                                         │
│ Tapez "SUPPRIMER" pour confirmer:       │
│ [________________]                      │
│                                         │
│ [Annuler]              [Réinitialiser]  │
└─────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database & Core Logic
- [ ] Create `migrate-008-archives.sql`
- [ ] Add `event_year` and `gdpr_retention_years` settings
- [ ] Create `src/database/db.archives.js` with CRUD operations
- [ ] Create archive data serialization utilities
- [ ] Add data hash generation for integrity
- [ ] Write unit tests for archive operations

### Phase 2: Archive Creation API
- [ ] POST `/api/admin/archives` - Create archive
- [ ] Implement `detectEventYear()` logic
- [ ] Implement GDPR expiration check
- [ ] Write integration tests

### Phase 3: Archive Consultation API
- [ ] GET `/api/admin/archives` - List archives
- [ ] GET `/api/admin/archives/:year` - Get archive details
- [ ] GET `/api/admin/archives/:year/export` - ZIP export
- [ ] Write tests for export functionality

### Phase 4: Reset Functionality
- [ ] POST `/api/admin/reset` with archive check
- [ ] Add confirmation flow
- [ ] Write tests for reset with various scenarios

### Phase 5: Admin UI - Settings Tab
- [ ] Add event year selector
- [ ] Add GDPR retention setting
- [ ] Add "Archive Event" section
- [ ] Add "Reset Data" section with flow

### Phase 6: Admin UI - Archives Tab
- [ ] Create archives list view
- [ ] Create archive detail modal/page
- [ ] Add statistics visualization
- [ ] Add teams/participants readonly tables
- [ ] Add export button

### Phase 7: GDPR Automation
- [ ] Create scheduled expiration check (or on-access)
- [ ] Implement anonymization logic
- [ ] Add "last_gdpr_check" tracking
- [ ] Write tests for expiration scenarios

---

## Testing Strategy

### Unit Tests
- Archive creation with all data types
- GDPR anonymization logic
- Event year detection
- ZIP generation
- Data hash verification

### Integration Tests
- Full archive creation flow
- Reset with/without existing archive
- Export download
- Expiration check and anonymization

### E2E Tests (if applicable)
- Admin creates archive from UI
- Admin downloads ZIP export
- Admin resets data with archive creation
- Archive consultation after expiration

---

## Security Considerations

1. **Admin-only access**: All archive endpoints require admin authentication
2. **Immutability**: Once created, archive data cannot be modified (only expiration can update)
3. **Hash verification**: Data integrity checked on export
4. **No password archiving**: Team passwords are never stored in archives
5. **External ID cleanup**: SumUp checkout/transaction IDs removed on expiration

---

## Rollback Plan

If issues arise:
1. Archives are additive (don't affect live data)
2. Reset is a separate action requiring explicit confirmation
3. Migration is reversible: `DROP TABLE archives`
