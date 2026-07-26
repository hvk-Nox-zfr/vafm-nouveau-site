/* ==========================================================================
   NOTE : appState / saveState viennent de state.js
          currentAuthMode, runLoader, initAudioControls, changeStyle,
          openModal/closeModal, l'authentification, le mode admin et
          l'éditeur de page viennent de common.js
   Les deux fichiers doivent être chargés AVANT celui-ci.
   ========================================================================== */

let currentCategory = null;
let currentId = null;

document.addEventListener("DOMContentLoaded", () => {
    runLoader();

    const params = new URLSearchParams(window.location.search);
    currentCategory = params.get('type');
    currentId = Number(params.get('id'));

    renderAll();
    updateAuthUI();
    initAudioControls();
});

/* ==========================================================================
   RENDU DE LA PAGE ARTICLE
   ========================================================================== */
function findCurrentArticle() {
    if (!currentCategory || !appState[currentCategory]) return null;
    return appState[currentCategory].find(x => x.id === currentId) || null;
}

function renderAll() {
    const wrap = document.getElementById('article-page-wrap');
    if (!wrap) return;

    const item = findCurrentArticle();
    const isEdit = appState.editMode && appState.currentUser && appState.currentUser.role === 'admin';

    if (!item) {
        wrap.innerHTML = `
            <div class="article-not-found">
                <h2>Article introuvable</h2>
                <p>Cette page n'existe plus ou a été déplacée.</p>
                <a href="index.html" class="article-back-link">← Retour à l'accueil</a>
            </div>
        `;
        return;
    }

    const bodyText = item.body && item.body.trim() ? item.body : item.text;

    wrap.innerHTML = `
        <a href="index.html" class="article-back-link">← Retour à l'accueil</a>
        <img src="${item.img}" class="article-page-hero" alt="${item.title}"
            ${isEdit ? `onclick="triggerImageChange('${currentCategory}', ${item.id})"` : ''}>
        <h1 class="article-page-title" contenteditable="${isEdit}"
            onblur="updateTextContent('${currentCategory}', ${item.id}, 'title', this.innerText)">${item.title}</h1>
        <p class="article-page-body" contenteditable="${isEdit}"
            onblur="updateTextContent('${currentCategory}', ${item.id}, 'body', this.innerText)">${bodyText}</p>
        ${isEdit ? `<button class="edit-page-btn" onclick="openArticleEditor('${currentCategory}', ${item.id})">✎ Modifier la page (éditeur complet)</button>` : ''}
    `;

    document.title = `VAFM | ${item.title}`;
}

/* ==========================================================================
   ACTIONS ADMIN PROPRES À CETTE PAGE
   ========================================================================== */
function updateTextContent(category, id, key, value) {
    const item = appState[category].find(x => x.id === id);
    if (!item) return;
    item[key] = value;
    saveState();
}

function triggerImageChange(category, id) {
    const url = prompt("URL de l'image :");
    if (url) {
        const item = appState[category].find(x => x.id === id);
        if (item) {
            item.img = url;
            saveState();
            renderAll();
        }
    }
}
