// src/web/public/script.js (KOMPLETNÍ KÓD - S Novým Rozložením, Přepínáním Sekcí a Opravenou Správou Paměti)

// Pomocná funkce pro fetch dat z API (GET)
// Zůstává stejná, ale vylepšené logování a chybové hlášky
async function fetchData(endpoint) {
    console.log(`Dashboard frontend: Volám fetchData pro endpoint: ${endpoint}`);
    clearErrors(); // Vymažeme chyby před novým načtením
    try {
        const response = await fetch(endpoint);
        console.log(`Dashboard frontend: Odpověď z ${endpoint} - Status: ${response.status}`);
        if (!response.ok) {
            // Zkusíme parsovat tělo odpovědi jako JSON pro detailnější chybu, ale jen pokud je Content-Type JSON
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const errorData = await response.json();
                displayError(`Chyba API z ${endpoint} (Status: ${response.status}): ${errorData.error || response.statusText}`);
            } else {
                displayError(`Chyba při načítání dat z ${endpoint}: HTTP status ${response.status}`);
            }
            throw new Error(`HTTP error! status: ${response.status} from ${endpoint}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch chyba:', endpoint, error);
        displayError(`Síťová chyba nebo chyba serveru při načítání dat z ${endpoint}. Zkontrolujte logy bota a serveru.`);
        throw error;
    }
}

// Pomocná funkce pro odesílání dat na API (POST, PUT, DELETE)
// Zůstává stejná, ale vylepšené logování a chybové hlášky
async function sendData(endpoint, method, data) {
    console.log(`Dashboard frontend: Volám sendData pro endpoint: ${endpoint}, metoda: ${method}`, data);
    clearErrors(); // Vymažeme chyby před novou operací
    try {
        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const contentType = response.headers.get("content-type");
        let responseData = null;
        if (contentType && contentType.indexOf("application/json") !== -1) {
            try {
                responseData = await response.json();
            } catch (jsonError) {
                console.warn('Dashboard frontend: Nepodařilo se parsovat odpověď jako JSON:', jsonError);
                try {
                    const textResponse = await response.text();
                    console.warn('Dashboard frontend: Odpověď jako text:', textResponse);
                    responseData = { message: textResponse };
                } catch (textError) {
                    console.error('Dashboard frontend: Nepodařilo se získat ani textovou odpověď.', textError);
                    responseData = { error: 'Neznámá chyba v odpovědi serveru.' };
                }
            }
        } else {
            console.warn('Dashboard frontend: Odpověď serveru není JSON.');
            try {
                const textResponse = await response.text();
                console.warn('Dashboard frontend: Odpověď jako text:', textResponse);
                responseData = { message: textResponse };
            } catch (textError) {
                console.error('Dashboard frontend: Nepodařilo se získat ani textovou odpověď.', textError);
                responseData = { error: 'Neznámá chyba v odpovědi serveru.' };
            }
        }

        if (!response.ok) {
            displayError(`Chyba API z ${endpoint} (Status: ${response.status}) při ${method}: ${responseData?.error || responseData?.message || response.statusText || 'Neznámá chyba'}`);
            throw new Error(`HTTP error! status: ${response.status} from ${endpoint} with method ${method}`);
        }

        return responseData;

    } catch (error) {
        console.error('Send chyba:', endpoint, method, error);
        displayError(`Síťová chyba nebo chyba serveru při odesílání dat na ${endpoint} (${method}). Zkontrolujte logy bota a serveru.`);
        throw error;
    }
}


// Funkce pro zobrazení chyb
// Zůstává stejná
function displayError(message) {
    console.error('Frontend Chyba:', message);
    const errorContainer = document.getElementById('error-messages');
    if (errorContainer) {
        errorContainer.style.display = 'block';
        const errorP = document.createElement('p');
        errorP.textContent = message;
        errorContainer.appendChild(errorP);
    }
}

// Funkce pro vymazání chyb
// Zůstává stejná
function clearErrors() {
    const errorContainer = document.getElementById('error-messages');
    if (errorContainer) {
        errorContainer.innerHTML = '';
        errorContainer.style.display = 'none';
    }
}


// --- Pomocná funkce pro formátování uptime ---
// Zůstává stejná
function formatUptime(seconds) {
    if (seconds === null || typeof seconds !== 'number' || seconds < 0) return 'Není k dispozici';

    const days = Math.floor(seconds / (3600 * 24));
    seconds %= (3600 * 24);
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
}
// --- Konec pomocné funkce formatUptime ---


// --- REFERENCE NA HTML ELEMENTY (získáme v onload) ---
// Tyto reference budou k dispozici globálně po window.onload
let botInfoSection;
let memoryNpcSelect;
let memoryUserSelect;
let memoryTableBody;
let memorySubjectHeading;
let addMemoryFormContainer;
let addMemoryForm;
let addActiveChannelForm;
let newActiveChannelGuildIdInput;
let newActiveChannelIdInput;
let newActiveChannelNpcSelect; // Přidána reference pro výběr NPC při přidání kanálu
let activeChannelsUl;
let conversationChannelSelect;
let conversationHistoryDisplay;

// Reference na navigační odkazy a obsahové sekce
let navLinks;
let contentSections;


// === LOGIKA PŘEPÍNÁNÍ SEKCÍ OBSAHU ===
function showSection(sectionId) {
    console.log(`Dashboard frontend: Přepínám na sekci: ${sectionId}`);
    // Skryjeme všechny obsahové sekce
    contentSections.forEach(section => {
        section.classList.remove('active');
        // Můžeme přidat i style.display = 'none' pro jistotu, pokud CSS třída active nezajišťuje skrytí
        section.style.display = 'none';
    });

    // Zobrazíme požadovanou sekci
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add('active');
        activeSection.style.display = 'block'; // Zobrazíme ji

        // Odstraníme 'active' třídu ze všech navigačních odkazů
        navLinks.forEach(link => {
            link.classList.remove('active');
        });

        // Přidáme 'active' třídu na navigační odkaz odpovídající zobrazené sekci
        const activeNavLink = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
        if (activeNavLink) {
            activeNavLink.classList.add('active');
        }

        // === Volání funkcí pro načítání dat pro každou sekci při jejím zobrazení ===
        // Toto zajistí, že data jsou vždy aktuální, když uživatel přepne na danou sekci.
        switch (sectionId) {
            case 'dashboard-overview':
                // Informace o botovi se obnovují intervalem, ale můžeme je zavolat i zde poprvé
                displayBotInfo(); // Obnovíme data info karty
                break;
            case 'memory-management':
                // Načteme seznamy NPC a Uživatelů pro dropdowny v sekci paměti
                // Data paměti se načtou až po výběru z dropdownu
                displayNpcList(); // Naplní dropdown NPC paměti
                displayUserList(); // Naplní dropdown Uživatelů paměti
                // Resetujeme zobrazení paměti při přechodu na sekci
                memorySubjectHeading.textContent = 'Vyberte NPC nebo Uživatele pro zobrazení paměti.';
                memoryTableBody.innerHTML = '<tr><td colspan="3">Vyberte subjekt pro zobrazení paměti.</td></tr>';
                addMemoryFormContainer.style.display = 'none'; // Skryjeme formulář
                memoryNpcSelect.value = ""; // Vyčistíme výběr v drodownech
                memoryUserSelect.value = "";
                break;
            case 'active-channels-management':
                // Načteme seznam aktivních kanálů a naplníme seznam i dropdown pro historii
                populateActiveChannelsList();
                displayNpcListForAddChannel(); // Voláme novou funkci pro naplnění dropdownu NPC v sekci kanálů
                break;
            case 'conversation-history':
                // Dropdown kanálů pro historii se plní spolu s aktivními kanály,
                // ale je třeba znovu načíst seznam aktivních kanálů, pokud uživatel přepne sem přímo.
                populateActiveChannelsList(); // Znovu načteme pro jistotu (naplní i dropdown historie)
                // Resetujeme zobrazení historie při přechodu na sekci
                conversationHistoryDisplay.innerHTML = '<p>Vyberte kanál pro zobrazení historie.</p>';
                conversationChannelSelect.value = ""; // Vyčistíme výběr
                break;
                // TODO: Přidat další case pro případné další sekce (NPC management, API Keys, Logs)
        }

    } else {
        console.error(`❌ Dashboard frontend: Sekce s ID "${sectionId}" nebyla nalezena!`);
        displayError(`Nepodařilo se najít sekci dashboardu s ID: "${sectionId}". Zkontrolujte index.html a JS kód.`);
    }
}

// Funkce pro ošetření kliknutí na navigační odkazy
function handleNavLinkClick(event) {
    event.preventDefault(); // Zabráníme výchozí akci odkazu (skrolování na #anchor)
    const sectionId = event.target.dataset.section; // Získáme ID sekce z data atributu
    if (sectionId) {
        showSection(sectionId); // Zavoláme funkci pro zobrazení sekce
    }
}
// === Konec logiky přepínání sekcí ===


// --- FUNKCE PRO ZOBRAZENÍ INFORMACÍ O BOTOVI ---
// Upraveno pro nové ID elementu (#bot-info je nyní uvnitř karty)
async function displayBotInfo() {
    // Získání reference už je nahoře v globálních proměnných
    if (!botInfoSection) {
        console.error("HTML element pro informace o botovi (#bot-info) nenalezen v displayBotInfo.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Vyčistíme sekci a přidáme placeholder
    botInfoSection.innerHTML = '<p><strong>Tag:</strong> Načítám... </p><p><strong>Status:</strong> Načítám... </p><p><strong>Počet serverů:</strong> Načítám... </p><p><strong>Celkem uživatelů v DB:</strong> Načítám... </p><p><strong>Počet NPC:</strong> Načítám... </p><p><strong>Aktivních kanálů:</strong> Načítám... </p><p><strong>Uptime:</strong> Načítám... </p>';

    console.log('Dashboard frontend: Načítám informace o botovi z /api/bot-info...');

    try {
        // Voláme Tvůj existující endpoint /api/bot-info
        const botInfo = await fetchData('/api/bot-info');

        // Vyčistíme sekci a naplníme ji daty
        botInfoSection.innerHTML = ''; // Vyčistíme před naplněním

        if (!botInfo) {
            botInfoSection.innerHTML += '<p>Nepodařilo se načíst informace o botovi.</p>';
            return;
        }

        // === Zobrazení konkrétních statistik, které očekáváme z backendu ===
        botInfoSection.innerHTML += `<p><strong>Tag:</strong> ${botInfo.tag || 'N/A'}</p>`;
        botInfoSection.innerHTML += `<p><strong>ID:</strong> ${botInfo.id || 'N/A'}</p>`;
        botInfoSection.innerHTML += `<p><strong>Status:</strong> ${botInfo.status || 'N/A'}</p>`;
        botInfoSection.innerHTML += `<p><strong>Na serverech (Guilds):</strong> ${botInfo.serverCount !== undefined ? botInfo.serverCount : 'N/A'}</p>`;
        botInfoSection.innerHTML += `<p><strong>Celkem uživatelů v DB:</strong> ${botInfo.userCount !== undefined ? botInfo.userCount : 'N/A'}</p>`;
        botInfoSection.innerHTML += `<p><strong>Počet NPC:</strong> ${botInfo.loadedNpcCount !== undefined ? botInfo.loadedNpcCount : 'N/A'}</p>`; // Zobrazení počtu NPC (použito loadedNpcCount z backendu)
        // TODO: Na backendu v /api/bot-info by bylo dobré přidat i activeChannelsCount pro zobrazení zde. Teď není k dispozici.
        // botInfoSection.innerHTML += `<p><strong>Aktivních kanálů:</strong> ${botInfo.activeChannelsCount !== undefined ? botInfo.activeChannelsCount : 'N/A'}</p>`; // Zobrazení počtu aktivních kanálů
        botInfoSection.innerHTML += `<p><strong>Uptime:</strong> ${formatUptime(botInfo.uptimeSeconds)}</p>`; // Použijeme uptimeSeconds
        // === Konec zobrazení konkrétních statistik ===

        console.log('Dashboard frontend: Informace o botovi zobrazeny.');

    } catch (error) {
        console.error('❌ Dashboard frontend: Chyba v displayBotInfo:', error);
        // displayError funkce už zobrazí obecnou chybu API
        botInfoSection.innerHTML = '<p>Nepodařilo se načíst informace o botovi.</p>'; // Zobrazíme chybu i v sekci
    }
}

// Interval pro automatické obnovování informací o botovi (spustí se po načtení stránky)
const refreshIntervalMs = 15000; // 15 sekund
let botInfoRefreshInterval; // Proměnná pro uchování reference na interval


// --- FUNKCE PRO SPRÁVU PAMĚTI ---

// Funkce pro zobrazení seznamu NPC (načítá z /api/npcs)
// Tato funkce naplňuje dropdown v sekci Paměti (#memory-npc-select)
async function displayNpcList() {
    // Reference jsou nahoře v globálních proměnných
    if (!memoryNpcSelect) {
        console.error("HTML element pro výběr NPC paměti (#memory-npc-select) nenalezen v displayNpcList.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Přidáme placeholder při načítání
    memoryNpcSelect.innerHTML = '<option value="">-- Načítám NPC --</option>';

    try {
        const npcs = await fetchData('/api/npcs'); // Voláme endpoint /api/npcs

        // Vyčistíme a přidáme placeholder
        memoryNpcSelect.innerHTML = '<option value="">-- Vyberte NPC --</option>';

        if (!npcs || npcs.length === 0) {
            memoryNpcSelect.innerHTML = '<option value="">-- Žádná NPC --</option>';
            return; // Ukončíme, pokud nejsou NPC
        }

        // Naplníme dropdown NPC z dat z API
        npcs.forEach(npc => {
            const option = document.createElement('option');
            option.value = npc.id;
            option.textContent = npc.name || npc.id;
            memoryNpcSelect.appendChild(option);
        });

    } catch (error) {
        memoryNpcSelect.innerHTML = '<option value="">-- Chyba při načítání --</option>';
        console.error('❌ Dashboard frontend: Chyba v displayNpcList (memory select):', error);
    }
}

// Funkce pro zobrazení seznamu uživatelů (načítá z /api/users)
// Tato funkce naplňuje dropdown v sekci Paměti (#memory-user-select)
async function displayUserList() {
    // Reference jsou nahoře v globálních proměnných
    if (!memoryUserSelect) {
        console.error("HTML element pro výběr uživatele paměti (#memory-user-select) nenalezen v displayUserList.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Přidáme placeholder při načítání
    memoryUserSelect.innerHTML = '<option value="">-- Načítám Uživatele --</option>';

    try {
        const users = await fetchData('/api/users'); // Předpokládá endpoint /api/users

        // Vyčistíme a přidáme placeholder
        memoryUserSelect.innerHTML = '<option value="">-- Vyberte Uživatele --</option>';

        if (!users || users.length === 0) {
            memoryUserSelect.innerHTML = '<option value="">-- Žádní Uživatelé --</option>';
            return; // Ukončíme, pokud nejsou Uživatelé
        }

        // Naplníme dropdown Uživatelů z dat z API
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username || 'Neznámý Uživatel'} (${user.id})`;
            memoryUserSelect.appendChild(option);
        });

    } catch (error) {
        memoryUserSelect.innerHTML = '<option value="">-- Chyba při načítání --</option>';
        console.error('❌ Dashboard frontend: Chyba v displayUserList (memory select):', error);
    }
}


