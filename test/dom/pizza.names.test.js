/* global document, Event */
/**
 * Pizza and rooms tabs: names and the type filter come from the catalogue as
 * it is when a list is drawn, not as it was when the tab was initialised (the
 * dashboard initialises before login, and the catalogue changes live).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let state;
let pizza;
let rooms;

const byId = (id) => document.getElementById(id);

const member = (overrides = {}) => ({
  id: 1, first_name: 'Ann', last_name: 'Alpha', email: 'a@example.com', team_name: 'Team A', team_room: null,
  checked_in: 0, pizza_received: 0, pizza_received_at: null, food_diet: '4_fromages', ...overrides
});

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `
    <select id="pizza-type-filter"><option value="">Toutes les pizzas</option></select>
    <div id="pizza-stats-grid"></div><div id="pizza-by-type-grid"></div>
    <table><tbody id="pizza-tbody"></tbody></table>
    <div id="room-pizza-container"></div>`;
  state = await import('../../src/client/admin/state.js');
  pizza = await import('../../src/client/admin/pizza.js');
  rooms = await import('../../src/client/admin/rooms.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('catalogue loaded after the tab was initialised', () => {
  it('the pizza table shows names and the type filter offers the catalogue', () => {
    pizza.initPizza(vi.fn());
    state.setPizzasConfig([{ id: '0-rien', name: 'Aucune' }, { id: '4_fromages', name: '4 Fromages (Vég, Halal)' }]);
    state.setPizzaData([member()]);

    pizza.renderPizza();

    expect(byId('pizza-tbody').textContent).toContain('4 Fromages (Vég, Halal)');
    expect(byId('pizza-tbody').textContent).not.toContain('4_fromages');
    expect([...byId('pizza-type-filter').options].map(o => o.value)).toEqual(['', '0-rien', '4_fromages']);
  });

  it('follows a catalogue change and keeps the chosen type filter', () => {
    pizza.initPizza(vi.fn());
    state.setPizzasConfig([{ id: '4_fromages', name: 'Quatre' }]);
    state.setPizzaData([member()]);
    pizza.renderPizza();
    byId('pizza-type-filter').value = '4_fromages';
    byId('pizza-type-filter').dispatchEvent(new Event('change'));

    state.setPizzasConfig([{ id: '4_fromages', name: '4 Fromages' }, { id: 'reine', name: 'Reine' }]);
    pizza.renderPizza();

    expect(byId('pizza-tbody').textContent).toContain('4 Fromages');
    expect([...byId('pizza-type-filter').options].map(o => o.value)).toEqual(['', '4_fromages', 'reine']);
    expect(byId('pizza-type-filter').value).toBe('4_fromages');
  });

  it('the statistics cards and the rooms breakdown use the current names too', () => {
    state.setPizzasConfig([{ id: '4_fromages', name: '4 Fromages (Vég, Halal)' }]);

    pizza.renderPizzaStats({ received: 0, pending: 1, total: 1, by_type: [{ food_diet: '4_fromages', total: 1, received: 0 }] });
    rooms.renderPizzaByRoom([{ room: 'A1', totals: { total: 1, present: 0 }, pizzas: [{ food_diet: '4_fromages', total: 1, present: 0 }] }]);

    expect(byId('pizza-by-type-grid').textContent).toContain('4 Fromages (Vég, Halal)');
    expect(byId('room-pizza-container').textContent).toContain('4 Fromages (Vég, Halal)');
  });
});
