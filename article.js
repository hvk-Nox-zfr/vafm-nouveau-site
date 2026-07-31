/* ==========================================================================
   GESTION DES ARTICLES ET ÉDITION (CANVA STUDIO ADVANCED)
   ========================================================================== */

let currentArticleData = null;
let currentCategory = null;
let currentId = null;
let activeBlock = null;

/* --------------------------------------------------------------------------
   1. NAVIGATION ET AFFICHAGE (CANVA STUDIO)
   -------------------------------------------------------------------------- */
async function openArticleView(category, id) {
    const tableMap = { hero: 'hero', news: 'actus', actus: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[category] || 'actus';

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        console.error("Erreur de chargement Supabase:", error);
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

    // Détection session admin fiable
    const isAdmin = Boolean(
        (window.appState && window.appState.editMode) || 
        document.body.classList.contains('admin-logged-in') || 
        document.body.classList.contains('edit-mode-active')
    );

    const articleContainer = document.getElementById('article-modal');
    if (!articleContainer) {
        console.error("Élément #article-modal introuvable dans le DOM !");
        return;
    }

    const initialMediaBlock = img ? `<div class="canva-block img-full" id="canva-doc-media"><img src="${img}" id="canva-img-element" alt="${title}"></div>` : '';

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
                bottom: 95px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                background: #18181c !important;
                border: 1px solid rgba(255, 255, 255, 0.18) !important;
                border-radius: 12px !important;
                padding: 6px 12px !important;
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
                z-index: 999999 !important;
                flex-wrap: nowrap !important;
                overflow-x: auto !important;
                max-width: 95vw !important;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5) !important;
            }

            .vafm-tb-label {
                font-size: 0.7rem !important;
                font-weight: 800 !important;
                text-transform: uppercase !important;
                letter-spacing: 0.8px !important;
                color: #E50914 !important;
                margin-right: 4px !important;
                display: flex !important;
                align-items: center !important;
            }

            .vafm-tb-divider {
                width: 1px !important;
                height: 18px !important;
                background: rgba(255, 255, 255, 0.15) !important;
                margin: 0 3px !important;
            }

            .vafm-tb-btn {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.06);
                color: #b0b0bb;
                cursor: pointer;
                transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
            }

            .vafm-tb-btn svg { 
                width: 16px !important; 
                height: 16px !important; 
                stroke: currentColor !important; 
                stroke-width: 2 !important; 
                fill: none !important; 
                stroke-linecap: round !important;
                stroke-linejoin: round !important;
            }

            .vafm-tb-btn:hover {
                background: rgba(255, 255, 255, 0.18) !important;
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
            .canva-document { width: 100% !important; max-width: 850px !important; min-height: 100vh !important; margin: 0 auto !important; background: #ffffff !important; padding: 40px 50px 180px 50px !important; box-sizing: border-box !important; border-left: 1px solid #e0e0e8 !important; border-right: 1px solid #e0e0e8 !important; box-shadow: -15px 0 25px -10px rgba(0, 0, 0, 0.07), 15px 0 25px -10px rgba(0, 0, 0, 0.07) !important; position: relative; }

            .canva-document a { color: #E50914 !important; text-decoration: underline !important; font-weight: 600; cursor: pointer; }

            /* Nettoyage du flux pour autoriser le texte à entourer l'image */
            .canva-document::after, .article-content::after, #canva-doc-content::after {
                content: "";
                display: table;
                clear: both;
            }

            .canva-header-fixed {
                margin-bottom: 25px;
                user-select: none;
            }

            .canva-admin-active .canva-block {
                position: relative;
                margin-bottom: 12px;
                padding: 8px;
                border: 1px dashed transparent;
                border-radius: 8px;
                cursor: grab;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }

            .canva-admin-active .canva-block:hover {
                border-color: rgba(229, 9, 20, 0.4);
            }

            .canva-admin-active .canva-block.selected {
                border: 2px solid #E50914 !important;
                box-shadow: 0 0 10px rgba(229, 9, 20, 0.15);
            }

            .canva-admin-active .canva-block.dragging {
                opacity: 0.35;
                border: 2px dashed #E50914 !important;
            }

            .canva-admin-active .canva-block.editing {
                cursor: text !important;
                border: 2px solid #34c759 !important;
            }

            .canva-drop-indicator {
                height: 4px;
                background-color: #E50914;
                border-radius: 2px;
                margin: 6px 0;
                box-shadow: 0 0 8px rgba(229, 9, 20, 0.8);
                transition: all 0.1s ease;
                pointer-events: none;
                clear: both;
            }

            /* --- STYLES FLOTANTS IMAGE + TEXTE --- */
            .canva-block.img-left { 
                float: left !important; 
                width: 45% !important; 
                margin-right: 20px !important; 
                margin-bottom: 15px !important; 
                clear: left;
            }

            .canva-block.img-right { 
                float: right !important; 
                width: 45% !important; 
                margin-left: 20px !important; 
                margin-bottom: 15px !important; 
                clear: right;
            }

            .canva-block.img-full { 
                float: none !important; 
                width: 100% !important; 
                margin: 15px 0 !important; 
                clear: both;
            }

            .canva-block img { width: 100%; border-radius: 8px; display: block; }

            blockquote.canva-quote { border-left: 4px solid #E50914; padding-left: 16px; margin: 20px 0; font-style: italic; color: #555; }
        </style>

        <div class="canva-layout ${isAdmin ? 'canva-admin-active' : ''}">
            <main class="canva-workspace">
                <article class="canva-document">
                    <header class="canva-header-fixed">
                        <span class="article-category-badge" style="display:inline-block; padding:4px 12px; background:#f0f0f5; border-radius:20px; font-weight:700; font-size:0.75rem; text-transform:uppercase; margin-bottom:15px;">${category}</span>
                        <h1 class="article-title" id="canva-doc-title" ${isAdmin ? 'contenteditable="true"' : ''} style="font-size: 2.5rem; font-weight: 800; margin-bottom: 10px; outline: none;">${title}</h1>
                        ${date ? `<div class="article-meta" style="color: #8e8e93; font-size:0.85rem;">Publié le ${date}</div>` : ''}
                    </header>

                    <div class="article-content" id="canva-doc-content">
                        ${initialMediaBlock}
                        ${formatContentToCanvaBlocks(rawText)}
                    </div>
                </article>
            </main>

            ${isAdmin ? `
                <div class="vafm-player-toolbar">
                    <span class="vafm-tb-label">Studio</span>

                    <button class="vafm-tb-btn" title="Gras" onclick="applyFormat('bold')">
                        <svg viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Italique" onclick="applyFormat('italic')">
                        <svg viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Souligné" onclick="applyFormat('underline')">
                        <svg viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Insérer un lien" onclick="addLinkToSelection()">
                        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" title="Ajouter Paragraphe" onclick="addCanvaBlock('p')">
                        <svg viewBox="0 0 24 24"><path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Ajouter Titre" onclick="addCanvaBlock('h2')">
                        <svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h10"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Citation" onclick="addCanvaBlock('quote')">
                        <svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Ajouter une Image" onclick="document.getElementById('canva-file-input').click()">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input type="file" id="canva-file-input" style="display:none;" accept="image/*" onchange="handleCanvaImageUpload(event)">

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" title="Placer Image à Gauche (Texte à droite)" onclick="setBlockPosition('left')">
                        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1"/><line x1="15" y1="6" x2="21" y2="6"/><line x1="15" y1="10" x2="21" y2="10"/><line x1="15" y1="14" x2="21" y2="14"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Pleine Largeur" onclick="setBlockPosition('full')">
                        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="10" rx="1"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                    <button class="vafm-tb-btn" title="Placer Image à Droite (Texte à gauche)" onclick="setBlockPosition('right')">
                        <svg viewBox="0 0 24 24"><rect x="13" y="4" width="8" height="16" rx="1"/><line x1="3" y1="6" x2="9" y2="6"/><line x1="3" y1="10" x2="9" y2="10"/><line x1="3" y1="14" x2="9" y2="14"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn ${isPublished ? 'status-published' : 'status-draft'}" title="${isPublished ? 'En ligne' : 'Brouillon'}" onclick="handleTogglePublishInStudio('${tableName}', '${id}', ${isPublished}, '${category}')">
                        ${isPublished 
                            ? `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                            : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                        }
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn btn-save" title="Enregistrer" onclick="saveCanvaArticle('${tableName}', '${id}')">
                        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>
                    <button class="vafm-tb-btn btn-delete" title="Supprimer" onclick="deleteItem('${tableName}', '${id}'); closeArticleView();">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    const mainContent = document.getElementById('content');
    if (mainContent) mainContent.style.display = 'none';
    
    articleContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (isAdmin) {
        initCanvaInteractions();
    }

    history.pushState({ page: 'article', category, id }, title, `?article=${category}&id=${id}`);
}

/* --------------------------------------------------------------------------
   2. SYSTÈME DRAG & DROP "LAXISTE" ET MAGNÉTIQUE
   -------------------------------------------------------------------------- */
function formatContentToCanvaBlocks(htmlContent) {
    if (!htmlContent) return '<div class="canva-block"><p>Écrivez votre texte ici...</p></div>';
    
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    
    let result = '';
    temp.childNodes.forEach(node => {
        if (node.nodeType === 1) {
            const outer = node.outerHTML;
            if (node.classList.contains('canva-block')) {
                result += outer;
            } else {
                result += `<div class="canva-block">${outer}</div>`;
            }
        } else if (node.nodeType === 3 && node.textContent.trim() !== '') {
            result += `<div class="canva-block"><p>${node.textContent}</p></div>`;
        }
    });

    return result || `<div class="canva-block"><p>${htmlContent}</p></div>`;
}

function initCanvaInteractions() {
    const contentArea = document.getElementById('canva-doc-content');
    if (!contentArea) return;

    let draggedBlock = null;

    let dropIndicator = contentArea.querySelector('.canva-drop-indicator');
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'canva-drop-indicator';
        dropIndicator.style.display = 'none';
        contentArea.appendChild(dropIndicator);
    }

    function makeBlockInteractive(block) {
        if (block.dataset.interactive === "true") return;
        block.dataset.interactive = "true";
        block.setAttribute('draggable', 'true');

        block.addEventListener('click', (e) => {
            e.stopPropagation();
            contentArea.querySelectorAll('.canva-block').forEach(b => {
                b.classList.remove('selected');
                if (!b.contains(e.target)) {
                    b.classList.remove('editing');
                    b.removeAttribute('contenteditable');
                }
            });

            block.classList.add('selected');
            activeBlock = block;
        });

        block.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            block.classList.add('editing');
            block.setAttribute('contenteditable', 'true');
            block.focus();
        });

        block.addEventListener('dragstart', (e) => {
            draggedBlock = block;
            block.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });

        block.addEventListener('dragend', () => {
            draggedBlock = null;
            block.classList.remove('dragging');
            dropIndicator.style.display = 'none';
        });
    }

    contentArea.querySelectorAll('.canva-block').forEach(makeBlockInteractive);

    contentArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (!draggedBlock) return;

        const blocks = Array.from(contentArea.querySelectorAll('.canva-block:not(.dragging)'));
        if (blocks.length === 0) return;

        let closestTarget = null;
        let insertPosition = 'after';
        let minDistance = Infinity;

        blocks.forEach(child => {
            const box = child.getBoundingClientRect();
            const childMiddleY = box.top + (box.height / 2);
            const distance = e.clientY - childMiddleY;

            if (Math.abs(distance) < minDistance) {
                minDistance = Math.abs(distance);
                closestTarget = child;
                insertPosition = distance < 0 ? 'before' : 'after';
            }
        });

        if (closestTarget) {
            dropIndicator.style.display = 'block';
            if (insertPosition === 'before') {
                closestTarget.parentNode.insertBefore(dropIndicator, closestTarget);
            } else {
                closestTarget.parentNode.insertBefore(dropIndicator, closestTarget.nextSibling);
            }
        }
    });

    contentArea.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedBlock && dropIndicator.style.display !== 'none') {
            dropIndicator.parentNode.insertBefore(draggedBlock, dropIndicator);
            dropIndicator.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.canva-block') && !e.target.closest('.vafm-player-toolbar') && !e.target.closest('#canva-doc-title')) {
            contentArea.querySelectorAll('.canva-block').forEach(b => {
                b.classList.remove('selected', 'editing');
                b.removeAttribute('contenteditable');
            });
            activeBlock = null;
        }
    });
}