// === FUNKCE PRO ZOBRAZENÍ PAMĚTI pro vybraný subjekt (NPC nebo Uživatel) ===
// OPRAVENO volání API endpointu, aby používalo query parametry a přidáno zobrazení/skrytí formuláře
async function displayMemory(subjectType, subjectId) {
    // Získání reference už je nahoře v globálních proměnných
    if (!memoryTableBody || !memorySubjectHeading || !addMemoryFormContainer) {
        console.error("HTML elementy pro zobrazení paměti (#memory-table-body, #memory-subject-heading, #add-memory-form-container) nenalezeny v displayMemory.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Vyčistíme zobrazení a přidáme placeholder
    memorySubjectHeading.textContent = `Načítám paměť pro ${subjectType === 'npc' ? 'NPC' : 'Uživatele'}...`;
    memoryTableBody.innerHTML = '<tr><td colspan="3">Načítám data...</td></tr>';
    addMemoryFormContainer.style.display = 'none'; // Skryjeme formulář při načítání/chybě


    // <<< ZDE JE OPRAVA ENDPOINTU >>>
    // Používáme správný endpoint /api/memory a předáváme parametry v query stringu
    let endpoint = '/api/memory?'; // Začneme základní URL a query stringem
    if (subjectType === 'npc') {
        endpoint += `type=npc&id=${encodeURIComponent(subjectId)}`; // Přidáme type a id do query stringu
    } else if (subjectType === 'user') {
        endpoint += `type=user&id=${encodeURIComponent(subjectId)}`; // Přidáme type a id do query stringu
    } else {
        console.error("❌ Dashboard frontend: displayMemory volána s neznámým subjectType:", subjectType);
        memorySubjectHeading.textContent = 'Neplatný typ subjektu';
        memoryTableBody.innerHTML = '<tr><td colspan="3">Interní chyba: Neplatný typ subjektu pro zobrazení paměti.</td></tr>';
        addMemoryFormContainer.style.display = 'none';
        return; // Ukončíme funkci při neplatném typu
    }
    // TODO: Pokud chceš zobrazovat paměť v kontextu konkrétního kanálu (user+channel), přidej channelId do query stringu zde:
    // Např.: const selectedChannelId = document.getElementById('nejake-vyberove-pole-kanalu')?.value;
    // if (selectedChannelId) { endpoint += `&channelId=${encodeURIComponent(selectedChannelId)}`; }


    console.log(`Dashboard frontend: Načítám paměť z endpointu: ${endpoint}`);

    try {
        const memory = await fetchData(endpoint);

        // Zobrazíme název subjektu a formulář pro přidání paměti pouze po úspěšném načtení
        memorySubjectHeading.textContent = `Paměť pro ${subjectType === 'npc' ? 'NPC' : 'Uživatele'} ${subjectId}`;
        addMemoryFormContainer.style.display = 'block';


        memoryTableBody.innerHTML = ''; // Vyčistíme tabulku před naplněním

        if (!memory || memory.length === 0) {
            memoryTableBody.innerHTML = '<tr><td colspan="3">Pro tento subjekt nebyly nalezeny žádné paměťové záznamy.</td></tr>';
            // Formulář pro přidání paměti ZŮSTÁVÁ zobrazený, i když nejsou žádné záznamy
            return;
        }

        // Naplníme tabulku daty paměti
        memory.forEach(chunk => {
            const row = memoryTableBody.insertRow();
            // Sloupec Klíč
            row.insertCell(0).textContent = chunk.memory_key;
            // Sloupec Hodnota
            const valueCell = row.insertCell(1);
            valueCell.textContent = chunk.memory_value;
            valueCell.style.wordBreak = 'break-word'; // Zalamování dlouhých hodnot
            valueCell.style.whiteSpace = 'pre-wrap'; // Zachová zalomení řádků z DB

            // Sloupec Akce (tlačítka Smazat/Upravit)
            const actionsCell = row.insertCell(2);
            actionsCell.style.whiteSpace = 'nowrap'; // Zabrání zalomení tlačítek

            // Tlačítko Smazat
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Smazat';
            deleteButton.classList.add('delete-button');
            // Uložíme klíč paměti a informace o subjektu do data atributů tlačítka
            deleteButton.dataset.memoryKey = chunk.memory_key;
            deleteButton.dataset.subjectType = subjectType;
            deleteButton.dataset.subjectId = subjectId;
            // TODO: Pokud backend endpoint pro mazání vyžaduje channelId, ulož ho zde z chunk objektu,
            // pokud ho endpoint GET /api/memory?type=... vrací.
            // deleteButton.dataset.channelId = chunk.channel_id; // Předpokládá, že chunk obsahuje channel_id
            actionsCell.appendChild(deleteButton);

            // Tlačítko Upravit
            const editButton = document.createElement('button');
            editButton.textContent = 'Upravit';
            editButton.classList.add('edit-button');
            // TODO: Přidat logiku pro editaci (např. otevření modálního okna s formulářem)
            editButton.onclick = () => alert('Funkce úpravy zatím není plně implementována.');
            actionsCell.appendChild(editButton);
        });

    } catch (error) {
        memorySubjectHeading.textContent = `Chyba při načítání paměti pro ${subjectType === 'npc' ? 'NPC' : 'Uživatele'}`;
        memoryTableBody.innerHTML = '<tr><td colspan="3">Nepodařilo se načíst paměťové záznamy. Zkontrolujte konzoli a logy bota.</td></tr>'; // Vylepšená chybová zpráva
        addMemoryFormContainer.style.display = 'none'; // Skryjeme formulář při chybě
        console.error('❌ Dashboard frontend: Chyba v displayMemory:', error);
        // displayError funkce už zobrazí obecnou chybu API
    }
}

// === FUNKCE PRO MAZÁNÍ PAMĚTI ===
// OPRAVENO volání API endpointu, aby používalo DELETE metodu a posílalo data v těle
async function deleteMemoryChunk(button) { // Přijímáme odkaz na element tlačítka
    // Získáme klíč paměti a informace o subjektu z data atributů tlačítka
    const memoryKeyToDelete = button.dataset.memoryKey;
    const subjectType = button.dataset.subjectType;
    const subjectId = button.dataset.subjectId;
    // TODO: Pokud backend endpoint pro mazání vyžaduje channelId (např. pro kanál-specifickou paměť),
    // získej ho z data atributu zde, který musí být nastaven v displayMemory.
    // const channelIdToDelete = button.dataset.channelId || null;

    if (!memoryKeyToDelete || !subjectType || !subjectId) {
        console.error("Nelze smazat záznam paměti, chybí klíč nebo informace o subjektu v data atributech tlačítka.");
        alert('Chyba při mazání: Chybí potřebné informace.');
        return; // Zastavíme, pokud chybí data
    }

    if (!confirm(`Opravdu chcete smazat paměťový záznam s klíčem "${memoryKeyToDelete}" pro ${subjectType === 'npc' ? 'NPC' : 'Uživatele'} ${subjectId}? Tato akce je nevratná.`)) {
        return; // Zrušíme mazání, pokud uživatel nepotvrdí
    }

    // Vytvoříme objekt s daty pro smazání, který pošleme v těle DELETE požadavku
    const dataToDelete = { key: memoryKeyToDelete };
    if (subjectType === 'npc') { dataToDelete.npcId = subjectId; }
    else if (subjectType === 'user') { dataToDelete.userId = subjectId; }
    // TODO: Pokud backend endpoint pro mazání vyžaduje channelId, přidej ho zde:
    // if (channelIdToDelete) { dataToDelete.channelId = channelIdToDelete; }
    // Pamatujte: Backend očekává null pro nepoužité ID, takže pokud paměť NENÍ channel-specifická,
    // channelIdToDelete by měl zůstat null nebo undefined, a neměl by se přidávat do dataToDelete,
    // aby se v backendu použilo IS NULL v DELETE dotazu. Backend (server.js DELETE /api/memory)
    // to již řeší s channelId || null atd.

    try {
        // Voláme správný DELETE endpoint /api/memory s tělem požadavku (posíláme dataToDelete)
        const result = await sendData('/api/memory', 'DELETE', dataToDelete); // <<< ZDE JE SPRÁVNÉ VOLÁNÍ DELETE API

        console.log('Dashboard frontend: Výsledek mazání záznamu paměti:', result);
        // Zkontrolujeme odpověď od serveru, zda smazání proběhlo úspěšně
        // Backend server.js vrací affectedRows v případě úspěchu (nebo nenalezení)
        if (result && result.affectedRows > 0) { // Očekáváme affectedRows > 0 pro úspěch
             alert(`Paměťový záznam s klíčem "${memoryKeyToDelete}" úspěšně smazán.`);
        } else if (result && result.affectedRows === 0) {
             alert(`Paměťový záznam s klíčem "${memoryKeyToDelete}" nebyl nalezen (nic nebylo smazáno).`);
        }
        // Pokud server vrátil status 404, sendData už zobrazí chybu

        // Obnovíme zobrazení paměti pro aktuálně vybraný subjekt po smazání
        // Získáme aktuálně vybraný subjekt z dropdownů (měl by být stejný jako subjekt smazaného záznamu)
        const currentSubjectType = memoryNpcSelect.value ? 'npc' : (memoryUserSelect.value ? 'user' : null);
        const currentSubjectId = memoryNpcSelect.value || memoryUserSelect.value;

        if (currentSubjectId && currentSubjectType) { // Obnovíme jen pokud je nějaký subjekt vybrán
            displayMemory(currentSubjectType, currentSubjectId); // Voláme displayMemory se správnými parametry subjektu
        } else {
            // Pokud po smazání není vybrán žádný subjekt (stalo by se, kdyby smazaný byl jediný a dropdowny se resetovaly)
            memorySubjectHeading.textContent = 'Vyberte NPC nebo Uživatele pro zobrazení paměti.';
            memoryTableBody.innerHTML = '<tr><td colspan="3">Vyberte subjekt pro zobrazení paměti.</td></tr>';
            addMemoryFormContainer.style.display = 'none';
        }


    } catch (error) {
        console.error('❌ Dashboard frontend: Chyba při mazání záznamu paměti:', error);
        // displayError funkce už zobrazí obecnou chybu API
        // alert je již zobrazen v případě chyby API v sendData
    }
}

// Posluchač kliknutí v tabulce paměti (event delegation pro tlačítka Smazat/Upravit)
// Tento posluchač volá deleteMemoryChunk nebo handler pro editaci
function handleMemoryTableClick(event) { // Přejmenováno pro větší obecnost
    // Kontrolujeme, zda kliknutí bylo na tlačítko s třídou 'delete-button'
    if (event.target && event.target.classList.contains('delete-button')) {
        // Voláme funkci deleteMemoryChunk a předáváme odkaz na tlačítko, na které bylo kliknuto
        deleteMemoryChunk(event.target); // Předáváme odkaz na kliknuté tlačítko
    }
    // TODO: Přidat logiku pro kliknutí na tlačítko Upravit ('edit-button')
    if (event.target && event.target.classList.contains('edit-button')) {
        // handleEditMemoryClick(event.target); // Příklad volání funkce pro editaci
    }
}

// --- LOGIKA PRO PŘIDÁNÍ PAMĚTI ---
// Funkce handleAddMemoryFormSubmit zůstává, volá správně POST /api/memory s tělem.
// Zajišťuje správné npcId a userId pro POST požadavek.
async function handleAddMemoryFormSubmit(event) {
    event.preventDefault();

    // Získání odkazů na výběrová pole (reference by měly být k dispozici z window.onload)
    // memoryNpcSelect a memoryUserSelect

    const npcId = memoryNpcSelect.value || null;
    const userId = memoryUserSelect.value || null;
    // TODO: Pokud chceš přidávat paměť v kontextu konkrétního kanálu, získej channelId z příslušného výběrového pole
    // const channelId = document.getElementById('nejake-vyberove-pole-kanalu-pridani')?.value || null;
    const channelId = null; // Prozatím vždy null, pokud není implementováno výběrové pole kanálu

    // Pokud není vybrán ani uživatel, ani NPC, nemůžeme přidat paměť
    if (!npcId && !userId) {
        alert('Před přidáním paměti musíte vybrat NPC nebo Uživatele.');
        return; // Zastavíme, pokud není vybrán subjekt
    }


    const keyInput = document.getElementById('new-memory-key');
    const valueInput = document.getElementById('new-memory-value');
    const relevanceInput = document.getElementById('new-memory-relevance'); // Reference na input relevance - TOTO POLE SE AKTUÁLNĚ NEPOUŽÍVÁ NA BACKENDU (database.js saveMemoryChunk)

    const newMemory = {
        channelId: channelId, // null pokud není implementováno výběrové pole
        userId: userId, // null pokud není vybráno
        npcId: npcId, // null pokud není vybráno
        key: keyInput.value.trim(), // Ořežeme mezery
        value: valueInput.value.trim(), // Ořežeme mezery
        // relevance: parseFloat(relevanceInput.value) || 0.5 // Relevance se aktuálně na backendu neukládá
    };

    if (!newMemory.key || !newMemory.value) {
        alert('Klíč a Hodnota paměti jsou povinné.');
        return; // Zastavíme, pokud chybí klíč nebo hodnota
    }

    // Kontrola relevance - pokud se má posílat na backend a ukládat
    // if (relevanceInput && isNaN(parseFloat(relevanceInput.value))) {
    //     alert('Relevance musí být číslo.');
    //     return; // Zastavíme, pokud relevance není číslo
    // }
    // Pokud relevance nechcete posílat, odstraňte řádek newMemory.relevance výše.


    try {
        // Voláme správný endpoint POST /api/memory s tělem požadavku (objekt newMemory)
        // sendData zpracuje odpovědi serveru (včetně 409 Conflict z backendu pro duplikáty klíčů, pokud db.saveMemoryChunk to tak indikuje)
        const result = await sendData('/api/memory', 'POST', newMemory); // <<< ZDE JE SPRÁVNÉ VOLÁNÍ POST API

        console.log('Dashboard frontend: Výsledek přidání/aktualizace záznamu paměti:', result);
        // sendData vyhodí chybu při response.ok === false, takže sem se dostaneme jen při úspěšném 2xx stavu
        // Backend server.js vrací { message: 'Paměťový záznam uložen/aktualizován.', result: ... } při úspěchu

        alert(result.message || 'Nový paměťový záznam úspěšně uložen/aktualizován!');
        // Vyčistíme formulář po úspěšném přidání/aktualizaci
        keyInput.value = '';
        valueInput.value = '';
        // if (relevanceInput) relevanceInput.value = 0.5; // Vyčistíme relevance, pokud existuje input

        // Obnovíme zobrazení paměti pro aktuálně vybraný subjekt
        // Získáme aktuálně vybraný subjekt z dropdownů
        const currentSubjectType = memoryNpcSelect.value ? 'npc' : (memoryUserSelect.value ? 'user' : null);
        const currentSubjectId = memoryNpcSelect.value || memoryUserSelect.value;

        if (currentSubjectId && currentSubjectType) { // Obnovíme jen pokud je nějaký subjekt vybrán
            displayMemory(currentSubjectType, currentSubjectId); // Voláme displayMemory se správnými parametry
        }


    } catch (error) {
        console.error('❌ Dashboard frontend: Chyba při přidávání záznamu paměti:', error);
        // displayError funkce už zobrazí obecnou chybu API nebo validace z backendu.
        // alert je již zobrazen v případě chyby API v sendData
    }
}


// --- LOGIKA PRO SPRÁVU AKTIVNÍCH KANÁLŮ ---

// Funkce pro naplnění UL seznamu aktivních kanálů a dropdownu historie
// Tato funkce volá populateConversationChannelSelect()
async function populateActiveChannelsList() {
    // Reference jsou nahoře v globálních proměnných
    if (!activeChannelsUl || !conversationChannelSelect) {
        console.error("HTML elementy pro seznam aktivních kanálů (#active-channels-ul) nebo výběr kanálu historie (#conversation-channel-select) nenalezeny v populateActiveChannelsList.");
        return; // Zastavíme, pokud elementy nenajdeme
    }

    activeChannelsUl.innerHTML = '<li>Načítám aktivní kanály...</li>'; // Placeholder


    try {
        const activeChannels = await fetchData('/api/active-channels'); // Předpokládá endpoint /api/active-channels (GET)

        activeChannelsUl.innerHTML = ''; // Vyčistíme seznam před naplněním
        if (!activeChannels || activeChannels.length === 0) {
            activeChannelsUl.innerHTML = '<li>Žádné aktivní kanály nenalezeny.</li>';
            populateConversationChannelSelect([]); // Naplníme dropdown historie prázdným seznamem
            return; // Ukončíme, pokud nejsou aktivní kanály
        }

        // Naplníme seznam aktivních kanálů
        activeChannels.forEach(channel => {
            const listItem = document.createElement('li');
            // Můžeš zde zobrazit i jméno kanálu nebo guildy, pokud by backend endpoint poskytoval tyto informace
            listItem.textContent = `Kanál: ${channel.channel_id} (Guild: ${channel.guild_id}) | NPC: ${channel.npc_id || 'N/A'}`; // Zobraz NPC ID
            listItem.dataset.channelId = channel.channel_id; // Přidáme channelId pro budoucí reference

            // Tlačítko Odebrat
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Odebrat';
            removeButton.classList.add('remove-button');
            removeButton.dataset.channelId = channel.channel_id; // Uložíme ID kanálu do data atributu pro mazání

            listItem.appendChild(removeButton);
            activeChannelsUl.appendChild(listItem);
        });

        populateConversationChannelSelect(activeChannels); // Předáme načtený seznam kanálů k naplnění dropdownu historie


    } catch (error) {
        activeChannelsUl.innerHTML = '<li>Chyba při načítání aktivních kanálů.</li>';
        // conversationChannelSelect.innerHTML = '<option value="">-- Chyba při načítání --</option>'; // Tohle se udělá v populateConversationChannelSelect()
        console.error('❌ Dashboard frontend: Chyba v populateActiveChannelsList:', error);
        populateConversationChannelSelect([]); // V případě chyby načítání, také zavoláme plnění dropdownu historie s prázdným seznamem
    }
}

// Funkce pro naplnění dropdownu s NPC v sekci Přidat kanál (#new-active-channel-npc-select)
async function displayNpcListForAddChannel() {
    // Reference je nahoře v globální proměnné
    if (!newActiveChannelNpcSelect) {
        console.error("HTML element pro výběr NPC pro přidání kanálu (#new-active-channel-npc-select) nenalezen v displayNpcListForAddChannel.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Přidáme placeholder při načítání
    newActiveChannelNpcSelect.innerHTML = '<option value="">-- Načítám NPC --</option>';

    try {
        const npcs = await fetchData('/api/npcs'); // Voláme endpoint /api/npcs

        // Vyčistíme a přidáme placeholder
        newActiveChannelNpcSelect.innerHTML = '<option value="">-- Vyberte NPC --</option>';

        if (!npcs || npcs.length === 0) {
            newActiveChannelNpcSelect.innerHTML = '<option value="">-- Žádná NPC --</option>';
            return; // Ukončíme, pokud nejsou NPC
        }

        // Naplníme dropdown NPC z dat z API
        npcs.forEach(npc => {
            const option = document.createElement('option');
            option.value = npc.id;
            option.textContent = npc.name || npc.id;
            newActiveChannelNpcSelect.appendChild(option);
        });

    } catch (error) {
        newActiveChannelNpcSelect.innerHTML = '<option value="">-- Chyba při načítání --</option>';
        console.error('❌ Dashboard frontend: Chyba v displayNpcListForAddChannel:', error);
    }
}


// Funkce pro zpracování odeslání formuláře pro přidání aktivního kanálu
// Využívá sendData pro POST /api/active-channels
async function handleAddActiveChannelFormSubmit(event) {
    event.preventDefault(); // Zabráníme standardnímu odeslání formuláře

    // Reference jsou nahoře v globálních proměnných
    if (!newActiveChannelGuildIdInput || !newActiveChannelIdInput || !newActiveChannelNpcSelect) {
        console.error("HTML elementy pro formulář přidání kanálu (#add-active-channel-form, #new-active-channel-guild-id, #new-active-channel-id, #new-active-channel-npc-select) nenalezeny v handleAddActiveChannelFormSubmit.");
        return; // Zastavíme, pokud elementy nenajdeme
    }


    const guildId = newActiveChannelGuildIdInput.value.trim();
    const channelId = newActiveChannelIdInput.value.trim();
    const npcId = newActiveChannelNpcSelect.value; // Získáme vybrané NPC ID z dropdownu

    if (!guildId || !channelId || !npcId) { // NPC ID je nyní povinné pro přidání aktivního kanálu dle backendu
        alert('Musíte zadat ID Guildy, ID Kanálu a vybrat NPC, které má být v kanálu aktivní.');
        return; // Zastavíme, pokud chybí data
    }

    const channelData = { guildId: guildId, channelId: channelId, npcId: npcId };

    try {
        // Voláme správný endpoint /api/active-channels (POST)
        // sendData zpracuje chyby (včetně 409 Conflict z backendu)
        const result = await sendData('/api/active-channels', 'POST', channelData);

        console.log('Dashboard frontend: Výsledek přidání kanálu:', result);
        // sendData vyhodí chybu při response.ok === false, takže sem se dostaneme jen při úspěšném 2xx stavu
        // Backend server.js vrací { message: ..., added: true } při úspěchu

        alert(result.message || 'Kanál úspěšně přidán.');

        populateActiveChannelsList(); // Znovu načteme seznam aktivních kanálů (aktualizuje UL i dropdown historie)

        // Vyčistíme formulář po úspěšném přidání
        newActiveChannelGuildIdInput.value = '';
        newActiveChannelIdInput.value = '';
        newActiveChannelNpcSelect.value = ""; // Vyčistíme výběr NPC


    } catch (error) {
        console.error('❌ Dashboard frontend: Chyba při přidávání aktivního kanálu:', error);
        // displayError funkce už zobrazí obecnou chybu API nebo validace z backendu.
        // alert je již zobrazen v případě chyby API v sendData
    }
}

// Funkce pro zpracování kliknutí na tlačítko Odebrat aktivní kanál (event delegation)
// Posluchač je nastaven v window.onload na UL elementu
// Využívá sendData pro DELETE /api/active-channels/:channelId
async function handleRemoveActiveChannel(channelId) {
    if (!confirm(`Opravdu chcete odebrat kanál s ID ${channelId} ze seznamu aktivních? Tím se bot v tomto kanálu přestane účastnit konverzací s NPC. Tato akce je nevratná.`)) { // Vylepšený text potvrzení
        return; // Zrušíme mazání, pokud uživatel nepotvrdí
    }


    try {
        // Voláme správný DELETE endpoint /api/active-channels/:channelId
        const result = await sendData(`/api/active-channels/${channelId}`, 'DELETE'); // <<< ZDE JE SPRÁVNÉ VOLÁNÍ DELETE API pro kanály

        console.log('Dashboard frontend: Výsledek odebrání kanálu:', result);
        // sendData vyhodí chybu při response.ok === false, takže sem se dostaneme jen při úspěšném 2xx stavu
        // Backend server.js vrací { message: ..., deleted: true } při úspěchu (nebo 404 s chybou, pokud nenalezeno)

        alert(result.message || `Kanál ${channelId} úspěšně odebrán.`);
        populateActiveChannelsList(); // Znovu načteme seznam aktivních kanálů (aktualizuje UL i dropdown historie)


    } catch (error) {
        console.error(`❌ Dashboard frontend: Chyba při odebírání aktivního kanálu ${channelId}:`, error);
        // displayError funkce už zobrazí obecnou chybu API nebo validace z backendu.
        // alert je již zobrazen v případě chyby API v sendData
    }
}


// --- LOGIKA PRO KONVERZAČNÍ HISTORII ---

// Funkce pro naplnění dropdownu kanálů pro historii (#conversation-channel-select)
// Tato funkce je VOLÁNA Z populateActiveChannelsList()
function populateConversationChannelSelect(channels) {
    // Reference je nahoře v globální proměnné
    if (!conversationChannelSelect) {
        console.error("Element #conversation-channel-select nenalezen pro plnění v populateConversationChannelSelect.");
        return; // Zastavíme, pokud element nenajdeme
    }


    // Vyčistíme a přidáme placeholder
    conversationChannelSelect.innerHTML = '<option value="">-- Vyberte Kanál --</option>';

    if (!channels || channels.length === 0) {
        conversationChannelSelect.innerHTML = '<option value="">-- Žádné aktivní kanály --</option>';
        return; // Ukončíme, pokud nejsou kanály
    }

    // Naplníme dropdown kanálů z dat z API
    channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel.channel_id; // Hodnota bude ID kanálu
        // Zobrazíme ID kanálu a ID Guildy
        option.textContent = `Kanál ${channel.channel_id} (Guild ${channel.guild_id})`; // Text v dropdownu
        conversationChannelSelect.appendChild(option);
    });
}


// Funkce pro zobrazení konverzační historie pro vybraný kanál
// Využívá fetchData pro GET /api/conversations/:channelId
async function displayConversationHistory(channelId) {
    // Reference je nahoře v globální proměnné
    if (!conversationHistoryDisplay) {
        console.error("Element #conversation-history-display nenalezen v displayConversationHistory.");
        return; // Zastavíme, pokud element nenajdeme
    }

    // Vyčistíme a přidáme placeholder
    conversationHistoryDisplay.innerHTML = '<p>Načítám historii...</p>';

    if (!channelId) {
        conversationHistoryDisplay.innerHTML = '<p>Vyberte kanál pro zobrazení historie.</p>';
        return; // Zastavíme, pokud není vybrán kanál
    }

    const limit = 100; // Kolik posledních zpráv se má načíst
    const endpoint = `/api/conversations/${channelId}?limit=${limit}`; // Předpokládá endpoint /api/conversations/:channelId (GET)


    try {
        const history = await fetchData(endpoint);

        conversationHistoryDisplay.innerHTML = ''; // Vyčistíme před naplněním

        if (!history || history.length === 0) {
            conversationHistoryDisplay.innerHTML = '<p>Pro tento kanál nebyly nalezeny žádné záznamy konverzace.</p>';
            return; // Ukončíme, pokud není historie
        }

        // Naplníme oblast zobrazení historie
        history.forEach(entry => {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message-entry'); // Třída pro stylování jedné zprávy

            // Zobrazení času
            const timestamp = new Date(entry.created_at); // Předpokládá název sloupce created_at z DB
            const formattedTimestamp = isNaN(timestamp.getTime()) ? 'Neplatný čas' : timestamp.toLocaleString();
            const timestampElement = document.createElement('span');
            timestampElement.classList.add('timestamp');
            timestampElement.textContent = `[${formattedTimestamp}] `;

            // Kontejner pro autora a obsah
            const authorAndContent = document.createElement('div');
            authorAndContent.classList.add('author-and-content');


            // Zobrazení autora (Uživatel nebo Bot)
            const authorElement = document.createElement('span');
            authorElement.classList.add(entry.is_bot ? 'bot-author' : 'user-author'); // Používáme is_bot z DB
            if (entry.is_bot) {
                authorElement.textContent = `${entry.npc_name || entry.npc_id || 'Bot'}: `; // Používáme npc_name nebo npc_id z DB (vrací backend v loadMessageHistory)
            } else {
                authorElement.textContent = `${entry.user_username || entry.user_id || 'Uživatel'}: `; // Používáme user_username nebo user_id z DB (vrací backend v loadMessageHistory)
            }

            // Zobrazení obsahu zprávy
            const contentElement = document.createElement('span');
            const content = entry.content; // Používáme název sloupce content z DB
            contentElement.textContent = content !== null && content !== undefined ? content : '';

            // Sestavení elementu zprávy
            authorAndContent.appendChild(authorElement);
            authorAndContent.appendChild(contentElement);

            messageElement.appendChild(timestampElement);
            messageElement.appendChild(authorAndContent); // Přidáme kontejner autora a obsahu


            conversationHistoryDisplay.appendChild(messageElement); // Přidáme zprávu do historie
        });

        // Srolujeme na konec historie po načtení
        conversationHistoryDisplay.scrollTop = conversationHistoryDisplay.scrollHeight;


    } catch (error) {
        conversationHistoryDisplay.innerHTML = '<p>Nepodařilo se načíst historii konverzace pro tento kanál. Zkontrolujte konzoli a logy bota.</p>'; // Vylepšená chybová zpráva
        console.error('❌ Dashboard frontend: Chyba v displayConversationHistory:', error);
        // displayError funkce už zobrazí obecnou chybu API
    }
}


// --- Kód, který se spustí po načtení stránky (window.onload) ---
window.onload = () => {
    console.log('Dashboard frontend: window.onload spuštěn.');

    // === Získání odkazů na VŠECHNY důležité HTML elementy ===
    // Tyto reference jsou uloženy do globálních proměnných deklarovaných nahoře.
    botInfoSection = document.getElementById('bot-info');

    memoryNpcSelect = document.getElementById('memory-npc-select');
    memoryUserSelect = document.getElementById('memory-user-select');
    memoryTableBody = document.getElementById('memory-table-body');
    memorySubjectHeading = document.getElementById('memory-subject-heading');
    addMemoryFormContainer = document.getElementById('add-memory-form-container');
    addMemoryForm = document.getElementById('add-memory-form');

    addActiveChannelForm = document.getElementById('add-active-channel-form');
    newActiveChannelGuildIdInput = document.getElementById('new-active-channel-guild-id');
    newActiveChannelIdInput = document.getElementById('new-active-channel-id');
    newActiveChannelNpcSelect = document.getElementById('new-active-channel-npc-select'); // Získáme referenci
    activeChannelsUl = document.getElementById('active-channels-ul');

    conversationChannelSelect = document.getElementById('conversation-channel-select');
    conversationHistoryDisplay = document.getElementById('conversation-history-display');

    // Reference na chybové zprávy
    const errorMessagesContainer = document.getElementById('error-messages');
    if (!errorMessagesContainer) {
        console.warn("Dashboard frontend: Element #error-messages pro zobrazení chyb nenalezen.");
    }

    // Reference na navigační odkazy a obsahové sekce
    navLinks = document.querySelectorAll('.sidebar-nav .nav-link'); // Všechny odkazy s třídou .nav-link uvnitř .sidebar-nav
    contentSections = document.querySelectorAll('.main-content .content-section'); // Všechny sekce s třídou .content-section uvnitř .main-content


    // === Kontrola, zda jsou všechny POTŘEBNÉ elementy nalezeny ===
    // Toto je důležité, aby skript nespadl, pokud nějaký element chybí v index.html
    // Zkontrolujte ID v index.html, pokud tato hláška nastane.
    if (!botInfoSection ||
        !memoryNpcSelect || !memoryUserSelect || !memoryTableBody || !memorySubjectHeading || !addMemoryFormContainer || !addMemoryForm ||
        !addActiveChannelForm || !newActiveChannelGuildIdInput || !newActiveChannelIdInput || !newActiveChannelNpcSelect || !activeChannelsUl || // Přidána kontrola newActiveChannelNpcSelect
        !conversationChannelSelect || !conversationHistoryDisplay ||
        navLinks.length === 0 || contentSections.length === 0) { // Kontrola, zda byly nalezeny navigační odkazy a obsahové sekce
        console.error("❌ Dashboard frontend: CHYBA: Některé KLÍČOVÉ HTML elementy dashboardu nebyly nalezeny. Inicializace zastavena.");
        displayError("Některé části dashboardu se nepodařilo inicializovat. Zkontrolujte konzoli a ID elementů v index.html.");
        // Můžeš případně skrýt celý dashboard nebo zobrazit velkou chybovou zprávu
        // document.querySelector('.dashboard-layout').style.display = 'none'; // Příklad skrytí
        return; // Zastavíme inicializaci, pokud chybí klíčové elementy
    }

    // Zalogujeme nalezené elementy pro debugging
    console.log(`Dashboard frontend: Nalezeno ${navLinks.length} navigačních odkazů a ${contentSections.length} obsahových sekcí.`);


    // --- Inicializace dashboardu ---

    // 1. Nastavení posluchačů pro přepínání sekcí
    navLinks.forEach(link => {
        link.addEventListener('click', handleNavLinkClick); // Přidáme posluchač kliknutí
    });

    // 2. Zobrazení úvodní sekce (Dashboard Přehled) při načtení stránky
    // Najdeme navigační odkaz, který má být defaultně aktivní (ten s třídou 'active')
    const defaultNavLink = document.querySelector('.sidebar-nav .nav-link.active');
    if (defaultNavLink) {
        const defaultSectionId = defaultNavLink.dataset.section;
        showSection(defaultSectionId); // Zobrazíme výchozí sekci
    } else {
        console.warn("Dashboard frontend: Nebyl nalezen žádný výchozí aktivní navigační odkaz. Zobrazuji první sekci.");
        // Pokud není definována výchozí aktivní třída, zobrazíme první obsahovou sekci
        if (contentSections.length > 0) {
            showSection(contentSections[0].id);
        }
    }

    // 3. Nastavení intervalu pro automatické obnovování informací o botovi
    // displayBotInfo se volá při zobrazení sekce 'dashboard-overview' funkcí showSection, ale interval se spustí nezávisle
    botInfoRefreshInterval = setInterval(() => { // Ukládáme referenci na interval
        console.log(`Dashboard frontend: Automaticky obnovuji informace o botovi (každých ${refreshIntervalMs / 1000}s).`);
        // Obnovujeme info pouze pokud je aktivní sekce dashboard-overview (není nutné, ale efektivnější)
        // if (document.getElementById('dashboard-overview')?.classList.contains('active')) {
        displayBotInfo(); // Zavoláme displayBotInfo opakovaně
        // }
    }, refreshIntervalMs);


    // 4. Načtení seznamů NPC a Uživatelů pro dropdowny paměti (načteme hned, ať jsou připraveny)
    // displayNpcList() a displayUserList() se volají i při zobrazení sekce memory-management funkcí showSection.
    // Zde je voláme také, aby byly dropdowny naplněny hned po načtení stránky, i když uživatel na sekci paměti nepřepne.
    displayNpcList(); // Naplní dropdown NPC v sekci paměti
    displayUserList(); // Naplní dropdown Uživatelů v sekci paměti


    // 5. Správa Paměti - Nastavení posluchačů pro dropdowny
    memoryNpcSelect.addEventListener('change', (event) => {
        const selectedNpcId = event.target.value;
        memoryUserSelect.value = ""; // Vyčistíme výběr uživatele při výběru NPC
        if (selectedNpcId) {
            displayMemory('npc', selectedNpcId); // Voláme displayMemory pro NPC
        } else {
            // Pokud je vybrána prázdná volba (NPC)
            memorySubjectHeading.textContent = 'Vyberte NPC nebo Uživatele pro zobrazení paměti.';
            memoryTableBody.innerHTML = '<tr><td colspan="3">Vyberte subjekt pro zobrazení paměti.</td></tr>';
            addMemoryFormContainer.style.display = 'none';
        }
    });

    memoryUserSelect.addEventListener('change', (event) => {
        const selectedUserId = event.target.value;
        memoryNpcSelect.value = ""; // Vyčistíme výběr NPC při výběru uživatele
        if (selectedUserId) {
            displayMemory('user', selectedUserId); // Voláme displayMemory pro Uživatele
        } else {
            // Pokud je vybrána prázdná volba (Uživatel)
            memorySubjectHeading.textContent = 'Vyberte NPC nebo Uživatele pro zobrazení paměti.';
            memoryTableBody.innerHTML = '<tr><td colspan="3">Vyberte subjekt pro zobrazení paměti.</td></tr>';
            addMemoryFormContainer.style.display = 'none';
        }
    });

    // Nastavení posluchače na odeslání formuláře pro přidání paměti
    addMemoryForm.addEventListener('submit', handleAddMemoryFormSubmit);

    // Nastavení posluchače na kliknutí v tabulce paměti (pro tlačítka Smazat/Upravit)
    // Používáme event delegation na tbody tabulky paměti
    memoryTableBody.addEventListener('click', handleMemoryTableClick); // Používáme přejmenovanou funkci


    // 6. Správa Aktivních Kanálů - Nastavení posluchačů a načtení seznamu
    // populateActiveChannelsList() a displayNpcListForAddChannel() se volají při zobrazení sekce 'active-channels-management' funkcí showSection.
    // Nemusí se volat zde v onload, pokud nechcete, aby se seznam aktivních kanálů načítal hned při načtení stránky,
    // ale až při přepnutí na příslušnou sekci. Ponechávám volání v showSection.

    // Nastavení posluchače na odeslání formuláře pro přidání aktivního kanálu
    addActiveChannelForm.addEventListener('submit', handleAddActiveChannelFormSubmit);

    // Nastavení posluchače na kliknutí v seznamu aktivních kanálů (event delegation pro tlačítka Odebrat)
    activeChannelsUl.addEventListener('click', (event) => {
        if (event.target && event.target.classList.contains('remove-button')) {
            const channelIdToRemove = event.target.dataset.channelId; // Získáme channelId z data atributu tlačítka
            if (channelIdToRemove) {
                handleRemoveActiveChannel(channelIdToRemove); // Voláme funkci pro odebrání kanálu
            }
        }
    });


    // 7. Konverzační historie - Nastavení posluchačů
    // populateActiveChannelsList() volaná při zobrazení sekce 'active-channels-management' plní i dropdown pro historii.
    // displayConversationHistory() se volá po výběru z dropdownu
    // Nemusí se volat zde v onload, pokud nechcete, aby se seznam aktivních kanálů (a tím i dropdown historie) načítal hned při načtení stránky,
    // ale až při přepnutí na příslušnou sekci. Ponechávám volání v showSection pro sekci 'active-channels-management' a 'conversation-history'.

    // Nastavení posluchače na změnu výběru v dropdownu kanálů pro historii
    conversationChannelSelect.addEventListener('change', (event) => {
        const selectedChannelId = event.target.value;
        // Pokud je vybrána prázdná volba, vyčistíme historii
        if (selectedChannelId) {
             displayConversationHistory(selectedChannelId); // Zavoláme funkci pro zobrazení historie
        } else {
            conversationHistoryDisplay.innerHTML = '<p>Vyberte kanál pro zobrazení historie.</p>'; // Vyčistíme
        }
    });

    // === Konec window.onload ===
};

// Export funkcí pro případné testování (volitelné) - není nutné pro běžný běh
// export { fetchData, sendData, displayError, clearErrors, displayBotInfo, displayNpcList, displayUserList, displayMemory, deleteMemoryChunk, handleAddMemoryFormSubmit, populateActiveChannelsList, handleAddActiveChannelFormSubmit, handleRemoveActiveChannel, displayConversationHistory, populateConversationChannelSelect, formatUptime, showSection, handleNavLinkClick };