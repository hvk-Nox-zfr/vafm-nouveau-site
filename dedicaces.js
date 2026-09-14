// ============================================================================
// VAFM — Dédicaces (bandeau défilant + envoi sécurisé)
// ============================================================================

let dedicacesList = [];
let tickerAnimationId = null;
let currentPosition = 0;
const SCROLL_SPEED = 0.8; // Vitesse de défilement (pixels/frame)

// ----------------------------------------------------------------------------
// MODÉRATION 100% IA (Google Gemini API - Avec Fallback Anti-Surcharge 503)
// ----------------------------------------------------------------------------

async function checkDedicaceSafety(text) {
    try {
        const response = await fetch("/api/check-dedicace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        if (!data.safe) {
            return { 
                isSafe: false, 
                reason: data.reason || "Message refusé par la modération IA." 
            };
        }

        return { isSafe: true };

    } catch (err) {
        console.error("Erreur de connexion à l'API :", err);
        return { isSafe: false, reason: "Impossible de vérifier le message." };
    }
}

// ----------------------------------------------------------------------------
// 2. BANDEAU DÉFILANT CONTINU (BOUCLE INFINIE SANS SACCADE)
// ----------------------------------------------------------------------------

async function fetchAndRenderDedicaces() {
    try {
        const res = await fetch(
            `${POCKETBASE_URL}/api/collections/dedicaces/records?filter=(is_published=true)&sort=-created&perPage=50&expand=user`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        dedicacesList = data.items || [];
    } catch (err) {
        console.error('Erreur chargement des dédicaces :', err);
        return;
    }

    renderDedicacesTicker();
}

function renderDedicacesTicker() {
    const track = document.getElementById('dedicaces-ticker-track');
    if (!track) return;

    if (dedicacesList.length === 0) {
        track.innerHTML = `<span class="dedicaces-ticker-item">🎶 Soyez le premier à envoyer une dédicace !</span>`;
        if (tickerAnimationId) cancelAnimationFrame(tickerAnimationId);
        return;
    }

    // Construction de la chaîne d'items
    const singleSequenceHtml = dedicacesList
        .map(d => {
            const authorName = d.expand?.user?.name || d.expand?.user?.username || 'Membre VAFM';
            const safeName = escapeDedicaceText(authorName);
            const safeMsg = escapeDedicaceText(d.message);
            
            return `<span class="dedicaces-ticker-item"><strong>${safeName} :</strong> ${safeMsg}</span>`;
        })
        .join('<span class="dedicaces-ticker-sep">•</span>');

    // On double le contenu dans deux conteneurs frères pour une boucle 100% sans trou
    track.innerHTML = `
        <div class="ticker-unit" id="ticker-unit-1">${singleSequenceHtml}</div>
        <div class="ticker-unit" id="ticker-unit-2">${singleSequenceHtml}</div>
    `;

    startContinuousTicker(track);
}

function startContinuousTicker(track) {
    if (tickerAnimationId) cancelAnimationFrame(tickerAnimationId);

    const unit1 = document.getElementById('ticker-unit-1');
    if (!unit1) return;

    function step() {
        // La largeur exacte d'un bloc complet de dédicaces
        const unitWidth = unit1.offsetWidth;

        currentPosition += SCROLL_SPEED;

        // Dès que le premier bloc s'est complètement effacé à gauche,
        // on réinitialise la position à 0 de façon totalement invisible
        if (currentPosition >= unitWidth) {
            currentPosition = 0;
        }

        track.style.transform = `translateX(${-currentPosition}px)`;
        tickerAnimationId = requestAnimationFrame(step);
    }

    tickerAnimationId = requestAnimationFrame(step);
}

function escapeDedicaceText(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ----------------------------------------------------------------------------
// 3. FORMULAIRE D'ENVOI
// ----------------------------------------------------------------------------

function updateDedicaceFormVisibility() {
    const loggedOutMsg = document.getElementById('dedicace-logged-out-msg');
    const form = document.getElementById('dedicace-form');
    if (!loggedOutMsg || !form) return;

    const isLoggedIn = Boolean(appState.currentUser);
    loggedOutMsg.style.display = isLoggedIn ? 'none' : 'block';
    form.style.display = isLoggedIn ? 'flex' : 'none';
}

function updateDedicaceCounter() {
    const input = document.getElementById('dedicace-message-input');
    const counter = document.getElementById('dedicace-counter');
    if (!input || !counter) return;
    counter.textContent = `${input.value.length}/30`;
    updateDedicaceSubmitState();
}

function updateDedicaceSubmitState() {
    const input = document.getElementById('dedicace-message-input');
    const checkbox = document.getElementById('dedicace-consent-checkbox');
    const submitBtn = document.getElementById('dedicace-submit-btn');
    if (!input || !checkbox || !submitBtn) return;

    const messageOk = input.value.trim().length > 0 && input.value.length <= 30;
    submitBtn.disabled = !(messageOk && checkbox.checked);
}

async function submitDedicace(event) {
    event.preventDefault();

    const input = document.getElementById('dedicace-message-input');
    const checkbox = document.getElementById('dedicace-consent-checkbox');
    const submitBtn = document.getElementById('dedicace-submit-btn');
    const feedback = document.getElementById('dedicace-feedback');

    const message = input.value.trim();
    if (!message || message.length > 30 || !checkbox.checked) return;

    if (!appState.currentUser) {
        if (feedback) feedback.textContent = 'Vous devez être connecté pour envoyer une dédicace.';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Modération…';
    if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('success');
    }

    // Analyse par l'IA avant d'envoyer à la base de données
    const safetyCheck = await checkDedicaceSafety(message);
    if (!safetyCheck.isSafe) {
        if (feedback) {
            feedback.textContent = safetyCheck.reason || "Votre dédicace contient du contenu inapproprié.";
            feedback.classList.remove('success');
        }
        submitBtn.textContent = 'Envoyer ma dédicace';
        updateDedicaceSubmitState();
        return;
    }

    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfDayISO = startOfDay.toISOString().replace('T', ' ');

        const checkRes = await fetch(
            `${POCKETBASE_URL}/api/collections/dedicaces/records?filter=(user='${appState.currentUser.id}' && created>='${startOfDayISO}')`,
            { headers: getAuthHeaders() }
        );

        if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.totalItems >= 2) {
                if (feedback) {
                    feedback.textContent = 'Vous avez déjà atteint la limite de 2 dédicaces aujourd\'hui.';
                    feedback.classList.remove('success');
                }
                return;
            }
        }

        submitBtn.textContent = 'Envoi…';

        const res = await fetch(`${POCKETBASE_URL}/api/collections/dedicaces/records`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({
                message,
                user: appState.currentUser.id,
                is_published: true
            })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        input.value = '';
        checkbox.checked = false;
        updateDedicaceCounter();
        if (feedback) {
            feedback.textContent = 'Dédicace validée et envoyée dans le bandeau ! 🎉';
            feedback.classList.add('success');
        }

        await fetchAndRenderDedicaces();
    } catch (err) {
        console.error("Erreur d'envoi de la dédicace :", err);
        if (feedback) {
            feedback.textContent = "Une erreur est survenue, réessayez.";
            feedback.classList.remove('success');
        }
    } finally {
        submitBtn.textContent = 'Envoyer ma dédicace';
        updateDedicaceSubmitState();
    }
}

// ----------------------------------------------------------------------------
// Initialisation
// ----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderDedicaces();

    setInterval(fetchAndRenderDedicaces, 60000);

    updateDedicaceFormVisibility();
    let authCheckAttempts = 0;
    const authCheckInterval = setInterval(() => {
        updateDedicaceFormVisibility();
        authCheckAttempts++;
        if (authCheckAttempts > 20) clearInterval(authCheckInterval);
    }, 500);
});