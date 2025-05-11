// src/db/database.js - Modul pro práci s databází - PŘEPSÁNO PRO MONGODB

// Importujeme oficiální MongoDB ovladač
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); // Přidáno ObjectId pro práci s _id

let client; // Instance MongoDB klienta
let db;     // Objekt databáze po připojení

// === Funkce pro navázání spojení s databází MongoDB ===
async function connect() {
    // Pokud už klient nebo db existuje a klient je připojený, vrátíme existující db instanci
    if (client && client.topology && client.topology.isConnected()) {
         console.log('💾 MongoDB: Klient již připojen.');
         // Zkusíme vrátit existující db instanci, pokud existuje
         if (db) return db;
         // Pokud klient je připojen, ale db instance chybí, zkusíme ji získat znovu
         try {
              // Získá název DB z URI, pokud není explicitně nastaveno v .env jako DB_NAME
              const uri = process.env.MONGODB_URI;
              const dbName = process.env.DB_NAME || new URL(uri).pathname.substring(1);
              db = client.db(dbName);
              console.log(`💾 MongoDB: Znovu získána instance DB "${dbName}".`);
              return db;
         } catch (error) {
              console.error('❌ MongoDB: Chyba při získávání instance DB z existujícího klienta:', error);
              // Zde není vhodné vyhazovat chybu dál, pokud už je klient připojený
              return null; // Vracíme null nebo undefined při chybě
         }
    }

    console.log('💾 MongoDB: Připojuji k databázi...');

    // Získání URI pro připojení z .env
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error('❌ MongoDB: Proměnná prostředí MONGODB_URI není nastavena!');
         // addLogEntry by zde selhala, protože DB ještě není připojená
        throw new Error('MongoDB URI pro připojení není nastaveno v souboru .env.');
    }

    try {
        // Vytvoření nového klienta
        client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true, // Striktní mód, chyby při neznámých opcích
                deprecationErrors: true, // Zobrazovat chyby zastaralých funkcí
            },
            // Další opce pro připojení, pokud jsou potřeba (např. poolSize, connectTimeoutMS)
            // maxPoolSize: 10, // Ekvivalent connectionLimit v MySQL pool
            // serverSelectionTimeoutMS: 5000, // Timeout pro výběr serveru (např. při Atlas clusteru)
            // connectTimeoutMS: 10000, // Timeout pro navázání spojení
        });

        // Navázání spojení
        await client.connect();
        console.log('💾 MongoDB: Klient úspěšně připojen k serveru!');

        // Získání reference na databázi
        // Použijeme název DB z .env (DB_NAME), pokud je nastaven.
        // Jinak zkusíme parsovat název DB z URI (např. mongodb://host:port/my_database -> my_database)
        const dbName = process.env.DB_NAME || new URL(uri).pathname.substring(1);
        if (!dbName) {
             console.error('❌ MongoDB: Název databáze není specifikován v MONGODB_URI ani v DB_NAME v .env!');
             // addLogEntry by zde selhala
             await client.close();
             throw new Error('Název databáze není specifikován pro připojení k MongoDB.');
        }
        db = client.db(dbName);


        console.log(`💾 MongoDB: Připojeno k databázi "${db.databaseName}".`);

        // Zde můžeme případně provést kontrolu a vytvoření potřebných indexů pro kolekce
        // Indexy pomáhají s výkonem dotazů, zejména pro unikátní hodnoty nebo časté filtry/řazení.
        try {
             // Index pro unikátní user_id v kolekci 'users' (user_id je string)
             // OPRAVENO: Přidáno collation, aby se vyřešil konflikt s existujícím indexem
             // Index pro unikátní user_id v kolekci 'users' (user_id je string)
        // Index pro unikátní user_id v kolekci 'users' (user_id je string)
        // OPRAVENO: Použita CELÁ specifikace collation z chybového logu pro shodu s existujícím indexem
    await db.collection('users').createIndex(
            { user_id: 1 },
        {
            unique: true,
            collation: {
                locale: "en",
                caseLevel: false,
                caseFirst: "off",
                strength: 2,
                numericOrdering: false,
                alternate: "non-ignorable",
                maxVariable: "punct",
                normalization: false,
                backwards: false,
                version: "57.1" // Přidání verze z logu pro přesnou shodu
            }
        }
    );
             // Index pro unikátní channel_id v kolekci 'active_channels' (channel_id je string)
             await db.collection('active_channels').createIndex({ channel_id: 1 }, { unique: true });

             // Indexy pro rychlé hledání v message_history (např. podle kanálu, podle času)
             await db.collection('message_history').createIndex({ channel_id: 1, created_at: 1 });
             // Index na Discord message ID pro rychlé nalezení zprávy
              await db.collection('message_history').createIndex({ message_id: 1 }, { unique: true, sparse: true }); // sparse: true zajistí, že se indexují jen dokumenty, které message_id pole mají

             // Indexy pro rychlé hledání v memory (podle kombinace ID, podle klíče, podle času aktualizace)
              // OPRAVENÝ INDEX pro specifickou interakci (všechna 3 ID existují a nejsou null)
              await db.collection('memory').createIndex({ channel_id: 1, user_id: 1, npc_id: 1, memory_key: 1 }, { unique: true, partialFilterExpression: { channel_id: { $exists: true, $ne: null }, user_id: { $exists: true, $ne: null }, npc_id: { $exists: true, $ne: null } } }); // Unikátnost, když pole existují a NEJSOU NULL
              // OPRAVENÝ INDEX pro globální NPC paměť (user_id a channel_id jsou null)
              await db.collection('memory').createIndex({ npc_id: 1, memory_key: 1 }, { unique: true, partialFilterExpression: { user_id: null, channel_id: null } });
              // OPRAVENÝ INDEX pro globální Uživatel paměť (npc_id a channel_id jsou null)
              await db.collection('memory').createIndex({ user_id: 1, memory_key: 1 }, { unique: true, partialFilterExpression: { npc_id: null, channel_id: null } });
               // Volitelný index pro čistě globální paměť (všechna 3 ID jsou null) - zvaž, zda je potřeba unikátnost i zde
               await db.collection('memory').createIndex({ memory_key: 1 }, { unique: true, partialFilterExpression: { channel_id: null, user_id: null, npc_id: null } });

              // Index pro řazení paměti podle aktualizace (sestupně)
              await db.collection('memory').createIndex({ updated_at: -1 });

              // Indexy pro bot_logs
              await db.collection('bot_logs').createIndex({ timestamp: -1 }); // Řazení logů podle času
              await db.collection('bot_logs').createIndex({ level: 1 }); // Filtrování podle úrovně logu
              await db.collection('bot_logs').createIndex({ source: 1 }); // Filtrování podle zdroje logu

              // Indexy pro npcs kolekci (pokud ji budeš mít)
              await db.collection('npcs').createIndex({ id: 1 }, { unique: true }); // Index na ID (string) NPC
              await db.collection('npcs').createIndex({ name: 1 }); // Index na jméno pro hledání/řazení


             console.log('💾 MongoDB: Základní indexy ověřeny/vytvořeny.');

        } catch (indexError) {
             console.error('❌ MongoDB: Chyba při ověřování/vytváření indexů:', indexError);
             // Chyba indexování nemusí být FATAL, bot se může spustit, ale logujeme ji.
             // addLogEntry('ERROR', 'DB:IndexInitialization', `Chyba při vytváření indexů: ${indexError.message}`, null, null, null, indexError.stack); // Příklad - logování do DB logů
        }


        return db; // Vracíme objekt databáze

    } catch (error) {
        console.error('❌ MongoDB: Kritická chyba při připojování k databázi:', error);
        // Zkusíme klienta zavřít, pokud se vytvořil, ale připojení selhalo
        if (client) {
             try { await client.close(); } catch (closeError) { console.error('❌ MongoDB: Chyba při zavírání klienta po chybě připojení:', closeError); }
        }
        client = null; // Resetujeme klienta
        db = null;     // Resetujeme db instanci
        // Zde logování do DB logů selže, protože DB není připojená.
        throw error; // Chybu vyhodíme dál, aby ji zachytil kód v bot.js
    }
}
// === KONEC Funkce: connect ===


