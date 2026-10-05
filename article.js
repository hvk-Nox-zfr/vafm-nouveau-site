/* ==========================================================================
   GESTION DES ARTICLES ET ÉDITION (CANVA STUDIO ADVANCED + ADSENSE & SIZING)
   ========================================================================== */

let currentArticleData = null;
let currentCategory = null;
let currentId = null;
let activeBlock = null;

// Config Google AdSense
const ADSENSE_CONFIG = {
    client: 'ca-pub-8497430727637938',
    slot: '5575140703'
};

// Libellés affichés pour le badge de catégorie (au lieu d'un texte fixe "news")
const CATEGORY_LABELS = {
    hero: 'À la une',
    news: 'Actu',
    actus: 'Actu'
};

/* --------------------------------------------------------------------------
   ÉTAT DU STUDIO : historique (annuler/rétablir), sauvegarde, brouillon local
   -------------------------------------------------------------------------- */
let hasUnsavedChanges = false;
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 40;
let autosaveInterval = null;
let _undoDebounceTimer = null;
let _isSavingArticle = false;

let _miniBlockToolbarEl = null;
let _miniBlockToolbarTarget = null;
let _miniToolbarHideTimer = null;

/* --------------------------------------------------------------------------
   UTILITAIRES COMPLÉMENTAIRES
   -------------------------------------------------------------------------- */
function calculateReadTime(text) {
    if (!text) return 1;
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 0).length;
    const readingSpeedWPM = 200; // Vitesse moyenne : 200 mots/min
    return Math.max(1, Math.ceil(words / readingSpeedWPM));
}

// Nettoyage propre des extraits de texte (SEO / Social)
function generateCleanSnippet(rawHtml, maxLength = 160) {
    if (!rawHtml) return "";
    let text = rawHtml
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length <= maxLength) return text;
    
    // Découpe au dernier mot complet
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

// Helper universel de mise à jour/création des balises du <head>
function updateHeadTag(tagName, attrKey, attrVal, contentKey, contentVal) {
    let el = document.querySelector(`${tagName}[${attrKey}="${attrVal}"]`);
    if (!el) {
        el = document.createElement(tagName);
        el.setAttribute(attrKey, attrVal);
        document.head.appendChild(el);
    }
    el.setAttribute(contentKey, contentVal);
}

/* --------------------------------------------------------------------------
   NOTIFICATIONS (TOASTS) & FENÊTRES MODALES — remplace alert()/prompt()
   -------------------------------------------------------------------------- */
function safeScrollIntoView(el) {
    try {
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    } catch (e) {
        // Environnement sans support complet du scroll fluide : on ignore, ce n'est pas bloquant.
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(message, type = 'info', options = {}) {
    let container = document.getElementById('vafm-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'vafm-toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;max-width:360px;pointer-events:none;';
        document.body.appendChild(container);
    }

    const colors = {
        success: '#34c759', error: '#ff3b30', warning: '#ff9500', info: '#64b5f6'
    };
    const icon = { success: '✓', error: '⚠', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';

    const toast = document.createElement('div');
    toast.className = `vafm-toast vafm-toast-${type}`;
    toast.style.cssText = `display:flex;align-items:center;gap:10px;background:#18181c;color:#ffffff;padding:12px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.35);border:1px solid ${colors[type] || colors.info};font-size:0.88rem;font-weight:600;pointer-events:auto;`;

    const iconEl = document.createElement('span');
    iconEl.style.cssText = `font-size:1rem;flex-shrink:0;color:${colors[type] || colors.info};`;
    iconEl.textContent = icon;

    const msgEl = document.createElement('span');
    msgEl.style.cssText = 'flex:1;line-height:1.35;white-space:pre-line;';
    msgEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);

    if (options.actionLabel && typeof options.onAction === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vafm-toast-action';
        btn.style.cssText = 'background:rgba(255,255,255,0.15);border:none;color:#ffffff;padding:6px 10px;border-radius:6px;font-size:0.78rem;font-weight:700;cursor:pointer;flex-shrink:0;';
        btn.textContent = options.actionLabel;
        btn.addEventListener('click', () => {
            options.onAction();
            toast.remove();
        });
        toast.appendChild(btn);
    }

    container.appendChild(toast);

    const duration = options.duration || (type === 'error' ? 6000 : 3500);
    setTimeout(() => toast.remove(), duration);
}

// Styles critiques injectés directement en ligne (style="...") plutôt que via
// des classes CSS externes : ces fenêtres doivent rester utilisables même si
// article.css n'a pas (encore) été rechargé par le navigateur (cache, CDN...).
// Les classes restent posées en plus, pour qu'un CSS à jour puisse les enjoliver.
const VAFM_OVERLAY_STYLE = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:20px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;';
const VAFM_BOX_STYLE = 'background:#ffffff;border-radius:14px;padding:24px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.3);box-sizing:border-box;';
const VAFM_BTN_BASE = 'padding:9px 16px;border-radius:8px;border:none;font-weight:700;font-size:0.88rem;cursor:pointer;';

function vafmPrompt({ title = '', label = '', placeholder = '', defaultValue = '' } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'vafm-modal-overlay';
        overlay.style.cssText = VAFM_OVERLAY_STYLE;

        const box = document.createElement('div');
        box.className = 'vafm-modal';
        box.style.cssText = VAFM_BOX_STYLE;

        const h3 = document.createElement('h3');
        h3.style.cssText = 'margin:0 0 6px;font-size:1.1rem;color:#111;';
        h3.textContent = title;
        box.appendChild(h3);

        if (label) {
            const labelEl = document.createElement('label');
            labelEl.style.cssText = 'display:block;font-size:0.8rem;color:#777;margin-bottom:10px;';
            labelEl.textContent = label;
            box.appendChild(labelEl);
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'vafm-modal-input';
        input.placeholder = placeholder;
        input.value = defaultValue;
        input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #ddd;font-size:0.95rem;margin-bottom:6px;';
        box.appendChild(input);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.style.cssText = VAFM_BTN_BASE + 'background:#f0f0f5;color:#333;';
        cancelBtn.textContent = 'Annuler';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.style.cssText = VAFM_BTN_BASE + 'background:#E50914;color:#ffffff;';
        confirmBtn.textContent = 'Valider';

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        setTimeout(() => { input.focus(); input.select(); }, 0);

        function cleanup(result) {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
            resolve(result);
        }

        function escHandler(e) {
            if (e.key === 'Escape') cleanup(null);
        }

        cancelBtn.addEventListener('click', () => cleanup(null));
        confirmBtn.addEventListener('click', () => cleanup(input.value.trim()));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value.trim()); }
            if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
        });
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(null); });
        document.addEventListener('keydown', escHandler);
    });
}

function vafmConfirm(message, { confirmLabel = 'Confirmer', danger = true } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'vafm-modal-overlay';
        overlay.style.cssText = VAFM_OVERLAY_STYLE;

        const box = document.createElement('div');
        box.className = 'vafm-modal vafm-modal-confirm-box';
        box.style.cssText = VAFM_BOX_STYLE;

        const p = document.createElement('p');
        p.style.cssText = 'margin:0 0 4px;font-size:0.95rem;color:#333;line-height:1.5;';
        p.textContent = message;
        box.appendChild(p);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.style.cssText = VAFM_BTN_BASE + 'background:#f0f0f5;color:#333;';
        cancelBtn.textContent = 'Annuler';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.style.cssText = VAFM_BTN_BASE + `background:${danger ? '#ff3b30' : '#E50914'};color:#ffffff;`;
        confirmBtn.textContent = confirmLabel;

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        function cleanup(result) {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
            resolve(result);
        }

        function escHandler(e) {
            if (e.key === 'Escape') cleanup(false);
        }

        cancelBtn.addEventListener('click', () => cleanup(false));
        confirmBtn.addEventListener('click', () => cleanup(true));
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(false); });
        document.addEventListener('keydown', escHandler);
    });
}

/* --------------------------------------------------------------------------
   ASSISTANT IA GROQ (VIA VERCEL SERVERLESS FUNCTION)
   -------------------------------------------------------------------------- */
async function runAICorrection() {
    const targetEl = (typeof activeBlock !== 'undefined' && activeBlock) 
        ? activeBlock 
        : document.getElementById('canva-doc-content');

    if (!targetEl) {
        showToast("Aucun contenu à corriger.", 'error');
        return;
    }

    const originalHTML = targetEl.innerHTML.trim();
    if (!originalHTML) {
        showToast("Le bloc ou l'article est vide.", 'error');
        return;
    }

    const btnIA = document.getElementById('btn-ai-correct');
    if (btnIA) {
        btnIA.disabled = true;
        btnIA.classList.add('is-loading');
    }

    try {
        const response = await fetch("/api/correct", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ html: originalHTML })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Erreur HTTP ${response.status}`);
        }

        let correctedContent = data.choices?.[0]?.message?.content;

        if (correctedContent) {
            correctedContent = correctedContent
                .replace(/^```(?:html)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();

            targetEl.innerHTML = correctedContent;
            pushUndoState();
            if (typeof updateLiveStats === 'function') updateLiveStats();
            showToast("✨ Correction appliquée. (Ctrl+Z pour annuler)", 'success');
        } else {
            throw new Error("Aucune réponse valide reçue de l'IA.");
        }
    } catch (err) {
        console.error("[VAFM IA] Erreur :", err);
        showToast("Erreur lors de la correction : " + err.message, 'error');
    } finally {
        if (btnIA) {
            btnIA.disabled = false;
            btnIA.classList.remove('is-loading');
        }
    }
}

/* ==========================================================================
   HELPER DE RENDU SÉCURISÉ DU CONTENU
   ========================================================================== */
