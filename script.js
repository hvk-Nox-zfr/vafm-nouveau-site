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
    hero: [],       // Table 'hero'
    news: [],       // Table 'actus'
    shows: [],      // Table 'emissions'
    team: []        // Table 'animateurs'
};

let currentAuthMode = "login";
let mainSwiperInstance = null;

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

    // 1. Écouter les changements d'état d'authentification
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
        renderAll();
    });

    // 2. Restauration de la session initiale
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        appState.currentUser = session.user;
        checkAdminRights(session.user);
    }

    // 3. Charger toutes les données depuis Supabase
    await fetchAllFromSupabase();

    updateAuthUI();
    initAudioControls();
});

/* ==========================================================================
   4. RECUPÉRATION DES DONNÉES (SUPABASE READ)
   ========================================================================== */
async function fetchAllFromSupabase() {
    try {
        // Table 'hero' (Carrousel principal)
        const { data: heroData } = await supabaseClient.from('hero').select('*');
        if (heroData) {
            appState.hero = heroData.map(h => ({
                id: h.id,
                title: h.titre || '',
                text: h.texte || '',
                img: h.imageUrl || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200'
            }));
        }

        // Table 'actus'
        const { data: actus } = await supabaseClient.from('actus').select('*');
        if (actus) {
            appState.news = actus.map(a => ({
                id: a.id,
                title: a.titre || '',
                text: a.texte || a.contenu || '',
                img: a.imageUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600'
            }));
        }

        // Table 'emissions'
        const { data: emissions } = await supabaseClient.from('emissions').select('*');
        if (emissions) {
            appState.shows = emissions.map(e => ({
                id: e.id,
                title: e.titre || '',
                text: `${e.horaires ? e.horaires + ' - ' : ''}${e.description || ''}`,
                img: e.image_url || 'https://images.unsplash.com/photo-1557134454-063901f1628d?q=80&w=600'
            }));
        }

        // Table 'animateurs'
        const { data: animateurs } = await supabaseClient.from('animateurs').select('*');
        if (animateurs) {
            appState.team = animateurs.map(anim => ({
                id: anim.id,
                title: anim.nom || '',
                text: anim.description || anim.emission || '',
                img: anim.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400'
            }));
        }

        renderAll();
    } catch (err) {
        console.error("Erreur lors de la récupération des données :", err);
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

    if (heroWrapper) {
        heroWrapper.innerHTML = appState.hero.map((slide, index) => `
            <div class="swiper-slide">
                <img src="${slide.img}" class="slide-bg" ${isEdit ? `onclick="triggerImageChange('hero', '${slide.id}')"` : ''}>
                <div class="slide-content">
                    <h1 contenteditable="${isEdit}" onblur="updateTextContent('hero', '${slide.id}', 'titre', this.innerText)">${slide.title}</h1>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('hero', '${slide.id}', 'texte', this.innerText)">${slide.text}</p>
                    <button class="btn-more" onclick="openArticleView('hero', '${slide.id}')">Voir plus</button>
                    ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('hero', '${slide.id}')">✕</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    if (newsGrid) {
        newsGrid.innerHTML = appState.news.map((item) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('news', '${item.id}')">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('actus', '${item.id}'); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('actus', '${item.id}'); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('actus', '${item.id}', 'titre', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('actus', '${item.id}', 'texte', this.innerText); event.stopPropagation();">${item.text}</p>
                </div>
            </div>
        `).join('');
    }

    if (showsGrid) {
        showsGrid.innerHTML = appState.shows.map((item) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('shows', '${item.id}')">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('emissions', '${item.id}'); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('emissions', '${item.id}'); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('emissions', '${item.id}', 'titre', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('emissions', '${item.id}', 'description', this.innerText); event.stopPropagation();">${item.text}</p>
                </div>
            </div>
        `).join('');
    }

    if (teamGrid) {
        teamGrid.innerHTML = appState.team.map((item) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('team', '${item.id}')">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('animateurs', '${item.id}'); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('animateurs', '${item.id}'); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('animateurs', '${item.id}', 'nom', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('animateurs', '${item.id}', 'description', this.innerText); event.stopPropagation();">${item.text}</p>
                </div>
            </div>
        `).join('');
    }

    if (mainSwiperInstance) mainSwiperInstance.destroy(true, true);
    mainSwiperInstance = new Swiper(".mainSwiper", {
        loop: appState.hero.length > 1,
        speed: 700,
        autoplay: isEdit ? false : { delay: 6000, disableOnInteraction: false },
        pagination: { el: ".swiper-pagination", clickable: true }
    });
}

/* ==========================================================================
   6. MODIFICATION ET ÉDITION EN DIRECT (SUPABASE UPDATE)
   ========================================================================== */
async function updateTextContent(tableName, id, field, value) {
    const { error } = await supabaseClient
        .from(tableName)
        .update({ [field]: value })
        .eq('id', id);

    if (error) {
        console.error("Erreur de mise à jour :", error);
    }
}

async function triggerImageChange(tableName, id) {
    const url = prompt("Entrez la nouvelle URL de l'image :");
    if (!url) return;

    const column = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';
    
    const { error } = await supabaseClient
        .from(tableName)
        .update({ [column]: url })
        .eq('id', id);

    if (error) {
        alert("Erreur de mise à jour de l'image : " + error.message);
    } else {
        await fetchAllFromSupabase();
    }
}

async function addNewCard(category) {
    const title = prompt("Titre :");
    if (!title) return;
    const text = prompt("Description / Texte :");
    const img = prompt("URL de l'image :");

    let tableName = '';
    let payload = {};

    if (category === 'hero') {
        tableName = 'hero';
        payload = { titre: title, texte: text, imageUrl: img };
    } else if (category === 'news') {
        tableName = 'actus';
        payload = { titre: title, texte: text, imageUrl: img };
    } else if (category === 'shows') {
        tableName = 'emissions';
        payload = { titre: title, description: text, image_url: img };
    } else if (category === 'team') {
        tableName = 'animateurs';
        payload = { nom: title, description: text, image_url: img };
    }

    const { error } = await supabaseClient.from(tableName).insert([payload]);
    if (error) {
        alert("Erreur d'ajout : " + error.message);
    } else {
        await fetchAllFromSupabase();
    }
}

function addNewSlide() {
    addNewCard('hero');
}

async function deleteItem(tableName, id) {
    if (confirm("Voulez-vous vraiment supprimer cet élément de la base de données ?")) {
        const { error } = await supabaseClient.from(tableName).delete().eq('id', id);
        if (error) {
            alert("Erreur de suppression : " + error.message);
        } else {
            await fetchAllFromSupabase();
        }
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
        // TENTATIVE DE CONNEXION
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error("Erreur Connexion:", error);
            alert("Impossible de se connecter : " + error.message);
        } else {
            // Pas d'alert() ici ! On met à jour et on ferme directement
            appState.currentUser = data.user;
            checkAdminRights(data.user);
            closeModal('auth-modal');
            updateAuthUI();
            renderAll();
        }
    } else {
        // TENTATIVE D'INSCRIPTION
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            console.error("Erreur Inscription:", error);
            alert("Erreur d'inscription : " + error.message);
        } else {
            appState.currentUser = data.user;
            checkAdminRights(data.user);
            closeModal('auth-modal');
            updateAuthUI();
            renderAll();
        }
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    appState.currentUser = null;
    appState.editMode = false;
    document.body.classList.remove('admin-logged-in', 'edit-mode-active');
    const toggleInput = document.getElementById('admin-mode-toggle');
    if (toggleInput) toggleInput.checked = false;
    updateAuthUI();
    renderAll();
}

