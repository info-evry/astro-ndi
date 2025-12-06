/**
 * Tab switching functionality
 */
/* eslint-env browser */

/**
 * Switch to a tab
 * @param {string} tabId - Tab ID to switch to
 */
export function switchTab(tabId) {
  // Update tab buttons
  for (const btn of document.querySelectorAll('.tabs-nav button')) {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  }

  // Update sidebar items
  for (const btn of document.querySelectorAll('.admin-sidebar-item')) {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  }

  // Update tab panels
  for (const panel of document.querySelectorAll('.tab-panel')) {
    panel.classList.toggle('hidden', panel.id !== `tab-${tabId}`);
  }
}

/**
 * Initialize tab navigation
 */
export function initTabs() {
  // Tab button clicks
  for (const btn of document.querySelectorAll('.tabs-nav button')) {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) {
        switchTab(tabId);
      }
    });
  }

  // Sidebar item clicks
  for (const btn of document.querySelectorAll('.admin-sidebar-item')) {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) {
        switchTab(tabId);
      }
    });
  }
}
