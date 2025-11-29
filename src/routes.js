/**
 * Route registration
 */

import { Router } from './lib/router.js';
import { getConfig } from './api/config.js';
import { listTeams, getTeam, getStats } from './api/teams.js';
import { register } from './api/register.js';
import { viewTeamMembers } from './api/team-view.js';
import {
  listAllMembers,
  exportAllCSV,
  exportTeamCSV,
  exportOfficialCSV,
  exportTeamOfficialCSV,
  adminStats,
  addMemberManually,
  updateMemberAdmin,
  deleteMemberAdmin,
  deleteMembersBatch,
  updateTeamAdmin,
  deleteTeamAdmin,
  createTeamAdmin
} from './api/admin.js';
import { getSettings, updateSettings } from './features/admin/admin.settings.js';
import { importCSV } from './features/admin/admin.import.js';

export function createRouter() {
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
  router.get('/api/admin/export-official', exportOfficialCSV);
  router.get('/api/admin/export-official/:teamId', exportTeamOfficialCSV);
  router.get('/api/admin/export/:teamId', exportTeamCSV);
  router.get('/api/admin/settings', getSettings);

  // Admin API routes - Create
  router.post('/api/admin/teams', createTeamAdmin);
  router.post('/api/admin/members', addMemberManually);
  router.post('/api/admin/members/delete-batch', deleteMembersBatch);
  router.post('/api/admin/import', importCSV);

  // Admin API routes - Update
  router.put('/api/admin/teams/:id', updateTeamAdmin);
  router.put('/api/admin/members/:id', updateMemberAdmin);
  router.put('/api/admin/settings', updateSettings);

  // Admin API routes - Delete
  router.delete('/api/admin/teams/:id', deleteTeamAdmin);
  router.delete('/api/admin/members/:id', deleteMemberAdmin);

  return router;
}
