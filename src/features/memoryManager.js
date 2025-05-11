// src/features/memoryManager.js

// Import potřebných modulů
const fs = require('fs');
const path = require('path');
const db = require('../db/database'); // Modul pro práci s databází
const apiService = require('./apiService'); // Modul pro komunikaci s AI API

// Cesta k souboru s konfigurací NPC (relativně k tomuto souboru v src/features/)
// !!! ZKONTROLOVÁNO: Název proměnné je npcConfigsFilePath !!!
const npcConfigsFilePath = path.join(__dirname, '..', '..', 'config', 'npc_configs_v2.json');

// Proměnná pro uchování konfigurací NPC v paměti
let npcConfigs = {};
// Cache pro aktivní kanály (channelId -> { guild_id, channel_id, npc_id })
let activeChannelsCache = new Map();
// Flag pro indikaci, zda jsou základní konfigurace načteny
let isInitialized = false;
// Globální instance klienta, pokud ji potřebujeme v memoryManager (např. pro získání username)
// TOHLE JE VOLITELNÉ A ZATÍM NENÍ PŘEDÁVÁNO!
let discordClient = null;

// === Funkce pro nastavení instance Discord klienta (pokud je třeba) ===
function setDiscordClient(client) {
    discordClient = client;
    console.log('--- DEBUG memoryManager: Instance Discord klienta nastavena.');
}

// === Funkce pro načítání NPC konfigurací ze souboru ===
async function loadNpcConfigs() {
    // !!! OPRAVENO: Používáme správný název proměnné npcConfigsFilePath !!!
    console.log(`--- DEBUG memoryManager: Načítám NPC konfigurace ze souboru: ${npcConfigsFilePath}`);
    try {
        // !!! OPRAVENO: Používáme správný název proměnné npcConfigsFilePath !!!
        const data = fs.readFileSync(npcConfigsFilePath, 'utf8');
        npcConfigs = JSON.parse(data);
        console.log(`🤖 Načteno ${Object.keys(npcConfigs).length} konfigurací NPC.`);
        console.log('🤖 Konfigurace NPC uloženy do paměti.');
        // console.log('--- DEBUG memoryManager: Načtené NPC konfigurace:', npcConfigs); // Může být příliš podrobné logování
        console.log(`🤖 Finální počet načtených NPC v npcConfigs: ${Object.keys(npcConfigs).length}`); // Přidán log pro finální počet
    } catch (error) {
        console.error('❌ Chyba při načítání NPC konfigurací:', error);
        // Pokud selže načtení NPC configs, bot nemůže fungovat správně, měl by být ukončen
        throw error; // Vyvoláme chybu dál, aby ji zachytil bot.js
    }
}

// === Funkce pro získání načtených NPC konfigurací ===
function getNpcConfigs() {
    console.log('--- DEBUG memoryManager: Funkce getNpcConfigs() volána.');
    // console.log('--- DEBUG memoryManager: Aktuální stav npcConfigs v getNpcConfigs:', npcConfigs); // Tato zpráva byla odstraněna nebo zakomentována
    console.log('--- DEBUG memoryManager: Počet klíčů v npcConfigs v getNpcConfigs:', Object.keys(npcConfigs).length); // Tento log ponecháme
    return npcConfigs; // Vrací aktuální objekt s konfiguracemi NPC
}

// === Funkce pro načítání aktivních kanálů z databáze do cache ===
async function loadActiveChannelsFromDb() {
    console.log('--- DEBUG memoryManager: Načítám aktivní kanály z databáze...');
    try {
        const activeChannels = await db.loadActiveChannels(); // Voláme funkci z db modulu
        activeChannelsCache.clear(); // Vyčistíme cache před naplněním
        activeChannels.forEach(channel => {
            activeChannelsCache.set(channel.channel_id, channel);
        });
        console.log(`🌐 Načteno ${activeChannelsCache.size} aktivních kanálů do paměti bota.`);
        isInitialized = true; // Označíme memoryManager jako inicializovaný
        console.log('--- DEBUG memoryManager: Inicializace aktivních kanálů dokončena. isInitialized = true.');
    } catch (error) {
        console.error('❌ Chyba při načítání aktivních kanálů z DB:', error);
        isInitialized = false; // Pokud načtení selže, označíme jako neinicializovaný
        // Chyba při načítání aktivních kanálů je kritická pro MessageHandler, bot by neměl reagovat
        throw error; // Vyvoláme chybu dál
    }
}

