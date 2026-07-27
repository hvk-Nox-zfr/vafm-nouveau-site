/* ==========================================================================
   1. CONFIGURATION SUPABASE
   ========================================================================== */
const SUPABASE_URL = 'https://blronpowdhaumjudtgvn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJscm9ucG93ZGhhdW1qdWR0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5ODU4MDAsImV4cCI6MjA4NDU2MTgwMH0.ThzU_Eqgwy0Qx2vTO381R0HHvV1jfhsAZFxY-Aw4hXI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================================
   2. ÉTAT DE L'APPLICATION
   ========================================================================== */
let appState = {
    currentUser: null,
    editMode: false,
    hero: [],       
    news: [],       
    shows: [],      
    team: []        
};

let currentAuthMode = "login";
let mainSwiperInstance = null;
let selectedFile = null;

/* ==========================================================================
   3. INITIALISATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    gsap.to(".loader-bar", {
        width: "100%", duration: 1.2, ease: "power2.inOut", onComplete: () => {
            gsap.to("#loader", { 
                y: "-100%", duration: 0.6, ease: "power4.in",
                onComplete: () => { document.getElementById('loader').style.display = 'none'; }
            });
        }
    });

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            appState.currentUser = session.user;
            checkAdminRights(session.user);
        } else {
            appState.currentUser = null;
            appState.editMode = false;
            document.body.classList.remove('admin-logged-in', 'edit-mode-active');
        }
        updateAuthUI();
        fetchAllFromSupabase();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appState.currentUser = session.user;
        checkAdminRights(session.user);
    }

    await fetchAllFromSupabase();
    updateAuthUI();
    initAudioControls();
    initDragAndDrop();
});

/* ==========================================================================
   4. RECUPÉRATION DES DONNÉES SUPABASE
   ========================================================================== */
async function fetchAllFromSupabase() {
    try {
        const isAdmin = appState.editMode;

        const getQuery = (table) => {
            let q = supabaseClient.from(table).select('*');
            if (!isAdmin) q = q.eq('is_published', true);
            return q;
        };

        const [heroData, actusData, emissionsData, animateursData] = await Promise.all([
            getQuery('hero'), getQuery('actus'), getQuery('emissions'), getQuery('animateurs')
        ]);

        if (heroData.data) {
            appState.hero = heroData.data.map(h => ({
                id: h.id, title: h.titre || '', text: h.texte || '', 
                img: h.imageUrl || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200',
                is_published: Boolean(h.is_published)
            }));
        }

        if (actusData.data) {
            appState.news = actusData.data.map(a => ({
                id: a.id, title: a.titre || '', text: a.texte || a.contenu || '', 
                img: a.imageUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600',
                is_published: Boolean(a.is_published)
            }));
        }

        if (emissionsData.data) {
            appState.shows = emissionsData.data.map(e => ({
                id: e.id, title: e.titre || '', text: e.description || '', 
                img: e.image_url || 'https://images.unsplash.com/photo-1557134454-063901f1628d?q=80&w=600',
                is_published: Boolean(e.is_published)
            }));
        }

        if (animateursData.data) {
            appState.team = animateursData.data.map(anim => ({
                id: anim.id, title: anim.nom || '', text: anim.description || '', 
                img: anim.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400',
                is_published: Boolean(anim.is_published)
            }));
        }

        renderAll();
    } catch (err) {
        console.error("Erreur chargement :", err);
    }
}

/* ==========================================================================
   5. RENDU AVEC GESTION DÉPUBLIER / PUBLIER & BOUTON MODIFIER
   ========================================================================== */
