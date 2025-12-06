/**
 * Tab switching functionality
 */

import { $ } from './utils.js';

/**
 * Switch to a tab
 * @param {string} tabId - Tab ID to switch to
 */
export function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tabs-nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update sidebar items
  document.querySelectorAll('.admin-sidebar-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tabId}`);
  });
}

/**
 * Initialize tab navigation
 */
export function initTabs() {
  // Tab button clicks
  document.querySelectorAll('.tabs-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) {
        switchTab(tabId);
      }
    });
  });

  // Sidebar item clicks
  document.querySelectorAll('.admin-sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) {
        switchTab(tabId);
      }
    });
  });
}
