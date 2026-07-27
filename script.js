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
let selectedFile = null; // Pour stocker l'image sélectionnée dans la modale

/* ==========================================================================
   3. INITIALISATION ET CHARGEMENT SUPABASE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    // Animation du Loader
    gsap.to(".loader-bar", {
        width: "100%", duration: 1.2, ease: "power2.inOut", onComplete: () => {
            gsap.to("#loader", { 
                y: "-100%", 
                duration: 0.6, 
                ease: "power4.in",
                onComplete: () => { document.getElementById('loader').style.display = 'none'; }
            });
        }
    });

    // Écoute de l'authentification
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
        fetchAllFromSupabase(); // Recharger les données (Brouillons vs Publiés)
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appState.currentUser = session.user;
        checkAdminRights(session.user);
    }

    await fetchAllFromSupabase();
    updateAuthUI();
    initAudioControls();
    initDragAndDrop(); // Initialiser la zone de dépôt d'image
});

/* ==========================================================================
   4. RECUPÉRATION DES DONNÉES (FILTRE BROUILLON SI NON ADMIN)
   ========================================================================== */
async function fetchAllFromSupabase() {
    try {
        const isAdmin = appState.editMode;

        const getQuery = (table) => {
            let q = supabaseClient.from(table).select('*');
            if (!isAdmin) q = q.eq('is_published', true); // Les visiteurs ne voient que le publié
            return q;
        };

        const [heroData, actusData, emissionsData, animateursData] = await Promise.all([
            getQuery('hero'), getQuery('actus'), getQuery('emissions'), getQuery('animateurs')
        ]);

        if (heroData.data) {
            appState.hero = heroData.data.map(h => ({
                id: h.id, title: h.titre || '', text: h.texte || '', 
                img: h.imageUrl || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200',
                is_published: h.is_published
            }));
        }

        if (actusData.data) {
            appState.news = actusData.data.map(a => ({
                id: a.id, title: a.titre || '', text: a.texte || a.contenu || '', 
                img: a.imageUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600',
                is_published: a.is_published
            }));
        }

        if (emissionsData.data) {
            appState.shows = emissionsData.data.map(e => ({
                id: e.id, title: e.titre || '', text: e.description || '', 
                img: e.image_url || 'https://images.unsplash.com/photo-1557134454-063901f1628d?q=80&w=600',
                is_published: e.is_published
            }));
        }

        if (animateursData.data) {
            appState.team = animateursData.data.map(anim => ({
                id: anim.id, title: anim.nom || '', text: anim.description || '', 
                img: anim.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400',
                is_published: anim.is_published
            }));
        }

        renderAll();
    } catch (err) {
        console.error("Erreur lors de la récupération :", err);
    }
}

/* ==========================================================================
   5. RENDU DYNAMIQUE DES SECTIONS HTML
   ========================================================================== */
