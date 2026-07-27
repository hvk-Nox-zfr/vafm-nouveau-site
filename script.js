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
            <div class="card ${!item.is_published ? 'draft-card' : ''}" onclick="if(!appState.editMode) openArticleView('${category}', '${item.id}')">
                ${isEdit ? `
                    <span class="card-status-tag ${item.is_published ? 'tag-published' : 'tag-draft'}">
                        ${item.is_published ? 'Publié' : 'Brouillon'}
                    </span>
                    <div class="card-admin-actions">
                        <button class="btn-admin-action ${item.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('${tableName}', '${item.id}', ${item.is_published}); event.stopPropagation();">
                            ${item.is_published ? 'Dépublier' : 'Publier'}
                        </button>
                        <button class="btn-admin-action" onclick="openEditorModal('${category}', '${item.id}'); event.stopPropagation();">✏️</button>
                        <button class="btn-admin-action" onclick="deleteItem('${tableName}', '${item.id}'); event.stopPropagation();">✕</button>
                    </div>
                ` : ''}
                <img src="${item.img}" class="card-img">
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

function openArticleView(sourceCategory, id) {
    const item = appState[sourceCategory].find(x => String(x.id) === String(id));
    if (!item) return;

    const modal = document.getElementById('article-modal');
    modal.className = "vafm-apple-page is-open";
    modal.innerHTML = `
        <div class="article-scroll-zone" style="padding: 60px 20px; max-width: 800px; margin: 0 auto; color: white;">
            <img src="${item.img}" style="width:100%; height:45vh; object-fit:cover; border-radius:16px; margin-bottom:30px;">
            <h2 style="font-size: 2.5rem; font-weight:800; margin-bottom:20px;">${item.title}</h2>
            <p style="font-size: 1.1rem; line-height: 1.8; color: #d0d0d5;">${item.text}</p>
            <button onclick="closeArticle()" style="margin-top: 40px; padding: 15px 32px; background: #ff0033; color: white; border: none; border-radius: 30px; font-weight: bold; cursor: pointer;">✕ Fermer</button>
        </div>
    `;
}

function closeArticle() { document.getElementById('article-modal').classList.remove('is-open'); }

function initAudioControls() {
    const audioStream = document.getElementById('radio-audio');
    const playBtn = document.querySelector('.control-play-btn');
    if (!audioStream) return;

    async function toggleAudio() {
        if (audioStream.paused) {
            audioStream.load();
            await audioStream.play();
            if (playBtn) playBtn.classList.add('playing');
        } else {
            audioStream.pause();
            if (playBtn) playBtn.classList.remove('playing');
        }
    }

    if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }