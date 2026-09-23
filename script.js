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
async function compressImage(file, maxWidth = 1200, quality = 0.7) {
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

        const finalize = (blob, mimeType, extension) => {
          // Libération explicite du Canvas pour la mémoire
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) return resolve(file);
          const safeName = (file.name || 'image').replace(/\.[^/.]+$/, "") + extension;
          resolve(new File([blob], safeName, { type: mimeType }));
        };

        canvas.toBlob((blob) => {
          // Certains navigateurs (notamment Safari) ne savent pas encoder du WebP
          // via canvas.toBlob et renvoient silencieusement un PNG à la place, tout
          // en gardant le type MIME demandé — le fichier final se retrouvait alors
          // étiqueté ".webp" alors qu'il contenait en réalité un gros PNG non
          // compressé. On vérifie ici le type RÉEL du blob produit par le
          // navigateur, et on rebascule sur du JPEG (beaucoup plus fiable et
          // universellement supporté) si l'encodage WebP a échoué.
          if (blob && blob.type === 'image/webp') {
            finalize(blob, 'image/webp', '.webp');
          } else {
            canvas.toBlob((jpegBlob) => {
              finalize(jpegBlob, 'image/jpeg', '.jpg');
            }, 'image/jpeg', quality);
          }
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

document.addEventListener('DOMContentLoaded', () => {
  if (typeof drawVafmWheel === 'function') drawVafmWheel();
  updatePointsUI();
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

// Fonction pour vérifier la chaîne TCF v2.2 et le consentement Google
function getTCFConsent() {
  return new Promise((resolve) => {
    // Si la CMP n'est pas présente sur la page (ex: hors UE ou dev)
    if (typeof window.__tcfapi !== 'function') {
      console.warn("⚠️ CMP (TCF v2.2) non détectée sur la page.");
      return resolve({ tcString: null, googleConsent: true });
    }

    // Interrogation de l'API TCF v2.2
    window.__tcfapi('addEventListener', 2, (tcData, success) => {
      if (success && (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete')) {
        
        // Google / Google Advertising Products (Vendor IAB ID = 755)
        const GOOGLE_VENDOR_ID = 755;
        const vendorConsents = tcData.vendor?.consents || {};
        
        // Vérification de la chaîne de consentement TCF v2.2
        const tcString = tcData.tcString;
        const hasGoogleConsent = !!vendorConsents[GOOGLE_VENDOR_ID];

        console.log("📜 Chaine TCF v2.2 récupérée :", tcString);
        console.log("✅ Consentement Google Ad Manager (Vendor 755) :", hasGoogleConsent);

        // Suppression de l'écouteur après récupération
        window.__tcfapi('removeEventListener', 2, () => {}, tcData.listenerId);

        resolve({ tcString, googleConsent: hasGoogleConsent });
      }
    });
  });
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
      
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Erreur ${res.status} sur la collection : ${collection}`);
          if (res.status >= 500) isServerDown = true;
          return [];
        }
        const data = await res.json();
        return data.items || [];
      } catch (e) {
        console.error(`Injoignable : ${collection}`, e);
        isServerDown = true;
        return [];
      }
    };

    const [heroItems, actusItems, emissionsItems, videosItems, actuLikesItems] = await Promise.all([
      getCollectionData('hero'),
      // CORRECTION 1 : Ajout de "category" dans le paramètre fields
      getCollectionData('actus', 'id,titre,title,texte,contenu,description,image,category,is_published,position,created'),
      getCollectionData('emissions'),
      // La collection "animateurs" n'est plus chargée ici : elle l'est
      // uniquement à la demande par team.js, quand la page Animateurs
      // est réellement ouverte (voir team.js).
      getCollectionData('videos'),
      getCollectionData('actu_likes')
    ]);

    if (isServerDown) {
      showMaintenanceScreen();
      return;
    }

    document.getElementById('maintenance-overlay')?.classList.add('hidden');

    const canSeeDrafts = Boolean(appState.editMode && appState.currentUser);

    const filterPublished = (items) => {
      if (canSeeDrafts) return items;
      return items.filter(item => item.is_published === undefined || item.is_published === true || item.is_published === 1);
    };

    appState.hero = filterPublished(heroItems).map(h => ({
    id: h.id,
    title: h.titre || h.title || '',
    text: h.description || h.texte || '',

    // Image optimisée pour le chargement initial
    img: getPocketBaseImageUrl(
        'hero',
        h.id,
        h.image,
        '1280x640'
    ) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1280',

    // Version mobile beaucoup plus légère
    imgMobile: getPocketBaseImageUrl(
        'hero',
        h.id,
        h.image,
        '768x384'
    ) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=768',

    is_published: h.is_published !== undefined ? Boolean(h.is_published) : true,
    position: h.position || 0
}));

    appState.news = filterPublished(actusItems).map(a => {
      const likesForThisActu = actuLikesItems.filter(l => l.actu === a.id);

      return {
        id: a.id,
        title: a.titre || a.title || '',
        text: a.texte || a.description || '',
        // CORRECTION 2 : Récupération du champ category
        category: a.category || 'sport',
        img: getPocketBaseImageUrl('actus', a.id, a.image, '400x280') || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600',
        is_published: a.is_published !== undefined ? Boolean(a.is_published) : true,
        position: a.position || 0,
        likesList: likesForThisActu,
        created: a.created
      };
    });

    appState.shows = filterPublished(emissionsItems).map(e => ({
      id: e.id,
      title: e.titre || e.title || '',
      text: e.description || e.texte || '',
      img: getPocketBaseImageUrl('emissions', e.id, e.image, '400x280') || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
      is_published: e.is_published !== undefined ? Boolean(e.is_published) : true,
      position: e.position || 0
    }));

    // appState.team n'est plus alimenté ici : team.js s'en charge dès que
    // la page Animateurs est ouverte pour la première fois (fetch à la demande).

    appState.videos = filterPublished(videosItems).map(v => ({
      id: v.id,
      title: v.titre || v.title || '',
      text: v.description || v.texte || '',
      img: getPocketBaseImageUrl('videos', v.id, v.poster || v.image, '400x280') || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=600',
      videoUrl: getPocketBaseImageUrl('videos', v.id, v.video_file || v.file) || '',
      is_published: v.is_published !== undefined ? Boolean(v.is_published) : true,
      position: v.position || 0,
      created: v.created
    }));

    renderAll();
    
    // Si la vue SPA news est ouverte, on la rafraîchit
    if (typeof renderNewsSpa === 'function') {
      renderNewsSpa(appState.news);
    }
  } catch (err) {
    console.error("Erreur générale :", err);
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

    <img
    src="${item.img}"
    class="card-img"
    alt="${(item.title || '').replace(/"/g, '&quot;')}"
    loading="lazy"
    decoding="async"
    width="400"
    height="280"
    onerror="this.src='https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600'"
>

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

// Rend les 3 sous-sections Actualités de l'accueil (Nouveaux, Plus likés,
// Plus anciennes) avec le carrousel bento (tailles de cartes aléatoires,
// pagination limitée + carte "Voir plus" vers la page Actus dédiée).
function renderHomeNewsGrids() {
  const topLikedGrid = document.getElementById('top-liked-news-grid');
  const topLikedSubsection = document.getElementById('top-liked-subsection');
  const recentNewsGrid = document.getElementById('recent-news-grid');
  const oldNewsGrid = document.getElementById('old-news-grid');
  const oldNewsSubsection = document.getElementById('old-news-subsection');

  if (!appState.news) return;

  const renderBento = typeof renderHomeNewsBento === 'function' ? renderHomeNewsBento : null;

  if (topLikedGrid) {
    const topLikedNews = [...appState.news]
      .filter(item => Array.isArray(item.likesList) && item.likesList.length > 0)
      .sort((a, b) => (b.likesList?.length || 0) - (a.likesList?.length || 0))
      .slice(0, 3);

    if (topLikedNews.length > 0) {
      if (topLikedSubsection) topLikedSubsection.style.display = 'block';
      if (renderBento) renderBento(topLikedGrid, topLikedNews, 'home_top_liked');
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

  if (recentNewsGrid && renderBento) {
    renderBento(recentNewsGrid, recentNews, 'home_recent');
  }

  if (oldNewsGrid) {
    if (oldNews.length > 0) {
      if (oldNewsSubsection) oldNewsSubsection.style.display = 'block';
      if (renderBento) renderBento(oldNewsGrid, oldNews, 'home_old');
    } else {
      if (oldNewsSubsection) oldNewsSubsection.style.display = 'none';
    }
  }
}

function renderAll() {
  const heroWrapper = document.getElementById('hero-wrapper');
  const showsGrid = document.getElementById('shows-grid');

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

const responsiveImage = slide.imgMobile
    ? `src="${slide.imgMobile}"
       srcset="${slide.imgMobile} 768w, ${slide.img} 1280w"
       sizes="100vw"`
    : `src="${slide.img}"`;

// Précharge uniquement la première image du Hero (LCP) — le vrai
// préchargement se fait maintenant côté serveur (voir api/home.js), avant
// même que ce JS ne s'exécute. Cette injection client-side n'a donc plus
// d'utilité pour la vitesse : elle arrive toujours trop tard pour aider le
// LCP, puisque script.js n'a pu s'exécuter qu'après le chargement complet
// de la page et la récupération des données PocketBase.

return `
<div class="swiper-slide hero-slide ${!slide.is_published ? 'draft-card' : ''}">
    <img
        ${responsiveImage}
        class="slide-bg"
        alt="${slide.title}"
        ${loadingAttrs}
        decoding="async"
    >
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
      pagination: { el: ".swiper-pagination", clickable: false },
      observer: true,
      observeParents: true
    });
  }

  renderHomeNewsGrids();

  renderGrid(showsGrid, appState.shows, 'shows', 'emissions');

  // Le rendu des grilles Animateurs (Directeurs / DJ / Animateurs) est
  // maintenant géré par team.js, uniquement quand la page dédiée est ouverte.

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
        <img
    src="${video.img}"
    alt="${video.title}"
    loading="lazy"
    decoding="async"
    width="640"
    height="360"
>
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
  // Le tri des grilles Animateurs est initialisé par team.js, uniquement
  // quand la page dédiée est ouverte (les grilles n'existent plus ici).
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

    // Idem : rafraîchit la page Animateurs dédiée si c'est elle qui est concernée.
    if (targetCollection === 'animateurs' && typeof fetchAndRenderTeam === 'function') {
      await fetchAndRenderTeam();
    }
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
  
  // Éléments du sélecteur de catégorie d'actualité
  const categoryGroup = document.getElementById('editor-category-select-group');
  const categorySelect = document.getElementById('editor-news-category');

  if (catInput) catInput.value = category;
  if (idInput) idInput.value = id || '';
  if (preview) preview.innerHTML = '';
  if (fileInput) fileInput.value = '';

  // Afficher le menu déroulant uniquement pour les actualités
  // (et rendre le champ "required" uniquement dans ce cas : un champ caché
  // mais toujours required bloque la validation du formulaire sans aucun
  // message visible, d'où le bouton "Enregistrer" qui semblait ne rien faire)
  if (categoryGroup) {
    const isNews = category === 'news';
    categoryGroup.style.display = isNews ? 'block' : 'none';
    if (categorySelect) {
      if (isNews) {
        categorySelect.setAttribute('required', 'required');
      } else {
        categorySelect.removeAttribute('required');
      }
    }
  }

  const titleEl = document.getElementById('modal-editor-title');

  if (id) {
    const item = appState[category]?.find(x => String(x.id) === String(id));
    if (item) {
      if (titleEl) titleEl.innerText = "Modifier l'élément";
      const edTitle = document.getElementById('editor-title');
      const edText = document.getElementById('editor-text');
      if (edTitle) edTitle.value = item.title || '';
      if (edText) edText.value = item.text || item.description || '';
      
      // Pré-sélectionner la catégorie existante
      if (category === 'news' && categorySelect && item.category) {
        categorySelect.value = item.category;
      }

      if (item.img && preview) {
        preview.innerHTML = `<img src="${item.img}" alt="">`;
      }
    }
// À la fin de la fonction openEditorModal, dans le bloc "else" (Ajout d'un élément) :
} else {
  if (titleEl) titleEl.innerText = "Ajouter un élément";
  const form = document.getElementById('card-editor-form');
  if (form) form.reset();

  // Forcer l'option par défaut "-- Sélectionner une catégorie --"
  if (category === 'news' && categorySelect) {
    categorySelect.selectedIndex = 0;
  }
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
    if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="">`;
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

// Vérification de la catégorie pour les actualités
if (category === 'news') {
  const newsCategorySelect = document.getElementById('editor-news-category');
  if (!newsCategorySelect || !newsCategorySelect.value) {
    alert("Veuillez sélectionner une catégorie pour l'actualité.");
    return;
  }
}

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

  // AJOUT : Récupération et envoi de la sous-catégorie d'actualité (sport, faits-divers, etc.)
  if (category === 'news') {
    const newsCategorySelect = document.getElementById('editor-news-category');
    if (newsCategorySelect) {
      formData.append('category', newsCategorySelect.value);
    }
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
    const compressedImage = await compressImage(rawImage, 1000, 0.7);
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

    // La collection "animateurs" n'est plus incluse dans fetchAllFromPocketBase :
    // si on vient de créer/modifier un animateur, on rafraîchit sa page dédiée.
    if (category === 'team' && typeof fetchAndRenderTeam === 'function') {
      await fetchAndRenderTeam();
    }
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

      // Idem : rafraîchit la page Animateurs dédiée si c'est elle qui est concernée.
      if (collectionName === 'animateurs' && typeof fetchAndRenderTeam === 'function') {
        await fetchAndRenderTeam();
      }
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

// Variables globales pour stocker l'email et l'OTP ID pendant l'inscription
let pendingUserEmail = '';
let pendingOtpId = '';

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
      
      // 1. Création de l'utilisateur
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

      // 2. Demande d'envoi du code OTP par mail
      const otpRes = await fetch(`${POCKETBASE_URL}/api/collections/users/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identity })
      });

      if (!otpRes.ok) {
        throw new Error("Compte créé, mais erreur lors de l'envoi du code par mail.");
      }

      const otpData = await otpRes.json();
      pendingUserEmail = identity;
      pendingOtpId = otpData.otpId;

      // 3. Bascule vers la modale OTP
      closeModal('auth-modal');
      document.getElementById('otp-modal').style.display = 'flex';

    } catch (err) {
      alert("Erreur d'inscription : " + err.message);
    }
  }
}

