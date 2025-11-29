/**
 * Modal component utilities
 */

import { $, hide, show } from '../core/utils.js';

/**
 * Open a modal by ID
 */
export function openModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    show(modal);
    // Focus first input if exists
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }
}

/**
 * Close a modal by ID
 */
export function closeModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    hide(modal);
    // Clear form if exists
    const form = modal.querySelector('form');
    if (form) form.reset();
  }
}

/**
 * Setup modal backdrop click to close
 */
export function setupModalBackdrop(modalId) {
  const modal = $(modalId);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modalId);
      }
    });
  }
}

/**
 * Setup escape key to close modal
 */
export function setupModalEscape(modalId) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = $(modalId);
      if (modal && !modal.classList.contains('hidden')) {
        closeModal(modalId);
      }
    }
  });
}

/**
 * Initialize all modal behaviors for a modal
 */
export function initModal(modalId) {
  setupModalBackdrop(modalId);
  setupModalEscape(modalId);
}

// Make closeModal available globally for onclick handlers
window.closeModal = closeModal;