// === Funkce pro ukončení spojení s databází MongoDB ===
async function close() {
    if (client) {
        console.log('💾 MongoDB: Zavírám klienta...');
        try {
            await client.close();
            client = null; // Nastavíme na null
            db = null;     // Nastavíme na null
            console.log('💾 MongoDB: Klient úspěšně zavřen.');
        } catch (error) {
            console.error('❌ MongoDB: Chyba při zavírání klienta:', error);
            // Zde logování do DB logů nemusí fungovat, pokud DB není připojená
            throw error; // Chybu vyhodíme dál
        }
    } else {
        console.log('💾 MongoDB: Klient již byl zavřen nebo neexistoval.');
    }
}
// === KONEC Funkce: close ===


// === Funkce pro přidání záznamu do kolekce logů (bot_logs) - PŘEPSÁNO PRO MONGODB ===
// Tato funkce ukládá logy do kolekce 'bot_logs'.
// Měla by být volána z různých míst v aplikaci pro centralizované logování.
async function addLogEntry(level, source, message, userId = null, channelId = null, guildId = null, stackTrace = null) {
    // Základní validace úrovně logu
    const validLevels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
    const logLevel = validLevels.includes(level.toUpperCase()) ? level.toUpperCase() : 'INFO'; // Default INFO

    // Příprava dokumentu pro vložení do kolekce bot_logs
    // MongoDB automaticky přidá _id
    const logDocument = {
        timestamp: new Date(), // Aktuální čas jako BSON Date objekt
        level: logLevel,
        source: source ? String(source) : 'unknown',
        message: message ? String(message) : '',
        user_id: userId ? String(userId) : null, // Uložíme ID jako string nebo null
        channel_id: channelId ? String(channelId) : null,
        guild_id: guildId ? String(guildId) : null,
        stack_trace: stackTrace ? String(stackTrace) : null, // Uložíme stack trace jako text nebo null
        // Můžeš přidat další pole dle potřeby pro lepší filtrování/analýzu logů
        // Např. correlation_id pro propojení souvisejících logů jedné operace
    };

    // Použijeme try/catch pro samotné logování do DB, aby pád logování nezpůsobil pád hlavní logiky.
    try {
        // Musíme zajistit, že DB instance EXISTUJE PŘEDTÍM, než se pokusíme logovat.
        // Při FATAL ERRORech před spojením s DB se logování do DB nezdaří.
        if (!db) {
             console.error('❌ FATAL ERROR (MongoDB Logování): DB instance není inicializována. Log záznam NEBYL uložen do DB konzole!', logDocument);
             // Zde zvážit alternativní logování (soubor, externí služba), pokud je DB nedostupná.
             return; // Ukončíme, pokud DB instance není připravena
        }

        // Získáme kolekci 'bot_logs' a vložíme dokument
        const result = await db.collection('bot_logs').insertOne(logDocument);
        // console.log(`💾 MongoDB: Log záznam uložen (ID: ${result.insertedId}, Level: ${logLevel}, Source: ${source}).`); // Volitelné, pro ladění samotného logování

    } catch (error) {
        // Pokud selže logování do DB (např. problém s kolekcí, právy), zalogujeme chybu v konzoli
        console.error('❌ FATAL ERROR (MongoDB Logování): Nepodařilo se uložit log záznam do databáze MongoDB!', { logDocument, dbError: error });
        // Zde znovu zvážit alternativní logování (soubor, externí služba).
    }
}
// === KONEC Funkce: addLogEntry (PŘEPSÁNO PRO MONGODB) ===


// <<< ZDE JSOU FUNKCE PŘEPSANÉ PRO MONGODB A ODOKOMENTOVANÉ >>>
// Včetně těch pro dashboard.

