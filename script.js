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

let currentAuthMode = "login"; // "login" ou "signup"
let mainSwiperInstance = null;
let selectedFile = null;

/* ==========================================================================
   3. INITIALISATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    // Animation du loader GSAP (si présent)
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

    // Écoute de la session Supabase
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            appState.currentUser = session.user;
            checkAdminRights(session.user);
        } else {
            appState.currentUser = null;
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
    initDragAndDrop();

    // Initialisation du lecteur Radio
    initRadioPlayer();
});

/* ==========================================================================
   4. RECUPÉRATION DES DONNÉES SUPABASE
   ========================================================================== */
async function fetchAllFromSupabase() {
    try {
        const isAdmin = Boolean(appState.editMode && appState.currentUser);

        const getQuery = (table) => {
            let q = supabaseClient.from(table).select('*');
            if (!isAdmin) {
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
                img: e.image_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
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
        console.error("Erreur de chargement Supabase :", err);
    }
}

/* ==========================================================================
   5. RENDU DU CARROUSEL & DES GRILLES
   ========================================================================== */
function renderAll() {
    const heroWrapper = document.getElementById('hero-wrapper');
    const newsGrid = document.getElementById('news-grid');
    const showsGrid = document.getElementById('shows-grid');
    const teamGrid = document.getElementById('team-grid');
    
    const isEdit = Boolean(appState.editMode && appState.currentUser);
    const adminTopBar = document.getElementById('admin-top-bar');
    if (adminTopBar) adminTopBar.style.display = isEdit ? 'block' : 'none';

    // 1. CARROUSEL HERO
    if (heroWrapper) {
        if (appState.hero.length === 0) {
            heroWrapper.innerHTML = `
                <div class="swiper-slide hero-slide">
                    <div class="slide-content">
                        <h2>Aucun élément disponible</h2>
                        <p>${isEdit ? 'Ajoutez un élément depuis le panneau d\'administration.' : 'Revenez plus tard pour découvrir nos contenus.'}</p>
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
}

/* ==========================================================================
   6. BASCULE PUBLIER / DÉPUBLIER & TOUT PUBLIER
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
    if (btnSave) {
        btnSave.innerText = "Sauvegarde en cours...";
        btnSave.disabled = true;
    }

    const category = document.getElementById('editor-category')?.value;
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
    if (confirm("Supprimer définitivement cet élément ?")) {
        const { error } = await supabaseClient.from(tableName).delete().eq('id', id);
        if (error) alert("Erreur : " + error.message);
        else await fetchAllFromSupabase();
    }
}

/* ==========================================================================
   9. AUTHENTIFICATION & COMPTE UTILISATEUR
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
        if (typeof appState !== 'undefined') appState.editMode = false; 
        return; 
    }
    const role = user.user_metadata?.role;
    if (typeof appState !== 'undefined') {
        appState.editMode = (role === 'admin');
    }
    document.body.classList.toggle('admin-logged-in', role === 'admin');
    document.body.classList.toggle('edit-mode-active', role === 'admin');
}

function updateAuthUI() {
    const profileZone = document.getElementById('user-profile-zone');
    if (!profileZone) return;

    if (appState && appState.currentUser) {
        const initial = appState.currentUser.email[0].toUpperCase();
        profileZone.innerHTML = `
            <div class="user-badge-container" onclick="toggleAuthModal()" style="cursor:pointer; display:flex; align-items:center; gap:8px;" title="Cliquez pour vous déconnecter">
                <div class="user-avatar" style="background-color: #E50914; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>
                <span class="user-name-label">${appState.editMode ? 'Admin' : 'Membre'}</span>
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
   10. NAVIGATION & ÉDITION ARTICLE - CANVA STUDIO
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
            ::selection { background-color: #E50914 !important; color: #ffffff !important; }
            ::-moz-selection { background-color: #E50914 !important; color: #ffffff !important; }

            #article-modal {
                position: relative !important;
                width: 100% !important;
                min-height: 100vh !important;
                background-color: #f4f4f7 !important;
            }

            header, .navbar, nav { border-bottom: none !important; box-shadow: none !important; }

            .vafm-player-toolbar {
                position: fixed !important;
                bottom: 92px !important;
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
                z-index: 100000 !important;
                box-shadow: 0 -8px 25px rgba(0, 0, 0, 0.5) !important;
            }

            .vafm-tb-label {
                font-size: 0.7rem !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.8px !important;
                color: #E50914 !important;
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

            .vafm-tb-btn svg { width: 16px !important; height: 16px !important; stroke: currentColor !important; stroke-width: 2 !important; fill: none !important; }

            .vafm-tb-btn:hover {
                background: rgba(255, 255, 255, 0.15) !important;
                color: #ffffff !important;
                border-color: rgba(255, 255, 255, 0.3) !important;
                transform: translateY(-2px) !important;
            }

            .vafm-tb-btn.status-published { color: #34c759 !important; }
            .vafm-tb-btn.status-draft { color: #ff9500 !important; }

            .vafm-tb-btn.btn-save:hover { background: #34c759 !important; color: #ffffff !important; border-color: #34c759 !important; }
            .vafm-tb-btn.btn-delete:hover { background: #ff3b30 !important; color: #ffffff !important; border-color: #ff3b30 !important; }

            .canva-layout { width: 100% !important; min-height: 100vh !important; display: flex !important; flex-direction: column !important; }
            .canva-workspace { width: 100% !important; min-height: 100vh !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; background-color: #f4f4f7 !important; display: flex !important; justify-content: center !important; }
            .canva-document { width: 100% !important; max-width: 850px !important; min-height: 100vh !important; margin: 0 auto !important; background: #ffffff !important; padding: 40px 50px 180px 50px !important; box-sizing: border-box !important; border-left: 1px solid #e0e0e8 !important; border-right: 1px solid #e0e0e8 !important; box-shadow: -15px 0 25px -10px rgba(0, 0, 0, 0.07), 15px 0 25px -10px rgba(0, 0, 0, 0.07) !important; }

            .canva-admin-active [contenteditable="true"]:hover,
            .canva-admin-active [contenteditable="true"]:focus {
                outline: 2px dashed #E50914 !important;
                outline-offset: 4px;
                border-radius: 4px;
            }

            blockquote.canva-quote { border-left: 4px solid #E50914; padding-left: 16px; margin: 20px 0; font-style: italic; color: #555; }
        </style>
        <div class="canva-layout ${isAdmin ? 'canva-admin-active' : ''}">
            <main class="canva-workspace">
                <article class="canva-document">
                    <span class="article-category-badge" style="display:inline-block; padding:4px 12px; background:#f0f0f5; border-radius:20px; font-weight:700; font-size:0.75rem; text-transform:uppercase; margin-bottom:15px;">${category}</span>
                    
                    <h1 class="article-title" id="canva-doc-title" ${isAdmin ? 'contenteditable="true"' : ''} style="font-size: 2.5rem; font-weight: 800; margin-bottom: 10px;">${title}</h1>
                    ${date ? `<div class="article-meta" style="color: #8e8e93; font-size:0.85rem; margin-bottom: 25px;">Publié le ${date}</div>` : ''}

                    <div class="article-hero-media" id="canva-doc-media">
                        ${img ? `<img src="${img}" id="canva-img-element" alt="${title}" style="max-width:100%; border-radius:12px; margin:10px 0 30px 0;">` : ''}
                    </div>

                    <div class="article-content" id="canva-doc-content" ${isAdmin ? 'contenteditable="true"' : ''}>
                        ${rawText.split('\n').map(p => `<p>${p}</p>`).join('')}
                    </div>
                </article>
            </main>

            ${isAdmin ? `
                <div class="vafm-player-toolbar">
                    <span class="vafm-tb-label">Studio</span>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter un paragraphe" onclick="addCanvaBlock('p')">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter un titre" onclick="addCanvaBlock('h2')">
                        <svg viewBox="0 0 24 24"><path d="M4 12h16M4 6h16M4 18h10"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter une mise en avant" onclick="addCanvaBlock('quote')">
                        <svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter une image" onclick="document.getElementById('canva-file-input').click()">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input type="file" id="canva-file-input" style="display:none;" accept="image/*" onchange="handleCanvaImageUpload(event)">

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn ${isPublished ? 'status-published' : 'status-draft'}" data-tooltip="${isPublished ? 'En ligne' : 'Brouillon'}" onclick="togglePublish('${tableName}', '${id}', ${isPublished}); openArticleView('${category}', '${id}');">
                        ${isPublished 
                            ? `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                            : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                        }
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn btn-save" data-tooltip="Enregistrer" onclick="saveCanvaArticle('${tableName}', '${id}')">
                        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>

                    <button class="vafm-tb-btn btn-delete" data-tooltip="Supprimer" onclick="deleteItem('${tableName}', '${id}'); closeArticleView();">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-tooltip="Quitter la vue" onclick="closeArticleView()">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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

/* --- FONCTIONS AUXILIAIRES CANVA --- */
function addCanvaBlock(type = 'p') {
    const contentBox = document.getElementById('canva-doc-content');
    if (!contentBox) return;

    let el;
    if (type === 'h2') {
        el = document.createElement('h2');
        el.innerText = "Nouveau titre...";
        el.style.fontSize = "1.5rem";
        el.style.marginTop = "20px";
    } else if (type === 'quote') {
        el = document.createElement('blockquote');
        el.className = 'canva-quote';
        el.innerText = "Citation ou texte en évidence...";
    } else {
        el = document.createElement('p');
        el.innerText = "Nouveau paragraphe... Cliquez pour écrire.";
    }

    contentBox.appendChild(el);
    el.focus();
}

function handleCanvaImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const mediaZone = document.getElementById('canva-doc-media');
            if (mediaZone) {
                mediaZone.innerHTML = `<img src="${e.target.result}" id="canva-img-element" alt="Aperçu" style="max-width:100%; border-radius:12px; margin:10px 0 30px 0;">`;
            }
        };
        reader.readAsDataURL(file);
    }
}

async function saveCanvaArticle(tableName, id) {
    const title = document.getElementById('canva-doc-title')?.innerText.trim();
    const content = document.getElementById('canva-doc-content')?.innerHTML.trim();
    const imgElement = document.getElementById('canva-img-element');
    const fileInput = document.getElementById('canva-file-input');
    
    let imageUrl = imgElement ? imgElement.src : null;

    if (fileInput && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('uploads').upload(fileName, file);
        
        if (!uploadError) {
            const { data: publicUrlData } = supabaseClient.storage.from('uploads').getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
        }
    }

    const titleCol = (tableName === 'animateurs') ? 'nom' : 'titre';
    const textCol = (tableName === 'emissions' || tableName === 'animateurs') ? 'description' : (tableName === 'hero' ? 'texte' : 'contenu');
    const imgCol = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';

    const payload = {
        [titleCol]: title,
        [textCol]: content
    };

    if (imageUrl && !imageUrl.startsWith('data:')) {
        payload[imgCol] = imageUrl;
    }

    const { error } = await supabaseClient
        .from(tableName)
        .update(payload)
        .eq('id', id);

    if (error) {
        alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
        alert("✨ Enregistré avec succès !");
        await fetchAllFromSupabase();
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

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page === 'article') {
        openArticleView(e.state.category, e.state.id);
    } else {
        closeArticleView();
    }
});

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

/* ==========================================================================
   11. LECTEUR AUDIO & MÉTADONNÉES (STABLE & SANS PROXY EXTERNE)
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

    // 1. GESTION DU PLAY / STOP
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

    // 2. EFFET DÉFILEMENT TYPE "RADIO VOITURE"
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

    // 3. RÉCUPÉRATION DU TITRE (EN DIRECT SANS PROXY TIERS)
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
            // Si le navigateur bloque l'accès direct (CORS strict), on affiche un titre par défaut propre sans planter
            lancerDefilementVoiture("VAFM – En Direct");
        }
    }

    updateCurrentTitle();
    setInterval(updateCurrentTitle, 15000);
}