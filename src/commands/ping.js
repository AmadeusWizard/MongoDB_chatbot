// src/commands/ping.js (Vylepšená verze s jasnějším zobrazením latencí a grafikou + opraven RangeError)

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js'); // Importujeme EmbedBuilder a MessageFlags

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Zkontroluje odezvu bota a ukáže detaily.'), // Mírně upraven popis

    async execute(interaction) {
        // Okamžitá odpověď pro získání výchozí časové značky
        // Použijeme flags.Ephemeral, aby zprávu viděl jen uživatel, dokud neodešleme finální embed
        // Použijeme withResponse: true pro získání reference na odpověď
        const sent = await interaction.reply({ content: '🔍 Měřím odezvu bota...', flags: MessageFlags.Ephemeral, fetchReply: true }); // fetchReply je starší, s withResponse je lepší, ale pokud fetchReply funguje, necháme to

        // === VÝPOČET LATENCE BOTA ===
        // Čas mezi přijetím interakce a odesláním první odpovědi
        const botLatency = sent.createdTimestamp - interaction.createdTimestamp;

        // === ZÍSKÁNÍ LATENCE API ===
        // Latence WebSocket spojení bota k Discordu
        const apiLatency = interaction.client.ws.ping;


        // === URČENÍ STAVOVÉHO INDIKÁTORU (dle Latence API, protože je stabilnější) ===
        let statusEmoji;
        let statusColor; // Hex kód barvy
        let statusText;

        if (apiLatency < 50) {
            statusEmoji = '🟢'; // Zelený puntík
            statusColor = '#00ff00'; // Zelená
            statusText = 'Výborná';
        } else if (apiLatency < 100) { // Upraveny prahy pro Latenci API
             statusEmoji = '🟡'; // Žlutý puntík
             statusColor = '#ffff00'; // Žlutá
             statusText = 'Dobrá';
        } else if (apiLatency < 200) { // Upraveny prahy pro Latenci API
            statusEmoji = '🟠'; // Oranžový puntík
            statusColor = '#ffaa00'; // Oranžová
            statusText = 'Průměrná';
        } else {
            statusEmoji = '🔴'; // Červený puntík
            statusColor = '#ff0000'; // Červená
            statusText = 'Špatná';
        }


        // === VYLEPŠENÝ GRAFICKÝ INDIKÁTOR (Progress Bar v textu) ===
        // Přizpůsobíme délku a znaky pro lepší vzhled a čitelnost v Discordu.
        // Můžeme použít jiný znak než '#', např. plný blok (█)
        const progressBarLength = 20; // Celková délka progress baru v znacích
        // Normalizujeme latenci API na rozsah 0-200ms pro progress bar (ping přes 200ms bude stále plný)
        const normalizedLatency = Math.min(apiLatency, 200); // Omezíme max hodnotu pro normalizaci na 200
        const filledBlocks = Math.floor((normalizedLatency / 200) * progressBarLength); // Počet vyplněných bloků (0 až 20)

        // Vytvoříme textový progress bar
        // <<< ZDE JE OPRAVA RANGEERROR >>>
        // Zajistíme, že počet mezer nebude záporný pomocí Math.max(0, ...)
        const emptyBlocks = Math.max(0, progressBarLength - filledBlocks); // Počet prázdných bloků, minimálně 0
        const progressBar = '█'.repeat(filledBlocks) + ' '.repeat(emptyBlocks); // Použijeme plný blok a mezery
        // <<< KONEC OPRAVY >>>


        // === TVORBA BOHATŠÍ EMBED ZPRÁVY ===
        const embed = new EmbedBuilder() // Používáme EmbedBuilder pro snadnější tvorbu
            .setColor(parseInt(statusColor.replace('#', ''), 16)) // Barva dle statusu API latence
            .setTitle('🌐 Stav připojení bota') // Výstižnější titulek
            .setDescription(`Celkový stav připojení bota k Discordu: **${statusText}** ${statusEmoji}`) // Popis shrnující stav
            .addFields( // Přidáme políčka pro detaily
                {
                    name: '🤖 Latence bota (Odezva příkazu)',
                    value: `${botLatency}ms`,
                    inline: true, // Zobrazit vedle dalšího políčka, pokud se vejde
                },
                {
                    name: '📡 Latence API Discordu (WebSocket Ping)',
                    value: `${apiLatency}ms`,
                    inline: true, // Zobrazit vedle předchozího políčka
                },
                {
                    name: 'Grafický indikátor (Latence API)', // Popisek pro grafický indikátor
                    value: `\`\`\`\n[${progressBar}]\n\`\`\``, // Textový progress bar v code bloku
                    inline: false, // Zobrazit na novém řádku
                }
                // Můžeš přidat další políčka, např. uptime bota, verze atd.
            )
            .setTimestamp(); // Přidá časovou značku odeslání embedu


        // === EDITACE PŮVODNÍ ZPRÁVY NA NOVÝ EMBED ===
        // Editujeme původní ephemeral zprávu na novou embed zprávu (stále jen pro uživatele)
        await interaction.editReply({ content: ' ', embeds: [embed] }); // Editujeme, content může být prázdný nebo jen emoji
        // Odebráno ephemeral: true z editReply, protože ephemeral se nastavuje jen při prvním reply.


        // Poznámka k varováním ephemeral/fetchReply:
        // V kódu výše jsem ponechal fetchReply: true, protože ho používáš k získání sent objektu.
        // A nahradil jsem 'ephemeral: true' za 'flags: MessageFlags.Ephemeral' v prvním reply.
        // Pokud bys chtěl/a být úplně moderní, fetchReply bys nahradil/a voláním interaction.fetchReply() po interaction.reply().
        // Ale současná verze by měla fungovat a opravit RangeError.
    },
    // === Žádná metoda autocomplete není potřeba pro příkaz ping ===
};