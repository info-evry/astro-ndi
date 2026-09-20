/**
 * NDI-specific formatting helpers not covered by
 * @info-evry/astro-design/scripts/dom.
 */
/* eslint-env browser */

import { truncateText } from '@info-evry/astro-design/scripts/dom';

/**
 * Format team name with room
 * @param {string} teamName - Team name
 * @param {string} teamRoom - Room assignment
 * @param {number} maxLength - Maximum length
 * @returns {{truncated: string, full: string}}
 */
export function formatTeamWithRoom(teamName, teamRoom, maxLength = 40) {
  if (!teamName) return { truncated: '-', full: '-' };
  const fullText = teamRoom ? `${teamName} (${teamRoom})` : teamName;
  const truncated = truncateText(fullText, maxLength);
  return { truncated, full: fullText };
}
