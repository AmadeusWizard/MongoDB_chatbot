// src/bot.js - Čistý kód pro v0.16 architekturu s integrací modulů

require('dotenv').config();

// Import potřebných tříd a modulů z discord.js a dalších souborů projektu
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
// Pokud máš config.js v ../config/config.js a používáš ho, můžeš ho importovat zde.
const config = require('../config/config'); // Příklad importu config souboru

const path = require('path');
const fs = require('fs');

const registerCommands = require('../bot_utilities/registerCommands'); // Příklad importu utility

// Import vlastních modulů pro databázi, zpracování zpráv, správu paměti a dashboard server
const db = require('./db/database'); // Modul pro práci s databází - Cesta by měla být správná
const messageHandler = require('./features/messageHandler'); // Modul pro zpracování příchozích zpráv - Cesta by měla být správná
const memoryManager = require('./features/memoryManager'); // Modul pro správu paměti a NPC - Cesta by měla být správná
const startDashboardServer = require('./web/server'); // Funkce pro spuštění dashboard serveru - Cesta by měla být správná


// Vytvoření nového Discord klienta s definovanými záměry (intents)
// Intents jsou klíčové pro určení, jaké události bude bot přijímat.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Potřebné pro informace o serverech a rolích
        GatewayIntentBits.GuildMessages, // Potřebné pro čtení zpráv v kanálech
        GatewayIntentBits.MessageContent, // Potřebné pro přístup k obsahu zpráv (VYŽADUJE ZAPNUTÍ V DEVELOPER PORTÁLU)
        GatewayIntentBits.DirectMessages, // Potřebné pro práci s přímými zprávami
        // Doporučené Intenty pro lepší funkčnost:
        GatewayIntentBits.DirectMessageTyping, // Pro indikátor psaní v DM
        GatewayIntentBits.GuildMessageTyping, // Pro indikátor psaní v kanálech
        // Můžeš přidat i další podle potřeby, např. GuildMembers, GuildPresences atd.
    ],
    partials: ['CHANNEL'], // Důležité pro správné zpracování DM (soukromých zpráv)
});

// Vytvoření kolekce pro ukládání příkazů
client.commands = new Collection();

// Načítání souborů příkazů z adresáře 'commands'
const commandsPath = path.join(__dirname, 'commands'); // Cesta ke složce s příkazy (relativně k bot.js, který je v src/)
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'index.js'); // Filtrujeme jen .js soubory a ignorujeme index.js (pokud ho máš)

console.log('--- DEBUG bot.js: Načítám příkazy...');
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        // Zkontrolujte, zda příkaz má požadované vlastnosti 'data' a 'execute' (pro Slash Commands)
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`--- DEBUG bot.js: Příkaz ${command.data.name} načten.`);
        } else {
            console.warn(`[VAROVÁNÍ] Příkaz na ${filePath} postrádá požadovanou vlastnost "data" nebo "execute".`);
        }
    } catch (error) {
        console.error(`❌ Chyba při načítání příkazu z ${filePath}:`, error);
    }
}


// --- Event Handlers ---

