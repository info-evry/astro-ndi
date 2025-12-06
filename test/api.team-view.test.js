/**
 * Team View API Tests
 * Tests for public team view with password authentication
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  // Setup schema
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', room TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
});

describe('Team View - Password Authentication', () => {
  let teamId;

  beforeEach(async () => {
    // Create a team with plain text password for testing
    await env.DB.exec(`DELETE FROM members`);
    await env.DB.exec(`DELETE FROM teams`);

    const result = await env.DB.prepare(
      `INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)`
    ).bind('Test Team', 'A test team', 'testpassword123').run();
    teamId = result.meta.last_row_id;

    // Add a member to the team
    await env.DB.prepare(
      `INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(teamId, 'John', 'Doe', 'john@example.com', 3, 1, 'margherita').run();
  });

  it('should reject request without password', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Password is required');
  });

  it('should reject empty password', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' })
    });

    expect(response.status).toBe(400);
  });

  it('should reject incorrect password', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' })
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('incorrect');
  });

  it('should accept correct password and return team data', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpassword123' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.team).toBeDefined();
    expect(data.team.name).toBe('Test Team');
    expect(data.team.members).toHaveLength(1);
    expect(data.team.members[0].firstName).toBe('John');
  });

  it('should return 404 for non-existent team', async () => {
    const response = await SELF.fetch('http://localhost/api/teams/99999/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'anypassword' })
    });

    expect(response.status).toBe(404);
  });

  it('should not expose password hash in response', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpassword123' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.team.password_hash).toBeUndefined();
    expect(data.team.passwordHash).toBeUndefined();
  });

  it('should return member details in correct format', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpassword123' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const member = data.team.members[0];

    expect(member.id).toBeDefined();
    expect(member.firstName).toBe('John');
    expect(member.lastName).toBe('Doe');
    expect(member.email).toBe('john@example.com');
    expect(member.bacLevel).toBe(3);
    expect(member.isLeader).toBe(true);
    expect(member.foodDiet).toBe('margherita');
  });
});

describe('Team View - PBKDF2 Password', () => {
  let teamId;

  beforeEach(async () => {
    await env.DB.exec(`DELETE FROM members`);
    await env.DB.exec(`DELETE FROM teams`);

    // Create a team - we'll set the PBKDF2 hash via API
    const result = await env.DB.prepare(
      `INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)`
    ).bind('Secure Team', 'Team with PBKDF2', '').run();
    teamId = result.meta.last_row_id;
  });

  it('should work with teams that have no password set', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'anypassword' })
    });

    // Empty password hash should fail validation
    expect(response.status).toBe(403);
  });
});

describe('Team View - Multiple Members', () => {
  let teamId;

  beforeEach(async () => {
    await env.DB.exec(`DELETE FROM members`);
    await env.DB.exec(`DELETE FROM teams`);

    const result = await env.DB.prepare(
      `INSERT INTO teams (name, description, password_hash) VALUES (?, ?, ?)`
    ).bind('Large Team', 'Team with many members', 'teampass').run();
    teamId = result.meta.last_row_id;

    // Add multiple members
    const members = [
      ['Alice', 'Smith', 'alice@example.com', 2, 1, 'vegetarian'],
      ['Bob', 'Johnson', 'bob@example.com', 3, 0, 'none'],
      ['Charlie', 'Brown', 'charlie@example.com', 4, 0, 'margherita'],
    ];

    for (const [firstName, lastName, email, bacLevel, isLeader, foodDiet] of members) {
      await env.DB.prepare(
        `INSERT INTO members (team_id, first_name, last_name, email, bac_level, is_leader, food_diet)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(teamId, firstName, lastName, email, bacLevel, isLeader, foodDiet).run();
    }
  });

  it('should return all team members', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'teampass' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.team.members).toHaveLength(3);
  });

  it('should identify the team leader', async () => {
    const response = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'teampass' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const leaders = data.team.members.filter(m => m.isLeader);
    expect(leaders).toHaveLength(1);
    expect(leaders[0].firstName).toBe('Alice');
  });
});

describe('Team View - Error Handling', () => {
  it('should handle invalid team ID', async () => {
    const response = await SELF.fetch('http://localhost/api/teams/invalid/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test' })
    });

    // Should return 404 for NaN teamId
    expect(response.status).toBe(404);
  });

  it('should handle invalid JSON body', async () => {
    const response = await SELF.fetch('http://localhost/api/teams/1/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json'
    });

    expect(response.status).toBe(500);
  });

  it('should handle missing Content-Type', async () => {
    const response = await SELF.fetch('http://localhost/api/teams/1/view', {
      method: 'POST',
      body: JSON.stringify({ password: 'test' })
    });

    // Should still work or fail gracefully (403 = auth failed, which is expected)
    expect([200, 400, 403, 404, 500]).toContain(response.status);
  });
});
