const SUPABASE_URL = 'https://blronpowdhaumjudtgvn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJscm9ucG93ZGhhdW1qdWR0Z3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5ODU4MDAsImV4cCI6MjA4NDU2MTgwMH0.ThzU_Eqgwy0Qx2vTO381R0HHvV1jfhsAZFxY-Aw4hXI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================================
   1. ÉTAT DE L'APPLICATION (LOCAL STORAGE)
   ========================================================================== */
let appState = JSON.parse(localStorage.getItem('vafm_premium_state')) || {
    users: [
        { email: "admin@vafm.fr", pass: "admin2026", role: "admin", name: "Équipe Admin" }
    ],
    currentUser: null,
    editMode: false,
    hero: [
        { id: 1, title: "Concert géant sur la plage", text: "Toute l'équipe se réunit sur la grande plage le 15 août pour un concert géant gratuit. Découvrez les premiers noms de l'affiche et réservez vos pass.", img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200" },
        { id: 2, title: "Drake en interview exclusive", text: "La superstar mondiale sera en direct ce vendredi à 21h pour une heure d'entretien sans filtre sur son nouvel album secret.", img: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1200" }
    ],
    news: [
        { id: 101, title: "Nouveaux équipements de mixage dans le studio A", text: "Afin de proposer une qualité audio digne des plus grands standards mondiaux, VAFM se dote d'une console SSL nouvelle génération.", img: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600" }
    ],
    shows: [
        { id: 201, title: "Le Morning VAFM", text: "De 06:00 à 09:30. Bonne humeur, actus locales et jeux inédits avec Lucas.", img: "https://images.unsplash.com/photo-1557134454-063901f1628d?q=80&w=600" }
    ],
    team: [
        { id: 301, title: "Lucas", text: "Le capitaine de la matinale, toujours prêt à vous faire sourire dès le réveil.", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400" }
    ]
};

let currentAuthMode = "login";
let mainSwiperInstance = null;

/* ==========================================================================
   2. INITIALISATION AU CHARGEMENT DOM
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
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

    // Restaurer l'état de l'interface admin au chargement
    if (appState.currentUser && appState.currentUser.role === 'admin') {
        document.body.classList.add('admin-logged-in');
        if (appState.editMode) {
            document.body.classList.add('edit-mode-active');
            const toggleInput = document.getElementById('admin-mode-toggle');
            if (toggleInput) toggleInput.checked = true;
        }
    }

    renderAll();
    updateAuthUI();
    initAudioControls();
});

/* ==========================================================================
   3. CONTRÔLES AUDIO (AVANCÉS ET STABLES)
   ========================================================================== */
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
        console.log("Flux coupé, tentative de reconnexion...");
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
            console.error("Erreur de lecture audio :", e);
        }
    }

    if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
    if (navLiveBtn) navLiveBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
}

function changeStyle(style) {
    console.log("Style changé pour : " + style);
}

/* ==========================================================================
   4. RENDU DYNAMIQUE DES SECTIONS HTML
   ========================================================================== */
function renderAll() {
    const heroWrapper = document.getElementById('hero-wrapper');
    const newsGrid = document.getElementById('news-grid');
    const showsGrid = document.getElementById('shows-grid');
    const teamGrid = document.getElementById('team-grid');
    
    // Correction ici : Vérification explicite de l'authentification et du rôle admin
    const isEdit = Boolean(appState.editMode && appState.currentUser && appState.currentUser.role === 'admin');

    if (heroWrapper) {
        heroWrapper.innerHTML = appState.hero.map((slide, index) => `
            <div class="swiper-slide">
                <img src="${slide.img}" class="slide-bg" ${isEdit ? `onclick="triggerImageChange('hero', ${index})"` : ''}>
                <div class="slide-content">
                    <h1 contenteditable="${isEdit}" onblur="updateTextContent('hero', ${index}, 'title', this.innerText)">${slide.title}</h1>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('hero', ${index}, 'text', this.innerText)">${slide.text}</p>
                    <button class="btn-more" onclick="openArticleView('hero', ${slide.id})">Voir plus</button>
                    ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('hero', ${index})">✕</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    if (newsGrid) {
        newsGrid.innerHTML = appState.news.map((item, index) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('news', ${item.id})">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('news', ${index}); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('news', ${index}); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('news', ${index}, 'title', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('news', ${index}, 'text', this.innerText); event.stopPropagation();">${item.text}</p>
                </div>
            </div>
        `).join('');
    }

    if (showsGrid) {
        showsGrid.innerHTML = appState.shows.map((item, index) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('shows', ${item.id})">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('shows', ${index}); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('shows', ${index}); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('shows', ${index}, 'title', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('shows', ${index}, 'text', this.innerText); event.stopPropagation();">${item.text}</p>
                </div>
            </div>
        `).join('');
    }

    if (teamGrid) {
        teamGrid.innerHTML = appState.team.map((item, index) => `
            <div class="card" onclick="if(!appState.editMode) openArticleView('team', ${item.id})">
                ${isEdit ? `<button class="delete-card-btn" onclick="deleteItem('team', ${index}); event.stopPropagation();">✕</button>` : ''}
                <img src="${item.img}" class="card-img" onclick="if(appState.editMode) { triggerImageChange('team', ${index}); event.stopPropagation(); }">
                <div class="card-body">
                    <h3 contenteditable="${isEdit}" onblur="updateTextContent('team', ${index}, 'title', this.innerText); event.stopPropagation();">${item.title}</h3>
                    <p contenteditable="${isEdit}" onblur="updateTextContent('team', ${index}, 'text', this.innerText); event.stopPropagation();">${item.text}</p>
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
   5. OUVERTURE D'ARTICLE AVEC LOADER DE TRANSITION FLUIDE
   ========================================================================== */
function openArticleView(sourceCategory, id) {
    const item = appState[sourceCategory].find(x => x.id === id);
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
    setTimeout(() => {
        modal.style.display = "none";
    }, 400);
}

/* ==========================================================================
   6. AUTHENTIFICATION & COMPTES
   ========================================================================== */
function openAuthModal() {
    currentAuthMode = "login";
    document.getElementById('auth-title').innerText = "Connexion Club VAFM";
    openModal('auth-modal');
}

function toggleAuthMode() {
    if (currentAuthMode === "login") {
        currentAuthMode = "register";
        document.getElementById('auth-title').innerText = "Rejoindre le Club VAFM";
        document.getElementById('auth-switch-link').innerText = "Déjà inscrit ? Se connecter";
    } else {
        currentAuthMode = "login";
        openAuthModal();
    }
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const matchingUser = appState.users.find(u => u.email === email && u.pass === password);

    if (matchingUser) {
        appState.currentUser = matchingUser;
    } else {
        const newUser = { email: email, pass: password, role: "user", name: email.split('@')[0] };
        appState.users.push(newUser);
        appState.currentUser = newUser;
    }
    saveState();
    closeModal('auth-modal');
    updateAuthUI();
    renderAll();
}

function logout() {
    appState.currentUser = null;
    appState.editMode = false;
    document.body.classList.remove('admin-logged-in', 'edit-mode-active');
    const toggleInput = document.getElementById('admin-mode-toggle');
    if (toggleInput) toggleInput.checked = false;
    saveState();
    updateAuthUI();
    renderAll();
}

function updateAuthUI() {
    const profileZone = document.getElementById('user-profile-zone');
    if (!profileZone) return;
    
    if (appState.currentUser) {
        profileZone.innerHTML = `
            <div class="user-badge-container" onclick="logout()">
                <div class="user-avatar">${appState.currentUser.name[0].toUpperCase()}</div>
                <span class="user-name-label">${appState.currentUser.name}</span>
            </div>
        `;
        if (appState.currentUser.role === 'admin') {
            document.body.classList.add('admin-logged-in');
        }
    } else {
        profileZone.innerHTML = `<button class="btn-secondary" onclick="openAuthModal()">Se connecter</button>`;
    }
}

/* ==========================================================================
   7. ADMINISTRATION AVANCÉE (CRÉATION ET ÉDITION)
   ========================================================================== */
function toggleAdminMode(isActive) {
    appState.editMode = isActive;
    document.body.classList.toggle('edit-mode-active', isActive);
    saveState();
    renderAll();
}

function updateTextContent(category, index, key, value) {
    appState[category][index][key] = value;
    saveState();
}

function triggerImageChange(category, index) {
    const url = prompt("Entrez la nouvelle URL de l'image :");
    if (url) {
        appState[category][index].img = url;
        saveState();
        renderAll();
    }
}

function addNewCard(category) {
    const title = prompt("Titre de l'élément :");
    if (!title) return;
    const text = prompt("Description / Texte :") || "Texte descriptif par défaut.";
    const img = prompt("URL de l'image :") || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600";

    appState[category].push({ id: Date.now(), title, text, img });
    saveState();
    renderAll();
}

function addNewSlide() {
    const title = prompt("Titre principal du carrousel :");
    if (!title) return;
    const text = prompt("Texte du carrousel :") || "Description de l'actualité en vedette.";
    const img = prompt("URL de l'image de fond :") || "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200";

    appState.hero.push({ id: Date.now(), title, text, img });
    saveState();
    renderAll();
}

function deleteItem(category, index) {
    if (confirm("Voulez-vous vraiment supprimer cet élément ?")) {
        appState[category].splice(index, 1);
        saveState();
        renderAll();
    }
}

/* ==========================================================================
   8. UTILITAIRES MODALS ET STOCKAGE
   ========================================================================== */
function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }
function saveState() { localStorage.setItem('vafm_premium_state', JSON.stringify(appState)); }