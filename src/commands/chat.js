// src/commands/chat.js (Implementace autocomplete pro /chat active npc: a opravená cache pro memoryManager)

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db/database');
const memoryManager = require('../features/memoryManager'); // Import memoryManager


module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Ovládá aktivitu chatbota v kanálu a umožňuje mluvit s konkrétním NPC.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('active')
                .setDescription('Aktivuje chatbota v tomto kanálu.')
                 // --- ÚPRAVA VOLITELNÉ OPCI 'npc' ---
                .addStringOption(option =>
                    option.setName('npc')
                        .setDescription('Vyberte NPC, se kterým chcete v tomto kanálu mluvit.')
                        .setRequired(false)
                        // === ZMĚNA: Zapínáme autocomplete ===
                        .setAutocomplete(true) // <--- Zůstává true!
                        // === KONEC ZMĚNY ===
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deactivate')
                .setDescription('Deaktivuje chatbota v tomto kanálu.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channelId = interaction.channelId;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (!guildId) {
            await interaction.reply({ content: 'Tento příkaz lze použít pouze na serveru (guildě).', ephemeral: true });
            return;
        }
        console.log(`Uživatel ${interaction.user.tag} (${userId}) použil příkaz /chat ${subcommand} v kanálu ${channelId} na serveru ${guildId}.`);

        // Získání ID NPC z opce PŘED bloky active/deactivate
        // Proměnná bude dostupná v obou blocích, ale použijeme ji jen tam, kde je potřeba (active)
        // Necháme si ji zde, protože je deklarovaná jednou pro celý execute
        const npcIdFromOption = interaction.options.getString('npc');
        if (npcIdFromOption) {
             console.log(`--- DEBUG chat.js: Uživatel zadal volitelnou opci NPC ID (mimo active bloku): "${npcIdFromOption}"`);
        } else {
             console.log(`--- DEBUG chat.js: Uživatel NEZADAL volitelnou opci NPC ID (mimo active bloku).`);
        }


        if (subcommand === 'active') {
            console.log(`Aktivuji chatbota v kanálu ${channelId}...`);
            try {
                // Zde už máme npcIdFromOption dostupné

                // db.addActiveChannel umí přijmout i npcId - toto funguje správně
                await db.addActiveChannel(guildId, channelId, npcIdFromOption); // Uložíme do DB i s vybraným NPC ID


                // MemoryManager.addChannelToCache MUSÍ dostat i NPC ID, aby ho uložil do cache pro messageHandler!
                // <<< ZDE JE OPRAVA >>>
                // Předáme získané npcIdFromOption jako druhý argument memoryManager.addChannelToCache
                console.log(`--- DEBUG chat.js: Předávám memoryManager.addChannelToCache kanál ${channelId} s NPC ID: "${npcIdFromOption || 'null'}"`); // Přidán detailní log
                memoryManager.addChannelToCache(channelId, npcIdFromOption); // <-- Takhle to má být! Předáváme NPC ID!


                console.log(`Chatbot aktivován v kanálu ${channelId}.`);
                let replyContent = `Chatbot byl aktivován v tomto kanálu.`;

                // === Logika pro získání jména NPC pro odpověď ===
                const npcConfigsObject = memoryManager.getNpcConfigs(); // Získáme objekt konfigurací

                // Určíme, které NPC ID se použije pro odpověď uživateli
                // Nejprve zkusíme ID z opce, pokud bylo zadáno a NENÍ null/prázdný řetězec
                const usedNpcId = npcIdFromOption && npcIdFromOption.trim() !== '' ? npcIdFromOption.trim() : null;

                if (usedNpcId) {
                     // Pokud bylo zadáno platné NPC ID, najdeme jeho jméno pro odpověď
                     const selectedNpc = npcConfigsObject ? npcConfigsObject[usedNpcId] : null;
                     const npcName = selectedNpc ? selectedNpc.name : usedNpcId; // Použijeme jméno nebo ID
                     replyContent += ` Bude zde odpovídat jako **${npcName}**.`;
                } else {
                     // Pokud nebylo zadáno žádné platné NPC ID v opci, zkusíme zjistit výchozí NPC z memoryManageru/konfigurace
                     // MemoryManager by měl mít způsob, jak získat výchozí NPC ID nebo objekt
                     // Předpokládáme, že 'astronomer' je klíč výchozího NPC
                     const defaultNpcId = 'astronomer'; // <-- Zde můžeš zadat klíč výchozího NPC
                     const defaultNpc = npcConfigsObject ? npcConfigsObject[defaultNpcId] : null;
                     const defaultNpcName = defaultNpc ? defaultNpc.name : defaultNpcId;
                     replyContent += ` Bude zde odpovídat jako **${defaultNpcName}** (výchozí NPC).`;
                     console.log(`--- DEBUG chat.js: Používám výchozí NPC ID "${defaultNpcId}" pro zprávu o aktivaci.`); // Log pro info
                }

                // Oprava deprecation warningu pro ephemeral:
                await interaction.reply({ content: replyContent, flags: MessageFlags.Ephemeral }); // <--- Opraveno na flags!

            } catch (error) {
                console.error(`❌ Chyba při aktivaci kanálu ${channelId}:`, error);
                await interaction.reply({ content: 'Došlo k chybě při aktivaci chatbota v tomto kanálu.', flags: MessageFlags.Ephemeral }); // <--- Opraveno na flags!
            }

        } else if (subcommand === 'deactivate') {
            console.log(`Deaktivuji chatbota v kanálu ${channelId}...`);
            try {
                await db.removeActiveChannel(channelId); // Odebereme kanál z DB
                // Odebereme z paměťové cache memoryManageru (implementovaná funkce pro Set)
                // Funkce removeChannelFromCache pravděpodobně bere jen channelId, což je v pořádku
                memoryManager.removeChannelFromCache(channelId);

                console.log(`Chatbot deaktivován v kanálu ${channelId}.`);
                await interaction.reply({ content: 'Chatbot byl deaktivován v tomto kanálu.', flags: MessageFlags.Ephemeral }); // <--- Opraveno na flags!

            } catch (error) {
                console.error(`❌ Chyba při deaktivaci kanálu ${channelId}:`, error);
                 await interaction.reply({ content: 'Došlo k chybě při deaktivaci chatbota v tomto kanálu.', flags: MessageFlags.Ephemeral }); // <--- Opraveno na flags!
            }
        }
        // Zbytek funkce execute a autocomplete metoda zůstává nezměněn
    },

    // === IMPLEMENTACE METODY PRO ZPRACOVÁNÍ AUTOCOMPLETE INTERAKCÍ ===
    async autocomplete(interaction) {
        console.log(`--- DEBUG chat.js: >> Autocomplete interakce přijata <<`); // <-- NOVÝ LOG

        try { // Přidáme try/catch, abychom zachytili případné chyby uvnitř!
            // Zjistíme, která opce je právě ve fokusu (na kterou uživatel píše)
            const focusedOption = interaction.options.getFocused(true);

            console.log(`--- DEBUG chat.js: Autocomplete - Fokus na opci: ${focusedOption.name}, Vstup uživatele (value): "${focusedOption.value}"`); // <-- NOVÝ LOG

            // Zkontrolujeme, zda autocomplete požadavek přišel pro správnou opci ('npc') a správný příkaz ('chat active')
            if (focusedOption.name === 'npc' && interaction.commandName === 'chat' && interaction.options.getSubcommand() === 'active') {

                // Získáme vstup uživatele (co zatím napsal)
                const userInput = focusedOption.value.toLowerCase();
                console.log(`--- DEBUG chat.js: Autocomplete - Zpracovávám vstup: "${userInput}"`); // <-- NOVÝ LOG


                // Získáme seznam všech NPC konfigurací z memoryManageru
                const npcConfigsObject = memoryManager.getNpcConfigs();
                console.log(`--- DEBUG chat.js: Autocomplete - Získány NPC configs z memoryManageru.`); // <-- NOVÝ LOG
                console.log(`--- DEBUG chat.js: Autocomplete - Počet klíčů v npcConfigs (getNpcConfigs vrátil): ${Object.keys(npcConfigsObject || {}).length}`); // <-- NOVÝ LOG (přidána kontrola pro null/undefined)


                // Připravíme pole pro návrhy
                const choices = [];

                // Pokud NPC configs jsou načteny a není to prázdný objekt
                if (npcConfigsObject && Object.keys(npcConfigsObject).length > 0) {
                     // Projdeme všechny NPC konfigurace a najdeme shody
                     for (const npcId in npcConfigsObject) {
                         if (Object.hasOwnProperty.call(npcConfigsObject, npcId)) {
                             const config = npcConfigsObject[npcId];

                             const npcName = config.name || npcId; // Použijeme 'name', pokud existuje, jinak ID

                             // Zkontrolujeme, zda se vstup uživatele shoduje s ID nebo jménem NPC (case-insensitive)
                             if (npcId.toLowerCase().includes(userInput) || npcName.toLowerCase().includes(userInput)) {
                                 choices.push({
                                     name: npcName,
                                     value: npcId,
                                 });
                             }
                         }
                     }
                } else {
                    console.warn("--- DEBUG chat.js: Autocomplete - NPC konfigurace nejsou načteny při autocomplete požadavku (objekt prázdný/null)."); // <-- Vylepšený log
                    // Můžeme přidat nějakou informativní možnost, nebo nechat prázdné
                    // choices.push({ name: "NPC konfigurace se načítají...", value: "loading" }); // Příklad
                }

                console.log(`--- DEBUG chat.js: Autocomplete - Vygenerováno ${choices.length} shud pro vstup "${userInput}" PŘED omezením.`); // <-- NOVÝ LOG

                // Omezíme počet návrhů
                const filteredChoices = choices.slice(0, 25);

                console.log(`--- DEBUG chat.js: Autocomplete - Odesílám ${filteredChoices.length} návrhů Discordu.`); // <-- NOVÝ LOG
                // console.log('--- DEBUG chat.js: Autocomplete - Odesílané návrhy:', filteredChoices); // Můžeš si vypsat, co přesně se odesílá


                // Odešleme návrhy zpět Discordu
                await interaction.respond(filteredChoices); // <--- Zde se odesílá odpověď!

            } else {
                // Pokud autocomplete požadavek nepřišel pro naši opci/příkaz, nic neděláme
                // Console.log(`--- DEBUG chat.js: Autocomplete - Přijata autocomplete interakce pro jinou opci/příkaz.`);
                // Můžeme poslat prázdnou odpověď, pokud požadavek je platný, ale není pro nás určený
                // await interaction.respond([]); // <-- Možnost, ale většinou není nutné pro jiné příkazy
            }
        } catch (error) { // <-- Zachycujeme chyby!
            console.error('❌ Chyba během autocomplete interakce:', error); // <-- Logujeme chybu!
            // V případě chyby je dobré poslat prázdnou odpověď nebo vůbec nic, aby se Discord nezasekl.
            try {
                // Zkusíme poslat prázdné pole, ale nemusí fungovat, pokud chyba nastala předtím
                 await interaction.respond([]);
            } catch (respondError) {
                 console.error('❌ Chyba při pokusu odeslat prázdnou autocomplete odpověď po předchozí chybě:', respondError);
            }
        }
    }
    // === KONEC IMPLEMENTACE AUTOCOMPLETE METODY ===
};