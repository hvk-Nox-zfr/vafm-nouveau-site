// Dictionnaire de layouts mobiles (0 trou sur grille 2x2 = 4 blocs)
const mobileBentoLayouts = {
    1: [
        ['bento-wide']
    ],
    2: [
        ['bento-wide', 'bento-wide'],               // 2 bannières
        ['bento-tall', 'bento-tall']                // 2 colonnes
    ],
    3: [
        ['bento-tall', 'bento-small', 'bento-small'], // 1 verticale à gauche + 2 carrés à droite
        ['bento-small', 'bento-tall', 'bento-small'], // 1 verticale à droite + 2 carrés à gauche
        ['bento-wide', 'bento-small', 'bento-small'], // 1 large en haut + 2 carrés en bas
        ['bento-small', 'bento-small', 'bento-wide']  // 2 carrés en haut + 1 large en bas
    ],
    4: [
        ['bento-small', 'bento-small', 'bento-small', 'bento-small'] // 4 carrés
    ]
};

// Motifs Desktop stricts : chaque pattern totalise EXACTEMENT 6 blocs (grille 3x2)
const desktopPatterns = {
    1: [
        ['bento-full-hero'] // 3x2 (remplit tout)
    ],
    2: [
        ['bento-half-hero', 'bento-tall'] // 2x2 + 1x2 = 6 blocs
    ],
    3: [
        ['bento-half-hero', 'bento-standard', 'bento-standard'], // 2x2 à gauche + 2 cartes 1x1 superposées à droite
        ['bento-standard', 'bento-standard', 'bento-half-hero']  // 2 cartes 1x1 superposées à gauche + 2x2 à droite
    ],
    4: [
        ['bento-tall', 'bento-tall', 'bento-standard', 'bento-standard'], // 1x2 + 1x2 + deux 1x1
        ['bento-wide', 'bento-wide', 'bento-standard', 'bento-standard']  // 2x1 + 2x1 + deux 1x1
    ],
    5: [
        ['bento-wide', 'bento-standard', 'bento-standard', 'bento-standard', 'bento-standard'] // 2x1 + quatre 1x1
    ],
    6: [
        ['bento-standard', 'bento-standard', 'bento-standard', 'bento-standard', 'bento-standard', 'bento-standard'] // six 1x1
    ]
};

// Génère une empreinte stable à partir des IDs des articles pour figer le design
function getDeterministicIndex(seedString, maxIndex) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
        hash = (hash << 5) - hash + seedString.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % maxIndex;
}

// Fonction centrale pour afficher la page d'Accueil (ou scroller vers une section)
function showHomePage(targetSectionId = null) {
    // 1. Masque la SPA Actualités
    const newsPage = document.getElementById('news-page-spa');
    if (newsPage) {
        newsPage.style.display = 'none';
        newsPage.classList.remove('active');
    }

    // 2. Affiche le contenu principal de l'accueil
    const mainContent = document.getElementById('content');
    if (mainContent) {
        mainContent.style.display = 'block';
    }

    // 3. Bascule les menus de navigation
    const mainNav = document.getElementById('main-nav-links');
    const newsNav = document.getElementById('news-nav-links');
    if (mainNav) mainNav.style.display = 'flex';
    if (newsNav) newsNav.style.display = 'none';

    // 4. Défilement vers la section ou en haut
    if (targetSectionId) {
        setTimeout(() => {
            const section = document.getElementById(targetSectionId);
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        }, 50);
    } else {
        window.scrollTo(0, 0);
    }
}

// Fonction pour ouvrir la SPA Actualités
function openNewsPage() {
    const mainContent = document.getElementById('content');
    if (mainContent) {
        mainContent.style.display = 'none';
    }

    const newsPage = document.getElementById('news-page-spa');
    if (newsPage) {
        newsPage.style.display = 'block';
        newsPage.classList.add('active');
    }

    const mainNav = document.getElementById('main-nav-links');
    const newsNav = document.getElementById('news-nav-links');
    if (mainNav) mainNav.style.display = 'none';
    if (newsNav) newsNav.style.display = 'flex';

    // Force le scroll tout en haut après que le DOM a masqué l'accueil
    setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, 0);
}