// Validation du code à 6 chiffres reçu par e-mail
async function handleOtpSubmit(e) {
  e.preventDefault();
  const codeInput = document.getElementById('otp-code');
  const password = codeInput ? codeInput.value.trim() : "";

  if (!password || password.length !== 6) {
    alert("Veuillez entrer un code valide à 6 chiffres.");
    return;
  }

  try {
    // Authentification via l'OTP auprès de PocketBase
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpId: pendingOtpId,
        password: password
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || "Code incorrect ou expiré.");
    }

    const data = await res.json();
    localStorage.setItem('pocketbase_auth', JSON.stringify(data));

    const userRecord = data.record || data.model;
    appState.currentUser = userRecord;

    checkAdminRights(userRecord);
    updateAuthUI();
    closeModal('otp-modal');
    alert("Compte vérifié et connecté avec succès !");
    await fetchAllFromPocketBase();

  } catch (err) {
    alert("Erreur de validation : " + err.message);
  }
}

// Fonction pour renvoyer un code si besoin
async function resendOtpCode() {
  if (!pendingUserEmail) return;
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingUserEmail })
    });

    if (!res.ok) throw new Error("Erreur serveur.");

    const otpData = await res.json();
    pendingOtpId = otpData.otpId;
    alert("Un nouveau code vient de vous être envoyé.");
  } catch (err) {
    alert("Impossible de renvoyer le code pour le moment.");
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

// Tiroir de navigation rapide (icône hamburger) — même mécanique que le
// tiroir profil, sur un élément séparé pour ne rien mélanger.
function openNavDrawer() {
  const drawer = document.getElementById('vafm-nav-drawer');
  const overlay = document.getElementById('vafm-nav-drawer-overlay');
  if (drawer && overlay) {
    drawer.classList.add('active');
    overlay.classList.add('active');
  }
}

function closeNavDrawer() {
  const drawer = document.getElementById('vafm-nav-drawer');
  const overlay = document.getElementById('vafm-nav-drawer-overlay');
  if (drawer && overlay) {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  }
}

// Ferme le tiroir puis navigue vers la page demandée, en passant par le
// routage central (handleNavigation) pour rester cohérent avec le menu du
// haut et fermer proprement un article éventuellement ouvert.
function goToNavLink(hash) {
  closeNavDrawer();
  history.pushState(null, '', hash);
  if (typeof handleNavigation === 'function') {
    handleNavigation();
  }
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
12. LECTEUR AUDIO & MÉTADONNÉES AVEC INTÉGRATION PUBLICITÉ VAST (GOOGLE IMA)
========================================================================== */

// URL du tag VAST Ads Manager
const VAST_URL = "https://pubads.g.doubleclick.net/gampad/ads?iu=/23378612411/vafm_preroll_audio&description_url=https%3A%2F%2Fvafmlaradio.fr&tfcd=0&npa=1&ad_type=audio&sz=1x1&gdfp_req=1&unviewed_position_start=1&output=vast&env=vp&impl=s&correlator=" + Date.now();

// Variables globales SDK IMA
let adsLoader = null;
let adsManager = null;
let adDisplayContainer = null;
let adPlayedThisSession = false; // Permet de ne pas rejouer la pub à chaque pause/play

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
    playBtn.setAttribute('aria-label', 'Lecture');
    playBtn.setAttribute('aria-pressed', 'false');
  } else {
    playBtn.classList.add('playing');
    playBtn.setAttribute('aria-label', 'Pause');
    playBtn.setAttribute('aria-pressed', 'true');
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
                  const coverUrl = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                  resolve(coverUrl);
              } else {
                  resolve('/LOGO - VAFM.png');
              }
          };

          script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1&callback=${callbackName}`;
          script.onerror = () => {
              delete window[callbackName];
              if (script.parentNode) document.body.removeChild(script);
              resolve('/LOGO - VAFM.png');
          };

          document.body.appendChild(script);
      });
  }

  let lastTrack = '';

  async function updateStats() {
      try {
          const res = await fetch(STATS_URL + '?t=' + Date.now());
          if (!res.ok) return;

          const data = await res.json();
          const source = data?.icestats?.source;
          let songTitle = 'VAFM – En Direct';

          if (Array.isArray(source)) {
              songTitle = source[0]?.title || songTitle;
          } else if (source && source.title) {
              songTitle = source.title;
          }

          if (songTitle !== lastTrack) {
              lastTrack = songTitle;
              if (trackSpan) trackSpan.textContent = songTitle;

              const coverUrl = await fetchTrackCover(songTitle);
              
              const nowPlayingImg = document.querySelector('.vafm-nowplaying-img');
              if (nowPlayingImg) nowPlayingImg.src = coverUrl;

              const nowPlayingTitle = document.querySelector('.vafm-nowplaying-title');
              const nowPlayingArtist = document.querySelector('.vafm-nowplaying-artist');
              
              if (songTitle.includes(' – ')) {
                  const parts = songTitle.split(' – ');
                  if (nowPlayingArtist) nowPlayingArtist.textContent = parts[0];
                  if (nowPlayingTitle) nowPlayingTitle.textContent = parts.slice(1).join(' – ');
              } else {
                  if (nowPlayingTitle) nowPlayingTitle.textContent = songTitle;
                  if (nowPlayingArtist) nowPlayingArtist.textContent = 'VAFM';
              }

              await saveSongToPocketBase(songTitle, coverUrl);
          }
      } catch (err) {
          console.warn("Erreur mise à jour métadonnées radio:", err);
      }
  }

  function startLiveStream() {
      audio.src = STREAM_URL + '?t=' + Date.now();
      audio.load();
      audio.play().then(() => {
          updateMiniPlayState();
      }).catch(err => {
          console.error("Erreur de lecture du flux:", err);
          updateMiniPlayState();
      });
  }

  function togglePlay() {
      if (audio.paused) {
          startLiveStream();
      } else {
          audio.pause();
          audio.src = '';
          updateMiniPlayState();
      }
  }

  playBtn.addEventListener('click', togglePlay);

  audio.addEventListener('play', updateMiniPlayState);
  audio.addEventListener('pause', updateMiniPlayState);

  updateStats();
  setInterval(updateStats, 10000);
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

// ============================================================================
// Popup vidéos façon Reels — défilement vertical entre vidéos au lieu de
// fermer/rouvrir la popup à chaque fois.
// ============================================================================

let reelsMuted = false;                 // état du son, partagé entre les slides
const reelsMetaCache = {};              // cache des likes/commentaires par vidéo (évite de tout recharger au scroll)
let reelsObserver = null;

// Point d'entrée conservé pour compatibilité (grille vidéos, lien ?video=...) :
// ouvre désormais le défilement complet, positionné sur la vidéo demandée.
async function openVideoPlayerModal(url, title, videoId) {
    await openVideoReelsModal(videoId);
}

async function openVideoReelsModal(startVideoId) {
    const videos = (appState.videos || []).filter(v => v.is_published !== false && v.videoUrl);
    if (videos.length === 0) return;

    let modal = document.getElementById('vafm-tiktok-player-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vafm-tiktok-player-modal';
        document.body.appendChild(modal);
    }
    modal.className = 'vafm-tiktok-overlay';

    modal.innerHTML = `
        <div class="vafm-tiktok-wrapper" style="width: 100%; height: 100%; max-width: 100vw; max-height: 100vh; border-radius: 0;">
            <button class="vafm-tiktok-close-btn" id="close-tiktok-player">✕</button>
            <div class="vafm-share-toast" id="vafm-toast">Lien copié dans le presse-papier ! 🔗</div>
            <div class="vafm-reels-scroll no-smooth" id="vafm-reels-scroll">
                ${videos.map(v => buildReelsSlideHTML(v)).join('')}
            </div>
        </div>
    `;

    modal.classList.add('active'); // ← c'était la ligne manquante : sans elle, la popup reste invisible (opacity:0) même si la vidéo, elle, se met déjà à jouer.

    const scrollEl = document.getElementById('vafm-tiktok-player-modal').querySelector('#vafm-reels-scroll');
    const closeBtn = document.getElementById('close-tiktok-player');

    // Positionne le défilement sur la vidéo cliquée, sans animation parasite
    const startIndex = Math.max(0, videos.findIndex(v => String(v.id) === String(startVideoId)));
    const slides = scrollEl.querySelectorAll('.vafm-reels-slide');
    if (slides[startIndex]) {
        slides[startIndex].scrollIntoView({ block: 'start' });
    }
    requestAnimationFrame(() => scrollEl.classList.remove('no-smooth'));

    // Petite indication "défilez pour la suivante" à l'ouverture (seulement s'il y a plusieurs vidéos)
    if (videos.length > 1 && slides[startIndex]) {
        const hint = document.createElement('div');
        hint.className = 'vafm-reels-hint';
        hint.innerHTML = '↑ Défilez pour la vidéo suivante';
        slides[startIndex].appendChild(hint);
        setTimeout(() => hint.remove(), 3300);
    }

    setupReelsObserver(scrollEl, videos);
    wireReelsSlideActions(scrollEl, videos[startIndex]);
    activateReelsSlide(slides[startIndex], videos[startIndex]);

    closeBtn?.addEventListener('click', closeVideoReelsModal);
}

function buildReelsSlideHTML(video) {
    const safeTitle = String(video.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
        <div class="vafm-reels-slide" data-video-id="${video.id}">
            <video class="vafm-tiktok-video" data-src="${video.videoUrl}" loop playsinline muted style="object-fit: cover; width: 100%; height: 100%;"></video>
            <div class="vafm-tiktok-gradient-overlay"></div>
            <div class="vafm-tiktok-play-center"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>

            <div class="vafm-tiktok-info">
                <div class="vafm-tiktok-author"><span class="vafm-tiktok-badge">Reels VAFM</span></div>
                <div class="vafm-tiktok-caption-text">${safeTitle}</div>
            </div>

            <div class="vafm-tiktok-side-actions">
                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn vafm-reels-like-btn" title="J'aime">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </button>
                    <span class="vafm-tiktok-action-count vafm-reels-like-count">–</span>
                </div>
                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn" title="Commentaires">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                    <span class="vafm-tiktok-action-count vafm-reels-comments-count">–</span>
                </div>
                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn vafm-reels-share-btn" title="Partager">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                    </button>
                    <span class="vafm-tiktok-action-count">Partager</span>
                </div>
                <div class="vafm-tiktok-action-item">
                    <button class="vafm-tiktok-action-btn vafm-reels-mute-btn" title="Son"></button>
                </div>
            </div>
        </div>
    `;
}