function setBlockPosition(position) {
    if (!activeBlock) {
        alert("Cliquez d'abord sur un bloc ou une image !");
        return;
    }

    activeBlock.classList.remove('img-left', 'img-right', 'img-full');

    if (position === 'left') {
        activeBlock.classList.add('img-left');
    } else if (position === 'right') {
        activeBlock.classList.add('img-right');
    } else {
        activeBlock.classList.add('img-full');
    }
}

/* --------------------------------------------------------------------------
   3. OUTILS ET LIENS
   -------------------------------------------------------------------------- */
function applyFormat(command) {
    document.execCommand(command, false, null);
}

function addLinkToSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        alert("Surlignez d'abord le texte !");
        return;
    }

    const url = prompt("Écrivez le lien (URL avec http/https) :");
    if (url) {
        let formattedUrl = url.trim();
        if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            formattedUrl = 'https://' + formattedUrl;
        }

        document.execCommand('createLink', false, formattedUrl);

        const links = document.querySelectorAll('#canva-doc-content a');
        links.forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
    }
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
   4. AJOUT DE BLOCS ET SAUVEGARDE
   -------------------------------------------------------------------------- */
function addCanvaBlock(type = 'p') {
    const contentBox = document.getElementById('canva-doc-content');
    if (!contentBox) return;

    const block = document.createElement('div');
    block.className = 'canva-block';

    let inner;
    if (type === 'h2') {
        inner = document.createElement('h2');
        inner.innerText = "Nouveau titre...";
        inner.style.fontSize = "1.5rem";
        inner.style.marginTop = "20px";
    } else if (type === 'quote') {
        inner = document.createElement('blockquote');
        inner.className = 'canva-quote';
        inner.innerText = "Citation ou texte en évidence...";
    } else {
        inner = document.createElement('p');
        inner.innerText = "Nouveau paragraphe... Cliquez pour écrire.";
    }

    block.appendChild(inner);
    contentBox.appendChild(block);
    initCanvaInteractions();
}

function handleCanvaImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const contentBox = document.getElementById('canva-doc-content');
        if (!contentBox) return;

        // Si un bloc image est déjà sélectionné, on met à jour son image au lieu de recréer un bloc
        if (activeBlock && activeBlock.querySelector('img')) {
            const imgEl = activeBlock.querySelector('img');
            imgEl.src = e.target.result;
        } else {
            // Sinon on crée UN SEUL nouveau bloc d'image
            const block = document.createElement('div');
            block.className = 'canva-block img-full';
            block.innerHTML = `<img src="${e.target.result}" alt="Image téléchargée">`;
            
            // Si l'indicateur rouge de drop est visible, on insère là où est l'indicateur
            const dropInd = contentBox.querySelector('.canva-drop-indicator');
            if (dropInd && dropInd.style.display !== 'none') {
                contentBox.insertBefore(block, dropInd);
            } else {
                contentBox.appendChild(block);
            }
        }

        // On réinitialise l'input pour pouvoir ré-uploader la même image si besoin
        event.target.value = '';

        // Réattache les événements drag/click sur le nouveau bloc
        initCanvaInteractions();
    };
    
    reader.readAsDataURL(file);
}

async function saveCanvaArticle(tableName, id) {
    try {
        const titleElement = document.getElementById('canva-doc-title');
        const title = titleElement ? titleElement.innerText.trim() : '';

        const contentBox = document.getElementById('canva-doc-content');
        if (!contentBox) {
            alert("Erreur : zone de contenu introuvable.");
            return;
        }

        // 1. Nettoyage propre du HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentBox.innerHTML;

        const dropInd = tempDiv.querySelector('.canva-drop-indicator');
        if (dropInd) dropInd.remove();

        tempDiv.querySelectorAll('.canva-block').forEach(b => {
            b.classList.remove('selected', 'editing', 'dragging');
            b.removeAttribute('contenteditable');
            b.removeAttribute('draggable');
            b.removeAttribute('data-interactive');
        });

        const content = tempDiv.innerHTML.trim();

        // 2. Gestion de l'image
        const fileInput = document.getElementById('canva-file-input');
        let imageUrl = null;

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('uploads')
                .upload(fileName, file);

            if (!uploadError) {
                const { data: publicUrlData } = supabaseClient.storage
                    .from('uploads')
                    .getPublicUrl(fileName);
                imageUrl = publicUrlData.publicUrl;
            }
        } else {
            const firstImg = contentBox.querySelector('img');
            if (firstImg && !firstImg.src.startsWith('data:')) {
                imageUrl = firstImg.src;
            }
        }

        // 3. Normalisation exacte de la table et des champs
        // On s'assure que 'news' redirige bien vers 'actus'
        const realTable = (tableName === 'news' || tableName === 'actus') ? 'actus' : tableName;

        let titleCol = 'titre';
        let textCol = 'contenu';
        let imgCol = 'imageUrl';

        if (realTable === 'animateurs') {
            titleCol = 'nom';
            textCol = 'description';
            imgCol = 'image_url';
        } else if (realTable === 'emissions') {
            titleCol = 'titre';
            textCol = 'description';
            imgCol = 'image_url';
        } else if (realTable === 'hero') {
            titleCol = 'titre';
            textCol = 'texte';
            imgCol = 'imageUrl';
        } else if (realTable === 'actus') {
            titleCol = 'titre';
            textCol = 'texte';    // <-- CHANGÉ : On utilise 'texte' (type text) et PAS 'contenu' (type json)
            imgCol = 'imageUrl';
        }

        const payload = {
            [titleCol]: title,
            [textCol]: content
        };

        if (imageUrl) {
            payload[imgCol] = imageUrl;
        }

        console.log(`Envoi du payload Supabase vers la table "${realTable}" :`, payload);

        // 4. Update Supabase
        const { error } = await supabaseClient
            .from(realTable)
            .update(payload)
            .eq('id', id);

        if (error) {
            console.error("Erreur Supabase Update:", error);
            alert(`Erreur de sauvegarde (Table: ${realTable}) : ` + error.message);
        } else {
            alert("✨ Actu enregistrée avec succès !");
            if (typeof fetchAllFromSupabase === 'function') {
                await fetchAllFromSupabase();
            }
        }
    } catch (err) {
        console.error("Erreur inattendue durant la sauvegarde:", err);
        alert("Une erreur est survenue : " + err.message);
    }
}

/* --------------------------------------------------------------------------
   5. CHARGEMENT AUTOMATIQUE VIA URL
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