function safeRenderCanvaContent(rawText, isAdmin) {
    if (!rawText) {
        return `<div class="canva-block p" ${isAdmin ? 'contenteditable="true"' : ''}><p>Aucun contenu pour cet article.</p></div>`;
    }

    // 1. Si ce n'est pas un admin, on remplace TOUS les placeholders AdSense par le code ins AdSense
    let processedText = rawText;
    if (!isAdmin) {
        const adHtml = `
            <div class="canva-block img-full size-full adsense-rendered-block">
                <ins class="adsbygoogle"
                    style="display:block; text-align:center;"
                    data-ad-layout="in-article"
                    data-ad-format="fluid"
                    data-ad-client="${ADSENSE_CONFIG.client}"
                    data-ad-slot="${ADSENSE_CONFIG.slot}"></ins>
            </div>`;
        
        // Remplace les blocs placeholder générés par le studio
        processedText = processedText.replace(/<div class="vafm-ad-placeholder">[\s\S]*?<\/div>/gi, adHtml);
        processedText = processedText.replace(/<div class="canva-block[^"]*">\s*<div class="vafm-ad-placeholder">[\s\S]*?<\/div>\s*<\/div>/gi, adHtml);
    }

    if (typeof formatContentToCanvaBlocks === 'function') {
        try {
            const html = formatContentToCanvaBlocks(processedText, isAdmin);
            if (html && html.trim().length > 0) return html;
        } catch (e) {
            console.warn("[VAFM] Échec de formatContentToCanvaBlocks, bascule sur le rendu HTML standard :", e);
        }
    }

    if (processedText.includes('<p>') || processedText.includes('<div') || processedText.includes('<h')) {
        return `<div class="canva-block p" ${isAdmin ? 'contenteditable="true"' : ''}>${processedText}</div>`;
    }

    return processedText.split(/\n\s*\n/).map(p => {
        const clean = p.trim();
        if (!clean) return '';
        return `
            <div class="canva-block p" style="margin-bottom: 1.2rem; line-height: 1.7; font-size: 1.1rem; color: #222;" ${isAdmin ? 'contenteditable="true"' : ''}>
                <p style="margin: 0;">${clean.replace(/\n/g, '<br>')}</p>
            </div>
        `;
    }).join('');
}

/* ==========================================================================
   OUVERTURE ET INJECTION DE L'ARTICLE
   ========================================================================== */