// Détecte quelle slide est actuellement à l'écran (scroll-snap) et bascule
// la lecture dessus — c'est ce qui permet le défilement TikTok-like.
function setupReelsObserver(scrollEl, videos) {
    if (reelsObserver) reelsObserver.disconnect();

    reelsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const slide = entry.target;
            const videoId = slide.dataset.videoId;
            const video = videos.find(v => String(v.id) === String(videoId));

            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                activateReelsSlide(slide, video);
                wireReelsSlideActions(scrollEl, video);
            } else {
                const videoEl = slide.querySelector('video');
                if (videoEl) videoEl.pause();
            }
        });
    }, { root: scrollEl, threshold: [0.6] });

    scrollEl.querySelectorAll('.vafm-reels-slide').forEach(slide => reelsObserver.observe(slide));
}

// Charge (si besoin) et joue la vidéo d'une slide qui vient de devenir active.
function activateReelsSlide(slide, video) {
    if (!slide || !video) return;
    const videoEl = slide.querySelector('video');
    if (!videoEl) return;

    if (!videoEl.src) {
        videoEl.src = videoEl.dataset.src;
    }
    videoEl.muted = reelsMuted;
    videoEl.play().catch(() => {});

    updateOpenGraphTags(video.title, video.img || 'https://vafmlaradio.fr/LOGO-VAFM.png', buildVideoShareUrl(video));
    window.history.replaceState({}, '', `/?video=${buildVideoSlug(video)}`);

    loadReelsMeta(slide, video);
}

async function loadReelsMeta(slide, video) {
    const likeCountEl = slide.querySelector('.vafm-reels-like-count');
    const commentsCountEl = slide.querySelector('.vafm-reels-comments-count');
    const likeBtn = slide.querySelector('.vafm-reels-like-btn');

    if (reelsMetaCache[video.id]) {
        const cached = reelsMetaCache[video.id];
        if (likeCountEl) likeCountEl.textContent = cached.likeCount;
        if (commentsCountEl) commentsCountEl.textContent = cached.commentsCount;
        if (likeBtn) likeBtn.classList.toggle('liked', cached.isLiked);
        return;
    }

    try {
        const likesRes = await fetch(`${POCKETBASE_URL}/api/collections/video_likes/records?filter=(video='${video.id}')`);
        const likesData = likesRes.ok ? await likesRes.json() : { totalItems: 0, items: [] };
        const isLiked = Boolean(appState.currentUser && likesData.items?.some(l => l.user === appState.currentUser.id));

        const commentsRes = await fetch(`${POCKETBASE_URL}/api/collections/video_comments/records?filter=(video='${video.id}')`);
        const commentsData = commentsRes.ok ? await commentsRes.json() : { totalItems: 0 };

        reelsMetaCache[video.id] = {
            likeCount: likesData.totalItems || 0,
            commentsCount: commentsData.totalItems || 0,
            isLiked
        };

        if (likeCountEl) likeCountEl.textContent = reelsMetaCache[video.id].likeCount;
        if (commentsCountEl) commentsCountEl.textContent = reelsMetaCache[video.id].commentsCount;
        if (likeBtn) likeBtn.classList.toggle('liked', isLiked);
    } catch (err) {
        console.warn('Erreur chargement données vidéo :', err);
    }
}

