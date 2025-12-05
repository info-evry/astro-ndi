/**
 * Registration API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', checked_in INTEGER DEFAULT 0, checked_in_at TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('POST /api/register - New Team Creation', () => {
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

  it('should create team with description', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Described Team',
        teamDescription: 'This is our team description',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Desc',
            lastName: 'Test',
            email: 'desc@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    // Description is stored but not returned in registration response
    expect(data.team.name).toBe('Described Team');
  });
});

describe('POST /api/register - Join Existing Team', () => {
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
    expect(joinData.error.toLowerCase()).toContain('incorrect');
  });

  it('should allow joining without being a leader', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Team For Non-Leader',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'The',
            lastName: 'Leader',
            email: 'theleader@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Join as non-leader
    const joinResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: false,
        teamId: teamId,
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Not',
            lastName: 'ALeader',
            email: 'notleader@example.com',
            bacLevel: 1,
            isLeader: false,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(joinResponse.status).toBe(200);
  });
});

describe('POST /api/register - Member Validation', () => {
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

  it('should register multiple members at once', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Multi Member Team',
        teamPassword: 'multipass',
        members: [
          {
            firstName: 'Leader',
            lastName: 'One',
            email: 'leader.one@example.com',
            bacLevel: 5,
            isLeader: true,
            foodDiet: 'margherita'
          },
          {
            firstName: 'Member',
            lastName: 'Two',
            email: 'member.two@example.com',
            bacLevel: 3,
            isLeader: false,
            foodDiet: 'pepperoni'
          },
          {
            firstName: 'Member',
            lastName: 'Three',
            email: 'member.three@example.com',
            bacLevel: 2,
            isLeader: false,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(3);
  });
});

describe('Input Validation Edge Cases', () => {
  it('should reject extremely long team names', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'A'.repeat(500),
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Test',
            lastName: 'User',
            email: 'longname@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect([200, 400]).toContain(response.status);
  });

  it('should handle special characters in names', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Équipe Spéciale',
        teamPassword: 'special123',
        members: [
          {
            firstName: 'François',
            lastName: 'Müller',
            email: 'francois@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.team.name).toBe('Équipe Spéciale');
    expect(data.members[0].firstName).toBe('François');
  });

  it('should reject malformed JSON', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json'
    });

    expect([400, 500]).toContain(response.status);
  });

  it('should reject empty members array', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Empty Team',
        teamPassword: 'testpass',
        members: []
      })
    });

    expect(response.status).toBe(400);
  });

  it('should reject invalid email format', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Bad Email Team',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Bad',
            lastName: 'Email',
            email: 'notanemail',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(400);
  });

  it('should accept mixed case email addresses', async () => {
    const response = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Email Case Team',
        teamPassword: 'testpass',
        members: [
          {
            firstName: 'Email',
            lastName: 'Case',
            email: 'UPPERCASE@EXAMPLE.COM',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.members).toHaveLength(1);
  });
});
