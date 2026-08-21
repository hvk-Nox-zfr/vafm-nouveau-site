/* ==========================================================================
1. CONFIGURATION POCKETBASE & POCKETBASE URL
========================================================================== */
const POCKETBASE_URL = 'https://api.vafmlaradio.fr';

/* ==========================================================================
DETECTION IOS/IPADOS
========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
  // Détecte si l'appareil est un iPhone / iPad / iPod
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  // Vérifie si le site est déjà ouvert depuis l'écran d'accueil (mode PWA standalone)
  const isPWA = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  // Vérifie si l'utilisateur a déjà fermé la bannière précédemment
  const isDismissed = localStorage.getItem('vafm_ios_prompt_dismissed');

  // Si c'est un iPhone, hors écran d'accueil et pas fermé récemment : on affiche
  if (isIOS && !isPWA && !isDismissed) {
    const promptBanner = document.getElementById('ios-pwa-prompt');
    if (promptBanner) {
      promptBanner.style.display = 'block';
    }
  }

  // Gestion du bouton de fermeture (masque le bandeau pour 7 jours)
  document.getElementById('close-ios-prompt')?.addEventListener('click', function() {
    const banner = document.getElementById('ios-pwa-prompt');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('vafm_ios_prompt_dismissed', 'true');
  });
});

/* ==========================================================================
2. ÉTAT DE L'APPLICATION
========================================================================== */
let appState = {
  currentUser: null,
  userRole: 'member', 
  editMode: false,
  hero: [],
  news: [],
  shows: [],
  team: [],
  videos: []
};

window.appState = appState;

let currentAuthMode = "login";
let mainSwiperInstance = null;
let selectedFile = null;
let sortableInstances = [];

// Déblocage du Swipe sur la barre admin mobile
document.addEventListener('touchstart', (e) => {
  const toolbar = e.target.closest('.vafm-player-toolbar');
  if (toolbar) {
    e.stopPropagation();
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const toolbar = e.target.closest('.vafm-player-toolbar');
  if (toolbar) {
    e.stopPropagation();
  }
}, { passive: true });

async function cleanOldSongsFromPocketBase() {
    try {
        const res = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=50`);
        if (!res.ok) return;

        const data = await res.json();
        const items = data.items || [];

        if (items.length <= 10) return;

        const itemsToDelete = items.slice(10);

        await Promise.all(itemsToDelete.map(item => 
            fetch(`${POCKETBASE_URL}/api/collections/song_history/records/${item.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(true)
            })
        ));

        console.log(`🧹 Nettoyage PocketBase : ${itemsToDelete.length} anciens titres supprimés (10 conservés).`);
    } catch (e) {
        console.warn("Erreur lors du nettoyage PocketBase :", e);
    }
}

// Compression universelle d'image optimisée (Canvas / WebP avec libération mémoire)
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          // Libération explicite du Canvas pour la mémoire
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) return resolve(file);
          const safeName = (file.name || 'image').replace(/\.[^/.]+$/, "") + ".webp";
          resolve(new File([blob], safeName, { type: "image/webp" }));
        }, 'image/webp', quality);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

async function compressPosterImage(file, maxWidth = 800, quality = 0.8) {
  return compressImage(file, maxWidth, quality);
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.AUTO_OPEN_ARTICLE && typeof openArticleView === 'function') {
    setTimeout(() => {
      openArticleView(window.AUTO_OPEN_ARTICLE.category, window.AUTO_OPEN_ARTICLE.id);
    }, 200);
  }
});

/* ==========================================================================
3. UTILITIES & DROITS (TOKEN & ROLES)
========================================================================== */
function stripHTML(html) {
  let tmp = document.createElement("DIV");
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || "";
}

function getPocketBaseImageUrl(collectionName, recordId, fileName, thumb = null) {
  if (!fileName) return null;
  if (fileName.startsWith('http://') || fileName.startsWith('https://') || fileName.startsWith('data:')) return fileName;
  const base = `${POCKETBASE_URL}/api/files/${collectionName}/${recordId}/${fileName}`;
  return thumb ? `${base}?thumb=${thumb}` : base;
}

function getAuthToken() {
  const storedAuth = localStorage.getItem('pocketbase_auth');
  if (!storedAuth) return null;
  try {
    const parsed = JSON.parse(storedAuth);
    return parsed.token || null;
  } catch (e) {
    return null;
  }
}

function getAuthHeaders(contentTypeJson = false) {
  const token = getAuthToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (contentTypeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function canEditCategory(category) {
  if (!appState.currentUser) return false;
  if (appState.userRole === 'admin') return true;
  if (appState.userRole === 'journaliste' || appState.userRole === 'journalist') {
    return (category === 'hero' || category === 'news' || category === 'actus');
  }
  return false;
}

function canCreateInCategory(category) {
  if (!appState.currentUser) return false;
  if (appState.userRole === 'admin') return true;
  if (appState.userRole === 'journaliste' || appState.userRole === 'journalist') {
    return (category === 'news' || category === 'actus');
  }
  return false;
}

/* ==========================================================================
4. INITIALISATION & PARSING URL DYNAMIQUE
========================================================================== */
function hideSiteLoader() {
  const loader = document.getElementById('loader');
  if (!loader || loader.dataset.hidden === '1') return;
  loader.dataset.hidden = '1';

  if (typeof gsap !== 'undefined') {
    gsap.to("#loader", {
      y: "-100%", duration: 0.4, ease: "power2.in",
      onComplete: () => { loader.style.display = 'none'; }
    });
  } else {
    loader.style.display = 'none';
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const storedAuth = localStorage.getItem('pocketbase_auth');
  if (storedAuth) {
    try {
      const authData = JSON.parse(storedAuth);
      const userRecord = authData.record || authData.model;
      if (userRecord) {
        appState.currentUser = userRecord;
        checkAdminRights(userRecord);
      }
    } catch (e) {
      console.warn("Session PocketBase non valide");
      localStorage.removeItem('pocketbase_auth');
    }
  }

  const minDelay = new Promise(resolve => setTimeout(resolve, 300));
  const safetyTimeout = new Promise(resolve => setTimeout(resolve, 4000));

  await Promise.race([
    Promise.all([fetchAllFromPocketBase(), minDelay]),
    safetyTimeout
  ]);

  hideSiteLoader();
  updateAuthUI();
  initFileUploadDragAndDrop();
  initRadioPlayer();

  await checkUrlForArticle();
});

async function checkUrlForArticle() {
  const path = window.location.pathname;
  let articleId = null;

  if (path.startsWith('/article/news/')) {
    const slugWithId = path.replace('/article/news/', '');
    articleId = slugWithId.substring(0, 15);
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('id')) {
      articleId = urlParams.get('id');
    }

    const videoParam = urlParams.get('video');
    if (videoParam) {
      const videoId = videoParam.split('-')[0];
      
      let retries = 25;
      while ((!appState.videos || appState.videos.length === 0) && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
        retries--;
      }

      const targetVideo = appState.videos.find(v => String(v.id).trim() === String(videoId).trim());
      if (targetVideo && targetVideo.videoUrl) {
        openVideoPlayerModal(targetVideo.videoUrl, targetVideo.title, targetVideo.id);
        return;
      }
    }
  }

  if (articleId && articleId.length === 15) {
    let retries = 20;
    while (typeof openArticleView !== 'function' && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries--;
    }

    if (typeof openArticleView === 'function') {
      openArticleView('news', articleId);
    } else {
      console.error("article.js n'a pas pu être chargé à temps pour ouvrir l'article.");
    }
  }
}

/* ==========================================================================
5. RÉCUPÉRATION DES DONNÉES POCKETBASE
========================================================================== */
function showMaintenanceScreen() {
  const overlay = document.getElementById('maintenance-overlay');
  if (overlay) overlay.classList.remove('hidden');

  if (typeof renderPlayer === 'function') {
    renderPlayer();
  }
  
  const player = document.querySelector('.vafm-player-premium');
  if (player) {
    player.style.display = 'flex';
  }
}

async function fetchAllFromPocketBase() {
  let isServerDown = false;

  try {
    const getCollectionData = async (collection, fields = null) => {
      const url = fields
        ? `${POCKETBASE_URL}/api/collections/${collection}/records?fields=${encodeURIComponent(fields)}&perPage=200`
        : `${POCKETBASE_URL}/api/collections/${collection}/records?perPage=200`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          console.warn(`Erreur ${res.status} sur : ${collection}`);
          isServerDown = true;
          return [];
        }
        
        const data = await res.json();
        return data.items || [];
      } catch (err) {
        clearTimeout(timeoutId);
        console.error(`Délai dépassé ou serveur injoignable pour ${collection}`);
        isServerDown = true;
        return [];
      }
    };

    const [heroItems, actusItems, emissionsItems, animateursItems, videosItems, actuLikesItems] = await Promise.all([
      getCollectionData('hero'),
      getCollectionData('actus', 'id,titre,title,texte,contenu,description,image,is_published,position,created'),
      getCollectionData('emissions'),
      getCollectionData('animateurs'),
      getCollectionData('videos'),
      getCollectionData('actu_likes')
    ]);

    if (isServerDown) {
      showMaintenanceScreen();
      return;
    }

    document.getElementById('maintenance-overlay')?.classList.add('hidden');

    // Mappage avec la vraie valeur de publication
    let hero = heroItems.map(item => ({
      id: item.id,
      title: item.titre || item.title || '',
      text: item.texte || item.contenu || item.description || '',
      img: getPocketBaseImageUrl('hero', item.id, item.image),
      is_published: Boolean(item.is_published)
    }));

    let news = actusItems.map(item => ({
      id: item.id,
      title: item.titre || item.title || '',
      text: item.texte || item.contenu || item.description || '',
      img: getPocketBaseImageUrl('actus', item.id, item.image),
      is_published: Boolean(item.is_published),
      position: item.position || 0,
      created: item.created,
      likesList: actuLikesItems.filter(l => l.actu === item.id)
    }));

    let shows = emissionsItems.map(item => ({
      id: item.id,
      title: item.titre || item.title || '',
      text: item.texte || item.description || '',
      img: getPocketBaseImageUrl('emissions', item.id, item.image),
      is_published: Boolean(item.is_published)
    }));

    let team = animateursItems.map(item => ({
      id: item.id,
      title: item.nom || item.title || '',
      text: item.description || item.text || '',
      img: getPocketBaseImageUrl('animateurs', item.id, item.image),
      is_published: Boolean(item.is_published)
    }));

    let videos = videosItems.map(item => ({
      id: item.id,
      title: item.titre || item.title || '',
      videoUrl: item.video_file ? `${POCKETBASE_URL}/api/files/videos/${item.id}/${item.video_file}` : null,
      img: getPocketBaseImageUrl('videos', item.id, item.poster) || 'https://vafmlaradio.fr/LOGO-VAFM.png',
      is_published: Boolean(item.is_published),
      created: item.created
    }));

    // Si pas admin, on filtre les brouillons pour toutes les sections
    if (!isAdmin) {
      hero = hero.filter(item => item.is_published);
      news = news.filter(item => item.is_published);
      shows = shows.filter(item => item.is_published);
      team = team.filter(item => item.is_published);
      videos = videos.filter(item => item.is_published);
    }

    // Attribution au state
    appState.hero = hero;
    appState.news = news;
    appState.shows = shows;
    appState.team = team;
    appState.videos = videos;

    renderAll();
  } catch (err) {
    console.error("Serveur inaccessible :", err);
    showMaintenanceScreen();
  }
}

