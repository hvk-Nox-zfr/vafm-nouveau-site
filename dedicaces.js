// ============================================================================
// VAFM — Dédicaces (bandeau défilant + envoi)
// ============================================================================
// Collection PocketBase attendue : "dedicaces"
//   - message       (text, max 30 caractères)
//   - user          (relation vers "users", optionnel mais recommandé)
//   - is_published  (bool, à activer par défaut côté PocketBase)
//   - created       (auto, géré par PocketBase)
//
// Règles d'API à configurer dans PocketBase (obligatoire) :
//   - List/View  : is_published = true  (public)
//   - Create     : @request.auth.id != ""  (connexion obligatoire)
//   - Update/Delete : réservé à l'admin
// ============================================================================

let dedicacesList = [];
let dedicacesSignature = ''; // empreinte du contenu actuellement affiché

async function fetchAndRenderDedicaces() {
    try {
        // Ajout de &expand=user dans la requête
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

    const newSignature = dedicacesList.map(d => d.id).join(',');
    if (newSignature === dedicacesSignature) return;
    dedicacesSignature = newSignature;

    renderDedicacesTicker();
}

function renderDedicacesTicker() {
    const track = document.getElementById('dedicaces-ticker-track');
    if (!track) return;

    if (dedicacesList.length === 0) {
        track.innerHTML = `<span class="dedicaces-ticker-item">🎶 Soyez le premier à envoyer une dédicace !</span>`;
        track.classList.remove('scrolling');
        return;
    }

    const itemsHtml = dedicacesList
        .map(d => {
            // Récupération du pseudo
            const userName = d.expand?.user?.name || d.expand?.user?.username || 'Anonyme';
            const cleanUser = escapeDedicaceText(userName);
            const cleanMsg = escapeDedicaceText(d.message);

            return `<span class="dedicaces-ticker-item"><strong>${cleanUser}</strong> : ${cleanMsg}</span>`;
        })
        .join('<span class="dedicaces-ticker-sep">•</span>');

    track.innerHTML = itemsHtml + '<span class="dedicaces-ticker-sep">•</span>' + itemsHtml;
    track.classList.add('scrolling');
}

function escapeDedicaceText(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ----------------------------------------------------------------------------
// Formulaire d'envoi (connexion requise)
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
    submitBtn.textContent = 'Vérification…';
    if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('success');
    }

    // Modération IA : on vérifie le message AVANT de le créer dans
    // PocketBase, pour ne jamais publier de contenu inapproprié même
    // brièvement. En cas de souci technique avec la modération elle-même,
    // on refuse par prudence plutôt que de tout laisser passer.
    try {
        const modRes = await fetch('/api/moderate-dedicace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const modData = await modRes.json().catch(() => ({ approved: false, reason: 'technical' }));

        if (!modData.approved) {
            if (feedback) {
                // Message honnête selon la vraie cause : un souci technique de
                // modération ne doit pas laisser croire que le message était
                // vulgaire alors que ce n'est pas ce qui a été évalué.
                feedback.textContent = modData.reason === 'technical'
                    ? "La vérification a rencontré un problème technique, réessaie dans un instant."
                    : "Ce message n'a pas pu être publié (contenu non approprié). Essaie une autre formulation.";
                feedback.classList.remove('success');
            }
            submitBtn.textContent = 'Envoyer ma dédicace';
            updateDedicaceSubmitState();
            return;
        }
    } catch (err) {
        console.error('Erreur de modération :', err);
        if (feedback) feedback.textContent = "La vérification a échoué, réessaie dans un instant.";
        submitBtn.textContent = 'Envoyer ma dédicace';
        updateDedicaceSubmitState();
        return;
    }

    submitBtn.textContent = 'Envoi…';

    try {
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
            feedback.textContent = 'Dédicace envoyée ! Elle apparaît dans le bandeau en haut du site. 🎉';
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

    // Rafraîchit le bandeau régulièrement pour faire apparaître les nouvelles
    // dédicaces sans que les visiteurs aient besoin de recharger la page.
    setInterval(fetchAndRenderDedicaces, 60000);

    // L'état de connexion (appState.currentUser) est déterminé de façon
    // asynchrone par script.js au chargement — on vérifie régulièrement au
    // début, puis on se contente de réagir aux connexions/déconnexions.
    updateDedicaceFormVisibility();
    let authCheckAttempts = 0;
    const authCheckInterval = setInterval(() => {
        updateDedicaceFormVisibility();
        authCheckAttempts++;
        if (authCheckAttempts > 20) clearInterval(authCheckInterval); // ~10s max
    }, 500);
});