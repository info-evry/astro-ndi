/* global Event, document */
/**
 * Admin: the pizza of a member can be read by name and changed in the member
 * form, whatever the stored value is (happy-dom).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MODALS_HTML, XSS_PAYLOAD, sampleTeams } from './helpers.js';

let reg;
let state;

const CATALOGUE = [
  { id: '0-rien', name: 'Aucune', description: '' },
  { id: 'reine', name: 'Reine', description: '' },
  { id: '4_fromages', name: '4 Fromages (Vég, Halal)', description: '' }
];

const byId = (id) => document.getElementById(id);
const food = () => byId('member-form-food');
const optionsOf = (select) => [...select.options].map(o => [o.value, o.textContent]);

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = `<div id="food-stats"></div><div id="teams-container"></div>${MODALS_HTML}`;
  state = await import('../../src/client/admin/state.js');
  reg = await import('../../src/client/admin/registrations.js');
  state.setPizzasConfig(CATALOGUE);
});

afterEach(() => {
  document.body.innerHTML = '';
});

const withFood = (foodDiet) => {
  const teams = sampleTeams();
  teams[0].members[0].food_diet = foodDiet;
  reg.renderTeams(teams, byId('teams-container'));
};

describe('member form pizza select', () => {
  it('lists the current catalogue once, "Aucune" included, with the member\'s pizza selected', () => {
    withFood('4_fromages');

    reg.editMember(11, 1);

    expect(optionsOf(food())).toEqual([['0-rien', 'Aucune'], ['reine', 'Reine'], ['4_fromages', '4 Fromages (Vég, Halal)']]);
    expect(food().value).toBe('4_fromages');
  });

  it('is filled again from the catalogue each time the form opens (the catalogue changes live)', () => {
    withFood('reine');
    reg.editMember(11, 1);

    state.setPizzasConfig([...CATALOGUE, { id: 'orientale', name: 'Orientale', description: '' }]);
    reg.editMember(11, 1);

    expect(optionsOf(food()).map(([id]) => id)).toContain('orientale');
  });

  it('selects "Aucune" for members without a pizza, whatever the spelling in the data', () => {
    for (const stored of ['', 'none', '0-rien', null]) {
      withFood(stored);
      reg.editMember(11, 1);
      expect(food().value).toBe('0-rien');
    }
  });

  it('keeps a pizza that left the catalogue, flagged, so that it is not silently replaced', () => {
    withFood('diva');

    reg.editMember(11, 1);

    expect(food().value).toBe('diva');
    expect(food().selectedOptions[0].textContent).toBe("diva (n'est plus proposée)");
  });

  it('a new member starts with "Aucune"', () => {
    reg.openAddMemberModal();

    expect(food().value).toBe('0-rien');
    expect(optionsOf(food())).toHaveLength(3);
  });

  it('still offers "Aucune" when the catalogue is empty or has no such entry', () => {
    state.setPizzasConfig([]);
    reg.openAddMemberModal();
    expect(optionsOf(food())).toEqual([['', 'Aucune']]);

    state.setPizzasConfig([{ id: 'reine', name: 'Reine', description: '' }]);
    reg.openAddMemberModal();
    expect(optionsOf(food())[0]).toEqual(['', 'Aucune']);
    expect(food().value).toBe('');
  });

  it('escapes catalogue names', () => {
    state.setPizzasConfig([...CATALOGUE, { id: 'x', name: XSS_PAYLOAD, description: '' }]);
    reg.openAddMemberModal();

    expect(food().querySelector('img')).toBeNull();
    expect(optionsOf(food()).at(-1)).toEqual(['x', XSS_PAYLOAD]);
  });
});

describe('saving a member', () => {
  const submit = async (api) => reg.handleMemberSubmit(new Event('submit', { cancelable: true }), api, vi.fn());

  it('sends the new pizza when it was changed', async () => {
    const api = vi.fn().mockResolvedValue({});
    withFood('reine');
    reg.editMember(11, 1);
    food().value = '4_fromages';

    await submit(api);

    expect(api).toHaveBeenCalledWith('/admin/members/11', expect.objectContaining({ method: 'PUT' }));
    expect(JSON.parse(api.mock.calls[0][1].body).foodDiet).toBe('4_fromages');
  });

  it('does not send the pizza when it was not touched: a name fix cannot fail on a pizza that left the catalogue', async () => {
    const api = vi.fn().mockResolvedValue({});
    withFood('diva');
    reg.editMember(11, 1);
    byId('member-form-firstname').value = 'Zoé';

    await submit(api);

    const body = JSON.parse(api.mock.calls[0][1].body);
    expect(body.firstName).toBe('Zoé');
    expect('foodDiet' in body).toBe(false);
  });

  it('sends the pizza of a new member', async () => {
    const api = vi.fn().mockResolvedValue({});
    reg.openAddMemberModal();
    byId('member-form-firstname').value = 'Neo';
    byId('member-form-lastname').value = 'A';
    byId('member-form-email').value = 'neo@example.com';
    food().value = 'reine';

    await submit(api);

    expect(JSON.parse(api.mock.calls[0][1].body).foodDiet).toBe('reine');
  });
});

describe('pizza names in the lists', () => {
  it('shows the name of the pizza, not its id, in the team tables', () => {
    withFood('4_fromages');

    const row = byId('teams-container').querySelector('tr[data-member-id="11"]');
    expect(row.textContent).toContain('4 Fromages (Vég, Halal)');
    expect(row.textContent).not.toContain('4_fromages');
  });

  it('shows "-" for members without a pizza and the stored id for a pizza that left the catalogue', () => {
    withFood('diva');
    expect(byId('teams-container').querySelector('tr[data-member-id="11"]').textContent).toContain('diva');
    expect(byId('teams-container').querySelector('tr[data-member-id="12"]').textContent).not.toContain('Aucune');
  });

  it('shows names in the pizza statistics', () => {
    reg.renderStats(
      { total_teams: 1, total_participants: 2, max_participants: 3, available_spots: 1, food_preferences: [{ food_diet: '4_fromages', count: 2 }] },
      null,
      byId('food-stats')
    );

    expect(byId('food-stats').textContent).toContain('4 Fromages (Vég, Halal)');
  });
});
