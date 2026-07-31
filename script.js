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
    userRole: 'member', // 'admin', 'journalist', 'member'
    editMode: false,
    hero: [],       
    news: [],       
    shows: [],      
    team: []        
};

let currentAuthMode = "login";
let mainSwiperInstance = null;
let selectedFile = null;
let sortableInstances = [];

/* ==========================================================================
   3. UTILITIES
   ========================================================================== */
function stripHTML(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || "";
}

// Fonction de vérification des permissions pour une catégorie donnée
function canEditCategory(category) {
    if (!appState.currentUser) return false;
    if (appState.userRole === 'admin') return true;
    if (appState.userRole === 'journalist') {
        return (category === 'hero' || category === 'news' || category === 'actus');
    }
    return false;
}

/* ==========================================================================
   4. INITIALISATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    if (typeof gsap !== 'undefined' && document.querySelector('.loader-bar')) {
        gsap.to(".loader-bar", {
            width: "100%", duration: 1.2, ease: "power2.inOut", onComplete: () => {
                gsap.to("#loader", { 
                    y: "-100%", duration: 0.6, ease: "power4.in",
                    onComplete: () => { 
                        const loader = document.getElementById('loader');
                        if (loader) loader.style.display = 'none'; 
                    }
                });
            }
        });
    } else {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            appState.currentUser = session.user;
            checkAdminRights(session.user);
        } else {
            appState.currentUser = null;
            appState.userRole = 'member';
            appState.editMode = false;
            document.body.classList.remove('admin-logged-in', 'edit-mode-active');
        }
        updateAuthUI();
        await fetchAllFromSupabase();
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appState.currentUser = session.user;
        checkAdminRights(session.user);
    }

    await fetchAllFromSupabase();
    updateAuthUI();
    initFileUploadDragAndDrop();
    initRadioPlayer();
});

/* ==========================================================================
   5. RECUPÉRATION DES DONNÉES SUPABASE (TRIÉES PAR POSITION)
   ========================================================================== */
async function fetchAllFromSupabase() {
    try {
        const canSeeDrafts = Boolean(appState.editMode && appState.currentUser);

        const getQuery = (table) => {
            let q = supabaseClient.from(table).select('*').order('position', { ascending: true });
            if (!canSeeDrafts) {
                q = q.eq('is_published', true);
            }
            return q;
        };

        const [heroData, actusData, emissionsData, animateursData] = await Promise.all([
            getQuery('hero'), getQuery('actus'), getQuery('emissions'), getQuery('animateurs')
        ]);

        if (heroData.data) {
            appState.hero = heroData.data.map(h => ({
                id: h.id, title: h.titre || '', text: h.texte || '', 
                img: h.imageUrl || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200',
                is_published: Boolean(h.is_published), position: h.position || 0
            }));
        }

        if (actusData.data) {
            appState.news = actusData.data.map(a => ({
                id: a.id, title: a.titre || '', text: a.texte || a.contenu || '', 
                img: a.imageUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600',
                is_published: Boolean(a.is_published), position: a.position || 0
            }));
        }

        if (emissionsData.data) {
            appState.shows = emissionsData.data.map(e => ({
                id: e.id, title: e.titre || '', text: e.description || '', 
                img: e.image_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
                is_published: Boolean(e.is_published), position: e.position || 0
            }));
        }

        if (animateursData.data) {
            appState.team = animateursData.data.map(anim => ({
                id: anim.id, title: anim.nom || '', text: anim.description || '', 
                img: anim.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400',
                is_published: Boolean(anim.is_published), position: anim.position || 0
            }));
        }

        renderAll();
    } catch (err) {
        console.error("Erreur de chargement Supabase :", err);
    }
}

/* ==========================================================================
   6. RENDU DU CARROUSEL & DES GRILLES
   ========================================================================== */
