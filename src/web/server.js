// src/web/server.js (KOMPLETNÍ KÓD se všemi API endpointy pro dashboard)

const express = require('express');
const path = require('path');
// client, db, memoryManager (s potřebnými funkcemi) by měly být předány do funkce startDashboardServer

let server = null;

const startDashboardServer = (client, db, memoryManager) => {
    // Zkontrolujeme, zda server již neběží
    if (server) {
        console.log('Dashboard server již běží.');
        return;
    }

    console.log('Spouštím kontroly pro spuštění dashboard serveru...');

    // === VYLEPŠENÁ KONTROLA ZÁVISLOSTÍ ===
    // Zkontrolujeme základní objekty
    if (!client) {
        console.error('❌ Dashboard server: Nelze spustit server, chybí objekt "client".');
        return;
    }
    if (!db) {
        console.error('❌ Dashboard server: Nelze spustit server, chybí objekt "db".');
        return;
    }
    if (!memoryManager) {
        console.error('❌ Dashboard server: Nelze spustit server, chybí objekt "memoryManager".');
        return;
    }

    // Zkontrolujeme potřebné funkce na objektu 'db'
    const requiredDbFunctions = [
        'getUserCount',
        'getAllUsers',
        'getMemoryForSubject', // Použito v GET /api/memory
        'saveMemoryChunk', // Použito v POST /api/memory
        'deleteMemoryChunk', // Použito v DELETE /api/memory
        'loadActiveChannels', // Použito v GET a POST /api/active-channels
        'addActiveChannel', // Použito v POST /api/active-channels
        'removeActiveChannel', // Použito v DELETE /api/active-channels
        'loadMessageHistory', // Použito v GET /api/conversations
    ];

    for (const funcName of requiredDbFunctions) {
        if (typeof db[funcName] !== 'function') {
            console.error(`❌ Dashboard server: Na objektu "db" chybí potřebná funkce "${funcName}".`);
            return;
        }
    }

    // Zkontrolujeme potřebné funkce na objektu 'memoryManager'
    const requiredMemoryManagerFunctions = [
        'getNpcConfigs', // Použito v GET /api/bot-info a GET /api/npcs
        'getActiveChannelData', // Původně kontrolováno, možná se v serveru nepoužívá přímo, ale je tam zmínka. Ponecháno pro jistotu.
        'addChannelToCache', // Použito v POST /api/active-channels
        'removeChannelFromCache' // Použito v DELETE /api/active-channels
    ];

     for (const funcName of requiredMemoryManagerFunctions) {
        if (typeof memoryManager[funcName] !== 'function') {
            console.error(`❌ Dashboard server: Na objektu "memoryManager" chybí potřebná funkce "${funcName}".`);
            return;
        }
    }

    console.log('Všechny potřebné objekty a funkce nalezeny.');
    // === KONEC VYLEPŠENÉ KONTROLY ZÁVISLOSTÍ ===


    const app = express();
    const port = process.env.DASHBOARD_PORT || 5000;

    // Povolení CORS pro vývoj (volitelné, pokud dashboard běží na jiném portu/doméně)
    // app.use(cors()); // Je potřeba doinstalovat 'cors' a require(cors) nahoru

    app.use(express.json()); // Pro parsování JSON těla v POST/PUT požadavcích
    app.use(express.urlencoded({ extended: true })); // Pro parsování URL-encoded těl

    // Statické soubory pro frontend (HTML, CSS, frontend JS)
    const publicPath = path.join(__dirname, 'public');
    app.use(express.static(publicPath));
    console.log('--- DEBUG server.js: Statické soubory pro dashboard servírovány ze složky:', publicPath);

    // === API ENDPOINT PRO STATISTIKY BOTA (/api/bot-info) ===
    // Tento endpoint volá frontend v script.js pro zobrazení informací o botovi
    app.get('/api/bot-info', async (req, res) => {
        try {
            // Získání dat z Discord klienta
            const tag = client.user?.tag || 'N/A'; // Použijeme optional chaining pro jistotu
            const id = client.user?.id || 'N/A';
            const status = client.user?.presence?.status || 'offline';
            const serverCount = client.guilds?.cache.size || 0;
            const userCacheCount = client.users?.cache.size || 0;

            // Získání počtu unikátních uživatelů z DB
            const userCount = await db.getUserCount(); // Voláme funkci z db.js

            // Získání uptime (jak dlouho běží Node.js proces)
            const uptimeSeconds = process.uptime();

            // Získání počtu načtených NPC konfigurací z memoryManageru
            const npcConfigs = memoryManager.getNpcConfigs();
            const loadedNpcCount = Object.keys(npcConfigs).length;

            // Sestavení a odeslání odpovědi ve formátu, který očekává frontend
            res.json({
                tag: tag,
                id: id,
                status: status,
                serverCount: serverCount,
                userCacheCount: userCacheCount,
                userCount: userCount,
                uptimeSeconds: uptimeSeconds,
                loadedNpcCount: loadedNpcCount
            });
            console.log('--- DEBUG server.js: API /api/bot-info voláno, data odeslána.');

        } catch (error) {
            console.error('❌ Chyba při zpracování API /api/bot-info:', error);
            res.status(500).json({ error: 'Chyba při získávání statistik bota.' });
        }
    });
    // === KONEC API ENDPOINTU /api/bot-info ===

    // === API ENDPOINT PRO ZÍSKÁNÍ SEZNAMU NPC (/api/npcs) ===
    // Tento endpoint volá frontend v script.js pro zobrazení seznamu NPC a naplnění dropdownu
    app.get('/api/npcs', (req, res) => {
        try {
            const npcConfigs = memoryManager.getNpcConfigs(); // Získáme načtené NPC z memoryManageru
            const npcsList = Object.keys(npcConfigs).map(npcId => ({ // Převedeme objekt na pole
                id: npcId,
                name: npcConfigs[npcId].name,
                description: npcConfigs[npcId].description
            }));

            res.json(npcsList); // Odešleme pole NPC jako JSON
            console.log('--- DEBUG server.js: API /api/npcs voláno, seznam NPC odeslán.');

        } catch (error) {
            console.error('❌ Chyba při zpracování API /api/npcs:', error);
            res.status(500).json({ error: 'Chyba při získávání seznamu NPC.' });
        }
    });
    // === KONEC API ENDPOINTU /api/npcs ===

    // === NOVÝ API ENDPOINT PRO ZÍSKÁNÍ SEZNAMU UŽIVATELŮ (/api/users) ===
    // Tento endpoint volá frontend v script.js pro naplnění dropdownu uživatelů
    app.get('/api/users', async (req, res) => {
        try {
            const users = await db.getAllUsers(); // Voláme novou funkci z database.js
            res.json(users); // Odešleme pole uživatelů jako JSON
            console.log('--- DEBUG server.js: API /api/users voláno, seznam uživatelů odeslán.');
        } catch (error) {
            console.error('❌ Chyba při zpracování API /api/users:', error);
            res.status(500).json({ error: 'Chyba při získávání seznamu uživatelů.' });
        }
    });
    // === KONEC API ENDPOINTU /api/users ===

    // === NOVÉ API ENDPOINTY PRO SPRÁVU PAMĚTI (/api/memory) ===
    // Endpoint pro získání paměti pro NPC nebo uživatele
    // Původní endpoint: /api/memory/:subjectType/:subjectId
    // Změněno na: /api/memory?type=:subjectType&id=:subjectId pro snazší handling s query parametry
    // Přidáno také filtrování podle channelId pro specifičtější paměť
    app.get('/api/memory', async (req, res) => {
        const { type: subjectType, id: subjectId, channelId } = req.query; // Použijeme query parametry
        console.log(`--- DEBUG server.js: API GET /api/memory voláno s params: type=${subjectType}, id=${subjectId}, channelId=${channelId}`);

        if (!subjectType || !subjectId || !['npc', 'user'].includes(subjectType)) {
            return res.status(400).json({ error: 'Chybí nebo je neplatný typ subjektu (type=npc/user) nebo ID (id=...).' });
        }

        // Určení, zda jde o NPC nebo uživatele
        const user_id = subjectType === 'user' ? subjectId : null;
        const npc_id = subjectType === 'npc' ? subjectId : null;

        try {
            // Voláme funkci z database.js, která umí filtrovat podle všech tří (channel, user, npc),
            // přičemž null znamená nefiltrovat podle daného sloupce IS NULL
            const memory = await db.getMemoryForSubject(channelId || null, user_id, npc_id); // Voláme funkci z database.js
            res.json(memory);
            console.log(`--- DEBUG server.js: API GET /api/memory voláno, načteno ${memory.length} záznamů.`);
        } catch (error) {
            console.error(`❌ Chyba při zpracování API GET /api/memory (type=${subjectType}, id=${subjectId}, channelId=${channelId}):`, error);
            res.status(500).json({ error: 'Chyba při získávání paměti.' });
        }
    });


    // Endpoint pro přidání/aktualizaci paměťového záznamu
    // Používáme POST pro přidání nového záznamu, pokud klíč neexistuje
    // A PUT pro aktualizaci existujícího záznamu s daným klíčem/subjektem
    // API by mělo přijímat { channelId, userId, npcId, key, value }
    app.post('/api/memory', async (req, res) => {
        const { channelId, userId, npcId, key, value } = req.body;
        console.log('--- DEBUG server.js: API POST /api/memory voláno s body:', { channelId, userId, npcId, key, value });

        // Validace vstupních dat
        // userId nebo npcId musí být vyplněno, key a value musí být vyplněno
        if ((!userId && !npcId) || !key || value === undefined || value === null) {
             console.error('❌ Validace: Chybí povinná data pro POST /api/memory.');
             return res.status(400).json({ error: 'Chybí povinná data (musí být alespoň userId nebo npcId, plus key a value).' });
        }

        try {
            // saveMemoryChunk v DB modulu zvládne INSERT i ON DUPLICATE KEY UPDATE
            // Je vhodnější použít tuto jedinou funkci pro přidání i aktualizaci z dashboardu
            const result = await db.saveMemoryChunk(channelId || null, userId || null, npcId || null, key, String(value)); // Vynutíme string pro value
            console.log('--- DEBUG server.js: db.saveMemoryChunk volán, výsledek:', result);
            res.status(200).json({ message: 'Paměťový záznam uložen/aktualizován.', result: result }); // 200 OK pro obě operace (INSERT/UPDATE)

        } catch (error) {
             console.error('❌ Chyba při zpracování API POST /api/memory:', error);
             // Detailnější chybová zpráva pro front-end, pokud to není duplicitní klíč (což saveMemoryChunk řeší interně)
             res.status(500).json({ error: 'Chyba při ukládání paměti.', details: error.message });
        }
    });

    // Endpoint pro smazání paměťového záznamu podle KLÍČE a SUBJEKTU (channel/user/npc)
    // Původní endpoint: DELETE /api/memory/:chunkId (mazal podle ID řádku, což dashboard nezná)
    // Změněno na: DELETE /api/memory, přijímá { channelId, userId, npcId, key } v body
    app.delete('/api/memory', async (req, res) => {
        const { channelId, userId, npcId, key } = req.body;
        console.log('--- DEBUG server.js: API DELETE /api/memory voláno s body:', { channelId, userId, npcId, key });

        // Validace vstupních dat
        // Musí být specifikován KLÍČ a alespoň jeden ze subjektů (channelId, userId, npcId)
        if (!key || (!channelId && !userId && !npcId)) {
             console.error('❌ Validace: Chybí povinná data pro DELETE /api/memory.');
             return res.status(400).json({ error: 'Chybí povinná data (key a alespoň jeden z [channelId, userId, npcId]).' });
        }

        try {
            // Voláme funkci z database.js, která maže podle klíče a specifikovaných subjektů
            const result = await db.deleteMemoryChunk(channelId || null, userId || null, npcId || null, key);
            console.log('--- DEBUG server.js: db.deleteMemoryChunk volán, výsledek:', result);

            if (result && result.affectedRows > 0) {
                 res.json({ message: `Paměťový záznam pro klíč "${key}" smazán.`, affectedRows: result.affectedRows });
                 console.log(`--- DEBUG server.js: API DELETE /api/memory voláno, smazáno ${result.affectedRows} záznamů.`);
            } else {
                 // affectedRows je 0, záznam pro dané kritéria nebyl nalezen
                 res.status(404).json({ error: `Paměťový záznam pro klíč "${key}" a specifikovaný subjekt nebyl nalezen.`, affectedRows: 0 });
                 console.warn(`--- DEBUG server.js: API DELETE /api/memory voláno, záznam pro klíč "${key}" nenalezen.`);
            }

        } catch (error) {
            console.error('❌ Chyba při zpracování API DELETE /api/memory:', error);
            res.status(500).json({ error: 'Chyba při mazání paměti.', details: error.message });
        }
    });

    // === KONEC NOVÝCH API ENDPOINTŮ PRO SPRÁVU PAMĚTI ===


    // === NOVÉ API ENDPOINTY PRO SPRÁVU AKTIVNÍCH KANÁLŮ (/api/active-channels) ===
    // Endpoint pro získání seznamu aktivních kanálů
    app.get('/api/active-channels', async (req, res) => {
        try {
            // Použijeme stávající funkci loadActiveChannels, ale vrátíme ji přímo
            const activeChannels = await db.loadActiveChannels(); // Voláme funkci z database.js
            res.json(activeChannels);
            console.log('--- DEBUG server.js: API /api/active-channels voláno, seznam aktivních kanálů odeslán.');
        } catch (error) {
            console.error('❌ Chyba při zpracování API /api/active-channels:', error);
            res.status(500).json({ error: 'Chyba při získávání aktivních kanálů.' });
        }
    });

    // Endpoint pro přidání nového aktivního kanálu
    app.post('/api/active-channels', async (req, res) => {
        const { guildId, channelId, npcId } = req.body;
        console.log('--- DEBUG server.js: API POST /api/active-channels voláno s body:', { guildId, channelId, npcId });

        // Validace vstupních dat
        if (!guildId || !channelId || !npcId) { // npcId je nyní také povinné
             console.error('❌ Validace: Chybí povinná data (guildId, channelId, npcId) pro POST /api/active-channels.');
            return res.status(400).json({ error: 'Chybí povinná data (guildId, channelId, npcId) pro přidání aktivního kanálu.' });
        }

        try {
            // Voláme stávající funkci addActiveChannel
            // Funkce addActiveChannel již v DB modulu řeší duplicitní záznamy a vrací boolean
            const success = await db.addActiveChannel(guildId, channelId, npcId);
            console.log('--- DEBUG server.js: db.addActiveChannel volán, success:', success);

            if (success) {
                // Také musíme aktualizovat cache aktivních kanálů v memoryManageru na backendu!
                memoryManager.addChannelToCache(channelId, npcId);
                 res.status(201).json({ message: 'Kanál úspěšně přidán/aktualizován v DB.', added: true });
                 console.log('--- DEBUG server.js: Kanál úspěšně přidán/aktualizován v DB.');
            } else {
                 // Pokud success === false, znamená to, že záznam již existoval (handled by ER_DUP_ENTRY v DB modulu)
                 res.status(409).json({ error: 'Kanál je již v DB označen jako aktivní.', added: false }); // 409 Conflict
                 console.warn('--- DEBUG server.js: Kanál je již aktivní, nepřidáno.');
            }
        } catch (error) {
            console.error('❌ Chyba při zpracování API POST /api/active-channels:', error);
            res.status(500).json({ error: 'Chyba při přidávání aktivního kanálu.', details: error.message });
        }
    });

    // Endpoint pro odebrání aktivního kanálu
    // Původní endpoint: DELETE /api/active-channels/:channelId
    // Nyní přijímá channelId v params
    app.delete('/api/active-channels/:channelId', async (req, res) => {
        const { channelId } = req.params;
        console.log(`--- DEBUG server.js: API DELETE /api/active-channels/${channelId} voláno.`);

        try {
            // Voláme stávající funkci removeActiveChannel
            const success = await db.removeActiveChannel(channelId);
            console.log('--- DEBUG server.js: db.removeActiveChannel volán, success:', success);

            if (success) {
                // Také musíme aktualizovat cache aktivních kanálů v memoryManageru na backendu!
                memoryManager.removeChannelFromCache(channelId);
                 res.json({ message: `Kanál ${channelId} úspěšně odebrán z DB.`, deleted: true });
                 console.log(`--- DEBUG server.js: Kanál ${channelId} úspěšně odebrán z DB.`);
            } else {
                 // Pokud success === false, záznam nebyl nalezen v DB
                 res.status(404).json({ error: `Kanál s ID ${channelId} nebyl nalezen v DB.`, deleted: false });
                 console.warn(`--- DEBUG server.js: Kanál s ID ${channelId} nenalezen v DB.`);
            }
        } catch (error) {
            console.error(`❌ Chyba při zpracování API DELETE /api/active-channels/${channelId}:`, error);
            res.status(500).json({ error: 'Chyba při odebírání aktivního kanálu.', details: error.message });
        }
    });
    // === KONEC NOVÝCH API ENDPOINTŮ PRO SPRÁVU AKTIVNÍCH KANÁLŮ ===


    // === NOVÝ API ENDPOINT PRO KONVERZAČNÍ HISTORII (/api/conversations) ===
    // Endpoint pro získání historie pro konkrétní kanál
    // Přijímá channelId v params a volitelný limit v query
    app.get('/api/conversations/:channelId', async (req, res) => {
        const { channelId } = req.params;
        const limit = parseInt(req.query.limit) || 50; // Počet zpráv, default 50
        console.log(`--- DEBUG server.js: API GET /api/conversations/${channelId} voláno s limitem ${limit}.`);

        try {
            // Voláme stávající funkci loadMessageHistory
            const history = await db.loadMessageHistory(channelId, limit);
            res.json(history);
            console.log(`--- DEBUG server.js: API /api/conversations/${channelId} voláno, odesláno ${history.length} záznamů historie.`);
        } catch (error) {
            console.error(`❌ Chyba při zpracování API GET /api/conversations/${channelId}:`, error);
            res.status(500).json({ error: 'Chyba při získávání historie konverzace.', details: error.message });
        }
    });
    // === KONEC NOVÉHO API ENDPOINTU PRO KONVERZAČNÍ HISTORII ===


    server = app.listen(port, () => {
        console.log(`🖥️ Dashboard běží na http://localhost:${port}`);
        console.log('Dashboard server připraven na požadavky API.');
    });
};

// Funkce pro zastavení dashboard serveru (pokud by bylo potřeba)
const stopDashboardServer = () => {
    if (server) {
        server.close(() => {
            console.log('Dashboard server zastaven.');
            server = null;
        });
    } else {
        console.warn('Pokus o zastavení neexistujícího dashboard serveru.');
    }
};

// Exportujeme funkci pro spuštění serveru
module.exports = startDashboardServer;
// Pokud bys chtěl i možnost zastavit, exportuj i stopDashboardServer
// module.exports = { startDashboardServer, stopDashboardServer };