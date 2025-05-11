// src/features/ttsService.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const apiService = require('./apiService'); // Pro získání audio dat z API
const fs = require('fs').promises; // Pro práci se soubory (dočasné MP3)
const path = require('path');
const config = require('../../config/config'); // Pokud potřebuješ nějaké TTS nastavení

// Mapa pro sledování aktivních hlasových spojení a přehrávačů v kanálech
// Klíč: channelId, Hodnota: { connection: VoiceConnection, player: AudioPlayer, silenceTimer: NodeJS.Timeout | null }
const activeConnections = new Map();

// Konstanta pro dobu nečinnosti před automatickým opuštěním kanálu (např. 5 minut)
const AUTO_LEAVE_TIMEOUT = 5 * 60 * 1000; // 5 minut v milisekundách

// Funkce pro navázání nebo získání existujícího hlasového spojení
async function connectToVoiceChannel(channel) {
    if (!channel || channel.type !== 2 /* ChannelType.GuildVoice */) {
        throw new Error('Neplatný nebo není to hlasový kanál.');
    }

    if (activeConnections.has(channel.id)) {
        console.log(`Už jsem připojená v kanálu ${channel.name}, používám stávající spojení.`);
        // Resetovat časovač nečinnosti
        resetSilenceTimer(channel.id);
        return activeConnections.get(channel.id).connection;
    }

    console.log(`Připojuji se do hlasového kanálu: ${channel.name}`);
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();

        connection.subscribe(player); // Přihlásit přehrávač ke spojení

        activeConnections.set(channel.id, { connection, player, silenceTimer: null });

         // Nastavit naslouchání na události spojení a přehrávače
        setupConnectionListeners(connection, channel.id);
        setupPlayerListeners(player, channel.id);

        // Spustit časovač nečinnosti
        startSilenceTimer(channel.id);


        console.log(`Úspěšně připojeno do kanálu ${channel.name}.`);
        return connection;

    } catch (error) {
        console.error(`Chyba při připojování do hlasového kanálu ${channel.name}:`, error);
        throw error; // Přehodit chybu, aby ji mohl zachytit volající kód
    }
}

// Funkce pro přehrání TTS textu v daném hlasovém kanálu
async function playTTS(channel, text) {
    if (!activeConnections.has(channel.id)) {
        // Pokud ještě nejsme připojeni, zkusit se připojit
        try {
            await connectToVoiceChannel(channel);
        } catch (error) {
            console.error('Nelze přehrát TTS, připojení do hlasového kanálu selhalo.');
            return; // Přerušit, pokud se nelze připojit
        }
    }

    const { player } = activeConnections.get(channel.id);

    // Získat MP3 data z TTS API
    // Předpokládáme, že apiService.getTTSAudio vrací Promise<Buffer> nebo null
    const audioBuffer = await apiService.getTTSAudio(text);

    if (!audioBuffer) {
        console.warn("Nepodařilo se získat audio data z TTS API.");
        return;
    }

    try {
        // Uložit buffer do dočasného souboru MP3
        const tempFilePath = path.join(__dirname, `../../temp_tts_${Date.now()}.mp3`); // Ukládat dočasné soubory do rootu nebo temp složky
        await fs.writeFile(tempFilePath, audioBuffer);
        console.log(`TTS audio uloženo do dočasného souboru: ${tempFilePath}`);

        // Vytvořit audio resource ze souboru
        const resource = createAudioResource(tempFilePath);

        // Přehrát resource
        console.log('Spouštím přehrávání TTS audio.');
        player.play(resource);

        // Smazat dočasný soubor po přehrání
        player.once(AudioPlayerStatus.Idle, async () => {
            try {
                await fs.unlink(tempFilePath);
                console.log(`Dočasný TTS soubor ${tempFilePath} smazán po přehrání.`);
            } catch (unlinkError) {
                console.error('Chyba při mazání dočasného TTS souboru:', unlinkError);
            }
            // Po přehrání resetovat časovač nečinnosti
             resetSilenceTimer(channel.id);
        });

         // Při přehrávání resetovat časovač nečinnosti
         resetSilenceTimer(channel.id);


    } catch (error) {
        console.error('Chyba při ukládání nebo přehrávání TTS audio:', error);
        // Můžeš poslat zprávu do textového kanálu, že se TTS nepodařilo
    }
}

// Funkce pro odpojení od hlasového kanálu
function disconnectFromVoiceChannel(channelId) {
    if (activeConnections.has(channelId)) {
        const { connection, silenceTimer } = activeConnections.get(channelId);
        console.log(`Odpojuji se od hlasového kanálu: ${channelId}`);
        if (silenceTimer) {
            clearTimeout(silenceTimer);
        }
        connection.destroy(); // Ukončí spojení
        activeConnections.delete(channelId);
        console.log(`Odpojeno od kanálu ${channelId}.`);
    }
}

