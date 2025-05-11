const { REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('../config/config');

// Načtení všech dat slash příkazů
const commands = [];
const commandFiles = fs.readdirSync('./src/commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    if (file === 'index.js') continue;
	const command = require(`../src/commands/${file}`); // TEĎ JE TO SPRÁVNĚ!
	if (command.data) { // Zkontrolovat, zda má soubor data pro slash příkaz
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(config.discordToken);

// Funkce pro registraci příkazů
const registerCommands = async (client) => {
    try {
        console.log(`🚀 Spouštím obnovu ${commands.length} aplikačních (/) příkazů.`);

        // Můžeš registrovat globálně (Routes.applicationCommands(client.user.id))
        // nebo per-guild (Routes.applicationGuildCommands(client.user.id, guildId))
        // Pro vývoj je lepší per-guild, je to rychlejší
        // Až budeš hotov, přepni na globální

        // Příklad globální registrace (pomalejší, může trvat hodinu)
        // const data = await rest.put(
        //     Routes.applicationCommands(client.user.id),
        //     { body: commands },
        // );

        // Příklad per-guild registrace (rychlejší pro testování)
        // Nahraď 'YOUR_GUILD_ID' IDčkem tvého testovacího serveru
        const testGuildId = '559500326948962305';
         const data = await rest.put(
             Routes.applicationGuildCommands(client.user.id, testGuildId),
             { body: commands },
         );


        console.log(`✅ Úspěšně načteno ${data.length} aplikačních (/) příkazů.`);
    } catch (error) {
        console.error('❌ Chyba při registraci příkazů:', error);
    }
};

module.exports = registerCommands;