/* ==========================================================================
6. RENDU DU CARROUSEL, GRILLES & VIDÉOS
========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const homeLinks = document.querySelectorAll('a[href="#home"], .nav-home, nav a');
    homeLinks.forEach(link => {
        if (link.textContent.trim().toLowerCase() === 'accueil') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof closeArticleView === 'function') {
                    closeArticleView();
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    });
});

function togglePublishMenu(event) {
  if (event) event.stopPropagation();
  const container = document.querySelector('.publish-dropdown-container');
  if (container) {
    container.classList.toggle('open');
  }
}

function createNewsCardHTML(item, category = 'news', collectionName = 'actus') {
  const cleanText = stripHTML(item.text);
  const truncatedText = cleanText.length > 40 ? cleanText.substring(0, 40) + '...' : cleanText;

  const canEditThisCategory = canEditCategory(category);
  const isUserLoggedIn = appState && appState.currentUser;
  const currentUserId = isUserLoggedIn ? appState.currentUser.id : null;

  const likesList = Array.isArray(item.likesList) ? item.likesList : [];
  const hasLiked = currentUserId && likesList.some(l => l.user === currentUserId);
  const likeCount = likesList.length || 0;

  let formattedDate = "";
  if (item.created) {
    const d = new Date(item.created);
    formattedDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return `
  <div class="card ${!item.is_published ? 'draft-card' : ''} ${canEditThisCategory ? 'draggable-card' : ''}" 
       data-id="${item.id}" 
       onclick="openArticleView('${category}', '${item.id}')">
    ${canEditThisCategory ? `
    <div class="drag-handle" title="Glisser pour réordonner">☰</div>
    <span class="card-status-tag ${item.is_published ? 'tag-published' : 'tag-draft'}">
      ${item.is_published ? 'Publié' : 'Brouillon'}
    </span>
    <div class="card-admin-actions" onclick="event.stopPropagation();">
      <button class="btn-admin-action ${item.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('${collectionName}', '${item.id}', ${item.is_published}); event.stopPropagation();">
        ${item.is_published ? 'Dépublier' : 'Publier'}
      </button>
      <button class="btn-admin-action" onclick="openEditorModal('${category}', '${item.id}'); event.stopPropagation();">✏️</button>
      <button class="btn-admin-action" onclick="deleteItem('${collectionName}', '${item.id}'); event.stopPropagation();">✕</button>
    </div>
    ` : ''}

    <img src="${item.img}" class="card-img" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600'">

    <div class="card-body">
      ${formattedDate ? `<span class="date">${formattedDate}</span>` : ''}
      <h3>${item.title}</h3>
      <p>${truncatedText}</p>
    </div>

    ${category === 'news' ? `
    <div class="card-actions" onclick="event.stopPropagation();">
        <button class="vafm-card-btn ${hasLiked ? 'liked' : ''}" onclick="handleLikeActu('${item.id}')" title="Aimer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${hasLiked ? '#ff334b' : 'none'}" stroke="${hasLiked ? '#ff334b' : '#ffffff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>${likeCount}</span>
        </button>
        <button class="vafm-card-btn" onclick="handleShareActu('${item.id}', '${encodeURIComponent(item.title)}')" title="Partager">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Partager</span>
        </button>
    </div>
    ` : ''}
  </div>
  `;
}

const renderGrid = (gridElement, dataArray, category, collectionName) => {
  if (!gridElement) return;

  if (dataArray.length === 0) {
    gridElement.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun contenu disponible pour le moment.</p>`;
    return;
  }

  gridElement.innerHTML = dataArray.map((item) => createNewsCardHTML(item, category, collectionName)).join('');
};

const renderCarouselGrid = (gridElement, dataArray, category, collectionName) => {
  if (!gridElement) return;

  const pages = [];
  for (let i = 0; i < dataArray.length; i += 8) {
    pages.push(dataArray.slice(i, i + 8));
  }

  const pagesHTML = pages.map((pageItems) => `
    <div class="vafm-carousel-page">
      <div class="vafm-carousel-page-grid">
        ${pageItems.map(item => createNewsCardHTML(item, category, collectionName)).join('')}
      </div>
    </div>
  `).join('');

  gridElement.innerHTML = `
    <div class="vafm-carousel-wrapper">
      <button class="vafm-carousel-btn prev" onclick="scrollNewsCarousel(this, -1)" title="Précédent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      
      <div class="vafm-carousel-track">
        ${pagesHTML}
      </div>

      <button class="vafm-carousel-btn next" onclick="scrollNewsCarousel(this, 1)" title="Suivant">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  `;
};

window.scrollNewsCarousel = function(buttonEl, direction) {
  const wrapper = buttonEl.closest('.vafm-carousel-wrapper');
  if (!wrapper) return;
  const track = wrapper.querySelector('.vafm-carousel-track');
  if (!track) return;

  const pageWidth = track.offsetWidth;
  track.scrollBy({
    left: pageWidth * direction,
    behavior: 'smooth'
  });
};

function removeCarouselBoxBackground() {
  const carouselGrids = document.querySelectorAll('#recent-news-grid.vafm-news-carousel-mode, #old-news-grid.vafm-news-carousel-mode');
  carouselGrids.forEach(grid => {
    let parent = grid.parentElement;
    for (let i = 0; i < 3; i++) {
      if (parent && parent !== document.body) {
        parent.style.setProperty('background', 'transparent', 'important');
        parent.style.setProperty('background-color', 'transparent', 'important');
        parent.style.setProperty('box-shadow', 'none', 'important');
        parent.style.setProperty('border', 'none', 'important');
        parent = parent.parentElement;
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(removeCarouselBoxBackground, 300);
});

function renderAll() {
  const heroWrapper = document.getElementById('hero-wrapper');
  const topLikedGrid = document.getElementById('top-liked-news-grid');
  const topLikedSubsection = document.getElementById('top-liked-subsection');
  const recentNewsGrid = document.getElementById('recent-news-grid');
  const oldNewsGrid = document.getElementById('old-news-grid');
  const oldNewsSubsection = document.getElementById('old-news-subsection');
  const showsGrid = document.getElementById('shows-grid');
  const teamDirecteurGrid = document.getElementById('vafm-team-directeur');
  const teamDjGrid = document.getElementById('vafm-team-dj');
  const teamAnimateurGrid = document.getElementById('vafm-team-animateur');

  const isEdit = Boolean(appState.editMode && appState.currentUser);
  const adminTopBar = document.getElementById('admin-top-bar');
  if (adminTopBar) adminTopBar.style.display = isEdit ? 'block' : 'none';

  const canEditHero = canEditCategory('hero');

  if (heroWrapper) {
    if (appState.hero.length === 0) {
      heroWrapper.innerHTML = `
      <div class="swiper-slide hero-slide">
        <div class="slide-content">
          <h2>Bienvenue sur VAFM</h2>
          <p>${canEditHero ? 'Ajoutez un élément au carrousel depuis le panneau d\'admin.' : 'Le meilleur du son en direct !'}</p>
        </div>
      </div>`;
    } else {
      heroWrapper.innerHTML = appState.hero.map((slide, slideIndex) => {
        const cleanText = stripHTML(slide.text);
        const truncatedText = cleanText.length > 70 ? cleanText.substring(0, 70) + '...' : cleanText;
        const loadingAttrs = slideIndex === 0
          ? 'loading="eager" fetchpriority="high"'
          : 'loading="lazy" decoding="async"';

        return `
      <div class="swiper-slide hero-slide ${!slide.is_published ? 'draft-card' : ''}">
        <img src="${slide.img}" class="slide-bg" alt="${slide.title}" ${loadingAttrs}>
        <div class="slide-overlay"></div>
        <div class="slide-content">
          <h1>${slide.title} ${!slide.is_published ? '<small class="draft-badge">(Brouillon)</small>' : ''}</h1>
          <p>${truncatedText}</p>
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
      `;
      }).join('');
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

  if (topLikedGrid) {
    const topLikedNews = [...appState.news]
      .filter(item => Array.isArray(item.likesList) && item.likesList.length > 0)
      .sort((a, b) => (b.likesList?.length || 0) - (a.likesList?.length || 0))
      .slice(0, 3);

    if (topLikedNews.length > 0) {
      if (topLikedSubsection) topLikedSubsection.style.display = 'block';
      renderGrid(topLikedGrid, topLikedNews, 'news', 'actus');
    } else {
      if (topLikedSubsection) topLikedSubsection.style.display = 'none';
    }
  }

  const now = new Date();
  const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;
  const sortByRecentDate = (a, b) => new Date(b.created || 0) - new Date(a.created || 0);

  const recentNews = appState.news
    .filter(item => {
      if (!item.created) return true;
      const createdDate = new Date(item.created);
      return (now - createdDate) < twoWeeksInMs;
    })
    .sort(sortByRecentDate);

  const oldNews = appState.news
    .filter(item => {
      if (!item.created) return false;
      const createdDate = new Date(item.created);
      return (now - createdDate) >= twoWeeksInMs;
    })
    .sort(sortByRecentDate);

  if (recentNewsGrid) {
    if (recentNews.length >= 9) {
      recentNewsGrid.classList.add('vafm-news-carousel-mode');
      renderCarouselGrid(recentNewsGrid, recentNews, 'news', 'actus');
    } else {
      recentNewsGrid.classList.remove('vafm-news-carousel-mode');
      renderGrid(recentNewsGrid, recentNews, 'news', 'actus');
    }
  }

  if (oldNewsGrid) {
    if (oldNews.length > 0) {
      if (oldNewsSubsection) oldNewsSubsection.style.display = 'block';
      if (oldNews.length >= 9) {
        oldNewsGrid.classList.add('vafm-news-carousel-mode');
        renderCarouselGrid(oldNewsGrid, oldNews, 'news', 'actus');
      } else {
        oldNewsGrid.classList.remove('vafm-news-carousel-mode');
        renderGrid(oldNewsGrid, oldNews, 'news', 'actus');
      }
    } else {
      if (oldNewsSubsection) oldNewsSubsection.style.display = 'none';
    }
  }

  renderGrid(showsGrid, appState.shows, 'shows', 'emissions');

  const teamContainers = {
    directeur: teamDirecteurGrid,
    dj: teamDjGrid,
    animateur: teamAnimateurGrid
  };

  Object.values(teamContainers).forEach(c => {
    if (c) c.innerHTML = '';
  });

  if (!appState.team || appState.team.length === 0) {
    Object.values(teamContainers).forEach(c => {
      if (c) c.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun membre pour le moment.</p>`;
    });
  } else {
    const canEditTeam = canEditCategory('team');

    appState.team.forEach(member => {
      const rawRole = (member.text || member.role || '').toLowerCase();
      let targetKey = 'animateur';
      if (rawRole.includes('directeur') || rawRole.includes('dir')) targetKey = 'directeur';
      else if (rawRole.includes('dj') || rawRole.includes('mix')) targetKey = 'dj';

      const targetContainer = teamContainers[targetKey] || teamContainers['animateur'];
      if (!targetContainer) return;

      const safeName = (member.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const cleanText = stripHTML(member.text);

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

        <img src="${member.img}" class="card-img" alt="${safeName}" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400'">

        <div class="card-body">
          <h3>${member.title}</h3>
          <p>${cleanText}</p>
        </div>
      </div>
      `;

      targetContainer.innerHTML += cardHTML;
    });
  }

  renderVideosContainer();

  if (isEdit) {
    initGridsDragAndDrop();
  }
}

async function handleLikeActu(actuId) {
    if (!appState || !appState.currentUser) {
        alert("🔒 Vous devez être connecté pour aimer cet article.");
        openAuthModal();
        return;
    }

    const userId = appState.currentUser.id;
    const actu = appState.news.find(a => a.id === actuId);
    if (!actu) return;

    if (!Array.isArray(actu.likesList)) {
        actu.likesList = [];
    }

    const existingLike = actu.likesList.find(l => l.user === userId);

    try {
        if (!existingLike) {
            const res = await fetch(`${POCKETBASE_URL}/api/collections/actu_likes/records`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({
                    actu: actuId,
                    user: userId
                })
            });

            if (res.ok) {
                const newLikeRecord = await res.json();
                actu.likesList.push(newLikeRecord);
            } else {
                console.error("Erreur création actu_like:", await res.text());
            }
        } else {
            const res = await fetch(`${POCKETBASE_URL}/api/collections/actu_likes/records/${existingLike.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(true)
            });

            if (res.ok) {
                actu.likesList = actu.likesList.filter(l => l.id !== existingLike.id);
            } else {
                console.error("Erreur suppression actu_like:", await res.text());
            }
        }

        renderAll();

    } catch (err) {
        console.error("Erreur réseau handleLikeActu :", err);
    }
}

async function handleShareActu(actuId, rawTitle) {
    const title = decodeURIComponent(rawTitle);
    
    const cleanSlug = title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const shareUrl = `${window.location.origin}/article/news/${actuId}-${cleanSlug}`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: title,
                text: `${title} – À lire sur VAFM`,
                url: shareUrl
            });
        } catch (err) {}
    } else {
        try {
            await navigator.clipboard.writeText(shareUrl);
            alert("📋 Lien de l'article copié dans le presse-papier !");
        } catch (err) {
            alert("Lien à partager : " + shareUrl);
        }
    }
}

function renderVideosContainer() {
  const container = document.getElementById('vafm-dynamic-videos-container');
  if (!container) return;

  if (appState.videos.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="color: #a1a1aa; padding: 10px;">Aucune vidéo disponible pour le moment.</p>';
    return;
  }

  const canEditVideos = canEditCategory('videos');
  const isEdit = Boolean(appState.editMode && appState.currentUser);

  container.innerHTML = appState.videos.map(video => {
    const safeTitle = (video.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    let formattedDate = "";
    if (video.created) {
      const d = new Date(video.created);
      formattedDate = `Publié le ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }

    return `
      <div class="vafm-video-card ${!video.is_published ? 'draft-card' : ''}" data-id="${video.id}">
        <img src="${video.img}" alt="${video.title}" loading="lazy" decoding="async">
        <div class="vafm-video-click-zone" onclick="if('${video.videoUrl}') openVideoPlayerModal('${video.videoUrl}', '${safeTitle}', '${video.id}')"></div>
        <div class="vafm-video-overlay">
            <div class="vafm-video-header-info">
                ${isEdit ? `
                  <span class="card-status-tag ${video.is_published ? 'tag-published' : 'tag-draft'}">
                      ${video.is_published ? 'Publié' : 'Brouillon'}
                  </span>
                ` : ''}
                
                ${canEditVideos ? `
                  <div class="vafm-video-admin-actions">
                    <button class="btn-admin-action ${video.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('videos', '${video.id}', ${video.is_published}); event.stopPropagation();">
                      ${video.is_published ? 'Dépublier' : 'Publier'}
                    </button>
                    <button class="btn-admin-action btn-delete" onclick="deleteItem('videos', '${video.id}'); event.stopPropagation();">✕</button>
                  </div>
                ` : ''}
            </div>

            <div class="vafm-video-footer-info">
                <div class="vafm-video-caption">${video.title}</div>
                ${formattedDate ? `<div class="vafm-video-date">${formattedDate}</div>` : ''}
            </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
7. DRAG & DROP DES CARTES DANS LES GRILLES
========================================================================== */
function initGridsDragAndDrop() {
  sortableInstances.forEach(inst => inst.destroy());
  sortableInstances = [];

  if (typeof Sortable === 'undefined') return;

  const setupSortable = (gridId, collectionName, category) => {
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

        await saveNewOrderInDB(collectionName, updatedOrders);
      }
    });

    sortableInstances.push(sortable);
  };

  setupSortable('news-grid', 'actus', 'news');
  setupSortable('shows-grid', 'emissions', 'shows');
  setupSortable('vafm-team-directeur', 'animateurs', 'team');
  setupSortable('vafm-team-dj', 'animateurs', 'team');
  setupSortable('vafm-team-animateur', 'animateurs', 'team');
}

