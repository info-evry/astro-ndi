/**
 * Configuration API - serves pizza options and other config
 */

import { json, error } from '../lib/router.js';

// Default configuration embedded in worker
const DEFAULT_CONFIG = {
  pizzas: [
    { id: 'none', name: 'Aucune', description: '' },
    { id: 'reine', name: 'Reine', description: 'Tomate, mozzarella, jambon, champignons' },
    { id: '4fromages', name: '4 Fromages', description: 'Tomate, mozzarella, chèvre, roquefort, emmental' },
    { id: 'chevre', name: 'Chèvre', description: 'Tomate, mozzarella, chèvre, miel' },
    { id: 'chorizo', name: 'Chorizo', description: 'Tomate, mozzarella, chorizo, poivrons' },
    { id: 'kebab', name: 'Kebab', description: 'Tomate, mozzarella, viande kebab, oignons, sauce' },
    { id: 'kebab_halal', name: 'Kebab (Halal)', description: 'Tomate, mozzarella, viande kebab halal, oignons, sauce' },
    { id: 'margherita', name: 'Margherita', description: 'Tomate, mozzarella, basilic frais' },
    { id: 'mexicaine', name: 'Mexicaine', description: 'Tomate, mozzarella, boeuf épicé, poivrons, oignons' },
    { id: 'montagnarde', name: 'Montagnarde', description: 'Crème, mozzarella, pommes de terre, lardons, reblochon' },
    { id: 'napolitaine', name: 'Napolitaine', description: 'Tomate, mozzarella, anchois, olives, câpres' },
    { id: 'orientale', name: 'Orientale', description: 'Tomate, mozzarella, merguez, poivrons, oignons' },
    { id: 'orientale_halal', name: 'Orientale (Halal)', description: 'Tomate, mozzarella, merguez halal, poivrons, oignons' },
    { id: 'paysanne', name: 'Paysanne', description: 'Crème, mozzarella, pommes de terre, lardons, oignons' },
    { id: 'pepperoni', name: 'Pepperoni', description: 'Tomate, mozzarella, pepperoni' },
    { id: 'poulet', name: 'Poulet', description: 'Tomate, mozzarella, poulet, poivrons' },
    { id: 'poulet_halal', name: 'Poulet (Halal)', description: 'Tomate, mozzarella, poulet halal, poivrons' },
    { id: 'raclette', name: 'Raclette', description: 'Crème, mozzarella, pommes de terre, jambon, raclette' },
    { id: 'royale', name: 'Royale', description: 'Tomate, mozzarella, jambon, champignons, poivrons, olives' },
    { id: 'saumon', name: 'Saumon', description: 'Crème, mozzarella, saumon fumé, aneth' },
    { id: 'savoyarde', name: 'Savoyarde', description: 'Crème, mozzarella, pommes de terre, lardons, oignons, fromage' },
    { id: 'thon', name: 'Thon', description: 'Tomate, mozzarella, thon, oignons' },
    { id: 'vegetarienne', name: 'Végétarienne', description: 'Tomate, mozzarella, légumes grillés, olives' },
    { id: 'calzone', name: 'Calzone', description: 'Chausson: tomate, mozzarella, jambon, champignons, oeuf' }
  ],
  bacLevels: [
    { value: 0, label: 'Non bachelier' },
    { value: 1, label: 'BAC+1' },
    { value: 2, label: 'BAC+2' },
    { value: 3, label: 'BAC+3 (Licence)' },
    { value: 4, label: 'BAC+4' },
    { value: 5, label: 'BAC+5 (Master)' },
    { value: 6, label: 'BAC+6' },
    { value: 7, label: 'BAC+7' },
    { value: 8, label: 'BAC+8 (Doctorat)' }
  ],
  labels: {
    registeredTeams: 'Équipes Inscrites',
    registrationForm: "Formulaire d'Inscription",
    createTeam: 'Créer une nouvelle équipe',
    joinTeam: 'Rejoindre une équipe existante',
    teamName: "Nom de l'équipe",
    teamDescription: 'Description (optionnelle)',
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'Email',
    bacLevel: "Niveau d'études",
    isLeader: "Chef d'équipe",
    pizzaSelection: 'Choix de pizza',
    addMember: 'Ajouter un membre',
    removeMember: 'Retirer',
    submit: "S'inscrire",
    members: 'membres',
    spotsAvailable: 'places disponibles',
    spotsFull: 'Complet'
  }
};

/**
 * GET /api/config - Get public configuration
 */
export async function getConfig(request, env) {
  try {
    let config = { ...DEFAULT_CONFIG };

    // Merge with KV overrides if available
    if (env.CONFIG) {
      try {
        const kvPizzas = await env.CONFIG.get('pizzas', { type: 'json' });
        if (kvPizzas) config.pizzas = kvPizzas;

        const kvLabels = await env.CONFIG.get('labels', { type: 'json' });
        if (kvLabels) config.labels = { ...config.labels, ...kvLabels };

        const kvBacLevels = await env.CONFIG.get('bacLevels', { type: 'json' });
        if (kvBacLevels) config.bacLevels = kvBacLevels;
      } catch (e) {
        // Fall back to defaults
        console.error('KV read error:', e);
      }
    }

    // Add capacity info from environment
    config.maxTeamSize = parseInt(env.MAX_TEAM_SIZE, 10) || 15;
    config.maxTotalParticipants = parseInt(env.MAX_TOTAL_PARTICIPANTS, 10) || 200;
    config.minTeamSize = parseInt(env.MIN_TEAM_SIZE, 10) || 2;

    return json({ config });
  } catch (err) {
    console.error('Error fetching config:', err);
    return error('Failed to fetch configuration', 500);
  }
}