async function openArticleView(category, id) {
    if (category === 'shows' || category === 'emissions' || category === 'team' || category === 'animateurs') {
        console.warn(`[VAFM] Les éléments de type '${category}' ne s'ouvrent pas dans une page article.`);
        return;
    }

    const collectionMap = { hero: 'hero', news: 'actus', actus: 'actus' };
    const collectionName = collectionMap[category] || 'actus';
    const categoryLabel = CATEGORY_LABELS[category] || category;

    let data = null;
    try {
        const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}?expand=author,user,user_id`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
    } catch (err) {
        console.error("Erreur de chargement PocketBase:", err);
        showToast("Impossible de charger cet article.", 'error');
        return;
    }

    currentArticleData = data;
    currentCategory = category;
    currentId = id;

    const title = data.titre || data.title || data.nom || 'Sans titre';
    const rawText = data.texte || data.contenu || data.description || data.text || '';

    const isAdmin = Boolean(
        (window.appState && window.appState.editMode) || 
        document.body.classList.contains('admin-logged-in') || 
        document.body.classList.contains('edit-mode-active')
    );

    // ==========================================================================
    // INJECTION DES DONNÉES STRUCTURÉES (SEO GOOGLE NEWS, CANONICAL & SOCIAL)
    // ==========================================================================
    const rawImg = data.image || data.img;
    let articleImageUrl = "https://vafmlaradio.fr/LOGO-VAFM.png";

    if (rawImg) {
        articleImageUrl = typeof getPocketBaseImageUrl === 'function' 
            ? getPocketBaseImageUrl(collectionName, id, rawImg, '1200x630') 
            : (rawImg.startsWith('http') ? rawImg : `https://vafmlaradio.fr${rawImg}`);
    }

    const cleanSlug = title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const cleanUrlPath = `/article/${category}/${id}-${cleanSlug}`;
    const fullArticleUrl = `https://vafmlaradio.fr${cleanUrlPath}`;
    const plainTextSnippet = generateCleanSnippet(rawText, 160) || "Découvrez cet article sur VAFM.";

    // 1. Titre onglet & URL Canonique
    document.title = `${title} – VAFM`;
    updateHeadTag('link', 'rel', 'canonical', 'href', fullArticleUrl);

    // 2. Méta description standard
    updateHeadTag('meta', 'name', 'description', 'content', plainTextSnippet);

    // 3. Open Graph (Facebook / WhatsApp / LinkedIn)
    updateHeadTag('meta', 'property', 'og:type', 'content', 'article');
    updateHeadTag('meta', 'property', 'og:title', 'content', title);
    updateHeadTag('meta', 'property', 'og:description', 'content', plainTextSnippet);
    updateHeadTag('meta', 'property', 'og:image', 'content', articleImageUrl);
    updateHeadTag('meta', 'property', 'og:url', 'content', fullArticleUrl);

    // 4. Twitter Cards
    updateHeadTag('meta', 'name', 'twitter:card', 'content', 'summary_large_image');
    updateHeadTag('meta', 'name', 'twitter:title', 'content', title);
    updateHeadTag('meta', 'name', 'twitter:description', 'content', plainTextSnippet);
    updateHeadTag('meta', 'name', 'twitter:image', 'content', articleImageUrl);

    // 5. Schema.org JSON-LD
    const publishedIsoDate = new Date(data.published_at || data.created).toISOString();
    const modifiedIsoDate = new Date(data.updated || data.created).toISOString();

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": fullArticleUrl
      },
      "headline": title,
      "image": [articleImageUrl],
      "datePublished": publishedIsoDate,
      "dateModified": modifiedIsoDate,
      "author": [{
          "@type": "Organization",
          "name": "VAFM - La Radio qu'il vous faut",
          "url": "https://vafmlaradio.fr"
      }],
      "publisher": {
        "@type": "Organization",
        "name": "VAFM - La Radio qu'il vous faut",
        "url": "https://vafmlaradio.fr",
        "logo": {
          "@type": "ImageObject",
          "url": "https://vafmlaradio.fr/LOGO-VAFM.png"
        }
      },
      "description": plainTextSnippet
    };

    let script = document.getElementById('news-schema');
    if (!script) {
      script = document.createElement('script');
      script.id = 'news-schema';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
    // ==========================================================================

    const isPublished = Boolean(data.is_published);
    
    let authorName = data.name || 
                     data.author_name || 
                     data.expand?.author?.name || 
                     data.expand?.user?.name || 
                     data.expand?.user_id?.name;

    if (!authorName || authorName.trim() === '') {
        authorName = 'Équipe VAFM';
    }

    if (authorName && authorName !== 'Équipe VAFM') {
        authorName = authorName.charAt(0).toUpperCase() + authorName.slice(1);
    }

    let publicationText = "Non publié (Brouillon)";
    const dateSource = data.published_at || data.created || data.created_at;

    if (dateSource && isPublished) {
        const dateObj = new Date(dateSource);
        publicationText = `Publié le ${dateObj.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        })}`;
    }

    const readTimeMinutes = typeof calculateReadTime === 'function' ? calculateReadTime(rawText) : 3;

    const articleContainer = document.getElementById('article-modal');
    if (!articleContainer) {
        console.error("Élément #article-modal introuvable dans le DOM !");
        return;
    }

    articleContainer.innerHTML = `
       <style>
    ::selection { background-color: #E50914 !important; color: #ffffff !important; }
    ::-moz-selection { background-color: #E50914 !important; color: #ffffff !important; }

    #article-modal {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        width: 100% !important;
        min-height: calc(100vh - 80px) !important;
        background-color: #f4f4f7 !important;
        z-index: 10 !important;
        padding-top: 40px !important;
        padding-bottom: 140px !important;
        box-sizing: border-box !important;
    }

    .vafm-player-toolbar {
        position: fixed !important;
        bottom: 110px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: #18181c !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-radius: 12px !important;
        padding: 6px 12px !important;
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
        z-index: 9999999 !important;
        flex-wrap: nowrap !important;
        overflow: visible !important;
        max-width: 95vw !important;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6) !important;
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

    .vafm-tb-btn.btn-ai {
        background: rgba(142, 68, 173, 0.2) !important;
        color: #d288f8 !important;
        border-color: rgba(155, 89, 182, 0.4) !important;
    }

    .vafm-tb-btn.btn-ai:hover {
        background: #8e44ad !important;
        color: #ffffff !important;
        border-color: #9b59b6 !important;
    }

    .vafm-dynamic-tooltip {
        position: fixed;
        background: #000000;
        color: #ffffff;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 5px 10px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        z-index: 10000000 !important;
        transform: translateX(-50%) translateY(-100%);
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .vafm-dynamic-tooltip.visible { opacity: 1; }

    .vafm-tb-btn.status-published { color: #34c759 !important; }
    .vafm-tb-btn.status-draft { color: #ff9500 !important; }

    .vafm-tb-btn.btn-save:hover { background: #34c759 !important; color: #ffffff !important; border-color: #34c759 !important; }
    .vafm-tb-btn.btn-delete:hover { background: #ff3b30 !important; color: #ffffff !important; border-color: #ff3b30 !important; }

    .canva-layout { width: 100% !important; display: flex !important; flex-direction: column !important; }
    .canva-workspace { width: 100% !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; background-color: #f4f4f7 !important; display: flex !important; justify-content: center !important; }
    
    .canva-document { 
        width: 100% !important; 
        max-width: 850px !important; 
        margin: 100px 0 auto !important; 
        background: #ffffff !important; 
        padding: 50px !important; 
        box-sizing: border-box !important; 
        border: 1px solid #e0e0e8 !important; 
        border-radius: 12px !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06) !important; 
        position: relative !important;
        display: block !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
    }

    .canva-document a { color: #E50914 !important; text-decoration: underline !important; font-weight: 600; cursor: pointer; }

    .canva-document::after, .article-content::after, #canva-doc-content::after {
        content: "";
        display: table;
        clear: both;
    }

    .canva-header-fixed {
        position: static !important;
        width: 100% !important;
        margin-bottom: 30px !important;
        user-select: none;
        display: block !important;
    }

    .article-meta-details {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 6px;
        color: #8e8e93;
        font-size: 0.85rem;
    }

    .article-read-time {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
        color: #666;
    }

    .article-author-info {
        margin-top: 4px;
        font-weight: 600;
        color: #e50914;
    }

    .canva-admin-active .canva-block {
        position: relative;
        margin-bottom: 12px;
        padding: 8px;
        border: 1px dashed transparent;
        border-radius: 8px;
        cursor: grab;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
    }

    .canva-admin-active .canva-block:hover { border-color: rgba(229, 9, 20, 0.4); }
    .canva-admin-active .canva-block.selected { border: 2px solid #E50914 !important; box-shadow: 0 0 10px rgba(229, 9, 20, 0.15); }
    .canva-admin-active .canva-block.dragging { opacity: 0.35; border: 2px dashed #E50914 !important; }
    .canva-admin-active .canva-block.editing { cursor: text !important; border: 2px solid #34c759 !important; }

    .canva-drop-indicator {
        height: 4px; background-color: #E50914; border-radius: 2px; margin: 6px 0;
        box-shadow: 0 0 8px rgba(229, 9, 20, 0.8); transition: all 0.1s ease; pointer-events: none; clear: both;
    }

    .canva-block.img-left { float: left !important; margin-right: 20px !important; margin-bottom: 15px !important; clear: left; }
    .canva-block.img-right { float: right !important; margin-left: 20px !important; margin-bottom: 15px !important; clear: right; }
    .canva-block.img-center { float: none !important; margin-left: auto !important; margin-right: auto !important; margin-top: 20px !important; margin-bottom: 20px !important; clear: both; }
    .canva-block.img-full { float: none !important; width: 100% !important; margin: 20px 0 !important; clear: both; }

    .canva-block.size-sm { width: 35% !important; min-width: 250px !important; }
    .canva-block.size-md { width: 50% !important; min-width: 300px !important; }
    .canva-block.size-lg { width: 75% !important; }
    .canva-block.size-full { width: 100% !important; }

    .canva-block img { width: 100%; border-radius: 8px; display: block; cursor: zoom-in; }
    blockquote.canva-quote { border-left: 4px solid #E50914; padding-left: 16px; margin: 20px 0; font-style: italic; color: #555; }

    @media screen and (max-width: 768px) {
        .canva-block.img-left,
        .canva-block.img-right {
            float: none !important;
            margin: 20px auto !important;
        }
        .canva-block.size-sm { width: 75% !important; }
        .canva-block.size-md { width: 90% !important; }
        .canva-block.size-lg,
        .canva-block.size-full { width: 100% !important; }
    }

    .vafm-image-lightbox-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        padding: 24px;
        box-sizing: border-box;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease;
    }

    .vafm-image-lightbox-overlay.active {
        opacity: 1;
        visibility: visible;
    }

    .vafm-image-lightbox-overlay img {
        max-width: 100%;
        max-height: 100%;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        cursor: zoom-out;
    }

    .vafm-image-lightbox-close {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        border: none;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease;
    }

    .vafm-image-lightbox-close:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .vafm-ad-placeholder {
        background: #f8f9fa; border: 2px dashed #E50914; border-radius: 8px;
        padding: 15px; text-align: center; color: #555; font-weight: 600; font-size: 0.85rem;
        user-select: none;
    }
</style>

        <div id="vafm-reading-progress" class="vafm-reading-progress"><div id="vafm-reading-progress-fill" class="vafm-reading-progress-fill"></div></div>
        <div class="canva-layout ${isAdmin ? 'canva-admin-active' : ''}">
            <main class="canva-workspace">
                <article class="canva-document">
                    <header class="canva-header-fixed">
                        <span class="article-category-badge" style="display:inline-block; padding:4px 12px; background:#f0f0f5; border-radius:20px; font-weight:700; font-size:0.75rem; text-transform:uppercase; margin-bottom:15px;">${escapeHtml(categoryLabel)}</span>
                        <h1 class="article-title" id="canva-doc-title" ${isAdmin ? 'contenteditable="true" oninput="scheduleUndoSnapshot()"' : ''} style="font-size: 2.5rem; font-weight: 800; margin-bottom: 10px; outline: none; word-break: break-word;">${title}</h1>
                        <div class="article-meta">
                            <div class="article-meta-details">
                                <span class="article-date">${publicationText}</span>
                                <span>•</span>
                                <span class="article-read-time">⏱️ ${readTimeMinutes} min de lecture</span>
                            </div>
                            ${authorName ? `<div class="article-author-info">Par <span>${authorName}</span></div>` : ''}
                        </div>
                    </header>

                    <div class="article-content" id="canva-doc-content">
                        ${safeRenderCanvaContent(rawText, isAdmin)}
                    </div>

                    ${!isAdmin ? '<div class="vafm-related-articles" id="vafm-related-articles" style="display:none;"></div>' : ''}
                </article>
            </main>

            ${isAdmin ? `
                <div class="vafm-player-toolbar">
                    <span class="vafm-tb-label" id="vafm-live-stats" title="0 mot · 1 min">Studio</span>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn btn-ai" id="btn-ai-correct" data-label="Correction IA & Orthographe" onclick="runAICorrection()">
                        <svg viewBox="0 0 24 24"><path d="M12 2l2.4 5.2 5.6.8-4 4.1 1 5.6-5-2.8-5 2.8 1-5.6-4-4.1 5.6-.8z"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-label="Annuler (Ctrl+Z)" onclick="applyUndo()">
                        <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Rétablir (Ctrl+Maj+Z)" onclick="applyRedo()">
                        <svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <!-- Boutons avec protection de la sélection (onmousedown) -->
                    <button class="vafm-tb-btn" data-label="Gras (Ctrl+B)" onmousedown="event.preventDefault()" onclick="applyFormat('bold')">
                        <svg viewBox="0 0 24 24"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Italique (Ctrl+I)" onmousedown="event.preventDefault()" onclick="applyFormat('italic')">
                        <svg viewBox="0 0 24 24"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Souligné (Ctrl+U)" onmousedown="event.preventDefault()" onclick="applyFormat('underline')">
                        <svg viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Insérer un lien" onmousedown="event.preventDefault()" onclick="addLinkToSelection()">
                        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-label="Ajouter Paragraphe" onclick="addCanvaBlock('p')">
                        <svg viewBox="0 0 24 24"><path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Ajouter Titre" onclick="addCanvaBlock('h2')">
                        <svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h10"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Citation" onclick="addCanvaBlock('quote')">
                        <svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Ajouter une Image" onclick="document.getElementById('canva-file-input').click()">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Pub AdSense" onclick="addCanvaBlock('ad')">
                        <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h10"/><text x="6" y="11" font-size="6" font-weight="bold" fill="currentColor">ADS</text></svg>
                    </button>
                    <input type="file" id="canva-file-input" style="display:none;" accept="image/*" onchange="handleCanvaImageUpload(event)">
                    <button class="vafm-tb-btn" data-label="Insérer une vidéo (YouTube / Vimeo)" onclick="insertVideoBlock()">
                        <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 15 12 10 15 10 9"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-label="Aligner à Gauche" onclick="setBlockPosition('left')">
                        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1"/><line x1="15" y1="6" x2="21" y2="6"/><line x1="15" y1="10" x2="21" y2="10"/><line x1="15" y1="14" x2="21" y2="14"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Centrer" onclick="setBlockPosition('center')">
                        <svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="10" rx="1"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </button>
                    <button class="vafm-tb-btn" data-label="Aligner à Droite" onclick="setBlockPosition('right')">
                        <svg viewBox="0 0 24 24"><rect x="13" y="4" width="8" height="16" rx="1"/><line x1="3" y1="6" x2="9" y2="6"/><line x1="3" y1="14" x2="9" y2="14"/></svg>
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn" data-label="Taille Petite (30%)" onclick="setBlockSize('sm')">S</button>
                    <button class="vafm-tb-btn" data-label="Taille Moyenne (50%)" onclick="setBlockSize('md')">M</button>
                    <button class="vafm-tb-btn" data-label="Taille Grande (75%)" onclick="setBlockSize('lg')">L</button>
                    <button class="vafm-tb-btn" data-label="Taille Maximale (100%)" onclick="setBlockSize('full')">XL</button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn ${isPublished ? 'status-published' : 'status-draft'}" data-label="${isPublished ? 'Passer en brouillon' : 'Publier l\'article'}" onclick="handleTogglePublishInStudio('${collectionName}', '${id}', ${isPublished}, '${category}')">
                        ${isPublished 
                            ? `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                            : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
                        }
                    </button>

                    <div class="vafm-tb-divider"></div>

                    <button class="vafm-tb-btn btn-save" id="btn-studio-save" data-label="Enregistrer (Ctrl+S)" onclick="saveCanvaArticle('${collectionName}', '${id}')">
                        <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    </button>
                    <button class="vafm-tb-btn btn-delete" data-label="Supprimer la sélection" onclick="deleteSelectedElement()">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    const mainContent = document.getElementById('content');
    const newsSpa = document.getElementById('news-page-spa');

    window._articleReturnTo = (newsSpa && newsSpa.classList.contains('active')) ? 'news' : 'home';

    if (mainContent) mainContent.style.display = 'none';
    if (newsSpa) {
        newsSpa.classList.remove('active');
        newsSpa.style.display = 'none';
    }
    
    articleContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (isAdmin) {
        // Chaque étape est isolée : si l'une échoue, les boutons du studio (déjà
        // présents dans le HTML ci-dessus) restent cliquables au lieu de tous se figer.
        try { if (typeof initCanvaInteractions === 'function') initCanvaInteractions(); } catch (e) { console.error('[VAFM] initCanvaInteractions:', e); }
        try { initDynamicTooltips(); } catch (e) { console.error('[VAFM] initDynamicTooltips:', e); }
        try { initStudioShortcuts(collectionName, id); } catch (e) { console.error('[VAFM] initStudioShortcuts:', e); }
        try { initStudioSafetyNet(collectionName, id); } catch (e) { console.error('[VAFM] initStudioSafetyNet:', e); }
    } else {
        initArticleImageLightbox();
        try { initReadingProgressBar(); } catch (e) { console.error('[VAFM] initReadingProgressBar:', e); }
        try { loadRelatedArticles(collectionName, category, id); } catch (e) { console.error('[VAFM] loadRelatedArticles:', e); }

        function initArticleAds(attempt = 0) {
    if (typeof window.adsbygoogle === 'undefined') {
        if (attempt < 20) setTimeout(() => initArticleAds(attempt + 1), 250);
        return;
    }

    const ads = document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])');
    // Bug corrigé : auparavant, CHAQUE publicité encore à largeur 0
    // reprogrammait sa propre relance via setTimeout(initArticleAds). Avec
    // plusieurs emplacements publicitaires, le nombre d'appels DOUBLAIT à
    // chaque cycle de 250ms (2 → 4 → 8 → 16... plus d'un million après
    // seulement 5 secondes), ce qui saturait le processeur — surtout en
    // environnement local où AdSense ne charge jamais de vraie publicité.
    // Une seule relance est désormais programmée par passage, quel que soit
    // le nombre de publicités encore en attente.
    let needsRetry = false;

    ads.forEach(ad => {
        if (ad.dataset.adsInitialized === 'true') return;

        // Attendre que l'élément ait une largeur réelle avant d'appeler push
        const width = ad.offsetWidth || ad.getBoundingClientRect().width;
        if (width === 0) {
            needsRetry = true;
            return;
        }

        try {
            ad.dataset.adsInitialized = 'true';
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
            delete ad.dataset.adsInitialized;
            console.error("Erreur AdSense :", error);
        }
    });

    if (needsRetry && attempt < 20) {
        setTimeout(() => initArticleAds(attempt + 1), 250);
    }
}

// Lancer après l'affichage complet du modal
requestAnimationFrame(() => {
    setTimeout(() => initArticleAds(), 300);
});
    }

    history.pushState({ page: 'article', category, id }, title, cleanUrlPath);
}

/* ==========================================================================
   POPUPS DYNAMIQUES ET RACCOURCIS CLAVIER
   ========================================================================== */
function initDynamicTooltips() {
    let tooltipEl = document.getElementById('vafm-global-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'vafm-global-tooltip';
        tooltipEl.className = 'vafm-dynamic-tooltip';
        document.body.appendChild(tooltipEl);
    }

    const buttons = document.querySelectorAll('.vafm-tb-btn[data-label]');

    buttons.forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            const label = btn.getAttribute('data-label');
            if (!label) return;

            tooltipEl.textContent = label;
            
            const rect = btn.getBoundingClientRect();
            tooltipEl.style.left = `${rect.left + (rect.width / 2)}px`;
            tooltipEl.style.top = `${rect.top - 8}px`;
            
            tooltipEl.classList.add('visible');
        });

        btn.addEventListener('mouseleave', () => {
            tooltipEl.classList.remove('visible');
        });

        btn.addEventListener('click', () => {
            tooltipEl.classList.remove('visible');
        });
    });
}

function initStudioShortcuts(collectionName, id) {
    document.removeEventListener('keydown', handleStudioKeydown);
    window._currentStudioContext = { collectionName, id };
    document.addEventListener('keydown', handleStudioKeydown);
}

function handleStudioKeydown(e) {
    if (e.key === 'Escape') {
        deselectAllBlocks();
        return;
    }

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (!isCmdOrCtrl) return;

    const key = e.key.toLowerCase();
    
    if (key === 'b') {
        e.preventDefault();
        if (typeof applyFormat === 'function') applyFormat('bold');
    } else if (key === 'i') {
        e.preventDefault();
        if (typeof applyFormat === 'function') applyFormat('italic');
    } else if (key === 'u') {
        e.preventDefault();
        if (typeof applyFormat === 'function') applyFormat('underline');
    } else if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        applyRedo();
    } else if (key === 'z') {
        e.preventDefault();
        applyUndo();
    } else if (key === 'y') {
        e.preventDefault();
        applyRedo();
    } else if (key === 's') {
        e.preventDefault();
        if (window._currentStudioContext && typeof saveCanvaArticle === 'function') {
            saveCanvaArticle(window._currentStudioContext.collectionName, window._currentStudioContext.id);
        }
    }
}

function deselectAllBlocks() {
    const contentArea = document.getElementById('canva-doc-content');
    if (!contentArea) return;
    contentArea.querySelectorAll('.canva-block').forEach(b => {
        b.classList.remove('selected', 'editing');
        b.removeAttribute('contenteditable');
        b.setAttribute('draggable', 'true');
    });
    activeBlock = null;
    if (_miniBlockToolbarEl) { _miniBlockToolbarEl.classList.remove('visible'); _miniBlockToolbarEl.style.display = 'none'; }
}

/* --------------------------------------------------------------------------
   FORMATAGE DES BLOCS ET PUBS ADSENSE
   -------------------------------------------------------------------------- */
function formatContentToCanvaBlocks(htmlContent, isAdmin = false) {
    if (!htmlContent || htmlContent.trim() === '') {
        return '<div class="canva-block"><p>Écrivez votre texte ici...</p></div>';
    }

    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;

    temp.querySelectorAll('.vafm-ad-placeholder').forEach(adNode => {
        if (isAdmin) return;

        const adContainer = document.createElement('div');
        adContainer.className = 'canva-block img-full size-full adsense-rendered-block';

        adContainer.innerHTML = `
            <ins class="adsbygoogle"
                style="display:block; text-align:center;"
                data-ad-layout="in-article"
                data-ad-format="fluid"
                data-ad-client="${ADSENSE_CONFIG.client}"
                data-ad-slot="${ADSENSE_CONFIG.slot}"></ins>
        `;

        adNode.replaceWith(adContainer);
    });

    let result = '';

    temp.childNodes.forEach(node => {
        if (node.nodeType === 1) {
            if (node.classList.contains('canva-block')) {
                result += node.outerHTML;
            } else if (node.tagName.toLowerCase() === 'img') {
                result += `<div class="canva-block img-full size-md">${node.outerHTML}</div>`;
            } else {
                result += `<div class="canva-block">${node.outerHTML}</div>`;
            }
        } else if (node.nodeType === 3 && node.textContent.trim() !== '') {
            result += `<div class="canva-block"><p>${node.textContent.trim()}</p></div>`;
        }
    });

    return result || '<div class="canva-block"><p>Écrivez votre texte ici...</p></div>';
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

        block.addEventListener('mouseenter', () => {
            if (!block.classList.contains('editing')) positionMiniBlockToolbar(block);
        });
        block.addEventListener('mouseleave', scheduleMiniToolbarHide);

        block.addEventListener('click', (e) => {
            e.stopPropagation();
            contentArea.querySelectorAll('.canva-block').forEach(b => {
                b.classList.remove('selected');
                if (!b.contains(e.target)) {
                    b.classList.remove('editing');
                    b.removeAttribute('contenteditable');
                    b.setAttribute('draggable', 'true');
                }
            });

            block.classList.add('selected');
            activeBlock = block;
            positionMiniBlockToolbar(block);
        });

        // Bug corrigé : un bloc restait "draggable" même pendant l'édition de texte,
        // ce qui transformait une sélection de texte à la souris en déplacement de bloc.
        block.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!block.querySelector('.vafm-ad-placeholder') && !block.classList.contains('video-embed')) {
                block.classList.add('editing');
                block.setAttribute('contenteditable', 'true');
                block.setAttribute('draggable', 'false');
                block.focus();
                scheduleMiniToolbarHide();
            }
        });

        block.addEventListener('blur', () => {
            if (block.classList.contains('editing')) {
                block.classList.remove('editing');
                block.removeAttribute('contenteditable');
                block.setAttribute('draggable', 'true');
                pushUndoState();
            }
        });

        block.addEventListener('input', scheduleUndoSnapshot);

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

    // Ces écouteurs ne doivent être attachés qu'une seule fois par zone de contenu,
    // sinon chaque appel (ajout de bloc, upload d'image, etc.) en empilait un nouveau.
    if (!contentArea.dataset.canvaBound) {
        contentArea.dataset.canvaBound = 'true';

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
                pushUndoState();
            }
        });
    }

    // Écouteur global de désélection : toujours retiré puis réattaché (fonction nommée)
    // pour ne jamais s'accumuler, même après la réouverture d'un autre article.
    document.removeEventListener('click', handleCanvaDocumentClick);
    document.addEventListener('click', handleCanvaDocumentClick);
}

function handleCanvaDocumentClick(e) {
    const contentArea = document.getElementById('canva-doc-content');
    if (!contentArea) return;
    if (
        !e.target.closest('.canva-block') &&
        !e.target.closest('.vafm-player-toolbar') &&
        !e.target.closest('#canva-doc-title') &&
        !e.target.closest('.vafm-modal-overlay') &&
        !e.target.closest('#vafm-block-mini-toolbar')
    ) {
        contentArea.querySelectorAll('.canva-block').forEach(b => {
            b.classList.remove('selected', 'editing');
            b.removeAttribute('contenteditable');
            b.setAttribute('draggable', 'true');
        });
        activeBlock = null;
        scheduleMiniToolbarHide();
    }
}

/* --------------------------------------------------------------------------
   MINI-BARRE D'OUTILS PAR BLOC (monter / descendre / dupliquer / alt / supprimer)
   Alternative fiable au glisser-déposer natif, qui ne fonctionne pas au toucher.
   -------------------------------------------------------------------------- */
function ensureMiniBlockToolbar() {
    if (_miniBlockToolbarEl) return _miniBlockToolbarEl;

    const bar = document.createElement('div');
    bar.id = 'vafm-block-mini-toolbar';
    bar.className = 'canva-block-mini-toolbar';
    bar.style.cssText = 'position:absolute;display:none;align-items:center;gap:3px;background:#18181c;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:4px;box-shadow:0 8px 20px rgba(0,0,0,0.35);z-index:999998;';
    const miniBtnStyle = 'width:27px;height:27px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#dddde3;border-radius:5px;cursor:pointer;font-size:0.82rem;line-height:1;';
    bar.innerHTML = `
        <button type="button" class="mini-btn mini-up" title="Monter le bloc" style="${miniBtnStyle}">↑</button>
        <button type="button" class="mini-btn mini-down" title="Descendre le bloc" style="${miniBtnStyle}">↓</button>
        <button type="button" class="mini-btn mini-dup" title="Dupliquer le bloc" style="${miniBtnStyle}">⎘</button>
        <button type="button" class="mini-btn mini-alt" title="Texte alternatif de l'image" style="${miniBtnStyle}">Alt</button>
        <button type="button" class="mini-btn mini-del" title="Supprimer le bloc" style="${miniBtnStyle}">🗑</button>
    `;
    document.body.appendChild(bar);

    bar.querySelector('.mini-up').addEventListener('click', () => { if (_miniBlockToolbarTarget) moveBlock(_miniBlockToolbarTarget, -1); });
    bar.querySelector('.mini-down').addEventListener('click', () => { if (_miniBlockToolbarTarget) moveBlock(_miniBlockToolbarTarget, 1); });
    bar.querySelector('.mini-dup').addEventListener('click', () => { if (_miniBlockToolbarTarget) duplicateBlock(_miniBlockToolbarTarget); });
    bar.querySelector('.mini-alt').addEventListener('click', () => { if (_miniBlockToolbarTarget) editBlockImageAlt(_miniBlockToolbarTarget); });
    bar.querySelector('.mini-del').addEventListener('click', () => { if (_miniBlockToolbarTarget) removeBlockWithConfirm(_miniBlockToolbarTarget); });

    bar.addEventListener('mouseenter', () => clearTimeout(_miniToolbarHideTimer));
    bar.addEventListener('mouseleave', scheduleMiniToolbarHide);

    _miniBlockToolbarEl = bar;
    return bar;
}

function positionMiniBlockToolbar(block) {
    const bar = ensureMiniBlockToolbar();
    _miniBlockToolbarTarget = block;
    clearTimeout(_miniToolbarHideTimer);

    const rect = block.getBoundingClientRect();
    bar.style.top = `${window.scrollY + rect.top - 36}px`;
    bar.style.left = `${window.scrollX + Math.max(0, rect.right - 172)}px`;

    const altBtn = bar.querySelector('.mini-alt');
    if (altBtn) altBtn.style.display = block.querySelector('img') ? 'flex' : 'none';

    bar.classList.add('visible');
    bar.style.display = 'flex';
}

function scheduleMiniToolbarHide() {
    clearTimeout(_miniToolbarHideTimer);
    _miniToolbarHideTimer = setTimeout(() => {
        if (_miniBlockToolbarEl) {
            _miniBlockToolbarEl.classList.remove('visible');
            _miniBlockToolbarEl.style.display = 'none';
        }
        _miniBlockToolbarTarget = null;
    }, 200);
}

function sanitizeRestoredContent(contentBox) {
    contentBox.querySelectorAll('.canva-block').forEach(b => {
        b.removeAttribute('data-interactive');
        b.classList.remove('selected', 'editing', 'dragging');
        b.removeAttribute('contenteditable');
        b.setAttribute('draggable', 'true');
    });
}

function moveBlock(block, direction) {
    if (!block || !block.parentNode) return;
    if (direction === -1) {
        const prev = block.previousElementSibling;
        if (!prev || !prev.classList.contains('canva-block')) return;
        block.parentNode.insertBefore(block, prev);
    } else {
        const next = block.nextElementSibling;
        if (!next || !next.classList.contains('canva-block')) return;
        block.parentNode.insertBefore(next, block);
    }
    pushUndoState();
    positionMiniBlockToolbar(block);
    safeScrollIntoView(block);
}

function duplicateBlock(block) {
    const clone = block.cloneNode(true);
    clone.classList.remove('selected', 'editing', 'dragging');
    clone.removeAttribute('contenteditable');
    clone.removeAttribute('data-interactive');
    clone.setAttribute('draggable', 'true');
    block.parentNode.insertBefore(clone, block.nextSibling);
    if (typeof initCanvaInteractions === 'function') initCanvaInteractions();
    pushUndoState();
    updateLiveStats();
    showToast('Bloc dupliqué.', 'success');
}

async function editBlockImageAlt(block) {
    const img = block.querySelector('img');
    if (!img) return;
    const value = await vafmPrompt({
        title: "Texte alternatif de l'image",
        label: "Décrit l'image pour le SEO et les lecteurs d'écran.",
        placeholder: 'Ex : Studio de la radio VAFM en direct',
        defaultValue: img.alt || ''
    });
    if (value !== null) {
        img.alt = value;
        pushUndoState();
        showToast('Texte alternatif mis à jour.', 'success');
    }
}

async function removeBlockWithConfirm(block) {
    const ok = await vafmConfirm('Supprimer définitivement ce bloc ?', { confirmLabel: 'Supprimer' });
    if (!ok) return;
    if (activeBlock === block) activeBlock = null;
    if (_miniBlockToolbarTarget === block) {
        _miniBlockToolbarTarget = null;
        if (_miniBlockToolbarEl) { _miniBlockToolbarEl.classList.remove('visible'); _miniBlockToolbarEl.style.display = 'none'; }
    }
    block.remove();
    pushUndoState();
    updateLiveStats();
    showToast('Bloc supprimé.', 'info');
}

function setBlockPosition(position) {
    if (!activeBlock) {
        showToast("Cliquez d'abord sur une image ou un encadré.", 'info');
        return;
    }

    activeBlock.classList.remove('img-left', 'img-right', 'img-center', 'img-full');

    if (position === 'left') {
        activeBlock.classList.add('img-left');
    } else if (position === 'right') {
        activeBlock.classList.add('img-right');
    } else if (position === 'center') {
        activeBlock.classList.add('img-center');
    } else {
        activeBlock.classList.add('img-full');
    }
    pushUndoState();
}

function setBlockSize(size) {
    if (!activeBlock) {
        showToast("Cliquez d'abord sur l'élément à redimensionner.", 'info');
        return;
    }

    activeBlock.classList.remove('size-sm', 'size-md', 'size-lg', 'size-full');
    activeBlock.classList.add(`size-${size}`);
    pushUndoState();
}

/* --------------------------------------------------------------------------
   OUTILS, LIENS ET SUPPRESSION
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   FORMATAGE ROBUSTE — n'utilise PAS document.execCommand(), déprécié et de
   moins en moins fiable selon les navigateurs. On manipule directement la
   sélection via l'API Range/Selection standard, qui elle ne disparaît pas.
   -------------------------------------------------------------------------- */
const VAFM_FORMAT_TAGS = { bold: 'strong', italic: 'em', underline: 'u' };

function applyFormat(command) {
    const tagName = VAFM_FORMAT_TAGS[command];
    if (!tagName) return;
    toggleInlineTag(tagName);
    scheduleUndoSnapshot();
}

function toggleInlineTag(tagName) {
    const contentBox = document.getElementById('canva-doc-content');
    const selection = window.getSelection();
    if (!contentBox || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        showToast('Sélectionnez du texte à formater.', 'info');
        return;
    }

    const range = selection.getRangeAt(0);
    if (!contentBox.contains(range.commonAncestorContainer)) {
        showToast('Sélectionnez du texte dans le contenu de l\'article.', 'info');
        return;
    }

    // Si la sélection est déjà entièrement à l'intérieur d'une balise de ce
    // type, un second clic retire le formatage au lieu d'en rajouter un.
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentElement;
    const existingTag = container ? container.closest(tagName) : null;

    if (existingTag && contentBox.contains(existingTag)) {
        const parent = existingTag.parentNode;
        while (existingTag.firstChild) parent.insertBefore(existingTag.firstChild, existingTag);
        parent.removeChild(existingTag);
        return;
    }

    const wrapper = document.createElement(tagName);
    try {
        // Cas simple : la sélection est entièrement dans un seul nœud.
        range.surroundContents(wrapper);
    } catch (e) {
        // La sélection traverse plusieurs éléments (surroundContents() refuse
        // ce cas) : on extrait le contenu sélectionné, on l'enveloppe, puis
        // on le réinsère à la même position.
        const fragment = range.extractContents();
        wrapper.appendChild(fragment);
        range.insertNode(wrapper);
    }

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    selection.addRange(newRange);
}

async function deleteSelectedElement() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const contentBox = document.getElementById('canva-doc-content');
        if (contentBox && contentBox.contains(range.commonAncestorContainer)) {
            range.deleteContents();
            pushUndoState();
            return;
        }
    }

    if (activeBlock) {
        await removeBlockWithConfirm(activeBlock);
        return;
    }

    showToast("Sélectionnez du texte ou cliquez sur un bloc à supprimer.", 'info');
}

function addLinkToSelection() {
    const selection = window.getSelection();

    // 1. Vérifier si une sélection existe
    if (!selection || selection.rangeCount === 0) {
        if (typeof showToast === 'function') showToast("Place ton curseur ou sélectionne du texte dans l'article.", 'error');
        return;
    }

    // 2. Sauvegarder la position exacte/sélection AVANT l'ouverture du prompt
    const range = selection.getRangeAt(0);

    // S'assurer qu'on est bien à l'intérieur du conteneur d'édition
    const contentBox = document.getElementById('canva-doc-content');
    if (contentBox && !contentBox.contains(range.commonAncestorContainer)) {
        if (typeof showToast === 'function') showToast("Sélectionne du texte à l'intérieur de l'article.", 'error');
        return;
    }

    // 3. Demander l'URL
    let url = prompt("Entre l'URL du lien (ex: https://exemple.com) :");
    if (!url || !url.trim()) return;

    url = url.trim();
    // Ajouter automatiquement https:// si manquant
    if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('#')) {
        url = 'https://' + url;
    }

    // 4. Redonner le focus à l'élément éditable
    let containerNode = range.commonAncestorContainer;
    if (containerNode.nodeType === Node.TEXT_NODE) {
        containerNode = containerNode.parentElement;
    }
    const editableEl = containerNode.closest('[contenteditable="true"]');
    if (editableEl) {
        editableEl.focus();
    }

    // 5. Restaurer la sélection sauvegardée
    selection.removeAllRanges();
    selection.addRange(range);

    // 6. Insérer le lien
    if (!range.collapsed) {
        // CAS A : Du texte était sélectionné -> Transformer la sélection en lien
        document.execCommand('createLink', false, url);

        // Appliquer target="_blank" sur le lien créé
        const parent = selection.anchorNode ? selection.anchorNode.parentElement : null;
        const linkEl = parent ? parent.closest('a') : null;
        if (linkEl) {
            linkEl.target = '_blank';
            linkEl.rel = 'noopener noreferrer';
        }
    } else {
        // CAS B : Simple curseur (aucun texte sélectionné) -> Créer un lien texte cliquable
        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        range.insertNode(link);

        // Placer le curseur juste après le lien créé
        range.setStartAfter(link);
        range.setEndAfter(link);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // 7. Mettre à jour l'état de l'éditeur
    if (typeof pushUndoState === 'function') pushUndoState();
    if (typeof updateLiveStats === 'function') updateLiveStats();
    if (typeof showToast === 'function') showToast("Lien inséré !", "success");
}

async function handleTogglePublishInStudio(collectionName, id, currentStatus, category) {
    const nextStatus = !currentStatus;

    try {
        const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ is_published: nextStatus })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // 🚀 PING RSS ET INDEXNOW SI L'ARTICLE PASSE EN ÉTAT PUBLIÉ
        if (nextStatus) {
            pingRSSFeed();

            if (currentArticleData) {
                const title = currentArticleData.titre || currentArticleData.title || '';
                const cleanSlug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const fullArticleUrl = `https://vafmlaradio.fr/article/${category}/${id}-${cleanSlug}`;
                pingIndexNow(fullArticleUrl);
            }
        }

        showToast(nextStatus ? '✅ Article publié.' : '📝 Article repassé en brouillon.', 'success');
        await openArticleView(category, id);
    } catch (error) {
        console.error("Erreur lors du changement de statut de publication:", error);
        showToast("Impossible de modifier le statut de publication : " + error.message, 'error');
    }
}