// Event: Bot je připraven a přihlášen k Discordu
// Používáme 'ready' jako název události
client.once('ready', async readyClient => {
    console.log(`🔥 Jsem připravená a přihlášená jako ${readyClient.user.tag}!`);

    // Můžete zde nastavit status bota (např. "Playing with data")
    readyClient.user.setPresence({
        activities: [{ name: 'new galaxies', type: ActivityType.Watching }], // ActivityType může být Playing, Streaming, Listening, Watching, Competing
        status: 'dnd', // Status může být online, idle, dnd (Do Not Disturb), invisible
    });


    // === Inicializační úkoly, které se spustí POUZE JEDNOU po startu ===

    // 1. Připojení k databázi
    console.log('--- DEBUG bot.js: Vstupuji do DB connect bloku v ready handleru.');
    try {
        await db.connect(); // Voláme asynchronní funkci connect z db modulu
        console.log('--- DEBUG bot.js: DB connect se dokončilo.');

        // 2. Načtení NPC konfigurací do paměti
        console.log('--- DEBUG bot.js: Volám memoryManager.loadNpcConfigs(); ---');
        await memoryManager.loadNpcConfigs(); // Voláme asynchronní funkci z memoryManageru
        console.log('--- DEBUG bot.js: Volání memoryManager.loadNpcConfigs() se dokončilo.');

        // 3. Synchronizace NPC konfigurací s DB (pokud existují nové/změněné)
         console.log('--- DEBUG bot.js: Volám db.syncNpcConfigs(); ---');
         const npcConfigs = memoryManager.getNpcConfigs(); // Získáme aktuální NPC configs z memoryManageru
         await db.syncNpcConfigs(npcConfigs); // Voláme asynchronní funkci z db modulu
         console.log('--- DEBUG bot.js: Volání db.syncNpcConfigs() se dokončilo.');


        // 4. Načtení aktivních kanálů z DB do cache memoryManageru
        console.log('--- DEBUG bot.js: Volám memoryManager.loadActiveChannelsFromDb(); ---');
        await memoryManager.loadActiveChannelsFromDb(); // Voláme asynchronní funkci z memoryManageru
        console.log('--- DEBUG bot.js: Volání memoryManager.loadActiveChannelsFromDb() se dokončilo.');

        // 5. Spuštění dashboard serveru
        console.log('--- DEBUG bot.js: Inicializační úkoly po startu dokončeny.');
        console.log('--- DEBUG bot.js: Pokouším se spustit dashboard server...');
        try {
            startDashboardServer(client, db, memoryManager); // Předáváme závislosti dashboard serveru
            console.log('--- DEBUG bot.js: Funkce startDashboardServer volána.');
            // Samotný console.log o spuštění Express serveru (naslouchání na portu) by měl být uvnitř server.js
        } catch (dashboardError) {
            console.error('❌ Chyba při spouštění dashboard serveru:', dashboardError);
            // Logujeme chybu, pokud se server nespustí, ale necháme bota běžet
        }
        // === Konec inicializačních úkolů ===


    } catch (error) {
        console.error('❌ Kritická chyba při inicializaci bota:', error);
        // Pokud selže připojení k DB nebo načtení základních dat, bot nemůže fungovat
        // Zalogujeme chybu a ukončíme proces s chybovým kódem
        process.exit(1);
    }
});


// Event: Zpracování interakcí (Slash Commands, Context Menu Commands atd.)
// Používáme 'interactionCreate' jako název události
client.on('interactionCreate', async interaction => {
    // Zkontrolujeme, zda se jedná o příkaz typu ChatInput (slash command)
    if (!interaction.isChatInputCommand()) {
        // Pokud se nejedná o ChatInput Command, zkontrolujeme, zda je to Autocomplete interakce
        if (interaction.isAutocomplete()) {
             // console.log(`--- DEBUG bot.js: Uživatel ${interaction.user.tag} spouští Autocomplete pro příkaz /${interaction.commandName}`); // Příliš časté logování
             const command = interaction.client.commands.get(interaction.commandName);
             if (!command) {
                 // console.error(`Autocomplete pro příkaz ${interaction.commandName} nebyl nalezen.`); // Tato chyba by se měla logovat, pokud command neexistuje vůbec
                 return;
             }
             try {
                 // Zkontrolujeme, zda načtený příkaz má metodu 'autocomplete' a zavoláme ji
                 if (command.autocomplete) {
                     await command.autocomplete(interaction);
                 }
             } catch (error) {
                 console.error(`❌ Chyba při provádění Autocomplete pro příkaz /${interaction.commandName}:`, error);
                 // Chyba v autocomplete by neměla crashovat bota, ale ovlivní to uživatelskou zkušenost
             }
        }
        return; // Ignorujeme ostatní typy interakcí, pokud nejsou explicitně zpracovány
    }


    // Získání příkazu z kolekce podle jeho názvu
    const command = interaction.client.commands.get(interaction.commandName);

    // Pokud příkaz neexistuje v kolekci, zalogujeme chybu a ukončíme zpracování
    if (!command) {
        console.error(`Příkaz ${interaction.commandName} nebyl nalezen v kolekci příkazů.`);
        return;
    }

    // Logování použití příkazu
    console.log(`Uživatel ${interaction.user.tag} (${interaction.user.id}) použil příkaz /${interaction.commandName}`
        + (interaction.guild ? ` v kanálu ${interaction.channelId} na serveru ${interaction.guildId}.` : ` v DM.`) // Přidáno rozlišení, zda příkaz byl použit na serveru nebo v DM
    );


    // Spuštění logiky příkazu a zachycení případných chyb
    try {
        await command.execute(interaction); // Voláme asynchronní metodu execute příkazu
    } catch (error) {
        console.error(`❌ Chyba při provádění příkazu /${interaction.commandName}:`, error);
        // Odeslání chybové zprávy uživateli, pokud interakce již nebyla zodpovězena nebo odložena
        if (interaction.replied || interaction.deferred) {
            // Pokud už interakce byla zodpovězena nebo odložena, použijeme followUp
            await interaction.followUp({ content: 'Při provádění tohoto příkazu došlo k chybě!', ephemeral: true });
        } else {
            // Jinak odpovíme přímo (reply)
            await interaction.reply({ content: 'Při provádění tohoto příkazu došlo k chybě!', ephemeral: true });
        }
    }
});