function renderAll() {
    const heroWrapper = document.getElementById('hero-wrapper');
    const newsGrid = document.getElementById('news-grid');
    const showsGrid = document.getElementById('shows-grid');
    const teamGrid = document.getElementById('team-grid');
    
    const isEdit = Boolean(appState.editMode && appState.currentUser);
    document.getElementById('admin-top-bar').style.display = isEdit ? 'block' : 'none';

// Rendu Hero (Carrousel)
if (heroWrapper) {
    if (appState.hero.length === 0) {
        heroWrapper.innerHTML = `
            <div class="swiper-slide hero-slide">
                <div class="slide-content">
                    <h2>Aucune diapositive</h2>
                    <p>Ajoutez un élément depuis le panneau d'administration.</p>
                </div>
            </div>`;
    } else {
        heroWrapper.innerHTML = appState.hero.map((slide) => `
            <div class="swiper-slide hero-slide ${!slide.is_published ? 'draft-card' : ''}">
                <img src="${slide.img}" class="slide-bg" alt="${slide.title}">
                <div class="slide-overlay"></div>
                <div class="slide-content">
                    <h1>${slide.title} ${!slide.is_published ? '<small class="draft-badge">(Brouillon)</small>' : ''}</h1>
                    <p>${slide.text}</p>
                    <div class="slide-actions">
                        <button class="btn-more" onclick="openArticleView('hero', '${slide.id}')">Voir plus</button>
                        ${isEdit ? `
                            <button class="btn-admin-action ${slide.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('hero', '${slide.id}', ${slide.is_published}); event.stopPropagation();">
                                ${slide.is_published ? '📥 Dépublier' : '🚀 Publier'}
                            </button>
                            <button class="btn-admin-action" onclick="openEditorModal('hero', '${slide.id}'); event.stopPropagation();">✏️ Modifier</button>
                            <button class="btn-admin-action btn-delete" onclick="deleteItem('hero', '${slide.id}'); event.stopPropagation();">✕</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// Réinitialisation propre & forcée de Swiper
if (mainSwiperInstance) {
    mainSwiperInstance.destroy(true, true);
    mainSwiperInstance = null;
}

if (document.querySelector('.mainSwiper') && appState.hero.length > 0) {
    mainSwiperInstance = new Swiper(".mainSwiper", {
        loop: appState.hero.length > 1,
        speed: 700,
        autoplay: isEdit ? false : { delay: 6000, disableOnInteraction: false },
        pagination: { el: ".swiper-pagination", clickable: true },
        observer: true,
        observeParents: true
    });
}

    // Helper pour générer le HTML d'une grille
const renderGrid = (gridElement, dataArray, category, tableName) => {
    if (!gridElement) return;
    gridElement.innerHTML = dataArray.map((item) => `
        <div class="card ${!item.is_published ? 'draft-card' : ''}" onclick="openArticleView('${category}', '${item.id}')">
            ${isEdit ? `
                <span class="card-status-tag ${item.is_published ? 'tag-published' : 'tag-draft'}">
                    ${item.is_published ? 'Publié' : 'Brouillon'}
                </span>
                <div class="card-admin-actions" onclick="event.stopPropagation();">
                    <button class="btn-admin-action ${item.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('${tableName}', '${item.id}', ${item.is_published}); event.stopPropagation();">
                        ${item.is_published ? 'Dépublier' : 'Publier'}
                    </button>
                    <button class="btn-admin-action" onclick="openEditorModal('${category}', '${item.id}'); event.stopPropagation();">✏️</button>
                    <button class="btn-admin-action" onclick="deleteItem('${tableName}', '${item.id}'); event.stopPropagation();">✕</button>
                </div>
            ` : ''}
            <img src="${item.img}" class="card-img" onerror="this.src='https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600'">
            <div class="card-body">
                <h3>${item.title}</h3>
                <p>${item.text}</p>
            </div>
        </div>
    `).join('');
};

    renderGrid(newsGrid, appState.news, 'news', 'actus');
    renderGrid(showsGrid, appState.shows, 'shows', 'emissions');
    renderGrid(teamGrid, appState.team, 'team', 'animateurs');

    if (mainSwiperInstance) mainSwiperInstance.destroy(true, true);
    mainSwiperInstance = new Swiper(".mainSwiper", {
        loop: appState.hero.length > 1,
        speed: 700,
        autoplay: isEdit ? false : { delay: 6000, disableOnInteraction: false },
        pagination: { el: ".swiper-pagination", clickable: true }
    });
}

/* ==========================================================================
   6. BASCULE PUBLIER / DÉPUBLIER (TOGGLE)
   ========================================================================== */
async function togglePublish(tableName, id, currentStatus) {
    const newStatus = !currentStatus;
    const { error } = await supabaseClient
        .from(tableName)
        .update({ is_published: newStatus })
        .eq('id', id);

    if (error) {
        alert("Erreur lors du changement d'état : " + error.message);
    } else {
        await fetchAllFromSupabase();
    }
}

async function publishAllDrafts() {
    await Promise.all([
        supabaseClient.from('hero').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('actus').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('emissions').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('animateurs').update({ is_published: true }).eq('is_published', false)
    ]);
    await fetchAllFromSupabase();
}

/* ==========================================================================
   7. MODALE ÉDITION & DRAG & DROP
   ========================================================================== */
function openEditorModal(category, id = null) {
    selectedFile = null;
    document.getElementById('editor-category').value = category;
    document.getElementById('editor-item-id').value = id || '';
    document.getElementById('file-preview').innerHTML = '';
    document.getElementById('file-input').value = '';

    if (id) {
        const item = appState[category].find(x => String(x.id) === String(id));
        if (item) {
            document.getElementById('modal-editor-title').innerText = "Modifier la carte";
            document.getElementById('editor-title').value = item.title;
            document.getElementById('editor-text').value = item.text;
            if (item.img) {
                document.getElementById('file-preview').innerHTML = `<img src="${item.img}">`;
            }
        }
    } else {
        document.getElementById('modal-editor-title').innerText = "Ajouter un élément";
        document.getElementById('card-editor-form').reset();
    }

    openModal('card-editor-modal');
}

function closeEditorModal() {
    closeModal('card-editor-modal');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) previewFile(file);
}

function previewFile(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('file-preview').innerHTML = `<img src="${e.target.result}">`;
    };
    reader.readAsDataURL(file);
}

function initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eName => {
        dropZone.addEventListener(eName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eName => {
        dropZone.addEventListener(eName, () => dropZone.classList.add('drop-zone--over'), false);
    });

    ['dragleave', 'drop'].forEach(eName => {
        dropZone.addEventListener(eName, () => dropZone.classList.remove('drop-zone--over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) previewFile(files[0]);
    });
}

/* ==========================================================================
   8. ENREGISTREMENT EN BDD
   ========================================================================== */
async function handleCardFormSubmit(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-card');
    btnSave.innerText = "Sauvegarde en cours...";
    btnSave.disabled = true;

    const category = document.getElementById('editor-category').value; // 'hero', 'news', 'shows', 'team'
    const id = document.getElementById('editor-item-id').value;
    const title = document.getElementById('editor-title').value;
    const text = document.getElementById('editor-text').value;

    let imageUrl = null;

    // 1. Upload de l'image si un fichier a été déposé/sélectionné
    if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${category}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('uploads')
            .upload(fileName, selectedFile, {
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            alert("Erreur lors de l'envoi de l'image : " + uploadError.message);
            btnSave.innerText = "Enregistrer";
            btnSave.disabled = false;
            return;
        }

        // Récupération de l'URL publique de l'image
        const { data: urlData } = supabaseClient.storage
            .from('uploads')
            .getPublicUrl(fileName);
            
        imageUrl = urlData.publicUrl;
    }

    // Correspondance avec les noms de tables Supabase
    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category];

    // 2. Construction du payload adapté
    let payload = {
        [category === 'team' ? 'nom' : 'titre']: title,
        [category === 'shows' || category === 'team' ? 'description' : (category === 'hero' ? 'texte' : 'contenu')]: text,
        is_published: true // Publié directement pour apparition immédiate
    };

    // Attribution de l'image
    if (imageUrl) {
        const imgColumn = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';
        payload[imgColumn] = imageUrl;
    }

    // 3. Action en base de données (Update ou Insert)
    let dbResult;
    if (id) {
        dbResult = await supabaseClient.from(tableName).update(payload).eq('id', id);
    } else {
        dbResult = await supabaseClient.from(tableName).insert([payload]);
    }

    if (dbResult.error) {
        console.error("Erreur Supabase BDD :", dbResult.error);
        alert("Impossible d'enregistrer : " + dbResult.error.message);
    } else {
        closeEditorModal();
        // Recharge immédiatement les données et rafraîchit le carrousel
        await fetchAllFromSupabase();
    }

    btnSave.innerText = "Enregistrer";
    btnSave.disabled = false;
}

async function deleteItem(tableName, id) {
    if (confirm("Supprimer définitivement cet élément ?")) {
        const { error } = await supabaseClient.from(tableName).delete().eq('id', id);
        if (error) alert("Erreur : " + error.message);
        else await fetchAllFromSupabase();
    }
}

/* ==========================================================================
   AUTH & LECTEUR AUDIO
   ========================================================================== */
function openAuthModal() {
    currentAuthMode = "login";
    document.getElementById('auth-title').innerText = "Connexion VAFM";
    openModal('auth-modal');
}

function toggleAuthMode() {
    currentAuthMode = currentAuthMode === "login" ? "register" : "login";
    document.getElementById('auth-title').innerText = currentAuthMode === "login" ? "Connexion VAFM" : "Inscription";
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (currentAuthMode === "login") {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) alert("Erreur : " + error.message);
        else closeModal('auth-modal');
    } else {
        const isAdminEmail = email.toLowerCase().endsWith('@vafm.fr');
        const { error } = await supabaseClient.auth.signUp({ 
            email, password, 
            options: { data: { role: isAdminEmail ? 'admin' : 'member' } } 
        });
        if (error) alert("Erreur : " + error.message);
        else closeModal('auth-modal');
    }
}

async function logout() { await supabaseClient.auth.signOut(); }

function checkAdminRights(user) {
    if (!user) { appState.editMode = false; return; }
    const role = user.user_metadata?.role;
    appState.editMode = (role === 'admin');
    document.body.classList.toggle('admin-logged-in', appState.editMode);
    document.body.classList.toggle('edit-mode-active', appState.editMode);
}

function updateAuthUI() {
    const profileZone = document.getElementById('user-profile-zone');
    if (appState.currentUser) {
        const initial = appState.currentUser.email[0].toUpperCase();
        if (profileZone) {
            profileZone.innerHTML = `
                <div class="user-badge-container" onclick="logout()" style="cursor:pointer;" title="Déconnexion">
                    <div class="user-avatar">${initial}</div>
                    <span class="user-name-label">${appState.editMode ? 'Admin' : 'Membre'}</span>
                </div>
            `;
        }
    } else if (profileZone) {
        profileZone.innerHTML = `<button class="btn-secondary" onclick="openAuthModal()">Se connecter</button>`;
    }
}

/* ==========================================================================
   NAVIGATION & ÉDITION ARTICLE - STYLE CANVA STUDIO
   ========================================================================== */

async function openArticleView(category, id) {
    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category] || 'actus';

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert("Impossible de charger cet article.");
        return;
    }

    const title = data.titre || data.title || data.nom || 'Sans titre';
    const rawText = data.texte || data.description || data.contenu || '';
    const img = data.imageUrl || data.image_url || data.img_url || '';
    const isPublished = Boolean(data.is_published);
    const date = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : '';

    const isAdmin = Boolean(appState && appState.editMode && appState.currentUser);

    const articleContainer = document.getElementById('article-modal');
    if (!articleContainer) return;

    articleContainer.innerHTML = `
       <style>
    /* BARRE D'ÉDITION INTERCONNECTED AU PLAYER AUDIO */
    .vafm-player-toolbar {
        position: fixed !important;
        bottom: 92px !important; /* 🛑 Remonté pour sortir de sous le lecteur */
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: #18181c !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-bottom: none !important;
        border-radius: 12px 12px 0 0 !important;
        padding: 8px 16px !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        z-index: 100000 !important; /* 🛑 Passe OBLIGATOIREMENT au-dessus du player */
        box-shadow: 0 -8px 25px rgba(0, 0, 0, 0.5) !important;
    }

    .vafm-tb-label {
        font-size: 0.7rem !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.8px !important;
        color: #e63946 !important;
        margin-right: 6px !important;
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
    }

    .vafm-tb-divider {
        width: 1px !important;
        height: 18px !important;
        background: rgba(255, 255, 255, 0.15) !important;
        margin: 0 4px !important;
    }

    /* BOUTONS AVEC ICÔNES SVG */
    .vafm-tb-btn {
        position: relative !important;
        background: rgba(255, 255, 255, 0.06) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        color: #b0b0bb !important;
        width: 34px !important;
        height: 34px !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
    }

    .vafm-tb-btn svg {
        width: 16px !important;
        height: 16px !important;
        stroke: currentColor !important;
        stroke-width: 2 !important;
        fill: none !important;
    }

    .vafm-tb-btn:hover {
        background: rgba(255, 255, 255, 0.15) !important;
        color: #ffffff !important;
        border-color: rgba(255, 255, 255, 0.3) !important;
        transform: translateY(-2px) !important;
    }

    /* Statut de publication */
    .vafm-tb-btn.status-published {
        color: #34c759 !important;
    }
    .vafm-tb-btn.status-draft {
        color: #ff9500 !important;
    }

    /* Actions spécifiques */
    .vafm-tb-btn.btn-save:hover {
        background: #34c759 !important;
        color: #ffffff !important;
        border-color: #34c759 !important;
    }

    .vafm-tb-btn.btn-delete:hover {
        background: #ff3b30 !important;
        color: #ffffff !important;
        border-color: #ff3b30 !important;
    }

    /* TOOLTIP PRO AU SURVOL */
    .vafm-tb-btn::after {
        content: attr(data-tooltip) !important;
        position: absolute !important;
        bottom: 135% !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(4px) !important;
        background: #09090b !important;
        color: #f4f4f5 !important;
        padding: 5px 10px !important;
        border-radius: 6px !important;
        font-size: 0.72rem !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        transition: all 0.15s ease-out !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        z-index: 100001 !important;
    }

    .vafm-tb-btn:hover::after {
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateX(-50%) translateY(0) !important;
    }

    /* LAYOUT ET DOCUMENT */
    .canva-workspace {
        width: 100% !important;
        padding: 40px 20px 140px 20px !important;
        box-sizing: border-box !important;
    }

    .canva-document {
        max-width: 800px !important;
        margin: 0 auto !important;
        background: #ffffff !important;
        border-radius: 16px !important;
        padding: 40px !important;
        box-shadow: 0 10px 30px rgba(0,0,0,0.05) !important;
        border: 1px solid #e5e5ea !important;
    }

    .canva-admin-active [contenteditable="true"]:hover,
    .canva-admin-active [contenteditable="true"]:focus {
        outline: 2px dashed #e63946 !important;
        outline-offset: 4px;
        border-radius: 4px;
    }
</style>

        <div class="canva-layout ${isAdmin ? 'canva-admin-active' : ''}">
            
            <main class="canva-workspace">
                <div style="max-width: 800px; margin: 0 auto 20px auto;">
                    <button class="btn-back" onclick="closeArticleView()">← Retour à l'accueil</button>
                </div>

                <article class="canva-document">
                    <span class="article-category-badge">${category}</span>
                    
                    <h1 class="article-title" id="canva-doc-title" ${isAdmin ? 'contenteditable="true"' : ''}>${title}</h1>
                    ${date ? `<div class="article-meta">Publié le ${date}</div>` : ''}

                    <div class="article-hero-media" id="canva-doc-media">
                        ${img ? `<img src="${img}" id="canva-img-element" alt="${title}" style="max-width:100%; border-radius:12px; margin:20px 0;">` : ''}
                    </div>

                    <div class="article-content" id="canva-doc-content" ${isAdmin ? 'contenteditable="true"' : ''}>
                        ${rawText.split('\n').map(p => `<p>${p}</p>`).join('')}
                    </div>
                </article>
            </main>

            <!-- BARRE D'ÉDITION INTERCONNECTÉE AU PLAYER AUDIO -->
            ${isAdmin ? `
                <div class="vafm-player-toolbar">
                    <span class="vafm-tb-label">Studio</span>

                    <!-- Ajouter Paragraphe -->
                    <button class="vafm-tb-btn" data-tooltip="Ajouter un paragraphe" onclick="addCanvaBlock()">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>

                    <!-- Changer Image -->
                    <button class="vafm-tb-btn" data-tooltip="Changer l'image" onclick="document.getElementById('canva-file-input').click()">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input type="file" id="canva-file-input" style="display:none;" accept="image/*" onchange="handleCanvaImageUpload(event)">

                    <div class="vafm-tb-divider"></div>

                    <!-- Statut Publication -->
                    <button class="vafm-tb-btn ${isPublished ? 'status-published' : 'status-draft'}" data-tooltip="${isPublished ? 'En ligne (Cliquer pour dépublier)' : 'Brouillon (Cliquer pour publier)'}" onclick="togglePublish('${tableName}', '${id}', ${isPublished}); openArticleView('${category}', '${id}');">
                        ${isPublished 
                            ? `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                            : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                        }
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <!-- Sauvegarder -->
                    <button class="vafm-tb-btn btn-save" data-tooltip="Enregistrer" onclick="saveCanvaArticle('${tableName}', '${id}')">
                        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>

                    <!-- Supprimer -->
                    <button class="vafm-tb-btn btn-delete" data-tooltip="Supprimer" onclick="deleteItem('${tableName}', '${id}'); closeArticleView();">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            ` : ''}

        </div>
    `;

    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'none';
    
    articleContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    history.pushState({ page: 'article', category, id }, title, `?article=${category}&id=${id}`);
}

/* --- FONCTIONS AUXILIAIRES DE L'ÉDITEUR CANVA --- */

// Ajouter un paragraphe au document
function addCanvaBlock() {
    const contentBox = document.getElementById('canva-doc-content');
    if (contentBox) {
        const newP = document.createElement('p');
        newP.innerText = "Nouveau paragraphe... Cliquez pour écrire.";
        contentBox.appendChild(newP);
        newP.focus();
    }
}

// Prévisualisation de l'image sélectionnée
function handleCanvaImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const mediaZone = document.getElementById('canva-doc-media');
            mediaZone.innerHTML = `<img src="${e.target.result}" id="canva-img-element" alt="Aperçu">`;
        };
        reader.readAsDataURL(file);
    }
}

// Enregistrement des modifications en base de données Supabase
async function saveCanvaArticle(tableName, id) {
    const title = document.getElementById('canva-doc-title')?.innerText.trim();
    const content = document.getElementById('canva-doc-content')?.innerText.trim();
    const imgElement = document.getElementById('canva-img-element');
    const fileInput = document.getElementById('canva-file-input');
    
    let imageUrl = imgElement ? imgElement.src : null;

    // Upload vers Supabase Storage si un nouveau fichier local est choisi
    if (fileInput && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('images').upload(fileName, file);
        
        if (!uploadError) {
            const { data: publicUrlData } = supabaseClient.storage.from('images').getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
        }
    }

    const payload = {
        titre: title,
        texte: content
    };
    if (imageUrl && !imageUrl.startsWith('data:')) payload.imageUrl = imageUrl;

    const { error } = await supabaseClient
        .from(tableName)
        .update(payload)
        .eq('id', id);

    if (error) {
        alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
        alert("✨ Enregistré avec succès !");
    }
}

function closeArticleView() {
    const articleContainer = document.getElementById('article-modal');
    if (articleContainer) {
        articleContainer.style.display = 'none';
        articleContainer.innerHTML = '';
    }
    
    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'block';
    
    history.pushState({ page: 'home' }, '', window.location.pathname);
}

// Gestion de l'historique du navigateur (Retour / Suivant)
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page === 'article') {
        openArticleView(e.state.category, e.state.id);
    } else {
        closeArticleView();
    }
});