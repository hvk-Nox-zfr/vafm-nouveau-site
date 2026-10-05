// ============================================================================
// VAFM — ANIMATIONS "APPLE" v4 (apple-motion.js)
// ============================================================================
// N'ajoute que des classes / variables CSS / spans de texte en plus de ce
// qui existe déjà. Aucune fonction de script.js / news.js / team.js n'est
// redéfinie : on peut retirer ce fichier sans rien casser.
// ============================================================================

(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;


    // --------------------------------------------------------------------
    // 1. RÉVÉLATION DES SECTIONS AU SCROLL
    // --------------------------------------------------------------------
    const revealSelectors = [
        '.section-header',
        '.vafm-wheel-card',
        '.dedicace-form-card',
        '.vafm-videos-container',
        '#main-footer .footer-container'
    ];

    function markRevealTargets() {
        revealSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el.classList.contains('apple-reveal')) el.classList.add('apple-reveal');
            });
        });
    }

    let revealObserver = null;
    function initRevealObserver() {
        if (revealObserver) return revealObserver;
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('apple-revealed');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
        return revealObserver;
    }

    function observeRevealTargets() {
        const observer = initRevealObserver();
        document.querySelectorAll('.apple-reveal:not(.apple-revealed)').forEach(el => observer.observe(el));
    }

    // Filet de sécurité : les pages Actus/Équipe/Jeux sont en display:none
    // au chargement, donc l'IntersectionObserver ne peut pas les détecter
    // tant qu'elles restent cachées — leurs titres resteraient flous et
    // invisibles pour toujours. On force la révélation dès qu'un élément
    // .apple-reveal devient réellement visible à l'écran.
    function forceRevealVisible() {
        document.querySelectorAll('.apple-reveal:not(.apple-revealed)').forEach(el => {
            if (el.offsetParent !== null) el.classList.add('apple-revealed');
        });
    }

    // --------------------------------------------------------------------
    // 2. RÉVÉLATION DU TEXTE MOT PAR MOT (titres statiques : entêtes de
    //    section). Ne touche jamais au texte dynamique des cartes.
    // --------------------------------------------------------------------
    function splitWords(el) {
        if (!el || el.dataset.appleSplit) return;
        el.dataset.appleSplit = '1';
        const text = el.textContent;
        const parts = text.split(/(\s+)/);
        el.textContent = '';
        let wordIndex = 0;
        parts.forEach(part => {
            if (part.trim() === '') {
                el.appendChild(document.createTextNode(part));
                return;
            }
            const mask = document.createElement('span');
            mask.className = 'apple-word-mask';
            const inner = document.createElement('span');
            inner.className = 'apple-word-inner';
            inner.textContent = part;
            inner.style.transitionDelay = (wordIndex * 0.045) + 's';
            mask.appendChild(inner);
            el.appendChild(mask);
            wordIndex++;
        });
    }

    function splitStaticHeadings() {
        document.querySelectorAll('.section-header h2').forEach(splitWords);
    }

    function splitHeroSlide(slideContent) {
        if (!slideContent) return;
        const h1 = slideContent.querySelector('h1');
        const p = slideContent.querySelector('p');
        if (h1) splitWords(h1);
        if (p) splitWords(p);
    }

    // --------------------------------------------------------------------
    // 3. CARTES INJECTÉES DYNAMIQUEMENT (actus, émissions, équipe, bento)
    // --------------------------------------------------------------------
    const cardSelector = '.card, .news-card-bento';
    let staggerCount = 0;

    function animateCard(el) {
        if (el.dataset.appleAnimated) return;
        el.dataset.appleAnimated = '1';
        el.style.animationDelay = (Math.min(staggerCount % 8, 8) * 0.06) + 's';
        el.classList.add('apple-card-in');
        staggerCount++;
    }

    function scanExistingCards() {
        document.querySelectorAll(cardSelector).forEach(animateCard);
    }

    function watchForNewContent() {
        const target = document.getElementById('content') || document.body;
        const mo = new MutationObserver((mutations) => {
            let foundCards = false;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;

                    if (node.matches && node.matches(cardSelector)) { animateCard(node); foundCards = true; }
                    if (node.querySelectorAll) {
                        node.querySelectorAll(cardSelector).forEach(el => { animateCard(el); foundCards = true; });
                    }

                    // Nouvelle slide hero (Swiper) : on prépare le texte pour
                    // la révélation mot par mot.
                    if (node.matches && node.matches('.slide-content')) splitHeroSlide(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.slide-content').forEach(splitHeroSlide);
                    }
                });
            });
            if (foundCards) { markRevealTargets(); observeRevealTargets(); }
        });
        mo.observe(target, { childList: true, subtree: true });
    }

    // --------------------------------------------------------------------
    // 4. NAVBAR — densification du verre dépoli au scroll
    // --------------------------------------------------------------------
    function initNavbarScrollEffect() {
        const navbar = document.getElementById('main-navbar');
        if (!navbar) return;
        let ticking = false;
        function update() {
            navbar.classList.toggle('apple-navbar-scrolled', window.scrollY > 24);
            ticking = false;
        }
        window.addEventListener('scroll', () => {
            if (!ticking) { requestAnimationFrame(update); ticking = true; }
        }, { passive: true });
        update();
    }

    function primeHeroSlides() {
        document.querySelectorAll('.slide-content').forEach(splitHeroSlide);
        const firstSlide = document.querySelector('.swiper-slide-active .slide-content');
        if (firstSlide) firstSlide.classList.add('apple-hero-in');
    }

    function injectScrollHint() {
        const hero = document.querySelector('.hero-section');
        if (!hero || hero.querySelector('.apple-scroll-hint')) return;
        const hint = document.createElement('div');
        hint.className = 'apple-scroll-hint';
        hint.innerHTML = '<span>Découvrir</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        hero.appendChild(hint);
    }

    // --------------------------------------------------------------------
    // 5. CARROUSELS HORIZONTAUX — glisser à la souris
    // --------------------------------------------------------------------
    function enableDragScroll(el) {
        if (!el || el.dataset.appleDragBound) return;
        el.dataset.appleDragBound = '1';
        let isDown = false, startX = 0, startScroll = 0, moved = false;

        el.addEventListener('mousedown', (e) => {
            isDown = true; moved = false;
            startX = e.pageX; startScroll = el.scrollLeft;
            el.classList.add('apple-dragging');
        });
        window.addEventListener('mouseup', () => {
            if (!isDown) return;
            isDown = false;
            el.classList.remove('apple-dragging');
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            const dx = e.pageX - startX;
            if (Math.abs(dx) > 4) moved = true;
            el.scrollLeft = startScroll - dx;
        });
        el.addEventListener('click', (e) => {
            if (moved) { e.preventDefault(); e.stopPropagation(); }
        }, true);
    }

    function initCarousels() {
        ['recent-news-grid', 'shows-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) enableDragScroll(el);
        });
    }

    // --------------------------------------------------------------------
    // 6. HALO + LÉGER TILT SUR LES CARTES (desktop uniquement)
    // --------------------------------------------------------------------
    function initCardFx() {
        if (!canHover || prefersReducedMotion) return;

        document.addEventListener('mousemove', (e) => {
            const card = e.target.closest && e.target.closest('.card');
            if (!card) return;
            const rect = card.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            card.style.setProperty('--mx', mx + 'px');
            card.style.setProperty('--my', my + 'px');

            const px = mx / rect.width - 0.5;
            const py = my / rect.height - 0.5;
            card.style.transform = 'translateY(-6px) rotateX(' + (py * -4) + 'deg) rotateY(' + (px * 6) + 'deg)';
        });

        document.addEventListener('mouseout', (e) => {
            const card = e.target.closest && e.target.closest('.card');
            if (!card) return;
            const related = e.relatedTarget;
            if (related && card.contains(related)) return;
            card.style.transform = '';
        });
    }

    // --------------------------------------------------------------------
    // 7. BOUTONS "MAGNÉTIQUES" du hero
    // --------------------------------------------------------------------
    function initMagneticButtons() {
        if (!canHover || prefersReducedMotion) return;
        const hero = document.querySelector('.hero-section');
        if (!hero) return;

        hero.addEventListener('mousemove', (e) => {
            const btn = e.target.closest && e.target.closest('.btn-more, .btn-live');
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.22;
            const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.22;
            btn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        hero.addEventListener('mouseout', (e) => {
            const btn = e.target.closest && e.target.closest('.btn-more, .btn-live');
            if (!btn) return;
            btn.style.transform = '';
        });
    }

    // --------------------------------------------------------------------
    // INITIALISATION
    // --------------------------------------------------------------------
    function init() {
        markRevealTargets();
        splitStaticHeadings();
        observeRevealTargets();
        forceRevealVisible();
        scanExistingCards();
        watchForNewContent();
        initNavbarScrollEffect();
        primeHeroSlides();
        injectScrollHint();
        initCarousels();
        initCardFx();
        initMagneticButtons();

        // Quand on change de page interne (Actus, Équipe, Jeux...), les
        // titres jusque-là cachés deviennent visibles : on revérifie.
        document.addEventListener('click', () => {
            setTimeout(forceRevealVisible, 120);
            setTimeout(forceRevealVisible, 500);
        });
        setInterval(forceRevealVisible, 1000);

        // Les grilles carrousel / le hero sont peuplés après un fetch :
        // quelques tentatives supplémentaires pour bien tout accrocher.
        let tries = 0;
        const retry = setInterval(() => {
            initCarousels();
            primeHeroSlides();
            tries++;
            if (tries > 10) clearInterval(retry);
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ==========================================================================
   FORCE MOBILE FOOTER VERTICAL
   ========================================================================== */
@media screen and (max-width: 768px) {
    body #main-footer .footer-container {
        display: flex !important;
        flex-direction: column !important;
        grid-template-columns: none !important;
        gap: 25px !important;
        width: 100% !important;
    }

    body #main-footer .footer-col {
        width: 100% !important;
        max-width: 100% !important;
        text-align: center !important;
    }

    body #main-footer .social-icons {
        justify-content: center !important;
    }
}