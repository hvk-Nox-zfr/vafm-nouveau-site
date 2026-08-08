/* ==========================================================================
1. CONFIGURATION POCKETBASE & POCKETBASE URL
========================================================================== */
const POCKETBASE_URL = 'https://api.vafmlaradio.fr';

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

/* ==========================================================================
3. UTILITIES & DROITS (TOKEN & ROLES)
========================================================================== */
function stripHTML(html) {
  let tmp = document.createElement("DIV");
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || "";
}

function getPocketBaseImageUrl(collectionName, recordId, fileName) {
  if (!fileName) return null;
  if (fileName.startsWith('http://') || fileName.startsWith('https://') || fileName.startsWith('data:')) return fileName;
  return `${POCKETBASE_URL}/api/files/${collectionName}/${recordId}/${fileName}`;
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
    return (category === 'hero' || category === 'news' || category === 'actus' || category === 'videos');
  }
  return false;
}

function canCreateInCategory(category) {
  if (!appState.currentUser) return false;
  if (appState.userRole === 'admin') return true;
  if (appState.userRole === 'journaliste' || appState.userRole === 'journalist') {
    return (category === 'news' || category === 'actus' || category === 'videos');
  }
  return false;
}

/* ==========================================================================
4. INITIALISATION & PARSING URL DYNAMIQUE
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

  // 1. Charger d'abord toutes les données depuis PocketBase
  await fetchAllFromPocketBase();
  updateAuthUI();
  initFileUploadDragAndDrop();
  initRadioPlayer();

  // 2. Vérifier l'URL et charger l'article si présent
  await checkUrlForArticle();
});

async function checkUrlForArticle() {
  const path = window.location.pathname;
  let articleId = null;

  // Format URL SEO : /article/news/ID-SLUG
  if (path.startsWith('/article/news/')) {
    const slugWithId = path.replace('/article/news/', '');
    articleId = slugWithId.substring(0, 15);
  } else {
    // Format de secours : ?article=news&id=ID
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('id')) {
      articleId = urlParams.get('id');
    }
  }

  if (articleId && articleId.length === 15) {
    // Attend jusqu'à 2 secondes que article.js soit chargé si nécessaire
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
async function fetchAllFromPocketBase() {
  try {
    const getCollectionData = async (collection) => {
      const url = `${POCKETBASE_URL}/api/collections/${collection}/records`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Erreur ${res.status} sur la collection : ${collection}`);
          return [];
        }
        const data = await res.json();
        return data.items || [];
      } catch (e) {
        return [];
      }
    };

    const [heroItems, actusItems, emissionsItems, animateursItems, videosItems] = await Promise.all([
      getCollectionData('hero'),
      getCollectionData('actus'),
      getCollectionData('emissions'),
      getCollectionData('animateurs'),
      getCollectionData('videos')
    ]);

    const canSeeDrafts = Boolean(appState.editMode && appState.currentUser);
    const filterPublished = (items) => {
      if (canSeeDrafts) return items;
      return items.filter(item => item.is_published === undefined || item.is_published === true || item.is_published === 1);
    };

    appState.hero = filterPublished(heroItems).map(h => ({
      id: h.id,
      title: h.titre || h.title || '',
      text: h.description || h.texte || '',
      img: getPocketBaseImageUrl('hero', h.id, h.image) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200',
      is_published: h.is_published !== undefined ? Boolean(h.is_published) : true,
      position: h.position || 0
    }));

    appState.news = filterPublished(actusItems).map(a => ({
      id: a.id,
      title: a.titre || a.title || '',
      text: a.texte || a.description || '',
      img: getPocketBaseImageUrl('actus', a.id, a.image) || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=600',
      is_published: a.is_published !== undefined ? Boolean(a.is_published) : true,
      position: a.position || 0
    }));

    appState.shows = filterPublished(emissionsItems).map(e => ({
      id: e.id,
      title: e.titre || e.title || '',
      text: e.description || e.texte || '',
      img: getPocketBaseImageUrl('emissions', e.id, e.image) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
      is_published: e.is_published !== undefined ? Boolean(e.is_published) : true,
      position: e.position || 0
    }));

    appState.team = filterPublished(animateursItems).map(anim => ({
      id: anim.id,
      title: anim.nom || anim.name || anim.titre || anim.title || '',
      text: anim.description || anim.role || anim.texte || '',
      img: getPocketBaseImageUrl('animateurs', anim.id, anim.image) || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400',
      is_published: anim.is_published !== undefined ? Boolean(anim.is_published) : true,
      position: anim.position || 0
    }));

    appState.videos = filterPublished(videosItems).map(v => ({
      id: v.id,
      title: v.titre || v.title || '',
      text: v.description || v.texte || '',
      img: getPocketBaseImageUrl('videos', v.id, v.poster || v.image) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=600',
      videoUrl: getPocketBaseImageUrl('videos', v.id, v.video_file || v.file) || '',
      is_published: v.is_published !== undefined ? Boolean(v.is_published) : true,
      position: v.position || 0
    }));

    renderAll();
  } catch (err) {
    console.error("Erreur générale :", err);
    renderAll();
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
          <h2>Bienvenue sur VAFM</h2>
          <p>${canEditHero ? 'Ajoutez un élément au carrousel depuis le panneau d\'admin.' : 'Le meilleur du son en direct !'}</p>
        </div>
      </div>`;
    } else {
      heroWrapper.innerHTML = appState.hero.map((slide) => {
        const cleanText = stripHTML(slide.text);
        const truncatedText = cleanText.length > 70 ? cleanText.substring(0, 70) + '...' : cleanText;

        return `
      <div class="swiper-slide hero-slide ${!slide.is_published ? 'draft-card' : ''}">
        <img src="${slide.img}" class="slide-bg" alt="${slide.title}">
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

  // 2. RENDU DES GRILLES CLASSIQUES
  const renderGrid = (gridElement, dataArray, category, collectionName) => {
    if (!gridElement) return;

    if (dataArray.length === 0) {
      gridElement.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun contenu disponible pour le moment.</p>`;
      return;
    }

    const canEditThisCategory = canEditCategory(category);

    gridElement.innerHTML = dataArray.map((item) => {
      const cleanText = stripHTML(item.text);
      const truncatedText = cleanText.length > 40 ? cleanText.substring(0, 40) + '...' : cleanText;

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

  // 3. RENDU DES VIDÉOS DYNAMIQUES
  renderVideosContainer();

  if (isEdit) {
    initGridsDragAndDrop();
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

  container.innerHTML = appState.videos.map(video => {
    const safeTitle = (video.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    let formattedDate = "";
    if (video.created) {
      const d = new Date(video.created);
      formattedDate = `Publié le ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    }

    return `
      <div class="vafm-video-card ${!video.is_published ? 'draft-card' : ''}" data-id="${video.id}">
        <img src="${video.img}" alt="${video.title}">
        <div class="vafm-video-click-zone" onclick="if('${video.videoUrl}') openVideoPlayerModal('${video.videoUrl}', '${safeTitle}', '${video.id}')"></div>
        <div class="vafm-video-overlay">
            <div class="vafm-video-header-info">
                <span class="card-status-tag ${video.is_published ? 'tag-published' : 'tag-draft'}">
                    ${video.is_published ? 'Publié' : 'Brouillon'}
                </span>
                
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
  setupSortable('team-grid', 'animateurs', 'team');
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
    
    await fetchAllFromPocketBase();
  } catch (error) {
    console.error("Erreur critique togglePublish :", error);
    alert("Erreur PocketBase : " + error.message);
  }
}

function openEditorModal(category, id = null) {
  if (category === 'videos') {
    let modal = document.getElementById('vafm-upload-modal');
    if (!modal) {
      createUploadModal();
      modal = document.getElementById('vafm-upload-modal');
    }
    if (modal) modal.classList.add('active');
    return;
  }

  if (id && !canEditCategory(category)) {
    alert("Vous n'avez pas la permission d'éditer cette section.");
    return;
  }
  if (!id && !canCreateInCategory(category)) {
    alert("Création non autorisée dans cette section.");
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
    btnSave.innerText = "Sauvegarde en cours...";
    btnSave.disabled = true;
  }

  const title = document.getElementById('editor-title')?.value || '';
  const text = document.getElementById('editor-text')?.value || '';

  const collectionMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs', videos: 'videos' };
  const collectionName = collectionMap[category] || 'actus';

  const formData = new FormData();

  let authorDisplayName = "Équipe VAFM";
  if (appState && appState.currentUser) {
    authorDisplayName = appState.currentUser.name || appState.currentUser.username || "Équipe VAFM";
    formData.append('author', appState.currentUser.id);
    formData.append('user', appState.currentUser.id);
    formData.append('user_id', appState.currentUser.id);
  }

  if (category === 'team') {
    formData.append('nom', title);
    formData.append('name', title);
    formData.append('titre', title);
    formData.append('role', text);
    formData.append('description', text);
  } else {
    formData.append('titre', title);
    formData.append('title', title);
    if (category === 'hero') {
      formData.append('texte', text);
      formData.append('description', text);
    } else {
      formData.append('description', text);
      formData.append('texte', text);
    }
    formData.append('name', authorDisplayName);
    formData.append('author_name', authorDisplayName);
  }

  formData.append('is_published', 'true');

  const fileInput = document.getElementById('file-input');
  if (selectedFile) {
    formData.append('image', selectedFile);
  } else if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  try {
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
      const errData = await res.json();
      throw new Error(errData.message || "Erreur de sauvegarde");
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

  if (currentAuthMode === "signup") {
    if (authTitle) authTitle.innerText = "Rejoindre le Club VAFM";
    if (authSubtitle) authSubtitle.innerText = "Créez votre compte en quelques secondes";
    if (authSwitchLink) authSwitchLink.innerText = "Déjà membre ? Se connecter";
    if (btnSubmit) btnSubmit.innerText = "S'inscrire";
  } else {
    if (authTitle) authTitle.innerText = "Connexion VAFM";
    if (authSubtitle) authSubtitle.innerText = "Accédez à votre espace ou gérez la station";
    if (authSwitchLink) authSwitchLink.innerText = "Pas encore membre ? S'inscrire";
    if (btnSubmit) btnSubmit.innerText = "Se connecter";
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

  const identity = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";

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
          name: cleanUsername
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

function updateAuthUI() {
  const profileZone = document.getElementById('user-profile-zone');
  if (!profileZone) return;

  if (appState && appState.currentUser) {
    const initial = (appState.currentUser.email || "U")[0].toUpperCase();
    let roleLabel = 'Membre';
    if (appState.userRole === 'admin') roleLabel = 'Admin';
    if (appState.userRole === 'journaliste' || appState.userRole === 'journalist') roleLabel = 'Journaliste';

    profileZone.innerHTML = `
      <div class="user-badge-container" onclick="toggleAuthModal()" style="cursor:pointer; display:flex; align-items:center; gap:8px;" title="Cliquez pour vous déconnecter">
        <div class="user-avatar" style="background-color: #E50914; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${initial}</div>
        <span class="user-name-label" style="font-weight: 600; color: #111827;">${roleLabel}</span>
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
12. LECTEUR AUDIO & MÉTADONNÉES
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

  // Utilisation d'un chemin d'accès absolu
  async function fetchTrackCover(title) {
      if (isVafmIdent(title)) {
          return '/LOGO - VAFM.png';
      }

      try {
          const query = title.split(' – ')[0] || title;
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
          if (!res.ok) return '/LOGO - VAFM.png';
          const data = await res.json();
          if (data.results && data.results.length > 0) {
              return data.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
          }
      } catch (e) {
          console.warn("Erreur recherche pochette:", e);
      }
      return '/LOGO - VAFM.png';
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
          const res = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=10`);
          if (res.ok) {
              const data = await res.json();
              if (data.items && data.items.length > 0) {
                  lastTitleSeen = data.items[0].title;

                  songHistory = data.items.slice(0, 10).map(item => ({
                      title: item.title,
                      time: item.time,
                      cover: item.cover || '/LOGO - VAFM.png'
                  }));

                  renderHistoryList();
              }
          }
      } catch (e) {
          console.warn("Erreur chargement PocketBase:", e);
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
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#E50914" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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

  function updateMiniPlayState() {
      if (miniPlayBtn) {
          miniPlayBtn.textContent = audio.paused ? "▶" : "⏸";
      }
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
13. MODALES ET GESTION DES VIDÉOS DÉDIÉES
========================================================================== */
function createUploadModal() {
    if (document.getElementById('vafm-upload-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'vafm-upload-modal';
    modal.className = 'vafm-modal-overlay';
    modal.innerHTML = `
        <div class="vafm-modal-box">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; font-size: 1.2rem;">Publier une vidéo</h3>
                <button id="close-video-modal" style="background:none; border:none; color:#fff; font-size:1.2rem; cursor:pointer;">✕</button>
            </div>
            <form id="vafm-video-form">
                <label style="font-size: 0.85rem; color: #aaa; display: block; margin-bottom: 6px;">Titre / Légende</label>
                <input type="text" id="vafm-vid-title" placeholder="Ex: Point info, best-of..." required>

                <label style="font-size: 0.85rem; color: #aaa; display: block; margin-bottom: 6px;">Fichier Vidéo (MP4, WebM)</label>
                <div class="vafm-dropzone" id="video-dropzone" onclick="document.getElementById('vafm-vid-file').click()">
                    <span id="video-file-name">🎬 Choisir le fichier vidéo</span>
                    <input type="file" id="vafm-vid-file" accept="video/*" style="display: none;" required>
                </div>

                <label style="font-size: 0.85rem; color: #aaa; display: block; margin-bottom: 6px;">Miniature / Poster (Image)</label>
                <div class="vafm-dropzone" id="poster-dropzone" onclick="document.getElementById('vafm-vid-poster').click()">
                    <span id="poster-file-name">🖼️ Choisir l'image miniature</span>
                    <input type="file" id="vafm-vid-poster" accept="image/*" style="display: none;" required>
                </div>

                <button type="submit" class="vafm-modal-submit" id="submit-vid-btn">Mettre en ligne</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-video-modal').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    document.getElementById('vafm-vid-file').addEventListener('change', (e) => {
        if (e.target.files[0]) document.getElementById('video-file-name').textContent = "📁 " + e.target.files[0].name;
    });
    document.getElementById('vafm-vid-poster').addEventListener('change', (e) => {
        if (e.target.files[0]) document.getElementById('poster-file-name').textContent = "🖼️ " + e.target.files[0].name;
    });

    document.getElementById('vafm-video-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-vid-btn');
        submitBtn.textContent = "Upload en cours...";
        submitBtn.disabled = true;

        const title = document.getElementById('vafm-vid-title').value;
        const videoFile = document.getElementById('vafm-vid-file').files[0];
        const posterFile = document.getElementById('vafm-vid-poster').files[0];

        const formData = new FormData();
        formData.append('title', title);
        formData.append('is_published', 'true');
        if (videoFile) formData.append('video_file', videoFile);
        if (posterFile) formData.append('poster', posterFile);

        try {
            const res = await fetch(`${POCKETBASE_URL}/api/collections/videos/records`, {
                method: 'POST',
                headers: getAuthHeaders(false),
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json();
                let messageDetails = "";
                if (errData.data) {
                    messageDetails = Object.entries(errData.data)
                        .map(([k, v]) => `${k}: ${v.message}`)
                        .join(' | ');
                }
                throw new Error(messageDetails || errData.message || "Erreur lors de la création");
            }

            alert("Vidéo publiée avec succès !");
            modal.classList.remove('active');
            e.target.reset();
            document.getElementById('video-file-name').textContent = "🎬 Choisir le fichier vidéo";
            document.getElementById('poster-file-name').textContent = "🖼️ Choisir l'image miniature";
            await fetchAllFromPocketBase();
        } catch (err) {
            alert("Erreur lors de l'upload : " + err.message);
        } finally {
            submitBtn.textContent = "Mettre en ligne";
            submitBtn.disabled = false;
        }
    });
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

    if (videoId) {
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
        <div class="vafm-tiktok-wrapper">
            <button class="vafm-tiktok-close-btn" id="close-tiktok-player">✕</button>
            
            <video class="vafm-tiktok-video" id="vafm-reel-video" src="${url}" loop playsinline autoplay></video>
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
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                    </button>
                </div>
            </div>

            <div class="vafm-comments-drawer" id="vafm-comments-drawer">
                <div class="vafm-comments-header">
                    <span id="vafm-drawer-title">Commentaires (${commentsList.length})</span>
                    <button id="close-comments-drawer" style="background:none; border:none; color:#fff; font-size:1.2rem; cursor:pointer;">✕</button>
                </div>
                <div class="vafm-comments-list" id="vafm-comments-list"></div>
                <div class="vafm-comments-input-zone">
                    <input type="text" id="vafm-comment-input" placeholder="Ajouter un commentaire...">
                    <button class="vafm-comments-send-btn" id="vafm-send-comment">Envoyer</button>
                </div>
            </div>

            <div class="vafm-tiktok-progress-bar">
                <div class="vafm-tiktok-progress-fill" id="vafm-reel-progress"></div>
            </div>
        </div>
    `;

    modal.classList.add('active');

    const video = document.getElementById('vafm-reel-video');
    const playCenter = document.getElementById('vafm-play-center-icon');
    const progressBar = document.getElementById('vafm-reel-progress');
    const likeBtn = document.getElementById('vafm-like-btn');
    const likeCountEl = document.getElementById('vafm-like-count');
    const commentsBtn = document.getElementById('vafm-comments-btn');
    const commentsCountEl = document.getElementById('vafm-comments-count');
    const commentsDrawer = document.getElementById('vafm-comments-drawer');
    const closeComments = document.getElementById('close-comments-drawer');
    const sendCommentBtn = document.getElementById('vafm-send-comment');
    const commentInput = document.getElementById('vafm-comment-input');
    const listEl = document.getElementById('vafm-comments-list');
    const drawerTitle = document.getElementById('vafm-drawer-title');
    const shareBtn = document.getElementById('vafm-share-btn');
    const muteBtn = document.getElementById('vafm-toggle-mute');

    function renderComments() {
        if (!commentsList || commentsList.length === 0) {
            listEl.innerHTML = `<p style="color: #8e8e93; font-size: 0.85rem; text-align: center; margin-top: 20px;">Aucun commentaire pour le moment. Soyez le premier !</p>`;
            return;
        }

        listEl.innerHTML = commentsList.map(c => {
            const name = c.author_name || "Membre VAFM";
            const initial = name[0].toUpperCase();
            return `
                <div class="vafm-comment-item">
                    <div class="vafm-comment-avatar">${initial}</div>
                    <div class="vafm-comment-body">
                        <span class="vafm-comment-user">${name}</span>
                        <span class="vafm-comment-text">${c.content}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderComments();

    video.addEventListener('timeupdate', () => {
        if (video.duration) {
            const pct = (video.currentTime / video.duration) * 100;
            progressBar.style.width = pct + '%';
        }
    });

    video.addEventListener('click', () => {
        if (commentsDrawer.classList.contains('open')) {
            commentsDrawer.classList.remove('open');
            return;
        }
        if (video.paused) {
            video.play();
            playCenter.classList.remove('visible');
        } else {
            video.pause();
            playCenter.classList.add('visible');
        }
    });

    likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!appState || !appState.currentUser) {
            closePlayer();
            openAuthModal();
            return;
        }

        likeBtn.disabled = true;

        try {
            if (!isLiked) {
                const res = await fetch(`${POCKETBASE_URL}/api/collections/video_likes/records`, {
                    method: 'POST',
                    headers: getAuthHeaders(true),
                    body: JSON.stringify({
                        video: videoId,
                        user: appState.currentUser.id
                    })
                });

                if (res.ok) {
                    const createdRecord = await res.json();
                    isLiked = true;
                    likeRecordId = createdRecord.id;
                    likeCount++;
                    likeBtn.classList.add('liked');
                }
            } else {
                if (likeRecordId) {
                    const res = await fetch(`${POCKETBASE_URL}/api/collections/video_likes/records/${likeRecordId}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders(true)
                    });

                    if (res.ok) {
                        isLiked = false;
                        likeRecordId = null;
                        likeCount = Math.max(0, likeCount - 1);
                        likeBtn.classList.remove('liked');
                    }
                }
            }
            likeCountEl.textContent = likeCount;
        } catch (err) {
            console.error("Erreur like :", err);
        } finally {
            likeBtn.disabled = false;
        }
    });

    commentsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        commentsDrawer.classList.add('open');
    });

    closeComments.addEventListener('click', () => {
        commentsDrawer.classList.remove('open');
    });

    commentInput.addEventListener('click', (e) => {
        if (!appState || !appState.currentUser) {
            e.preventDefault();
            closePlayer();
            openAuthModal();
        }
    });

    sendCommentBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!appState || !appState.currentUser) {
            closePlayer();
            openAuthModal();
            return;
        }
        
        const content = commentInput.value.trim();
        if (!content || !videoId) return;

        sendCommentBtn.disabled = true;
        const authorName = appState.currentUser.name || appState.currentUser.username || "Membre VAFM";

        try {
            const res = await fetch(`${POCKETBASE_URL}/api/collections/video_comments/records`, {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({
                    video: videoId,
                    user: appState.currentUser.id,
                    content: content,
                    author_name: authorName
                })
            });

            if (res.ok) {
                const newComment = await res.json();
                commentsList.unshift(newComment);
                renderComments();
                
                commentInput.value = "";
                commentsCountEl.textContent = commentsList.length;
                drawerTitle.textContent = `Commentaires (${commentsList.length})`;
            } else {
                alert("Erreur lors de l'envoi du commentaire.");
            }
        } catch (err) {
            console.error("Erreur envoi commentaire :", err);
        } finally {
            sendCommentBtn.disabled = false;
        }
    });

    shareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const shareData = {
            title: title || 'Vidéo VAFM',
            text: `Regarde cette vidéo sur VAFM : ${title}`,
            url: window.location.href,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log("Partage annulé :", err);
            }
        } else {
            navigator.clipboard.writeText(window.location.href);
            const toast = document.getElementById('vafm-toast');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2500);
        }
    });

    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.style.opacity = video.muted ? '0.5' : '1';
    });

    const closePlayer = () => {
        if (video) video.pause();
        modal.classList.remove('active');
    };

    document.getElementById('close-tiktok-player').addEventListener('click', closePlayer);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePlayer();
    });
}

/* ==========================================================================
14. GESTION DU ROUTAGE (ÉCOUTE DES BOUTONS DE NAVIGATION DU NAVIGATEUR)
========================================================================== */
window.addEventListener('popstate', checkUrlForArticle);