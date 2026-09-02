// ============================================================================
// VAFM — Page dédiée Animateurs (chargée à la demande)
// ============================================================================
// Contrairement à Hero/Actus/Émissions/Vidéos, la collection "animateurs"
// n'est PLUS chargée avec le reste des données de l'accueil (voir script.js,
// fetchAllFromPocketBase). Elle n'est récupérée — et donc les photos
// téléchargées — que la première fois que cette page est réellement ouverte.
// Résultat : zéro coût réseau/images pour l'équipe tant que personne ne
// clique sur "Animateurs".
// ============================================================================

let teamPageLoaded = false;   // true dès que le premier fetch a réussi
let teamPageLoading = false;  // évite un double-fetch si on clique 2x vite

// Ouvre la page Animateurs : affiche le conteneur, masque le reste, et
// déclenche le chargement des données si ce n'est pas déjà fait.
function openTeamPage() {
    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'none';

    // Masque la SPA Actus si on y était (évite d'avoir 2 pages superposées)
    const newsPage = document.getElementById('news-page-spa');
    if (newsPage) {
        newsPage.classList.remove('active');
        newsPage.style.display = 'none';
    }

    const teamPage = document.getElementById('team-page-spa');
    if (teamPage) {
        teamPage.style.display = 'block';
        teamPage.classList.add('active');
    }

    const mainNav = document.getElementById('main-nav-links');
    const newsNav = document.getElementById('news-nav-links');
    if (mainNav) mainNav.style.display = 'none';
    if (newsNav) newsNav.style.display = 'none';

    setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 0);

    if (!teamPageLoaded && !teamPageLoading) {
        fetchAndRenderTeam();
    }
}

// Ferme la page Animateurs et revient à l'accueil (simple alias sur goHome,
// gardé séparé pour rester lisible si ce fichier évolue indépendamment).
function closeTeamPage() {
    if (typeof goHome === 'function') {
        goHome();
    }
}

async function fetchAndRenderTeam() {
    teamPageLoading = true;

    const loadingEl = document.getElementById('team-page-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const res = await fetch(`${POCKETBASE_URL}/api/collections/animateurs/records?perPage=200`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = data.items || [];

        const canSeeDrafts = Boolean(appState.editMode && appState.currentUser);
        const filterPublished = (list) => canSeeDrafts
            ? list
            : list.filter(item => item.is_published === undefined || item.is_published === true || item.is_published === 1);

        appState.team = filterPublished(items).map(anim => ({
            id: anim.id,
            title: anim.nom || anim.name || anim.titre || anim.title || '',
            text: anim.description || anim.role || anim.texte || '',
            role: anim.role || anim.category || 'animateur',
            img: getPocketBaseImageUrl('animateurs', anim.id, anim.image, '400x400') || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400',
            is_published: anim.is_published !== undefined ? Boolean(anim.is_published) : true,
            position: anim.position || 0
        }));

        teamPageLoaded = true;
    } catch (err) {
        console.error("Erreur chargement de l'équipe VAFM :", err);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color:#a1a1aa;">Impossible de charger l'équipe pour le moment. <button class="btn-admin-action" onclick="fetchAndRenderTeam()">Réessayer</button></p>`;
        }
        teamPageLoading = false;
        return;
    }

    teamPageLoading = false;
    if (loadingEl) loadingEl.style.display = 'none';

    renderTeamGrids();
}

function renderTeamGrids() {
    const teamContainers = {
        directeur: document.getElementById('vafm-team-directeur'),
        dj: document.getElementById('vafm-team-dj'),
        animateur: document.getElementById('vafm-team-animateur')
    };

    Object.values(teamContainers).forEach(c => {
        if (c) c.innerHTML = '';
    });

    if (!appState.team || appState.team.length === 0) {
        Object.values(teamContainers).forEach(c => {
            if (c) c.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun membre pour le moment.</p>`;
        });
        return;
    }

    const canEditTeam = canEditCategory('team');

    appState.team.forEach(member => {
        const rawRole = (member.text || member.role || '').toLowerCase();
        let targetKey = 'animateur';
        if (rawRole.includes('directeur') || rawRole.includes('dir')) targetKey = 'directeur';
        else if (rawRole.includes('dj') || rawRole.includes('mix')) targetKey = 'dj';

        const targetContainer = teamContainers[targetKey] || teamContainers['animateur'];
        if (!targetContainer) return;

        const safeName = (member.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const cleanText = typeof stripHTML === 'function' ? stripHTML(member.text) : member.text;

        const cardHTML = `
      <div class="card team-card ${!member.is_published ? 'draft-card' : ''} ${canEditTeam ? 'draggable-card' : ''}"
           data-id="${member.id}">
        ${canEditTeam ? `
        <div class="drag-handle" title="Glisser pour réordonner">☰</div>
        <span class="card-status-tag ${member.is_published ? 'tag-published' : 'tag-draft'}">
          ${member.is_published ? 'Publié' : 'Brouillon'}
        </span>
        <div class="card-admin-actions" onclick="event.stopPropagation();">
          <button class="btn-admin-action ${member.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('animateurs', '${member.id}', ${member.is_published}); event.stopPropagation();">
            ${member.is_published ? 'Dépublier' : 'Publier'}
          </button>
          <button class="btn-admin-action" onclick="openEditorModal('team', '${member.id}'); event.stopPropagation();">✏️</button>
          <button class="btn-admin-action" onclick="deleteItem('animateurs', '${member.id}'); event.stopPropagation();">✕</button>
        </div>
        ` : ''}

        <img
    src="${member.img}"
    class="card-img"
    alt="${safeName}"
    loading="lazy"
    decoding="async"
    width="400"
    height="400"
    onerror="this.src='https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400'"
>

        <div class="card-body">
          <h3>${member.title}</h3>
          <p>${cleanText}</p>
        </div>
      </div>
      `;

        targetContainer.innerHTML += cardHTML;
    });

    if (canEditTeam) {
        initTeamDragAndDrop();
    }
}

let teamSortableInstances = [];

function initTeamDragAndDrop() {
    teamSortableInstances.forEach(inst => inst.destroy());
    teamSortableInstances = [];

    if (typeof Sortable === 'undefined') return;

    const setup = (gridId) => {
        const el = document.getElementById(gridId);
        if (!el) return;

        const sortable = new Sortable(el, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            onEnd: async function () {
                const cards = el.querySelectorAll('.card');
                const updatedOrders = Array.from(cards).map((card, index) => ({
                    id: card.getAttribute('data-id'),
                    position: index + 1
                }));

                await saveNewOrderInDB('animateurs', updatedOrders);
            }
        });

        teamSortableInstances.push(sortable);
    };

    setup('vafm-team-directeur');
    setup('vafm-team-dj');
    setup('vafm-team-animateur');
}
