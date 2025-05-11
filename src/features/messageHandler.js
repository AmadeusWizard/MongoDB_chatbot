// src/features/messageHandler.js

// Import potřebných modulů
const { Events } = require('discord.js'); // I když se Events přímo nepoužívá zde, je dobré vědět odkud je
const memoryManager = require('./memoryManager'); // Import memoryManager
const db = require('../db/database'); // Import db modulu
const apiService = require('./apiService'); // Import apiService
// const { constructPrompt } = require('./memoryManager'); // Tuto funkci voláme přímo přes memoryManager objekt

// === Import funkce pro čištění odpovědi ===
// cleanAiResponse JE DEFINOVÁNA NÍŽE V TOMTO SAMÉM SOUBORU, NENÍ TŘEBA JI IMPORTovat shora
// const { cleanAiResponse } = require('./messageHandler'); // <<< TUTO ŘÁDKU SMAŽTE!


// === Funkce pro čištění odpovědi od AI ===
// (Tato funkce je definována níže a je volána z handleChatMessage)
function cleanAiResponse(responseText) {
    if (!responseText) {
        return "";
    }

    let cleanedText = responseText.trim();

    // Odstranění ```json\n a ``` na začátku a konci (pokud AI vrací JSON v markdownu)
    if (cleanedText.startsWith('```json\n') && cleanedText.endsWith('\n```')) {
        cleanedText = cleanedText.substring('```json\n'.length, cleanedText.length - '\n```'.length).trim();
    }
     // Odstranění ```\n a ``` na začátku a konci (obecný markdown kód)
     if (cleanedText.startsWith('```\n') && cleanedText.endsWith('\n```')) {
         cleanedText = cleanedText.substring('```\n'.length, cleanedText.length - '\n```'.length).trim();
     }
      // Odstranění ```json a ``` na začátku a konci (pokud AI vrací JSON v markdownu bez \n)
     if (cleanedText.startsWith('```json') && cleanedText.endsWith('```') && !cleanedText.startsWith('```json\n')) {
         cleanedText = cleanedText.substring('```json'.length, cleanedText.length - '```'.length).trim();
     }
      // Odstranění ``` a ``` na začátku a konci (obecný markdown kód bez \n)
     if (cleanedText.startsWith('```') && cleanedText.endsWith('```') && !cleanedText.startsWith('```\n')) {
         cleanedText = cleanedText.substring('```'.length, cleanedText.length - '```'.length).trim();
     }


    // Odstranění <think>...</think> tagů (používáme s flagem 's' pro multiline)
    const thinkTagRegex = /<think>.*?<\/think>/gs;
    cleanedText = cleanedText.replace(thinkTagRegex, '').trim();

    // Můžeš přidat další čištění, pokud Tvé AI vrací jiné nechtěné vzory

    // console.log('--- DEBUG messageHandler: Vyčištěná odpověď AI:', cleanedText); // Logujeme vyčištěnou odpověď

    return cleanedText;
}

// === Funkce: Extrakce finální odpovědi z AI výstupu ===
// Tato funkce vezme celou RAW odpověď z API a extrahuje z ní text, který chceme poslat na Discord.
// Pokud AI používá <think> tagy, vrátí text za nimi. Pokud ne, vrátí celou odpověď.
// Důležité: Tato funkce předpokládá, že surová odpověď (apiResponseString) je STRING.
// Tato funkce je definována níže a je volána z handleChatMessage
function extractBotResponse(apiResponseString) {
     console.log("--- DEBUG messageHandler: Spouštím extrakci odpovědi..."); // Debug log
    if (typeof apiResponseString !== 'string') {
         console.error("❌ Chyba extrakce: Vstup pro extrakci není string.", apiResponseString);
         // V tomto případě vracíme prázdný string, protože nemáme co parsovat
         return "";
    }

    const endThinkTag = '</think>'; // Hledáme tento zavírací tag

    // Najdeme index konce zavíracího </think> tagu
    const endIndex = apiResponseString.indexOf(endThinkTag);

    // Pokud tag najdeme
    if (endIndex !== -1) {
        // Získáme veškerý text OD konce tohoto tagu dál
        let finalResponse = apiResponseString.substring(endIndex + endThinkTag.length).trim();

        // Odstraníme případné prázdné řádky na začátku/konci (už je v trim(), ale pro jistotu)
        finalResponse = finalResponse.replace(/^\\s+|\\s+$/g, '');

        console.log("--- DEBUG messageHandler: </think> tag nalezen. Extrahovaný text ZA tagem:", finalResponse); // Debug log
        if (finalResponse.length > 0) {
            return finalResponse; // Vrátíme text za tagem
        } else {
             // Pokud za tagem nic není, vrátíme prázdný string
             console.warn("--- DEBUG messageHandler: </think> tag nalezen, ale za ním nic není.");
             return "";
        }
    } else {
        // Pokud </think> tag nenajdeme, vrátíme celý původní string (po trimu)
        console.log("--- DEBUG messageHandler: </think> tag nenalezen. Vracím celou původní odpověď (po trimu)."); // Debug log
        return apiResponseString.trim();
    }
}