/* --------------------------------------------------------------------------
   ARTICLES SIMILAIRES ("À lire aussi") — lecteurs publics uniquement
   -------------------------------------------------------------------------- */
function getRelatedArticleImageUrl(collectionName, record) {
    const rawImg = record.image || record.img;
    if (!rawImg) return 'https://vafmlaradio.fr/LOGO-VAFM.png';
    return typeof getPocketBaseImageUrl === 'function'
        ? getPocketBaseImageUrl(collectionName, record.id, rawImg, '600x400')
        : (rawImg.startsWith('http') ? rawImg : `https://vafmlaradio.fr${rawImg}`);
}

async function loadRelatedArticles(collectionName, category, excludeId) {
    const container = document.getElementById('vafm-related-articles');
    if (!container) return;

    try {
        const baseUrl = typeof POCKETBASE_URL !== 'undefined' ? POCKETBASE_URL : (window.POCKETBASE_URL || '');
        const filterStr = encodeURIComponent(`is_published=true && id!='${excludeId}'`);
        const url = `${baseUrl}/api/collections/${collectionName}/records?filter=${filterStr}&sort=-created&perPage=3`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = (data.items || []).slice(0, 3);

        if (items.length === 0) {
            container.style.display = 'none';
            return;
        }

        // Styles critiques en ligne : ce bloc reste correctement présenté même
        // si article.css n'a pas (encore) été rechargé par le navigateur.
        container.innerHTML = '';
        container.style.cssText = 'margin-top:55px;padding-top:34px;border-top:1px solid #eee;';

        const titleEl = document.createElement('h2');
        titleEl.className = 'vafm-related-title';
        titleEl.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:1.4rem;font-weight:800;margin:0 0 22px;color:#111;letter-spacing:-0.01em;';
        titleEl.innerHTML = '<span style="display:inline-block;width:6px;height:24px;background:#E50914;border-radius:3px;flex-shrink:0;"></span>À lire aussi';
        container.appendChild(titleEl);

        const grid = document.createElement('div');
        grid.className = 'vafm-related-grid';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:20px;';
        container.appendChild(grid);

        items.forEach(record => {
            const rawTitle = record.titre || record.title || record.nom || 'Sans titre';
            // Troncature garantie côté JS : même si -webkit-line-clamp est
            // neutralisé par une règle externe (ex. "overflow: visible !important"
            // ailleurs sur le site), le texte ne peut plus physiquement déborder.
            const title = rawTitle.length > 85 ? rawTitle.slice(0, 82).trimEnd() + '…' : rawTitle;
            const imgUrl = getRelatedArticleImageUrl(collectionName, record);

            const card = document.createElement('div');
            card.className = 'vafm-related-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.style.cssText = 'cursor:pointer;display:flex;flex-direction:column;height:100%;border-radius:16px;overflow:hidden!important;background:#ffffff;border:1px solid #ececf2;box-shadow:0 2px 10px rgba(17,17,17,0.05);transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;';

            const imgDiv = document.createElement('div');
            imgDiv.className = 'vafm-related-card-img';
            imgDiv.style.cssText = `width:100%;aspect-ratio:16/10;flex-shrink:0;background-size:cover;background-position:center;background-color:#e5e5ea;background-image:url('${imgUrl}');`;

            const bodyDiv = document.createElement('div');
            bodyDiv.style.cssText = 'display:flex;flex-direction:column;flex:1;padding:14px 16px 16px;';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'vafm-related-card-title';
            titleDiv.style.cssText = 'font-size:0.98rem;font-weight:700;color:#141414;line-height:1.4;overflow:hidden!important;flex:1;margin-bottom:10px;';
            titleDiv.textContent = title;

            const ctaDiv = document.createElement('div');
            ctaDiv.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:800;color:#E50914;text-transform:uppercase;letter-spacing:0.02em;margin-top:auto;';
            const ctaArrow = document.createElement('span');
            ctaArrow.textContent = '→';
            ctaArrow.style.cssText = 'display:inline-block;transition:transform 0.2s ease;';
            ctaDiv.appendChild(document.createTextNode('Lire l\'article '));
            ctaDiv.appendChild(ctaArrow);

            bodyDiv.appendChild(titleDiv);
            bodyDiv.appendChild(ctaDiv);

            card.appendChild(imgDiv);
            card.appendChild(bodyDiv);

            // Effet au survol/focus géré en JS pour ne dépendre d'aucune règle :hover externe.
            const applyHoverState = () => {
                card.style.transform = 'translateY(-4px)';
                card.style.boxShadow = '0 14px 30px rgba(17, 17, 17, 0.14)';
                card.style.borderColor = '#E50914';
                ctaArrow.style.transform = 'translateX(4px)';
            };
            const clearHoverState = () => {
                card.style.transform = '';
                card.style.boxShadow = '0 2px 10px rgba(17,17,17,0.05)';
                card.style.borderColor = '#ececf2';
                ctaArrow.style.transform = '';
            };
            card.addEventListener('mouseenter', applyHoverState);
            card.addEventListener('mouseleave', clearHoverState);
            card.addEventListener('focus', applyHoverState);
            card.addEventListener('blur', clearHoverState);

            const goToArticle = () => openArticleView(category, record.id);
            card.addEventListener('click', goToArticle);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToArticle();
                }
            });

            grid.appendChild(card);
        });

        container.style.display = '';
    } catch (err) {
        console.error('[VAFM] Chargement des articles similaires impossible :', err);
        container.style.display = 'none';
    }
}

