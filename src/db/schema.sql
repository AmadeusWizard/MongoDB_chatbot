-- db/schema.sql

-- Tabulka uživatelů
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY, -- Discord User ID
    username VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabulka NPC
CREATE TABLE IF NOT EXISTS npcs (
    id VARCHAR(255) PRIMARY KEY, -- Unikátní ID pro NPC (např. 'astronomer')
    name VARCHAR(255) NOT NULL,
    base_prompt TEXT, -- Základní instrukce pro AI
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    -- Můžeš zde mít i sloupec pro reference na defaultní paměť, pokud ji nechceš ukládat do memory_chunks
);

-- Tabulka konverzací (historie zpráv)
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(255), -- Discord Guild ID
    channel_id VARCHAR(255) NOT NULL, -- Discord Channel ID
    user_id VARCHAR(255), -- Discord User ID (NULL, pokud je to zpráva od bota/NPC)
    npc_id VARCHAR(255), -- NPC ID (NULL, pokud je to zpráva od uživatele nebo obecná zpráva bota)
    message_content TEXT NOT NULL,
    message_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Cizí klíče (volitelné, ale dobrá praxe pro integritu dat)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE SET NULL
);

-- Tabulka dlouhodobé paměti
CREATE TABLE IF NOT EXISTS memory_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255), -- K jakému uživateli se paměť vztahuje (může být NULL)
    npc_id VARCHAR(255), -- K jakému NPC se paměť vztahuje (může být NULL)
    memory_key VARCHAR(255) NOT NULL, -- Klíčový pojem (např. 'favorite_color', 'meeting_date')
    memory_value TEXT NOT NULL, -- Detailní informace k pojmu
    relevance_score FLOAT DEFAULT 0.5, -- Skóre důležitosti (pro pozdější vyhledávání)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Indexy pro rychlejší vyhledávání
    INDEX idx_user_id (user_id),
    INDEX idx_npc_id (npc_id),
    FULLTEXT INDEX idx_memory_value (memory_value) -- Pro fulltextové vyhledávání v hodnotě
);

-- Tabulka pro sledování aktivních kanálů
CREATE TABLE IF NOT EXISTS active_channels (
    channel_id VARCHAR(255) PRIMARY KEY, -- Discord Channel ID
    guild_id VARCHAR(255) NOT NULL, -- Discord Guild ID
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- Můžeš zde mít i sloupce pro konfiguraci per kanál (např. defaultní NPC pro kanál)
);