// Hlavní funkce pro zpracování příchozích zpráv
// Tato funkce je volána z bot.js, když přijde nová zpráva
async function handleChatMessage(message) {
    // Ignorovat zprávy od botů (včetně sebe)
    if (message.author.bot) {
         // console.log('--- DEBUG messageHandler: Ignoruji zprávu od bota.'); // Příliš časté logování
        return;
    }

    // Zkontrolovat, zda je memoryManager inicializován (načetl aktivní kanály z DB)
    // Toto zajišťuje, že bot nereaguje, dokud není plně připraven.
    if (!memoryManager.isBotInitialized()) {
         console.warn('--- DEBUG messageHandler: MemoryManager není inicializován, ignoruji zprávu dokud není načtena konfigurace.');
        // TODO: Možná poslat zprávu uživateli, že se bot stále spouští
        return; // Ignorovat zprávu, dokud bot není plně připraven
    }

    const channelId = message.channel.id;
    const userId = message.author.id;
    const guildId = message.guild?.id; // guildId může být undefined v DM

    // Získat data o aktivním kanálu z cache memoryManageru (pokud existuje)
    const activeChannelData = memoryManager.getActiveChannelData(channelId);
    // console.log('--- DEBUG messageHandler: activeChannelData pro kanál', channelId, 'je:', activeChannelData); // DEBUG log


    // Zpracovat zprávu, pouze pokud:
    // 1. Kanál je aktivní (activeChannelData existuje)
    // 2. NEBO je to DM bota (message.channel.type === 1)
    // 3. NEBO je bot přímo zmíněn (@Bot)
    const isBotDm = message.channel.type === 1; // 1 je typ CHANNEL_DM
    const isTargetedByMention = message.mentions.users.has(message.client.user.id); // Bot je zmíněn

    // === ZMĚNA: Bot by měl reagovat v aktivních kanálech NEBO když je přímo zmíněn kdekoli NEBO v DM ===
    const shouldRespond = activeChannelData || isBotDm || isTargetedByMention;

    if (!shouldRespond) {
        // console.log('--- DEBUG messageHandler: Kanál není aktivní a bot není zmíněn ani to není DM, ignoruji zprávu.'); // Příliš časté logování
        return; // Ignorovat zprávu, pokud podmínky nejsou splněny
    }

     // Pokud je bot zmíněn v kanálu, který NENÍ aktivní, můžeme ho navést k použití /chat active
     // Toto je volitelné chování. Aktuálně to jen logujeme a dál nereagujeme, pokud není splněna jiná podmínka (activeChannelData nebo isBotDm)
     if (!activeChannelData && isTargetedByMention && !isBotDm) {
          console.log(`--- DEBUG messageHandler: Bot zmíněn v neaktivním kanálu ${channelId}.`);
          // Zde bys mohl poslat zprávu typu: "Ahoj! Abych mohl chatovat, prosím, aktivuj mě v tomto kanálu pomocí příkazu `/chat active <NPC_ID>`."
          // try { await message.reply("Ahoj! Abych mohl chatovat, prosím, aktivuj mě v tomto kanálu pomocí příkazu `/chat active <NPC_ID>`."); } catch (e) { console.error('Chyba při odesílání zprávy o aktivaci:', e); }
          return; // Ukončíme zpracování, pokud bot nemá reagovat v neaktivním kanálu jen na zmínku
     }


    // Získat NPC ID - prioritně z aktivního kanálu.
    // Pokud je to DM, použijeme defaultní NPC ID (např. 'default_dm_npc').
    // Jinak (pokud není aktivní kanál ani DM), NPC ID je null (nemělo by se stát díky shouldRespond checku, ale pro jistotu).
    let npcId = null;
    if (activeChannelData) {
        npcId = activeChannelData.npc_id; // NPC ID z aktivního kanálu
    } else if (isBotDm) {
        // TODO: Definovat defaultní NPC ID pro DM někde v konfiguraci (např. .env nebo config.js)
        npcId = process.env.DEFAULT_DM_NPC_ID || 'default_dm_npc'; // Fallback defaultní NPC ID pro DM
        console.log(`--- DEBUG messageHandler: Zpracovávám DM, používám defaultní NPC ID: ${npcId}`);
    }
    // Pokud se sem kód dostane a npcId je stále null, znamená to problém s logikou shouldRespond nebo activeChannelData.
    if (!npcId) {
         console.error('❌ Chyba messageHandler: Nelze určit NPC ID pro reakci.');
         // Zde bys mohl poslat uživateli chybovou zprávu
         try { await message.reply({ content: 'Omlouvám se, došlo k vnitřní chybě a nemohu určit, s kým mám mluvit.', ephemeral: true }); } catch (e) { console.error('Chyba při odesílání chybové zprávy:', e); }
         return; // Zastavíme zpracování
    }


    // === Uložit zprávu uživatele do historie PŘED zpracováním AI ===
    // Toto je důležité, aby aktuální zpráva byla zahrnuta v historii pro sestavení promptu.
     console.log('--- DEBUG messageHandler: Ukládám uživatelskou zprávu do historie DB...');
     try {
         // Zajištění, že uživatel existuje v DB (pokud ještě ne)
         // Tato funkce findOrCreateUser by měla být bezpečná volat opakovaně.
         await db.findOrCreateUser({ id: userId, username: message.author.username });
          console.log('--- DEBUG messageHandler: Uživatel zkontrolován/vytvořen v DB.');

         // Uložení samotné zprávy do tabulky message_history
         // === ZMĚNA: POUŽÍVÁME SPRÁVNÝ NÁZEV FUNKCE saveMessageHistory! ===
         await db.saveMessageHistory({ // <<-- TOTO JE SPRÁVNÉ VOLÁNÍ!
             channel_id: channelId,
             user_id: userId, // ID uživatele, který zprávu poslal
             npc_id: npcId, // Uložíme s NPC ID, se kterým se v kanálu/DM konverzuje
             content: message.content, // Obsah zprávy
             is_bot: false // False, protože je to zpráva od uživatele
         });
         console.log('--- DEBUG messageHandler: Uživatelská zpráva uložena do historie DB.');
     } catch (historyError) {
         console.error('❌ Chyba při ukládání uživatelské zprávy do historie DB:', historyError);
         // Logujeme chybu, ale pokračujeme, protože uložení historie není kritické pro získání odpovědi od AI.
         // Pokud se historie neuloží, prompt pro AI bude chudší o tuto zprávu.
     }


    // === Zpracování zprávy AI ===
    // Zde budeme sestavovat prompt pro AI, volat API a zpracovávat odpověď.

    // Přidáme "typing" indikátor, aby uživatel věděl, že bot "přemýšlí"
    try {
        await message.channel.sendTyping(); // Pošle indikátor psaní v kanálu/DM
         console.log('--- DEBUG messageHandler: Odeslán typing indikátor.');
    } catch (typingError) {
         console.error('❌ Chyba při posílání typing indikátoru:', typingError);
        // Nezpůsobí pád bota, jen se nezobrazí indikátor
    }


    // Získat relevantní historii a paměť a zkonstruovat prompt pro AI
    // Voláme funkci constructPrompt z memoryManageru, která provede načtení a sestavení promptu.
    let fullApiResponse = null; // Proměnná pro celou RAW odpověď od AI
    let cleanedBotResponse = null; // Proměnná pro vyčištěnou odpověď k odeslání na Discord

    try {
         console.log("--- DEBUG messageHandler: Konstruuji prompt pro API...");
         // constructPrompt očekává (channelId, userId, npcId, lastMessageContent)
         // memoryManager.constructPrompt už v sobě načítá historii a paměť!
         const messagesForApi = await memoryManager.constructPrompt(channelId, userId, npcId, message.content); // <<-- memoryManager sestaví prompt (včetně paměti a historie)
         console.log('--- DEBUG messageHandler: Prompt pro API sestaven.', messagesForApi);

         // Zavoláme AI API pro získání odpovědi s hotovým promptem
         console.log('--- DEBUG messageHandler: Volám AI API pro odpověď...');
         // apiService.getChatCompletion by měl vrátit STRING s obsahem zprávy od AI, nebo null při chybě/prázdné odpovědi.
         fullApiResponse = await apiService.getChatCompletion(messagesForApi); // <<-- Volání API s promptem

         console.log('--- DEBUG messageHandler: Surová odpověď od AI přijata.', fullApiResponse); // Log přijaté RAW odpovědi


         // === Zpracování a čištění odpovědi od AI ===
         // API Service by měl vracet STRING. Pokud vrací něco jiného (objekt chyby atd.), je problém tam.
         // extractBotResponse očekává STRING a vrátí STRING.
         // cleanAiResponse očekává STRING a vrátí STRING.

         // Nejprve extrahujeme text, který chceme poslat na Discord (např. odstraníme </think> části)
         const extractedResponse = extractBotResponse(fullApiResponse);
          console.log('--- DEBUG messageHandler: Extrahovaná odpověď (před čištěním):', extractedResponse);

         // Poté vyčistíme extrahovanou odpověď od nechtěných markdownů atd.
         // cleanAiResponse je definována níže v tomto souboru, není potřeba ji importovat na začátku.
         cleanedBotResponse = cleanAiResponse(extractedResponse); // <<-- Čištění odpovědi před odesláním
         console.log('--- DEBUG messageHandler: Vyčištěná odpověď pro Discord:', cleanedBotResponse);


         // Zkontrolujeme, zda po čištění zbyl nějaký text k odeslání
         if (!cleanedBotResponse || cleanedBotResponse.trim().length === 0) {
             console.warn('⚠️ AI nevrátila žádný smysluplný text k odeslání po čištění nebo extrakci.');
             // Zde se můžeme rozhodnout odeslat uživateli omluvnou zprávu
             // try { await message.reply({ content: 'Promiň, momentálně nemohu odpovědět smysluplně.', ephemeral: true }); } catch(e) { console.error('Chyba při odesílání omluvné zprávy:', e); }
             // Pokud neodešleme omluvnou zprávu, funkce zkrátka skončí a bot neodpoví.
             return; // Ukončíme zpracování, pokud není co odeslat
         }


     } catch (apiError) {
         console.error('❌ Chyba při volání AI API, extrakci nebo čištění odpovědi:', apiError);
         // V případě chyby API nebo zpracování odpovědi pošleme uživateli omluvnou zprávu
         try {
              await message.reply({ content: 'Promiň, došlo k chybě při komunikaci s mým mozkem (AI). Zkus to prosím později.', ephemeral: true });
         } catch (replyError) {
              console.error('❌ Chyba při odesílání chybové zprávy uživateli:', replyError);
         }
         // Nepřerušujeme zbytek funkce, analýza paměti by se měla spustit i s prázdnou/chybnou odpovědí

     }


    // === Odeslání vyčištěné odpovědi bota uživateli na Discord ===
    // Tuto část provedeme POUZE, pokud cleanedBotResponse není prázdný (kontrola výše)
    // Implementace rozdělení dlouhé zprávy na části (<2000 znaků)
    if (cleanedBotResponse && cleanedBotResponse.trim().length > 0) {
        console.log('--- DEBUG messageHandler: Připravuji odpověď bota k odeslání na Discord...');
        console.log('--- DEBUG messageHandler: Délka vyčištěného textu pro odeslání:', cleanedBotResponse.length);

        const discordLimit = 2000; // Maximální počet znaků na jednu Discord zprávu
        const messageChunks = [];
        let currentChunk = cleanedBotResponse;

        while (currentChunk.length > 0) {
            if (currentChunk.length <= discordLimit) {
                // Pokud zbývající část je pod limitem, přidáme ji celou a končíme
                messageChunks.push(currentChunk);
                currentChunk = ''; // Zbytek je přidán, hotovo
            } else {
                // Pokud je text delší než limit, najdeme bezpečné místo pro rozdělení

                // Snažíme se najít poslední zlom řádku (`\n`) před limitem
                let splitIndex = currentChunk.lastIndexOf('\n', discordLimit - 1); // Hledáme včetně znaku na limitu

                // Pokud nenašel zlom řádku blízko limitu (např. do 200 znaků před limitem)
                if (splitIndex === -1 || splitIndex < discordLimit - 200) {
                     // Zkusíme najít poslední mezeru (` `) před limitem
                    splitIndex = currentChunk.lastIndexOf(' ', discordLimit - 1);
                }

                // Pokud stále nenašel bezpečné místo pro rozdělení nebo je mezera/zlom na začátku
                if (splitIndex === -1 || splitIndex === 0) {
                    // Rozdělíme tvrdě přesně na limitu
                    splitIndex = discordLimit;
                     console.warn(`--- DEBUG messageHandler: Tvrdé rozdělení odpovědi na indexu ${splitIndex}, nenašlo bezpečný zlom.`);
                } else {
                     console.log(`--- DEBUG messageHandler: Rozdělení odpovědi na bezpečném indexu ${splitIndex}.`);
                }


                // Přidáme první část textu do chunků
                // Použijeme trim() pro odstranění případných mezer/nových řádků na konci chunku
                messageChunks.push(currentChunk.substring(0, splitIndex).trim());

                // Zbytek textu se stane novým aktuálním chunkem
                // Použijeme trimStart() (nebo trim()) pro odstranění případných mezer/nových řádků na začátku další části
                currentChunk = currentChunk.substring(splitIndex).trimStart(); // Používáme trimStart pro zachování odsazení v dalším chunku pokud je na začátku řádku
            }
        }

        console.log(`--- DEBUG messageHandler: Odpověď rozdělena na ${messageChunks.length} částí pro odeslání.`);

        // Odesíláme jednotlivé části
        let firstMessage = null; // Proměnná pro uložení odkazu na první odeslanou zprávu (pro reply)
        for (let i = 0; i < messageChunks.length; i++) {
            const chunk = messageChunks[i];
            if (chunk.length > 0) { // Ujistíme se, že chunk není prázdný po trimu
                 console.log(`--- DEBUG messageHandler: Odesílám část ${i + 1}/${messageChunks.length} (Délka: ${chunk.length})...`);
                try {
                    // První část odpoví na původní zprávu uživatele pomocí message.reply()
                    if (i === 0) {
                         firstMessage = await message.reply({ content: chunk });
                         console.log(`--- DEBUG messageHandler: Část 1/${messageChunks.length} úspěšně odeslána (reply).`);
                    } else {
                         // Další části se pošlou jako nové zprávy v tom samém kanálu.
                         // Můžeme je poslat jako odpověď na PRVNÍ odeslanou zprávu bota pro lepší návaznost,
                         // pokud je firstMessage k dispozici.
                         if (firstMessage) {
                              await firstMessage.reply({ content: chunk }); // Odpoví na první odeslanou část bota
                               console.log(`--- DEBUG messageHandler: Část ${i + 1}/${messageChunks.length} úspěšně odeslána (reply na první část).`);
                         } else {
                              await message.channel.send(chunk); // Pokud něco selhalo s první zprávou, pošleme jen jako novou zprávu
                               console.warn(`--- DEBUG messageHandler: První zpráva není k dispozici, část ${i + 1}/${messageChunks.length} odeslána jako samostatná zpráva.`);
                         }
                    }

                } catch (error) {
                    console.error(`❌ Chyba při odesílání části ${i + 1}/${messageChunks.length} odpovědi na Discord:`, error);
                    // Pokud selže odeslání jedné části, můžeme zkusit poslat chybovou zprávu a přestat posílat další části.
                     try {
                          // Zkusíme poslat chybovou zprávu jako reply na původní zprávu nebo jen do kanálu
                          const replyTarget = firstMessage || message; // Odpovíme na první část bota, nebo na původní zprávu uživatele
                           await replyTarget.reply(`Omlouvám se, nepodařilo se odeslat celou odpověď. Došlo k chybě při odesílání části ${i + 1}.`);
                     } catch (fallbackError) {
                          console.error('❌ Chyba při odesílání záložní chybové zprávy:', fallbackError);
                     }
                    // Zastavíme odesílání dalších částí, protože něco selhalo
                    break; // Ukončí loop pro odesílání částí
                }
            } else {
                 console.warn(`--- DEBUG messageHandler: Část ${i + 1}/${messageChunks.length} je prázdná po trimu, nepřeskakuji odeslání.`);
            }
        }

        // === Uložit odpověď bota do historie ===
        // Ukládáme CELOU RAW odpověď z API (fullApiResponse) do historie, ne rozdělené části!
        // Tuto část provedeme POUZE JEDNOU, po pokusu o odeslání všech částí.
        // Měla by se provést, pokud bylo API volání úspěšné (fullApiResponse není null/undefined)
         if (fullApiResponse && typeof fullApiResponse === 'string') { // Kontrola, zda jsme vůbec dostali STRING odpověď z API
             console.log('--- DEBUG messageHandler: Ukládám CELOU RAW odpověď bota do historie DB...');
              try {
                  await db.saveMessageHistory({
                      channel_id: channelId,
                      user_id: message.client.user.id, // ID bota
                      npc_id: npcId,
                      content: fullApiResponse, // Ukládáme CELOU RAW API ODPOVĚĎ (včetně <think> atd.)!
                      is_bot: true
                  });
                  console.log('--- DEBUG messageHandler: Celá RAW odpověď bota uložena do historie DB.');
              } catch (historyErrorBot) {
                   console.error('❌ Chyba při ukládání CELÉ RAW odpovědi bota do historie DB:', historyErrorBot);
              }
         } else {
              console.warn('--- DEBUG messageHandler: FullApiResponse není platný string, neukládám odpověď bota do historie DB.');
         }


    } else {
         console.warn('--- DEBUG messageHandler: Vyčištěná odpověď AI byla prázdná, neodesílám zprávu na Discord.');
    }

    // === Spuštění analýzy paměti (async, neblokuje odeslání zprávy) ===
    // analyzeAndSaveMemory se spustí po pokusu o odeslání zprávy (i když byla prázdná nebo se nepodařilo odeslat)
    // analyzeAndSaveMemory vezme message, PŮVODNÍ RAW odpověď bota (fullApiResponse) a npcId
    // FullApiResponse (RAW) je důležitý pro analýzu, i když se na Discord pošle jen vyčištěná verze (nebo se nepošle nic).
    // Spouštíme analyzeAndSaveMemory asynchronně (bez await), aby neblokovala další zpracování zpráv.
    console.log('--- DEBUG messageHandler: Spouštím analýzu a ukládání paměti...');
    if (npcId) { // Analýza paměti má smysl, jen pokud víme s jakým NPC se konverzuje
         // PŘEDÁVÁME CELÝ RAW API VÝSTUP (fullApiResponse)!
         // analyzeAndSaveMemory by měla být robustní a zvládnout i null nebo prázdný fullApiResponse,
         // aby se analyzovala alespoň historie, pokud AI nevrátila odpověď.
         memoryManager.analyzeAndSaveMemory(message, fullApiResponse, npcId) // <<-- ZDE SE SPUŠTÍ ANALÝZA PAMĚTI
             .then(() => console.log('--- DEBUG messageHandler: Analýza a ukládání paměti dokončeno.'))
             .catch(error => console.error('❌ Chyba během analýzy a ukládání paměti:', error));
    } else {
         console.log('--- DEBUG messageHandler: Přeskakuji analýzu paměti - chybí NPC ID.');
    }

    // TODO: Spustit TTS, pokud je povoleno a odpověď není prázdná.
    // Logika TTS by měla vzít cleanedBotResponse a zkusit vygenerovat a přehrát hlas.

}


// Exportujeme hlavní funkci a pomocné funkce, které jsou potřeba jinde (např. cleanAiResponse pro testování)
// export { handleChatMessage, cleanAiResponse, extractBotResponse }; // POUŽIJEME module.exports

// === Funkce pro čištění odpovědi od AI - DEFINICE ===
// Tato funkce je volána z handleChatMessage. Je definována ZDE a NENÍ potřeba ji importovat shora.
// Definice je výše v souboru.

// === Funkce: Extrakce finální odpovědi z AI výstupu - DEFINICE ===
// Tato funkce je volána z handleChatMessage. Je definována ZDE a NENÍ potřeba ji importovat shora.
// Definice je výše v souboru.


// <<<<<< ZDE ZAČÍNÁ EXPORT FUNKCÍ messageHandler.js >>>>>>>>
module.exports = {
    handleChatMessage, // Exportujeme hlavní funkci pro zpracování zpráv
    cleanAiResponse, // Exportujeme čistící funkci (volitelné, ale může se hodit pro testování)
    extractBotResponse, // Exportujeme extrakční funkci (volitelné, ale může se hodit pro testování)
};
// <<<<<< ZDE KONČÍ EXPORT FUNKCÍ messageHandler.js >>>>>>>>