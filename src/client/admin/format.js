/**
 * NDI-specific formatting helpers not covered by
 * @info-evry/astro-design/scripts/dom.
 */
/* eslint-env browser */

import { escapeHtml, truncateText } from '@info-evry/astro-design/scripts/dom';

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

/**
 * HTML-safe label for a member's food choice.
 *
 * `food_diet` is free text supplied through the public registration form, so
 * it must never be interpolated into markup unescaped. The configured pizza
 * name is used when the value is a known pizza id (own keys only, so values
 * such as "constructor" are not resolved through the prototype chain).
 * @param {Object<string, string>} pizzaTypes - Map of pizza id to display name
 * @param {string} foodDiet - Stored food choice
 * @returns {string} Escaped label (empty string when there is none)
 */
export function pizzaLabel(pizzaTypes, foodDiet) {
  const label = Object.hasOwn(pizzaTypes, foodDiet) ? pizzaTypes[foodDiet] : foodDiet;
  return escapeHtml(label);
}
