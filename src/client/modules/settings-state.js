/**
 * Settings state management
 * Manages settings state without DOM dependency
 */

import { validateAllSettings } from '../lib/validation.js';

/**
 * Create a settings state manager
 * @param {object} initialSettings - Initial settings values
 * @returns {object} State manager with getters and setters
 */
export function createSettingsState(initialSettings = {}) {
  let state = {
    // General settings
    maxTeamSize: 15,
    maxTotalParticipants: 200,
    minTeamSize: 1,
    schoolName: "Université d'Evry",

    // Pizza settings
    pizzas: [],
    bacLevels: [],

    // On-site pricing
    priceAssoMember: 500,
    priceNonMember: 800,
    priceLate: 1000,
    lateCutoffTime: '19:00',

    // Online payment settings
    paymentEnabled: false,
    priceTier1: 500,
    priceTier2: 700,
    tier1CutoffDays: 7,
    registrationDeadline: '',

    // State tracking
    isDirty: false,

    ...initialSettings
  };

  const listeners = new Set();

  function notifyListeners() {
    for (const fn of listeners) fn(state);
  }

  return {
    /**
     * Get current state
     */
    getState() {
      return { ...state };
    },

    /**
     * Get a specific setting value
     */
    get(key) {
      return state[key];
    },

    /**
     * Set a single setting value
     */
    set(key, value) {
      if (state[key] !== value) {
        state = { ...state, [key]: value, isDirty: true };
        notifyListeners();
      }
    },

    /**
     * Update multiple settings at once
     */
    update(updates) {
      const hasChanges = Object.entries(updates).some(
        ([key, value]) => state[key] !== value
      );

      if (hasChanges) {
        state = { ...state, ...updates, isDirty: true };
        notifyListeners();
      }
    },

    /**
     * Load settings from API response
     */
    loadFromAPI(apiSettings) {
      state = {
        maxTeamSize: Number.parseInt(apiSettings.max_team_size, 10) || 15,
        maxTotalParticipants: Number.parseInt(apiSettings.max_total_participants, 10) || 200,
        minTeamSize: Number.parseInt(apiSettings.min_team_size, 10) || 1,
        schoolName: apiSettings.school_name || "Université d'Evry",
        pizzas: apiSettings.pizzas || [],
        bacLevels: apiSettings.bac_levels || [],
        priceAssoMember: Number.parseInt(apiSettings.price_asso_member, 10) || 500,
        priceNonMember: Number.parseInt(apiSettings.price_non_member, 10) || 800,
        priceLate: Number.parseInt(apiSettings.price_late, 10) || 1000,
        lateCutoffTime: apiSettings.late_cutoff_time || '19:00',
        paymentEnabled: apiSettings.payment_enabled === 'true' || apiSettings.payment_enabled === true,
        priceTier1: Number.parseInt(apiSettings.price_tier1, 10) || 500,
        priceTier2: Number.parseInt(apiSettings.price_tier2, 10) || 700,
        tier1CutoffDays: Number.parseInt(apiSettings.tier1_cutoff_days, 10) || 7,
        registrationDeadline: apiSettings.registration_deadline || '',
        isDirty: false
      };
      notifyListeners();
    },

    /**
     * Convert state to API format
     */
    toAPIFormat() {
      return {
        max_team_size: state.maxTeamSize,
        max_total_participants: state.maxTotalParticipants,
        min_team_size: state.minTeamSize,
        school_name: state.schoolName,
        pizzas: state.pizzas,
        price_asso_member: state.priceAssoMember,
        price_non_member: state.priceNonMember,
        price_late: state.priceLate,
        late_cutoff_time: state.lateCutoffTime,
        payment_enabled: state.paymentEnabled,
        price_tier1: state.priceTier1,
        price_tier2: state.priceTier2,
        tier1_cutoff_days: state.tier1CutoffDays,
        registration_deadline: state.registrationDeadline
      };
    },

    /**
     * Validate current state
     */
    validate() {
      return validateAllSettings(this.toAPIFormat());
    },

    /**
     * Check if state is dirty (has unsaved changes)
     */
    isDirty() {
      return state.isDirty;
    },

    /**
     * Mark state as clean (saved)
     */
    markClean() {
      state = { ...state, isDirty: false };
      notifyListeners();
    },

    /**
     * Mark state as dirty
     */
    markDirty() {
      if (!state.isDirty) {
        state = { ...state, isDirty: true };
        notifyListeners();
      }
    },

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Add a pizza to the list
     */
    addPizza(pizza) {
      if (!pizza.id || !pizza.name) {
        throw new Error('Pizza must have id and name');
      }
      if (state.pizzas.some(p => p.id === pizza.id)) {
        throw new Error('Pizza with this ID already exists');
      }
      state = {
        ...state,
        pizzas: [...state.pizzas, pizza],
        isDirty: true
      };
      notifyListeners();
    },

    /**
     * Update a pizza
     */
    updatePizza(index, updates) {
      if (index < 0 || index >= state.pizzas.length) {
        throw new Error('Invalid pizza index');
      }
      const newPizzas = [...state.pizzas];
      newPizzas[index] = { ...newPizzas[index], ...updates };
      state = { ...state, pizzas: newPizzas, isDirty: true };
      notifyListeners();
    },

    /**
     * Remove a pizza
     */
    removePizza(index) {
      if (index < 0 || index >= state.pizzas.length) {
        throw new Error('Invalid pizza index');
      }
      state = {
        ...state,
        pizzas: state.pizzas.filter((_, i) => i !== index),
        isDirty: true
      };
      notifyListeners();
    },

    /**
     * Reset to initial state
     */
    reset() {
      state = {
        maxTeamSize: 15,
        maxTotalParticipants: 200,
        minTeamSize: 1,
        schoolName: "Université d'Evry",
        pizzas: [],
        bacLevels: [],
        priceAssoMember: 500,
        priceNonMember: 800,
        priceLate: 1000,
        lateCutoffTime: '19:00',
        paymentEnabled: false,
        priceTier1: 500,
        priceTier2: 700,
        tier1CutoffDays: 7,
        registrationDeadline: '',
        isDirty: false
      };
      notifyListeners();
    }
  };
}

// Export a singleton instance for the admin panel
export const settingsState = createSettingsState();