// === Funkce pro načítání všech aktivních kanálů - PŘEPSÁNO PRO MONGODB ===
async function loadActiveChannels() {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log('💾 MongoDB: Načítám seznam aktivních kanálů...');
    try {
         const activeChannelsCollection = db.collection('active_channels');
         // Najdi všechny dokumenty v kolekci active_channels a převed na pole
         const activeChannels = await activeChannelsCollection.find({}).toArray();
         console.log(`💾 MongoDB: Načteno ${activeChannels.length} aktivních kanálů.`);
         // Vrátí pole dokumentů { _id, guild_id, channel_id, npc_id, ... }
         // messageHandler očekává pole objektů s klíči guild_id, channel_id, npc_id. Musíme transformovat.
         return activeChannels.map(doc => ({ guild_id: doc.guild_id, channel_id: doc.channel_id, npc_id: doc.npc_id })); // TRANSFORMACE PRO messageHandler
    } catch (error) {
         console.error('❌ MongoDB: Chyba při načítání aktivních kanálů:', error);
         addLogEntry('ERROR', 'DB:loadActiveChannels', `Chyba při načítání aktivních kanálů: ${error.message}`, null, null, null, error.stack);
         throw error;
    }
}


// === Funkce pro přidání aktivního kanálu - PŘEPSÁNO PRO MONGODB ===
async function addActiveChannel(guildId, channelId, npcId = null) { // npcId může být null
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log(`💾 MongoDB: Přidávám aktivní kanál ${channelId} pro guild ${guildId} s NPC ${npcId || 'null'}...`);
    try {
        const activeChannelsCollection = db.collection('active_channels');
        // Použijeme updateOne s upsert: true pro přidání nebo aktualizaci podle channel_id
        const filter = { channel_id: channelId };
        const updateDocument = {
             $set: { // Nastavíme nebo aktualizujeme tato pole
                 guild_id: guildId,
                 npc_id: npcId,
                 updated_at: new Date(), // Čas aktualizace
             },
             $setOnInsert: { // Nastaví se pouze při vložení (upsert: true)
                  created_at: new Date(), // Čas vytvoření
             }
        };
        const options = { upsert: true }; // Vloží nový dokument, pokud nenalezen

        const result = await activeChannelsCollection.updateOne(filter, updateDocument, options);

        if (result.upsertedCount > 0) {
            console.log(`💾 MongoDB: Aktivní kanál ${channelId} vložen (ID dokumentu: ${result.upsertedId}).`);
            return true; // Vloženo
        } else if (result.modifiedCount > 0 || result.matchedCount > 0) {
             console.log(`💾 MongoDB: Aktivní kanál ${channelId} aktualizován nebo nalezen.`);
             return true; // Aktualizováno nebo nalezen bez změny
        } else {
             console.warn(`💾 MongoDB: Operace na aktivním kanálu ${channelId} neměla vliv.`);
             addLogEntry('WARN', 'DB:addActiveChannel', `Operace na aktivním kanálu ${channelId} neměla vliv.`, null, channelId, guildId, null);
             return false; // Nic se nezměnilo (možná už byl v DB s totožnými daty)
        }

    } catch (error) {
        // Zde MongoDB ovladač obvykle neháže specifické kódy chyb jako ER_DUP_ENTRY,
        // ale updateOne s upsert: true se postará o duplicity na unikátním indexu
        console.error(`❌ MongoDB: Chyba při přidávání/aktualizaci aktivního kanálu ${channelId}:`, error);
        addLogEntry('ERROR', 'DB:addActiveChannel', `Chyba při přidávání/aktualizaci aktivního kanálu: ${error.message}`, null, channelId, guildId, error.stack);
        throw error;
    }
}


// === Funkce pro odebrání aktivního kanálu - PŘEPSÁNO PRO MONGODB ===
async function removeActiveChannel(channelId) {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log(`💾 MongoDB: Odstraňuji aktivní kanál ${channelId}...`);
    try {
        const activeChannelsCollection = db.collection('active_channels');
        // Smažeme jeden dokument podle channel_id
        const result = await activeChannelsCollection.deleteOne({ channel_id: channelId });

        if (result.deletedCount > 0) {
            console.log(`💾 MongoDB: Aktivní kanál ${channelId} úspěšně odstraněn.`);
            return true; // Smazáno
        } else {
            console.log(`💾 MongoDB: Aktivní kanál ${channelId} nenalezen pro odstranění.`);
            return false; // Nenalezeno
        }
    } catch (error) {
        console.error(`❌ MongoDB: Chyba při odstraňování aktivního kanálu ${channelId}:`, error);
        addLogEntry('ERROR', 'DB:removeActiveChannel', `Chyba při odstraňování aktivního kanálu: ${error.message}`, null, channelId, null, error.stack);
        throw error;
    }
}


// === Funkce pro nalezení nebo vytvoření uživatele - PŘEPSÁNO PRO MONGODB ===
async function findOrCreateUser(userData) { // userData = { id: '...', username: '...' }
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    // console.log(`💾 MongoDB: Hledám nebo vytvářím uživatele s ID ${userData.id}...`); // Příliš časté logování
    try {
        const usersCollection = db.collection('users');
        // Najdeme dokument podle user_id
        const existingUser = await usersCollection.findOne({ user_id: userData.id }); // Hledáme podle user_id

        if (existingUser) {
            // Uživatel nalezen, můžeme případně aktualizovat username, pokud se změnil
             if (existingUser.username !== userData.username) {
                 await usersCollection.updateOne(
                      { user_id: userData.id },
                      { $set: { username: userData.username, updated_at: new Date() } } // Aktualizujeme username a čas
                 );
                 console.log(`💾 MongoDB: Uživatel ${userData.username} (${userData.id}) aktualizován.`);
             } else {
                 // console.log(`💾 MongoDB: Uživatel ${userData.username} (${userData.id}) nalezen.`);
             }
            // Vrátíme zjednodušenou strukturu, kterou volající kód (findOrCreateUser v messageHandleru) očekává
            return { id: existingUser.user_id, username: existingUser.username };
        } else {
            // Uživatel nenalezen, vkládáme nový dokument
            console.log(`💾 MongoDB: Uživatel s ID ${userData.id} nenalezen, vytvářím nového "${userData.username}"...`);
            const newUserDocument = {
                user_id: userData.id, // Discord ID uživatele (uložíme jako string)
                username: userData.username, // Uživatelské jméno na Discordu
                created_at: new Date(), // Čas vytvoření dokumentu
                updated_at: new Date(), // Čas vytvoření/aktualizace
                // Další pole o uživateli, pokud je budeš potřebovat (např. settings: {})
            };
            const result = await usersCollection.insertOne(newUserDocument);
            console.log(`💾 MongoDB: Uživatel ${newUserDocument.username} (${newUserDocument.user_id}) vytvořen s ID dokumentu: ${result.insertedId}.`);
            // Vrátíme zjednodušenou strukturu nově vytvořeného uživatele, kterou volající očekává
            return { id: newUserDocument.user_id, username: newUserDocument.username };
        }
    } catch (error) {
        console.error(`❌ MongoDB: Chyba při hledání/vytváření uživatele ${userData.id}:`, error);
        addLogEntry('ERROR', 'DB:findOrCreateUser', `Chyba při hledání/vytváření uživatele: ${error.message}`, userData.id, null, null, error.stack);
        throw error; // Vyvolá chybu dál
    }
}


