/* ==========================================================================
   GESTION DES ARTICLES ET ÉDITION (CANVA STUDIO)
   ========================================================================== */

let currentArticleData = null;
let currentCategory = null;
let currentId = null;

/* --------------------------------------------------------------------------
   1. NAVIGATION ET AFFICHAGE (CANVA STUDIO)
   -------------------------------------------------------------------------- */
async function openArticleView(category, id) {
    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category] || 'actus';

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert("Impossible de charger cet article.");
        return;
    }

    currentArticleData = data;
    currentCategory = category;
    currentId = id;

    const title = data.titre || data.title || data.nom || 'Sans titre';
    const rawText = data.texte || data.description || data.contenu || '';
    const img = data.imageUrl || data.image_url || data.img_url || '';
    const isPublished = Boolean(data.is_published);
    const date = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : '';

    const isAdmin = Boolean(appState && appState.editMode && appState.currentUser);

    const articleContainer = document.getElementById('article-modal');
    if (!articleContainer) return;

    articleContainer.innerHTML = `
       <style>
            ::selection { background-color: #E50914 !important; color: #ffffff !important; }
            ::-moz-selection { background-color: #E50914 !important; color: #ffffff !important; }

            #article-modal {
                position: relative !important;
                width: 100% !important;
                min-height: 100vh !important;
                background-color: #f4f4f7 !important;
            }

            header, .navbar, nav { border-bottom: none !important; box-shadow: none !important; }

            .vafm-player-toolbar {
                position: fixed !important;
                bottom: 92px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                background: #18181c !important;
                border: 1px solid rgba(255, 255, 255, 0.18) !important;
                border-bottom: none !important;
                border-radius: 12px 12px 0 0 !important;
                padding: 8px 16px !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                z-index: 100000 !important;
                box-shadow: 0 -8px 25px rgba(0, 0, 0, 0.5) !important;
            }

            .vafm-tb-label {
                font-size: 0.7rem !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.8px !important;
                color: #E50914 !important;
                margin-right: 6px !important;
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
            }

            .vafm-tb-divider {
                width: 1px !important;
                height: 18px !important;
                background: rgba(255, 255, 255, 0.15) !important;
                margin: 0 4px !important;
            }

            .vafm-tb-btn {
                position: relative !important;
                background: rgba(255, 255, 255, 0.06) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                color: #b0b0bb !important;
                width: 34px !important;
                height: 34px !important;
                border-radius: 8px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
            }

            .vafm-tb-btn svg { width: 16px !important; height: 16px !important; stroke: currentColor !important; stroke-width: 2 !important; fill: none !important; }

            .vafm-tb-btn:hover {
                background: rgba(255, 255, 255, 0.15) !important;
                color: #ffffff !important;
                border-color: rgba(255, 255, 255, 0.3) !important;
                transform: translateY(-2px) !important;
            }

            .vafm-tb-btn.status-published { color: #34c759 !important; }
            .vafm-tb-btn.status-draft { color: #ff9500 !important; }

            .vafm-tb-btn.btn-save:hover { background: #34c759 !important; color: #ffffff !important; border-color: #34c759 !important; }
            .vafm-tb-btn.btn-delete:hover { background: #ff3b30 !important; color: #ffffff !important; border-color: #ff3b30 !important; }

            .canva-layout { width: 100% !important; min-height: 100vh !important; display: flex !important; flex-direction: column !important; }
            .canva-workspace { width: 100% !important; min-height: 100vh !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; background-color: #f4f4f7 !important; display: flex !important; justify-content: center !important; }
            .canva-document { width: 100% !important; max-width: 850px !important; min-height: 100vh !important; margin: 0 auto !important; background: #ffffff !important; padding: 40px 50px 180px 50px !important; box-sizing: border-box !important; border-left: 1px solid #e0e0e8 !important; border-right: 1px solid #e0e0e8 !important; box-shadow: -15px 0 25px -10px rgba(0, 0, 0, 0.07), 15px 0 25px -10px rgba(0, 0, 0, 0.07) !important; }

            .canva-admin-active [contenteditable="true"]:hover,
            .canva-admin-active [contenteditable="true"]:focus {
                outline: 2px dashed #E50914 !important;
                outline-offset: 4px;
                border-radius: 4px;
            }

            blockquote.canva-quote { border-left: 4px solid #E50914; padding-left: 16px; margin: 20px 0; font-style: italic; color: #555; }
        </style>
        <div class="canva-layout ${isAdmin ? 'canva-admin-active' : ''}">
            <main class="canva-workspace">
                <article class="canva-document">
                    <span class="article-category-badge" style="display:inline-block; padding:4px 12px; background:#f0f0f5; border-radius:20px; font-weight:700; font-size:0.75rem; text-transform:uppercase; margin-bottom:15px;">${category}</span>
                    
                    <h1 class="article-title" id="canva-doc-title" ${isAdmin ? 'contenteditable="true"' : ''} style="font-size: 2.5rem; font-weight: 800; margin-bottom: 10px;">${title}</h1>
                    ${date ? `<div class="article-meta" style="color: #8e8e93; font-size:0.85rem; margin-bottom: 25px;">Publié le ${date}</div>` : ''}

                    <div class="article-hero-media" id="canva-doc-media">
                        ${img ? `<img src="${img}" id="canva-img-element" alt="${title}" style="max-width:100%; border-radius:12px; margin:10px 0 30px 0;">` : ''}
                    </div>

                    <div class="article-content" id="canva-doc-content" ${isAdmin ? 'contenteditable="true"' : ''}>
                        ${rawText.includes('<p>') ? rawText : rawText.split('\n').map(p => `<p>${p}</p>`).join('')}
                    </div>
                </article>
            </main>

            ${isAdmin ? `
                <div class="vafm-player-toolbar">
                    <span class="vafm-tb-label">Studio</span>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter un paragraphe" onclick="addCanvaBlock('p')">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter un titre" onclick="addCanvaBlock('h2')">
                        <svg viewBox="0 0 24 24"><path d="M4 12h16M4 6h16M4 18h10"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter une mise en avant" onclick="addCanvaBlock('quote')">
                        <svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
                    </button>

                    <button class="vafm-tb-btn" data-tooltip="Ajouter une image" onclick="document.getElementById('canva-file-input').click()">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input type="file" id="canva-file-input" style="display:none;" accept="image/*" onchange="handleCanvaImageUpload(event)">

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn ${isPublished ? 'status-published' : 'status-draft'}" data-tooltip="${isPublished ? 'En ligne' : 'Brouillon'}" onclick="handleTogglePublishInStudio('${tableName}', '${id}', ${isPublished}, '${category}')">
                        ${isPublished 
                            ? `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                            : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                        }
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn btn-save" data-tooltip="Enregistrer" onclick="saveCanvaArticle('${tableName}', '${id}')">
                        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>

                    <button class="vafm-tb-btn btn-delete" data-tooltip="Supprimer" onclick="deleteItem('${tableName}', '${id}'); closeArticleView();">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-tooltip="Quitter la vue" onclick="closeArticleView()">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'none';
    
    articleContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    history.pushState({ page: 'article', category, id }, title, `?article=${category}&id=${id}`);
}

async function handleTogglePublishInStudio(tableName, id, isPublished, category) {
    await togglePublish(tableName, id, isPublished);
    await openArticleView(category, id);
}

function closeArticleView() {
    const articleContainer = document.getElementById('article-modal');
    if (articleContainer) {
        articleContainer.style.display = 'none';
        articleContainer.innerHTML = '';
    }
    
    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'block';
    
    history.pushState({ page: 'home' }, '', window.location.pathname);
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page === 'article') {
        openArticleView(e.state.category, e.state.id);
    } else {
        closeArticleView();
    }
});

/* --------------------------------------------------------------------------
   2. OUTILS DE L'ÉDITEUR CANVA (ÉDITION EN LIGNE)
   -------------------------------------------------------------------------- */
function addCanvaBlock(type = 'p') {
    const contentBox = document.getElementById('canva-doc-content');
    if (!contentBox) return;

    let el;
    if (type === 'h2') {
        el = document.createElement('h2');
        el.innerText = "Nouveau titre...";
        el.style.fontSize = "1.5rem";
        el.style.marginTop = "20px";
    } else if (type === 'quote') {
        el = document.createElement('blockquote');
        el.className = 'canva-quote';
        el.innerText = "Citation ou texte en évidence...";
    } else {
        el = document.createElement('p');
        el.innerText = "Nouveau paragraphe... Cliquez pour écrire.";
    }

    contentBox.appendChild(el);
    el.focus();
}

function handleCanvaImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const mediaZone = document.getElementById('canva-doc-media');
            if (mediaZone) {
                mediaZone.innerHTML = `<img src="${e.target.result}" id="canva-img-element" alt="Aperçu" style="max-width:100%; border-radius:12px; margin:10px 0 30px 0;">`;
            }
        };
        reader.readAsDataURL(file);
    }
}

async function saveCanvaArticle(tableName, id) {
    const title = document.getElementById('canva-doc-title')?.innerText.trim();
    const content = document.getElementById('canva-doc-content')?.innerHTML.trim();
    const imgElement = document.getElementById('canva-img-element');
    const fileInput = document.getElementById('canva-file-input');
    
    let imageUrl = imgElement ? imgElement.src : null;

    if (fileInput && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage.from('uploads').upload(fileName, file);
        
        if (!uploadError) {
            const { data: publicUrlData } = supabaseClient.storage.from('uploads').getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
        }
    }

    const titleCol = (tableName === 'animateurs') ? 'nom' : 'titre';
    const textCol = (tableName === 'emissions' || tableName === 'animateurs') ? 'description' : (tableName === 'hero' ? 'texte' : 'contenu');
    const imgCol = (tableName === 'emissions' || tableName === 'animateurs') ? 'image_url' : 'imageUrl';

    const payload = {
        [titleCol]: title,
        [textCol]: content
    };

    if (imageUrl && !imageUrl.startsWith('data:')) {
        payload[imgCol] = imageUrl;
    }

    const { error } = await supabaseClient
        .from(tableName)
        .update(payload)
        .eq('id', id);

    if (error) {
        alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
        alert("✨ Enregistré avec succès !");
        await fetchAllFromSupabase();
    }
}

/* --------------------------------------------------------------------------
   3. CHARGEMENT INDÉPENDANT PAR PARAMS URL (?type=news&id=123)
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const articleCategory = urlParams.get('article') || urlParams.get('type');
    const articleId = urlParams.get('id');

    if (articleCategory && articleId) {
        setTimeout(() => {
            openArticleView(articleCategory, articleId);
        }, 100);
    }
});