// Event: Zpracování příchozích zpráv (pro reakci bota v aktivních kanálech nebo DM)
// Používáme 'messageCreate' jako název události
// Při každé zprávě se zavolá funkce handleChatMessage z modulu messageHandler
client.on('messageCreate', messageHandler.handleChatMessage);


// Graceful shutdown - Zajištění, že se bot vypne čistě při přijetí signálu SIGINT (např. Ctrl+C, 'pm2 stop', 'pm2 restart')
process.on('SIGINT', async () => {
    console.log('Přijat signál SIGINT. Vypínám bota...');
    try {
        // TODO: Pokud Express server v server.js nemá vlastní obsluhu SIGINT, zvažte jeho explicitní vypnutí zde.
        // Například, pokud startDashboardServer vrací instanci serveru:
        // if (dashboardServerInstance) {
        //    await dashboardServerInstance.close();
        //    console.log('Dashboard server ukončen.');
        // }

        // Ukončení spojení s Discordem
        // Kontrola, zda je klient a jeho připojení platné a připojené (status 0 = Ready) před pokusem o ukončení spojení
        if (client && client.ws && client.ws.status === 0) {
             console.log('Ukončuji spojení s Discordem...');
             client.destroy(); // Správná metoda pro ukončení Discord spojení klienta
             console.log('Spojení s Discordem ukončeno.');
        } else {
            console.log('Discord klient není připojen nebo již ukončuje spojení.');
        }


        // Uzavření databázového spojení
        console.log('Ukončuji spojení s databázi...');
        // Voláme SPRÁVNOU asynchronní funkci db.close() a čekáme na její dokončení
        await db.close(); // <<< Ujistěte se, že db.close() v database.js je asynchronní a správně uzavírá pool/spojení
        console.log('Spojení s databázi ukončeno.');


        console.log('Bot vypnut.');
        process.exit(0); // Ukončí proces s kódem 0 (úspěch)
        // POZOR: Někdy pm2 potřebuje chvilku, než zaznamená, že proces skončil.
        // Pokud máte problémy s rychlým restartem v pm2, může pomoct malé zpoždění PŘED process.exit(0), ale obecně by to nemělo být nutné s asynchronními operacemi jako db.close() a client.destroy().

    } catch (error) {
        console.error('❌ Chyba při čistém vypínání bota:', error);
        process.exit(1); // Ukončí proces s kódem 1 (chyba)
    }
});

// Zpracování neošetřených výjimek (chyb, které se staly synchronně a nikde nebyly zachyceny blokem try...catch)
process.on('uncaughtException', (error) => {
    console.error('❌ Nezachycená synchronní výjimka:', error);
    // V produkčním prostředí byste zde mohli chtít logovat chybu do souboru nebo externí služby.
    // Zvážit, zda po kritické chybě proces ukončit:
    // process.exit(1);
});

// Zpracování neošetřených odmítnutí Promise (asynchronní chyby, které nebyly zachyceny .catch())
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Neošetřené odmítnutí Promise:', reason, promise);
    // Zde byste také mohli logovat.
    // Zvážit, zda po kritické chybě proces ukončit:
    // process.exit(1);
});


// Přihlášení bota k Discordu pomocí tokenu z proměnných prostředí (.env)
// Toto je poslední krok při startu bota.
client.login(process.env.DISCORD_TOKEN);