// === Funkce pro ukládání zprávy uživatele nebo bota do historie - PŘEPSÁNO PRO MONGODB ===
async function saveMessageHistory(messageData) { // messageData = { channel_id, user_id, npc_id, content, is_bot, guild_id, id (Discord message ID) }
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
      console.log(`💾 MongoDB: Ukládám zprávu do historie (kanál: ${messageData.channel_id}, user: ${messageData.user_id || 'null'}, npc: ${messageData.npc_id || 'null'}, is_bot: ${messageData.is_bot})...`);
     try {
         const historyCollection = db.collection('message_history');
         const messageDocument = {
             // Uložíme Discord ID zprávy pro případnou pozdější referenci/úpravu
             message_id: messageData.id, // Discord Message ID (string)
             channel_id: messageData.channel_id, // Discord Channel ID (string)
             guild_id: messageData.guild_id || null, // Discord Guild ID (string nebo null)
             user_id: messageData.user_id ? String(messageData.user_id) : null, // Discord User ID (string nebo null)
             npc_id: messageData.npc_id ? String(messageData.npc_id) : null,  // NPC ID (string nebo null)
             content: messageData.content,
             is_bot: messageData.is_bot || false,
             created_at: new Date(), // Čas vytvoření
             // Můžeš přidat další metadata, např. embeds, attachments, atd.
         };
         const result = await historyCollection.insertOne(messageDocument);
          // console.log(`💾 MongoDB: Zpráva uložena do historie s ID dokumentu: ${result.insertedId}`); // Příliš časté logování
         return result.insertedId; // MongoDB insertOne vrací objekt s insertedId (_id nového dokumentu)
     } catch (error) {
         console.error('❌ MongoDB: Chyba při ukládání zprávy do historie:', error);
         // Logujeme chybu, ale pád ukládání historie by neměl shodit bota
         addLogEntry('ERROR', 'DB:saveMessageHistory', `Chyba při ukládání zprávy do historie: ${error.message}`, messageData.user_id, messageData.channel_id, messageData.guild_id, error.stack);
         // throw error; // Obvykle se u ukládání historie nehodí vyhazovat chybu dál
     }
}

// === Funkce pro ukládání paměťového "chunku" (z AI analýzy) - PŘEPSÁNO PRO MONGODB ===
async function saveMemoryChunk(channelId, userId, npcId, key, value) {
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
     console.log(`💾 MongoDB: Ukládám/aktualizuji paměťový záznam: Kanál=${channelId || 'null'}, Uživatel=${userId || 'null'}, NPC=${npcId || 'null'}, Klíč="${key}"`);
     try {
         const memoryCollection = db.collection('memory');
         const filter = {
             channel_id: channelId || null, // Bude filtrovat na null, pokud je channelId null
             user_id: userId || null,       // Bude filtrovat na null, pokud je userId null
             npc_id: npcId || null,         // Bude filtrovat na null, pokud je npcId null
             memory_key: key,
         };
         const updateDocument = {
             // Použijeme $set pro nastavení hodnoty a aktualizovaného času
             $set: {
                 memory_value: value,
                 updated_at: new Date(), // Aktualizujeme čas při každé změně/vložení přes upsert
             },
             // Použijeme $setOnInsert pro nastavení času vytvoření pouze při vložení nového dokumentu
             $setOnInsert: {
                 created_at: new Date(),
             },
         };
         const options = { upsert: true }; // Pokud dokument s filtrem neexistuje, vloží se nový

         const result = await memoryCollection.updateOne(filter, updateDocument, options);

         // Kontrola výsledku operace
         if (result.upsertedCount > 0) {
             console.log(`💾 MongoDB: Nový paměťový záznam pro klíč "${key}" vložen (ID dokumentu: ${result.upsertedId}).`);
         } else if (result.modifiedCount > 0) {
             console.log(`💾 MongoDB: Paměťový záznam pro klíč "${key}" aktualizován.`);
         } else if (result.matchedCount > 0) {
             // console.log(`💾 MongoDB: Paměťový záznam pro klíč "${key}" nalezen, žádná změna dat.`); // Volitelné, pro debug
         } else {
             console.warn(`💾 MongoDB: Operace na paměťovém záznamu pro klíč "${key}" neměla vliv (nenalezen ani vložen).`);
             addLogEntry('WARN', 'DB:saveMemoryChunk', `Operace na paměti "${key}" neměla vliv.`, userId, channelId, null, null);
         }


         // Vrací true pro úspěch, nebo ID vloženého dokumentu, pokud bylo vloženo
         return result.upsertedId || (result.modifiedCount > 0);

     } catch (error) {
         console.error(`❌ MongoDB: Chyba při ukládání/aktualizaci paměťového záznamu (Klíč: "${key}"):`, error);
         addLogEntry('ERROR', 'DB:saveMemoryChunk', `Chyba při ukládání/aktualizaci paměti: ${error.message}`, userId, channelId, null, error.stack);
         throw error;
     }
}