function buildVideoSlug(video) {
    const cleanSlug = (video.title || 'video')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${video.id}-${cleanSlug}`;
}

function buildVideoShareUrl(video) {
    return `${window.location.origin}/?video=${buildVideoSlug(video)}`;
}

// Rebranche les boutons Partager / Son de la slide active (le bouton J'aime
// n'est pas encore raccordé à une action d'écriture — inchangé par rapport
// à avant, ce n'était déjà pas le cas).
function wireReelsSlideActions(scrollEl, video) {
    if (!video) return;
    const slide = scrollEl.querySelector(`.vafm-reels-slide[data-video-id="${video.id}"]`);
    if (!slide) return;

    const shareBtn = slide.querySelector('.vafm-reels-share-btn');
    const muteBtn = slide.querySelector('.vafm-reels-mute-btn');
    const videoEl = slide.querySelector('video');

    if (muteBtn) {
        muteBtn.innerHTML = reelsMuted
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

        muteBtn.onclick = () => {
            reelsMuted = !reelsMuted;
            if (videoEl) videoEl.muted = reelsMuted;
            wireReelsSlideActions(scrollEl, video);
        };
    }

    if (shareBtn) {
        shareBtn.onclick = async () => {
            const shareUrl = buildVideoShareUrl(video);
            if (navigator.share) {
                try {
                    await navigator.share({ title: video.title, text: `${video.title} – À regarder sur VAFM`, url: shareUrl });
                } catch (err) {}
            } else {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    const toast = document.getElementById('vafm-toast');
                    if (toast) {
                        toast.classList.add('show');
                        setTimeout(() => toast.classList.remove('show'), 2500);
                    }
                } catch (err) {
                    alert('Lien : ' + shareUrl);
                }
            }
        };
    }
}

function closeVideoReelsModal() {
    const modal = document.getElementById('vafm-tiktok-player-modal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.querySelectorAll('video').forEach(v => v.pause());
    if (reelsObserver) reelsObserver.disconnect();
    window.history.replaceState({}, '', window.location.pathname);
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

/* ==========================================================================
BARRE DE RECHERCHE GLOBALE
========================================================================== */
function openSearchBar() {
  const container = document.getElementById('search-bar-container');
  const triggerBtn = document.getElementById('search-trigger-btn');
  const mainNav = document.getElementById('main-nav-links');
  const newsNav = document.getElementById('news-nav-links');
  const searchInput = document.getElementById('global-search-input');

  if (container) container.classList.add('active');
  if (triggerBtn) triggerBtn.style.display = 'none';
  if (mainNav) mainNav.style.display = 'none';
  if (newsNav) newsNav.style.display = 'none';

  if (searchInput) {
    searchInput.focus();
  }
}

function closeSearchBar() {
  const container = document.getElementById('search-bar-container');
  const triggerBtn = document.getElementById('search-trigger-btn');
  const mainNav = document.getElementById('main-nav-links');
  const newsNav = document.getElementById('news-nav-links');
  const searchInput = document.getElementById('global-search-input');
  const dropdown = document.getElementById('search-results-dropdown');
  const newsPage = document.getElementById('news-page-spa');

  if (container) container.classList.remove('active');
  if (triggerBtn) triggerBtn.style.display = 'flex';

  // Réaffiche le bon menu selon qu'on est sur la page Actus ou sur l'accueil
  const onNewsPage = Boolean(newsPage && newsPage.classList.contains('active'));
  if (mainNav) mainNav.style.display = onNewsPage ? 'none' : 'flex';
  if (newsNav) newsNav.style.display = onNewsPage ? 'flex' : 'none';

  if (searchInput) searchInput.value = '';
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
  }
}

function handleGlobalSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const dropdown = document.getElementById('search-results-dropdown');
  if (!dropdown) return;

  if (query.length < 2) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    return;
  }

  const results = [];

  // Recherche dans les Actualités
  (appState.news || []).forEach(item => {
    if (item.title.toLowerCase().includes(query) || item.text.toLowerCase().includes(query)) {
      results.push({ type: 'Actualité', category: 'news', ...item });
    }
  });

  // Recherche dans les Émissions
  (appState.shows || []).forEach(item => {
    if (item.title.toLowerCase().includes(query) || item.text.toLowerCase().includes(query)) {
      results.push({ type: 'Émission', category: 'shows', ...item });
    }
  });

  // Recherche dans l'Équipe
  (appState.team || []).forEach(item => {
    if (item.title.toLowerCase().includes(query) || item.text.toLowerCase().includes(query)) {
      results.push({ type: 'Équipe', category: 'team', ...item });
    }
  });

  if (results.length === 0) {
    dropdown.innerHTML = `<div class="search-no-result">Aucun résultat pour "${query}"</div>`;
  } else {
    dropdown.innerHTML = results.slice(0, 6).map(res => `
      <div class="search-result-item" onclick="openArticleView('${res.category}', '${res.id}'); closeSearchBar();">
        <span class="search-result-type">${res.type}</span>
        <span class="search-result-title">${res.title}</span>
      </div>
    `).join('');
  }

  dropdown.style.display = 'block';
}

// Fermeture de la recherche au clic à l'extérieur
document.addEventListener('click', (e) => {
  const container = document.getElementById('search-bar-container');
  const triggerBtn = document.getElementById('search-trigger-btn');
  if (container && container.classList.contains('active')) {
    if (!container.contains(e.target) && !triggerBtn.contains(e.target)) {
      closeSearchBar();
    }
  }
});

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

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-dropdown-menu');
    const btn = document.getElementById('mobile-menu-btn');
    
    if (menu && btn) {
        menu.classList.toggle('active');
        btn.classList.toggle('open');
    }
}

// Configuration des gains et des probabilités
const WHEEL_REWARDS = [
  { label: "50 pts", points: 50, weight: 40, color: "#27272a" },
  { label: "100 pts", points: 100, weight: 30, color: "#E50914" },
  { label: "200 pts", points: 200, weight: 20, color: "#18181b" },
  { label: "500 pts", points: 500, weight: 9, color: "#E50914" },
  { label: "JACKPOT 1000", points: 1000, weight: 1, color: "#ffd700", textColor: "#000000" }
];

let wheelCurrentAngle = 0;
let isWheelSpinning = false;

function drawVafmWheel() {
  const canvas = document.getElementById('vafmWheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Ajustement Retina pour netteté sur écrans haute densité
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  if (canvas.width !== Math.floor(rect.width * dpr)) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);
  }
  
  const numPrizes = WHEEL_REWARDS.length;
  const sliceAngle = (2 * Math.PI) / numPrizes;
  const center = rect.width / 2;
  const radius = center - 5;

  ctx.clearRect(0, 0, rect.width, rect.height);

  WHEEL_REWARDS.forEach((prize, index) => {
    const startAngle = wheelCurrentAngle + index * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = prize.color;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.stroke();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle"; // Correction de l'alignement vertical
    ctx.fillStyle = prize.textColor || "#ffffff";
    ctx.font = "bold 14px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(prize.label, radius - 20, 0); // Ajusté à 0 sur l'axe Y
    ctx.restore();
  });
}

function getRandomReward() {
  const totalWeight = WHEEL_REWARDS.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < WHEEL_REWARDS.length; i++) {
    if (random < WHEEL_REWARDS[i].weight) {
      return { reward: WHEEL_REWARDS[i], index: i };
    }
    random -= WHEEL_REWARDS[i].weight;
  }
  return { reward: WHEEL_REWARDS[0], index: 0 };
}

function getPbAuth() {
  if (typeof pb !== 'undefined' && pb.authStore && pb.authStore.isValid) {
    return pb.authStore.record || pb.authStore.model; 
  }
  const storedAuth = localStorage.getItem('pocketbase_auth');
  if (storedAuth) {
    try {
      const parsed = JSON.parse(storedAuth);
      if (parsed && parsed.token && (parsed.record || parsed.model)) {
        return parsed.record || parsed.model;
      }
    } catch (e) {}
  }
  return null;
}

function updatePointsUI() {
  const user = getPbAuth();
  if (user) {
    const points = user.points || 0;
    const headerPoints = document.getElementById('headerUserPoints');
    if (headerPoints) headerPoints.textContent = points;
    const wheelPoints = document.getElementById('vafmUserPoints');
    if (wheelPoints) wheelPoints.textContent = points;
  }
}

async function spinWheel() {
  if (isWheelSpinning) return;

  const user = getPbAuth();
  if (!user) {
    alert("Connecte-toi pour lancer la roue !");
    return;
  }

  const lastSpin = user.last_spin ? new Date(user.last_spin) : null;
  const now = new Date();

  if (lastSpin && (now.getTime() - lastSpin.getTime()) < 24 * 60 * 60 * 1000) {
    const remainingMs = (24 * 60 * 60 * 1000) - (now.getTime() - lastSpin.getTime());
    const hoursLeft = Math.floor(remainingMs / (1000 * 60 * 60));
    const minsLeft = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    alert(`Tu as déjà lancé la roue aujourd'hui ! Reviens dans ${hoursLeft}h et ${minsLeft}min.`);
    return;
  }

  isWheelSpinning = true;
  const spinBtn = document.getElementById('spinWheelBtn');
  const resultDiv = document.getElementById('vafmWheelResult');
  
  if (spinBtn) spinBtn.disabled = true;
  if (resultDiv) resultDiv.style.display = 'none';

  const { reward, index: winningIndex } = getRandomReward();
  const numPrizes = WHEEL_REWARDS.length;
  const sliceAngle = (2 * Math.PI) / numPrizes;

  const fullRounds = 5;
  const sliceCenter = (winningIndex * sliceAngle) + (sliceAngle / 2);
  const targetBaseAngle = (1.5 * Math.PI) - sliceCenter;
  
  // Normalisation mathématique stricte pour JS
  const currentNormalized = ((wheelCurrentAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let distance = targetBaseAngle - currentNormalized;
  
  while (distance <= 0) {
    distance += 2 * Math.PI;
  }
  
  const totalRotation = distance + (fullRounds * 2 * Math.PI);
  const startAngle = wheelCurrentAngle;
  const duration = 4500;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);

    wheelCurrentAngle = startAngle + (totalRotation * easeOut);
    drawVafmWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      finalizeSpin(reward, spinBtn, resultDiv, user.id);
    }
  }

  requestAnimationFrame(animate);
}