/* --------------------------------------------------------------------------
   BARRE DE PROGRESSION DE LECTURE (lecteurs publics)
   -------------------------------------------------------------------------- */
function initReadingProgressBar() {
    const fill = document.getElementById('vafm-reading-progress-fill');
    if (!fill) return;

    const onScroll = () => {
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop || 0;
        const scrollable = (doc.scrollHeight - doc.clientHeight) || 1;
        const pct = Math.min(100, Math.max(0, (scrollTop / scrollable) * 100));
        fill.style.width = pct + '%';
    };

    if (window._vafmReadingProgressHandler) {
        window.removeEventListener('scroll', window._vafmReadingProgressHandler);
    }
    window._vafmReadingProgressHandler = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

function initArticleImageLightbox() {
    const content = document.getElementById('canva-doc-content');
    if (!content) return;

    content.addEventListener('click', (e) => {
        const img = e.target.closest('.canva-block img');
        if (!img) return;
        if (img.closest('.vafm-ad-placeholder') || img.closest('ins.adsbygoogle')) return;
        openImageLightbox(img.src, img.alt || '');
    });
}

function openImageLightbox(src, alt) {
    let overlay = document.getElementById('vafm-image-lightbox');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'vafm-image-lightbox';
        overlay.className = 'vafm-image-lightbox-overlay';
        overlay.innerHTML = `
            <button class="vafm-image-lightbox-close" aria-label="Fermer">✕</button>
            <img src="" alt="">
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.vafm-image-lightbox-close')) {
                closeImageLightbox();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeImageLightbox();
        });
    }

    const imgEl = overlay.querySelector('img');
    imgEl.src = src;
    imgEl.alt = alt;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageLightbox() {
    const overlay = document.getElementById('vafm-image-lightbox');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

async function closeArticleView(options = {}) {
    const isAdminNow = document.querySelector('.canva-admin-active') !== null;

    if (isAdminNow && hasUnsavedChanges && !options.skipUnsavedCheck) {
        const ok = await vafmConfirm("Des modifications ne sont pas encore enregistrées. Quitter sans enregistrer ?", { confirmLabel: 'Quitter sans enregistrer' });
        if (!ok) return false;
    }

    document.removeEventListener('keydown', handleStudioKeydown);
    delete window._currentStudioContext;
    stopStudioSafetyNet();
    hasUnsavedChanges = false;
    if (_miniBlockToolbarEl) { _miniBlockToolbarEl.classList.remove('visible'); _miniBlockToolbarEl.style.display = 'none'; }
    if (window._vafmReadingProgressHandler) {
        window.removeEventListener('scroll', window._vafmReadingProgressHandler);
        window._vafmReadingProgressHandler = null;
    }

    const articleContainer = document.getElementById('article-modal');
    const wasOpen = Boolean(articleContainer && articleContainer.style.display === 'block');

    if (articleContainer) {
        articleContainer.style.display = 'none';
        articleContainer.innerHTML = '';
    }
    
    // Supprime le balisage Schema de l'article fermé
    document.getElementById('news-schema')?.remove();

    // Réinitialisation des balises SEO aux valeurs par défaut VAFM
    document.title = "VAFM – La Radio qu'il vous faut";
    updateHeadTag('link', 'rel', 'canonical', 'href', 'https://vafmlaradio.fr');
    updateHeadTag('meta', 'name', 'description', 'content', "Écoutez VAFM, la radio qu'il vous faut. Actualités locales, musique et divertissement.");
    updateHeadTag('meta', 'property', 'og:type', 'content', 'website');
    updateHeadTag('meta', 'property', 'og:title', 'content', "VAFM – La Radio qu'il vous faut");
    updateHeadTag('meta', 'property', 'og:description', 'content', "Écoutez VAFM, la radio qu'il vous faut. Actualités locales, musique et divertissement.");
    updateHeadTag('meta', 'property', 'og:image', 'content', "https://vafmlaradio.fr/LOGO-VAFM.png");
    updateHeadTag('meta', 'property', 'og:url', 'content', "https://vafmlaradio.fr");

    updateHeadTag('meta', 'name', 'twitter:card', 'content', 'summary_large_image');
    updateHeadTag('meta', 'name', 'twitter:title', 'content', "VAFM – La Radio qu'il vous faut");
    updateHeadTag('meta', 'name', 'twitter:description', 'content', "Écoutez VAFM, la radio qu'il vous faut. Actualités locales, musique et divertissement.");
    updateHeadTag('meta', 'name', 'twitter:image', 'content', "https://vafmlaradio.fr/LOGO-VAFM.png");

    if (options.skipRestore) {
        delete window._articleReturnTo;
        return wasOpen;
    }

    const returnTo = window._articleReturnTo || 'home';
    delete window._articleReturnTo;

    if (returnTo === 'news' && typeof openNewsPage === 'function') {
        openNewsPage();
        history.pushState({ page: 'news' }, '', '#actus');
    } else if (typeof showHomePage === 'function') {
        showHomePage();
        history.pushState({ page: 'home' }, '', '/');
    } else {
        const newsSpa = document.getElementById('news-page-spa');
        const mainContent = document.getElementById('content');
        if (returnTo === 'news' && newsSpa) {
            newsSpa.classList.add('active');
            newsSpa.style.display = 'block';
        } else if (mainContent) {
            mainContent.style.display = 'block';
        }
        history.pushState({ page: returnTo }, '', returnTo === 'news' ? '#actus' : '/');
    }

    return wasOpen;
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.page === 'article') {
        openArticleView(e.state.category, e.state.id);
    } else {
        closeArticleView();
    }
});

/* --------------------------------------------------------------------------
   AJOUT DE BLOCS ET SAUVEGARDE (POCKETBASE)
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
    } else if (type === 'ad') {
        block.className = 'canva-block img-full size-full';
        inner = document.createElement('div');
        inner.className = 'vafm-ad-placeholder';
        inner.innerHTML = `📢 <strong>Emplacement Publicitaire Google AdSense</strong> (Visible uniquement par les lecteurs)`;
    } else {
        inner = document.createElement('p');
        inner.innerText = "Nouveau paragraphe... Cliquez pour écrire.";
    }

    block.appendChild(inner);
    contentBox.appendChild(block);
    initCanvaInteractions();
    pushUndoState();
    updateLiveStats();
    safeScrollIntoView(block);
}

/* --------------------------------------------------------------------------
   BLOC VIDÉO (YouTube / Vimeo)
   -------------------------------------------------------------------------- */
function getEmbeddableVideoUrl(rawUrl) {
    let candidate = rawUrl.trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate;

    try {
        const u = new URL(candidate);
        if (u.hostname.includes('youtube.com')) {
            const id = u.searchParams.get('v');
            if (id) return `https://www.youtube.com/embed/${id}`;
        }
        if (u.hostname === 'youtu.be') {
            const id = u.pathname.replace('/', '');
            if (id) return `https://www.youtube.com/embed/${id}`;
        }
        if (u.hostname.includes('vimeo.com')) {
            const id = u.pathname.split('/').filter(Boolean).pop();
            if (id) return `https://player.vimeo.com/video/${id}`;
        }
    } catch (e) {
        return null;
    }
    return null;
}

