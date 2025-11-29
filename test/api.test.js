import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

// Initialize database schema before tests
beforeAll(async () => {
  // Create teams table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);

  // Create members table
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);

  // Seed with Organisation team
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('GET /api/config', () => {
  it('should return configuration', async () => {
    const response = await SELF.fetch('http://localhost/api/config');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.config).toBeDefined();
    expect(data.config.pizzas).toBeDefined();
    expect(Array.isArray(data.config.pizzas)).toBe(true);
    expect(data.config.bacLevels).toBeDefined();
    expect(data.config.maxTeamSize).toBe(15);
    expect(data.config.minTeamSize).toBe(1);
  });
});

describe('GET /api/teams', () => {
  it('should return teams list', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.teams).toBeDefined();
    expect(Array.isArray(data.teams)).toBe(true);
  });

  it('should include member counts', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');
    const data = await response.json();

    if (data.teams.length > 0) {
      expect(data.teams[0]).toHaveProperty('member_count');
      expect(data.teams[0]).toHaveProperty('available_slots');
    }
  });
});

describe('GET /api/stats', () => {
  it('should return statistics', async () => {
    const response = await SELF.fetch('http://localhost/api/stats');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats).toBeDefined();
    expect(data.stats.total_teams).toBeDefined();
    expect(data.stats.total_participants).toBeDefined();
    expect(data.stats.max_participants).toBe(200);
  });
});

describe('POST /api/register', () => {
  it('should create a new team with members', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Test Team',
        teamDescription: 'A test team',
        teamPassword: 'testpass123',
        members: [
          {
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.team.name).toBe('Test Team');
    expect(data.team.isNew).toBe(true);
    expect(data.members).toHaveLength(1);
  });

  it('should reject duplicate team names', async () => {
    // First create a team
    await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Duplicate Team',
        teamPassword: 'pass1234',
        members: [
          {
            firstName: 'First',
            lastName: 'Member',
            email: 'first@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    // Try to create team with same name
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Duplicate Team',
        teamPassword: 'different',
        members: [
          {
            firstName: 'Another',
            lastName: 'Person',
            email: 'another@example.com',
            bacLevel: 2,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already exists');
  });

  it('should reject registration without password', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'No Password Team',
        teamPassword: '',
        members: [
          {
            firstName: 'No',
            lastName: 'Pass',
            email: 'nopass@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('password');
  });

  it('should reject new team without leader', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'No Leader Team',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'No',
            lastName: 'Leader',
            email: 'noleader@example.com',
            bacLevel: 1,
            isLeader: false,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('leader');
  });

  it('should allow joining existing team with correct password', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Joinable Team',
        teamPassword: 'joinme123',
        members: [
          {
            firstName: 'Team',
            lastName: 'Leader',
            email: 'leader@example.com',
            bacLevel: 5,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Now join the team
    const joinResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: false,
        teamId: teamId,
        teamPassword: 'joinme123',
        members: [
          {
            firstName: 'New',
            lastName: 'Joiner',
            email: 'joiner@example.com',
            bacLevel: 2,
            isLeader: false,
            foodDiet: 'pepperoni'
          }
        ]
      })
    });

    expect(joinResponse.status).toBe(200);
    const joinData = await joinResponse.json();
    expect(joinData.success).toBe(true);
    expect(joinData.team.isNew).toBe(false);
  });

  it('should reject joining with wrong password', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Secure Team',
        teamPassword: 'correctpassword',
        members: [
          {
            firstName: 'Secure',
            lastName: 'Leader',
            email: 'secure@example.com',
            bacLevel: 4,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Try to join with wrong password
    const joinResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: false,
        teamId: teamId,
        teamPassword: 'wrongpassword',
        members: [
          {
            firstName: 'Wrong',
            lastName: 'Pass',
            email: 'wrong@example.com',
            bacLevel: 1,
            isLeader: false,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(joinResponse.status).toBe(403);
    const joinData = await joinResponse.json();
    expect(joinData.error).toContain('incorrect');
  });

  it('should reject duplicate members', async () => {
    // First register a member
    await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Original Team',
        teamPassword: 'original',
        members: [
          {
            firstName: 'Already',
            lastName: 'Registered',
            email: 'already@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    // Try to register same person again
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'New Team',
        teamPassword: 'newteam',
        members: [
          {
            firstName: 'Already',
            lastName: 'Registered',
            email: 'different@example.com',
            bacLevel: 2,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already registered');
  });
});

describe('Admin API', () => {
  it('should reject unauthorized access to admin stats', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats');

    expect(response.status).toBe(401);
  });

  it('should accept authorized access to admin stats', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats).toBeDefined();
    expect(data.teams).toBeDefined();
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

  it('should reject invalid token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer wrong-token'
      }
    });

    expect(response.status).toBe(401);
  });
});

describe('CORS', () => {
  it('should handle OPTIONS preflight', async () => {
    const response = await SELF.fetch('http://localhost/api/teams', {
      method: 'OPTIONS'
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('should include CORS headers in API responses', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