// Funkce pro nastavení posluchačů událostí pro hlasové spojení
function setupConnectionListeners(connection, channelId) {
    connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        console.log(`Spojení v kanálu ${channelId} změnil stav z ${oldState.status} na ${newState.status}.`);
        if (newState.status === VoiceConnectionStatus.Disconnected) {
            /*
             * Připojení se může odpojit z různých důvodů,
             * jako je neaktivita, nebo pokud bot ztratí oprávnění.
             * Můžeš se pokusit znovu připojit, pokud je to vhodné.
             * Pro teď se prostě odpojíme a uklidíme.
             */
            if (newState.reason === 0 /* VoiceConnectionDisconnectReason.WebSocketClose */ && newState.closeCode === 4014) {
                /*
                 * Pokud se odpojíme s kódem 4014, znamená to, že jsme byli odpojeni z důvodu nečinnosti
                 * (bot dlouho nemluvil). Můžeme to logovat a zkusit se připojit, až to bude potřeba.
                 */
                 console.warn(`Bot byl odpojen z kanálu ${channelId} z důvodu nečinnosti (kód 4014).`);
            } else {
                 console.error(`Spojení v kanálu ${channelId} neočekávaně ukončeno. Důvod: ${newState.reason}, Kód: ${newState.closeCode}`);
            }

            // Uklidit spojení a smazat z mapy
            disconnectFromVoiceChannel(channelId);
        } else if (newState.status === VoiceConnectionStatus.Destroyed) {
             console.log(`Spojení v kanálu ${channelId} bylo zničeno.`);
             activeConnections.delete(channelId); // Ujistit se, že je odstraněno z mapy
        } else if (newState.status === VoiceConnectionStatus.Connecting) {
             console.log(`Spojení v kanálu ${channelId} se připojuje...`);
        } else if (newState.status === VoiceConnectionStatus.Ready) {
             console.log(`Spojení v kanálu ${channelId} je připraveno!`);
        }
    });

     connection.on('error', (error) => {
         console.error(`Chyba v hlasovém spojení pro kanál ${channelId}:`, error);
         // V případě chyby zkusit odpojit a uklidit
         disconnectFromVoiceChannel(channelId);
     });
}

// Funkce pro nastavení posluchačů událostí pro audio přehrávač
function setupPlayerListeners(player, channelId) {
    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`TTS přehrávač v kanálu ${channelId} hraje!`);
        // Při přehrávání resetovat časovač nečinnosti
        resetSilenceTimer(channelId);
    });

    player.on(AudioPlayerStatus.Idle, () => {
        console.log(`TTS přehrávač v kanálu ${channelId} je volný.`);
         // Když přehrávač dokončí, resetovat časovač nečinnosti
         resetSilenceTimer(channelId);
    });

    player.on(AudioPlayerStatus.Buffering, () => {
        console.log(`TTS přehrávač v kanálu ${channelId} bufferuje...`);
    });

     player.on(AudioPlayerStatus.AutoPaused, () => {
        console.log(`TTS přehrávač v kanálu ${channelId} se automaticky pozastavil.`);
    });

     player.on(AudioPlayerStatus.Paused, () => {
        console.log(`TTS přehrávač v kanálu ${channelId} je pozastaven.`);
    });


    player.on('error', error => {
        console.error(`Chyba v TTS přehrávači pro kanál ${channelId}:`, error);
        // V případě chyby přehrávače to nemusí nutně znamenat, že se má bot odpojit
        // Ale můžeš například přeskočit aktuální resource nebo logovat.
         resetSilenceTimer(channelId); // Resetovat časovač i po chybě
    });
}

// Funkce pro spuštění časovače nečinnosti
function startSilenceTimer(channelId) {
    const connectionInfo = activeConnections.get(channelId);
    if (connectionInfo && !connectionInfo.silenceTimer) {
        const timer = setTimeout(() => {
            console.log(`Automatické odpojení z kanálu ${channelId} z důvodu nečinnosti.`);
            disconnectFromVoiceChannel(channelId);
        }, AUTO_LEAVE_TIMEOUT);
        connectionInfo.silenceTimer = timer;
        console.log(`Časovač nečinnosti spuštěn pro kanál ${channelId}.`);
    }
}

// Funkce pro resetování časovače nečinnosti
function resetSilenceTimer(channelId) {
    const connectionInfo = activeConnections.get(channelId);
    if (connectionInfo && connectionInfo.silenceTimer) {
        clearTimeout(connectionInfo.silenceTimer);
        connectionInfo.silenceTimer = null;
        console.log(`Časovač nečinnosti resetován pro kanál ${channelId}.`);
        // Znovu spustit časovač po resetu
        startSilenceTimer(channelId);
    } else if (activeConnections.has(channelId)) {
         // Pokud časovač nebyl spuštěn, ale spojení existuje, spustit ho
         startSilenceTimer(channelId);
    }
}


// Funkce pro odpojení všech hlasových spojení při vypnutí bota
function disconnectAllVoiceChannels() {
    console.log('Odpojuji se od všech hlasových kanálů...');
    const channelIds = Array.from(activeConnections.keys());
    channelIds.forEach(channelId => {
        disconnectFromVoiceChannel(channelId);
    });
    console.log('Všechna hlasová spojení ukončena.');
}


module.exports = {
    playTTS,
    disconnectAllVoiceChannels,
    // Případně můžeš exportovat i connectToVoiceChannel, pokud ho chceš volat přímo
    // connectToVoiceChannel,
};