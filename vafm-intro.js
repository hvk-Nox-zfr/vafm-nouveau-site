/* ==========================================================================
   VAFM — Présentation 3D au défilement (vafm-intro.js)
   --------------------------------------------------------------------------
   Crée tout en haut de la page d'accueil une scène "produit" façon Apple :
   un appareil VAFM en 3D tourne, change d'écran (Live → Actus → Dédicaces →
   Vidéos) puis zoome dans l'écran, pendant que les textes apparaissent.

   - Zéro dépendance, zéro image lourde : tout est en CSS 3D + ~10 Ko de JS.
   - La section est insérée automatiquement au début de #content.
   - Données réelles : titre en cours (#current-track), actus et dédicaces
     déjà présentes sur la page (aucune requête réseau supplémentaire).
   - Accessible : texte lisible, mode "sans animation" si l'utilisateur a
     demandé de réduire les animations.
   - Débrayable : ?intro=off dans l'adresse (ou localStorage.vafm_intro='off').
   ========================================================================== */
(function () {
    'use strict';

    if (window.__vafmIntro) return;
    window.__vafmIntro = true;

    var off = /[?&]intro=off/.test(location.search);
    try { off = off || localStorage.getItem('vafm_intro') === 'off'; } catch (e) { /* non bloquant */ }
    if (off) return;

    var LOGO = 'VAFM logo rouge.png';

    /* ------------------------------ Contenu ------------------------------ */
    // *mot* = mot en dégradé. win = fenêtre d'affichage (progression 0 → 1)
    var STEPS = [
        { pos: 'center', hero: true, win: [-0.06, 0.115], logo: true,
          kicker: 'Bienvenue sur', h: 'La radio *qu\'il vous faut.*',
          p: 'Musique, actus locales, dédicaces et vidéos : tout VAFM, au même endroit.' },
        { pos: 'left', win: [0.19, 0.35],
          kicker: 'En direct', h: 'Écoutez *24h/24.*',
          p: 'Un clic suffit. La radio vous suit partout, sur téléphone comme sur ordinateur.' },
        { pos: 'right', win: [0.39, 0.55],
          kicker: 'Actualités', h: 'Toute l\'actu *de chez vous.*',
          p: 'Culture, sport, société, faits divers : l\'info locale, racontée par l\'équipe VAFM.' },
        { pos: 'left', win: [0.59, 0.74],
          kicker: 'Dédicaces', h: 'Votre message *à l\'antenne.*',
          p: 'Envoyez une dédicace en quelques secondes : elle défile en haut du site pour tout le monde.' },
        { pos: 'right', win: [0.775, 0.885],
          kicker: 'Vidéos & émissions', h: 'Regardez. *Revivez.*',
          p: 'Les vidéos et la grille des émissions, toujours à portée de main.' },
        { pos: 'center', win: [0.915, 1.08], cta: true,
          kicker: 'VAFM', h: 'Prêt ? *C\'est parti.*',
          p: '' }
    ];

    // Pose de l'appareil. x, y en % de la scène ; rotations en degrés ; s = échelle ('cover' = remplit l'écran)
    var KEYS = [
        { t: 0.00, ry: 168, rx: 18, rz: -6, x: 0,   y: 30, z: -300, s: 0.62 },
        { t: 0.12, ry: 186, rx: 14, rz: -3, x: 0,   y: 27, z: -220, s: 0.66 },
        { t: 0.22, ry: 350, rx: 6,  rz: 0,  x: 21,  y: 0,  z: 0,    s: 1.00 },
        { t: 0.33, ry: 342, rx: 5,  rz: 0,  x: 21,  y: 0,  z: 20,   s: 1.02 },
        { t: 0.42, ry: 392, rx: 8,  rz: 1,  x: -21, y: 0,  z: 0,    s: 1.00 },
        { t: 0.53, ry: 388, rx: 7,  rz: 1,  x: -21, y: 0,  z: 20,   s: 1.02 },
        { t: 0.62, ry: 330, rx: 8,  rz: -1, x: 21,  y: 0,  z: 0,    s: 1.00 },
        { t: 0.72, ry: 334, rx: 7,  rz: -1, x: 21,  y: 0,  z: 20,   s: 1.02 },
        { t: 0.80, ry: 384, rx: 14, rz: 0,  x: -17, y: 2,  z: 0,    s: 1.00 },
        { t: 0.86, ry: 380, rx: 12, rz: 0,  x: -15, y: 2,  z: 30,   s: 1.02 },
        { t: 0.94, ry: 360, rx: 0,  rz: 0,  x: 0,   y: 0,  z: 60,   s: 1.10 },
        { t: 1.00, ry: 360, rx: 0,  rz: 0,  x: 0,   y: 0,  z: 0,    s: 'cover' }
    ];

    // Écran affiché selon la progression : [début, fin] de pleine visibilité
    var SCREENS = [
        { cls: 'vi-s-live', win: [-1, 0.37] },
        { cls: 'vi-s-news', win: [0.36, 0.56] },
        { cls: 'vi-s-ded',  win: [0.55, 0.755] },
        { cls: 'vi-s-vid',  win: [0.74, 2] }
    ];

    // Bulles flottantes (positions en largeur/hauteur d'appareil autour de lui)
    var CHIPS = [
        { icon: '🎧', txt: 'En direct 24h/24',        win: [0.17, 0.36], cx: -0.62, cy: -0.30, z: 130, m: 1 },
        { icon: '🎵', txt: 'Le meilleur son',         win: [0.20, 0.36], cx: 0.60,  cy: 0.40,  z: 60 },
        { icon: '📰', txt: 'L\'actu locale',          win: [0.38, 0.55], cx: 0.62,  cy: -0.34, z: 140, m: 1 },
        { icon: '✨', txt: 'À la une',                win: [0.40, 0.55], cx: -0.58, cy: 0.42,  z: 40 },
        { icon: '💬', txt: 'Dédicaces',               win: [0.58, 0.74], cx: -0.60, cy: -0.32, z: 130, m: 1 },
        { icon: '❤️', txt: 'Votre message à l\'antenne', win: [0.60, 0.74], cx: 0.58, cy: 0.38, z: 70 },
        { icon: '🎬', txt: 'Vidéos',                  win: [0.765, 0.885], cx: 0.62, cy: -0.30, z: 120, m: 1 },
        { icon: '🎙️', txt: 'Émissions',               win: [0.775, 0.885], cx: -0.56, cy: 0.40, z: 50 }
    ];

    var STEP_CENTERS = [0.03, 0.27, 0.47, 0.665, 0.83, 0.975];

    /* ------------------------------ Utilitaires ------------------------------ */
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
    function lerp(a, b, u) { return a + (b - a) * u; }
    // fenêtre 0 → 1 → 0 avec fondus de longueur f
    function win(p, a, b, f) { return clamp((p - a) / f, 0, 1) * clamp((b - p) / f, 0, 1); }
    // N'écrit dans le DOM que si la valeur a changé (réduit fortement le travail par frame)
    function setOp(el, v) {
        var t = v < 0.004 ? '0' : v.toFixed(3);
        if (el._o !== t) {
            el._o = t;
            el.style.opacity = t;
            var hide = t === '0';
            if (el._h !== hide) { el._h = hide; el.style.visibility = hide ? 'hidden' : 'visible'; }
        }
    }
    function setTf(el, v) { if (el._t !== v) { el._t = v; el.style.transform = v; } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function headlineHtml(str) {
        var grad = false, out = '';
        str.split('*').forEach(function (seg, idx) {
            grad = idx % 2 === 1;
            seg.split(/\s+/).filter(Boolean).forEach(function (w) {
                out += '<span class="vi-w' + (grad ? ' grad' : '') + '">' + esc(w) + '</span> ';
            });
        });
        return out;
    }

    /* ------------------------------ Construction ------------------------------ */
    function build() {
        var eq = '';
        for (var i = 0; i < 20; i++) {
            var h = (0.35 + Math.abs(Math.sin(i * 1.7)) * 0.65).toFixed(2);
            eq += '<i style="--h:' + h + ';--d:' + ((i * 0.137) % 1.1).toFixed(2) + '"></i>';
        }

        var slices = '';
        for (var s = 0; s < 4; s++) slices += '<div class="vi-slice" style="--i:' + s + '"></div>';

        var copy = STEPS.map(function (st, i) {
            return '<div class="vi-t ' + st.pos + (st.hero ? ' hero' : '') + (st.cta ? ' cta' : '') + '" data-i="' + i + '"><div class="vi-ti">' +
                (st.logo ? '<img class="vi-logo-big" src="' + LOGO + '" alt="VAFM" width="340" height="120">' : '') +
                '<p class="vi-kicker">' + esc(st.kicker) + '</p>' +
                '<h2 class="vi-h">' + headlineHtml(st.h) + '</h2>' +
                (st.p ? '<p class="vi-p">' + esc(st.p) + '</p>' : '') +
                (st.cta ? '<div class="vi-btns"><button type="button" class="vi-btn primary" data-act="play">▶ Écouter en direct</button>' +
                          '<button type="button" class="vi-btn ghost" data-act="next">Découvrir l\'actu ↓</button></div>' : '') +
                '</div></div>';
        }).join('');

        var chips = CHIPS.map(function (c) {
            return '<div class="vi-chip"><b>' + c.icon + '</b>' + esc(c.txt) + '</div>';
        }).join('');

        var steps = STEPS.map(function (_, i) { return '<button type="button" class="vi-step" data-step="' + i + '" aria-label="Étape ' + (i + 1) + '"></button>'; }).join('');

        var sec = document.createElement('section');
        sec.id = 'vafm-intro';
        sec.className = 'vi';
        sec.setAttribute('data-s3d-skip', '');
        sec.setAttribute('aria-label', 'Présentation de VAFM');
        sec.innerHTML =
            '<div class="vi-track"><div class="vi-stage">' +
              '<div class="vi-bg" aria-hidden="true">' +
                '<div class="vi-stars"></div>' +
                '<div class="vi-orb vi-orb-a"></div><div class="vi-orb vi-orb-b"></div><div class="vi-orb vi-orb-c"></div><div class="vi-orb vi-orb-d"></div>' +
                '<div class="vi-rings"><div class="vi-ring"></div><div class="vi-ring"></div><div class="vi-ring"></div></div>' +
              '</div>' +
              '<div class="vi-scene" aria-hidden="true">' +
                '<div class="vi-device">' + slices +
                  '<div class="vi-back"><img src="' + LOGO + '" alt="" width="200" height="70"></div>' +
                  '<div class="vi-shadow"></div>' +
                  '<div class="vi-screen">' +
                    // Live
                    '<div class="vi-s vi-s-live">' +
                      '<div class="vi-bar"><img src="' + LOGO + '" alt=""><span class="vi-pill"><i class="vi-dot"></i>EN DIRECT</span></div>' +
                      '<div class="vi-live-body"><div class="vi-vinyl"></div>' +
                        '<div class="vi-now"><div class="vi-sub">En ce moment</div><div class="vi-track-name" id="vi-track">VAFM en Direct</div>' +
                          '<div class="vi-sub" id="vi-artist">Le meilleur son</div>' +
                          '<div class="vi-eq">' + eq + '</div>' +
                          '<div class="vi-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>' +
                        '</div></div>' +
                    '</div>' +
                    // Actus
                    '<div class="vi-s vi-s-news">' +
                      '<div class="vi-bar"><div class="vi-title">À la une</div><span class="vi-sub">Actualités</span></div>' +
                      '<div class="vi-news" id="vi-news"><div class="vi-card"><span>Toute l\'actu locale</span></div><div class="vi-card"><span>Culture &amp; sorties</span></div><div class="vi-card"><span>Sport</span></div></div>' +
                    '</div>' +
                    // Dédicaces
                    '<div class="vi-s vi-s-ded">' +
                      '<div class="vi-bar"><div class="vi-title">Dédicaces</div><span class="vi-sub">En haut du site</span></div>' +
                      '<div class="vi-ded" id="vi-ded"><div class="vi-bubble">Une dédicace pour toute la famille 🎶</div><div class="vi-bubble">Pour tous les auditeurs !</div><div class="vi-bubble">Bonne écoute à tous 🎧</div></div>' +
                      '<div class="vi-input"><span>Votre message…</span><em>0/30</em></div>' +
                    '</div>' +
                    // Vidéos & émissions
                    '<div class="vi-s vi-s-vid">' +
                      '<div class="vi-bar"><div class="vi-title">Vidéos &amp; émissions</div><span class="vi-sub">VAFM</span></div>' +
                      '<div class="vi-grid"><div class="vi-tile">Vidéos</div><div class="vi-tile">Émissions</div><div class="vi-tile">Interviews</div><div class="vi-tile">Replay</div></div>' +
                    '</div>' +
                    '<div class="vi-glare"></div>' +
                  '</div>' +
                '</div>' +
                chips +
              '</div>' +
              '<div class="vi-dim"></div>' +
              '<div class="vi-copy">' + copy + '</div>' +
              '<div class="vi-hint"><div class="vi-mouse"></div>Faites défiler</div>' +
              '<div class="vi-steps">' + steps + '</div>' +
              '<div class="vi-prog"></div>' +
              '<div class="vi-cover"></div>' +
            '</div></div>';
        return sec;
    }

    /* ------------------------------ Démarrage ------------------------------ */
    function boot() {
        var content = document.getElementById('content');
        if (!content || document.getElementById('vafm-intro')) return;

        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var LITE = (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
                   (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
                   (navigator.connection && navigator.connection.saveData);
        var supportsClip = !(window.CSS && CSS.supports) || CSS.supports('overflow-x', 'clip');
        var STATIC = reduce || LITE || !supportsClip;
        var mqMobile = window.matchMedia('(max-width: 760px)');

        var sec = build();
        content.insertBefore(sec, content.firstChild);
        if (STATIC) sec.classList.add('vi-static'); else document.documentElement.classList.add('vi-on');
        try { if (sessionStorage.getItem('vafm_intro_lite') === '1') sec.classList.add('vi-lite'); } catch (e) { /* non bloquant */ }

        var track = sec.querySelector('.vi-track');
        var stage = sec.querySelector('.vi-stage');
        var device = sec.querySelector('.vi-device');
        var glare = sec.querySelector('.vi-glare');
        var stars = sec.querySelector('.vi-stars');
        var rings = sec.querySelector('.vi-rings');
        var orbs = [].slice.call(sec.querySelectorAll('.vi-orb'));
        var screens = SCREENS.map(function (s) { return sec.querySelector('.' + s.cls); });
        var texts = [].slice.call(sec.querySelectorAll('.vi-t'));
        var words = texts.map(function (t) { return [].slice.call(t.querySelectorAll('.vi-w')); });
        var tInner = texts.map(function (t) { return t.querySelector('.vi-ti'); });
        var chipEls = [].slice.call(sec.querySelectorAll('.vi-chip'));
        var stepEls = [].slice.call(sec.querySelectorAll('.vi-step'));
        var scene = sec.querySelector('.vi-scene');
        var cover = sec.querySelector('.vi-cover');
        var next = sec.nextElementSibling;   // le hero : il remontera par-dessus la scène
        if (next && !STATIC) next.classList.add('vi-next'); else next = null;
        var dim = sec.querySelector('.vi-dim');
        var hint = sec.querySelector('.vi-hint');
        var prog = sec.querySelector('.vi-prog');

        // Dimensions mesurées (pas de lecture de layout pendant l'animation)
        var M = { sw: 1, sh: 1, dw: 1, dh: 1, trackH: 1, dist: 1, top: 116, cover: 3, stageH: 1, cw: [], ovl: 0 };
        function measure() {
            var pt = parseFloat(window.getComputedStyle(content).paddingTop) || 116;
            M.top = pt;
            sec.style.setProperty('--vi-top', pt + 'px');
            M.sw = scene.offsetWidth || window.innerWidth;
            M.sh = scene.offsetHeight || window.innerHeight;       // zone libre (hors lecteur audio)
            M.stageH = stage.offsetHeight || window.innerHeight;
            M.dw = device.offsetWidth || 600;
            M.dh = device.offsetHeight || 450;
            M.trackH = track.offsetHeight;
            M.cw = chipEls.map(function (c) { return c.offsetWidth || 120; });
            M.ovl = next ? M.stageH : 0;
            if (next) {
                sec.style.setProperty('--vi-overlap', M.ovl + 'px');
                next.style.setProperty('--vi-overlap', M.ovl + 'px');
            }
            M.trackH = track.offsetHeight;
            M.dist = Math.max(1, M.trackH - M.stageH - M.ovl);
            M.cover = Math.max(M.sw / (M.dw * 0.95), (M.sh + 2 * (M.stageH - M.sh)) / (M.dh * 0.95)) * 1.03;
        }

        function pose(p) {
            var i = 0;
            while (i < KEYS.length - 2 && p > KEYS[i + 1].t) i++;
            var a = KEYS[i], b = KEYS[i + 1];
            var u = ease(clamp((p - a.t) / (b.t - a.t), 0, 1));
            var sa = a.s === 'cover' ? M.cover : a.s;
            var sb = b.s === 'cover' ? M.cover : b.s;
            return {
                rx: lerp(a.rx, b.rx, u), ry: lerp(a.ry, b.ry, u), rz: lerp(a.rz, b.rz, u),
                x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), s: lerp(sa, sb, u)
            };
        }

        /* ------------------------------ Rendu ------------------------------ */
        function render(p, t, q) {
            q = q || 0;
            var mob = mqMobile.matches;
            var P = pose(p);
            var zoomK = 1 - clamp((p - 0.9) / 0.1, 0, 1); // le flottement s'éteint pendant le zoom final
            var fl = Math.sin(t / 1300) * zoomK;
            var X = mob ? 0 : P.x / 100 * M.sw;
            var Y = P.y / 100 * M.sh + (mob ? M.sh * 0.17 : 0) + fl * 5;
            var rz = P.rz + fl * 0.5;
            var rx = P.rx + Math.cos(t / 1700) * 0.6 * zoomK;

            device.style.transform = 'translate3d(' + X.toFixed(1) + 'px,' + Y.toFixed(1) + 'px,' + P.z.toFixed(1) + 'px) ' +
                'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + P.ry.toFixed(2) + 'deg) rotateZ(' + rz.toFixed(2) + 'deg) scale(' + P.s.toFixed(4) + ')';

            // reflet qui glisse selon l'angle
            var ang = ((P.ry % 360) + 360) % 360;
            glare.style.transform = 'translateX(' + ((ang - 180) / 180 * 38).toFixed(1) + '%)';

            // écrans
            for (var i = 0; i < screens.length; i++) {
                var w = SCREENS[i].win;
                var op = clamp((p - (w[0] - 0.02)) / 0.04, 0, 1) * clamp((w[1] + 0.02 - p) / 0.04, 0, 1);
                if (i === 0 && p < w[1]) op = clamp((w[1] + 0.02 - p) / 0.04, 0, 1);
                if (i === 3 && p > w[0]) op = clamp((p - (w[0] - 0.02)) / 0.04, 0, 1);
                setOp(screens[i], op);
            }

            // textes
            for (var k = 0; k < texts.length; k++) {
                var st = STEPS[k];
                var f = 0.035;
                var inP = clamp((p - st.win[0]) / f, 0, 1);
                var outP = clamp((st.win[1] - p) / f, 0, 1);
                var a = inP * outP * (1 - clamp(q * 2.2, 0, 1));
                var el = texts[k];
                setOp(el, a);
                if (st.cta) { var pe = a > 0.6 ? 'auto' : 'none'; if (el._pe !== pe) { el._pe = pe; el.style.pointerEvents = pe; } }
                if (a <= 0.001) continue;
                var shiftY = (1 - inP) * 46 - (1 - outP) * 34;
                setTf(tInner[k], 'translate3d(0,' + shiftY.toFixed(1) + 'px,0)');
                var ws = words[k];
                for (var wi = 0; wi < ws.length; wi++) {
                    var wp = clamp(inP * 1.7 - wi * 0.16, 0, 1);
                    setOp(ws[wi], wp);
                    setTf(ws[wi], 'translate3d(0,' + ((1 - wp) * 0.45).toFixed(3) + 'em,0)');
                }
            }

            // fond : halos qui se fondent d'une étape à l'autre
            var o0 = win(p, -0.2, 0.30, 0.2) + win(p, 0.52, 0.70, 0.08) * 0.8;
            var o1 = win(p, 0.14, 0.44, 0.08) + win(p, 0.84, 1.2, 0.1);
            var o2 = win(p, 0.34, 0.62, 0.08) + win(p, 0.74, 0.92, 0.06) * 0.8;
            var o3 = win(p, 0.54, 0.80, 0.08);
            var os = [o0, o1, o2, o3];
            for (var oi = 0; oi < orbs.length; oi++) {
                setOp(orbs[oi], clamp(os[oi], 0, 1));
            }
            setTf(stars, 'translate3d(0,' + (-p * 70).toFixed(0) + 'px,0)');
            setOp(rings, win(p, 0.14, 0.40, 0.06) * 0.9);

            // bulles flottantes
            for (var ci = 0; ci < CHIPS.length; ci++) {
                var c = CHIPS[ci], ce = chipEls[ci];
                var ca = win(p, c.win[0], c.win[1], 0.04);
                if (mob && !c.m) ca = 0;
                if (ca <= 0.001) { setOp(ce, 0); continue; }
                var drift = Math.sin(t / 900 + ci * 1.3) * 6 - (p - c.win[0]) * M.sh * 0.35;
                var cxp = X + c.cx * M.dw * P.s * (mob ? 0.95 : 1);
                var lim = M.sw / 2 - M.cw[ci] / 2 - 8; // la bulle reste toujours entièrement à l'écran
                cxp = clamp(cxp, -lim, lim);
                var cyp = Y + c.cy * M.dh * P.s + drift;
                setOp(ce, ca);
                ce.style.transform = 'translate3d(' + cxp.toFixed(1) + 'px,' + cyp.toFixed(1) + 'px,' + c.z + 'px) translate(-50%,-50%) scale(' + (0.85 + ca * 0.15).toFixed(3) + ')';
            }

            // indicateurs
            var cur = 0;
            for (var si = 0; si < STEP_CENTERS.length; si++) { if (p >= STEP_CENTERS[si] - 0.1) cur = si; }
            for (var di = 0; di < stepEls.length; di++) stepEls[di].classList.toggle('on', di === cur);
            setOp(dim, clamp((p - 0.915) / 0.06, 0, 1));
            setTf(stage, q > 0.001 ? 'scale(' + (1 - 0.07 * q).toFixed(4) + ')' : '');
            setOp(cover, q * 0.78);
            setOp(hint, 1 - clamp(p / 0.035, 0, 1));
            prog.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        }

        /* ------------------------------ Boucle ------------------------------ */
        var visible = false, raf = 0, last = 0, ps = 0, target = 0, nBad = 0, nTot = 0, degraded = false;

        function frame(now) {
            raf = 0;
            if (!visible) return;
            var dt = Math.min(0.05, ((now - last) / 1000) || 0.016);
            var raw = (now - last) / 1000;
            last = now;

            var rect = track.getBoundingClientRect();
            target = clamp((M.top - rect.top) / M.dist, 0, 1);
            ps += (target - ps) * (1 - Math.exp(-dt * 9));
            if (Math.abs(target - ps) < 0.0004) ps = target;

            var q = 0;
            if (next) q = clamp((M.top + M.stageH - next.getBoundingClientRect().top) / M.stageH, 0, 1);
            if (q < 0.999) render(ps, now, q);   // scène entièrement recouverte : inutile de la dessiner

            // Qualité adaptative : si ça rame, on retire les décors secondaires (bulles, anneaux, reflet)
            if (!degraded && raw < 0.1) {
                nTot++; if (raw > 0.026) nBad++;
                if (nTot >= 90) {
                    if (nBad / nTot > 0.25) {
                        degraded = true;
                        sec.classList.add('vi-lite');
                        try { sessionStorage.setItem('vafm_intro_lite', '1'); } catch (e) { /* non bloquant */ }
                    }
                    nTot = 0; nBad = 0;
                }
            }
            raf = requestAnimationFrame(frame);
        }

        function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

        if (STATIC) {
            // Version sans animation : un seul tableau, appareil de face, titre visible
            measure();
            M.cover = 1;
            var sp = pose(0.22);
            var tx = sec.querySelector('.vi-t[data-i="0"]');
            texts.forEach(function (t) { t.style.opacity = '0'; });
            tx.style.opacity = '1'; tx.style.visibility = 'visible';
            words[0].forEach(function (w) { w.style.opacity = '1'; });
            orbs[0].style.opacity = '.8'; orbs[0].style.visibility = 'visible';
            device.style.transform = 'translate3d(0,' + (M.sh * 0.2).toFixed(0) + 'px,0) rotateX(6deg) rotateY(' + (sp.ry - 360).toFixed(1) + 'deg) scale(.82)';
        } else {
            measure();
            var io = new IntersectionObserver(function (en) {
                visible = en[0].isIntersecting;
                if (visible) start();
            }, { rootMargin: '10% 0px 10% 0px' });
            io.observe(track);

            var t0 = 0;
            function later() { clearTimeout(t0); t0 = setTimeout(function () { measure(); if (visible) start(); }, 120); }
            window.addEventListener('resize', later, { passive: true });
            window.addEventListener('load', later);
            if (window.ResizeObserver) new ResizeObserver(later).observe(content);
            render(0, 0);
        }

        /* ------------------------------ Interactions ------------------------------ */
        function scrollToP(p) {
            var rect = track.getBoundingClientRect();
            var y = rect.top + window.pageYOffset - M.top + p * M.dist;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }

        sec.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-act],[data-step]') : null;
            if (!b) return;
            if (b.hasAttribute('data-step')) { scrollToP(STEP_CENTERS[Number(b.getAttribute('data-step'))]); return; }
            if (b.getAttribute('data-act') === 'play') {
                var pb = document.getElementById('playBtn');
                if (pb) pb.click();
            } else if (b.getAttribute('data-act') === 'next') {
                var nx = sec.nextElementSibling;
                if (nx) {
                    var y = nx.getBoundingClientRect().top + window.pageYOffset - M.top;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            }
        });

        /* ------------------------------ Données réelles ------------------------------ */
        var trackEl = sec.querySelector('#vi-track');
        var artistEl = sec.querySelector('#vi-artist');
        var newsEl = sec.querySelector('#vi-news');
        var dedEl = sec.querySelector('#vi-ded');

        function syncTrack() {
            var ct = document.getElementById('current-track');
            if (ct && ct.textContent.trim() && trackEl) trackEl.textContent = ct.textContent.trim();
            var ar = document.querySelector('.track-artist');
            if (ar && ar.textContent.trim() && artistEl) artistEl.textContent = ar.textContent.trim();
        }

        function bgUrl(el) {
            var bg = el.style.backgroundImage || (window.getComputedStyle(el).backgroundImage || '');
            var m = /url\((['"]?)(.*?)\1\)/.exec(bg);
            if (m) return m[2];
            var img = el.querySelector('img');
            return img ? (img.currentSrc || img.src) : '';
        }

        function syncNews() {
            var cards = document.querySelectorAll('#recent-news-grid .news-card-bento, #recent-news-grid .card');
            var tiles = newsEl.querySelectorAll('.vi-card');
            var n = 0;
            for (var i = 0; i < cards.length && n < 3; i++) {
                var tEl = cards[i].querySelector('.bento-title, .card-body h3, .card-body h2, h3, h4');
                var title = tEl ? tEl.textContent.trim() : '';
                if (!title) continue;
                var tile = tiles[n];
                tile.querySelector('span').textContent = title;
                var url = bgUrl(cards[i]);
                if (url) tile.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
                n++;
            }
        }

        function syncDed() {
            var items = document.querySelectorAll('#dedicaces-ticker-track .dedicaces-ticker-item');
            var seen = {}, html = '', n = 0;
            for (var i = 0; i < items.length && n < 4; i++) {
                var strong = items[i].querySelector('strong');
                var name = strong ? strong.textContent.trim() : '';
                var full = items[i].textContent.trim();
                if (seen[full] || !full) continue;
                seen[full] = 1;
                var msg = name ? full.slice(name.length).replace(/^\s*:\s*/, '') : full;
                if (!msg) continue;
                html += '<div class="vi-bubble">' + (name ? '<b>' + esc(name) + '</b> ' : '') + esc(msg) + '</div>';
                n++;
            }
            if (html) dedEl.innerHTML = html;
        }

        function syncAll() { syncTrack(); syncNews(); syncDed(); }
        syncAll();

        var tmr = 0;
        function laterSync() { clearTimeout(tmr); tmr = setTimeout(syncAll, 500); }
        if (window.MutationObserver) {
            var mo = new MutationObserver(laterSync);
            ['current-track', 'recent-news-grid', 'dedicaces-ticker-track'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) mo.observe(n, { childList: true, subtree: true, characterData: true });
            });
        }
        // Les contenus dynamiques arrivent après le chargement : on réessaie un peu.
        var tries = 0, iv = setInterval(function () { syncAll(); if (++tries > 12) clearInterval(iv); }, 1500);

        window.VAFM_INTRO = { refresh: function () { measure(); syncAll(); } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();