// ============================================================================
// Fonction partagée pour sauvegarder des champs sur l'utilisateur connecté
// (points, last_spin, last_time_bonus_*...) — évite de dupliquer la logique
// fetch + synchronisation localStorage/appState à chaque nouvelle récompense.
// ============================================================================
async function updateUserPocketBase(userId, fields) {
  const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${userId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(true),
    body: JSON.stringify(fields)
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.message || `Erreur HTTP ${res.status}`);
  }

  const updatedUser = await res.json();

  const storedAuth = localStorage.getItem('pocketbase_auth');
  if (storedAuth) {
    try {
      const parsed = JSON.parse(storedAuth);
      parsed.record = updatedUser;
      localStorage.setItem('pocketbase_auth', JSON.stringify(parsed));
    } catch (e) {}
  }
  if (typeof appState !== 'undefined') {
    appState.currentUser = updatedUser;
  }

  updatePointsUI();
  return updatedUser;
}

async function finalizeSpin(reward, spinBtn, resultDiv, userId) {
  const now = new Date();
  const isoNow = now.toISOString();

  // Ce site n'utilise pas le SDK PocketBase (pas de "pb" global chargé nulle
  // part — vérifiable : aucun <script src="pocketbase.umd.js">, aucun
  // "new PocketBase(...)" dans tout le site). "pb" n'existe donc jamais, et
  // la condition `typeof pb !== 'undefined'` était systématiquement fausse :
  // la sauvegarde ne s'exécutait JAMAIS, silencieusement (pas d'erreur, pas
  // de message). Résultat : les points ne s'enregistraient jamais, ET
  // last_spin non plus — donc la limite "une fois par jour" ne pouvait
  // jamais se déclencher, puisqu'elle dépend justement de last_spin.
  // On utilise ici fetch() + getAuthHeaders(), exactement comme partout
  // ailleurs sur ce site.
  const user = getPbAuth();
  const currentPoints = (user && user.points) || 0;
  const newPoints = currentPoints + reward.points;

  try {
    await updateUserPocketBase(userId, { points: newPoints, last_spin: isoNow });

    if (resultDiv) {
      resultDiv.textContent = `Bravo ! Tu as gagné : ${reward.label} !`;
      resultDiv.className = 'vafm-wheel-result win';
      resultDiv.style.display = 'block';
    }
  } catch (err) {
    console.error("Erreur sauvegarde roue :", err);
    const serverMsg = err.message;
    alert(`La base de données a bloqué la sauvegarde.\nErreur : ${serverMsg}\nVérifie tes API Rules PocketBase (la collection "users" doit autoriser la modification de "points" et "last_spin" par l'utilisateur connecté lui-même).`);
  } finally {
    isWheelSpinning = false;
    if (spinBtn) spinBtn.disabled = false;
  }
}

