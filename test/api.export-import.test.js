/**
 * CSV Export and Import API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('CSV Export - Authentication', () => {
  it('should require authorization for export', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export');
    expect(response.status).toBe(401);
  });

  it('should export CSV with authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
  });
});

describe('CSV Export Format', () => {
  it('should export CSV with proper headers', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const text = await response.text();

    // Check for expected CSV headers (French)
    expect(text).toContain('Équipe');
    expect(text).toContain('Prénom');
    expect(text).toContain('Nom');
    expect(text).toContain('Email');
    expect(text).toContain('Niveau BAC');
    expect(text).toContain('Pizza');
    expect(text).toContain('Chef');
  });

  it('should use semicolon delimiter for European Excel', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    // Check that the header line uses semicolons
    const firstLine = text.split('\n')[0];
    expect(firstLine).toContain(';');
  });

  it('should include UTF-8 BOM', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    // UTF-8 BOM is \ufeff
    expect(text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('should set proper Content-Disposition header', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('.csv');
  });
});

describe('CSV Export - Team Specific', () => {
  it('should export team-specific CSV', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'CSV Export Team',
        teamPassword: 'csvtest',
        members: [
          {
            firstName: 'CSV',
            lastName: 'User',
            email: 'csv@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/admin/export/${teamId}`, {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('.csv');
  });

  it('should return 404 for non-existent team export', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export/99999', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(404);
  });

  it('should include team name in filename', async () => {
    // Create a team with a specific name
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Filename Test Team',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Filename',
            lastName: 'Test',
            email: 'filenametest@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/admin/export/${teamId}`, {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('Filename_Test_Team');
  });
});

describe('CSV Export - Official NDI Format', () => {
  it('should require authorization for official export', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official');
    expect(response.status).toBe(401);
  });

  it('should export official CSV with authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
  });

  it('should have correct official headers', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    const firstLine = text.replace(/^\ufeff/, '').split('\n')[0];

    expect(firstLine).toContain('prenom');
    expect(firstLine).toContain('nom');
    expect(firstLine).toContain('mail');
    expect(firstLine).toContain('niveauBac');
    expect(firstLine).toContain('equipe');
    expect(firstLine).toContain('estLeader (0\\1)');
    expect(firstLine).toContain('ecole');
  });

  it('should use semicolon delimiter', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    const firstLine = text.split('\n')[0];
    expect(firstLine.split(';').length).toBe(7);
  });

  it('should include UTF-8 BOM', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    expect(text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('should set proper filename', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('participants_officiel.csv');
  });

  it('should have uppercase last names', async () => {
    // Create a team with a member
    await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Official Export Team',
        teamPassword: 'officialtest',
        members: [
          {
            firstName: 'Jean',
            lastName: 'Dupont',
            email: 'officialjean@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    expect(text).toContain('DUPONT');
  });

  it('should have bac_level as integer', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    const lines = text.replace(/^\ufeff/, '').split('\n');
    // Check a data line (skip header)
    if (lines.length > 1 && lines[1].trim()) {
      const fields = lines[1].split(';');
      const bacLevel = fields[3]; // niveauBac is 4th column (index 3)
      // Should be a plain integer, not "BAC+3" or similar
      expect(bacLevel).toMatch(/^\d+$/);
    }
  });

  it('should have estLeader as 0 or 1', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    const lines = text.replace(/^\ufeff/, '').split('\n');
    // Check data lines
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const fields = lines[i].split(';');
        const estLeader = fields[5]; // estLeader is 6th column (index 5)
        expect(['0', '1']).toContain(estLeader);
      }
    }
  });
});

describe('CSV Export - Team Official NDI Format', () => {
  it('should require authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official/1');
    expect(response.status).toBe(401);
  });

  it('should export team official CSV with authorization', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Team Official Export Test',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'TeamOfficiel',
            lastName: 'Test',
            email: 'teamofficiel@example.com',
            bacLevel: 4,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/admin/export-official/${teamId}`, {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
  });

  it('should have correct official headers for team export', async () => {
    // Get any existing team
    const teamsResponse = await SELF.fetch('http://localhost/api/teams');
    const teamsData = await teamsResponse.json();
    const teamId = teamsData.teams[0]?.id;

    if (!teamId) return; // Skip if no teams

    const response = await SELF.fetch(`http://localhost/api/admin/export-official/${teamId}`, {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const text = await response.text();
    const firstLine = text.replace(/^\ufeff/, '').split('\n')[0];

    expect(firstLine).toContain('prenom');
    expect(firstLine).toContain('nom');
    expect(firstLine).toContain('niveauBac');
    expect(firstLine).toContain('estLeader');
  });

  it('should return 404 for non-existent team', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export-official/99999', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(404);
  });

  it('should include team name in filename', async () => {
    // Create a team with specific name
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Filename Official Team',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'FileOfficiel',
            lastName: 'Test',
            email: 'fileofficiel@example.com',
            bacLevel: 2,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/admin/export-official/${teamId}`, {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('participants_officiel_Filename_Official_Team');
  });
});

describe('CSV Import - Authentication', () => {
  it('should require authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: 'test' })
    });

    expect(response.status).toBe(401);
  });
});

describe('CSV Import - Basic Functionality', () => {
  it('should import members from CSV', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Jean,Dupont,jean@example.com,margherita,3,Yes,Import Team,2024-01-01
2,Marie,Martin,marie@example.com,pepperoni,2,No,Import Team,2024-01-01
3,Pierre,Bernard,pierre@example.com,4fromages,4,Yes,Other Import Team,2024-01-01`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.stats.membersImported).toBe(3);
    expect(data.stats.teamsCreated).toBe(2);
  });

  it('should create teams automatically', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Auto,TeamTest,autoteamtest@example.com,none,1,Yes,Auto Created Team,2024-01-01`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.teamsCreated).toBeGreaterThanOrEqual(1);

    // Verify team was created
    const teamsResponse = await SELF.fetch('http://localhost/api/teams');
    const teamsData = await teamsResponse.json();
    const newTeam = teamsData.teams.find(t => t.name === 'Auto Created Team');
    expect(newTeam).toBeDefined();
  });
});

describe('CSV Import - Duplicate Handling', () => {
  it('should skip duplicate members', async () => {
    // First import
    const csv1 = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Duplicate,User,dup@example.com,margherita,3,Yes,Dup Team,2024-01-01`;

    await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv: csv1 })
    });

    // Second import with same member
    const csv2 = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Duplicate,User,different@example.com,pepperoni,4,No,Dup Team,2024-01-02`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv: csv2 })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.membersSkipped).toBe(1);
    expect(data.stats.membersImported).toBe(0);
  });
});

describe('CSV Import - Validation', () => {
  it('should reject missing required columns', async () => {
    const csv = `id,firstname,email
1,Jean,jean@example.com`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing required columns');
  });

  it('should reject empty CSV', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv: '' })
    });

    expect(response.status).toBe(400);
  });

  it('should reject CSV with only headers', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    // CSV with only headers and no data rows should be rejected
    expect([400, 500]).toContain(response.status);
  });
});

describe('CSV Import - isManager Parsing', () => {
  it('should recognize Yes/No for ismanager', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Manager,Yes,myes@example.com,none,1,Yes,Manager Team,2024-01-01
2,Manager,No,mno@example.com,none,1,No,Manager Team,2024-01-01`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.membersImported).toBe(2);
  });

  it('should recognize true/false for ismanager', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,TrueFalse,Leader,trueleader@example.com,none,1,true,TrueFalse Team,2024-01-01
2,TrueFalse,Member,truemember@example.com,none,1,false,TrueFalse Team,2024-01-01`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(200);
  });

  it('should recognize 1/0 for ismanager', async () => {
    const csv = `id,firstname,lastname,email,fooddiet,baclevel,ismanager,teamName,date
1,Binary,Leader,binaryleader@example.com,none,1,1,Binary Team,2024-01-01
2,Binary,Member,binarymember@example.com,none,1,0,Binary Team,2024-01-01`;

    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({ csv })
    });

    expect(response.status).toBe(200);
  });
});
