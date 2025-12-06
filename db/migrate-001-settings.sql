-- Migration: Add settings table for dynamic configuration
-- Run: bunx wrangler d1 execute ndi-db --file=./db/migrate-add-settings.sql --remote

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Insert default capacity values
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('max_team_size', '15', 'Maximum members per team'),
    ('max_total_participants', '200', 'Maximum total participants allowed'),
    ('min_team_size', '1', 'Minimum members required for team creation');

-- Insert default pizzas as JSON
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('pizzas', '[{"id":"0-rien","name":"Aucune","description":""},{"id":"margherita","name":"Margherita","description":"Végétarienne, Sauce Tomate, Double Fromage"},{"id":"reine","name":"Reine","description":"Sauce Tomate, Fromage, Jambon, Champignon Frais"},{"id":"diva","name":"Diva","description":"Sauce Tomate, Fromage, Poulet, Pomme de Terre, Fromage de Chèvre"},{"id":"pecheur","name":"Pecheur","description":"Sauce Tomate, Fromage, Thon, Poivrons, Olives"},{"id":"orientale","name":"Orientale","description":"Sauce Tomate, Fromage, Merguez, Champignons Frais, Oignons, Œuf"},{"id":"vegetarienne","name":"Végétarienne","description":"Végétarienne, Sauce Tomate, Fromage, Champignons Frais, Poivrons, Olives"},{"id":"campione","name":"Campione","description":"Sauce Tomate, Fromage, Viande Hachée, Champignons Frais, Poivrons"},{"id":"4saisons","name":"4 Saisons","description":"Sauce Tomate, Fromage, Jambon, Poivrons, Champignons Frais, Olives"},{"id":"texas","name":"Texas","description":"Sauce Tomate, Fromage, Viande Hachée, Chorizo, Oignons, Champignons Frais"},{"id":"4jambons","name":"4 Jambons","description":"Sauce Tomate, Fromage, Jambon, Chorizo, Lardons"},{"id":"4fromages","name":"4 Fromages","description":"Végétarienne, Crème Fraîche, Fromage, Brie, Bleu, Rapé Italien"},{"id":"savoyarde","name":"Savoyarde","description":"Crème Fraîche, Fromage, Jambon, Lardons, Pomme de Terre, Oignons"},{"id":"chikensupreme","name":"Chiken Supreme","description":"Crème Fraîche, Fromage, Poulet, Pomme de Terre, Champignons"},{"id":"boursin","name":"Boursin","description":"Crème Fraîche, Fromage, Boursin, Viande Hachée"},{"id":"tartiflette","name":"Tartiflette","description":"Crème Fraîche, Fromage, Lardons, Reblochon, Oignons, Pomme de Terre"},{"id":"miami","name":"Miami","description":"Crème Fraîche, Fromage, Merguez, Viande Hachée, Œuf"},{"id":"raclette","name":"Raclette","description":"Crème Fraîche, Fromage à raclette, Jambon, Pomme de Terre, Oignons"},{"id":"barbecue","name":"Barbecue","description":"Sauce Barbecue, Fromage, Viande Hachée, Merguez, Oignons"},{"id":"pepper","name":"Pepper","description":"Sauce Poivre, Fromage, Poulet, Viande Hachée, Poivrons"},{"id":"indienne","name":"Indienne","description":"Sauce Curry, Fromage, Poulet, Poivrons, Oignons"},{"id":"algerienne","name":"Algérienne","description":"Sauce Algérienne, Fromage, Poulet, Merguez, Poivrons"},{"id":"carnivore","name":"Carnivore","description":"Sauce Barbecue, Fromage, Poulet, Merguez, Viande Hachée"}]', 'Available pizza options (JSON array)');

-- Insert bac levels as JSON
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('bac_levels', '[{"value":0,"label":"Non bachelier"},{"value":1,"label":"BAC+1"},{"value":2,"label":"BAC+2"},{"value":3,"label":"BAC+3 (Licence)"},{"value":4,"label":"BAC+4"},{"value":5,"label":"BAC+5 (Master)"},{"value":6,"label":"BAC+6"},{"value":7,"label":"BAC+7"},{"value":8,"label":"BAC+8 (Doctorat)"}]', 'Education level options (JSON array)');