// ============================================================================
// RÉCOMPENSES "TEMPS PASSÉ SUR LE SITE"
// ============================================================================
const VAFM_TIME_REWARDS = [
  { seconds: 90, points: 100, field: 'last_time_bonus_90', claiming: false, claimedInSession: false },
  { seconds: 180, points: 200, field: 'last_time_bonus_180', claiming: false, claimedInSession: false }
];

let vafmActiveSeconds = 0;
let vafmTimeRewardTimer = null;

function initTimeOnSiteRewards() {
  if (!getPbAuth()) return; // réservé aux membres connectés

  if (vafmTimeRewardTimer) clearInterval(vafmTimeRewardTimer);
  vafmActiveSeconds = 0;

  VAFM_TIME_REWARDS.forEach(r => {
    r.claiming = false;
    r.claimedInSession = false;
  });

  vafmTimeRewardTimer = setInterval(() => {
    // Premier plan uniquement
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    vafmActiveSeconds += 1;
    checkTimeOnSiteRewards();
  }, 1000);
}

async function checkTimeOnSiteRewards() {
  const user = getPbAuth();
  if (!user) return;

  for (const reward of VAFM_TIME_REWARDS) {
    // Si pas encore atteint le temps, ou déjà en train de claim, ou déjà claim cette session -> on passe
    if (vafmActiveSeconds < reward.seconds || reward.claiming || reward.claimedInSession) continue;

    // Vérification de la date enregistrée en BDD
    const lastAward = user[reward.field] ? new Date(user[reward.field]) : null;
    const now = new Date();

    if (lastAward && (now.getTime() - lastAward.getTime()) < 24 * 60 * 60 * 1000) {
      // Déjà obtenu sur les dernières 24h -> on verrouille pour cette session
      reward.claimedInSession = true;
      continue;
    }

    // Verrouillage immédiat pour éviter les exécutions parallèles aux secondes suivantes
    reward.claiming = true;
    
    try {
      const currentPoints = user.points || 0;
      const isoNow = now.toISOString();

      const updatedUser = await updateUserPocketBase(user.id, {
        points: currentPoints + reward.points,
        [reward.field]: isoNow
      });

      // Verrouillage de la session
      reward.claimedInSession = true;

      // Mise à jour explicite du store local PocketBase
      if (typeof pb !== 'undefined' && pb.authStore && pb.authStore.model) {
        pb.authStore.model[reward.field] = isoNow;
        pb.authStore.model.points = currentPoints + reward.points;
      } else {
        user[reward.field] = isoNow;
        user.points = currentPoints + reward.points;
      }

      showPointsToast(`+${reward.points} points pour ${formatDurationFr(reward.seconds)} passées sur VAFM ! 🎉`);
      
      if (typeof updatePointsUI === 'function') {
        updatePointsUI();
      }
    } catch (err) {
      console.error('Erreur lors de l’attribution de la récompense :', err);
    } finally {
      reward.claiming = false;
    }
  }
}

function formatDurationFr(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m} min ${s}s`;
}

function showPointsToast(message) {
  let toast = document.getElementById('vafm-points-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'vafm-points-toast';
    toast.className = 'vafm-points-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4500);
}

function initVafmWheel() {
  drawVafmWheel();
  updatePointsUI();

  const spinBtn = document.getElementById('spinWheelBtn');
  if (spinBtn) {
    spinBtn.removeEventListener('click', spinWheel);
    spinBtn.addEventListener('click', spinWheel);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVafmWheel);
  document.addEventListener('DOMContentLoaded', initTimeOnSiteRewards);
} else {
  initVafmWheel();
  initTimeOnSiteRewards();
}