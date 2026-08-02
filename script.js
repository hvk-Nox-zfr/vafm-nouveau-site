/* ==========================================================================
1. CONFIGURATION POCKETBASE & POCKETBASE URL
========================================================================== */
const POCKETBASE_URL = 'https://api.vafmlaradio.fr';

/* ==========================================================================
2. ÉTAT DE L'APPLICATION
========================================================================== */
let appState = {
  currentUser: null,
  userRole: 'member', // 'admin', 'journaliste', 'member'
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

// Fonction utilitaire pour récupérer proprement le Token PocketBase
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

// Générateur de Headers pour les requêtes PocketBase nécessitant une authentification
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
document.addEventListener("DOMContentLoaded", async () => {
  // Animation Loader (GSAP)
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

  // Vérifier la session PocketBase sauvegardée dans localStorage
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

  await fetchAllFromPocketBase();
  updateAuthUI();
  initFileUploadDragAndDrop();
  initRadioPlayer();
  checkUrlForArticle(); // Vérifie s'il y a un article demandé dans l'URL
});

/* Vérifie si l'URL contient un article à ouvrir directement */
function checkUrlForArticle() {
  const urlParams = new URLSearchParams(window.location.search);
  const articleCategory = urlParams.get('article');
  const articleId = urlParams.get('id');

  if (articleCategory && articleId) {
    setTimeout(() => {
      if (typeof openArticleView === 'function') {
        openArticleView(articleCategory, articleId);
      }
    }, 300);
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

    const [heroItems, actusItems, emissionsItems, animateursItems] = await Promise.all([
      getCollectionData('hero'),
      getCollectionData('actus'),
      getCollectionData('emissions'),
      getCollectionData('animateurs')
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

    renderAll();
  } catch (err) {
    console.error("Erreur générale :", err);
    renderAll();
  }
}

/* ==========================================================================
6. RENDU DU CARROUSEL & DES GRILLES (SPA - Lecteur Continu)
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
          <h2>Bienvenue sur VAFM</h2>
          <p>${canEditHero ? 'Ajoutez un élément au carrousel depuis le panneau d\'admin.' : 'Le meilleur du son en direct !'}</p>
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
            <!-- Ouverture dynamique en SPA -->
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

  // Swiper Init
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
  const renderGrid = (gridElement, dataArray, category, collectionName) => {
    if (!gridElement) return;

    if (dataArray.length === 0) {
      gridElement.innerHTML = `<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun contenu disponible pour le moment.</p>`;
      return;
    }

    const canEditThisCategory = canEditCategory(category);

    gridElement.innerHTML = dataArray.map((item) => {
      const cleanText = stripHTML(item.text);
      const truncatedText = cleanText.length > 50 ? cleanText.substring(0, 50) + '...' : cleanText;

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
function togglePublishMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('publishMenu');
    if (menu) {
        menu.classList.toggle('active');
    } else {
        console.warn("Le menu déroulant de publication (#publishMenu) n'a pas été trouvé dans le DOM.");
    }
}

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
  const categoryMap = { 'hero': 'hero', 'actus': 'news', 'emissions': 'shows', 'animateurs': 'team' };
  if (!canEditCategory(categoryMap[collectionName] || collectionName)) {
    alert("Vous n'avez pas la permission de modifier cet élément.");
    return;
  }

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ is_published: !currentStatus })
    });

    if (!res.ok) throw new Error("Erreur de mise à jour");
    await fetchAllFromPocketBase();
  } catch (error) {
    alert("Erreur lors du changement d'état : " + error.message);
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

/* ==========================================================================
GESTION DE LA SÉLECTION DE FICHIER (HTML ONCHANGE)
========================================================================== */
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
9. ENREGISTREMENT & SUPPRESSION (POCKETBASE SÉCURISÉ)
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

  const collectionMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
  const collectionName = collectionMap[category] || 'actus';

  const formData = new FormData();

  // Permet de s'assurer que PocketBase enregistre la valeur peu importe le nom de colonne de la collection
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
      console.error("Détail du refus PocketBase :", errData);
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
  const categoryMap = { 'hero': 'hero', 'actus': 'news', 'emissions': 'shows', 'animateurs': 'team' };
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
        'animateurs': 'animateurs'
    };

    const collectionName = collectionMap[section] || section;

    try {
        const btn = event?.currentTarget;
        if (btn) btn.innerText = "...";

        const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records?filter=(is_published=false)`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

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

    const collections = ['hero', 'actus', 'emissions', 'animateurs'];
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