async function insertVideoBlock() {
    const url = await vafmPrompt({
        title: 'Insérer une vidéo',
        label: 'Colle un lien YouTube ou Vimeo',
        placeholder: 'https://www.youtube.com/watch?v=...'
    });
    if (!url) return;

    const embedUrl = getEmbeddableVideoUrl(url);
    if (!embedUrl) {
        showToast("Lien vidéo non reconnu (YouTube ou Vimeo uniquement).", 'error');
        return;
    }

    const contentBox = document.getElementById('canva-doc-content');
    if (!contentBox) return;

    const block = document.createElement('div');
    block.className = 'canva-block video-embed img-full size-full';
    block.innerHTML = `
        <div class="vafm-video-frame">
            <iframe src="${embedUrl}" title="Vidéo intégrée" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>`;
    contentBox.appendChild(block);
    if (typeof initCanvaInteractions === 'function') initCanvaInteractions();
    pushUndoState();
    updateLiveStats();
    showToast('Vidéo ajoutée.', 'success');
    safeScrollIntoView(block);
}

async function handleCanvaImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Le fichier choisi n'est pas une image.", 'error');
        event.target.value = '';
        return;
    }
    const maxSizeMB = 15;
    if (file.size > maxSizeMB * 1024 * 1024) {
        showToast(`Image trop lourde (max ${maxSizeMB} Mo).`, 'error');
        event.target.value = '';
        return;
    }

    const contentBox = document.getElementById('canva-doc-content');
    if (!contentBox) return;

    const compressed = (typeof compressImage === 'function')
        ? await compressImage(file, 1400, 0.82)
        : file;

    let targetImg;
    let isNewBlock = false;
    if (activeBlock && activeBlock.querySelector('img')) {
        targetImg = activeBlock.querySelector('img');
    } else {
        isNewBlock = true;
        const block = document.createElement('div');
        block.className = 'canva-block img-full size-md';
        targetImg = document.createElement('img');
        targetImg.alt = "Image téléchargée";
        targetImg.loading = "lazy";
        targetImg.decoding = "async";
        block.appendChild(targetImg);

        const dropInd = contentBox.querySelector('.canva-drop-indicator');
        if (dropInd && dropInd.style.display !== 'none') {
            contentBox.insertBefore(block, dropInd);
        } else {
            contentBox.appendChild(block);
        }
    }

    const previewUrl = URL.createObjectURL(compressed);
    targetImg.src = previewUrl;
    targetImg.dataset.uploading = "1";
    initCanvaInteractions();

    try {
        const articleId = (typeof currentArticleData !== 'undefined' && currentArticleData) ? currentArticleData.id : null;
        const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

        const fd = new FormData();
        fd.append('image', compressed);
        if (articleId) fd.append('article', articleId);

        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${POCKETBASE_URL}/api/collections/article_images/records`, {
            method: 'POST',
            headers,
            body: fd
        });

        if (!res.ok) throw new Error(`upload échoué (HTTP ${res.status})`);

        const record = await res.json();
        const finalUrl = (typeof getPocketBaseImageUrl === 'function')
            ? getPocketBaseImageUrl('article_images', record.id, record.image, '1000x0')
            : `${POCKETBASE_URL}/api/files/article_images/${record.id}/${record.image}?thumb=1000x0`;

        targetImg.src = finalUrl;
        targetImg.removeAttribute('data-uploading');
        targetImg.dataset.pbCollection = 'article_images';
        targetImg.dataset.pbId = record.id;
        showToast(isNewBlock ? 'Image ajoutée.' : 'Image remplacée.', 'success');
    } catch (err) {
        console.warn("⚠️ Upload direct impossible — repli en base64 compressé :", err.message);
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                targetImg.src = e.target.result;
                targetImg.removeAttribute('data-uploading');
                resolve();
            };
            reader.readAsDataURL(compressed);
        });
        showToast("Image intégrée directement (mode secours).", 'info');
    } finally {
        URL.revokeObjectURL(previewUrl);
        event.target.value = '';
        pushUndoState();
        updateLiveStats();
    }
}

/* --------------------------------------------------------------------------
   HISTORIQUE (ANNULER / RÉTABLIR)
   -------------------------------------------------------------------------- */
// Une image qui échoue à s'envoyer vers PocketBase est intégrée directement
// dans le HTML en base64 (texte très volumineux, parfois plusieurs centaines
// de Ko par image). Dupliquer ça jusqu'à 40 fois dans l'historique annuler/
// rétablir pouvait faire exploser la mémoire du navigateur et tout ralentir
// fortement. Au-delà de ce seuil, on garde beaucoup moins de versions.
const VAFM_UNDO_HEAVY_CONTENT_THRESHOLD = 400000; // ~400 Ko de HTML
const VAFM_MAX_UNDO_HEAVY = 6;

function pushUndoState() {
    const contentBox = document.getElementById('canva-doc-content');
    const titleEl = document.getElementById('canva-doc-title');
    if (!contentBox) return;

    const html = contentBox.innerHTML;
    const isHeavy = html.length > VAFM_UNDO_HEAVY_CONTENT_THRESHOLD;
    const limit = isHeavy ? VAFM_MAX_UNDO_HEAVY : MAX_UNDO;

    undoStack.push({
        html,
        title: titleEl ? titleEl.innerHTML : ''
    });
    while (undoStack.length > limit) undoStack.shift();
    redoStack = [];
    markUnsavedChanges();
}

let _statsDebounceTimer = null;

function scheduleUndoSnapshot() {
    markUnsavedChanges();

    // updateLiveStats() lisait contentBox.innerText, qui force le navigateur à
    // recalculer toute la mise en page — en l'appelant à chaque frappe, ça
    // provoquait des ralentissements pendant la frappe. On le limite désormais
    // à un appel différé, bien après que la personne a arrêté de taper.
    clearTimeout(_statsDebounceTimer);
    _statsDebounceTimer = setTimeout(() => {
        if (typeof updateLiveStats === 'function') updateLiveStats();
    }, 500);

    clearTimeout(_undoDebounceTimer);
    _undoDebounceTimer = setTimeout(() => pushUndoState(), 900);
}

function restoreEditorState(state) {
    const contentBox = document.getElementById('canva-doc-content');
    const titleEl = document.getElementById('canva-doc-title');
    if (contentBox) {
        contentBox.innerHTML = state.html;
        sanitizeRestoredContent(contentBox);
    }
    if (titleEl) titleEl.innerHTML = state.title;
    activeBlock = null;
    if (_miniBlockToolbarEl) { _miniBlockToolbarEl.classList.remove('visible'); _miniBlockToolbarEl.style.display = 'none'; }
    if (typeof initCanvaInteractions === 'function') initCanvaInteractions();
    updateLiveStats();
}

function applyUndo() {
    if (undoStack.length < 2) {
        showToast('Rien à annuler.', 'info');
        return;
    }
    const current = undoStack.pop();
    redoStack.push(current);
    const previous = undoStack[undoStack.length - 1];
    restoreEditorState(previous);
    markUnsavedChanges();
    showToast('Modification annulée.', 'info');
}

function applyRedo() {
    if (redoStack.length === 0) {
        showToast('Rien à rétablir.', 'info');
        return;
    }
    const next = redoStack.pop();
    undoStack.push(next);
    restoreEditorState(next);
    markUnsavedChanges();
    showToast('Modification rétablie.', 'info');
}

/* --------------------------------------------------------------------------
   SUIVI DES MODIFICATIONS NON ENREGISTRÉES + STATISTIQUES EN DIRECT
   -------------------------------------------------------------------------- */
function markUnsavedChanges() {
    hasUnsavedChanges = true;
    updateSaveIndicator();
}

function clearUnsavedChanges() {
    hasUnsavedChanges = false;
    updateSaveIndicator();
}

function updateSaveIndicator() {
    const btn = document.getElementById('btn-studio-save');
    if (btn) btn.classList.toggle('has-changes', hasUnsavedChanges);
}

function updateLiveStats() {
    const contentBox = document.getElementById('canva-doc-content');
    const statsEl = document.getElementById('vafm-live-stats');
    if (!contentBox || !statsEl) return;

    // textContent (au lieu d'innerText) ne force pas de recalcul de mise en
    // page : bien plus léger, surtout appelé pendant la frappe.
    const text = contentBox.textContent || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const minutes = typeof calculateReadTime === 'function' ? calculateReadTime(contentBox.innerHTML) : 1;

    // Le libellé "Studio" reste affiché ; les stats passent en infobulle
    // pour garder la barre compacte comme à l'origine.
    statsEl.title = `${words} ${words <= 1 ? 'mot' : 'mots'} · ${minutes} min`;
}

/* --------------------------------------------------------------------------
   AUTOSAUVEGARDE LOCALE (BROUILLON) + AVERTISSEMENT AVANT DE QUITTER
   Protège contre une fermeture d'onglet accidentelle ou un plantage.
   -------------------------------------------------------------------------- */
function getDraftKey(collectionName, id) {
    return `vafm_draft_${collectionName}_${id}`;
}

function saveDraftLocally(collectionName, id) {
    try {
        const contentBox = document.getElementById('canva-doc-content');
        const titleEl = document.getElementById('canva-doc-title');
        if (!contentBox) return;

        const html = contentBox.innerHTML;

        // localStorage.setItem() est une écriture SYNCHRONE qui bloque le
        // navigateur pendant son exécution. Avec une image repliée en base64
        // dans le contenu, cette écriture peut devenir lourde et se répéter
        // toutes les 20 secondes. Au-delà du seuil, on saute l'autosauvegarde
        // locale plutôt que de geler l'interface (le bouton "Enregistrer"
        // reste la méthode fiable pour ce genre de contenu).
        if (html.length > VAFM_UNDO_HEAVY_CONTENT_THRESHOLD) {
            return;
        }

        const draft = {
            title: titleEl ? titleEl.innerHTML : '',
            html,
            savedAt: Date.now()
        };
        localStorage.setItem(getDraftKey(collectionName, id), JSON.stringify(draft));
        flashSaveIndicator('Brouillon enregistré localement');
    } catch (e) {
        console.warn('[VAFM] Autosauvegarde locale impossible :', e);
    }
}

function clearLocalDraft(collectionName, id) {
    try {
        localStorage.removeItem(getDraftKey(collectionName, id));
    } catch (e) {
        // silencieux : le nettoyage du brouillon local n'est pas critique
    }
}

function checkForLocalDraft(collectionName, id) {
    try {
        const raw = localStorage.getItem(getDraftKey(collectionName, id));
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft || !draft.html) return;

        const ageMin = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
        showToast(`Un brouillon non enregistré existe (il y a ${ageMin} min).`, 'info', {
            actionLabel: 'Restaurer',
            duration: 12000,
            onAction: () => {
                const contentBox = document.getElementById('canva-doc-content');
                const titleEl = document.getElementById('canva-doc-title');
                if (contentBox) {
                    contentBox.innerHTML = draft.html;
                    sanitizeRestoredContent(contentBox);
                }
                if (titleEl) titleEl.innerHTML = draft.title;
                if (typeof initCanvaInteractions === 'function') initCanvaInteractions();
                pushUndoState();
                updateLiveStats();
                showToast('Brouillon restauré.', 'success');
            }
        });
    } catch (e) {
        console.warn('[VAFM] Lecture du brouillon local impossible :', e);
    }
}

function flashSaveIndicator(text) {
    showToast(text, 'info', { duration: 2000 });
}

function vafmBeforeUnloadHandler(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
}

function initStudioSafetyNet(collectionName, id) {
    undoStack = [];
    redoStack = [];

    const contentBox = document.getElementById('canva-doc-content');
    const titleEl = document.getElementById('canva-doc-title');
    if (contentBox) {
        undoStack.push({ html: contentBox.innerHTML, title: titleEl ? titleEl.innerHTML : '' });
    }

    hasUnsavedChanges = false;
    updateSaveIndicator();
    updateLiveStats();
    checkForLocalDraft(collectionName, id);

    window.removeEventListener('beforeunload', vafmBeforeUnloadHandler);
    window.addEventListener('beforeunload', vafmBeforeUnloadHandler);

    if (autosaveInterval) clearInterval(autosaveInterval);
    autosaveInterval = setInterval(() => {
        if (hasUnsavedChanges) saveDraftLocally(collectionName, id);
    }, 20000);
}

function stopStudioSafetyNet() {
    window.removeEventListener('beforeunload', vafmBeforeUnloadHandler);
    if (autosaveInterval) {
        clearInterval(autosaveInterval);
        autosaveInterval = null;
    }
}

// Fonction utilitaire pour le ping RSS
async function pingRSSFeed() {
    const rssUrl = "https://vafmlaradio.fr/rss.xml";
    const siteName = "VAFM - La Radio qu'il vous faut";
    const siteUrl = "https://vafmlaradio.fr";

    try {
        await fetch(`https://pingomatic.com/ping/?title=${encodeURIComponent(siteName)}&blogurl=${encodeURIComponent(siteUrl)}&rssurl=${encodeURIComponent(rssUrl)}`, {
            mode: 'no-cors'
        });
        console.log("[VAFM RSS] Ping RSS envoyé avec succès !");
    } catch (err) {
        console.warn("[VAFM RSS] Échec de l'envoi du ping RSS :", err);
    }
}