// === Funkce pro načítání historie zpráv (pro kontext AI a dashboard) - PŘEPSÁNO PRO MONGODB ===
async function loadMessageHistory(channelId, limit = 25) { // Limit nastaven na 15 pro AI kontext
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
      console.log(`💾 MongoDB: Načítám historii zpráv pro kanál ${channelId} (limit ${limit})...`);
     try {
          const historyCollection = db.collection('message_history');
          // Najdeme dokumenty s daným channel_id, seřadíme sestupně podle času vytvoření, omezíme limitem a převedeme na pole
          // Pro kontext AI je obvykle lepší mít nejstarší zprávu první.
          const history = await historyCollection.find(
               { channel_id: channelId }, // Filtr podle ID kanálu
               { sort: { created_at: -1 }, limit: limit } // Opce: řazení (sestupně pro nejnovější), limit
          ).toArray(); // Převedeme výsledek na pole

          // Zprávy jsou teď od nejnovější k nejstarší (díky sort: -1).
          // Pro AI kontext a obvykle i zobrazení historie je lepší mít nejstarší zprávu první.
          history.reverse(); // Obrátíme pole

          console.log(`💾 MongoDB: Načteno ${history.length} záznamů historie zpráv pro kanál ${channelId}.`);

          // MongoDB dokumenty obsahují _id, channel_id, user_id, npc_id, content, is_bot, created_at atd.
          // Pro dashboard zobrazení a případně i pro AI kontext s jmény,
          // bude potřeba získat username a npc_name. To lze udělat:
          // 1. Uložením jmen přímo do dokumentu historie (není ideální).
          // 2. Načtením jmen uživatelů a NPC zvlášť a jejich přidáním ke zprávám (requiruje fetch z users/npcs kolekcí).
          // 3. Použitím aggregation pipeline (pokročilé).
          // Prozatím vracíme čisté dokumenty. Volající kód (messageHandler, dashboard server) si musí jména získat sám.

          return history; // Vrací pole dokumentů z historie
     } catch (error) {
          console.error(`❌ MongoDB: Chyba při načítání historie zpráv pro kanál ${channelId}:`, error);
          addLogEntry('ERROR', 'DB:loadMessageHistory', `Chyba při načítání historie zpráv: ${error.message}`, null, channelId, null, error.stack);
          throw error;
     }
}


// === Funkce pro načítání paměťových "chunků" pro kontext AI - PŘEPSÁNO PRO MONGODB ===
async function loadMemoryChunks(channelId = null, userId = null, npcId = null) {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log(`💾 MongoDB: Načítám paměťové záznamy pro kontext (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'})...`);
    try {
        const memoryCollection = db.collection('memory');

        // MongoDB filtr pro nalezení relevantních paměťových chunků pro kontext AI
        // Hledáme záznamy, které odpovídají jedné z relevantních kombinací ID (včetně null)
        const filter = {
             $or: [
                 // 1. Paměť specifická pro interakci v kanálu (všechny 3 ID MUSÍ sedět - i null)
                 { channel_id: channelId, user_id: userId, npc_id: npcId },
                 // 2. Globální paměť uživatele (USER musí sedět - i null, channel a npc MUSÍ být null)
                 { user_id: userId, channel_id: null, npc_id: null },
                 // 3. Globální paměť NPC (NPC musí sedět - i null, channel a user MUSÍ být null)
                 { npc_id: npcId, channel_id: null, user_id: null },
                 // ZDE JE DŮLEŽITÉ PŘIDAT DALŠÍ RELEVANTNÍ KOMBINACE PRO AI KONTEXT
                 // Např. paměť uživatele v JAKÉMKOLI kanálu s TÍMTO NPC:
                  { user_id: userId, npc_id: npcId, channel_id: { $ne: null } }, // User + NPC + non-null channel
                 // Např. paměť uživatele v JAKÉMKOLI kanálu (bez ohledu na NPC):
                  { user_id: userId, channel_id: { $ne: null }, npc_id: null }, // User + non-null channel + null npc
                 // ATD. - Závisí na tom, jakou paměť AI pro kontext potřebuje.
                 // Tuto sadu podmínek filtrujeme, aby neobsahovala kombinace, kde vstupní ID je undefined.
             ].filter(condition => {
                 // Odfiltrujeme podmínky, pokud nějaký klíč v podmínce má hodnotu 'undefined'.
                 // To se může stát, pokud volající kód pošle undefined místo null pro ID.
                 // Using `hasOwnProperty` and checking against `undefined` is one way.
                 return Object.keys(condition).every(key => condition[key] !== undefined);
             })
        };

        // Pokud po filtrování $or pole podmínek je prázdné, znamená to, že nebyly zadány smysluplné parametry
        if (filter.$or.length === 0) {
            console.warn("💾 MongoDB: loadMemoryChunks volána bez smysluplných filtrů. Vracím prázdné pole.");
            return []; // Vracíme prázdné pole
        }


        // Můžeš přidat řazení a limit, pokud chceš omezit načítání paměti pro kontext (např. podle updated_at DESC LIMIT 20 pro nejnovější)
        const options = { sort: { updated_at: -1 }, limit: 20 }; // Příklad opcí pro řazení (nejnovější paměť první) a limit

        const memory = await memoryCollection.find(filter, options).toArray(); // Najdi dokumenty a převed je na pole

        console.log(`💾 MongoDB: Načteno ${memory.length} paměťových záznamů pro kontext.`);

        // Vrátíme pole dokumentů z paměti. Volající kód (memoryManager) si data transformuje, jak potřebuje.
        // Dokumenty obsahují { _id, channel_id, user_id, npc_id, memory_key, memory_value, created_at, updated_at }
        return memory;

    } catch (error) {
        console.error(`❌ MongoDB: Chyba při načítání paměťových záznamů pro kontext (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'}):`, error);
        addLogEntry('ERROR', 'DB:loadMemoryChunks', `Chyba při načítání paměti pro kontext: ${error.message}`, userId, channelId, null, error.stack);
        throw error;
    }
}


