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
        const res = await fetch(
            `${POCKETBASE_URL}/api/collections/dedicaces/records?filter=(is_published=true)&sort=-created&perPage=50`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        dedicacesList = data.items || [];
    } catch (err) {
        console.error('Erreur chargement des dédicaces :', err);
        return;
    }

    // On ne reconstruit le bandeau QUE si son contenu a réellement changé.
    // Sans cette vérification, le rafraîchissement périodique (toutes les
    // 60s) réécrivait le HTML à chaque fois — ce qui coupait net l'animation
    // CSS en cours et la faisait repartir de zéro, donnant l'impression que
    // les dédicaces "revenaient" brutalement au lieu de défiler en continu.
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
        .map(d => `<span class="dedicaces-ticker-item">🎤 ${escapeDedicaceText(d.message)}</span>`)
        .join('<span class="dedicaces-ticker-sep">•</span>');

    // On duplique le contenu pour un défilement en boucle parfaitement continu
    // (animation CSS qui translate de -50% : voir dedicaces.css).
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
        const modData = await modRes.json().catch(() => ({ approved: false }));

        if (!modData.approved) {
            if (feedback) {
                feedback.textContent = "Ce message n'a pas pu être publié (contenu non approprié). Essaie une autre formulation.";
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