// Fonction universelle pour gérer le routage propre selon l'URL
function handleNavigation() {
    const hash = window.location.hash;

    if (hash === '#actus' || hash === '#actualites') {
        openNewsPage();
    } else {
        const targetSection = (hash && hash !== '#') ? hash.replace('#', '') : null;
        showHomePage(targetSection);
    }
}

function closeNewsPage(targetId = 'top') {
    const newsPage = document.getElementById('news-page-spa');
    const contentPage = document.getElementById('content');
    const newsNav = document.getElementById('news-nav-links');
    const mainNav = document.getElementById('main-nav-links');

    if (typeof closeArticleView === 'function') {
        closeArticleView();
    }

    if (newsPage) {
        newsPage.classList.remove('active');
        newsPage.style.display = 'none';
    }

    if (contentPage) {
        contentPage.style.display = 'block';
    }

    if (newsNav) newsNav.style.display = 'none';
    if (mainNav) mainNav.style.display = 'flex';

    window.scrollTo(0, 0);

    if (targetId && targetId !== 'top') {
        setTimeout(() => {
            const section = document.getElementById(targetId);
            if (section) {
                const navbarOffset = 70;
                const elementPosition = section.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navbarOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }, 50);
    }
}

// Initialisation globale de la navigation (Évite la duplication d'écouteurs)
document.addEventListener('DOMContentLoaded', () => {
    // Interception propre des clics du menu
    const navLinks = document.querySelectorAll('#main-nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const hash = link.getAttribute('href');
            history.pushState(null, '', hash);
            handleNavigation();
        });
    });

    // Exécution initiale selon l'URL de départ
    handleNavigation();
});

// Écoute les boutons Précédent/Suivant du navigateur
window.addEventListener('popstate', handleNavigation);