// === Funkce pro synchronizaci NPC konfigurací s databázi - PŘEPSÁNO PRO MONGODB ===
async function syncNpcConfigs(npcConfigs) { // npcConfigs = { 'npcId': { name: '...', basePrompt: '...', description: '...' }, ... }
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log('💾 MongoDB: Spouštím synchronizaci NPC konfigurací...');
    if (!npcConfigs || Object.keys(npcConfigs).length === 0) {
        console.warn('💾 MongoDB: Žádné NPC konfigurace k synchronizaci.');
        return;
    }
    try {
        const npcsCollection = db.collection('npcs');

        for (const npcId in npcConfigs) {
            if (Object.hasOwnProperty.call(npcConfigs, npcId)) {
                const npc = npcConfigs[npcId];
                 // Ověření potřebných vlastností NPC objektu
                 if (!npc || typeof npc.name !== 'string' || typeof npc.basePrompt !== 'string' || typeof npc.description !== 'string') {
                     console.warn(`💾 MongoDB: Přeskakuji synchronizaci NPC s ID ${npcId} - chybí nebo mají nesprávný typ potřebné vlastnosti (name, basePrompt, description).`, npc);
                     addLogEntry('WARN', 'DB:syncNpcConfigs', `Přeskočena synchronizace NPC ${npcId} - chybí/špatný typ vlastností.`, null, null, null, null);
                     continue;
                 }

                console.log(`💾 MongoDB: Synchronizuji NPC ${npcId} (${npc.name})...`);

                // Filtr pro nalezení NPC podle jeho ID
                const filter = { id: npcId }; // Používáme pole 'id' v dokumentu, které odpovídá klíči v npcConfigs (string)

                // Dokument s daty NPC, které chceme nastavit nebo aktualizovat
                 // Použijeme updateOne s opcí upsert: true
                 // $set: nastaví všechna pole, která se mohou měnit
                 // $setOnInsert: nastaví pole pouze při prvním vložení (id a created_at)
                const updateDoc = {
                    $set: {
                        name: npc.name,
                        basePrompt: npc.basePrompt,
                        description: npc.description,
                        updated_at: new Date(), // Aktualizujeme čas při každé změně/vložení
                        // Přidej zde další pole, která chceš aktualizovat
                         // napr. avatar_url: npc.avatar_url || null,
                         // napr. settings: npc.settings || {} // Vloží objekt nastavení
                    },
                     $setOnInsert: {
                           id: npcId, // Nastaví ID pouze při vložení nového dokumentu
                           created_at: new Date(), // Nastaví čas vytvoření pouze při vložení
                      }
                 };

                const options = { upsert: true }; // Vložit nový dokument, pokud nenalezen

                const result = await npcsCollection.updateOne(filter, updateDoc, options);


                // Volitelné logování výsledku updateOne
                 if (result.upsertedCount > 0) {
                     console.log(`💾 MongoDB: NPC ${npcId} vložen (ID dokumentu: ${result.upsertedId}).`);
                 } else if (result.modifiedCount > 0) {
                     console.log(`💾 MongoDB: NPC ${npcId} aktualizován.`);
                 } else if (result.matchedCount > 0) {
                     // console.log(`💾 MongoDB: NPC ${npcId} nalezen, žádná změna dat.`); // Volitelné, pokud nechceš logovat pro nemodifikované
                 } else {
                      // Tento případ by neměl nastat s upsert: true, ledaže by došlo k chybě nebo by filtr neseděl
                      console.warn(`💾 MongoDB: Operace updateOne na NPC ${npcId} neměla vliv.`);
                       addLogEntry('WARN', 'DB:syncNpcConfigs', `Operace updateOne na NPC ${npcId} neměla vliv.`, null, null, null, null);
                 }

            } // Konec if (Object.hasOwnProperty.call...)
        } // Konec for loop

         // Volitelně: Smazat NPC z DB, které už nejsou v npcConfigs souboru
         // Toto by vyžadovalo načíst všechna NPC z DB, porovnat s npcConfigs klíči a smazat ty, které chybí.
         // const existingNpcIdsInDb = (await npcsCollection.find({}, { projection: { id: 1 } }).toArray()).map(doc => doc.id);
         // const npcIdsInConfigs = Object.keys(npcConfigs);
         // const npcIdsToRemove = existingNpcIdsInDb.filter(dbId => !npcIdsInConfigs.includes(dbId));
         // if (npcIdsToRemove.length > 0) {
         //      console.log(`💾 MongoDB: Mažu ${npcIdsToRemove.length} NPC, které již nejsou v konfiguraci: ${npcIdsToRemove.join(', ')}.`);
         //      await npcsCollection.deleteMany({ id: { $in: npcIdsToRemove } });
         // }


        console.log(`💾 MongoDB: Synchronizace NPC konfigurací dokončena. Zpracováno ${Object.keys(npcConfigs).length} NPC.`);

    } catch (error) {
        console.error('❌ MongoDB: Chyba během synchronizace NPC konfigurací:', error);
        addLogEntry('ERROR', 'DB:syncNpcConfigs', `Chyba při synchronizaci NPC konfigurací: ${error.message}`, null, null, null, error.stack);
        throw error; // Vyvolá chybu dál
    }
}


// <<< ZDE JSOU FUNKCE PRO DASHBOARD, KTERÉ PŘEPÍŠEME A ODOKOMENTUJEME >>>
// Jsou nyní přepsané a odkomentované.

// === Funkce pro získání celkového počtu uživatelů z DB (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
// Tato funkce je stejná jako getUniqueUserCount a může ji nahradit, nebo getUniqueUserCount volat tuto.
// Použijeme tuto nově přepsanou a upravíme export.
async function getUserCount() {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log('💾 MongoDB: Získávám celkový počet uživatelů...');
    try {
        // Počítáme počet dokumentů v kolekci 'users'
        const userCount = await db.collection('users').countDocuments({}); // {} znamená bez filtru, počítat vše
        console.log(`💾 MongoDB: Celkový počet uživatelů: ${userCount}.`);
        return userCount;
    } catch (error) {
        console.error('❌ MongoDB: Chyba při získávání celkového počtu uživatelů:', error);
        addLogEntry('ERROR', 'DB:getUserCount', `Chyba při získávání celkového počtu uživatelů: ${error.message}`, null, null, null, error.stack);
        throw error;
    }
}


