/**
 * Client-side sorting utilities
 * Pure functions that can be tested without DOM
 */

/**
 * Create a sort comparator function
 * @param {string} key - Key to sort by
 * @param {'asc'|'desc'} direction - Sort direction
 * @param {object} options - Additional options
 * @returns {function} Comparator function for Array.sort()
 */
export function createSortComparator(key, direction = 'asc', options = {}) {
  const { caseInsensitive = true, nullsLast = true } = options;

  return (a, b) => {
    let valA = a[key];
    let valB = b[key];

    // Handle null/undefined
    if (valA == null && valB == null) return 0;
    if (valA == null) return nullsLast ? 1 : -1;
    if (valB == null) return nullsLast ? -1 : 1;

    // Handle strings
    if (typeof valA === 'string' && typeof valB === 'string') {
      if (caseInsensitive) {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
    }

    // Compare
    let result = 0;
    if (valA < valB) result = -1;
    else if (valA > valB) result = 1;

    return direction === 'desc' ? -result : result;
  };
}

/**
 * Sort members by various criteria
 * @param {object[]} members - Array of member objects
 * @param {string} sortKey - Sort key
 * @param {'asc'|'desc'} direction - Sort direction
 * @returns {object[]} Sorted array (new array)
 */
export function sortMembers(members, sortKey, direction = 'asc') {
  if (!Array.isArray(members)) return [];

  const sorted = [...members];

  switch (sortKey) {
    case 'name':
      sorted.sort((a, b) => {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
        const result = nameA.localeCompare(nameB);
        return direction === 'desc' ? -result : result;
      });
      break;

    case 'email':
      sorted.sort(createSortComparator('email', direction));
      break;

    case 'team':
      sorted.sort(createSortComparator('team_name', direction));
      break;

    case 'pizza':
      sorted.sort(createSortComparator('food_diet', direction));
      break;

    case 'bac':
      sorted.sort(createSortComparator('bac_level', direction, { caseInsensitive: false }));
      break;

    case 'manager':
    case 'leader':
      sorted.sort((a, b) => {
        const valA = a.is_manager ? 1 : 0;
        const valB = b.is_manager ? 1 : 0;
        const result = valB - valA; // Leaders first by default
        return direction === 'desc' ? -result : result;
      });
      break;

    case 'status':
    case 'checked_in':
      sorted.sort(createSortComparator('checked_in', direction, { caseInsensitive: false }));
      break;

    case 'time':
    case 'checked_in_at':
      sorted.sort(createSortComparator('checked_in_at', direction));
      break;

    case 'payment':
      sorted.sort((a, b) => {
        const valA = a.payment_status || a.payment_tier || '';
        const valB = b.payment_status || b.payment_tier || '';
        const result = valA.localeCompare(valB);
        return direction === 'desc' ? -result : result;
      });
      break;

    default:
      sorted.sort(createSortComparator(sortKey, direction));
  }

  return sorted;
}

/**
 * Sort teams by various criteria
 * @param {object[]} teams - Array of team objects
 * @param {string} sortKey - Sort key
 * @param {'asc'|'desc'} direction - Sort direction
 * @returns {object[]} Sorted array (new array)
 */
export function sortTeams(teams, sortKey, direction = 'asc') {
  if (!Array.isArray(teams)) return [];

  const sorted = [...teams];

  switch (sortKey) {
    case 'name':
      sorted.sort(createSortComparator('name', direction));
      break;

    case 'members':
    case 'member_count':
      sorted.sort(createSortComparator('member_count', direction, { caseInsensitive: false }));
      break;

    case 'room':
      sorted.sort(createSortComparator('room', direction));
      break;

    default:
      sorted.sort(createSortComparator(sortKey, direction));
  }

  return sorted;
}

/**
 * Filter members by search term
 * @param {object[]} members - Array of member objects
 * @param {string} searchTerm - Search term
 * @returns {object[]} Filtered array
 */
export function filterMembers(members, searchTerm) {
  if (!Array.isArray(members)) return [];
  if (!searchTerm || typeof searchTerm !== 'string') return members;

  const term = searchTerm.toLowerCase().trim();
  if (!term) return members;

  return members.filter(m => {
    const searchableFields = [
      m.first_name,
      m.last_name,
      m.email,
      m.team_name,
      `${m.first_name || ''} ${m.last_name || ''}`
    ];

    return searchableFields.some(field =>
      field && String(field).toLowerCase().includes(term)
    );
  });
}

/**
 * Filter members by status
 * @param {object[]} members - Array of member objects
 * @param {'all'|'present'|'absent'|'paid'|'unpaid'} filter - Filter type
 * @returns {object[]} Filtered array
 */
export function filterMembersByStatus(members, filter) {
  if (!Array.isArray(members)) return [];
  if (filter === 'all') return members;

  switch (filter) {
    case 'present':
      return members.filter(m => m.checked_in === 1);

    case 'absent':
      return members.filter(m => m.checked_in === 0 || m.checked_in === null);

    case 'paid':
      return members.filter(m =>
        m.payment_status === 'paid' || m.payment_tier
      );

    case 'unpaid':
      return members.filter(m =>
        !m.payment_status || m.payment_status === 'unpaid' || m.payment_status === 'delayed'
      );

    case 'pending':
      return members.filter(m => m.payment_status === 'pending');

    case 'delayed':
      return members.filter(m => m.payment_status === 'delayed');

    default:
      return members;
  }
}

/**
 * Filter teams by room assignment status
 * @param {object[]} teams - Array of team objects
 * @param {'all'|'assigned'|'unassigned'} filter - Filter type
 * @returns {object[]} Filtered array
 */
export function filterTeamsByRoom(teams, filter) {
  if (!Array.isArray(teams)) return [];
  if (filter === 'all') return teams;

  switch (filter) {
    case 'assigned':
      return teams.filter(t => t.room && t.room !== '');

    case 'unassigned':
      return teams.filter(t => !t.room || t.room === '');

    default:
      return teams;
  }
}

/**
 * Toggle sort direction
 * @param {'asc'|'desc'} current - Current direction
 * @returns {'asc'|'desc'} New direction
 */
export function toggleSortDirection(current) {
  return current === 'asc' ? 'desc' : 'asc';
}
