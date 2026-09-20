/**
 * Admin module exports
 *
 * This module provides reusable utilities for the admin dashboard.
 * For the main admin page, these are used via the inline script.
 */

// Core utilities (shared with all admin dashboards via the design system)
export * from '@info-evry/astro-design/scripts/dom';
export * from '@info-evry/astro-design/scripts/toast';
export * from '@info-evry/astro-design/scripts/api-client';
export * from '@info-evry/astro-design/scripts/modal';
export * from '@info-evry/astro-design/scripts/tabs';
export * from '@info-evry/astro-design/scripts/disclosure';

// NDI-only helpers
export * from './format.js';
export * from './state.js';

// Domain modules
export * from './registrations.js';
export * from './attendance.js';
export * from './pizza.js';
export * from './rooms.js';
export * from './archives.js';
export * from './settings.js';
export * from './import.js';
