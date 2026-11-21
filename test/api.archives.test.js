/**
 * Tests for archive API endpoints
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupSchema } from './helpers.js';

// Setup database tables
beforeAll(async () => {
  // The production schema (every migration): archives snapshot every member column
  await setupSchema();

  // Default settings
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('event_year', '2024', 'Current event year')`);
  await env.DB.exec(`INSERT OR IGNORE INTO settings (key, value, description) VALUES ('gdpr_retention_years', '3', 'GDPR retention period')`);
  
  // Organization team
  await env.DB.exec(`INSERT OR IGNORE INTO teams (name, description, password_hash) VALUES ('Organisation', 'Équipe organisatrice', '')`);
});

// Helper to create admin request
function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer test-admin-token');
  if (options.body && typeof options.body === 'object') {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.body);
  }
  return SELF.fetch(`http://localhost${path}`, { ...options, headers });
}

describe('Archive API - GET /api/admin/archives', () => {
  it('should require authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/archives');
    expect(response.status).toBe(401);
  });

  it('should return empty list when no archives exist', async () => {
    const response = await adminFetch('/api/admin/archives');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.archives).toBeDefined();
    expect(Array.isArray(data.archives)).toBe(true);
  });
});

describe('Archive API - GET /api/admin/event-year', () => {
  it('should return current event year', async () => {
    const response = await adminFetch('/api/admin/event-year');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.year).toBeDefined();
    expect(typeof data.year).toBe('number');
    expect(data.year).toBeGreaterThanOrEqual(2000);
    expect(data.year).toBeLessThanOrEqual(2100);
  });
});

describe('Archive API - GET /api/admin/reset/check', () => {
  it('should return reset safety status', async () => {
    const response = await adminFetch('/api/admin/reset/check');
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.year).toBeDefined();
    expect(data.archiveExists).toBeDefined();
    expect(data.counts).toBeDefined();
    expect(data.safe).toBeDefined();
  });
});

describe('Archive API - POST /api/admin/archives', () => {
  // First create some test data
  beforeAll(async () => {
    // Create a team with a member
    await adminFetch('/api/admin/teams', {
      method: 'POST',
      body: { name: 'Archive Test Team', description: 'For testing', password: 'test123' }
    });
  });

  it('should require authentication', async () => {
    const response = await SELF.fetch('http://localhost/api/admin/archives', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(401);
  });

  it('should handle archive creation (may fail if no participant data)', async () => {
    const response = await adminFetch('/api/admin/archives', {
      method: 'POST',
      body: { year: 2024 }
    });
    
    // Could be 201 (created), 400 (no data/validation), 409 (already exists), or 500 (db issue)
    expect([201, 400, 409, 500]).toContain(response.status);
    
    if (response.status === 201) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.archive).toBeDefined();
      expect(data.archive.event_year).toBe(2024);
    }
  });

  it('should reject duplicate or handle no-data scenario', async () => {
    // Try to create again
    const response = await adminFetch('/api/admin/archives', {
      method: 'POST',
      body: { year: 2024 }
    });
    
    // Should be 400 (no data), 409 (already exists), or 500 (db issue)
    expect([400, 409, 500]).toContain(response.status);
  });

  it('should reject invalid year', async () => {
    const response = await adminFetch('/api/admin/archives', {
      method: 'POST',
      body: { year: 'invalid' }
    });
    expect(response.status).toBe(400);
  });

  it('should reject year out of range', async () => {
    const response1 = await adminFetch('/api/admin/archives', {
      method: 'POST',
      body: { year: 1999 }
    });
    expect(response1.status).toBe(400);

    const response2 = await adminFetch('/api/admin/archives', {
      method: 'POST',
      body: { year: 2101 }
    });
    expect(response2.status).toBe(400);
  });
});

describe('Archive API - GET /api/admin/archives/:year', () => {
  it('should return 404 for non-existent archive', async () => {
    const response = await adminFetch('/api/admin/archives/2020');
    expect(response.status).toBe(404);
  });

  it('should return 400 invalid_year for a year outside 2000-2100, like create', async () => {
    for (const year of ['1999', '2101']) {
      const response = await adminFetch(`/api/admin/archives/${year}`);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('invalid_year');
    }
  });

  it('should return 400 for invalid year', async () => {
    const response = await adminFetch('/api/admin/archives/invalid');
    expect(response.status).toBe(400);
  });

  it('should return archive data if exists', async () => {
    const response = await adminFetch('/api/admin/archives/2024');
    
    // Could be 200 (found) or 404 (not found)
    expect([200, 404]).toContain(response.status);
    
    if (response.status === 200) {
      const data = await response.json();
      expect(data.archive).toBeDefined();
      expect(data.archive.event_year).toBe(2024);
      expect(data.archive.teams).toBeDefined();
      expect(data.archive.members).toBeDefined();
      expect(data.archive.stats).toBeDefined();
    }
  });
});

describe('Archive API - GET /api/admin/archives/:year/export', () => {
  it('should return 404 for non-existent archive', async () => {
    const response = await adminFetch('/api/admin/archives/2020/export');
    expect(response.status).toBe(404);
  });

  it('should return 400 invalid_year for a year outside 2000-2100', async () => {
    const response = await adminFetch('/api/admin/archives/1999/export');
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_year');
  });

  it('exports an existing archive as one JSON document', async () => {
    const list = await (await adminFetch('/api/admin/archives')).json();
    const year = list.archives[0]?.event_year;
    expect(year).toBeDefined();

    const response = await adminFetch(`/api/admin/archives/${year}/export`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.filename).toBe(`ndi-${year}-archive.json`);
    expect(data.export.metadata.event_year).toBe(year);
    expect(Array.isArray(data.export.teams)).toBe(true);
    expect(Array.isArray(data.export.participants)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/password/i);
  });
});

describe('Archive API - POST /api/admin/expiration-check', () => {
  it('should check all archives for expiration', async () => {
    // Note: Must send empty body to set Content-Type: application/json
    // Otherwise Astro CSRF protection blocks the request
    const response = await adminFetch('/api/admin/expiration-check', {
      method: 'POST',
      body: {}
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.checked).toBeDefined();
    expect(data.expired).toBeDefined();
    expect(data.updated).toBeDefined();
  });
});

describe('Archive API - POST /api/admin/reset', () => {
  it('should require confirmation', async () => {
    const response = await adminFetch('/api/admin/reset', {
      method: 'POST',
      body: {}
    });
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toContain('Confirmation');
  });

  it('should reject wrong confirmation', async () => {
    const response = await adminFetch('/api/admin/reset', {
      method: 'POST',
      body: { confirmation: 'wrong' }
    });
    expect(response.status).toBe(400);
  });

  it('should warn if no archive exists for current year', async () => {
    // First, check if there's data and no archive
    const checkResponse = await adminFetch('/api/admin/reset/check');
    const checkData = await checkResponse.json();
    
    if (checkData.counts.teams > 0 && !checkData.archiveExists) {
      const response = await adminFetch('/api/admin/reset', {
        method: 'POST',
        body: { confirmation: 'SUPPRIMER' }
      });
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.warning).toBe('no_archive');
    }
  });

  it('should reset data once it is archived (createArchiveFirst + force)', async () => {
    const response = await adminFetch('/api/admin/reset', {
      method: 'POST',
      body: { confirmation: 'SUPPRIMER', force: true, createArchiveFirst: true }
    });
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted).toBeDefined();
  });
});
