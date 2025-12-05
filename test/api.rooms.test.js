/**
 * Room Assignment API Tests
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

const ADMIN_TOKEN = 'test-admin-token';

beforeAll(async () => {
  // Create schema with room field
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, pizza_received INTEGER DEFAULT 0, pizza_received_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
});

beforeEach(async () => {
  // Clean up data before each test
  await env.DB.exec(`DELETE FROM members`);
  await env.DB.exec(`DELETE FROM teams`);

  // Create test teams with and without rooms
  await env.DB.exec(`INSERT INTO teams (id, name, description, room) VALUES (1, 'Team Alpha', 'First team', 'Salle A')`);
  await env.DB.exec(`INSERT INTO teams (id, name, description, room) VALUES (2, 'Team Beta', 'Second team', NULL)`);
  await env.DB.exec(`INSERT INTO teams (id, name, description, room) VALUES (3, 'Team Gamma', 'Third team', 'Salle B')`);
  await env.DB.exec(`INSERT INTO teams (id, name, description) VALUES (4, 'Organisation', 'Organisers')`);

  // Add some members to teams
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email) VALUES (1, 1, 'Alice', 'Smith', 'alice@example.com')`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email) VALUES (2, 1, 'Bob', 'Jones', 'bob@example.com')`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email) VALUES (3, 2, 'Charlie', 'Brown', 'charlie@example.com')`);
  await env.DB.exec(`INSERT INTO members (id, team_id, first_name, last_name, email) VALUES (4, 3, 'Diana', 'Williams', 'diana@example.com')`);
});

describe('GET /api/admin/rooms', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET'
    });

    expect(response.status).toBe(401);
  });

  it('should return all teams with room assignments (excluding Organisation)', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.teams).toHaveLength(3); // Excludes Organisation
    expect(data.teams.find(t => t.name === 'Organisation')).toBeUndefined();
  });

  it('should return correct room stats', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.stats.total_teams).toBe(3);
    expect(data.stats.assigned_teams).toBe(2); // Team Alpha and Team Gamma
    expect(data.stats.unassigned_teams).toBe(1); // Team Beta
  });

  it('should return teams sorted by room (unassigned last)', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    // Teams with rooms should come before teams without rooms
    const teamsWithRooms = data.teams.filter(t => t.room);
    const teamsWithoutRooms = data.teams.filter(t => !t.room);

    expect(teamsWithRooms.length).toBe(2);
    expect(teamsWithoutRooms.length).toBe(1);
  });

  it('should return member counts for each team', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    const teamAlpha = data.teams.find(t => t.name === 'Team Alpha');
    const teamBeta = data.teams.find(t => t.name === 'Team Beta');
    const teamGamma = data.teams.find(t => t.name === 'Team Gamma');

    expect(teamAlpha.member_count).toBe(2);
    expect(teamBeta.member_count).toBe(1);
    expect(teamGamma.member_count).toBe(1);
  });

  it('should return distinct rooms list', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.rooms).toContain('Salle A');
    expect(data.rooms).toContain('Salle B');
    expect(data.rooms.length).toBe(2);
  });

  it('should return by_room breakdown', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(data.stats.by_room).toHaveLength(2);

    const salleA = data.stats.by_room.find(r => r.room === 'Salle A');
    const salleB = data.stats.by_room.find(r => r.room === 'Salle B');

    expect(salleA.team_count).toBe(1);
    expect(salleA.member_count).toBe(2);
    expect(salleB.team_count).toBe(1);
    expect(salleB.member_count).toBe(1);
  });
});

describe('PUT /api/admin/rooms/:teamId', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: 'Salle C' })
    });

    expect(response.status).toBe(401);
  });

  it('should assign a room to a team', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/2', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: 'Salle C' })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.team.id).toBe(2);
    expect(data.team.room).toBe('Salle C');

    // Verify in database
    const getResponse = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const getData = await getResponse.json();
    const teamBeta = getData.teams.find(t => t.id === 2);
    expect(teamBeta.room).toBe('Salle C');
  });

  it('should clear a room assignment with null', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/1', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: null })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.team.room).toBeNull();
  });

  it('should clear a room assignment with empty string', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/1', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: '' })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.team.room).toBeNull();
  });

  it('should return 404 for non-existent team', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/999', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: 'Salle X' })
    });

    expect(response.status).toBe(404);
  });

  it('should reject room names longer than 50 characters', async () => {
    const longRoomName = 'A'.repeat(51);

    const response = await SELF.fetch('http://localhost/api/admin/rooms/1', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: longRoomName })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('50 characters');
  });

  it('should update stats after room assignment', async () => {
    // Assign room to Team Beta (previously unassigned)
    await SELF.fetch('http://localhost/api/admin/rooms/2', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ room: 'Salle A' })
    });

    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const data = await response.json();

    expect(data.stats.assigned_teams).toBe(3);
    expect(data.stats.unassigned_teams).toBe(0);
  });
});

describe('POST /api/admin/rooms/batch', () => {
  it('should require admin authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ assignments: [{ teamId: 1, room: 'Salle X' }] })
    });

    expect(response.status).toBe(401);
  });

  it('should assign rooms to multiple teams', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        assignments: [
          { teamId: 1, room: 'Salle X' },
          { teamId: 2, room: 'Salle Y' },
          { teamId: 3, room: 'Salle X' }
        ]
      })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.updated).toBe(3);

    // Verify assignments
    const getResponse = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const getData = await getResponse.json();

    const team1 = getData.teams.find(t => t.id === 1);
    const team2 = getData.teams.find(t => t.id === 2);
    const team3 = getData.teams.find(t => t.id === 3);

    expect(team1.room).toBe('Salle X');
    expect(team2.room).toBe('Salle Y');
    expect(team3.room).toBe('Salle X');
  });

  it('should reject empty assignments array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({ assignments: [] })
    });

    expect(response.status).toBe(400);
  });

  it('should reject assignments without teamId', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        assignments: [{ room: 'Salle X' }]
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('teamId');
  });

  it('should allow clearing rooms in batch', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        assignments: [
          { teamId: 1, room: null },
          { teamId: 3, room: '' }
        ]
      })
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.updated).toBe(2);

    // Verify rooms were cleared
    const getResponse = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    const getData = await getResponse.json();

    expect(getData.stats.assigned_teams).toBe(0);
    expect(getData.stats.unassigned_teams).toBe(3);
  });
});

describe('GET /api/admin/rooms - Pizza by room', () => {
  beforeEach(async () => {
    // Add food_diet and checked_in to members for pizza stats
    await env.DB.exec(`UPDATE members SET food_diet = 'margherita', checked_in = 1 WHERE id = 1`);
    await env.DB.exec(`UPDATE members SET food_diet = '4fromages', checked_in = 1 WHERE id = 2`);
    await env.DB.exec(`UPDATE members SET food_diet = 'margherita', checked_in = 0 WHERE id = 3`);
    await env.DB.exec(`UPDATE members SET food_diet = 'vegetarienne', checked_in = 1 WHERE id = 4`);
  });

  it('should return pizza_by_room data', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pizza_by_room).toBeDefined();
    expect(Array.isArray(data.pizza_by_room)).toBe(true);
  });

  it('should group pizza stats by room', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    // Should have 2 rooms with assigned teams (Salle A and Salle B)
    expect(data.pizza_by_room.length).toBe(2);

    const salleA = data.pizza_by_room.find(r => r.room === 'Salle A');
    const salleB = data.pizza_by_room.find(r => r.room === 'Salle B');

    expect(salleA).toBeDefined();
    expect(salleB).toBeDefined();
  });

  it('should include total and present counts per pizza type', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    const salleA = data.pizza_by_room.find(r => r.room === 'Salle A');
    expect(salleA.pizzas).toBeDefined();
    expect(salleA.pizzas.length).toBe(2); // margherita and 4fromages

    // Check that each pizza type has total and present counts
    const margherita = salleA.pizzas.find(p => p.food_diet === 'margherita');
    expect(margherita).toBeDefined();
    expect(margherita.total).toBe(1);
    expect(margherita.present).toBe(1); // Alice is checked in

    const quatreFromages = salleA.pizzas.find(p => p.food_diet === '4fromages');
    expect(quatreFromages).toBeDefined();
    expect(quatreFromages.total).toBe(1);
    expect(quatreFromages.present).toBe(1); // Bob is checked in
  });

  it('should include room totals', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    const salleA = data.pizza_by_room.find(r => r.room === 'Salle A');
    expect(salleA.totals).toBeDefined();
    expect(salleA.totals.total).toBe(2); // Alice + Bob
    expect(salleA.totals.present).toBe(2); // Both checked in

    const salleB = data.pizza_by_room.find(r => r.room === 'Salle B');
    expect(salleB.totals).toBeDefined();
    expect(salleB.totals.total).toBe(1); // Diana
    expect(salleB.totals.present).toBe(1); // Diana is checked in
  });

  it('should not include teams without rooms in pizza_by_room', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/rooms', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });

    const data = await response.json();

    // Team Beta has no room, so Charlie's pizza should not appear
    const roomNames = data.pizza_by_room.map(r => r.room);
    expect(roomNames).not.toContain(null);
    expect(roomNames).not.toContain('');
  });
});