// === Funkce pro získání VŠECH uživatelů (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
async function getAllUsers() {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log('💾 MongoDB: Získávám všechny uživatele...');
    try {
        // Najdeme všechny dokumenty v kolekci 'users', můžeme řadit
        // Zde předpokládáme, že user_id je string
        const users = await db.collection('users').find({}, { sort: { username: 1 } }).toArray(); // {} = bez filtru, řazení dle username
        console.log(`💾 MongoDB: Načteno ${users.length} uživatelů.`);
        // Vrátí pole dokumentů { _id, user_id, username, created_at, ... }
        // Dashboard frontend očekává pole objektů s klíči 'id' a 'username'. Musíme transformovat.
         return users.map(user => ({ id: user.user_id, username: user.username })); // TRANSFORMACE PRO DASHBOARD
    } catch (error) {
        console.error('❌ MongoDB: Chyba při získávání všech uživatelů:', error);
        addLogEntry('ERROR', 'DB:getAllUsers', `Chyba při získávání všech uživatelů: ${error.message}`, null, null, null, error.stack);
        throw error;
    }
}


// === Funkce pro získání seznamu všech NPC (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
// Funkce getAllNpcs je implementována pro export, dashboard ji může použít.
// Je možné, že ji dashboard potřebuje v jiné formě, ale prozatím použijeme tu stávající.
// Pokud dashboard potřebuje kompletní NPC objekty, vrátí je současná implementace getAllNpcs.
// Pokud potřebuje jen { id, name }, bude nutná transformace na straně dashboard serveru nebo v této funkci.
// Prozatím vracíme kompletní dokumenty z DB.

// === Funkce pro získání paměti pro konkrétní subjekt (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
async function getMemoryForSubject(channelId = null, userId = null, npcId = null) {
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
     console.log(`💾 MongoDB: Získávám paměť pro subjekt (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'})...`);
     try {
          const memoryCollection = db.collection('memory');

          // MongoDB filtr pro nalezení paměti pro konkrétní subjekt v dashboardu
          // Zde filtrujeme přesně na zadané hodnoty ID, včetně null.
          const filter = {
               channel_id: channelId, // Může být null
               user_id: userId,     // Může být null
               npc_id: npcId,       // Může být null
          };

          // Odfiltrujeme klíče z filtru, pokud je jejich hodnota undefined (nemělo by se stávat, když používáme || null)
          // const cleanedFilter = Object.fromEntries(Object.entries(filter).filter(([key, value]) => value !== undefined));

          // Přidáme řazení pro konzistentní zobrazení paměti v dashboardu
          const options = { sort: { memory_key: 1 } }; // Řazení podle klíče paměti

          const memoryData = await memoryCollection.find(filter, options).toArray(); // Najdi dokumenty a převed je na pole

          console.log(`💾 MongoDB: Načteno ${memoryData.length} paměťových záznamů pro subjekt.`);

          // Dashboard frontend očekává pole objektů s klíči 'memory_key' a 'memory_value'. Musíme transformovat.
          return memoryData.map(record => ({ memory_key: record.memory_key, memory_value: record.memory_value })); // TRANSFORMACE PRO DASHBOARD

     } catch (error) {
          console.error(`❌ MongoDB: Chyba při získávání paměťových záznamů pro subjekt (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'}):`, error);
          addLogEntry('ERROR', 'DB:getMemoryForSubject', `Chyba při získávání paměti pro subjekt: ${error.message}`, userId, channelId, null, error.stack);
          throw error;
     }
}


// === Funkce pro přidání JEDNOTLIVÉHO paměťového chunku (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
async function addMemoryChunk(channelId, userId, npcId, key, value) {
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
      console.log(`💾 MongoDB: Přidávám paměťový chunk dashboardem (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'}, Klíč: "${key}")...`);
     try {
          const memoryCollection = db.collection('memory');
          // Dashboard funkce pro přidání by měla pravděpodobně také umět aktualizovat,
          // pokud záznam s danými ID a klíčem již existuje. Použijeme tedy updateOne s upsert: true,
          // podobně jako saveMemoryChunk. Toto zamezí chybě duplicitního klíče.
           const filter = {
               channel_id: channelId || null,
               user_id: userId || null,
               npc_id: npcId || null,
               memory_key: key,
           };
           const updateDocument = {
               $set: {
                   memory_value: value,
                   updated_at: new Date(), // Aktualizujeme čas
               },
               $setOnInsert: {
                   created_at: new Date(), // Nastaví čas vytvoření jen při vložení
               },
           };
           const options = { upsert: true };

           const result = await memoryCollection.updateOne(filter, updateDocument, options);


          // Kontrola výsledku operace
           if (result.upsertedCount > 0) {
               console.log(`💾 MongoDB: Nový paměťový záznam pro klíč "${key}" vložen dashboardem (ID dokumentu: ${result.upsertedId}).`);
               // Vracíme ID nově vloženého dokumentu nebo true/false dle potřeby dashboardu
               // Pokud dashboard očekává ID nově vytvořeného záznamu, vrátíme result.upsertedId
               // Pokud dashboard očekává jen boolean, vrátíme true
               return result.upsertedId ? result.upsertedId : true; // Zkusíme vrátit ID, pokud vloženo, jinak true
           } else if (result.modifiedCount > 0) {
               console.log(`💾 MongoDB: Paměťový záznam pro klíč "${key}" aktualizován dashboardem.`);
                return true; // Vracíme true pro úspěšnou aktualizaci
           } else if (result.matchedCount > 0) {
                console.warn(`💾 MongoDB: Paměťový záznam pro klíč "${key}" nalezen dashboardem, ale hodnota se nezměnila.`);
                 addLogEntry('WARN', 'DB:addMemoryChunk', `Paměť "${key}" nalezena, žádná změna dat.`, userId, channelId, null, null);
                return true; // Nalezen bez změny dat
           } else {
               console.warn(`💾 MongoDB: Operace updateOne dashboardem na paměti "${key}" neměla vliv.`);
                addLogEntry('WARN', 'DB:addMemoryChunk', `Operace updateOne na paměti "${key}" neměla vliv.`, userId, channelId, null, null);
               return false; // Nic se nezměnilo
           }


      } catch (error) {
           console.error(`❌ MongoDB: Chyba při přidávání/aktualizaci paměťového chunku dashboardem pro klíč "${key}":`, error);
           addLogEntry('ERROR', 'DB:addMemoryChunk', `Chyba při přidávání/aktualizaci paměti dashboardem: ${error.message}`, userId, channelId, null, error.stack);
           throw error; // Vyhodí chybu
      }
}