async function saveNewOrderInDB(collectionName, items) {
  for (const item of items) {
    try {
      await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${item.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ position: item.position })
      });
    } catch (err) {
      console.error(`Erreur de réorganisation PocketBase pour ${collectionName} (${item.id}) :`, err);
    }
  }
}

/* ==========================================================================
8. PUBLICATION & MODALE ÉDITION
========================================================================== */
document.addEventListener('click', (e) => {
    const menu = document.getElementById('publishMenu');
    const btn = document.getElementById('publishDropdownBtn');
    
    if (menu && menu.classList.contains('active')) {
        if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
            menu.classList.remove('active');
        }
    }
});

async function triggerGoogleIndexing(id, title) {
    try {
        const cleanSlug = (title || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const articleUrl = `https://vafmlaradio.fr/article/news/${id}-${cleanSlug}`;

        await fetch('/api/index-google', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'Vafmkeysvariable59!!!'
            },
            body: JSON.stringify({ url: articleUrl })
        });
        console.log("🚀 Demande d'indexation Google envoyée pour :", articleUrl);
    } catch (err) {
        console.warn("Indexation Google auto manquée :", err);
    }
}

async function togglePublish(collectionName, id, currentStatus) {
  const collectionMap = { 
    'hero': 'hero', 
    'news': 'actus', 
    'actus': 'actus', 
    'shows': 'emissions', 
    'emissions': 'emissions', 
    'team': 'animateurs', 
    'animateurs': 'animateurs', 
    'videos': 'videos' 
  };
  
  const targetCollection = collectionMap[collectionName] || collectionName;
  const newStatus = !currentStatus;

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${targetCollection}/records/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ is_published: newStatus })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || JSON.stringify(errData.data) || "Erreur de mise à jour");
    }

    if (newStatus === true && targetCollection === 'actus') {
        const actuItem = appState.news.find(a => a.id === id);
        triggerGoogleIndexing(id, actuItem?.title);
    }
    
    await fetchAllFromPocketBase();
  } catch (error) {
    console.error("Erreur critique togglePublish :", error);
    alert("Erreur PocketBase : " + error.message);
  }
}

