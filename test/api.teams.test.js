/**
 * Teams Public API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
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

  it('should include is_full flag', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');
    const data = await response.json();

    if (data.teams.length > 0) {
      expect(data.teams[0]).toHaveProperty('is_full');
      expect(typeof data.teams[0].is_full).toBe('boolean');
    }
  });
});

describe('GET /api/teams/:id', () => {
  it('should return a specific team by ID', async () => {
    // Create a team first
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Specific Team Test',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Specific',
            lastName: 'Test',
            email: 'specifictest@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.team).toBeDefined();
    expect(data.team.id).toBe(teamId);
    expect(data.team.name).toBe('Specific Team Test');
  });

  it('should return 404 for non-existent team', async () => {
    const response = await SELF.fetch('http://localhost/api/teams/99999');
    expect(response.status).toBe(404);
  });

  it('should include members array for specific team', async () => {
    // Create a team with members
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Member Count Test',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Count1',
            lastName: 'Test',
            email: 'count1test@example.com',
            bacLevel: 2,
            isLeader: true,
            foodDiet: 'none'
          },
          {
            firstName: 'Count2',
            lastName: 'Test',
            email: 'count2test@example.com',
            bacLevel: 1,
            isLeader: false,
            foodDiet: 'pepperoni'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}`);
    const data = await response.json();

    expect(data.team.members).toBeDefined();
    expect(data.team.members).toHaveLength(2);
    expect(data.team.members[0].first_name).toBe('Count1');
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

  it('should include available spots', async () => {
    const response = await SELF.fetch('http://localhost/api/stats');
    const data = await response.json();

    expect(data.stats.available_spots).toBeDefined();
    expect(typeof data.stats.available_spots).toBe('number');
    expect(data.stats.available_spots).toBeGreaterThanOrEqual(0);
  });

  it('should include food preferences', async () => {
    const response = await SELF.fetch('http://localhost/api/stats');
    const data = await response.json();

    expect(data.stats.food_preferences).toBeDefined();
    expect(Array.isArray(data.stats.food_preferences)).toBe(true);
  });
});

describe('Organisation Team Special Handling', () => {
  it('should mark Organisation team with is_organisation flag', async () => {
    const response = await SELF.fetch('http://localhost/api/teams');
    const data = await response.json();

    const orgTeam = data.teams.find(t => t.name === 'Organisation');
    expect(orgTeam).toBeDefined();
    expect(orgTeam.is_organisation).toBe(true);
    expect(orgTeam.available_slots).toBe(null);
    expect(orgTeam.is_full).toBe(false);
  });

  it('should mark regular teams without is_organisation flag', async () => {
    // Create a regular team first
    await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Regular Team Flag Test',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Flag',
            lastName: 'Test',
            email: 'flagtest@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const response = await SELF.fetch('http://localhost/api/teams');
    const data = await response.json();

    const regularTeam = data.teams.find(t => t.name === 'Regular Team Flag Test');
    expect(regularTeam).toBeDefined();
    expect(regularTeam.is_organisation).toBe(false);
    expect(regularTeam.available_slots).toBeTypeOf('number');
  });
});

describe('POST /api/teams/:id/view - Public Team View', () => {
  it('should return team members with correct password', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Viewable Team',
        teamPassword: 'viewpass123',
        members: [
          {
            firstName: 'View',
            lastName: 'Leader',
            email: 'viewleader@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'margherita'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // View team with correct password
    const viewResponse = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'viewpass123' })
    });

    expect(viewResponse.status).toBe(200);
    const viewData = await viewResponse.json();
    expect(viewData.team).toBeDefined();
    expect(viewData.team.name).toBe('Viewable Team');
    expect(viewData.team.members).toHaveLength(1);
    expect(viewData.team.members[0].firstName).toBe('View');
  });

  it('should reject view with wrong password', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Private Team',
        teamPassword: 'secretpass',
        members: [
          {
            firstName: 'Private',
            lastName: 'Member',
            email: 'private@example.com',
            bacLevel: 2,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Try to view with wrong password
    const viewResponse = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpass' })
    });

    expect(viewResponse.status).toBe(403);
    const viewData = await viewResponse.json();
    expect(viewData.error).toContain('incorrect');
  });

  it('should require password', async () => {
    const viewResponse = await SELF.fetch('http://localhost/api/teams/1/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(viewResponse.status).toBe(400);
    const viewData = await viewResponse.json();
    expect(viewData.error).toContain('required');
  });

  it('should return 404 for non-existent team', async () => {
    const viewResponse = await SELF.fetch('http://localhost/api/teams/99999/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'anypass' })
    });

    expect(viewResponse.status).toBe(404);
  });
});

describe('Team Capacity and Full Teams', () => {
  it('should prevent joining full teams', async () => {
    // Create team with max members
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Capacity Test Team',
        teamPassword: 'capacity123',
        members: Array(15).fill(null).map((_, i) => ({
          firstName: `Capacity${i}`,
          lastName: `Member${i}`,
          email: `capacity${i}@example.com`,
          bacLevel: 1,
          isLeader: i === 0,
          foodDiet: 'none'
        }))
      })
    });

    expect(createResponse.status).toBe(200);
    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Check team is full
    const teamsResponse = await SELF.fetch('http://localhost/api/teams');
    const teamsData = await teamsResponse.json();
    const fullTeam = teamsData.teams.find(t => t.id === teamId);
    expect(fullTeam.is_full).toBe(true);
    expect(fullTeam.available_slots).toBe(0);

    // Try to join full team
    const joinResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: false,
        teamId: teamId,
        teamPassword: 'capacity123',
        members: [
          {
            firstName: 'Extra',
            lastName: 'Member',
            email: 'extra@example.com',
            bacLevel: 2,
            isLeader: false,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(joinResponse.status).toBe(400);
    const joinData = await joinResponse.json();
    expect(joinData.error).toContain('full');
  });
});