// Fonction utilitaire pour IndexNow
async function pingIndexNow(articleUrl) {
    const host = 'vafmlaradio.fr';
    const key = '67f1b529c5bd4c4d9d251bee1211c6b9'; // Indique le nom de ta clé texte sans le .txt
    const keyLocation = `https://${host}/${key}.txt`;

    const payload = {
        host: host,
        key: key,
        keyLocation: keyLocation,
        urlList: [articleUrl]
    };

    try {
        const response = await fetch('https://api.indexnow.org/IndexNow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload)
        });

        if (response.ok || response.status === 202) {
            console.log('[VAFM IndexNow] URL soumise avec succès à IndexNow !');
        } else {
            console.warn('[VAFM IndexNow] Statut de réponse :', response.status);
        }
    } catch (err) {
        console.warn('[VAFM IndexNow] Erreur lors de la soumission :', err);
    }
}

async function saveCanvaArticle(collectionName, id) {
    if (_isSavingArticle) return;
    _isSavingArticle = true;

    const saveBtn = document.getElementById('btn-studio-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add('is-saving');
    }

    try {
        const titleElement = document.getElementById('canva-doc-title');
        const title = titleElement ? (titleElement.innerText || titleElement.textContent || '').trim() : '';

        const contentBox = document.getElementById('canva-doc-content');
        if (!contentBox) {
            showToast("Erreur : zone de contenu introuvable.", 'error');
            return;
        }

        if (!title) {
            showToast("Le titre de l'article ne peut pas être vide.", 'error');
            return;
        }

        const fileInput = document.getElementById('canva-file-input');
        const hasNewFile = fileInput && fileInput.files && fileInput.files[0];

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentBox.innerHTML;

        tempDiv.querySelectorAll('.canva-drop-indicator').forEach(el => el.remove());
        tempDiv.querySelectorAll('.canva-block-mini-toolbar').forEach(el => el.remove());

        tempDiv.querySelectorAll('.canva-block').forEach(b => {
            b.classList.remove('selected', 'editing', 'dragging');
            b.removeAttribute('data-interactive');
        });

        tempDiv.querySelectorAll('[contenteditable], [draggable]').forEach(el => {
            el.removeAttribute('contenteditable');
            el.removeAttribute('draggable');
        });

        const content = tempDiv.innerHTML.trim();
        const plainExcerpt = generateCleanSnippet(tempDiv.innerHTML, 200);

        let realCollection = collectionName;
        if (collectionName === 'news' || collectionName === 'article') {
            realCollection = 'actus';
        }

        let authorDisplayName = "Équipe VAFM";
        if (window.appState && window.appState.currentUser) {
            authorDisplayName = window.appState.currentUser.name || window.appState.currentUser.username || "Équipe VAFM";
        }

        const token = typeof getAuthToken === 'function' 
            ? getAuthToken() 
            : (window.appState?.pbToken || (localStorage.getItem('pocketbase_auth') ? JSON.parse(localStorage.getItem('pocketbase_auth')).token : null));
        
        let headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        let bodyPayload;

        if (hasNewFile) {
            const formData = new FormData();
            formData.append('titre', title);
            formData.append('title', title);
            formData.append('texte', content);
            formData.append('contenu', content);
            formData.append('description', plainExcerpt);
            formData.append('name', authorDisplayName);

            if (window.appState && window.appState.currentUser) {
                const userId = window.appState.currentUser.id;
                formData.append('author', userId);
                formData.append('user', userId);
                formData.append('user_id', userId);
            }
            
            let coverFile = fileInput.files[0];
            if (typeof compressImage === 'function') {
                try {
                    coverFile = await compressImage(fileInput.files[0], 1600, 0.85) || fileInput.files[0];
                } catch (imgErr) {
                    console.warn("Échec de la compression d'image, utilisation du fichier d'origine :", imgErr);
                }
            }
            formData.append('image', coverFile);
            bodyPayload = formData;
        } else {
            headers['Content-Type'] = 'application/json';
            const jsonBody = {
                titre: title,
                title: title,
                texte: content,
                contenu: content,
                description: plainExcerpt,
                name: authorDisplayName
            };

            if (window.appState && window.appState.currentUser) {
                const userId = window.appState.currentUser.id;
                jsonBody.author = userId;
                jsonBody.user = userId;
                jsonBody.user_id = userId;
            }

            bodyPayload = JSON.stringify(jsonBody);
        }

        const baseUrl = typeof POCKETBASE_URL !== 'undefined' ? POCKETBASE_URL : (window.POCKETBASE_URL || '');
        const response = await fetch(`${baseUrl}/api/collections/${realCollection}/records/${id}`, {
            method: 'PATCH',
            headers: headers,
            body: bodyPayload
        });

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            let detailMsg = errJson.message || `Erreur HTTP ${response.status}`;
            if (errJson.data) {
                const details = Object.entries(errJson.data)
                    .map(([field, err]) => `- ${field}: ${err.message || err.code}`)
                    .join('\n');
                if (details) detailMsg += `:\n${details}`;
            }
            throw new Error(detailMsg);
        }

        const updatedRecord = await response.json();
        
        if (typeof currentArticleData !== 'undefined') {
            currentArticleData = updatedRecord;
        } else {
            window.currentArticleData = updatedRecord;
        }

        clearUnsavedChanges();
        clearLocalDraft(realCollection, id);
        showToast("✨ Article enregistré avec succès !", 'success');
        
        // 🚀 Ping du flux RSS et IndexNow si l'article est actuellement publié
        if (updatedRecord.is_published || updatedRecord.published) {
            pingRSSFeed();

            const cleanSlug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const category = currentCategory || 'news';
            const fullArticleUrl = `https://vafmlaradio.fr/article/${category}/${id}-${cleanSlug}`;
            pingIndexNow(fullArticleUrl);
        }

        if (fileInput) fileInput.value = '';
        
        if (typeof fetchAllFromPocketBase === 'function') {
            await fetchAllFromPocketBase();
        }

    } catch (err) {
        console.error("Erreur durant la sauvegarde PocketBase:", err);
        showToast("Erreur lors de la sauvegarde : " + err.message, 'error');
    } finally {
        _isSavingArticle = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('is-saving');
        }
    }
}

/* --------------------------------------------------------------------------
   CHARGEMENT AUTOMATIQUE VIA URL
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const articleCategory = urlParams.get('article') || urlParams.get('type');
    const articleId = urlParams.get('id');

    if (articleCategory && articleId) {
        if (articleCategory !== 'shows' && articleCategory !== 'emissions' && articleCategory !== 'team' && articleCategory !== 'animateurs') {
            setTimeout(() => {
                openArticleView(articleCategory, articleId);
            }, 100);
        }
    }
});