// === Funkce pro kontrolu, zda je MemoryManager plně inicializován ===
function isBotInitialized() {
    // Kontroluje, zda byly načteny NPC konfigurace A aktivní kanály
    // TODO: Přidat kontrolu, zda je db.js také připraven (má spojení?) - to se děje v bot.js ready eventu.
    const npcConfigsLoaded = Object.keys(npcConfigs).length > 0; // Kontrola, zda je npcConfigs objekt naplněn
    console.log(`--- DEBUG memoryManager: isBotInitialized kontrola - npcConfigsLoaded: ${npcConfigsLoaded}, activeChannelsCache.size: ${activeChannelsCache.size}, isInitialized flag: ${isInitialized}`);
    return isInitialized && npcConfigsLoaded;
}

// === Funkce pro získání dat o aktivním kanálu z cache ===
function getActiveChannelData(channelId) {
    //console.log(`--- DEBUG memoryManager: Získávám data o kanálu ${channelId} z cache.`); // Příliš časté logování
    return activeChannelsCache.get(channelId); // Vrací objekt s daty kanálu nebo undefined
}

// === Funkce pro sestavení promptu pro AI ===
// Prompt by měl obsahovat instrukce pro AI, kontext (NPC info, historie konverzace) a paměť.
// Tato funkce se volá z messageHandler.js
async function constructPrompt(channelId, userId, npcId, currentMessageContent) {
    console.log(`--- DEBUG memoryManager: Sestavuji prompt pro kanál ${channelId}, uživatele ${userId}, NPC ${npcId}...`);
    // *** ZDE SE INICIALIZUJE POLE 'prompt'! BEZ TÉTO ŘÁDKY DOJDE K ReferenceError! ***
    const prompt = []; // <<< TATO ŘÁDKA JE KLÍČOVÁ A MUSÍ ZDE BÝT!

    // 1. Přidáme systémovou zprávu (instrukce pro AI a role NPC)
    // Získáme konfiguraci pro konkrétní NPC.
    const npcConfig = npcConfigs[npcId]; // npcConfigs je objekt načtený při startu bota
    if (!npcConfig) {
        console.error(`❌ Chyba memoryManager: Konfigurace pro NPC ID "${npcId}" nenalezena!`);
        // Pokud konfigurace NPC chybí, přidáme alespoň obecnou systémovou zprávu
        prompt.push({ role: 'system', content: 'Jsi užitečný asistent.' }); // Defaultní fallback
    } else {
        // Použijeme 'basePrompt' z konfigurace NPC jako hlavní systémovou instrukci
        prompt.push({ role: 'system', content: npcConfig.basePrompt });
        console.log('--- DEBUG memoryManager: Přidán system prompt z NPC konfigurace.');
    }

    // 2. Přidáme paměťové záznamy (dlouhodobá paměť o uživatelích a kontextu)
    console.log('--- DEBUG memoryManager: Načítám paměťové záznamy pro kontext...');
    // Zde voláme funkci z database.js, která načte paměťové záznamy
    // relevantní k danému kanálu, uživateli a NPC.
    const memoryChunks = await db.loadMemoryChunks(channelId, userId, npcId); // <<-- ZDE SE NAČÍTÁ PAMĚŤ Z DATABÁZE
    console.log(`--- DEBUG memoryManager: Načteno ${memoryChunks.length} paměťových záznamů pro kontext.`);

    // Formátování paměťových záznamů pro prompt AI
    if (memoryChunks.length > 0) {
        // Přidáme speciální instrukci pro AI, jak má tuto paměť použít
        prompt.push({ role: 'system', content: "Tohle jsou důležité informace o kontextu nebo uživateli, které si pamatuj a použij ve své odpovědi, pokud jsou relevantní:" });
        // Každý paměťový záznam přidáme do pole prompt jako samostatnou zprávu
        memoryChunks.forEach(chunk => {
            // Formát záleží na preferovaném vstupu AI modelu. JSON je obvyklý.
            // Např.: { "klíč paměti": "hodnota paměti" }
            try {
                const memoryObject = {};
                memoryObject[chunk.memory_key] = chunk.memory_value;
                prompt.push({ role: 'system', content: JSON.stringify(memoryObject) }); // <<-- ZDE SE PŘIDÁVÁ PAMĚŤ DO POLE PROMPTŮ
            } catch (parseError) {
                console.error(`❌ Chyba při formátování paměťového záznamu do JSON pro prompt (klíč "${chunk.memory_key}"):`, parseError);
                // Pokud selže formátování jednoho záznamu, nevadí, zkusíme přidat jako text
                prompt.push({ role: 'system', content: `${chunk.memory_key}: ${chunk.memory_value}` }); // Přidáme jako prostý text
            }
        });
        console.log('--- DEBUG memoryManager: Paměťové záznamy přidány do promptu.');
    } else {
        console.log('--- DEBUG memoryManager: Žádné paměťové záznamy pro kontext nalezeny.');
    }

    // 3. Přidáme historii konverzace (krátkodobá paměť - posledních 15 zpráv)
    // Načteme posledních N zpráv z databáze pro daný kanál
    const historyLimit = 25; // Konfiguruj, kolik posledních zpráv se má načíst
    console.log(`--- DEBUG memoryManager: Načítám posledních ${historyLimit} zpráv pro kontext...`);
    // Voláme funkci z database.js, která načte historii zpráv pro daný kanál.
    const messageHistory = await db.loadMessageHistory(channelId, historyLimit); // <<-- ZDE SE NAČÍTÁ HISTORIE ZPRÁV Z DATABÁZE
    console.log(`--- DEBUG memoryManager: Načteno ${messageHistory.length} zpráv pro kontext paměti.`);

    // Formátování historie konverzace pro prompt
    messageHistory.forEach(msg => { // <<-- PROCHÁZÍME NAČTENOU HISTORII ZPRÁV
        // Zprávy od uživatele (role: 'user')
        if (!msg.is_bot) {
            prompt.push({ role: 'user', content: `${msg.user_username}: ${msg.content}` }); // <<-- PŘIDÁVAJÍ SE UŽIVATELSKÉ ZPRÁVY
        }
        // Zprávy od bota (NPC)
        else {
            // Můžeme použít roli 'assistant' pro zprávy bota/AI
            prompt.push({ role: 'assistant', content: msg.content }); // <<-- PŘIDÁVAJÍ SE ZPRÁVY BOTA
        }
    });
    console.log('--- DEBUG memoryManager: Historie konverzace přidána do promptu.');

    // 4. Přidáme aktuální zprávu uživatele
    // Aktuální zpráva uživatele musí být vždy na konci promptu.
    console.log('--- DEBUG memoryManager: Přidávám aktuální zprávu uživatele do promptu.');
    // Snažíme se získat username aktuálního uživatele pro lepší formátování promptu.
    let usernameForPrompt = `Uživatel_${userId}:`; // Fallback, pokud username nezískáme
    // Zkusíme najít username z poslední zprávy v načtené historii, pokud patří stejnému uživateli
    if (messageHistory.length > 0) {
        // Vytvoříme dočasnou kopii historie a obrátíme ji pro snazší nalezení poslední zprávy od uživatele
        const reversedHistory = [...messageHistory].reverse();
        const lastUserMessage = reversedHistory.find(msg => !msg.is_bot && msg.user_id === userId);
        if (lastUserMessage) {
            usernameForPrompt = `${lastUserMessage.user_username}:`;
            console.log(`--- DEBUG memoryManager: Username pro uživatele ${userId} pro prompt získáno z historie.`);
        } else {
            console.warn(`--- DEBUG memoryManager: Username pro uživatele ${userId} pro prompt nebylo nalezeno v načtené historii. Používám fallback.`);
        }
    } else {
        console.warn(`--- DEBUG memoryManager: Username pro uživatele ${userId} pro prompt nebylo snadno dostupné (historie prázdná). Používám fallback.`);
    }

    // Přidáme samotnou aktuální zprávu od uživatele na konec promptu.
    prompt.push({ role: 'user', content: `${usernameForPrompt} ${currentMessageContent}` }); // <<-- ZDE SE PŘIDÁVÁ AKTUÁLNÍ ZPRÁVA UŽIVATELE

    // console.log('--- DEBUG memoryManager: Finální sestavený prompt:', prompt); // Může být příliš podrobné logování
    return prompt; // Vrací sestavený prompt ve formátu pro AI API
}

