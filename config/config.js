require('dotenv').config();

module.exports = {
    discordToken: process.env.DISCORD_TOKEN,
    mysqlConfig: {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    },
    chatApi: {
        endpoint: process.env.CHAT_ENDPOINT,
        model: process.env.CHAT_MODEL,
        apiKey: process.env.CHAT_API_KEY
    },
    ttsApi: {
        model: process.env.TTS_MODEL,
        voice: process.env.TTS_VOICE,
        apiKey: process.env.TTS_API_KEY
    },
    dashboardPort: process.env.WEB_DASHBOARD_PORT,
    // Další konstanty a nastavení
    messageSegmentLength: 1900, // Maximální délka segmentu zprávy
    contextWindowSize: 20000 // Velikost kontextového okna v tocenech (spíš orientační pro práci s DB)
};