function renderAll() {
    const heroWrapper = document.getElementById('hero-wrapper');
    const newsGrid = document.getElementById('news-grid');
    const showsGrid = document.getElementById('shows-grid');
    const teamGrid = document.getElementById('team-grid');
    
    const isEdit = Boolean(appState.editMode && appState.currentUser);
    document.getElementById('admin-top-bar').style.display = isEdit ? 'block' : 'none';

    if (heroWrapper) {
        heroWrapper.innerHTML = appState.hero.map((slide) => `
            <div class="swiper-slide ${!slide.is_published ? 'draft-card' : ''}">
                <img src="${slide.img}" class="slide-bg">
                <div class="slide-content">
                    <h1>${slide.title} ${!slide.is_published ? '<small style="color:#ff9900; font-size: 0.4em;">(Brouillon)</small>' : ''}</h1>
                    <p>${slide.text}</p>
                    <button class="btn-more" onclick="openArticleView('hero', '${slide.id}')">Voir plus</button>
                    ${isEdit ? `
                        <div class="card-admin-actions" style="position: relative; margin-top:20px; display:flex; gap:10px; justify-content:center;">
                            ${!slide.is_published ? `<button class="btn-publish-all" onclick="publishItem('hero', '${slide.id}'); event.stopPropagation();">Publier</button>` : ''}
                            <button class="delete-card-btn" onclick="openEditorModal('hero', '${slide.id}'); event.stopPropagation();">✏️ Modifier</button>
                            <button class="delete-card-btn" onclick="deleteItem('hero', '${slide.id}'); event.stopPropagation();">✕</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    const renderGrid = (gridElement, dataArray, category, tableName) => {
        if (!gridElement) return;
        gridElement.innerHTML = dataArray.map((item) => `
            <div class="card ${!item.is_published ? 'draft-card' : ''}" onclick="if(!appState.editMode) openArticleView('${category}', '${item.id}')">
                ${isEdit ? `
                    <div class="card-admin-actions">
                        ${!item.is_published ? `<button class="btn-card-publish" onclick="publishItem('${tableName}', '${item.id}'); event.stopPropagation();">Publier</button>` : ''}
                        <button class="delete-card-btn" onclick="openEditorModal('${category}', '${item.id}'); event.stopPropagation();">✏️</button>
                        <button class="delete-card-btn" onclick="deleteItem('${tableName}', '${item.id}'); event.stopPropagation();">✕</button>
                    </div>
                ` : ''}
                <img src="${item.img}" class="card-img">
                <div class="card-body">
                    <h3>${item.title} ${!item.is_published ? '<small style="color:#ff9900; font-size:0.6em;">(Brouillon)</small>' : ''}</h3>
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
   6. GESTION DE LA MODALE & DRAG & DROP
   ========================================================================== */
function openEditorModal(category, id = null) {
    selectedFile = null;
    document.getElementById('editor-category').value = category;
    document.getElementById('editor-item-id').value = id || '';
    document.getElementById('file-preview').innerHTML = '';
    document.getElementById('file-input').value = '';

    if (id) {
        const item = appState[category].find(x => String(x.id) === String(id));
        document.getElementById('modal-editor-title').innerText = "Modifier l'élément";
        document.getElementById('editor-title').value = item.title;
        document.getElementById('editor-text').value = item.text;
        if (item.img) {
            document.getElementById('file-preview').innerHTML = `<img src="${item.img}">`;
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

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drop-zone--over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drop-zone--over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) previewFile(files[0]);
    });
}

/* ==========================================================================
   7. SAUVEGARDE, PUBLICATION ET SUPPRESSION (SUPABASE UPDATE)
   ========================================================================== */
async function handleCardFormSubmit(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save-card');
    btnSave.innerText = "Enregistrement...";
    btnSave.disabled = true;

    const category = document.getElementById('editor-category').value;
    const id = document.getElementById('editor-item-id').value;
    const title = document.getElementById('editor-title').value;
    const text = document.getElementById('editor-text').value;

    let imageUrl = null;

    // Upload de l'image si nouvelle
    if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const filePath = `${category}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('vafm-media')
            .upload(filePath, selectedFile);

        if (uploadError) {
            alert("Erreur upload image : " + uploadError.message);
            btnSave.innerText = "Enregistrer (Brouillon)";
            btnSave.disabled = false;
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('vafm-media').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
    }

    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category];

    let payload = {
        [category === 'team' ? 'nom' : 'titre']: title,
        [category === 'shows' || category === 'team' ? 'description' : (category === 'hero' ? 'texte' : 'contenu')]: text,
        is_published: false // Reste en brouillon par défaut
    };

    if (imageUrl) {
        const imgColumn = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';
        payload[imgColumn] = imageUrl;
    }

    if (id) {
        await supabaseClient.from(tableName).update(payload).eq('id', id);
    } else {
        await supabaseClient.from(tableName).insert([payload]);
    }

    btnSave.innerText = "Enregistrer (Brouillon)";
    btnSave.disabled = false;
    closeEditorModal();
    await fetchAllFromSupabase();
}

async function publishItem(tableName, id) {
    await supabaseClient.from(tableName).update({ is_published: true }).eq('id', id);
    await fetchAllFromSupabase();
}

async function publishAllDrafts() {
    await Promise.all([
        supabaseClient.from('hero').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('actus').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('emissions').update({ is_published: true }).eq('is_published', false),
        supabaseClient.from('animateurs').update({ is_published: true }).eq('is_published', false)
    ]);
    alert("Tous les éléments ont été publiés !");
    await fetchAllFromSupabase();
}

async function deleteItem(tableName, id) {
    if (confirm("Voulez-vous vraiment supprimer cet élément ?")) {
        const { error } = await supabaseClient.from(tableName).delete().eq('id', id);
        if (error) alert("Erreur : " + error.message);
        else await fetchAllFromSupabase();
    }
}

/* ==========================================================================
   GESTION DES COMPTES (CONNEXION & INSCRIPTION)
   ========================================================================== */
function openAuthModal() {
    currentAuthMode = "login";
    document.getElementById('auth-title').innerText = "Connexion VAFM";
    document.getElementById('auth-switch-link').innerText = "Pas encore de compte ? S'inscrire";
    openModal('auth-modal');
}

function toggleAuthMode() {
    if (currentAuthMode === "login") {
        currentAuthMode = "register";
        document.getElementById('auth-title').innerText = "Créer un compte VAFM";
        document.getElementById('auth-switch-link').innerText = "Déjà un compte ? Se connecter";
    } else {
        openAuthModal();
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (currentAuthMode === "login") {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) alert("Impossible de se connecter : " + error.message);
        else closeModal('auth-modal');
    } else {
        const isAdminEmail = email.toLowerCase().endsWith('@vafm.fr');
        const { data, error } = await supabaseClient.auth.signUp({ 
            email, password, 
            options: { data: { role: isAdminEmail ? 'admin' : 'member' } } 
        });
        if (error) alert("Erreur d'inscription : " + error.message);
        else closeModal('auth-modal');
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
}

function checkAdminRights(user) {
    if (!user) {
        appState.editMode = false;
        return;
    }
    const role = user.user_metadata?.role;
    if (role === 'admin') {
        appState.editMode = true;
        document.body.classList.add('admin-logged-in', 'edit-mode-active');
    } else {
        appState.editMode = false;
        document.body.classList.remove('admin-logged-in', 'edit-mode-active');
    }
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
    } else {
        if (profileZone) {
            profileZone.innerHTML = `<button class="btn-secondary" onclick="openAuthModal()">Se connecter</button>`;
        }
    }
}

/* ==========================================================================
   8. MODALE ARTICLE & LECTEUR AUDIO
   ========================================================================== */
function openArticleView(sourceCategory, id) {
    const item = appState[sourceCategory].find(x => String(x.id) === String(id));
    if (!item) return;

    const loader = document.getElementById('loader');
    loader.style.display = 'flex';
    loader.style.transform = 'translateY(0)';
    loader.style.opacity = '1';

    setTimeout(() => {
        const modal = document.getElementById('article-modal');
        modal.className = "vafm-apple-page is-open";

        modal.innerHTML = `
            <div class="article-scroll-zone" style="padding: 60px 20px; max-width: 800px; margin: 0 auto; color: white;">
                <img src="${item.img}" style="width:100%; height:45vh; object-fit:cover; border-radius:16px; margin-bottom:30px;">
                <h2 style="font-size: 2.5rem; font-weight:800; margin-bottom:20px; font-family:'Plus Jakarta Sans'; color: #fff;">${item.title}</h2>
                <p style="font-size: 1.1rem; line-height: 1.8; color: #d0d0d5; font-family:'Plus Jakarta Sans';">${item.text}</p>
                <button onclick="closeArticle()" style="margin-top: 40px; padding: 15px 32px; background: #ff0033; color: white; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; font-family:'Plus Jakarta Sans';">✕ Fermer la page</button>
            </div>
        `;

        gsap.to(loader, { y: "-100%", duration: 0.5, onComplete: () => { loader.style.display = 'none'; } });
    }, 500);
}

function closeArticle() {
    document.getElementById('article-modal').classList.remove('is-open');
}

function initAudioControls() {
    const audioStream = document.getElementById('radio-audio');
    const playBtn = document.querySelector('.control-play-btn');
    const trackNameEl = document.getElementById('current-track');
    const trackArtistEl = document.querySelector('.track-artist');
    const marquee = document.getElementById('marquee');

    let isPlaying = false;
    let animTimeout = null;

    if (!audioStream) return;

    audioStream.addEventListener('error', () => {
        setTimeout(() => {
            audioStream.load();
            if (isPlaying) audioStream.play();
        }, 3000);
    });

    function lancerDefilementVoiture(titreComplet) {
        if (!marquee || !trackNameEl) return;
        clearTimeout(animTimeout);

        if (titreComplet.includes(" - ")) {
            const parts = titreComplet.split(" - ");
            if (trackArtistEl) trackArtistEl.innerText = parts[0].trim();
            trackNameEl.innerText = parts[1].trim();
        } else {
            trackNameEl.innerText = titreComplet;
            if (trackArtistEl) trackArtistEl.innerText = "VAFM LIVE";
        }

        trackNameEl.style.transition = "none";
        trackNameEl.style.transform = "translateX(0)";

        animTimeout = setTimeout(() => {
            const containerWidth = marquee.offsetWidth;
            const textWidth = trackNameEl.offsetWidth;
            if (textWidth <= containerWidth) return;

            const distance = textWidth - containerWidth + 25;
            const duration = distance * 20;

            trackNameEl.style.transition = `transform ${duration}ms linear`;
            trackNameEl.style.transform = `translateX(-${distance}px)`;

            animTimeout = setTimeout(() => {
                trackNameEl.style.transition = "none";
                trackNameEl.style.transform = "translateX(0)";
                setTimeout(() => lancerDefilementVoiture(titreComplet), 1000);
            }, duration + 2000);
        }, 2000);
    }

    async function updateCurrentTitle() {
        try {
            const response = await fetch("https://manager10.streamradio.fr:1555/status-json.xsl");
            if (!response.ok) return;
            const data = await response.json();
            const rawTitle = data?.icestats?.source?.title || "VAFM LIVE - Le meilleur son";
            lancerDefilementVoiture(rawTitle);
        } catch (e) {
            lancerDefilementVoiture("VAFM LIVE - Le meilleur son");
        }
    }

    updateCurrentTitle();
    setInterval(updateCurrentTitle, 20000);

    async function toggleAudio() {
        try {
            if (audioStream.paused) {
                audioStream.load();
                await audioStream.play();
                isPlaying = true;
                if (playBtn) playBtn.classList.add('playing');
            } else {
                audioStream.pause();
                isPlaying = false;
                if (playBtn) playBtn.classList.remove('playing');
            }
        } catch (e) {
            console.error("Erreur audio :", e);
        }
    }

    if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }