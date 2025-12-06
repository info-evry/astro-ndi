/**
 * Toast notification system
 */

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {'success' | 'error' | 'info' | 'warning'} type - Toast type
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = 'success', duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show success toast
 * @param {string} message
 */
export function toastSuccess(message) {
  showToast(message, 'success');
}

/**
 * Show error toast
 * @param {string} message
 */
export function toastError(message) {
  showToast(message, 'error');
}

/**
 * Show info toast
 * @param {string} message
 */
export function toastInfo(message) {
  showToast(message, 'info');
}

/**
 * Show warning toast
 * @param {string} message
 */
export function toastWarning(message) {
  showToast(message, 'warning');
}