function openEditorModal(category, id = null) {
  if (id && !canEditCategory(category)) {
    alert("Vous n'avez pas la permission d'éditer cette section.");
    return;
  }
  if (!id && !canCreateInCategory(category)) {
    alert("Création non autorisée dans cette section.");
    return;
  }

  if (category === 'videos') {
    const modal = document.getElementById('vafm-upload-modal');
    if (modal) {
      openModal('vafm-upload-modal');
    } else {
      alert("La modale vidéo est introuvable dans le HTML.");
    }
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
      if (titleEl) titleEl.innerText = "Modifier l'élément";
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

async function handleVideoUploadSubmit(e) {
  e.preventDefault();

  let token = '';
  
  for (const key of ['pocketbase_auth', 'pb_auth', 'pktb_auth']) {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        const parsed = JSON.parse(item);
        token = parsed.token || (typeof parsed === 'string' ? parsed : '');
        if (token) break;
      } catch (e) {
        token = item;
        break;
      }
    }
  }

  if (!token) {
    alert("Session expirée ou utilisateur non connecté. Veuillez vous reconnecter.");
    return;
  }

  const titleInput = document.getElementById('video-title');
  const videoInput = document.getElementById('video-file');
  const posterInput = document.getElementById('video-poster');
  const btnSave = document.getElementById('btn-save-video');

  if (!titleInput || !videoInput || !videoInput.files[0]) {
    alert("Veuillez remplir le titre et sélectionner une vidéo.");
    return;
  }

  if (btnSave) {
    btnSave.innerText = "Envoi en cours...";
    btnSave.disabled = true;
  }

  const formData = new FormData();
  formData.append('title', titleInput.value.trim());
  formData.append('is_published', 'true');
  formData.append('video_file', videoInput.files[0]);

  if (posterInput && posterInput.files[0]) {
    const compressedPoster = typeof compressPosterImage === 'function' 
      ? await compressPosterImage(posterInput.files[0]) 
      : posterInput.files[0];
    formData.append('poster', compressedPoster);
  }

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/videos/records`, {
      method: 'POST',
      headers: {
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `Erreur HTTP ${res.status}`);
    }

    if (typeof closeModal === 'function') closeModal('vafm-upload-modal');
    document.getElementById('vafm-video-upload-form').reset();
    if (typeof fetchAllFromPocketBase === 'function') await fetchAllFromPocketBase();
    
    alert("Vidéo ajoutée avec succès !");
  } catch (err) {
    console.error("Erreur PB:", err);
    alert("Impossible d'uploader la vidéo : " + err.message);
  } finally {
    if (btnSave) {
      btnSave.innerText = "Uploader la vidéo";
      btnSave.disabled = false;
    }
  }
}

function closeEditorModal() {
  closeModal('card-editor-modal');
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (files && files[0]) {
    previewFile(files[0]);
  }
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
  const fileInput = document.getElementById('file-input');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        previewFile(e.target.files[0]);
      }
    });
  }

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
9. ENREGISTREMENT & SUPPRESSION
========================================================================== */
const ONESIGNAL_APP_ID = "0d3922a5-cccc-44c2-b3e3-81027e516568";

async function sendOneSignalNotification(title, message, recordId = '') {
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/vafm/push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(true)
      },
      body: JSON.stringify({
        title: title || message,
        url: recordId ? `https://vafmlaradio.fr/#article-${recordId}` : "https://vafmlaradio.fr"
      })
    });

    if (res.ok) {
      console.log("Notification envoyée avec succès !");
    } else {
      console.warn("Échec d'envoi notification via PocketBase");
    }
  } catch (err) {
    console.error("Erreur d'envoi notification :", err);
  }
}

async function handleCardFormSubmit(e) {
  e.preventDefault();

  const category = document.getElementById('editor-category')?.value;
  const id = document.getElementById('editor-item-id')?.value;

  if (id && !canEditCategory(category)) {
    alert("Action non autorisée.");
    return;
  }
  if (!id && !canCreateInCategory(category)) {
    alert("Création non autorisée pour votre rôle.");
    return;
  }

  const btnSave = document.getElementById('btn-save-card');
  if (btnSave) {
    btnSave.innerText = "Optimisation...";
    btnSave.disabled = true;
  }

  const title = document.getElementById('editor-title')?.value?.trim() || '';
  const text = document.getElementById('editor-text')?.value?.trim() || '';

  if (!title) {
    alert("Veuillez saisir un titre.");
    if (btnSave) { btnSave.innerText = "Enregistrer les modifications"; btnSave.disabled = false; }
    return;
  }

  const collectionMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs', videos: 'videos' };
  const collectionName = collectionMap[category] || 'actus';

  const formData = new FormData();

  if (appState && appState.currentUser) {
    formData.append('user', appState.currentUser.id);
  }

  if (category === 'team') {
    formData.append('nom', title);
    formData.append('description', text);
  } else {
    formData.append('titre', title);
    formData.append('texte', text);
    formData.append('description', text);
  }

  let isPublishedStatus = true;
  if (!id) {
    formData.append('is_published', 'true');
  } else {
    const currentItem = appState[category]?.find(x => String(x.id) === String(id));
    isPublishedStatus = currentItem ? Boolean(currentItem.is_published) : true;
    formData.append('is_published', String(isPublishedStatus));
  }

  const fileInput = document.getElementById('file-input');
  let rawImage = selectedFile || (fileInput && fileInput.files && fileInput.files[0]);

  if (rawImage) {
    const compressedImage = await compressImage(rawImage, 1200, 0.8);
    formData.append('image', compressedImage);
  }

  try {
    if (btnSave) btnSave.innerText = "Sauvegarde en cours...";
    let url = `${POCKETBASE_URL}/api/collections/${collectionName}/records`;
    let method = 'POST';

    if (id) {
      url += `/${id}`;
      method = 'PATCH';
    }

    const res = await fetch(url, {
      method: method,
      headers: getAuthHeaders(false), 
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("Détails rejet PocketBase :", errData);
      const detail = errData.data ? JSON.stringify(errData.data) : (errData.message || `Erreur HTTP ${res.status}`);
      throw new Error(detail);
    }

    const savedRecord = await res.json();

    if (!id && (category === 'news' || category === 'hero') && isPublishedStatus) {
      await sendOneSignalNotification(title, text, savedRecord?.id);
    }

    closeEditorModal();
    await fetchAllFromPocketBase();
  } catch (err) {
    console.error("Erreur PocketBase :", err);
    alert("Impossible d'enregistrer : " + err.message);
  } finally {
    if (btnSave) {
      btnSave.innerText = "Enregistrer les modifications";
      btnSave.disabled = false;
    }
  }
}

async function deleteItem(collectionName, id) {
  const categoryMap = { 'hero': 'hero', 'actus': 'news', 'emissions': 'shows', 'animateurs': 'team', 'videos': 'videos' };
  if (!canEditCategory(categoryMap[collectionName] || collectionName)) {
    alert("Vous n'avez pas la permission de supprimer cet élément.");
    return;
  }

  if (confirm("Supprimer définitivement cet élément ?")) {
    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(true)
      });

      if (!res.ok) throw new Error("Erreur de suppression");
      await fetchAllFromPocketBase();
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  }
}