function renderAll() {
    const heroWrapper = document.getElementById('hero-wrapper');
    const newsGrid = document.getElementById('news-grid');
    const showsGrid = document.getElementById('shows-grid');
    const teamGrid = document.getElementById('team-grid');
    
    const isEdit = Boolean(appState.editMode && appState.currentUser);
    const adminTopBar = document.getElementById('admin-top-bar');
    if (adminTopBar) adminTopBar.style.display = isEdit ? 'block' : 'none';

    const canEditHero = canEditCategory('hero');

    // 1. CARROUSEL HERO
    if (heroWrapper) {
        if (appState.hero.length === 0) {
            heroWrapper.innerHTML = `
                <div class="swiper-slide hero-slide">
                    <div class="slide-content">
                        <h2>Aucun élément disponible</h2>
                        <p>${canEditHero ? 'Ajoutez un élément depuis le panneau d\'administration.' : 'Revenez plus tard pour découvrir nos contenus.'}</p>
                    </div>
                </div>`;
        } else {
            heroWrapper.innerHTML = appState.hero.map((slide) => `
                <div class="swiper-slide hero-slide ${!slide.is_published ? 'draft-card' : ''}">
                    <img src="${slide.img}" class="slide-bg" alt="${slide.title}">
                    <div class="slide-overlay"></div>
                    <div class="slide-content">
                        <h1>${slide.title} ${!slide.is_published ? '<small class="draft-badge">(Brouillon)</small>' : ''}</h1>
                        <p>${stripHTML(slide.text)}</p>
                        <div class="slide-actions">
                            <button class="btn-more" onclick="openArticleView('hero', '${slide.id}')">Voir plus</button>
                            ${canEditHero ? `
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

    if (mainSwiperInstance) {
        mainSwiperInstance.destroy(true, true);
        mainSwiperInstance = null;
    }

    if (typeof Swiper !== 'undefined' && document.querySelector('.mainSwiper') && appState.hero.length > 0) {
        mainSwiperInstance = new Swiper(".mainSwiper", {
            loop: appState.hero.length > 1,
            speed: 700,
            autoplay: isEdit ? false : { delay: 6000, disableOnInteraction: false },
            pagination: { el: ".swiper-pagination", clickable: true },
            observer: true,
            observeParents: true
        });
    }

    // 2. RENDU DES GRILLES
    const renderGrid = (gridElement, dataArray, category, tableName) => {
        if (!gridElement) return;

        if (dataArray.length === 0) {
            gridElement.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun contenu disponible pour le moment.</p>`;
            return;
        }

        const canEditThisCategory = canEditCategory(category);

        gridElement.innerHTML = dataArray.map((item) => {
            const cleanText = stripHTML(item.text);
            const truncatedText = cleanText.length > 120 ? cleanText.substring(0, 120) + '...' : cleanText;

            return `
            <div class="card ${!item.is_published ? 'draft-card' : ''} ${canEditThisCategory ? 'draggable-card' : ''}" data-id="${item.id}" onclick="openArticleView('${category}', '${item.id}')">
                ${canEditThisCategory ? `
                    <div class="drag-handle" title="Glisser pour réordonner">☰</div>
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
                    <p class="card-text-preview">${truncatedText}</p>
                </div>
            </div>
        `}).join('');
    };

    renderGrid(newsGrid, appState.news, 'news', 'actus');
    renderGrid(showsGrid, appState.shows, 'shows', 'emissions');
    renderGrid(teamGrid, appState.team, 'team', 'animateurs');

    if (isEdit) {
        initGridsDragAndDrop();
    }
}

/* ==========================================================================
   7. DRAG & DROP DES CARTES DANS LES GRILLES (SORTABLEJS)
   ========================================================================== */
function initGridsDragAndDrop() {
    sortableInstances.forEach(inst => inst.destroy());
    sortableInstances = [];

    if (typeof Sortable === 'undefined') return;

    const setupSortable = (gridId, tableName, category) => {
        const el = document.getElementById(gridId);
        if (!el || !canEditCategory(category)) return;

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

                await saveNewOrderInDB(tableName, updatedOrders);
            }
        });

        sortableInstances.push(sortable);
    };

    setupSortable('news-grid', 'actus', 'news');
    setupSortable('shows-grid', 'emissions', 'shows');
    setupSortable('team-grid', 'animateurs', 'team');
}

async function saveNewOrderInDB(tableName, items) {
    for (const item of items) {
        const { error } = await supabaseClient
            .from(tableName)
            .update({ position: item.position })
            .eq('id', item.id);

        if (error) {
            console.error(`Erreur de réorganisation pour ${tableName} (${item.id}) :`, error.message);
        }
    }
}

/* ==========================================================================
   8. PUBLICATION & MODALE ÉDITION
   ========================================================================== */
