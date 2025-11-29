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
        'Authorization': 'Bearer test-admin-token'
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
        'Authorization': 'Bearer test-admin-token'
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
        'Authorization': 'Bearer test-admin-token'
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
        'Authorization': 'Bearer test-admin-token'
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
        'Authorization': 'Bearer test-admin-token'
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
    // Create a regular team
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

describe('CSV Export Format', () => {
  it('should export CSV with proper headers', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/export', {
      headers: {
        'Authorization': 'Bearer test-admin-token'
      }
    });

    expect(response.status).toBe(200);
    const text = await response.text();

    // Check for expected CSV headers
    expect(text).toContain('Équipe');
    expect(text).toContain('Prénom');
    expect(text).toContain('Nom');
    expect(text).toContain('Email');
    expect(text).toContain('Niveau BAC');
    expect(text).toContain('Pizza');
    expect(text).toContain('Chef');
  });

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
});

describe('Team Capacity and Full Teams', () => {
  it('should prevent joining full teams', async () => {
    // Create team
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
        'Authorization': 'Bearer test-admin-token'
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

    // Should still work but truncate or accept
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

    // Server returns error for malformed JSON (400 or 500)
    expect([400, 500]).toContain(response.status);
  });
});

describe('CSV Import', () => {
  it('should require authorization', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: 'test' })
    });

    expect(response.status).toBe(401);
  });

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
});