/* ==========================================================================
10. GESTION DE LA PUBLICATION DE SECTIONS
========================================================================== */
async function handleSectionPublish(event, section) {
    if (event) event.stopPropagation();

    const collectionMap = {
        'hero': 'hero',
        'news': 'actus',
        'actus': 'actus',
        'shows': 'emissions',
        'emissions': 'emissions',
        'team': 'animateurs',
        'animateurs': 'animateurs',
        'videos': 'videos'
    };

    const collectionName = collectionMap[section] || section;

    try {
        const btn = event?.currentTarget;
        if (btn) btn.innerText = "...";

        const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records?filter=(is_published=false)`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        const recordsToPublish = result.items || [];

        if (recordsToPublish.length === 0) {
            alert(`Tous les éléments de la section sont déjà publiés !`);
            if (btn) btn.innerText = "Publier";
            return;
        }

        const updatePromises = recordsToPublish.map(record => {
            return fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${record.id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ is_published: true })
            });
        });

        await Promise.all(updatePromises);
        alert(`✨ Publication réussie (${recordsToPublish.length} élément(s) mis à jour) !`);
        
        const menu = document.getElementById('publishMenu');
        if (menu) menu.classList.remove('active');

        await fetchAllFromPocketBase();

    } catch (error) {
        console.error(`Erreur de publication:`, error);
        alert(`Impossible de publier : ${error.message}`);
    } finally {
        const btn = event?.currentTarget;
        if (btn) btn.innerText = "Publier";
    }
}

async function handlePublishAll(event) {
    if (event) event.stopPropagation();

    const collections = ['hero', 'actus', 'emissions', 'animateurs', 'videos'];
    const btn = event?.currentTarget;

    try {
        if (btn) btn.innerText = "Publication...";

        for (const collection of collections) {
            const response = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records?filter=(is_published=false)`);
            if (response.ok) {
                const result = await response.json();
                const items = result.items || [];

                const updates = items.map(item => 
                    fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${item.id}`, {
                        method: 'PATCH',
                        headers: getAuthHeaders(true),
                        body: JSON.stringify({ is_published: true })
                    })
                );

                await Promise.all(updates);
            }
        }

        alert("🚀 Tout le site a été publié avec succès !");

        const menu = document.getElementById('publishMenu');
        if (menu) menu.classList.remove('active');

        await fetchAllFromPocketBase();

    } catch (error) {
        console.error("Erreur de publication globale:", error);
        alert("Erreur lors de la publication : " + error.message);
    } finally {
        if (btn) btn.innerText = "Tout publier";
    }
}

/* ==========================================================================
11. AUTHENTIFICATION & COMPTE UTILISATEUR
========================================================================== */
function toggleAuthModal() {
  if (appState && appState.currentUser) {
    openUserDrawer();
  } else {
    openAuthModal();
  }
}

function openAuthModal() {
  currentAuthMode = "login";
  resetAuthUI();
  openModal('auth-modal');
}

function toggleAuthMode() {
  currentAuthMode = currentAuthMode === 'login' ? 'signup' : 'login';
  updateAuthModalState();
}

function updateAuthModalState() {
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authSwitchLink = document.getElementById('auth-switch-link');
  const btnSubmit = document.getElementById('btn-auth-submit');
  const optinGroup = document.getElementById('newsletter-optin-group');

  if (currentAuthMode === "signup") {
    if (authTitle) authTitle.innerText = "Rejoindre le Club VAFM";
    if (authSubtitle) authSubtitle.innerText = "Créez votre compte en quelques secondes";
    if (authSwitchLink) authSwitchLink.innerText = "Déjà membre ? Se connecter";
    if (btnSubmit) btnSubmit.innerText = "S'inscrire";
    if (optinGroup) optinGroup.style.display = "block";
  } else {
    if (authTitle) authTitle.innerText = "Connexion VAFM";
    if (authSubtitle) authSubtitle.innerText = "Accédez à votre espace ou gérez la station";
    if (authSwitchLink) authSwitchLink.innerText = "Pas encore membre ? S'inscrire";
    if (btnSubmit) btnSubmit.innerText = "Se connecter";
    if (optinGroup) optinGroup.style.display = "none";
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
  const newsletterInput = document.getElementById('auth-newsletter');

  const identity = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  const newsletter = newsletterInput ? newsletterInput.checked : false;

  if (!identity || !password) {
    alert("Veuillez remplir tous les champs.");
    return;
  }

  if (currentAuthMode === "login") {
    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, password })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Identifiants incorrects ou serveur hors ligne.");
      }

      const data = await res.json();
      localStorage.setItem('pocketbase_auth', JSON.stringify(data));
      
      const userRecord = data.record || data.model;
      appState.currentUser = userRecord;
      
      checkAdminRights(userRecord);
      updateAuthUI();
      closeModal('auth-modal');
      await fetchAllFromPocketBase();
    } catch (err) {
      alert("Erreur de connexion : " + err.message);
    }
  } else {
    try {
      const cleanUsername = identity.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') + Math.floor(1000 + Math.random() * 9000);
      
      const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: cleanUsername,
          email: identity, 
          password: password, 
          passwordConfirm: password,
          name: cleanUsername,
          newsletter: newsletter
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Erreur lors de la création du compte.");
      }

      alert("Inscription réussie ! Vous pouvez maintenant vous connecter.");
      toggleAuthMode();
    } catch (err) {
      alert("Erreur d'inscription : " + err.message);
    }
  }
}

function logout() {
  localStorage.removeItem('pocketbase_auth');
  location.reload();
}

function checkAdminRights(user) {
  if (!user) {
    appState.editMode = false;
    appState.userRole = 'member';
    return;
  }

  const role = user.role || 'member';
  appState.userRole = role;
  appState.editMode = (role === 'admin' || role === 'journaliste' || role === 'journalist');

  document.body.classList.toggle('admin-logged-in', appState.editMode);
  document.body.classList.toggle('edit-mode-active', appState.editMode);
}

function openUserDrawer() {
  const drawer = document.getElementById('vafm-user-drawer');
  const overlay = document.getElementById('vafm-user-drawer-overlay');
  if (drawer && overlay) {
    drawer.classList.add('active');
    overlay.classList.add('active');
  }
}

function closeUserDrawer() {
  const drawer = document.getElementById('vafm-user-drawer');
  const overlay = document.getElementById('vafm-user-drawer-overlay');
  if (drawer && overlay) {
    drawer.classList.remove('active');
    drawer.classList.remove('sub-open');
    overlay.classList.remove('active');
  }
}

function openSubPanel() {
  const drawer = document.getElementById('vafm-user-drawer');
  if (drawer) drawer.classList.add('sub-open');
}

function closeSubPanel() {
  const drawer = document.getElementById('vafm-user-drawer');
  if (drawer) drawer.classList.remove('sub-open');
}

async function handleDeleteAccount() {
  if (!appState || !appState.currentUser) return;

  const confirmed = confirm("⚠️ ATTENTION : Voulez-vous vraiment supprimer définitivement votre compte ? Cette action est irréversible.");
  if (!confirmed) return;

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${appState.currentUser.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true)
    });

    if (!res.ok) throw new Error("Erreur lors de la suppression.");

    alert("Votre compte a été supprimé.");
    logout();
  } catch (err) {
    alert("Impossible de supprimer le compte : " + err.message);
  }
}

function openAccountSettingsModal() {
  if (!appState || !appState.currentUser) return;

  closeUserDrawer();

  const nameInput = document.getElementById('settings-name');
  const passwordInput = document.getElementById('settings-password');

  if (nameInput) {
    nameInput.value = appState.currentUser.name || appState.currentUser.username || '';
  }
  if (passwordInput) {
    passwordInput.value = '';
  }

  openModal('account-settings-modal');
}

async function handleGoogleAuth() {
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-methods`);
    if (!res.ok) throw new Error("Impossible de récupérer les méthodes d'authentification.");
    
    const data = await res.json();
    const googleProvider = data.authProviders?.find(p => p.name === 'google');

    if (!googleProvider) {
      alert("L'authentification Google n'est pas activée sur le serveur PocketBase.");
      return;
    }

    localStorage.setItem('pb_provider', JSON.stringify(googleProvider));

    const redirectUrl = `${window.location.origin}/redirect.html`;
    const authUrl = `${googleProvider.authUrl}${encodeURIComponent(redirectUrl)}`;

    const width = 500;
    const height = 600;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;

    window.open(
      authUrl,
      'Google Login',
      `width=${width},height=${height},top=${top},left=${left}`
    );

  } catch (err) {
    console.error("Erreur Google Auth:", err);
    alert("Erreur lors de la connexion avec Google.");
  }
}

window.addEventListener('message', async (event) => {
  if (event.data?.type === 'POCKETBASE_OAUTH_SUCCESS') {
    const { code, provider } = event.data;
    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-oauth2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.name,
          code: code,
          codeVerifier: provider.codeVerifier,
          redirectUrl: `${window.location.origin}/redirect.html`
        })
      });

      if (!res.ok) throw new Error("Échec de la validation OAuth2.");

      const authData = await res.json();
      
      localStorage.setItem('pocketbase_auth', JSON.stringify({
        token: authData.token,
        record: authData.record
      }));

      if (typeof appState !== 'undefined') {
        appState.currentUser = authData.record;
        appState.token = authData.token;
      }

      updateAuthUI();
      closeModal('auth-modal');
      alert("Connexion réussie avec Google !");

    } catch (err) {
      console.error("Erreur finalisation OAuth2:", err);
      alert("Erreur lors de la validation du compte Google.");
    }
  }
});

async function handleAccountUpdate(e) {
  e.preventDefault();

  if (!appState || !appState.currentUser) return;

  const newName = document.getElementById('settings-name')?.value.trim();
  const newPassword = document.getElementById('settings-password')?.value;

  const updateData = {};
  if (newName) {
    updateData.name = newName;
  }
  if (newPassword && newPassword.length >= 8) {
    updateData.password = newPassword;
    updateData.passwordConfirm = newPassword;
  }

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${appState.currentUser.id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updateData)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || "Impossible de mettre à jour le profil.");
    }

    const updatedUser = await res.json();
    appState.currentUser = updatedUser;

    const storedAuth = localStorage.getItem('pocketbase_auth');
    if (storedAuth) {
      const parsed = JSON.parse(storedAuth);
      parsed.record = updatedUser;
      localStorage.setItem('pocketbase_auth', JSON.stringify(parsed));
    }

    updateAuthUI();
    closeModal('account-settings-modal');
    alert("Profil mis à jour avec succès !");

  } catch (err) {
    console.error("Erreur update profil:", err);
    alert("Erreur : " + err.message);
  }
}

function updateAuthUI() {
  const profileZone = document.getElementById('user-profile-zone');
  if (!profileZone) return;

  const user = appState && appState.currentUser;

  if (user) {
    const displayName = user.name || user.username || user.email || "Utilisateur";
    const initial = displayName[0].toUpperCase();
    
    let roleLabel = 'Membre VAFM';
    if (appState.userRole === 'admin') roleLabel = 'Administrateur';
    if (appState.userRole === 'journaliste' || appState.userRole === 'journalist') roleLabel = 'Journaliste';

    profileZone.innerHTML = `
      <button class="btn-user-avatar logged-in" id="user-menu-btn" onclick="openUserDrawer()" title="${displayName}" style="background: transparent; padding: 0; border: none; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; cursor: pointer;">
        <img id="user-avatar-img" src="" alt="${displayName}" style="display: none; width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
        <span id="default-user-icon" class="user-initial" style="width: 100%; height: 100%; background-color: #E50914; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 50%;">${initial}</span>
      </button>
    `;

    const drawerName = document.getElementById('drawer-user-name');
    const drawerRole = document.getElementById('drawer-user-role');
    const adminSectionTitle = document.getElementById('drawer-admin-section-title');
    const adminBtn = document.getElementById('drawer-admin-btn');

    if (drawerName) drawerName.textContent = displayName;
    if (drawerRole) drawerRole.textContent = roleLabel;

    const isAdminOrJournalist = (appState.userRole === 'admin' || appState.userRole === 'journaliste' || appState.userRole === 'journalist');
    if (adminSectionTitle) adminSectionTitle.style.display = isAdminOrJournalist ? 'block' : 'none';
    if (adminBtn) adminBtn.style.display = isAdminOrJournalist ? 'flex' : 'none';

    updateHeaderAvatar(displayName);
    updateDrawerAvatar(displayName);

  } else {
    profileZone.innerHTML = `
      <button class="btn-user-avatar" id="user-menu-btn" onclick="toggleAuthModal()" title="Se connecter">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </button>
    `;
    updateHeaderAvatar(null);
    updateDrawerAvatar(null);
  }
}

function updateHeaderAvatar(username) {
  const imgEl = document.getElementById('user-avatar-img');
  const fallbackEl = document.getElementById('default-user-icon');

  if (!imgEl) return;

  if (!username) {
    imgEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'flex';
    return;
  }

  const avatarPath = getUserAvatarPath(username);
  const initial = username.trim()[0].toUpperCase();

  if (avatarPath) {
    imgEl.src = avatarPath;
    imgEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';

    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      if (fallbackEl) {
        fallbackEl.textContent = initial;
        fallbackEl.style.display = 'flex';
      }
    };
  } else {
    imgEl.style.display = 'none';
    if (fallbackEl) {
      fallbackEl.textContent = initial;
      fallbackEl.style.display = 'flex';
    }
  }
}

function getUserAvatarPath(username) {
  if (!username) return null;
  const cleanName = username.toLowerCase().trim();
  if (cleanName.includes('hugo')) return '/avatars/hugo.jpg';
  return null;
}

function updateDrawerAvatar(username) {
  const imgEl = document.getElementById('drawer-user-avatar-img');
  const fallbackEl = document.getElementById('drawer-user-avatar-fallback');

  if (!imgEl) return;

  const avatarPath = getUserAvatarPath(username);
  const initial = username ? username.trim()[0].toUpperCase() : 'U';

  if (avatarPath) {
    imgEl.src = avatarPath;
    imgEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';

    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      if (fallbackEl) {
        fallbackEl.textContent = initial;
        fallbackEl.style.display = 'flex';
      }
    };
  } else {
    imgEl.style.display = 'none';
    if (fallbackEl) {
      fallbackEl.textContent = initial;
      fallbackEl.style.display = 'flex';
    }
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
12. LECTEUR AUDIO & MÉTADONNÉES
========================================================================== */
async function saveSongToPocketBase(title, coverUrl) {
    if (!title || title === "VAFM – En Direct") return;

    try {
        const currentTime = new Date().toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit', 
            timeZone: 'Europe/Paris' 
        });

        const res = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({
                title: title,
                time: currentTime,
                cover: coverUrl
            })
        });

        if (res.ok) {
            console.log("🎵 Nouveau titre enregistré dans PocketBase :", title);
            cleanOldSongsFromPocketBase();
        } else {
            console.warn("⚠️ Impossible d'enregistrer le titre dans PocketBase :", await res.text());
        }
    } catch (err) {
        console.error("❌ Erreur lors de l'enregistrement du titre :", err);
    }
}