async function togglePublish(tableName, id, currentStatus) {
    const categoryMap = { 'hero': 'hero', 'actus': 'news', 'emissions': 'shows', 'animateurs': 'team' };
    if (!canEditCategory(categoryMap[tableName] || tableName)) {
        alert("Vous n'avez pas la permission de modifier cet élément.");
        return;
    }

    const newStatus = !currentStatus;
    const now = new Date().toISOString();

    let updatePayload = { is_published: newStatus };
    if (newStatus) {
        updatePayload.created_at = now;
    }

    const { error } = await supabaseClient
        .from(tableName)
        .update(updatePayload)
        .eq('id', id);

    if (error) {
        alert("Erreur lors du changement d'état : " + error.message);
    } else {
        await fetchAllFromSupabase();
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

async function publishAllDrafts() {
    if (appState.userRole === 'admin') {
        await Promise.all([
            supabaseClient.from('hero').update({ is_published: true }).eq('is_published', false),
            supabaseClient.from('actus').update({ is_published: true }).eq('is_published', false),
            supabaseClient.from('emissions').update({ is_published: true }).eq('is_published', false),
            supabaseClient.from('animateurs').update({ is_published: true }).eq('is_published', false)
        ]);
    } else if (appState.userRole === 'journalist') {
        await Promise.all([
            supabaseClient.from('hero').update({ is_published: true }).eq('is_published', false),
            supabaseClient.from('actus').update({ is_published: true }).eq('is_published', false)
        ]);
    }
    await fetchAllFromSupabase();
}

function openEditorModal(category, id = null) {
    if (!canEditCategory(category)) {
        alert("Vous n'avez pas la permission d'éditer cette section.");
        return;
    }

    selectedFile = null;
    const catInput = document.getElementById('editor-category');
    const idInput = document.getElementById('editor-item-id');
    const preview = document.getElementById('file-preview');
    const fileInput = document.getElementById('file-input');

    if (catInput) catInput.value = category;
    if (idInput) idInput.value = id || '';
    if (preview) preview.innerHTML = '';
    if (fileInput) fileInput.value = '';

    const titleEl = document.getElementById('modal-editor-title');

    if (id) {
        const item = appState[category]?.find(x => String(x.id) === String(id));
        if (item) {
            if (titleEl) titleEl.innerText = "Modifier la carte";
            const edTitle = document.getElementById('editor-title');
            const edText = document.getElementById('editor-text');
            if (edTitle) edTitle.value = item.title;
            if (edText) edText.value = item.text;
            if (item.img && preview) {
                preview.innerHTML = `<img src="${item.img}">`;
            }
        }
    } else {
        if (titleEl) titleEl.innerText = "Ajouter un élément";
        const form = document.getElementById('card-editor-form');
        if (form) form.reset();
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
        const preview = document.getElementById('file-preview');
        if (preview) preview.innerHTML = `<img src="${e.target.result}">`;
    };
    reader.readAsDataURL(file);
}

function initFileUploadDragAndDrop() {
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
   9. ENREGISTREMENT EN BDD & SUPPRESSION
   ========================================================================== */
async function handleCardFormSubmit(e) {
    e.preventDefault();

    const category = document.getElementById('editor-category')?.value;
    if (!canEditCategory(category)) {
        alert("Action non autorisée.");
        return;
    }

    const btnSave = document.getElementById('btn-save-card');
    if (btnSave) {
        btnSave.innerText = "Sauvegarde en cours...";
        btnSave.disabled = true;
    }

    const id = document.getElementById('editor-item-id')?.value;
    const title = document.getElementById('editor-title')?.value;
    const text = document.getElementById('editor-text')?.value;

    let imageUrl = null;

    if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${category}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('uploads')
            .upload(fileName, selectedFile, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            alert("Erreur lors de l'envoi de l'image : " + uploadError.message);
            if (btnSave) {
                btnSave.innerText = "Enregistrer";
                btnSave.disabled = false;
            }
            return;
        }

        const { data: urlData } = supabaseClient.storage
            .from('uploads')
            .getPublicUrl(fileName);
            
        imageUrl = urlData.publicUrl;
    }

    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category] || 'actus';

    let authorDisplayName = "Hugo";
    if (appState.currentUser) {
        const email = (appState.currentUser.email || "").toLowerCase();
        if (email.includes("hugo")) {
            authorDisplayName = "Hugo";
        } else {
            authorDisplayName = appState.currentUser.user_metadata?.full_name || email.split('@')[0] || "Rédaction";
        }
    }

    let payload = {
        [category === 'team' ? 'nom' : 'titre']: title,
        [category === 'shows' || category === 'team' ? 'description' : (category === 'hero' ? 'texte' : 'contenu')]: text,
        is_published: true
    };

    if (imageUrl) {
        const imgColumn = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';
        payload[imgColumn] = imageUrl;
    }

    let dbResult;
    if (id) {
        dbResult = await supabaseClient.from(tableName).update(payload).eq('id', id);
    } else {
        payload.author_name = authorDisplayName;
        payload.created_at = new Date().toISOString();
        dbResult = await supabaseClient.from(tableName).insert([payload]);
    }

    if (dbResult.error) {
        console.error("Erreur Supabase BDD :", dbResult.error);
        alert("Impossible d'enregistrer : " + dbResult.error.message);
    } else {
        closeEditorModal();
        await fetchAllFromSupabase();
    }

    if (btnSave) {
        btnSave.innerText = "Enregistrer les modifications";
        btnSave.disabled = false;
    }
}

async function deleteItem(tableName, id) {
    const categoryMap = { 'hero': 'hero', 'actus': 'news', 'emissions': 'shows', 'animateurs': 'team' };
    if (!canEditCategory(categoryMap[tableName] || tableName)) {
        alert("Vous n'avez pas la permission de supprimer cet élément.");
        return;
    }

    if (confirm("Supprimer définitivement cet élément ?")) {
        const { error } = await supabaseClient.from(tableName).delete().eq('id', id);
        if (error) alert("Erreur : " + error.message);
        else await fetchAllFromSupabase();
    }
}

/* ==========================================================================
   10. AUTHENTIFICATION & COMPTE UTILISATEUR
   ========================================================================== */
function toggleAuthModal() {
    if (appState && appState.currentUser) {
        const confirmLogout = confirm("Voulez-vous vous déconnecter du Studio ?");
        if (confirmLogout) logout();
        return;
    }
    openAuthModal();
}

function openAuthModal() {
    currentAuthMode = "login";
    resetAuthUI();
    openModal('auth-modal');
}

function toggleAuthMode() {
    currentAuthMode = (currentAuthMode === "login") ? "signup" : "login";
    updateAuthModalState();
}

function updateAuthModalState() {
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const newsletterOptin = document.getElementById('newsletter-optin-group');

    if (currentAuthMode === "signup") {
        if (authTitle) authTitle.innerText = "Rejoindre le Club VAFM";
        if (authSubtitle) authSubtitle.innerText = "Créez votre compte en quelques secondes";
        if (authSwitchLink) authSwitchLink.innerText = "Déjà membre ? Se connecter";
        if (btnSubmit) btnSubmit.innerText = "S'inscrire";
        if (newsletterOptin) newsletterOptin.style.display = "block";
    } else {
        if (authTitle) authTitle.innerText = "Connexion VAFM";
        if (authSubtitle) authSubtitle.innerText = "Accédez à votre espace ou gérez la station";
        if (authSwitchLink) authSwitchLink.innerText = "Pas encore membre ? S'inscrire avec mon email";
        if (btnSubmit) btnSubmit.innerText = "Se connecter";
        if (newsletterOptin) newsletterOptin.style.display = "none";
    }
}

function resetAuthUI() {
    updateAuthModalState();
    const form = document.getElementById('auth-form');
    if (form) form.reset();
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const newsletterCheckbox = document.getElementById('auth-newsletter');

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const wantsNewsletter = newsletterCheckbox ? newsletterCheckbox.checked : false;

    if (!email || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    if (currentAuthMode === "login") {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            alert("Erreur de connexion : " + error.message);
        } else {
            closeModal('auth-modal');
        }
    } else {
        const isAdminEmail = email.toLowerCase().endsWith('@vafm.fr');
        
        const { data, error } = await supabaseClient.auth.signUp({ 
            email, 
            password, 
            options: { 
                data: { role: isAdminEmail ? 'admin' : 'member' } 
            } 
        });

        if (error) {
            alert("Erreur d'inscription : " + error.message);
            return;
        }

        if (wantsNewsletter) {
            const { error: subError } = await supabaseClient
                .from('subscribers')
                .insert([{ email: email }]);

            if (subError && subError.code !== '23505') {
                console.error("Erreur enregistrement newsletter :", subError.message);
            }
        }

        alert("Inscription réussie !");
        closeModal('auth-modal');
    }
}

async function logout() { 
    if (supabaseClient) {
        await supabaseClient.auth.signOut(); 
    }
    location.reload();
}

function checkAdminRights(user) {
    if (!user) { 
        if (typeof appState !== 'undefined') {
            appState.editMode = false;
            appState.userRole = 'member';
        }
        return; 
    }
    
    const role = user.user_metadata?.role || 'member';
    if (typeof appState !== 'undefined') {
        appState.userRole = role;
        appState.editMode = (role === 'admin' || role === 'journalist');
    }
    
    document.body.classList.toggle('admin-logged-in', role === 'admin' || role === 'journalist');
    document.body.classList.toggle('edit-mode-active', role === 'admin' || role === 'journalist');
}

function updateAuthUI() {
    const profileZone = document.getElementById('user-profile-zone');
    if (!profileZone) return;

    if (appState && appState.currentUser) {
        const initial = appState.currentUser.email[0].toUpperCase();
        let roleLabel = 'Membre';
        if (appState.userRole === 'admin') roleLabel = 'Admin';
        if (appState.userRole === 'journalist') roleLabel = 'Journaliste';

        profileZone.innerHTML = `
            <div class="user-badge-container" onclick="toggleAuthModal()" style="cursor:pointer; display:flex; align-items:center; gap:8px;" title="Cliquez pour vous déconnecter">
                <div class="user-avatar" style="background-color: #E50914; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>
                <span class="user-name-label">${roleLabel}</span>
            </div>
        `;
    } else {
        profileZone.innerHTML = `<button class="btn-secondary" onclick="toggleAuthModal()">Se connecter</button>`;
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        if (id === 'auth-modal') resetAuthUI();
    }
}

/* ==========================================================================
   11. LECTEUR AUDIO & MÉTADONNÉES
   ========================================================================== */
function initRadioPlayer() {
    const audio = document.getElementById("radio-audio");
    const playBtn = document.getElementById("play-btn") || document.getElementById("playBtn");
    const currentShow = document.getElementById("current-show");
    const trackSpan = document.getElementById("current-track");
    const marquee = document.getElementById("marquee");
    const playIcon = playBtn?.querySelector(".icon");

    const STREAM_URL = "https://manager10.streamradio.fr:1555/stream";
    const STATS_URL = "https://manager10.streamradio.fr:1555/status-json.xsl";

    if (!audio || !playBtn) return;

    if (currentShow) {
        currentShow.textContent = "En direct : Le meilleur du son !";
    }

    playBtn.addEventListener("click", async () => {
        try {
            if (audio.paused) {
                audio.src = STREAM_URL;
                audio.load();
                
                await audio.play();
                audio.volume = 1;
                
                if (playIcon) playIcon.textContent = "⏸";
                playBtn.classList.add("playing");
            } else {
                audio.pause();
                audio.src = "";
                
                if (playIcon) playIcon.textContent = "▶";
                playBtn.classList.remove("playing");
            }
        } catch (e) {
            console.warn("Erreur de lecture gérée :", e.message);
            audio.pause();
            audio.src = "";
            if (playIcon) playIcon.textContent = "▶";
            playBtn.classList.remove("playing");
        }
    });

    let animTimeout = null;

    function lancerDefilementVoiture(titre) {
        if (!marquee || !trackSpan) return;

        clearTimeout(animTimeout);

        trackSpan.textContent = titre;
        trackSpan.style.transition = "none";
        trackSpan.style.transform = "translateX(0)";

        animTimeout = setTimeout(() => {
            const containerWidth = marquee.offsetWidth;
            const textWidth = trackSpan.offsetWidth;

            if (textWidth <= containerWidth) return;

            const distance = textWidth - containerWidth + 20;
            const duration = distance * 15;

            trackSpan.style.transition = `transform ${duration}ms linear`;
            trackSpan.style.transform = `translateX(-${distance}px)`;

            animTimeout = setTimeout(() => {
                trackSpan.style.transition = "none";
                trackSpan.style.transform = "translateX(0)";
            }, duration + 1000);

        }, 1000);
    }

    async function updateCurrentTitle() {
        try {
            const response = await fetch(`${STATS_URL}?nocache=${Date.now()}`);
            if (!response.ok) return;

            const data = await response.json();
            let rawTitle = "";

            if (data && data.icestats) {
                let source = data.icestats.source;
                if (Array.isArray(source)) source = source[0];
                if (source) {
                    rawTitle = source.title || source.song || "";
                }
            }

            if (!rawTitle || typeof rawTitle !== "string") {
                lancerDefilementVoiture("VAFM – En Direct");
                return;
            }

            const formattedTitle = rawTitle.replace(" - ", " – ");
            lancerDefilementVoiture(formattedTitle);

            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: formattedTitle,
                    artist: 'VAFM',
                    album: 'En Direct',
                    artwork: [
                        { src: 'VAFM logo rouge.png', sizes: '512x512', type: 'image/png' }
                    ]
                });
            }

        } catch (error) {
            lancerDefilementVoiture("VAFM – En Direct");
        }
    }

    updateCurrentTitle();
    setInterval(updateCurrentTitle, 15000);
}

function setupPlayerCollapse() {
    const footer = document.getElementById('main-footer');
    const player = document.querySelector('.vafm-player-toolbar') 
                || document.querySelector('[class*="player"]') 
                || document.getElementById('vafm-audio-player');

    if (!footer || !player) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                player.classList.add('player-collapsed');
            } else {
                player.classList.remove('player-collapsed');
            }
        });
    }, { threshold: 0.1 });

    observer.observe(footer);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPlayerCollapse);
} else {
    setupPlayerCollapse();
}