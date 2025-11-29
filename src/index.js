/**
 * Nuit de l'Info Registration System
 * Cloudflare Workers Entry Point
 */

import { Router, json, error, corsHeaders } from './lib/router.js';
import { listTeams, getTeam, getStats } from './api/teams.js';
import { register } from './api/register.js';
import { getConfig } from './api/config.js';
import { viewTeamMembers } from './api/team-view.js';
import {
  listAllMembers,
  exportAllCSV,
  exportTeamCSV,
  adminStats,
  addMemberManually,
  updateMemberAdmin,
  deleteMemberAdmin,
  deleteMembersBatch,
  updateTeamAdmin,
  deleteTeamAdmin,
  createTeamAdmin
} from './api/admin.js';

const router = new Router();

// Public API routes
router.get('/api/config', getConfig);
router.get('/api/teams', listTeams);
router.get('/api/teams/:id', getTeam);
router.get('/api/stats', getStats);
router.post('/api/register', register);
router.post('/api/teams/:id/view', viewTeamMembers);

// Admin API routes - Read
router.get('/api/admin/members', listAllMembers);
router.get('/api/admin/stats', adminStats);
router.get('/api/admin/export', exportAllCSV);
router.get('/api/admin/export/:teamId', exportTeamCSV);

// Admin API routes - Create
router.post('/api/admin/teams', createTeamAdmin);
router.post('/api/admin/members', addMemberManually);
router.post('/api/admin/members/delete-batch', deleteMembersBatch);

// Admin API routes - Update
router.put('/api/admin/teams/:id', updateTeamAdmin);
router.put('/api/admin/members/:id', updateMemberAdmin);

// Admin API routes - Delete
router.delete('/api/admin/teams/:id', deleteTeamAdmin);
router.delete('/api/admin/members/:id', deleteMemberAdmin);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      try {
        const response = await router.handle(request, env, ctx);
        if (response) {
          // Add CORS headers to all API responses
          const headers = new Headers(response.headers);
          Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
          return new Response(response.body, {
            status: response.status,
            headers
          });
        }
        return error('Not found', 404);
      } catch (err) {
        console.error('API error:', err);
        return error('Internal server error', 500);
      }
    }

    // Serve static files (handled by Cloudflare assets)
    // For SPA routing, redirect non-file requests to index.html
    if (!url.pathname.includes('.') && url.pathname !== '/') {
      // Check if this is admin route
      if (url.pathname.startsWith('/admin')) {
        return env.ASSETS.fetch(new Request(new URL('/admin.html', request.url), request));
      }
      // Default to index.html for SPA routing
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }

    // Let Cloudflare serve static assets
    return env.ASSETS.fetch(request);
  }
};