function updateMiniPlayState() {
  const playBtn = document.getElementById('playBtn') || document.getElementById('play-btn');
  const audio = document.getElementById('radio-audio');
  if (!playBtn || !audio) return;

  if (audio.paused) {
    playBtn.classList.remove('playing');
  } else {
    playBtn.classList.add('playing');
  }

  const miniPlayBtn = document.querySelector('.vafm-mini-play-btn');
  if (miniPlayBtn) {
    miniPlayBtn.textContent = audio.paused ? "▶" : "⏸";
  }
}

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

  function isVafmIdent(title) {
      if (!title) return true;
      const clean = title.toLowerCase().replace(/['’`]/g, "'");
      return clean.includes("radio qu'il vous faut") || 
             clean.includes("le meilleur du son") || 
             clean.includes("vafm");
  }

  if (!document.getElementById('vafm-history-dynamic-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'vafm-history-dynamic-style';
      styleEl.innerHTML = `
          .vafm-player-transformed {
              position: fixed !important;
              bottom: 20px !important;
              left: 50% !important;
              transform: translateX(-50%) !important;
              width: 100% !important;
              max-width: 1100px !important;
              height: 75px !important;
              box-sizing: border-box !important;
              z-index: 9999 !important;
              overflow: visible !important;
              transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1), 
                          height 0.45s cubic-bezier(0.4, 0, 0.2, 1), 
                          max-width 0.45s cubic-bezier(0.4, 0, 0.2, 1),
                          border-radius 0.45s ease,
                          box-shadow 0.45s ease !important;
          }

          .vafm-player-transformed.history-active {
              width: 420px !important;
              max-width: 92vw !important;
              height: 640px !important;
              max-height: 85vh !important;
              border-radius: 32px !important;
              background: #121218 !important;
              box-shadow: 0 30px 80px rgba(0, 0, 0, 0.95), 0 0 50px rgba(229, 9, 20, 0.15) !important;
          }

          .vafm-controls-wrapper {
              display: flex !important;
              align-items: center !important;
              justify-content: space-between !important;
              width: 100% !important;
              height: 75px !important;
              box-sizing: border-box !important;
              position: relative;
              z-index: 40;
          }

          .vafm-player-transformed.history-active .vafm-controls-wrapper {
              position: absolute !important;
              bottom: 0 !important;
              left: 0 !important;
              height: 75px !important;
              padding: 0 18px !important;
              background: #181822 !important;
              border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
              border-radius: 0 0 32px 32px !important;
          }

          .vafm-player-transformed.history-active [class*="wave"],
          .vafm-player-transformed.history-active [class*="equalizer"],
          .vafm-player-transformed.history-active [class*="bars"],
          .vafm-player-transformed.history-active .subtitle {
              display: none !important;
          }

          .vafm-player-transformed.history-active #marquee {
              max-width: 150px !important;
          }

          .vafm-player-transformed.history-active #play-btn,
          .vafm-player-transformed.history-active #playBtn {
              display: none !important;
          }

          .vafm-history-inside-panel {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 75px;
              background: #121218 !important;
              border-radius: 32px 32px 0 0;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.35s ease 0.1s;
              overflow: hidden !important;
              z-index: 5;
          }

          .vafm-player-transformed.history-active .vafm-history-inside-panel {
              opacity: 1;
              pointer-events: auto;
          }

          .vafm-top-nav {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 54px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0 20px;
              z-index: 30;
              background: linear-gradient(180deg, rgba(18, 18, 24, 0.95) 0%, rgba(18, 18, 24, 0) 100%);
          }

          .vafm-collapse-btn {
              background: rgba(255, 255, 255, 0.08);
              border: none;
              border-radius: 50%;
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #ffffff;
              cursor: pointer;
              transition: background 0.2s ease;
          }

          .vafm-collapse-btn:hover {
              background: rgba(255, 255, 255, 0.2);
          }

          .vafm-top-nav-title {
              font-size: 0.7rem;
              font-weight: 800;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: rgba(255, 255, 255, 0.7);
          }

          .vafm-nowplaying-fixed-bg {
              position: absolute;
              top: 54px;
              left: 0;
              right: 0;
              height: 270px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: 0 20px;
              z-index: 1;
              pointer-events: none;
          }

          .vafm-nowplaying-img {
              width: 180px;
              height: 180px;
              border-radius: 20px;
              object-fit: cover;
              box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7);
              margin-bottom: 12px;
              background: #22222a;
          }

          .vafm-nowplaying-details {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
              width: 100%;
          }

          .vafm-nowplaying-title {
              font-size: 1.1rem;
              font-weight: 700;
              color: #ffffff;
              width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
          }

          .vafm-nowplaying-artist {
              font-size: 0.85rem;
              font-weight: 500;
              color: #a0a0ab;
              width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
          }

          .vafm-scroll-content {
              position: absolute;
              top: 54px;
              left: 0;
              right: 0;
              bottom: 0;
              overflow-y: auto;
              z-index: 10;
              scroll-behavior: smooth;
          }

          .vafm-scroll-content::-webkit-scrollbar { width: 5px; }
          .vafm-scroll-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.25); border-radius: 4px; }

          .vafm-scroll-spacer {
              height: 270px;
              pointer-events: none;
          }

          .vafm-history-overlay-sheet {
              background: transparent !important;
              backdrop-filter: none;
              -webkit-backdrop-filter: none;
              border-top: none;
              border-radius: 24px 24px 0 0;
              padding: 18px 16px 40px 16px;
              box-shadow: none;
          }

          .vafm-history-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 14px;
          }

          .vafm-history-title {
              font-size: 0.72rem;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: #E50914;
              display: flex;
              align-items: center;
              gap: 8px;
          }

          .vafm-live-badge {
              font-size: 0.65rem;
              font-weight: 800;
              letter-spacing: 0.8px;
              color: #ffffff;
              background: #E50914;
              padding: 3px 8px;
              border-radius: 20px;
              display: flex;
              align-items: center;
              gap: 5px;
              box-shadow: 0 0 12px rgba(229, 9, 20, 0.5);
          }

          .vafm-live-dot {
              width: 6px;
              height: 6px;
              background: #ffffff;
              border-radius: 50%;
              animation: vafmPulse 1.5s infinite;
          }

          @keyframes vafmPulse {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.8); }
              100% { opacity: 1; transform: scale(1); }
          }

          .vafm-history-list {
              list-style: none;
              padding: 0;
              margin: 0;
              display: flex;
              flex-direction: column;
              gap: 10px;
              overflow: visible !important;
          }

          .vafm-history-item {
              padding: 10px 14px;
              background: rgba(18, 18, 24, 0.35) !important;
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 14px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              transition: background 0.2s ease, transform 0.15s ease;
          }

          .vafm-history-item:hover {
              background: rgba(255, 255, 255, 0.12) !important;
              transform: translateX(3px);
          }

          .vafm-history-song-left {
              display: flex;
              align-items: center;
              gap: 12px;
              overflow: hidden;
          }

          .vafm-history-cover {
              width: 44px;
              height: 44px;
              border-radius: 10px;
              object-fit: cover;
              flex-shrink: 0;
              background: #22222a;
          }

          .vafm-history-song-details {
              display: flex;
              flex-direction: column;
              gap: 2px;
              overflow: hidden;
          }

          .vafm-history-song-title {
              font-size: 0.85rem;
              font-weight: 600;
              color: #ffffff;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
          }

          .vafm-history-song-artist {
              font-size: 0.72rem;
              color: #a0a0ab;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
          }

          .vafm-history-time {
              font-size: 0.7rem;
              font-weight: 700;
              color: #b3b3b3;
              background: rgba(255, 255, 255, 0.06);
              padding: 4px 8px;
              border-radius: 6px;
              flex-shrink: 0;
          }

          .vafm-history-empty {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 24px;
              text-align: center;
              color: #8a8a95;
              gap: 8px;
          }

          .vafm-history-toggle-btn {
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              width: 36px;
              height: 36px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              color: #b3b3b3;
              transition: all 0.2s ease;
              margin-left: auto !important;
              flex-shrink: 0;
              z-index: 10;
          }

          .vafm-history-toggle-btn:hover {
              background: rgba(229, 9, 20, 0.3);
              color: #ffffff;
              border-color: rgba(229, 9, 20, 0.6);
          }

          .vafm-history-toggle-btn svg { width: 16px; height: 16px; fill: currentColor; }

          .vafm-mini-play-btn {
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              width: 36px;
              height: 36px;
              display: none;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              color: #ffffff;
              font-size: 14px;
              transition: all 0.2s ease;
              margin-left: auto !important;
              flex-shrink: 0;
              z-index: 10;
          }

          .vafm-mini-play-btn:hover {
              background: rgba(229, 9, 20, 0.3);
              border-color: rgba(229, 9, 20, 0.6);
          }

          .vafm-player-transformed.history-active .vafm-history-toggle-btn {
              display: none !important;
          }

          .vafm-player-transformed.history-active .vafm-mini-play-btn {
              display: flex !important;
          }
      `;
      document.head.appendChild(styleEl);
  }

  function fetchTrackCover(title) {
      return new Promise((resolve) => {
          if (isVafmIdent(title)) {
              return resolve('/LOGO - VAFM.png');
          }

          const query = title.split(' – ')[0] || title;
          const callbackName = 'itunesCallback_' + Math.floor(Math.random() * 1000000);
          const script = document.createElement('script');

          window[callbackName] = function(data) {
              delete window[callbackName];
              if (script.parentNode) document.body.removeChild(script);

              if (data && data.results && data.results.length > 0) {
                  const coverUrl = data.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
                  resolve(coverUrl);
              } else {
                  resolve('/LOGO - VAFM.png');
              }
          };

          script.onerror = function() {
              delete window[callbackName];
              if (script.parentNode) document.body.removeChild(script);
              resolve('/LOGO - VAFM.png');
          };

          script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1&callback=${callbackName}`;
          document.body.appendChild(script);
      });
  }

  let songHistory = [];
  try {
      songHistory = JSON.parse(localStorage.getItem("vafm_song_history") || "[]");
  } catch (e) {
      songHistory = [];
  }

  let lastTitleSeen = songHistory.length > 0 ? songHistory[0].title : "";

  async function fetchServerHistoryDirectly() {
    try {
        const res = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=20`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.items || data.items.length === 0) return;

        const uniqueItems = [];
        const seenTitles = new Set();

        for (const item of data.items) {
            const cleanTitle = (item.title || "").toLowerCase().trim();
            
            if (!seenTitles.has(cleanTitle) && !cleanTitle.includes("vafm – en direct")) {
                seenTitles.add(cleanTitle);
                uniqueItems.push(item);
            }

            if (uniqueItems.length === 10) break;
        }

        if (uniqueItems.length > 0) {
            lastTitleSeen = uniqueItems[0].title;
        }

        songHistory = uniqueItems.map(item => {
            let displayTime = item.time;
            if (item.created) {
                const d = new Date(item.created);
                displayTime = d.toLocaleTimeString('fr-FR', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    timeZone: 'Europe/Paris' 
                });
            }

            return {
                id: item.id,
                title: item.title,
                time: displayTime || 'En direct',
                cover: item.cover || '/LOGO - VAFM.png'
            };
        });

        localStorage.setItem("vafm_song_history", JSON.stringify(songHistory));
        renderHistoryList();

    } catch (e) {
        console.warn("Erreur chargement PocketBase song_history :", e);
    }
  }

  const playerBar = playBtn.closest('.player, .audio-player, div[style*="background"], footer') || playBtn.parentElement;
  let miniPlayBtn = null;

  if (playerBar && !playerBar.classList.contains('vafm-player-transformed')) {
      playerBar.classList.add('vafm-player-transformed');

      const controlsWrapper = document.createElement('div');
      controlsWrapper.className = 'vafm-controls-wrapper';
      while (playerBar.firstChild) {
          controlsWrapper.appendChild(playerBar.firstChild);
      }
      playerBar.appendChild(controlsWrapper);

      const historyPanel = document.createElement('div');
      historyPanel.className = 'vafm-history-inside-panel';
      historyPanel.innerHTML = `
          <div class="vafm-top-nav">
              <button class="vafm-collapse-btn" id="vafm-collapse-btn" title="Réduire">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <span class="vafm-top-nav-title">VAFM • EN DIRECT</span>
              <div style="width: 32px;"></div>
          </div>

          <div class="vafm-nowplaying-fixed-bg">
              <img id="vafm-live-cover" class="vafm-nowplaying-img" src="/LOGO - VAFM.png" alt="Direct Cover" onerror="this.src='/LOGO - VAFM.png'">
              <div class="vafm-nowplaying-details">
                  <span id="vafm-live-title" class="vafm-nowplaying-title">VAFM Direct</span>
                  <span id="vafm-live-artist" class="vafm-nowplaying-artist">Le meilleur du son</span>
              </div>
          </div>

          <div class="vafm-scroll-content">
              <div class="vafm-scroll-spacer"></div>
              <div class="vafm-history-overlay-sheet">
                  <div class="vafm-history-header">
                      <div class="vafm-history-title">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#E50914" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 16 18 9"/></svg>
                          HISTORIQUE DE DIFFUSION
                      </div>
                      <div class="vafm-live-badge">
                          <span class="vafm-live-dot"></span> DIRECT
                      </div>
                  </div>
                  <ul id="vafm-history-list" class="vafm-history-list">
                      <li class="vafm-history-empty">Chargement de l'historique...</li>
                  </ul>
              </div>
          </div>
      `;
      playerBar.insertBefore(historyPanel, controlsWrapper);

      document.getElementById("vafm-collapse-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          playerBar.classList.remove("history-active");
          document.body.classList.remove("vafm-lock-scroll");
      });

      const historyBtn = document.createElement('button');
      historyBtn.className = 'vafm-history-toggle-btn';
      historyBtn.title = "Historique des titres";
      historyBtn.innerHTML = `
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      `;

      historyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isActive = playerBar.classList.toggle('history-active');
          
          if (isActive) {
              document.body.classList.add("vafm-lock-scroll");
              renderHistoryList();
          } else {
              document.body.classList.remove("vafm-lock-scroll");
          }
      });

      controlsWrapper.appendChild(historyBtn);

      miniPlayBtn = document.createElement('button');
      miniPlayBtn.className = 'vafm-mini-play-btn';
      miniPlayBtn.title = "Lecture / Pause";
      miniPlayBtn.textContent = audio.paused ? "▶" : "⏸";

      miniPlayBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          playBtn.click();
      });

      controlsWrapper.appendChild(miniPlayBtn);
  } else {
      miniPlayBtn = playerBar?.querySelector('.vafm-mini-play-btn');
  }

  function renderHistoryList() {
      const listEl = document.getElementById('vafm-history-list');
      if (!listEl) return;

      if (songHistory.length === 0) {
          listEl.innerHTML = `<li class="vafm-history-empty">Aucun titre récent enregistré.</li>`;
          return;
      }

      listEl.innerHTML = songHistory.map(song => {
          const parts = song.title.split(' – ');
          const trackTitle = parts[1] || parts[0];
          const artistName = parts[1] ? parts[0] : 'VAFM Direct';
          const coverImage = isVafmIdent(song.title) ? '/LOGO - VAFM.png' : (song.cover || '/LOGO - VAFM.png');

          return `
              <li class="vafm-history-item">
                  <div class="vafm-history-song-left">
                      <img class="vafm-history-cover" src="${coverImage}" alt="Cover" onerror="this.src='/LOGO - VAFM.png'">
                      <div class="vafm-history-song-details">
                          <span class="vafm-history-song-title">${trackTitle}</span>
                          <span class="vafm-history-song-artist">${artistName}</span>
                      </div>
                  </div>
                  <span class="vafm-history-time">${song.time}</span>
              </li>
          `;
      }).join('');
  }

  renderHistoryList();

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
      updateMiniPlayState();
    } catch (e) {
      console.warn("Erreur de lecture gérée :", e.message);
      audio.pause();
      audio.src = "";
      if (playIcon) playIcon.textContent = "▶";
      playBtn.classList.remove("playing");
      updateMiniPlayState();
    }
  });

  audio.addEventListener("play", updateMiniPlayState);
  audio.addEventListener("pause", updateMiniPlayState);

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

      const formattedTitle = rawTitle.replace(/\s+[\-\–\—]\s+/, " – ");
      lancerDefilementVoiture(formattedTitle);

      const liveCoverEl = document.getElementById("vafm-live-cover");
      const liveTitleEl = document.getElementById("vafm-live-title");
      const liveArtistEl = document.getElementById("vafm-live-artist");

      const parts = formattedTitle.split(' – ');
      const currentTrackTitle = parts[1] || parts[0];
      const currentArtistName = parts[1] ? parts[0] : 'VAFM';

      if (liveTitleEl) liveTitleEl.textContent = currentTrackTitle;
      if (liveArtistEl) liveArtistEl.textContent = currentArtistName;

      const coverUrl = await fetchTrackCover(formattedTitle);
      if (liveCoverEl) liveCoverEl.src = coverUrl;

      if (formattedTitle.toLowerCase().trim() !== lastTitleSeen.toLowerCase().trim() && formattedTitle !== "VAFM – En Direct") {
        lastTitleSeen = formattedTitle;
        if (!isVafmIdent(formattedTitle)) {
            await saveSongToPocketBase(formattedTitle, coverUrl);
        }
        await fetchServerHistoryDirectly();
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: formattedTitle,
          artist: 'VAFM',
          album: 'En Direct',
          artwork: [
            { src: coverUrl, sizes: '512x512', type: 'image/png' }
          ]
        });
      }

    } catch (error) {
      lancerDefilementVoiture("VAFM – En Direct");
    }
  }

  fetchServerHistoryDirectly();
  updateCurrentTitle();
  setInterval(updateCurrentTitle, 15000);
}

