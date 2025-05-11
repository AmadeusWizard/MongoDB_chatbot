const axios = require('axios');
const config = require('../../config/config');

async function getChatCompletion(messages) {
    try {
        const response = await axios.post(config.chatApi.endpoint, {
            model: config.chatApi.model,
            messages: messages,
            // Další parametry pro API, např. temperature, max_tokens
            temperature: 0.7,
            // max_tokens: 4000 // Omezit délku odpovědi, aby se vešla do Discordu
        }, {
            headers: {
                'Content-Type': 'application/json',
                // Pokud API vyžaduje autentizaci, přidej např. Authorization header
                'Authorization': `Bearer ${config.chatApi.apiKey}`
            }
        });

        // Zkontroluj, zda odpověď obsahuje očekávaná data
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            return response.data.choices[0].message.content;
        } else {
            console.error('API odpovědělo neočekávaným formátem:', response.data);
            return null;
        }

    } catch (error) {
        console.error('Chyba při volání Chat API:', error.message);
        // Můžeš logovat i response.data, pokud je k dispozici pro detailnější ladění
        if (error.response) {
             console.error('Stavový kód API:', error.response.status);
             console.error('Data z API:', error.response.data);
        }
        return null; // Vrátit null v případě chyby
    }
}


// TODO: Implementovat volání pro TTS
async function getTTSAudio(text) {
    // Budeš potřebovat API endpoint pro TTS (pokud není součástí chat API)
    // Nebo použít knihovnu pro TTS, která generuje MP3
    // Zde je jen placeholder
    console.log(`Generuji TTS pro text: "${text}"`);
    // const ttsEndpoint = '...'; // Najdi API endpoint pro GPT-4o mini TTS
    // const response = await axios.post(ttsEndpoint, { model: config.ttsApi.model, voice: config.ttsApi.voice, text: text, format: 'mp3' }, { headers: { ... } });
    // return response.data; // Měla by to být binární data MP3
    return null; // Zatím vracíme null
}

module.exports = {
    getChatCompletion,
    getTTSAudio
};