/**
 * Admin API handlers - main entry point
 *
 * Re-exports all admin handlers from submodules for easier importing.
 * The original monolithic admin.js has been split into:
 * - exports.js: CSV exports and statistics
 * - members.js: Member CRUD operations
 * - teams.js: Team CRUD operations
 * - attendance.js: Check-in/check-out operations
 * - pizza.js: Pizza distribution
 * - rooms.js: Room assignments
 */

// Auth re-export for backward compatibility
export { verifyAdmin } from '../../shared/auth.js';

// Exports and statistics
export {
  listAllMembers,
  exportAllCSV,
  exportTeamCSV,
  exportOfficialCSV,
  exportTeamOfficialCSV,
  adminStats
} from './exports.js';

// Member CRUD
export {
  addMemberManually,
  updateMemberAdmin,
  deleteMemberAdmin,
  deleteMembersBatch
} from './members.js';

// Team CRUD
export {
  updateTeamAdmin,
  deleteTeamAdmin,
  createTeamAdmin
} from './teams.js';

// Attendance
export {
  getAttendance,
  checkInMember,
  checkOutMember,
  checkInMembersBatch,
  checkOutMembersBatch
} from './attendance.js';

// Pizza distribution
export {
  getPizza,
  givePizzaMember,
  revokePizzaMember,
  givePizzaMembersBatch,
  revokePizzaMembersBatch
} from './pizza.js';

// Room assignments
export {
  getRooms,
  setRoom,
  setRoomsBatch
} from './rooms.js';