// Funkce pro přidání ID kanálu DO MAPY A S NPC ID
function addChannelToCache(channelId, npcId = null) {
    activeChannelsCache.set(channelId, {
        channel_id: channelId,
        npc_id: npcId
    });
    console.log(`--- DEBUG memoryManager: Kanál ${channelId} přidán/aktualizován v cache (Map) s NPC ${npcId}. Aktuální cache (pole záznamů):`, Array.from(activeChannelsCache.entries()));
}

// Funkce pro odebrání ID kanálu Z MAPY
function removeChannelFromCache(channelId) {
    const deleted = activeChannelsCache.delete(channelId);
    console.log(`--- DEBUG memoryManager: Pokus o odebrání kanálu ${channelId} z cache (Map). Odebráno: ${deleted}. Aktuální cache (pole záznamů):`, Array.from(activeChannelsCache.entries()));
}

// === Funkce pro analýzu odpovědi AI a ukládání paměti ===
// Bude volána po přijetí odpovědi od AI.
// Měla by analyzovat odpověď a historii konverzace a identifikovat klíčové informace, které se mají uložit do dlouhodobé paměti.
// Tato funkce se volá z messageHandler.js
async function analyzeAndSaveMemory(message, botResponseContent, npcId) {
    console.log(`--- DEBUG memoryManager: Spouštím analýzu paměti pro kanál ${message.channel.id}, uživatele ${message.author.id} a NPC ${npcId}...`);
    // Tato funkce je klíčová pro "učení" bota.
    // Měla by:
    // 1. Vzít historii konverzace (načtenou zde) a odpověď AI (botResponseContent - surová odpověď).
    // 2. Analyzovat je (např. pomocí dalšího volání AI modelu s instrukcemi pro extrakci paměti).
    // 3. Identifikovat klíčové informace o uživateli nebo kontextu, které jsou důležité pro budoucí interakce.
    // 4. Uložit tyto informace do databáze pomocí db.saveMemoryChunk.

    // --- Zde je ZÁKLADNÍ IMPLEMENTACE analýzy paměti pomocí API volání ---
    // Vyšší úroveň logování pro debugging analýzy paměti
    console.log('--- DEBUG memoryManager: Analyzuji konverzaci pro extrakci paměti...');
    const analysisPrompt = []; // Pole pro prompt pro analýzu paměti

    // Systémová zpráva pro AI - instrukce pro extrakci paměti
    // *** ZDE JSME VYLEPŠILI INSTRUKCE PRO AI, ABY VRACELA PŘÍSNĚ JSON ***
    const memoryExtractionInstruction = `Jsi expert na extrakci klíčových informací z konverzace pro dlouhodobou paměť. Tvým úkolem je **PŘÍSNĚ** identifikovat a extrahovat důležité a relevantní informace o uživateli nebo kontextu z následující konverzace.

**IGNORUJ** pozdravy, vtipy, irelevantní odbočky, technické komentáře o paměti nebo AI a informace, které už pravděpodobně máš (pokud nová konverzace nepřináší aktualizaci).

**ZAMĚŘ SE VÝHRADNĚ NA FAKTA**, preference, zájmy, plány, nedokončené úkoly, nebo cokoli, co by mohlo být klíčové a užitečné pro budoucí, personalizované interakce s tímto uživatelem.

**VRAŤ SVOU ODPOVĚĎ VÝHRADNĚ VE FORMÁTU ČISTÉHO JSON OBJEKTU.** **NEPŘIDÁVEJ ŽÁDNÝ ÚVODNÍ ANI ZÁVĚREČNÝ TEXT PŘED NEBO PO JSON OBJEKTU!** **Vrátí se POUZE JSON OBJEKT \`{...}\`.**

Klíče v JSON by měly být stručné textové řetězce popisující typ informace (např. "Zájmy", "Pracovní pozice", "Plány na víkend", "Oblíbená barva"). Hodnoty by měly být konkrétní informace, které jsi extrahoval/a, také jako textové řetězce.

Pokud nejsou v konverzaci **žádné nové relevantní informace** k extrakci pro dlouhodobou paměť, vrať **PRÁZDNÝ JSON objekt**: \`{}\`.

**PŘÍKLAD POŽADOVANÉHO FORMÁTU (POUZE JSON):**
\`\`\`json
{
  "Jméno uživatele": "Petr",
  "Oblíbená barva": "modrá",
  "Plány na víkend": "Jít na túru do hor"
}
\`\`\`

Analyzuj následující konverzaci (historie a poslední zpráva):`;
    analysisPrompt.push({ role: 'system', content: memoryExtractionInstruction });
    console.log('--- DEBUG memoryManager: Přidána vylepšená instrukce pro extrakci paměti do promptu analýzy.');

    // Načteme historii konverzace, kterou budeme analyzovat
    // Můžeme použít stejný limit jako pro hlavní prompt, nebo jiný, delší.
    const analysisHistoryLimit = 25; // Počet zpráv pro analýzu paměti
    console.log(`--- DEBUG memoryManager: Načítám posledních ${analysisHistoryLimit} zpráv pro kontext analýzy paměti...`);
    // message objekt obsahuje channel.id a author.id, což potřebujeme pro loadMessageHistory
    const conversationForAnalysis = await db.loadMessageHistory(message.channel.id, analysisHistoryLimit);
    console.log(`--- DEBUG memoryManager: Načteno ${conversationForAnalysis.length} zpráv pro kontext analýzy paměti.`);

    // Přidáme historii konverzace do promptu analýzy
    conversationForAnalysis.forEach(msg => {
        if (!msg.is_bot) {
            // Formátování zpráv uživatele pro analýzu
            analysisPrompt.push({ role: 'user', content: `${msg.user_username || 'Uživatel'}: ${msg.content}` });
        } else {
            // Formátování zpráv bota (NPC) pro analýzu
            // Použijeme surovou odpověď bota, která byla uložena (botResponseContent), pokud je k dispozici a je string.
            // To zajistí, že analyzujeme i to, co bot "myslel", včetně </think> tagů, které mohou obsahovat info pro paměť.
            // Pokud fullApiResponse (což je botResponseContent z messageHandleru) není string, použijeme obsah z DB.
            const botContentForAnalysis = (botResponseContent && typeof botResponseContent === 'string') ? botResponseContent : msg.content;
            analysisPrompt.push({ role: 'assistant', content: botContentForAnalysis });
        }
    });
    console.log('--- DEBUG memoryManager: Historie konverzace přidána do promptu analýzy paměti.');

    // console.log('--- DEBUG memoryManager: Finální prompt pro analýzu paměti:', analysisPrompt); // Může být příliš podrobné

    // Volání AI API pro extrakci paměti
    console.log('--- DEBUG memoryManager: Volám apiService.getChatCompletion pro analýzu paměti.');
    // API Service by měl vrátit STRING s výsledkem analýzy (očekáváme JSON STRING), nebo null při chybě/prázdné odpovědi.
    const memoryAnalysisResult = await apiService.getChatCompletion(analysisPrompt); // Voláme API s promptem pro analýzu
    console.log('--- DEBUG memoryManager: Surová odpověď od AI pro analýzu paměti přijata:', memoryAnalysisResult);

    // Zpracování výsledku analýzy (očekáváme JSON STRING)
    if (memoryAnalysisResult && typeof memoryAnalysisResult === 'string') {
        try {
            // AI by měla vrátit pouze JSON STRING. Zkusíme parsovat.
            // *** PŘIDÁNO ROBUSTNĚJŠÍ PARSOVÁNÍ: Zkusíme extrahovat JSON objekt z textu ***
            let jsonString = memoryAnalysisResult.trim();
            const startIndex = jsonString.indexOf('{');
            const endIndex = jsonString.lastIndexOf('}');

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                // Extrahujeme text od prvního '{' do posledního '}'
                jsonString = jsonString.substring(startIndex, endIndex + 1);
                console.log('--- DEBUG memoryManager: Extrahovaný potenciální JSON string pro parsování:', jsonString);
            } else {
                console.warn('--- DEBUG memoryManager: Nelze najít standardní JSON objekt ({...}) ve výsledku analýzy paměti. Zkusím parsovat celou odpověď.');
                // Pokud nelze extrahovat JSON objekt, zkusíme parsovat celou odpověď, pokud je to validní JSON bez okolního textu.
                // jsonString zůstává trimovanou původní odpovědí.
            }
            // *** Konec robustnějšího parsování ***

            const memoryToSave = JSON.parse(jsonString); // <<< ZDE SE POKOUŠÍME PARSOVAT (UŽ POTENCIÁLNĚ "VYČIŠTĚNÝ") STRING

            console.log('--- DEBUG memoryManager: Parsed JSON z analýzy paměti:', memoryToSave);

            // Uložení extrahovaných paměťových "chunků" do databáze
            if (memoryToSave && typeof memoryToSave === 'object' && Object.keys(memoryToSave).length > 0) { // Kontrola, zda je to objekt a není prázdný
                console.log('--- DEBUG memoryManager: Ukládám extrahovanou paměť do DB...');
                for (const key in memoryToSave) {
                    // Ujistíme se, že se jedná o vlastní vlastnost objektu a hodnota není null/undefined
                    if (Object.hasOwnProperty.call(memoryToSave, key) && memoryToSave[key] !== null && memoryToSave[key] !== undefined) {
                        const value = memoryToSave[key];
                        // Uložíme každý klíč/hodnotu jako samostatný paměťový chunk
                        // saveMemoryChunk(channelId, userId, npcId, key, value)
                        // Ukládáme paměť v kontextu kanálu, uživatele a NPC
                        // message.channel.id, message.author.id, npcId jsou k dispozici z argumentů funkce
                        console.log(`--- DEBUG memoryManager: Pokus o uložení paměťového záznamu: Klíč="${key}", Hodnota="${String(value).substring(0, 50)}..."`); // Logujeme jen začátek hodnoty
                        await db.saveMemoryChunk(message.channel.id, message.author.id, npcId, key, String(value)); // Ukládáme paměť! Převedeme hodnotu na STRING pro jistotu
                        console.log(`--- DEBUG memoryManager: Uložen paměťový záznam: Klíč="${key}".`);
                    } else {
                        console.warn(`--- DEBUG memoryManager: Přeskakuji ukládání paměťového záznamu s klíčem "${key}" - hodnota je null/undefined nebo není vlastní vlastností objektu.`);
                    }
                }
                console.log('--- DEBUG memoryManager: Ukládání extrahované paměti dokončeno.');
            } else {
                console.warn('--- DEBUG memoryManager: Analýza paměti vrátila JSON, ale není to objekt nebo je prázdný. Žádná paměť k uložení.');
            }
        } catch (parseError) {
            // *** ZMĚNĚNÉ LOGOVÁNÍ CHYBY PARSOVÁNÍ: ZALOGUJEME I SUROVÝ VÝSLEDEK PRO DEBUGGING ***
            console.error('❌ Chyba při parsování JSON z výsledku analýzy paměti:', parseError);
            console.error('❌ Surový výsledek analýzy, který selhal při parsování:', memoryAnalysisResult); // ZALOGUJEME CELÝ SUROVÝ VÝSLEDEK
            // Logujeme chybu, ale proces pokračuje
        }
    } else {
        console.warn('--- DEBUG memoryManager: AI pro analýzu paměti nevrátila žádný text nebo nevrátila string. Přeskakuji parsování a ukládání paměti.');
        console.log('--- DEBUG memoryManager: Surová data pro analýzu paměti (očekáván string):', memoryAnalysisResult);
    }
    // --- Konec ZÁKLADNÍ IMPLEMENTACE analýzy paměti ---
}

// Exportujeme potřebné funkce a vlastnosti modulu
// <<<<<< ZDE ZAČÍNÁ EXPORT memoryManager.js >>>>>>>>
module.exports = {
    setDiscordClient, // Exportujeme funkci pro nastavení klienta
    loadNpcConfigs,
    getNpcConfigs, // Exportujeme funkci pro získání NPC configs
    loadActiveChannelsFromDb,
    removeChannelFromCache,
    addChannelToCache,
    isBotInitialized, // Exportujeme stav inicializace
    getActiveChannelData, // Exportujeme funkci pro získání dat kanálu
    constructPrompt, // Exportujeme funkci pro sestavení promptu
    analyzeAndSaveMemory, // Exportujeme funkci pro analýzu a ukládání paměti
    activeChannelsCache, // Exportujeme cache s aktivními kanály pro dashboard (pokud ji dashboard potřebuje)
};
// <<<<<< ZDE KONČÍ EXPORT memoryManager.js >>>>>>>>