/* ==========================================================================
13. OPEN GRAPH & MODALE VIDÉO
========================================================================== */
function updateOpenGraphTags(title, imageUrl, url) {
    const setMeta = (property, content) => {
        let tag = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
        if (!tag) {
            tag = document.createElement('meta');
            if (property.startsWith('og:')) {
                tag.setAttribute('property', property);
            } else {
                tag.setAttribute('name', property);
            }
            document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
    };

    if (title) setMeta('og:title', `${title} – VAFM`);
    if (imageUrl) setMeta('og:image', imageUrl);
    if (url) setMeta('og:url', url);
}

async function openVideoPlayerModal(url, title, videoId) {
    let modal = document.getElementById('vafm-tiktok-player-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vafm-tiktok-player-modal';
        modal.className = 'vafm-tiktok-overlay';
        document.body.appendChild(modal);
    }

    let isLiked = false;
    let likeRecordId = null;
    let likeCount = 0;
    let commentsList = [];

    let directVideoShareUrl = window.location.origin + "/";
    let videoPosterImg = "https://vafmlaradio.fr/LOGO-VAFM.png"; 

    if (videoId) {
        const currentVideoObj = appState.videos?.find(v => String(v.id).trim() === String(videoId).trim());
        if (currentVideoObj) {
            if (currentVideoObj.img) videoPosterImg = currentVideoObj.img;
            if (currentVideoObj.title && (!title || title === 'video')) title = currentVideoObj.title;
        }

        const cleanSlug = (title || 'video')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        
        directVideoShareUrl = `${window.location.origin}/?video=${videoId}-${cleanSlug}`;
        window.history.replaceState({}, '', `/?video=${videoId}-${cleanSlug}`);

        updateOpenGraphTags(title, videoPosterImg, directVideoShareUrl);

        try {
            const likesRes = await fetch(`${POCKETBASE_URL}/api/collections/video_likes/records?filter=(video='${videoId}')`);
            if (likesRes.ok) {
                const likesData = await likesRes.json();
                likeCount = likesData.totalItems || 0;

                if (appState && appState.currentUser) {
                    const userLike = likesData.items.find(item => item.user === appState.currentUser.id);
                    if (userLike) {
                        isLiked = true;
                        likeRecordId = userLike.id;
                    }
                }
            }

            const commentsRes = await fetch(`${POCKETBASE_URL}/api/collections/video_comments/records?filter=(video='${videoId}')&sort=-created`);
            if (commentsRes.ok) {
                const commentsData = await commentsRes.json();
                commentsList = commentsData.items || [];
            }
        } catch (e) {
            console.warn("Erreur chargement données PocketBase :", e);
        }
    }

    modal.innerHTML = `
        <div class="vafm-tiktok-wrapper" style="width: 100%; height: 100%; max-width: 100vw; max-height: 100vh; border-radius: 0;">
            <button class="vafm-tiktok-close-btn" id="close-tiktok-player">✕</button>
            
            <video class="vafm-tiktok-video" id="vafm-reel-video" src="${url}" loop playsinline autoplay style="object-fit: cover; width: 100%; height: 100%;"></video>
            <div class="vafm-tiktok-gradient-overlay"></div>

            <div class="vafm-share-toast" id="vafm-toast">Lien copié dans le presse-papier ! 🔗</div>

            <div class="vafm-tiktok-play-center" id="vafm-play-center-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>

            <div class="vafm-tiktok-info">
                <div class="vafm-tiktok-author">
                    <span class="vafm-tiktok-badge">Reels VAFM</span>
                </div>
                <div class="vafm-tiktok-caption-text">${title}</div>
            </div>

            <div class="vafm-tiktok-side-actions">
                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn ${isLiked ? 'liked' : ''}" id="vafm-like-btn" title="J'aime">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                    <span class="vafm-tiktok-action-count" id="vafm-like-count">${likeCount}</span>
                </div>

                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn" id="vafm-comments-btn" title="Commentaires">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                    <span class="vafm-tiktok-action-count" id="vafm-comments-count">${commentsList.length}</span>
                </div>

                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn" id="vafm-share-btn" title="Partager">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                    </button>
                    <span class="vafm-tiktok-action-count">Partager</span>
                </div>

                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn" id="vafm-toggle-mute" title="Son">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    const videoEl = document.getElementById('vafm-reel-video');
    const closeBtn = document.getElementById('close-tiktok-player');
    const shareBtn = document.getElementById('vafm-share-btn');
    const muteBtn = document.getElementById('vafm-toggle-mute');

    closeBtn?.addEventListener('click', () => {
        modal.style.display = 'none';
        if (videoEl) videoEl.pause();
        window.history.replaceState({}, '', window.location.pathname);
    });

    shareBtn?.addEventListener('click', async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    text: `${title} – À regarder sur VAFM`,
                    url: directVideoShareUrl
                });
            } catch (err) {}
        } else {
            try {
                await navigator.clipboard.writeText(directVideoShareUrl);
                const toast = document.getElementById('vafm-toast');
                if (toast) {
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2500);
                }
            } catch (err) {
                alert("Lien : " + directVideoShareUrl);
            }
        }
    });

    muteBtn?.addEventListener('click', () => {
        if (videoEl) {
            videoEl.muted = !videoEl.muted;
        }
    });
}

/* ==========================================================================
14. GESTION DU ROUTAGE (ÉCOUTE DES BOUTONS DE NAVIGATION DU NAVIGATEUR)
========================================================================== */
window.addEventListener('popstate', checkUrlForArticle);

/* ==========================================================================
15. INJECTION DE NOTIFICATIONS SYSTÈME TOUS LES 2 ARTICLES
========================================================================== */

/**
 * Propose la notification système lors du défilement des articles
 * @param {Array} articles 
 */
function handleArticleScrollNotifications(articles) {
  const container = document.getElementById('vafm-articles-container');
  if (!container || !Array.isArray(articles)) return;

  container.innerHTML = '';

  articles.forEach((article, index) => {
    const articleEl = createArticleCardElement(article);

    // Déclencheur : au rendu du 2e article (index 1, 3, 5...), on sollicite la permission système
    if ((index + 1) % 2 === 0) {
      articleEl.dataset.triggerNotif = "true";
    }

    container.appendChild(articleEl);
  });

  // Détection du scroll pour afficher la pop-up système au bon moment
  setupSystemNotifTrigger();
}

/**
 * Déclenche la demande native du navigateur quand l'utilisateur atteint l'article cible
 */
function setupSystemNotifTrigger() {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return; // Ne fait rien si non supporté ou déjà accepté/refusé
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Demande directement la permission native
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification("VAFM Radio", {
              body: "Les notifications en direct sont activées !",
              icon: "/assets/icon.png"
            });
          }
        });
        // Ne le demande qu'une seule fois pendant la session
        observer.disconnect();
      }
    });
  }, { threshold: 0.6 });

  // On observe le 2ème article
  const targetArticle = document.querySelector('[data-trigger-notif="true"]');
  if (targetArticle) {
    observer.observe(targetArticle);
  }
}

// OUVRIRE LA BARRE DE RECHERCHE ET MASQUER LE MENU
function openSearchBar() {
  const navLinks = document.getElementById('nav-links');
  const searchBar = document.getElementById('search-bar-container');
  const searchInput = document.getElementById('global-search-input');

  if (navLinks && searchBar) {
    navLinks.classList.add('hidden');
    searchBar.classList.add('active');
    setTimeout(() => searchInput?.focus(), 150);
  }
}

// FERMER LA BARRE DE RECHERCHE ET REFAIRE APPARAÎTRE LE MENU
function closeSearchBar() {
  const navLinks = document.getElementById('nav-links');
  const searchBar = document.getElementById('search-bar-container');
  const dropdown = document.getElementById('search-results-dropdown');
  const searchInput = document.getElementById('global-search-input');

  if (navLinks && searchBar) {
    searchBar.classList.remove('active');
    navLinks.classList.remove('hidden');
    if (dropdown) dropdown.classList.remove('active');
    if (searchInput) searchInput.value = '';
  }
}

// LOGIQUE DE RECHERCHE GLOBALE FIXÉE
function handleGlobalSearch(event) {
  const query = event.target.value.toLowerCase().trim();
  const dropdown = document.getElementById('search-results-dropdown');
  if (!dropdown) return;

  if (query.length < 2) {
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
    return;
  }

  let results = [];

// 1. Recherche dans les articles / actualités
  if (appState && appState.news) {
    appState.news.forEach(item => {
      const matchTitle = item.title && item.title.toLowerCase().includes(query);
      const matchText = item.text && item.text.toLowerCase().includes(query);
      
      if (matchTitle || matchText) {
        results.push({
          type: 'Article',
          title: item.title || 'Article sans titre',
          action: () => {
            closeSearchBar();
            // Passe la catégorie ('actus') EN PREMIER, puis l'ID de l'article EN SECOND
            const category = item.category || 'actus';
            const id = item.id;

            if (typeof openArticleView === 'function') {
              openArticleView(category, id);
            } else if (typeof openArticle === 'function') {
              openArticle(category, id);
            } else if (id) {
              window.location.hash = `article-${id}`;
            }
          }
        });
      }
    });
  }

  // 2. Recherche dans les émissions
  if (appState && appState.shows) {
    appState.shows.forEach(item => {
      if (item.title && item.title.toLowerCase().includes(query)) {
        results.push({
          type: 'Émission',
          title: item.title,
          action: () => {
            closeSearchBar();
            const el = document.getElementById('emissions');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            else window.location.hash = 'emissions';
          }
        });
      }
    });
  }

  // 3. Recherche dans les animateurs
  if (appState && appState.team) {
    appState.team.forEach(item => {
      if (item.title && item.title.toLowerCase().includes(query)) {
        results.push({
          type: 'Animateur',
          title: item.title,
          action: () => {
            closeSearchBar();
            const el = document.getElementById('animateurs');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            else window.location.hash = 'animateurs';
          }
        });
      }
    });
  }

  // Affichage des résultats
  if (results.length > 0) {
    dropdown.innerHTML = results.map((res, index) => `
      <div class="search-result-item" data-index="${index}">
        <span class="search-result-type">${res.type}</span>
        <span class="search-result-title">${res.title}</span>
      </div>
    `).join('');

    // Attachement des événements au clic
    dropdown.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(el.getAttribute('data-index'), 10);
        if (results[index] && typeof results[index].action === 'function') {
          results[index].action();
        }
      });
    });

    dropdown.classList.add('active');
  } else {
    dropdown.innerHTML = `<div class="search-result-item" style="color: #888; cursor: default;">Aucun résultat trouvé</div>`;
    dropdown.classList.add('active');
  }
}

// Fonction pour déterminer le chemin de l'image d'avatar selon la 1ère lettre
function getUserAvatarPath(username) {
    if (!username || typeof username !== 'string') return null;

    const firstLetter = username
        .trim()
        .charAt(0)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    if (/^[a-z]$/.test(firstLetter)) {
        return `/avatars/${firstLetter}.png`;
    }
    return null;
}

function updateHeaderAvatar(username) {
  const imgEl = document.getElementById('user-avatar-img');
  const fallbackEl = document.getElementById('default-user-icon');

  if (!imgEl) return;

  const avatarPath = getUserAvatarPath(username);

  if (avatarPath) {
    imgEl.src = avatarPath;
    imgEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';

    imgEl.onerror = () => {
      // Si le fichier png renvoie une erreur 404
      imgEl.style.display = 'none';
      if (fallbackEl) fallbackEl.style.display = 'flex';
    };
  } else {
    imgEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'flex';
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const logoBtn = document.getElementById('home-logo-btn'); // Cible l'élément complet du logo
  const footer = document.getElementById('main-footer'); // Cible le vrai footer du bas

  if (logoBtn && footer) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          logoBtn.style.opacity = '0';
          logoBtn.style.pointerEvents = 'none';
          logoBtn.style.visibility = 'hidden';
        } else {
          logoBtn.style.opacity = '1';
          logoBtn.style.pointerEvents = 'auto';
          logoBtn.style.visibility = 'visible';
        }
      });
    }, {
      threshold: 0.1
    });

    observer.observe(footer);
  }
});