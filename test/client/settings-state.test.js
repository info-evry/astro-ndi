import { describe, it, expect, vi } from 'vitest';
import { createSettingsState } from '../../src/client/modules/settings-state.js';

describe('Settings State Management', () => {
  describe('createSettingsState', () => {
    it('creates state with default values', () => {
      const state = createSettingsState();
      const values = state.getState();

      expect(values.maxTeamSize).toBe(15);
      expect(values.maxTotalParticipants).toBe(200);
      expect(values.minTeamSize).toBe(1);
      expect(values.paymentEnabled).toBe(false);
      expect(values.isDirty).toBe(false);
    });

    it('accepts initial values', () => {
      const state = createSettingsState({ maxTeamSize: 20 });
      expect(state.get('maxTeamSize')).toBe(20);
    });
  });

  describe('get/set', () => {
    it('gets individual values', () => {
      const state = createSettingsState();
      expect(state.get('maxTeamSize')).toBe(15);
    });

    it('sets individual values', () => {
      const state = createSettingsState();
      state.set('maxTeamSize', 25);
      expect(state.get('maxTeamSize')).toBe(25);
    });

    it('marks state as dirty when value changes', () => {
      const state = createSettingsState();
      expect(state.isDirty()).toBe(false);
      state.set('maxTeamSize', 25);
      expect(state.isDirty()).toBe(true);
    });

    it('does not mark dirty if value is same', () => {
      const state = createSettingsState();
      state.set('maxTeamSize', 15); // Same as default
      expect(state.isDirty()).toBe(false);
    });
  });

  describe('update', () => {
    it('updates multiple values at once', () => {
      const state = createSettingsState();
      state.update({
        maxTeamSize: 20,
        minTeamSize: 2,
        paymentEnabled: true
      });

      expect(state.get('maxTeamSize')).toBe(20);
      expect(state.get('minTeamSize')).toBe(2);
      expect(state.get('paymentEnabled')).toBe(true);
    });
  });

  describe('loadFromAPI', () => {
    it('loads settings from API response format', () => {
      const state = createSettingsState();

      state.loadFromAPI({
        max_team_size: '20',
        max_total_participants: '150',
        min_team_size: '2',
        school_name: 'Test School',
        pizzas: [{ id: 'pepperoni', name: 'Pepperoni' }],
        payment_enabled: 'true',
        price_tier1: '500',
        price_tier2: '700',
        tier1_cutoff_days: '7',
        registration_deadline: '2024-12-01T19:00:00'
      });

      expect(state.get('maxTeamSize')).toBe(20);
      expect(state.get('schoolName')).toBe('Test School');
      expect(state.get('pizzas')).toHaveLength(1);
      expect(state.get('paymentEnabled')).toBe(true);
      expect(state.get('priceTier1')).toBe(500);
      expect(state.get('registrationDeadline')).toBe('2024-12-01T19:00:00');
      expect(state.isDirty()).toBe(false);
    });

    it('handles boolean payment_enabled', () => {
      const state = createSettingsState();
      state.loadFromAPI({ payment_enabled: true });
      expect(state.get('paymentEnabled')).toBe(true);
    });
  });

  describe('toAPIFormat', () => {
    it('converts state to API format', () => {
      const state = createSettingsState({
        maxTeamSize: 20,
        paymentEnabled: true,
        priceTier1: 500
      });

      const apiFormat = state.toAPIFormat();

      expect(apiFormat.max_team_size).toBe(20);
      expect(apiFormat.payment_enabled).toBe(true);
      expect(apiFormat.price_tier1).toBe(500);
    });
  });

  describe('validate', () => {
    it('validates correct settings', () => {
      const state = createSettingsState();
      const result = state.validate();
      expect(result.valid).toBe(true);
    });

    it('reports validation errors', () => {
      const state = createSettingsState({ maxTeamSize: 0 });
      const result = state.validate();
      expect(result.valid).toBe(false);
    });
  });

  describe('markDirty/markClean', () => {
    it('marks state as dirty', () => {
      const state = createSettingsState();
      state.markDirty();
      expect(state.isDirty()).toBe(true);
    });

    it('marks state as clean', () => {
      const state = createSettingsState();
      state.set('maxTeamSize', 25);
      expect(state.isDirty()).toBe(true);
      state.markClean();
      expect(state.isDirty()).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on change', () => {
      const state = createSettingsState();
      const listener = vi.fn();

      state.subscribe(listener);
      state.set('maxTeamSize', 25);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        maxTeamSize: 25
      }));
    });

    it('allows unsubscribe', () => {
      const state = createSettingsState();
      const listener = vi.fn();

      const unsubscribe = state.subscribe(listener);
      unsubscribe();
      state.set('maxTeamSize', 25);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('pizza management', () => {
    it('adds a pizza', () => {
      const state = createSettingsState();
      state.addPizza({ id: 'pepperoni', name: 'Pepperoni' });

      expect(state.get('pizzas')).toHaveLength(1);
      expect(state.get('pizzas')[0].id).toBe('pepperoni');
      expect(state.isDirty()).toBe(true);
    });

    it('throws when adding duplicate pizza', () => {
      const state = createSettingsState();
      state.addPizza({ id: 'pepperoni', name: 'Pepperoni' });

      expect(() => {
        state.addPizza({ id: 'pepperoni', name: 'Another Pepperoni' });
      }).toThrow('already exists');
    });

    it('throws when adding pizza without id', () => {
      const state = createSettingsState();
      expect(() => {
        state.addPizza({ name: 'Pepperoni' });
      }).toThrow('must have id and name');
    });

    it('updates a pizza', () => {
      const state = createSettingsState();
      state.addPizza({ id: 'pepperoni', name: 'Pepperoni' });
      state.markClean();

      state.updatePizza(0, { name: 'Super Pepperoni' });

      expect(state.get('pizzas')[0].name).toBe('Super Pepperoni');
      expect(state.isDirty()).toBe(true);
    });

    it('throws when updating invalid index', () => {
      const state = createSettingsState();
      expect(() => {
        state.updatePizza(0, { name: 'Test' });
      }).toThrow('Invalid pizza index');
    });

    it('removes a pizza', () => {
      const state = createSettingsState();
      state.addPizza({ id: 'pepperoni', name: 'Pepperoni' });
      state.addPizza({ id: 'margherita', name: 'Margherita' });
      state.markClean();

      state.removePizza(0);

      expect(state.get('pizzas')).toHaveLength(1);
      expect(state.get('pizzas')[0].id).toBe('margherita');
      expect(state.isDirty()).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets to default values', () => {
      const state = createSettingsState();
      state.set('maxTeamSize', 100);
      state.addPizza({ id: 'test', name: 'Test' });

      state.reset();

      expect(state.get('maxTeamSize')).toBe(15);
      expect(state.get('pizzas')).toEqual([]);
      expect(state.isDirty()).toBe(false);
    });
  });
});
