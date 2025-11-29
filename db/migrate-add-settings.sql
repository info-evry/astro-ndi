-- Migration: Add settings table for dynamic configuration
-- Run: bunx wrangler d1 execute ndi-registration --file=./db/migrate-add-settings.sql --remote

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
    ('pizzas', '[{"id":"none","name":"Aucune","description":""},{"id":"reine","name":"Reine","description":"Tomate, mozzarella, jambon, champignons"},{"id":"4fromages","name":"4 Fromages","description":"Tomate, mozzarella, chèvre, roquefort, emmental"},{"id":"chevre","name":"Chèvre","description":"Tomate, mozzarella, chèvre, miel"},{"id":"chorizo","name":"Chorizo","description":"Tomate, mozzarella, chorizo, poivrons"},{"id":"kebab","name":"Kebab","description":"Tomate, mozzarella, viande kebab, oignons, sauce"},{"id":"kebab_halal","name":"Kebab (Halal)","description":"Tomate, mozzarella, viande kebab halal, oignons, sauce"},{"id":"margherita","name":"Margherita","description":"Tomate, mozzarella, basilic frais"},{"id":"mexicaine","name":"Mexicaine","description":"Tomate, mozzarella, boeuf épicé, poivrons, oignons"},{"id":"montagnarde","name":"Montagnarde","description":"Crème, mozzarella, pommes de terre, lardons, reblochon"},{"id":"napolitaine","name":"Napolitaine","description":"Tomate, mozzarella, anchois, olives, câpres"},{"id":"orientale","name":"Orientale","description":"Tomate, mozzarella, merguez, poivrons, oignons"},{"id":"orientale_halal","name":"Orientale (Halal)","description":"Tomate, mozzarella, merguez halal, poivrons, oignons"},{"id":"paysanne","name":"Paysanne","description":"Crème, mozzarella, pommes de terre, lardons, oignons"},{"id":"pepperoni","name":"Pepperoni","description":"Tomate, mozzarella, pepperoni"},{"id":"poulet","name":"Poulet","description":"Tomate, mozzarella, poulet, poivrons"},{"id":"poulet_halal","name":"Poulet (Halal)","description":"Tomate, mozzarella, poulet halal, poivrons"},{"id":"raclette","name":"Raclette","description":"Crème, mozzarella, pommes de terre, jambon, raclette"},{"id":"royale","name":"Royale","description":"Tomate, mozzarella, jambon, champignons, poivrons, olives"},{"id":"saumon","name":"Saumon","description":"Crème, mozzarella, saumon fumé, aneth"},{"id":"savoyarde","name":"Savoyarde","description":"Crème, mozzarella, pommes de terre, lardons, oignons, fromage"},{"id":"thon","name":"Thon","description":"Tomate, mozzarella, thon, oignons"},{"id":"vegetarienne","name":"Végétarienne","description":"Tomate, mozzarella, légumes grillés, olives"},{"id":"calzone","name":"Calzone","description":"Chausson: tomate, mozzarella, jambon, champignons, oeuf"}]', 'Available pizza options (JSON array)');

-- Insert bac levels as JSON
INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('bac_levels', '[{"value":0,"label":"Non bachelier"},{"value":1,"label":"BAC+1"},{"value":2,"label":"BAC+2"},{"value":3,"label":"BAC+3 (Licence)"},{"value":4,"label":"BAC+4"},{"value":5,"label":"BAC+5 (Master)"},{"value":6,"label":"BAC+6"},{"value":7,"label":"BAC+7"},{"value":8,"label":"BAC+8 (Doctorat)"}]', 'Education level options (JSON array)');