function toggleAdminMode(isActive) {
    appState.editMode = isActive;
    document.body.classList.toggle('edit-mode-active', isActive);
    renderAll();
}

function checkAdminRights(user) {
    if (!user) {
        appState.editMode = false;
        return;
    }

    // Récupère le rôle dans les métadonnées de l'utilisateur
    const role = user.user_metadata?.role;

    if (role === 'admin') {
        appState.editMode = true;
        document.body.classList.add('admin-logged-in', 'edit-mode-active');
        console.log("Connecté en tant qu'Admin !");
    } else {
        appState.editMode = false;
        document.body.classList.remove('admin-logged-in', 'edit-mode-active');
        console.log("Connecté en tant que Membre");
    }
}

function updateAuthUI() {
    const profileZone = document.getElementById('user-profile-zone');
    const adminToggle = document.getElementById('admin-mode-toggle'); // Si tu as un switch/checkbox admin
    
    if (appState.currentUser) {
        const initial = appState.currentUser.email[0].toUpperCase();
        
        if (profileZone) {
            profileZone.innerHTML = `
                <div class="user-badge-container" onclick="logout()" style="cursor:pointer;" title="Cliquez pour vous déconnecter">
                    <div class="user-avatar">${initial}</div>
                    <span class="user-name-label">${appState.editMode ? 'Admin' : 'Membre'}</span>
                </div>
            `;
        }

        if (adminToggle) {
            adminToggle.checked = appState.editMode;
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

        gsap.to(loader, { 
            y: "-100%", 
            duration: 0.5, 
            onComplete: () => { loader.style.display = 'none'; }
        });
    }, 500);
}

function closeArticle() {
    const modal = document.getElementById('article-modal');
    modal.classList.remove('is-open');
}

function initAudioControls() {
    const audioStream = document.getElementById('radio-audio');
    const playBtn = document.querySelector('.control-play-btn');
    const navLiveBtn = document.getElementById('navLiveBtn');
    
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
                if (navLiveBtn) navLiveBtn.style.background = "var(--accent)";
            } else {
                audioStream.pause();
                isPlaying = false;
                if (playBtn) playBtn.classList.remove('playing');
                if (navLiveBtn) navLiveBtn.style.background = "#ff334b";
            }
        } catch (e) {
            console.error("Erreur audio :", e);
        }
    }

    if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
    if (navLiveBtn) navLiveBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
}

function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }