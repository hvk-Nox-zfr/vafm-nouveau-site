/* ==========================================================================
   VAFM — Scroll 3D (scroll3d.js)
   --------------------------------------------------------------------------
   Animations 3D pilotées par le défilement de la page, avec une "scène"
   différente pour chaque section (bascule, porte qui s'ouvre, zoom profondeur…).

   Principes :
   - Aucune dépendance (pas de GSAP, pas de three.js) : ~8 Ko, adapté PageSpeed.
   - Écrit uniquement les propriétés CSS individuelles `rotate`, `translate`,
     `scale` : elles se combinent avec le `transform` / `opacity` d'apple-motion.js
     au lieu de les écraser.
   - Aucune lecture de layout pendant le scroll : les positions sont mesurées
     une fois (offsetTop, insensible aux transforms) puis recalculées au besoin.
   - La boucle d'animation ne tourne que pendant le défilement.
   - will-change uniquement sur les éléments visibles ; styles retirés au repos.
   - Désactivé si "réduire les animations" est actif, ou avec ?s3d=off
     (ou localStorage.vafm_s3d = 'off').
   ========================================================================== */
(function () {
    'use strict';

    if (window.__vafmScroll3d) return;
    window.__vafmScroll3d = true;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var off = /[?&]s3d=off/.test(location.search);
    try { off = off || localStorage.getItem('vafm_s3d') === 'off'; } catch (e) { /* non bloquant */ }
    if (reduce || off) return;

    function init() {
        var ROOT = document.documentElement;
        var content = document.getElementById('content');
        if (!content) return;

        var mqMobile = window.matchMedia('(max-width: 768px)');
        var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
        var LITE = (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
                   (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
                   (navigator.connection && navigator.connection.saveData);

        function intensity() { return LITE ? 0.5 : (mqMobile.matches ? 0.6 : 1); }
        function isAdminMode() {
            var c = document.body.classList;
            return c.contains('admin-logged-in') || c.contains('is-admin');
        }
        /* Qualité adaptative : 2 = complet, 1 = sections + titres (sans cartes), 0 = coupé.
           Si l'appareil rame pendant le défilement, on dégrade automatiquement. */
        var quality = 2;
        try { quality = Number(sessionStorage.getItem('vafm_s3d_q') || 2); } catch (e) { /* non bloquant */ }
        if (quality !== 0 && quality !== 1) quality = 2;
        if (quality === 0) return;
        function cardsOn() { return quality >= 2 && !LITE && !isAdminMode(); }

        /* ------------------------------ Scènes ------------------------------
           Pose = { rx, ry (degrés), tz, ty (px), s (échelle) }
           enter : pose de départ (revient à 0 quand la section arrive)
           exit  : pose d'arrivée quand la section quitte l'écran par le haut   */
        var SCENES = {
            recede: { origin: '50% 100%', enter: null,
                      exit: { rx: 14, tz: -200, ty: 80, s: 0.93 } },
            tilt:   { origin: '50% 0%',
                      enter: { rx: 34, tz: -280, ty: 50, s: 0.94 },
                      exit: { rx: -8, tz: -140, s: 0.97 } },
            swingL: { origin: '0% 50%',
                      enter: { ry: -34, tz: -260, ty: 30, s: 0.95 },
                      exit: { ry: 10, tz: -150, s: 0.97 } },
            zoom:   { origin: '50% 50%',
                      enter: { rx: 8, tz: -560, ty: 70, s: 0.88 },
                      exit: { rx: -10, tz: -220, s: 0.95 } },
            swingR: { origin: '100% 50%',
                      enter: { ry: 34, tz: -260, ty: 30, s: 0.95 },
                      exit: { ry: -10, tz: -150, s: 0.97 } }
        };
        var SECTION_SCENES = {
            'home': 'recede',
            'actus': 'tilt',
            'dedicace-form-section': 'swingL',
            'videos': 'zoom',
            'emissions': 'swingR'
        };
        var CYCLE = ['tilt', 'swingL', 'zoom', 'swingR'];
        var cycleIndex = 0;

        /* ------------------------------ Éléments ------------------------------ */
        var items = [];
        var activeSet = new Set();
        var contentTop = 0;
        var docH = 0;

        function pose(p) {
            p = p || {};
            return [p.rx || 0, p.ry || 0, p.tz || 0, p.ty || 0, p.s == null ? 1 : p.s];
        }

        function register(el, kind, sceneKey, opts) {
            if (el.__s3d) return el.__s3d;
            opts = opts || {};
            var scene = opts.scene || SCENES[sceneKey];
            var it = {
                el: el, kind: kind, scene: scene,
                enter: pose(scene.enter), exit: pose(scene.exit),
                hasEnter: !!scene.enter, hasExit: !!scene.exit,
                a: opts.a == null ? 1.0 : opts.a,
                b: opts.b == null ? 0.3 : opts.b,
                delay: 0, top: 0, h: 0,
                active: false, snap: true, atRest: true,
                cur: [0, 0, 0, 0, 1],
                tilt: { rx: 0, ry: 0, trx: 0, try_: 0 },
                canTilt: !!opts.tilt
            };
            el.__s3d = it;
            el.classList.add('s3d-item');
            el.style.setProperty('--s3d-origin', scene.origin);
            if (kind === 'card' && el.parentElement) el.parentElement.classList.add('s3d-grid');
            items.push(it);
            io.observe(el);
            return it;
        }

        function scan() {
            // Sections de la page d'accueil : une scène différente pour chacune
            var secs = content.querySelectorAll(':scope > section');
            for (var i = 0; i < secs.length; i++) {
                var s = secs[i];
                if (s.__s3d || s.hasAttribute('data-s3d-skip')) continue;
                var key = SECTION_SCENES[s.id];
                if (!key) { key = CYCLE[cycleIndex % CYCLE.length]; cycleIndex++; }
                register(s, 'section', key);
            }

            // Titres de section : bascule depuis leur bord bas
            var titles = content.querySelectorAll('.section-header h2');
            for (var t = 0; t < titles.length; t++) {
                var h = titles[t];
                if (h.__s3d) continue;
                if (window.getComputedStyle(h).display === 'inline') h.style.display = 'inline-block';
                register(h, 'title', null, {
                    scene: { origin: '50% 100%', enter: { rx: -80, ty: 30 } },
                    a: 0.98, b: 0.72
                });
            }

            // Cartes (news, vidéos, bento) : entrée 3D + inclinaison au survol
            var cards = content.querySelectorAll('.card, .vafm-video-card, .news-card-bento, .dedicace-form-card');
            for (var c = 0; c < cards.length; c++) {
                var card = cards[c];
                if (card.__s3d) continue;
                var isForm = card.classList.contains('dedicace-form-card');
                register(card, 'card', null, {
                    scene: {
                        origin: '50% 100%',
                        enter: isForm ? null : { rx: 24, ry: 0, tz: -140, ty: 60, s: 0.95 }
                    },
                    a: 1.05, b: 0.62, tilt: true
                });
            }
        }

        /* ------------------------------ Mesures ------------------------------ */
        function docTop(el) {
            var t = 0;
            while (el) { t += el.offsetTop || 0; el = el.offsetParent; }
            return t;
        }

        function measure() {
            for (var i = items.length - 1; i >= 0; i--) {
                if (!items[i].el.isConnected) {
                    io.unobserve(items[i].el);
                    activeSet.delete(items[i]);
                    items.splice(i, 1);
                }
            }

            var rows = new Map(); // pour décaler les cartes d'une même rangée
            items.forEach(function (it) {
                var shown = it.el.offsetParent !== null;
                it.top = shown ? docTop(it.el) : -99999;
                it.h = shown ? it.el.offsetHeight : 0;

                if (it.kind === 'card' && shown) {
                    var key = (it.el.parentElement ? (it.el.parentElement.__rowId || (it.el.parentElement.__rowId = Math.random())) : 0) + ':' + Math.round(it.top / 12);
                    var col = rows.get(key) || 0;
                    rows.set(key, col + 1);
                    it.delay = Math.min(col, 3) * 0.07;
                    if (it.hasEnter) it.enter[1] = (col % 2 ? 8 : -8); // légère rotation alternée
                }
            });

            contentTop = docTop(content);
            docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            request();
        }

        /* ------------------------------ Calculs ------------------------------ */
        function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

        function targetFor(it, y, vh, k, out) {
            out[0] = out[1] = out[2] = out[3] = 0; out[4] = 1;
            var tv = it.top - y;

            if (it.hasEnter) {
                var e = clamp((vh * it.a - tv) / (vh * (it.a - it.b)), 0, 1);
                if (it.delay) e = clamp((e - it.delay) / (1 - it.delay), 0, 1);
                var f = Math.pow(1 - e, 3); // ease-out cubique
                out[0] += it.enter[0] * f * k;
                out[1] += it.enter[1] * f * k;
                out[2] += it.enter[2] * f * k;
                out[3] += it.enter[3] * f;
                out[4] *= 1 + (it.enter[4] - 1) * f * k;
            }

            if (it.hasExit && it.kind === 'section') {
                var bv = tv + it.h;
                var x = clamp((vh * 0.55 - bv) / (vh * 0.55), 0, 1);
                var g = x * x; // ease-in
                out[0] += it.exit[0] * g * k;
                out[1] += it.exit[1] * g * k;
                out[2] += it.exit[2] * g * k;
                out[3] += it.exit[3] * g;
                out[4] *= 1 + (it.exit[4] - 1) * g * k;
            }
        }

        // Combine rotation X puis Y en une seule rotation axe/angle (propriété CSS `rotate`)
        function axisAngle(rx, ry) {
            var d = Math.PI / 360; // degrés → demi-angle en radians
            var sx = Math.sin(rx * d), cx = Math.cos(rx * d);
            var sy = Math.sin(ry * d), cy = Math.cos(ry * d);
            var w = cy * cx;
            var vx = cy * sx, vy = cx * sy, vz = -sy * sx;
            var n = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (n < 1e-6) return '';
            var ang = 2 * Math.atan2(n, w) * 180 / Math.PI;
            return (vx / n).toFixed(4) + ' ' + (vy / n).toFixed(4) + ' ' + (vz / n).toFixed(4) + ' ' + ang.toFixed(3) + 'deg';
        }

        function applyPose(it, c) {
            var rest = Math.abs(c[0]) < 0.02 && Math.abs(c[1]) < 0.02 &&
                       Math.abs(c[2]) < 0.4 && Math.abs(c[3]) < 0.4 &&
                       Math.abs(c[4] - 1) < 0.0008;
            var st = it.el.style;
            if (rest) {
                if (!it.atRest) { st.rotate = ''; st.translate = ''; st.scale = ''; it.atRest = true; }
                return;
            }
            it.atRest = false;
            st.rotate = axisAngle(c[0], c[1]);
            st.translate = '0px ' + c[3].toFixed(1) + 'px ' + c[2].toFixed(1) + 'px';
            st.scale = c[4].toFixed(4);
        }

        /* ------------------------------ Boucle ------------------------------ */
        var raf = 0, lastT = 0, lastY = -1, lastOrigin = -1;
        var sampleN = 0, sampleBad = 0, dead = false;

        function degrade() {
            quality = Math.max(0, quality - 1);
            try { sessionStorage.setItem('vafm_s3d_q', String(quality)); } catch (e) { /* non bloquant */ }
            if (quality === 0) shutdown();
        }

        function shutdown() {
            dead = true;
            ROOT.classList.remove('s3d-on');
            items.forEach(function (it) {
                it.el.style.rotate = ''; it.el.style.translate = ''; it.el.style.scale = '';
                it.el.classList.remove('s3d-live');
            });
            content.style.perspectiveOrigin = '';
        }
        var tmp = [0, 0, 0, 0, 1];
        var bar = null, barShown = false;

        function request() {
            if (!raf) raf = requestAnimationFrame(frame);
        }

        function frame(now) {
            raf = 0;
            if (dead) return;
            var y = window.pageYOffset || document.documentElement.scrollTop || 0;
            var vh = window.innerHeight;
            var rawDt = ((now - lastT) / 1000) || 0.016;
            var dt = Math.min(0.05, rawDt);
            lastT = now;

            // Surveillance de la fluidité (uniquement pendant un défilement continu)
            if (rawDt < 0.1 && Math.abs(y - lastY) > 0.5) {
                sampleN++;
                if (rawDt > 0.025) sampleBad++;
                if (sampleN >= 60) {
                    var ratio = sampleBad / sampleN;
                    sampleN = 0; sampleBad = 0;
                    if (ratio > 0.2) degrade();
                    if (dead) return;
                }
            }
            var k = intensity();
            var lerp = 1 - Math.exp(-dt * 10);
            var cards = cardsOn();
            var busy = false;

            // Barre de progression de lecture
            if (bar) {
                bar.style.transform = 'scaleX(' + clamp(y / docH, 0, 1).toFixed(4) + ')';
                if (!barShown && y > 30) { bar.classList.add('visible'); barShown = true; }
                if (barShown && y <= 30) { bar.classList.remove('visible'); barShown = false; }
            }

            // Point de fuite de la perspective = centre de l'écran (en coordonnées de #content)
            var oy = Math.round(y + vh / 2 - contentTop);
            if (Math.abs(oy - lastOrigin) >= 2) {
                content.style.perspectiveOrigin = '50% ' + oy + 'px';
                lastOrigin = oy;
            }

            activeSet.forEach(function (it) {
                var skip = (it.kind === 'card' && !cards);
                if (skip) { tmp[0] = tmp[1] = tmp[2] = tmp[3] = 0; tmp[4] = 1; }
                else targetFor(it, y, vh, k, tmp);

                // inclinaison au survol (cartes)
                var tl = it.tilt;
                if (skip) { tl.trx = 0; tl.try_ = 0; }
                tl.rx += (tl.trx - tl.rx) * lerp;
                tl.ry += (tl.try_ - tl.ry) * lerp;

                var c = it.cur;
                if (it.snap) {
                    for (var i = 0; i < 5; i++) c[i] = tmp[i];
                    it.snap = false;
                } else {
                    for (var j = 0; j < 5; j++) {
                        var diff = tmp[j] - c[j];
                        c[j] += diff * lerp;
                        if (Math.abs(diff) > (j === 4 ? 0.0006 : 0.05)) busy = true;
                    }
                }
                if (Math.abs(tl.trx - tl.rx) > 0.02 || Math.abs(tl.try_ - tl.ry) > 0.02) busy = true;

                // pose finale = pose de scroll + inclinaison
                var fx = c[0] + tl.rx, fy = c[1] + tl.ry;
                if (tl.rx || tl.ry) {
                    var save0 = c[0], save1 = c[1];
                    c[0] = fx; c[1] = fy;
                    applyPose(it, c);
                    c[0] = save0; c[1] = save1;
                } else {
                    applyPose(it, c);
                }
            });

            if (busy || Math.abs(y - lastY) > 0.5) request();
            lastY = y;
        }

        /* ------------------------ Visibilité (IntersectionObserver) ------------------------ */
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                var it = en.target.__s3d;
                if (!it) return;
                if (en.isIntersecting) {
                    if (!it.active) {
                        it.active = true;
                        it.snap = true;
                        activeSet.add(it);
                        it.el.classList.add('s3d-live');
                    }
                } else if (it.active) {
                    it.active = false;
                    activeSet.delete(it);
                    it.el.classList.remove('s3d-live');
                    it.cur = [0, 0, 0, 0, 1];
                    it.atRest = false;
                    applyPose(it, it.cur); // retire les styles : plus de calque GPU inutile
                }
            });
            request();
        }, { rootMargin: '35% 0px 35% 0px', threshold: 0 });

        /* ------------------------ Inclinaison au survol (souris) ------------------------ */
        var hovered = null, tiltRaf = 0, lastEvt = null;

        function clearHover() {
            if (hovered) { hovered.tilt.trx = 0; hovered.tilt.try_ = 0; hovered = null; request(); }
        }

        function onPointerMove(e) {
            if (!mqFine.matches || !cardsOn() || e.pointerType === 'touch') return;
            lastEvt = e;
            if (tiltRaf) return;
            tiltRaf = requestAnimationFrame(function () {
                tiltRaf = 0;
                var ev = lastEvt;
                var el = ev.target.closest ? ev.target.closest('.s3d-item') : null;
                while (el && (!el.__s3d || !el.__s3d.canTilt)) {
                    el = el.parentElement ? el.parentElement.closest('.s3d-item') : null;
                }
                var it = el && el.__s3d;
                if (hovered && hovered !== it) { hovered.tilt.trx = 0; hovered.tilt.try_ = 0; }
                hovered = it || null;
                if (!it) { request(); return; }
                var r = el.getBoundingClientRect();
                var px = clamp((ev.clientX - r.left) / Math.max(1, r.width), 0, 1) - 0.5;
                var py = clamp((ev.clientY - r.top) / Math.max(1, r.height), 0, 1) - 0.5;
                it.tilt.try_ = px * 12;   // rotation autour de Y
                it.tilt.trx = -py * 9;    // rotation autour de X
                request();
            });
        }

        /* ------------------------------ Démarrage ------------------------------ */
        bar = document.createElement('div');
        bar.id = 's3d-progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);

        ROOT.classList.add('s3d-on');
        scan();
        measure();

        var timer = 0;
        function later() {
            clearTimeout(timer);
            timer = setTimeout(function () { scan(); measure(); }, 150);
        }

        window.addEventListener('scroll', request, { passive: true });
        window.addEventListener('resize', later, { passive: true });
        window.addEventListener('load', later);
        content.addEventListener('pointermove', onPointerMove, { passive: true });
        content.addEventListener('pointerleave', clearHover, { passive: true });
        if (mqMobile.addEventListener) mqMobile.addEventListener('change', later);

        if (window.ResizeObserver) new ResizeObserver(later).observe(content);
        if (window.MutationObserver) {
            // Les cartes sont créées dynamiquement (API) : on les prend en charge au fil de l'eau.
            new MutationObserver(later).observe(content, { childList: true, subtree: true });
        }

        window.VAFM_SCROLL3D = { refresh: function () { scan(); measure(); } };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();