// === Funkce pro smazání paměťového chunku (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
async function deleteMemoryChunk(channelId = null, userId = null, npcId = null, key) {
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
     console.log(`💾 MongoDB: Mažu paměťový chunk dashboardem (Kanál: ${channelId || 'null'}, Uživatel: ${userId || 'null'}, NPC: ${npcId || 'null'}, Klíč: "${key}")...`);
     try {
          const memoryCollection = db.collection('memory');
          // Filtr pro nalezení dokumentu k smazání podle kombinace ID a klíče
          const filter = {
               channel_id: channelId || null,
               user_id: userId || null,
               npc_id: npcId || null,
               memory_key: key,
          };

          const result = await memoryCollection.deleteOne(filter); // Smaže první nalezený dokument

          if (result.deletedCount > 0) {
              console.log(`💾 MongoDB: Smazán ${result.deletedCount} paměťový záznam pro klíč "${key}" dashboardem.`);
              return true; // Smazáno (vícenásobné smazání by použilo deleteMany)
          } else {
              console.log(`💾 MongoDB: Paměťový záznam pro klíč "${key}" nenalezen pro smazání dashboardem.`);
              return false; // Nenalezeno
          }

     } catch (error) {
          console.error(`❌ MongoDB: Chyba při mazání paměťového chunku dashboardem pro klíč "${key}":`, error);
          addLogEntry('ERROR', 'DB:deleteMemoryChunk', `Chyba při mazání paměťového chunku dashboardem: ${error.message}`, userId, channelId, null, error.stack);
          throw error;
     }
}


// === Funkce pro získání celkového počtu uživatelů z DB (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
// Tato funkce je stejná jako getUniqueUserCount a může ji nahradit, nebo getUniqueUserCount volat tuto.
// Použijeme tuto nově přepsanou a upravíme export.
// Ponecháme ji zde s názvem getUserCount.
async function getUserCount() {
    if (!db) throw new Error('MongoDB DB instance není inicializována.');
    console.log('💾 MongoDB: Získávám celkový počet uživatelů...');
    try {
        // Počítáme počet dokumentů v kolekci 'users'
        const userCount = await db.collection('users').countDocuments({}); // {} znamená bez filtru, počítat vše
        console.log(`💾 MongoDB: Celkový počet uživatelů: ${userCount}.`);
        return userCount;
    } catch (error) {
        console.error('❌ MongoDB: Chyba při získávání celkového počtu uživatelů:', error);
        addLogEntry('ERROR', 'DB:getUserCount', `Chyba při získávání celkového počtu uživatelů: ${error.message}`, null, null, null, error.stack);
        throw error;
    }
}

// === Funkce pro získání seznamu všech NPC (pro dashboard API) - PŘEPSÁNO PRO MONGODB ===
async function getAllNpcs() {
     if (!db) throw new Error('MongoDB DB instance není inicializována.');
     console.log('💾 MongoDB: Získávám všechny NPC pro dashboard...');
     try {
         // Předpokládáme kolekci 'npcs'. NPC by měly mít pole 'id' (Discord ID nebo vlastní) a 'name'.
         const npcs = await db.collection('npcs').find({}, { sort: { name: 1 } }).toArray(); // {} = bez filtru, řazení dle jména
         console.log(`💾 MongoDB: Načteno ${npcs.length} NPC pro dashboard.`);
          // Dashboard frontend očekává pole objektů s klíči 'id' a 'name' pro zobrazení v seznamu NPC.
          // Vrátíme zjednodušenou strukturu. Pokud dashboard potřebuje více dat, upravíme tuto funkci nebo dashboard frontend.
          return npcs.map(npc => ({ id: npc.id, name: npc.name, basePrompt: npc.basePrompt, description: npc.description })); // TRANSFORMACE PRO DASHBOARD (přidáme i prompt/description pro detailnější zobrazení)
     } catch (error) {
         console.error('❌ MongoDB: Chyba při získávání všech NPC pro dashboard:', error);
         addLogEntry('ERROR', 'DB:getAllNpcs', `Chyba při získávání všech NPC pro dashboard: ${error.message}`, null, null, null, error.stack);
         throw error;
     }
}


// <<<<<< ZDE ZAČÍNÁ EXPORT FUNKCÍ database.js >>>>>>>>
// Exportujeme všechny přepsané funkce.
module.exports = {
    connect, // Funkce pro připojení (MongoDB)
    close,    // Funkce pro ukončení spojení (MongoDB)
    addLogEntry, // Logování do DB (PŘEPSÁNO)

    // Přepsané funkce pro základní funkčnost bota
    loadActiveChannels, // PŘEPSÁNO
    addActiveChannel,   // PŘEPSÁNO
    removeActiveChannel,// PŘEPSÁNO
    findOrCreateUser,   // PŘEPSÁNO
    saveMessageHistory, // PŘEPSÁNO
    saveMemoryChunk,    // PŘEPSÁNO
    loadMessageHistory, // PŘEPSÁNO
    loadMemoryChunks,   // PŘEPSÁNO
    syncNpcConfigs,     // PŘEPSÁNO

    // Přepsané funkce pro dashboard (nyní odkomentované a exportované)
    getUserCount, // PŘEPSÁNO
    getAllUsers, // PŘEPSÁNO
    getAllNpcs, // PŘEPSÁNO
    getMemoryForSubject, // PŘEPSÁNO
    addMemoryChunk, // PŘEPSÁNO
    deleteMemoryChunk, // PŘEPSÁNO

    // Alias pro kompatibilitu s dashboard serverem, pokud očekává getUniqueUserCount
    getUniqueUserCount: getUserCount, // Dashboard server v server.js pravděpodobně volá tuto funkci

};

// <<< ZDE BY NEMĚL BÝT ŽÁDNÝ KÓD, KTERÝ SE SPUSTÍ PŘI NAČTENÍ SOUBORU A VOLÁ FUNKCE EXPORTOVANÉ VÝŠE! >>>