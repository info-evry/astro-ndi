/**
 * Admin API Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';

beforeAll(async () => {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', password_hash TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, bac_level INTEGER DEFAULT 0, is_leader INTEGER DEFAULT 0, food_diet TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, UNIQUE(first_name, last_name))`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now')))`);
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

describe('Admin Authentication', () => {
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

  it('should reject invalid token', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer wrong-token'
      }
    });

    expect(response.status).toBe(401);
  });

  it('should reject missing Bearer prefix', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'test-admin-token'
      }
    });

    expect(response.status).toBe(401);
  });
});

describe('Admin Stats', () => {
  it('should return comprehensive statistics', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.stats.total_teams).toBeDefined();
    expect(data.stats.total_participants).toBeDefined();
    expect(data.stats.max_participants).toBeDefined();
    expect(data.stats.available_spots).toBeDefined();
    expect(data.stats.food_preferences).toBeDefined();
  });

  it('should include BAC level distribution', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/stats', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const data = await response.json();
    expect(data.stats.bac_level_distribution).toBeDefined();
    expect(Array.isArray(data.stats.bac_level_distribution)).toBe(true);
  });
});

describe('Admin CRUD - Teams', () => {
  it('should create a new team', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Admin Created Team',
        description: 'Created by admin',
        password: 'adminpass'
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.team.name).toBe('Admin Created Team');
    expect(data.team.id).toBeDefined();
  });

  it('should create team without password', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'No Password Admin Team'
      })
    });

    expect(response.status).toBe(200);
  });

  it('should reject short team names', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'A'
      })
    });

    expect(response.status).toBe(400);
  });

  it('should update a team', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Team To Update',
        description: 'Original description',
        password: 'original'
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Update the team
    const updateResponse = await SELF.fetch(`http://localhost/api/admin/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        name: 'Updated Team Name',
        description: 'Updated description'
      })
    });

    expect(updateResponse.status).toBe(200);
    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
  });

  it('should update team password', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Password Update Team',
        password: 'oldpass'
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Update password
    const updateResponse = await SELF.fetch(`http://localhost/api/admin/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        password: 'newpassword'
      })
    });

    expect(updateResponse.status).toBe(200);

    // Verify new password works
    const viewResponse = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpassword' })
    });

    expect(viewResponse.status).toBe(200);
  });

  it('should delete a team', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Team To Delete',
        password: 'deleteme'
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Delete the team
    const deleteResponse = await SELF.fetch(`http://localhost/api/admin/teams/${teamId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      }
    });

    expect(deleteResponse.status).toBe(200);
    const deleteData = await deleteResponse.json();
    expect(deleteData.success).toBe(true);

    // Verify team no longer exists
    const viewResponse = await SELF.fetch(`http://localhost/api/teams/${teamId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'deleteme' })
    });

    expect(viewResponse.status).toBe(404);
  });

  it('should prevent deleting Organisation team', async () => {
    // Get the Organisation team ID
    const teamsResponse = await SELF.fetch('http://localhost/api/teams');
    const teamsData = await teamsResponse.json();
    const orgTeam = teamsData.teams.find(t => t.name === 'Organisation');

    if (orgTeam) {
      const deleteResponse = await SELF.fetch(`http://localhost/api/admin/teams/${orgTeam.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer test-admin-token',
          'Origin': 'http://localhost'
        }
      });

      expect(deleteResponse.status).toBe(403);
    }
  });

  it('should require authorization for team operations', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Team', password: 'test' })
    });

    expect(response.status).toBe(401);
  });
});

describe('Admin CRUD - Members', () => {
  it('should add a member manually', async () => {
    // First create a team
    const createResponse = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Member Add Team',
        password: 'memberteam'
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Add a member
    const addResponse = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        teamId: teamId,
        firstName: 'Manual',
        lastName: 'Addition',
        email: 'manual@example.com',
        bacLevel: 2,
        isLeader: false,
        foodDiet: 'regina'
      })
    });

    expect(addResponse.status).toBe(200);
    const addData = await addResponse.json();
    expect(addData.success).toBe(true);
    expect(addData.member.firstName).toBe('Manual');
  });

  it('should reject member with missing required fields', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        teamId: 1,
        firstName: 'Missing'
        // Missing lastName and email
      })
    });

    expect(response.status).toBe(400);
  });

  it('should update a member', async () => {
    // First create team and member
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Member Update Team',
        teamPassword: 'updatetest',
        members: [
          {
            firstName: 'Original',
            lastName: 'Name',
            email: 'original@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const memberId = createData.members[0].id;

    // Update the member
    const updateResponse = await SELF.fetch(`http://localhost/api/admin/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        firstName: 'Updated',
        lastName: 'Person',
        email: 'updated@example.com',
        bacLevel: 5
      })
    });

    expect(updateResponse.status).toBe(200);
    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
  });

  it('should delete a member', async () => {
    // First create team and member
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Member Delete Team',
        teamPassword: 'deletetest',
        members: [
          {
            firstName: 'ToDelete',
            lastName: 'Member',
            email: 'todelete@example.com',
            bacLevel: 1,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const memberId = createData.members[0].id;

    // Delete the member
    const deleteResponse = await SELF.fetch(`http://localhost/api/admin/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      }
    });

    expect(deleteResponse.status).toBe(200);
    const deleteData = await deleteResponse.json();
    expect(deleteData.success).toBe(true);
  });

  it('should batch delete members', async () => {
    // Create team with multiple members
    const createResponse = await SELF.fetch('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNewTeam: true,
        teamName: 'Batch Delete Team',
        teamPassword: 'batchtest',
        members: [
          {
            firstName: 'Batch',
            lastName: 'Leader',
            email: 'batchleader@example.com',
            bacLevel: 3,
            isLeader: true,
            foodDiet: 'none'
          }
        ]
      })
    });

    const createData = await createResponse.json();
    const teamId = createData.team.id;

    // Add more members via admin
    const add1 = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        teamId: teamId,
        firstName: 'BatchOne',
        lastName: 'Delete',
        email: 'batch1@example.com',
        bacLevel: 1
      })
    });

    const add2 = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        teamId: teamId,
        firstName: 'BatchTwo',
        lastName: 'Delete',
        email: 'batch2@example.com',
        bacLevel: 2
      })
    });

    const addData1 = await add1.json();
    const addData2 = await add2.json();

    // Batch delete both
    const batchResponse = await SELF.fetch('http://localhost/api/admin/members/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        memberIds: [addData1.member.id, addData2.member.id]
      })
    });

    expect(batchResponse.status).toBe(200);
    const batchData = await batchResponse.json();
    expect(batchData.success).toBe(true);
    expect(batchData.deleted).toBe(2);
  });

  it('should reject batch delete with empty array', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        memberIds: []
      })
    });

    expect(response.status).toBe(400);
  });

  it('should require authorization for member operations', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 1,
        firstName: 'Unauthorized',
        lastName: 'Member',
        email: 'unauth@example.com'
      })
    });

    expect(response.status).toBe(401);
  });
});

describe('Admin - List Members', () => {
  it('should list all members with authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toBeDefined();
    expect(Array.isArray(data.members)).toBe(true);
  });

  it('should reject unauthorized access to member list', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members');

    expect(response.status).toBe(401);
  });

  it('should include team name in member list', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/members', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    const data = await response.json();
    if (data.members.length > 0) {
      expect(data.members[0]).toHaveProperty('team_name');
    }
  });
});

describe('Member Movement Between Teams', () => {
  it('should update member team via admin API', async () => {
    // Create two teams
    const team1Response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Move From Team',
        password: 'movefrom'
      })
    });
    const team1Data = await team1Response.json();
    const team1Id = team1Data.team.id;

    const team2Response = await SELF.fetch('http://localhost/api/admin/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        name: 'Move To Team',
        password: 'moveto'
      })
    });
    const team2Data = await team2Response.json();
    const team2Id = team2Data.team.id;

    // Add member to team 1
    const memberResponse = await SELF.fetch('http://localhost/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token'
      },
      body: JSON.stringify({
        teamId: team1Id,
        firstName: 'Moving',
        lastName: 'Member',
        email: 'moving@example.com',
        bacLevel: 2
      })
    });
    const memberData = await memberResponse.json();
    const memberId = memberData.member.id;

    // Move member to team 2
    const updateResponse = await SELF.fetch(`http://localhost/api/admin/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-admin-token',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        teamId: team2Id
      })
    });

    expect(updateResponse.status).toBe(200);
    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);
  });
});
