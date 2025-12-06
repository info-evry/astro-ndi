/**
 * Modal and disclosure toggle functions
 */
/* eslint-env browser */

import { $ } from './utils.js';

/**
 * Close a modal by ID
 * @param {string} modalId
 */
export function closeModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Open a modal by ID
 * @param {string} modalId
 */
export function openModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    modal.classList.remove('hidden');
  }
}

/**
 * Toggle a disclosure group
 * @param {string} name - Disclosure group name
 */
export function toggleDisclosure(name) {
  const group = document.querySelector(`[data-disclosure="${name}"]`);
  if (group) {
    group.classList.toggle('open');
  }
}

/**
 * Initialize modal close on backdrop click
 */
export function initModalBackdropClose() {
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }
}

/**
 * Initialize modal close on Escape key
 */
export function initModalEscapeClose() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const modal of document.querySelectorAll('.modal:not(.hidden)')) {
        modal.classList.add('hidden');
      }
    }
  });
}

// Expose to window for onclick handlers
if (typeof window !== 'undefined') {
  window.closeModal = closeModal;
  window.toggleDisclosure = toggleDisclosure;
}