function scrollToNewsCategory(catName) {
    if (catName === 'tous') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const target = document.getElementById('news-cat-sec-' + catName);
    if (target) {
        const offset = 80;
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = target.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
}

function renderNewsSpa(articles) {
    const categories = ['culture', 'tech', 'sport', 'cinema', 'societe', 'faits-divers'];
    const newsList = articles || (window.appState ? window.appState.news : []) || [];
    const isMobile = window.innerWidth <= 768;

    categories.forEach(cat => {
        const grid = document.getElementById(`grid-news-${cat}`);
        if (!grid) return;

        const filtered = newsList
            .filter(a => a.category === cat)
            .sort((a, b) => new Date(b.published_at || b.created || 0) - new Date(a.published_at || a.created || 0));

        if (filtered.length === 0) {
            grid.innerHTML = '<p style="color: #888; padding: 15px 0;">Aucun article dans cette catégorie pour le moment.</p>';
            return;
        }

        const categorySeed = filtered.map(item => item.id || item.title).join('_');

        const pages = [];
        let remaining = [...filtered];
        let pageIdx = 0;

        while (remaining.length > 0) {
            let pageSize;
            const pageSeed = categorySeed + '_p' + pageIdx;
            
            if (isMobile) {
                if (remaining.length <= 4) {
                    pageSize = remaining.length;
                } else {
                    pageSize = getDeterministicIndex(pageSeed, 3) + 2;
                }
            } else {
                if (remaining.length <= 6) {
                    pageSize = remaining.length;
                } else {
                    pageSize = getDeterministicIndex(pageSeed, 3) + 4;
                }
            }

            pages.push(remaining.slice(0, pageSize));
            remaining = remaining.slice(pageSize);
            pageIdx++;
        }

        const slidesHtml = pages.map((pageItems, slideIdx) => {
            const count = pageItems.length;
            const slideSeed = categorySeed + '_slide' + slideIdx;
            let pattern = [];

            if (isMobile) {
                const validCount = Math.min(Math.max(count, 1), 4);
                const possibleLayouts = mobileBentoLayouts[validCount];
                const layoutIdx = getDeterministicIndex(slideSeed, possibleLayouts.length);
                pattern = possibleLayouts[layoutIdx];
            } else {
                const validCount = Math.min(Math.max(count, 1), 6);
                const possibleLayouts = desktopPatterns[validCount];
                const layoutIdx = getDeterministicIndex(slideSeed, possibleLayouts.length);
                pattern = possibleLayouts[layoutIdx];
            }

            const cardsHtml = pageItems.map((item, index) => {
                const imageUrl = item.img || item.image || 'https://via.placeholder.com/500x300';
                const title = item.title || item.titre || 'Sans titre';
                const dateObj = new Date(item.published_at || item.created || Date.now());
                const formattedDate = !isNaN(dateObj) ? dateObj.toLocaleDateString('fr-FR') : '';
                const rawText = (item.description || item.texte || item.text || item.contenu || '').replace(/<[^>]*>?/gm, '');
                const excerpt = rawText.length > 90 ? rawText.substring(0, 90) + '...' : rawText;

                const bentoClass = pattern[index] || (isMobile ? 'bento-small' : 'bento-standard');

                // Contrôles admin (visibles uniquement pour un éditeur connecté)
                const canEditThisCategory = typeof canEditCategory === 'function' ? canEditCategory('news') : false;
                const isUserLoggedIn = typeof appState !== 'undefined' && appState && appState.currentUser;
                const currentUserId = isUserLoggedIn ? appState.currentUser.id : null;
                const likesList = Array.isArray(item.likesList) ? item.likesList : [];
                const hasLiked = currentUserId && likesList.some(l => l.user === currentUserId);
                const likeCount = likesList.length || 0;

                const adminHtml = canEditThisCategory ? `
                    <span class="card-status-tag ${item.is_published ? 'tag-published' : 'tag-draft'}">
                        ${item.is_published ? 'Publié' : 'Brouillon'}
                    </span>
                    <div class="card-admin-actions" onclick="event.stopPropagation();">
                        <button class="btn-admin-action ${item.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('actus', '${item.id}', ${item.is_published}); event.stopPropagation();">
                            ${item.is_published ? 'Dépublier' : 'Publier'}
                        </button>
                        <button class="btn-admin-action" onclick="openEditorModal('news', '${item.id}'); event.stopPropagation();">✏️</button>
                        <button class="btn-admin-action" onclick="deleteItem('actus', '${item.id}'); event.stopPropagation();">✕</button>
                    </div>
                ` : '';

                const actionsHtml = typeof handleLikeActu === 'function' ? `
                    <div class="bento-actions" onclick="event.stopPropagation();">
                        <button class="vafm-card-btn ${hasLiked ? 'liked' : ''}" onclick="handleLikeActu('${item.id}')" title="Aimer">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="${hasLiked ? '#ff334b' : 'none'}" stroke="${hasLiked ? '#ff334b' : '#ffffff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                            <span>${likeCount}</span>
                        </button>
                        <button class="vafm-card-btn" onclick="handleShareActu('${item.id}', '${encodeURIComponent(title)}')" title="Partager">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                            <span>Partager</span>
                        </button>
                    </div>
                ` : '';

                return `
                    <article class="news-card-bento ${bentoClass} ${!item.is_published ? 'draft-card' : ''}" data-id="${item.id}" onclick="handleArticleClick('${item.id}')" style="background-image: url('${imageUrl}');">
                        ${adminHtml}
                        <div class="bento-overlay"></div>
                        <div class="bento-content">
                            ${formattedDate ? `<span class="bento-date">${formattedDate}</span>` : ''}
                            <h3 class="bento-title">${title}</h3>
                            <p class="bento-excerpt">${excerpt}</p>
                        </div>
                        ${actionsHtml}
                    </article>
                `;
            }).join('');

            return `<div class="bento-slide-page">${cardsHtml}</div>`;
        }).join('');

        const showBtns = pages.length > 1;

        grid.innerHTML = `
            <div class="bento-carousel-wrapper">
                ${showBtns ? `<button class="carousel-btn prev" onclick="scrollBentoCarousel('${cat}', -1)">❮</button>` : ''}
                <div class="bento-carousel-track" id="track-${cat}">
                    ${slidesHtml}
                </div>
                ${showBtns ? `<button class="carousel-btn next" onclick="scrollBentoCarousel('${cat}', 1)">❯</button>` : ''}
            </div>
        `;
    });
}

function scrollBentoCarousel(cat, direction) {
    const track = document.getElementById(`track-${cat}`);
    if (!track) return;
    const scrollAmount = track.clientWidth;
    track.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

function handleArticleClick(id) {
    // Force la remontée immédiate tout en haut
    window.scrollTo(0, 0);

    if (typeof openArticleView === 'function') {
        openArticleView('actus', id);
    } else if (typeof openArticleModal === 'function') {
        openArticleModal('actus', id);
    } else {
        console.error("Aucune fonction trouvée pour ouvrir l'article", id);
    }
}

/* ==========================================================================
   BENTO CARROUSEL — SECTION ACTUALITÉS DE LA PAGE D'ACCUEIL
   Même système de cartes aléatoires que la page Actus dédiée, mais avec un
   nombre de pages limité : au-delà, une carte "Voir plus" renvoie vers la
   page Actus complète.
   ========================================================================== */

// Redirige vers la page Actus dédiée (même comportement que le lien du menu)
function goToDedicatedNewsPage() {
    history.pushState(null, '', '#actus');
    if (typeof handleNavigation === 'function') {
        handleNavigation();
    }
}

// Découpe les articles en pages bornées (2 pages max desktop / 3 max mobile),
// en tenant tout sur une seule page quand le contenu est déjà assez court.
function paginateHomeBento(items, seedPrefix, isMobile) {
    const maxPages = isMobile ? 3 : 2;
    const minCount = isMobile ? 2 : 4;
    const maxCount = isMobile ? 4 : 6;

    if (items.length <= maxCount) {
        return { pages: [items], hasMore: false };
    }

    const pages = [];
    let cursor = 0;
    let pageIdx = 0;

    while (cursor < items.length && pageIdx < maxPages) {
        const pageSeed = seedPrefix + '_hp' + pageIdx;
        let count = getDeterministicIndex(pageSeed, 3) + minCount; // desktop: 4-6, mobile: 2-4
        const remaining = items.length - cursor;

        if (remaining <= count) {
            count = remaining;
        }

        pages.push(items.slice(cursor, cursor + count));
        cursor += count;
        pageIdx++;
    }

    return { pages, hasMore: cursor < items.length };
}

// Rend un carrousel bento pour une grille de la page d'accueil (Nouveaux,
// Plus likés, Plus anciennes), avec carte "Voir plus" si le contenu dépasse
// le nombre de pages autorisé.
function renderHomeNewsBento(gridElement, dataArray, seedPrefix) {
    if (!gridElement) return;

    const newsList = Array.isArray(dataArray) ? dataArray : [];

    if (newsList.length === 0) {
        gridElement.classList.remove('home-bento-mode');
        gridElement.innerHTML = '<p class="empty-msg" style="color: #a1a1aa; padding: 20px;">Aucun contenu disponible pour le moment.</p>';
        return;
    }

    gridElement.classList.add('home-bento-mode');

    const isMobile = window.innerWidth <= 768;
    const seed = seedPrefix + '_' + newsList.map(item => item.id || item.title).join('_');
    const { pages, hasMore } = paginateHomeBento(newsList, seed, isMobile);

    if (hasMore) {
        const lastPage = pages[pages.length - 1];
        if (lastPage.length > 1) lastPage.pop();
        lastPage.push({ __seeMore: true });
    }

    const slidesHtml = pages.map((pageItems, slideIdx) => {
        const count = pageItems.length;
        const slideSeed = seed + '_hpslide' + slideIdx;
        let pattern = [];

        if (isMobile) {
            const validCount = Math.min(Math.max(count, 1), 4);
            const possibleLayouts = mobileBentoLayouts[validCount];
            const layoutIdx = getDeterministicIndex(slideSeed, possibleLayouts.length);
            pattern = possibleLayouts[layoutIdx];
        } else {
            const validCount = Math.min(Math.max(count, 1), 6);
            const possibleLayouts = desktopPatterns[validCount];
            const layoutIdx = getDeterministicIndex(slideSeed, possibleLayouts.length);
            pattern = possibleLayouts[layoutIdx];
        }

        const cardsHtml = pageItems.map((item, index) => {
            const bentoClass = pattern[index] || (isMobile ? 'bento-small' : 'bento-standard');

            if (item.__seeMore) {
                return `
                    <article class="news-card-bento bento-see-more ${bentoClass}" onclick="goToDedicatedNewsPage()">
                        <div class="bento-see-more-inner">
                            <span class="bento-see-more-label">Voir plus</span>
                            <span class="bento-see-more-arrow">→</span>
                        </div>
                    </article>
                `;
            }

            const imageUrl = item.img || item.image || 'https://via.placeholder.com/500x300';
            const title = item.title || item.titre || 'Sans titre';
            const dateObj = new Date(item.created || item.published_at || Date.now());
            const formattedDate = !isNaN(dateObj) ? dateObj.toLocaleDateString('fr-FR') : '';
            const rawText = (item.text || item.description || item.texte || item.contenu || '').replace(/<[^>]*>?/gm, '');
            const excerpt = rawText.length > 90 ? rawText.substring(0, 90) + '...' : rawText;

            // Contrôles admin (visibles uniquement pour un éditeur connecté)
            const canEditThisCategory = typeof canEditCategory === 'function' ? canEditCategory('news') : false;
            const isUserLoggedIn = typeof appState !== 'undefined' && appState && appState.currentUser;
            const currentUserId = isUserLoggedIn ? appState.currentUser.id : null;
            const likesList = Array.isArray(item.likesList) ? item.likesList : [];
            const hasLiked = currentUserId && likesList.some(l => l.user === currentUserId);
            const likeCount = likesList.length || 0;

            const adminHtml = canEditThisCategory ? `
                <span class="card-status-tag ${item.is_published ? 'tag-published' : 'tag-draft'}">
                    ${item.is_published ? 'Publié' : 'Brouillon'}
                </span>
                <div class="card-admin-actions" onclick="event.stopPropagation();">
                    <button class="btn-admin-action ${item.is_published ? 'btn-unpublish' : 'btn-publish'}" onclick="togglePublish('actus', '${item.id}', ${item.is_published}); event.stopPropagation();">
                        ${item.is_published ? 'Dépublier' : 'Publier'}
                    </button>
                    <button class="btn-admin-action" onclick="openEditorModal('news', '${item.id}'); event.stopPropagation();">✏️</button>
                    <button class="btn-admin-action" onclick="deleteItem('actus', '${item.id}'); event.stopPropagation();">✕</button>
                </div>
            ` : '';

            const actionsHtml = `
                <div class="bento-actions" onclick="event.stopPropagation();">
                    <button class="vafm-card-btn ${hasLiked ? 'liked' : ''}" onclick="handleLikeActu('${item.id}')" title="Aimer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="${hasLiked ? '#ff334b' : 'none'}" stroke="${hasLiked ? '#ff334b' : '#ffffff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <span>${likeCount}</span>
                    </button>
                    <button class="vafm-card-btn" onclick="handleShareActu('${item.id}', '${encodeURIComponent(title)}')" title="Partager">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                        <span>Partager</span>
                    </button>
                </div>
            `;

            return `
                <article class="news-card-bento ${bentoClass} ${!item.is_published ? 'draft-card' : ''}" data-id="${item.id}" onclick="openArticleView('news', '${item.id}')" style="background-image: url('${imageUrl}');">
                    ${adminHtml}
                    <div class="bento-overlay"></div>
                    <div class="bento-content">
                        ${formattedDate ? `<span class="bento-date">${formattedDate}</span>` : ''}
                        <h3 class="bento-title">${title}</h3>
                        <p class="bento-excerpt">${excerpt}</p>
                    </div>
                    ${actionsHtml}
                </article>
            `;
        }).join('');

        return `<div class="bento-slide-page">${cardsHtml}</div>`;
    }).join('');

    const showBtns = pages.length > 1;
    const trackId = 'home-track-' + seedPrefix.replace(/[^a-zA-Z0-9]/g, '');

    gridElement.innerHTML = `
        <div class="bento-carousel-wrapper">
            ${showBtns ? `<button class="carousel-btn prev" onclick="scrollHomeBentoCarousel('${trackId}', -1)">❮</button>` : ''}
            <div class="bento-carousel-track" id="${trackId}">
                ${slidesHtml}
            </div>
            ${showBtns ? `<button class="carousel-btn next" onclick="scrollHomeBentoCarousel('${trackId}', 1)">❯</button>` : ''}
        </div>
    `;
}

function scrollHomeBentoCarousel(trackId, direction) {
    const track = document.getElementById(trackId);
    if (!track) return;
    const scrollAmount = track.clientWidth;
    track.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (typeof appState !== 'undefined' && appState.news) {
            renderNewsSpa(appState.news);
        }
        if (typeof renderHomeNewsGrids === 'function') {
            renderHomeNewsGrids();
        }
    }, 250);
});