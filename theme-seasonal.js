/* ==========================================================================
   VAFM — THÈMES SAISONNIERS (Halloween + Noël) — décors SVG dispersés
   --------------------------------------------------------------------------
   Les décors ne sont plus collés à l'écran : ils sont posés DANS la page
   (héros, coins des sections, bords des cartes) et défilent avec elle.
   Ils restent sous la barre de navigation et ne bloquent aucun clic.
   Seuls la neige (Noël) et les feuilles (Halloween) tombent par-dessus l'écran.
   ========================================================================== */
(function () {
'use strict';

const THEME_STORAGE_KEY = 'vafm_current_theme';
const VALID_THEMES = ['normal', 'halloween', 'noel'];
const ROOT_ID = 'seasonal-decor-container';
const FX_ID = 'seasonal-fx-container';

let currentTheme = 'normal';
let uid = 0;
let lastSig = '';
let safeTopCache = null;
const nextId = (p) => `${p}${++uid}`;

function rng(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = (a, b) => Math.random() * (b - a) + a;

/* ==========================================================================
   BIBLIOTHÈQUE D'ILLUSTRATIONS SVG  { w, h, f(opt) -> contenu SVG }
   ========================================================================== */
const A = {};

/* ---------- HALLOWEEN ---------- */

A.web = { w: 120, h: 120, f: (c = 'rgba(255,255,255,.65)') => `
  <g fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round">
    <path d="M0 0 L120 0 M0 0 L114 40 M0 0 L92 80 M0 0 L52 110 M0 0 L0 120"/>
    <path d="M24 0 Q20 20 0 24 M48 0 Q42 38 0 48 M74 0 Q64 60 0 74 M100 0 Q86 84 0 100"/>
  </g>
  <g transform="translate(70 62)"><circle r="4.5" fill="${c}"/><g stroke="${c}" stroke-width="1.6" stroke-linecap="round"><path d="M-3 -2 L-9 -7 M-3 1 L-10 2 M3 -2 L9 -7 M3 1 L10 2"/></g></g>` };

A.spider = { w: 100, h: 90, f: () => `
  <g stroke="#ff9900" stroke-width="6" stroke-linecap="round" fill="none">
    <path d="M26 34 Q8 14 2 30 M24 48 Q4 40 0 54 M26 62 Q8 68 6 82 M74 34 Q92 14 98 30 M76 48 Q96 40 100 54 M74 62 Q92 68 94 82"/>
  </g>
  <circle cx="50" cy="50" r="30" fill="#1b0b33" stroke="#ff9900" stroke-width="5"/>
  <circle cx="39" cy="44" r="10" fill="#fff"/><circle cx="61" cy="44" r="10" fill="#fff"/>
  <circle cx="41" cy="46" r="5" fill="#000"/><circle cx="59" cy="46" r="5" fill="#000"/>
  <circle cx="43" cy="44" r="1.8" fill="#fff"/><circle cx="61" cy="44" r="1.8" fill="#fff"/>
  <path d="M38 64 Q50 74 62 64" stroke="#ff9900" stroke-width="4" fill="none" stroke-linecap="round"/>
  <ellipse cx="27" cy="58" rx="5" ry="3" fill="#f472b6" opacity=".7"/><ellipse cx="73" cy="58" rx="5" ry="3" fill="#f472b6" opacity=".7"/>` };

A.pumpkin = { w: 120, h: 110, f: () => {
    const g = nextId('pg');
    return `
  <defs><radialGradient id="${g}" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#ffc15e"/><stop offset=".6" stop-color="#ff8a1f"/><stop offset="1" stop-color="#d9480f"/></radialGradient></defs>
  <path d="M56 24 Q52 6 68 2 Q64 14 70 24 Z" fill="#3f9b3f" stroke="#14532d" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M68 8 Q84 0 90 12" fill="none" stroke="#3f9b3f" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="60" cy="66" rx="53" ry="40" fill="url(#${g})" stroke="#7c2d12" stroke-width="3.5"/>
  <path d="M60 26 Q36 66 60 106 M60 26 Q84 66 60 106 M38 32 Q10 66 38 100 M82 32 Q110 66 82 100" fill="none" stroke="#c2410c" stroke-width="2.5" opacity=".6"/>
  <ellipse cx="32" cy="46" rx="9" ry="5" fill="#fff" opacity=".25" transform="rotate(-30 32 46)"/>
  <g class="hw-face" fill="#ffe066" stroke="#7c2d12" stroke-width="2" stroke-linejoin="round">
    <polygon points="30,58 52,58 41,40"/><polygon points="68,58 90,58 79,40"/>
    <polygon points="55,69 65,69 60,60"/>
    <path d="M28 76 L40 87 L48 77 L56 89 L64 77 L72 87 L80 77 L92 76 Q60 108 28 76 Z"/>
  </g>`; } };

A.ghost = { w: 100, h: 120, f: () => `
  <path d="M16 56 Q16 8 50 8 Q84 8 84 56 L84 108 Q75 98 67 108 Q58 98 50 108 Q42 98 33 108 Q25 98 16 108 Z" fill="#f3e8ff" stroke="#8b5cf6" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M16 62 Q0 66 4 82 Q14 78 16 72 Z M84 62 Q100 66 96 82 Q86 78 84 72 Z" fill="#f3e8ff" stroke="#8b5cf6" stroke-width="3" stroke-linejoin="round"/>
  <path d="M26 24 Q34 12 46 12" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>
  <g class="hw-eyes"><ellipse cx="38" cy="44" rx="6" ry="8.5" fill="#130924"/><ellipse cx="62" cy="44" rx="6" ry="8.5" fill="#130924"/></g>
  <ellipse cx="50" cy="68" rx="8" ry="11" fill="#130924"/>
  <ellipse cx="26" cy="58" rx="6" ry="3.5" fill="#f472b6" opacity=".65"/><ellipse cx="74" cy="58" rx="6" ry="3.5" fill="#f472b6" opacity=".65"/>` };

A.bat = { w: 80, h: 40, f: () => `
  <g fill="#1a0b2e" stroke="#a855f7" stroke-width="1.8" stroke-linejoin="round">
    <path d="M36 18 Q22 0 2 8 Q10 14 8 24 Q16 20 20 30 Q28 24 36 30 Z"/>
    <path d="M44 18 Q58 0 78 8 Q70 14 72 24 Q64 20 60 30 Q52 24 44 30 Z"/>
    <ellipse cx="40" cy="22" rx="7" ry="10"/>
    <path d="M34 14 L35 5 L39 12 Z M46 14 L45 5 L41 12 Z"/>
  </g>
  <circle cx="37.5" cy="20" r="1.8" fill="#ff3b3b"/><circle cx="42.5" cy="20" r="1.8" fill="#ff3b3b"/>
  <path d="M38 27 L39 30 L40 27 L41 30 L42 27" stroke="#fff" stroke-width="1" fill="none"/>` };

A.cauldron = { w: 110, h: 120, f: () => `
  <g class="hw-flames">
    <path d="M30 118 Q22 100 34 90 Q34 104 42 100 Q44 90 52 84 Q52 100 58 104 Q64 96 62 88 Q76 98 70 118 Z" fill="#ff7a00"/>
    <path d="M40 118 Q36 106 46 100 Q48 108 54 106 Q60 112 58 118 Z" fill="#ffd60a"/>
  </g>
  <path d="M16 46 Q8 92 34 102 L76 102 Q102 92 94 46 Z" fill="#2a2140" stroke="#ff9900" stroke-width="4"/>
  <path d="M28 54 Q26 80 36 92" stroke="#fff" stroke-opacity=".2" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="55" cy="46" rx="42" ry="11" fill="#1a1230" stroke="#ff9900" stroke-width="4"/>
  <ellipse cx="55" cy="46" rx="34" ry="7.5" fill="#4ade80"/>
  <g class="hw-bubbles" fill="#86efac" stroke="#16a34a" stroke-width="1.5">
    <circle class="b1" cx="40" cy="40" r="5"/><circle class="b2" cx="58" cy="38" r="7"/><circle class="b3" cx="72" cy="41" r="4"/>
  </g>
  <rect x="26" y="100" width="10" height="12" rx="3" fill="#1a1230" stroke="#ff9900" stroke-width="2"/>
  <rect x="74" y="100" width="10" height="12" rx="3" fill="#1a1230" stroke="#ff9900" stroke-width="2"/>` };

A.moon = { w: 100, h: 100, f: () => {
    const g = nextId('mg');
    return `
  <defs><radialGradient id="${g}" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".6" stop-color="#ffe9a6"/><stop offset="1" stop-color="#f5c84c"/></radialGradient></defs>
  <circle cx="50" cy="50" r="48" fill="#ffd86b" opacity=".16"/>
  <circle cx="50" cy="50" r="40" fill="url(#${g})" stroke="#e0a926" stroke-width="2.5"/>
  <g fill="#f2cf6a" opacity=".85"><circle cx="36" cy="40" r="7"/><circle cx="62" cy="58" r="9"/><circle cx="46" cy="70" r="4.5"/><circle cx="66" cy="34" r="4"/><circle cx="30" cy="60" r="3.5"/></g>`; } };

A.tomb = { w: 60, h: 80, f: () => `
  <ellipse cx="30" cy="76" rx="30" ry="5" fill="#2d6a3a"/>
  <path d="M8 76 L8 30 Q8 6 30 6 Q52 6 52 30 L52 76 Z" fill="#8b8aa8" stroke="#1a0b2e" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M14 72 L14 32 Q14 14 26 11" stroke="#fff" opacity=".28" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M30 22 L30 48 M21 31 L39 31" stroke="#3b3558" stroke-width="5" stroke-linecap="round"/>
  <path d="M2 76 Q6 66 10 76 M46 76 Q52 64 58 76" stroke="#3f9b3f" stroke-width="3" fill="none" stroke-linecap="round"/>` };

A.deadTree = { w: 160, h: 200, f: () => {
    const branches = 'M80 200 L80 112 M80 150 Q56 128 38 96 Q30 80 20 74 M80 128 Q102 108 126 90 Q138 80 152 82 M80 112 Q76 82 62 58 Q56 46 58 28 M62 62 Q42 58 30 42 M126 90 Q130 70 140 54 M58 28 Q70 22 76 10';
    return `
  <ellipse cx="80" cy="198" rx="44" ry="6" fill="#0b0414" opacity=".5"/>
  <path d="${branches}" fill="none" stroke="#0b0414" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${branches}" fill="none" stroke="#3b2457" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="80" cy="150" rx="7" ry="10" fill="#0b0414"/>
  <g class="hw-eyes"><circle cx="76" cy="146" r="2.2" fill="#ffd60a"/><circle cx="84" cy="146" r="2.2" fill="#ffd60a"/></g>`; } };

A.hat = { w: 100, h: 90, f: () => `
  <ellipse cx="50" cy="76" rx="46" ry="11" fill="#3b0f6b" stroke="#1a0b2e" stroke-width="3"/>
  <path d="M30 72 Q40 42 46 12 Q60 2 74 12 Q62 12 62 22 Q72 48 70 72 Z" fill="#5b21b6" stroke="#1a0b2e" stroke-width="3" stroke-linejoin="round"/>
  <path d="M31 68 L70 68 L69 57 L33 57 Z" fill="#fbbf24" stroke="#1a0b2e" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="44" y="58" width="12" height="9" fill="none" stroke="#1a0b2e" stroke-width="2.5"/>
  <circle cx="44" cy="40" r="2" fill="#fde047"/><circle cx="58" cy="32" r="1.6" fill="#fde047"/><circle cx="60" cy="48" r="2" fill="#fde047"/>` };

A.candy = { w: 60, h: 80, f: () => {
    const g = nextId('cg');
    return `
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff"/><stop offset=".32" stop-color="#fff"/>
    <stop offset=".32" stop-color="#ff9900"/><stop offset=".66" stop-color="#ff9900"/>
    <stop offset=".66" stop-color="#ffd60a"/><stop offset="1" stop-color="#ffd60a"/></linearGradient></defs>
  <path d="M30 4 Q52 8 57 70 Q30 80 3 70 Q8 8 30 4 Z" fill="url(#${g})" stroke="#7c2d12" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="23" cy="48" r="2.4" fill="#130924"/><circle cx="37" cy="48" r="2.4" fill="#130924"/>
  <path d="M25 58 Q30 63 35 58" fill="none" stroke="#130924" stroke-width="2.2" stroke-linecap="round"/>`; } };

A.leaf = { w: 40, h: 40, f: (c = '#f97316') => `
  <path d="M20 2 Q38 12 34 30 Q20 40 6 30 Q2 12 20 2 Z" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  <path d="M20 4 L20 36 M20 16 L12 10 M20 22 L30 14 M20 28 L12 22" stroke="rgba(0,0,0,.3)" stroke-width="1.4" fill="none" stroke-linecap="round"/>` };

/* ---------- NOËL ---------- */

A.tree = { w: 100, h: 135, f: () => {
    const g = nextId('tg');
    return `
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#14532d"/></linearGradient></defs>
  <ellipse cx="50" cy="132" rx="36" ry="4" fill="#000" opacity=".25"/>
  <rect x="42" y="112" width="16" height="20" rx="2" fill="#7c4a1e" stroke="#4a2c0f" stroke-width="2"/>
  <g stroke="#0f3d20" stroke-width="2.5" stroke-linejoin="round" fill="url(#${g})">
    <polygon points="50,40 90,86 10,86" transform="translate(0,24)"/>
    <polygon points="50,18 82,62 18,62" transform="translate(0,10)"/>
    <polygon points="50,6 74,38 26,38" transform="translate(0,6)"/>
  </g>
  <path d="M24 108 Q36 118 50 108 Q64 118 76 108" fill="none" stroke="#f0f9ff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
  <path d="M30 76 Q40 84 50 76 Q60 84 70 76" fill="none" stroke="#f0f9ff" stroke-width="4" stroke-linecap="round" opacity=".9"/>
  <polygon class="xm-star" points="50,-2 54,8 65,8 56,15 60,26 50,19 40,26 44,15 35,8 46,8" fill="#fde047" stroke="#f59e0b" stroke-width="1.5" transform="translate(0,2)"/>
  <g class="xm-tree-lights">
    <circle cx="44" cy="30" r="3.6" fill="#ef4444"/><circle cx="58" cy="44" r="3.6" fill="#38bdf8"/>
    <circle cx="36" cy="58" r="3.6" fill="#fde047"/><circle cx="64" cy="66" r="3.6" fill="#f472b6"/>
    <circle cx="28" cy="82" r="3.6" fill="#ef4444"/><circle cx="50" cy="78" r="3.6" fill="#fde047"/>
    <circle cx="72" cy="90" r="3.6" fill="#38bdf8"/><circle cx="46" cy="100" r="3.6" fill="#f472b6"/>
    <circle cx="22" cy="100" r="3.6" fill="#fde047"/><circle cx="78" cy="106" r="3.6" fill="#ef4444"/>
  </g>`; } };

A.snowman = { w: 100, h: 140, f: () => `
  <ellipse cx="50" cy="138" rx="34" ry="4" fill="#000" opacity=".2"/>
  <g stroke="#7c4a1e" stroke-width="4" stroke-linecap="round" fill="none">
    <path d="M26 72 L6 56 M6 56 L2 48 M6 56 L0 58"/><path d="M74 72 L94 56 M94 56 L98 48 M94 56 L100 58"/>
  </g>
  <circle cx="50" cy="108" r="30" fill="#fff" stroke="#93c5fd" stroke-width="3"/>
  <circle cx="50" cy="68" r="22" fill="#fff" stroke="#93c5fd" stroke-width="3"/>
  <circle cx="50" cy="36" r="17" fill="#fff" stroke="#93c5fd" stroke-width="3"/>
  <path d="M30 100 Q34 92 42 90" stroke="#bfdbfe" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="32" y="12" width="36" height="6" rx="2" fill="#1f2937"/>
  <rect x="38" y="-4" width="24" height="18" rx="2" fill="#1f2937"/>
  <rect x="38" y="6" width="24" height="4" fill="#dc2626"/>
  <circle cx="44" cy="33" r="2.6" fill="#111"/><circle cx="56" cy="33" r="2.6" fill="#111"/>
  <polygon points="50,38 50,42 68,43" fill="#fb923c" stroke="#c2410c" stroke-width="1"/>
  <path d="M42 44 Q50 50 58 44" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="1 4"/>
  <path d="M34 50 Q50 60 66 50 L66 58 Q50 68 34 58 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
  <path d="M60 58 L66 78 L56 78 L54 62 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2"/>
  <circle cx="50" cy="84" r="3" fill="#1f2937"/><circle cx="50" cy="98" r="3" fill="#1f2937"/><circle cx="50" cy="112" r="3" fill="#1f2937"/>
  <ellipse cx="38" cy="38" rx="3.4" ry="2" fill="#fda4af" opacity=".7"/><ellipse cx="62" cy="38" rx="3.4" ry="2" fill="#fda4af" opacity=".7"/>` };

A.gifts = { w: 120, h: 60, f: () => `
  <rect x="4" y="22" width="48" height="36" rx="3" fill="#dc2626" stroke="#7f1d1d" stroke-width="2.5"/>
  <rect x="24" y="22" width="8" height="36" fill="#fde047"/><rect x="4" y="36" width="48" height="8" fill="#fde047"/>
  <path d="M28 22 Q14 4 12 16 Q16 24 28 22 M28 22 Q42 4 44 16 Q40 24 28 22" fill="#fde047" stroke="#b45309" stroke-width="1.8"/>
  <rect x="62" y="12" width="52" height="46" rx="3" fill="#16a34a" stroke="#14532d" stroke-width="2.5"/>
  <rect x="84" y="12" width="8" height="46" fill="#fff"/><rect x="62" y="30" width="52" height="8" fill="#fff"/>
  <path d="M88 12 Q74 -6 72 6 Q76 14 88 12 M88 12 Q102 -6 104 6 Q100 14 88 12" fill="#fff" stroke="#9ca3af" stroke-width="1.8"/>` };

A.bauble = { w: 50, h: 62, f: (c = '#ef4444') => `
  <rect x="20" y="0" width="10" height="9" rx="2" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>
  <circle cx="25" cy="36" r="22" fill="${c}" stroke="rgba(0,0,0,.4)" stroke-width="2"/>
  <path d="M8 34 Q25 44 42 34" stroke="#fde047" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
  <ellipse cx="17" cy="26" rx="5" ry="8" fill="#fff" opacity=".5" transform="rotate(25 17 26)"/>` };

A.holly = { w: 100, h: 70, f: () => `
  <g fill="#16a34a" stroke="#14532d" stroke-width="2.5" stroke-linejoin="round">
    <path d="M50 40 Q44 22 22 16 Q26 24 16 28 Q24 32 18 42 Q28 40 30 50 Q40 50 50 40 Z"/>
    <path d="M50 40 Q56 22 78 16 Q74 24 84 28 Q76 32 82 42 Q72 40 70 50 Q60 50 50 40 Z"/>
  </g>
  <path d="M48 38 L24 22 M52 38 L76 22" stroke="#14532d" stroke-width="1.6" fill="none" opacity=".6"/>
  <g fill="#dc2626" stroke="#7f1d1d" stroke-width="2"><circle cx="50" cy="40" r="6"/><circle cx="42" cy="48" r="6"/><circle cx="58" cy="48" r="6"/></g>
  <circle cx="48" cy="38" r="1.8" fill="#fff" opacity=".8"/>` };

A.wreath = { w: 100, h: 104, f: () => {
    let leaves = '';
    for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2, x = 50 + Math.cos(a) * 33, y = 46 + Math.sin(a) * 33;
        const rot = (a * 180) / Math.PI + 90 + (i % 2 ? 25 : -25);
        leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="13" ry="6" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${i % 2 ? '#16a34a' : '#22c55e'}" stroke="#14532d" stroke-width="1.5"/>`;
    }
    let berries = '';
    [20, 80, 140, 200, 260, 320].forEach((d) => {
        const a = (d * Math.PI) / 180;
        berries += `<circle cx="${(50 + Math.cos(a) * 33).toFixed(1)}" cy="${(46 + Math.sin(a) * 33).toFixed(1)}" r="3.8" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>`;
    });
    return `${leaves}${berries}
  <path d="M50 80 Q28 64 24 84 Q38 94 50 80 M50 80 Q72 64 76 84 Q62 94 50 80" fill="#dc2626" stroke="#7f1d1d" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M46 86 L38 102 M54 86 L62 102" stroke="#dc2626" stroke-width="6" stroke-linecap="round"/>
  <circle cx="50" cy="80" r="6" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>`; } };

A.cane = { w: 40, h: 100, f: () => {
    const d = 'M12 98 L12 30 Q12 10 26 10 Q38 10 38 24';
    return `
  <path d="${d}" fill="none" stroke="#7f1d1d" stroke-width="14" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="#dc2626" stroke-width="10" stroke-dasharray="7 8"/>`; } };

A.star = { w: 24, h: 24, f: (c = '#fde68a') => `<path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" fill="${c}"/>` };

A.sleigh = { w: 260, h: 110, f: () => `
  <g stroke-linejoin="round" stroke-linecap="round">
    <path d="M96 66 Q112 60 128 66" stroke="#fbbf24" stroke-width="2.5" fill="none"/>
    <g stroke="#78350f" stroke-width="3.5" fill="none"><path d="M52 80 L50 100 M62 82 L62 102 M82 82 L82 102 M92 80 L94 100"/></g>
    <ellipse cx="72" cy="70" rx="30" ry="16" fill="#b45309" stroke="#78350f" stroke-width="3"/>
    <path d="M96 62 Q104 54 106 46" stroke="#78350f" stroke-width="12" fill="none"/>
    <path d="M96 62 Q104 54 106 46" stroke="#b45309" stroke-width="8" fill="none"/>
    <circle cx="108" cy="44" r="11" fill="#b45309" stroke="#78350f" stroke-width="3"/>
    <circle class="xm-nose" cx="118" cy="48" r="4.5" fill="#ef4444"/>
    <circle cx="106" cy="41" r="2.2" fill="#111"/>
    <path d="M104 34 Q100 20 92 14 M98 22 Q90 22 88 16 M104 34 Q112 20 120 16 M112 24 Q120 22 122 16" stroke="#fbbf24" stroke-width="3" fill="none"/>
    <path d="M42 66 Q36 60 40 54" stroke="#78350f" stroke-width="4" fill="none"/>
    <path d="M112 104 Q118 108 150 108 L240 108 Q258 108 254 90" stroke="#fbbf24" stroke-width="5" fill="none"/>
    <path d="M142 108 L146 92 M204 108 L204 92" stroke="#fbbf24" stroke-width="4"/>
    <path d="M126 58 Q128 92 148 94 L232 94 Q252 92 252 66 Q238 72 226 64 L226 52 L142 52 L140 64 Q132 64 126 58 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/>
    <path d="M142 76 L242 76" stroke="#fbbf24" stroke-width="3"/>
    <circle cx="170" cy="46" r="22" fill="#a16207" stroke="#713f12" stroke-width="3"/>
    <path d="M160 28 Q170 20 180 28" stroke="#713f12" stroke-width="3" fill="none"/>
    <path d="M200 58 L200 40 Q216 32 232 42 L232 58 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2.5"/>
    <circle cx="216" cy="30" r="11" fill="#fcd9b6" stroke="#b45309" stroke-width="2"/>
    <path d="M205 28 Q214 4 232 16 Q222 18 226 28 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="2.5"/>
    <circle cx="234" cy="15" r="5" fill="#fff"/><path d="M204 28 Q216 24 228 28" stroke="#fff" stroke-width="5"/>
    <ellipse cx="217" cy="40" rx="10" ry="7" fill="#fff"/>
    <circle cx="213" cy="30" r="1.6" fill="#111"/><circle cx="221" cy="30" r="1.6" fill="#111"/>
  </g>` };

/* ==========================================================================
   OUTILS DE PLACEMENT
   ========================================================================== */

const svgOf = (a, opt) => `<svg viewBox="0 0 ${a.w} ${a.h}" xmlns="http://www.w3.org/2000/svg">${a.f(opt)}</svg>`;

// Pose une illustration dont le point d'ancrage (x,y) est : ax = l|c|r, ay = t|m|b
function put(a, w, x, y, o = {}) {
    const h = (w * a.h) / a.w;
    const ax = o.ax || 'c', ay = o.ay || 'b';
    const left = x - (ax === 'l' ? 0 : ax === 'c' ? w / 2 : w);
    const top = y - (ay === 't' ? 0 : ay === 'm' ? h / 2 : h);
    const style = `left:${left.toFixed(0)}px;top:${top.toFixed(0)}px;width:${w.toFixed(0)}px;${o.style || ''}`;
    return `<div class="deco ${o.cls || ''}" style="${style}">${o.html || svgOf(a, o.opt)}</div>`;
}

function hanging(a, w, x, y, len, cls, opt, delay = 0) {
    return put(a, w, x, y, {
        ay: 't', cls,
        style: `--len:${len}px;animation-delay:${delay}s`,
        html: `<i class="thread"></i>${svgOf(a, opt)}`
    });
}

function bat(w, x, y, travel, dur, delay) {
    return put(A.bat, w, x, y, {
        ax: 'l', ay: 't', cls: 'hw-bat',
        style: `--travel:${travel}px;animation-duration:${dur}s;animation-delay:${delay}s`
    });
}

function curve(width, arcW, sag, ts) {
    const pts = [];
    const arcs = Math.ceil(width / arcW);
    for (let k = 0; k < arcs; k++) {
        ts.forEach((t) => {
            const x = k * arcW + t * arcW;
            if (x < width - 6) pts.push({ x, y: 4 + 4 * sag * t * (1 - t) });
        });
    }
    let d = 'M0 4';
    for (let k = 0; k < arcs; k++) d += ` Q${k * arcW + arcW / 2} ${4 + 2 * sag} ${(k + 1) * arcW} 4`;
    return { pts, d };
}

function lights(width) {
    const sag = 22;
    const { pts, d } = curve(width, 130, sag, [0.16, 0.5, 0.84]);
    const colors = ['#ef4444', '#fde047', '#22c55e', '#38bdf8', '#f472b6'];
    const bulbs = pts.map((p, i) => `
        <g class="xm-bulb" style="color:${colors[i % 5]};animation-delay:${(i % 5) * -0.4}s">
          <rect x="${p.x - 3}" y="${p.y - 1}" width="6" height="6" rx="1.5" fill="#374151"/>
          <ellipse cx="${p.x}" cy="${p.y + 12}" rx="5.5" ry="8" fill="currentColor"/>
          <ellipse cx="${p.x - 1.8}" cy="${p.y + 9}" rx="1.6" ry="2.6" fill="#fff" opacity=".65"/>
        </g>`).join('');
    return `<svg width="${width}" height="${sag + 28}" viewBox="0 0 ${width} ${sag + 28}"><path d="${d}" stroke="#15803d" stroke-width="2.5" fill="none"/>${bulbs}</svg>`;
}

function drift(w) {
    return `<svg width="${w}" height="40" viewBox="0 0 ${w} 40" preserveAspectRatio="none">
      <path d="M0 40 L0 18 Q${w * 0.06} 4 ${w * 0.15} 16 Q${w * 0.27} 30 ${w * 0.4} 14 Q${w * 0.52} 2 ${w * 0.65} 16 Q${w * 0.78} 28 ${w * 0.9} 10 Q${w * 0.96} 4 ${w} 12 L${w} 40 Z" fill="#f8fbff" stroke="#bfdbfe" stroke-width="2"/>
      <path d="M${w * 0.08} 24 Q${w * 0.12} 20 ${w * 0.16} 24 M${w * 0.5} 22 Q${w * 0.54} 18 ${w * 0.58} 22 M${w * 0.8} 24 Q${w * 0.84} 20 ${w * 0.88} 24" stroke="#bfdbfe" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

/* ==========================================================================
   ANALYSE DE LA PAGE : héros + sections
   ========================================================================== */

function computeSafeTop() {
    if (window.scrollY < 5 || safeTopCache === null) {
        let b = 0;
        ['#admin-top-bar', '#main-navbar', '.navbar', '#dedicaces-ticker'].forEach((sel) => {
            const el = document.querySelector(sel);
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (r.height > 0 && r.bottom > b && r.bottom < 420) b = r.bottom;
        });
        safeTopCache = b + window.scrollY;
    }
    return safeTopCache;
}

function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { T: r.top + window.scrollY, B: r.bottom + window.scrollY, L: r.left + window.scrollX, R: r.right + window.scrollX, W: r.width, H: r.height, el };
}

function analysePage(W, docH) {
    const safeTop = computeSafeTop();
    let hero = null;
    for (const sel of ['.hero-slider', '.hero', '#hero', '.hero-section', '.swiper']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = rectOf(el);
        if (r.W > 300 && r.H > 220 && r.T < 900) { hero = r; break; }
    }

    let zones = [];
    document.querySelectorAll('section').forEach((el) => {
        if (hero && (el.contains(hero.el) || hero.el.contains(el))) return;
        const r = rectOf(el);
        if (r.W > 480 && r.H > 280) zones.push(r);
    });
    zones = zones.filter((z) => !zones.some((o) => o !== z && o.el.contains(z.el)));

    if (zones.length === 0) {
        // Pas de <section> exploitable : on découpe la page sous le héros
        const startY = hero ? hero.B + 40 : safeTop + 320;
        const L = W * 0.04, R = W * 0.96;
        for (let y = startY, i = 0; y + 320 < docH && i < 6; y += 900, i++) {
            zones.push({ T: y, B: Math.min(y + 860, docH - 20), L, R, W: R - L, H: Math.min(860, docH - 20 - y) });
        }
    }
    zones.sort((a, b) => a.T - b.T);
    return { hero, zones: zones.slice(0, 8), safeTop };
}

/* ==========================================================================
   HALLOWEEN — composition
   ========================================================================== */

function buildHalloween(ctx) {
    const { hero, zones, safeTop, s, mobile } = ctx;
    let h = '';

    if (hero) {
        const L = hero.L, R = hero.R, B = hero.B, T = Math.max(hero.T, safeTop), HW = R - L;
        h += put(A.moon, 110 * s, R - HW * 0.2, T + 30 * s, { ay: 't', cls: 'hw-moon' });
        h += put(A.web, 150 * s, R, T, { ax: 'r', ay: 't', cls: 'hw-web hw-flip', opt: 'rgba(255,255,255,.7)' });
        h += hanging(A.spider, 46 * s, L + HW * 0.64, T, 70 * s, 'hw-spider');
        h += bat(60 * s, L - 90, T + 70 * s, HW + 260, 18, 0);
        h += bat(42 * s, L - 90, T + 150 * s, HW + 260, 25, -9);
        if (!mobile) h += bat(50 * s, L - 90, T + 40, HW + 260, 31, -20);
        // cimetière au bas du héros
        h += put(A.tomb, 40 * s, L + HW * 0.07, B - 4, { cls: 'hw-tomb' });
        h += put(A.tomb, 32 * s, L + HW * 0.105, B - 4, { cls: 'hw-tomb' });
        h += put(A.pumpkin, 46 * s, L + HW * 0.155, B - 2, { cls: 'hw-pumpkin' });
        if (!mobile) h += put(A.deadTree, 120 * s, L + HW * 0.73, B - 2, { cls: 'hw-tree' });
        h += put(A.candy, 26 * s, L + HW * 0.6, B - 2, { cls: 'hw-candy' });
    }

    zones.forEach((z, k) => {
        const { L, T, R, B, W: ZW, H } = z;
        const p = k % 3;
        if (p === 0) {
            h += put(A.web, 120 * s, L, T, { ax: 'l', ay: 't', cls: 'hw-web', opt: 'rgba(124,58,237,.55)' });
            if (!mobile) h += put(A.ghost, 72, R + 2, T + H * 0.36, { ay: 'm', cls: 'hw-ghost' });
            h += put(A.pumpkin, 84 * s, L + 40 * s, B + 8, { cls: 'hw-pumpkin' });
            h += put(A.pumpkin, 52 * s, L + 108 * s, B + 8, { cls: 'hw-pumpkin' });
            h += put(A.cauldron, 88 * s, R - 70 * s, B + 8, { cls: 'hw-cauldron' });
            h += put(A.candy, 28 * s, L + ZW * 0.5, B + 6, { cls: 'hw-candy' });
            h += bat(46 * s, L - 40, T + 60, ZW + 100, 20, -4);
        } else if (p === 1) {
            h += put(A.web, 120 * s, R, T, { ax: 'r', ay: 't', cls: 'hw-web hw-flip', opt: 'rgba(124,58,237,.55)' });
            h += hanging(A.spider, 40 * s, L + ZW * 0.36, T, 60 * s, 'hw-spider', null, -1);
            if (!mobile) h += hanging(A.spider, 34, L + ZW * 0.82, T, 40, 'hw-spider', null, -2.4);
            h += put(A.hat, 92 * s, L + 50 * s, B + 10, { cls: 'hw-hat' });
            h += put(A.tomb, 46 * s, R - 100 * s, B + 8, { cls: 'hw-tomb' });
            h += put(A.tomb, 36 * s, R - 52 * s, B + 8, { cls: 'hw-tomb' });
            h += put(A.pumpkin, 56 * s, R - 150 * s, B + 8, { cls: 'hw-pumpkin' });
            h += bat(40 * s, L - 40, T + H * 0.5, ZW + 100, 24, -12);
        } else {
            h += put(A.web, 100 * s, L, T, { ax: 'l', ay: 't', cls: 'hw-web', opt: 'rgba(124,58,237,.55)' });
            h += put(A.web, 100 * s, R, T, { ax: 'r', ay: 't', cls: 'hw-web hw-flip', opt: 'rgba(124,58,237,.55)' });
            if (!mobile) {
                h += put(A.ghost, 64, L - 6, T + H * 0.55, { ay: 'm', cls: 'hw-ghost', style: 'animation-delay:-1.6s' });
                h += put(A.deadTree, 110, R - 16, B + 6, { cls: 'hw-tree' });
            }
            h += put(A.pumpkin, 70 * s, L + 40 * s, B + 8, { cls: 'hw-pumpkin' });
            h += put(A.candy, 26 * s, L + 100 * s, B + 6, { cls: 'hw-candy' });
            h += bat(50 * s, L - 40, T + 90, ZW + 100, 22, -7);
            h += bat(34 * s, L - 40, T + H * 0.7, ZW + 100, 28, -17);
        }
    });
    return h;
}

/* ==========================================================================
   NOËL — composition
   ========================================================================== */

function buildChristmas(ctx) {
    const { hero, zones, safeTop, s, mobile } = ctx;
    let h = '';
    const rnd = rng(7);

    if (hero) {
        const L = hero.L, R = hero.R, B = hero.B, T = Math.max(hero.T, safeTop), HW = R - L;
        for (let i = 0; i < (mobile ? 8 : 16); i++) {
            const sz = 8 + rnd() * 12;
            h += put(A.star, sz, L + rnd() * HW, T + 20 + rnd() * (hero.H * 0.5), {
                ay: 't', cls: 'xm-twinkle', opt: i % 3 ? '#fde68a' : '#bae6fd',
                style: `animation-delay:${(rnd() * -4).toFixed(1)}s`
            });
        }
        h += put(A.sleigh, 220 * s, R, T + 18, {
            ax: 'l', ay: 't', cls: 'xm-sleigh',
            style: `--travel:${-(HW + 320 * s)}px`
        });
        h += put({ w: HW, h: 40 }, HW, L, B + 6, { ax: 'l', cls: 'xm-drift', html: drift(HW) });
        h += put(A.cane, 28 * s, L + HW * 0.06, B + 2, { cls: 'xm-cane' });
        h += put(A.gifts, 70 * s, L + HW * 0.14, B + 2, { cls: 'xm-gifts' });
        if (!mobile) h += put(A.tree, 70, L + HW * 0.76, B + 2, { cls: 'xm-tree' });
    }

    zones.forEach((z, k) => {
        const { L, T, R, B, W: ZW } = z;
        const p = k % 3;
        if (p === 0) {
            h += put({ w: ZW, h: 50 }, ZW, L, T + 6, { ax: 'l', ay: 't', cls: 'xm-lights', html: lights(ZW) });
            h += put(A.holly, 86 * s, L - 6, T - 4, { ax: 'l', ay: 't', cls: 'xm-holly' });
            h += put(A.snowman, 92 * s, L + 50 * s, B + 8, { cls: 'xm-snowman' });
            if (!mobile) h += put(A.gifts, 80, L + 150, B + 8, { cls: 'xm-gifts' });
            h += put(A.tree, 100 * s, R - 40 * s, B + 8, { cls: 'xm-tree' });
        } else if (p === 1) {
            [[0.22, 70, '#ef4444', 34], [0.45, 110, '#3b82f6', 28], [0.68, 60, '#fbbf24', 32], [0.88, 90, '#ef4444', 26]].forEach(([f, len, c, w], i) => {
                if (mobile && i > 1) return;
                h += hanging(A.bauble, w * s, L + ZW * f, T, len * s, 'xm-bauble', c, -i * 0.9);
            });
            if (!mobile) h += put(A.wreath, 90, R - 6, T + 10, { ay: 'm', cls: 'xm-wreath' });
            h += put(A.cane, 30 * s, L + 14, B + 6, { cls: 'xm-cane' });
            h += put(A.gifts, 86 * s, L + 90 * s, B + 8, { cls: 'xm-gifts' });
            h += put(A.snowman, 80 * s, R - 50 * s, B + 8, { cls: 'xm-snowman' });
        } else {
            h += put({ w: ZW, h: 50 }, ZW, L, T + 6, { ax: 'l', ay: 't', cls: 'xm-lights', html: lights(ZW) });
            h += put(A.holly, 86 * s, R + 6, T - 4, { ax: 'r', ay: 't', cls: 'xm-holly hw-flip' });
            h += put(A.tree, 96 * s, L + 50 * s, B + 8, { cls: 'xm-tree' });
            h += put(A.gifts, 84 * s, L + 140 * s, B + 8, { cls: 'xm-gifts' });
            if (!mobile) h += put(A.snowman, 86, R - 50, B + 8, { cls: 'xm-snowman' });
        }
    });
    return h;
}

/* ==========================================================================
   EFFETS PLEIN ÉCRAN (fixes, légers) : neige / feuilles
   ========================================================================== */

function buildFx(theme) {
    const count = window.innerWidth < 768 ? 16 : 34;
    let out = '';
    if (theme === 'noel') {
        for (let i = 0; i < count + 10; i++) {
            const size = rand(3, 9).toFixed(1);
            out += `<span class="flake" style="left:${rand(0, 100).toFixed(1)}%;width:${size}px;height:${size}px;opacity:${rand(0.5, 1).toFixed(2)};animation-duration:${rand(8, 17).toFixed(1)}s,${rand(2.5, 5).toFixed(1)}s;animation-delay:${rand(-17, 0).toFixed(1)}s,${rand(-5, 0).toFixed(1)}s"></span>`;
        }
    } else {
        const colors = ['#f97316', '#fb923c', '#eab308', '#c2410c', '#a855f7'];
        for (let i = 0; i < Math.round(count / 2); i++) {
            const size = rand(16, 28).toFixed(0);
            out += `<span class="leaf" style="left:${rand(0, 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-duration:${rand(10, 20).toFixed(1)}s,${rand(3, 6).toFixed(1)}s;animation-delay:${rand(-20, 0).toFixed(1)}s,${rand(-6, 0).toFixed(1)}s">${svgOf(A.leaf, colors[i % colors.length])}</span>`;
        }
    }
    return out;
}

/* ==========================================================================
   MISE EN PAGE & CYCLE DE VIE
   ========================================================================== */

function layout(force) {
    const root = document.getElementById(ROOT_ID);
    if (!root || currentTheme === 'normal') return;

    root.style.height = '0px';
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const W = document.documentElement.clientWidth;
    const { hero, zones, safeTop } = analysePage(W, docH);

    const sig = [currentTheme, W, Math.round(docH / 20), hero ? [hero.T, hero.B, hero.L, hero.R].map(Math.round) : 'x',
        zones.map((z) => [z.T, z.B, z.L, z.R].map(Math.round).join(',')).join(';')].join('|');

    root.style.height = `${docH}px`;
    if (!force && sig === lastSig) return;
    lastSig = sig;

    const mobile = W < 768;
    const ctx = { W, docH, hero, zones, safeTop, mobile, s: mobile ? 0.62 : 1 };
    root.innerHTML = currentTheme === 'halloween' ? buildHalloween(ctx) : buildChristmas(ctx);
}

let layoutTimer;
function scheduleLayout(force) {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => layout(force), 220);
}

let observer = null;
function startObserving() {
    if (observer || !('ResizeObserver' in window)) return;
    observer = new ResizeObserver(() => scheduleLayout(false));
    observer.observe(document.body);
}

function removeDecorations() {
    [ROOT_ID, FX_ID].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    lastSig = '';
}

function applyThemeUI(themeName) {
    if (!VALID_THEMES.includes(themeName)) themeName = 'normal';
    currentTheme = themeName;
    console.log('[VAFM thème] appliqué :', themeName);

    document.body.classList.remove('theme-halloween', 'theme-noel', 'theme-normal');
    removeDecorations();

    if (themeName === 'normal') {
        document.body.classList.add('theme-normal');
    } else {
        document.body.classList.add(`theme-${themeName}`);

        const root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);

        const fx = document.createElement('div');
        fx.id = FX_ID;
        fx.className = themeName === 'noel' ? 'fx-snow' : 'fx-leaves';
        fx.innerHTML = buildFx(themeName);
        document.body.appendChild(fx);

        layout(true);
        startObserving();
        // le contenu (images, articles, slides) arrive après coup : on recale
        [500, 1500, 3500].forEach((ms) => setTimeout(() => scheduleLayout(false), ms));
    }

    const selectEl = document.getElementById('adminThemeSelect');
    if (selectEl && selectEl.value !== themeName) selectEl.value = themeName;
}

window.addEventListener('resize', () => scheduleLayout(false));
window.addEventListener('load', () => scheduleLayout(false));

/* ---------- Démarrage + synchro PocketBase ---------- */

const API_BASE = 'https://api.vafmlaradio.fr';

// Session admin lue directement là où le SDK PocketBase la range
function getStoredAuth() {
    try {
        const parsed = JSON.parse(localStorage.getItem('pocketbase_auth') || 'null');
        if (parsed && parsed.token) return { token: parsed.token, user: parsed.record || parsed.model || {} };
    } catch (e) {}
    return null;
}

async function saveThemeRest(theme) {
    const auth = getStoredAuth();
    if (!auth) throw new Error('Pas de session admin dans ce navigateur (reconnecte-toi).');
    try {
        const exp = JSON.parse(atob(auth.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
        if (exp < Date.now()) {
            const e = new Error('Ta session admin a expiré : déconnecte-toi puis reconnecte-toi, et réessaie.');
            e.status = 401;
            throw e;
        }
    } catch (e) { if (e && e.status === 401) throw e; }
    const headers = { 'Content-Type': 'application/json', Authorization: auth.token };
    const list = await fetch(`${API_BASE}/api/collections/settings/records?perPage=1`, { headers });
    const data = await list.json();
    if (!list.ok) { const e = new Error(data.message || 'Lecture impossible'); e.status = list.status; throw e; }
    const exists = data.items && data.items[0];
    const res = await fetch(
        exists ? `${API_BASE}/api/collections/settings/records/${exists.id}` : `${API_BASE}/api/collections/settings/records`,
        { method: exists ? 'PATCH' : 'POST', headers, body: JSON.stringify({ theme }) }
    );
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(out.message || 'Écriture refusée'); e.status = res.status; e.response = out; throw e; }
    return out;
}

function getPb() {
    try { if (typeof pb !== 'undefined' && pb) return pb; } catch (e) {}
    return window.pb || null;
}

(function initTheme() {
    let saved = 'normal';
    try { saved = localStorage.getItem(THEME_STORAGE_KEY) || 'normal'; } catch (e) {}
    applyThemeUI(saved);
    loadRemoteTheme();
})();

// Le thème choisi par l'admin est stocké dans PocketBase (collection "settings", champ "theme")
// pour que tous les visiteurs le voient. Lecture publique nécessaire sur cette collection.
async function loadRemoteTheme() {
    for (let i = 0; i < 20 && !getPb(); i++) await new Promise((r) => setTimeout(r, 250));
    const client = getPb();
    const base = (client && client.baseUrl) || 'https://api.vafmlaradio.fr';
    let remote = null;

    // 1) via le client PocketBase du site
    if (client) {
        try {
            const res = await client.collection('settings').getList(1, 1);
            remote = res.items[0] && res.items[0].theme;
            console.log('[VAFM thème] lu via pb :', res.items.length, 'enregistrement(s), theme =', remote);
        } catch (err) {
            console.warn('[VAFM thème] Lecture pb refusée :', err && (err.status || err.message), err);
        }
    }

    // 2) secours : appel direct à l'API (sans session, comme un visiteur)
    if (!remote) {
        try {
            const r = await fetch(`${base}/api/collections/settings/records?perPage=1`, { cache: 'no-store' });
            const data = await r.json();
            if (!r.ok) {
                console.warn('[VAFM thème] API settings :', r.status, data && data.message,
                    r.status === 403 ? '→ la règle de lecture (List/View) de "settings" n\'est pas publique' :
                    r.status === 404 ? '→ la collection "settings" n\'existe pas' : '');
            } else {
                remote = data.items && data.items[0] && data.items[0].theme;
                console.log('[VAFM thème] lu via API :', (data.items || []).length, 'enregistrement(s), theme =', remote);
                if (data.items && data.items.length && remote === undefined)
                    console.warn('[VAFM thème] le champ "theme" n\'existe pas dans la collection "settings"');
            }
        } catch (err) {
            console.warn('[VAFM thème] API injoignable :', err);
        }
    }

    if (remote && VALID_THEMES.includes(remote)) {
        try { localStorage.setItem(THEME_STORAGE_KEY, remote); } catch (e) {}
        if (remote !== currentTheme) applyThemeUI(remote);
    }
}

async function handleThemeChange(event) {
    const newTheme = event.target.value;
    applyThemeUI(newTheme);
    try { localStorage.setItem(THEME_STORAGE_KEY, newTheme); } catch (e) {}

    try {
        const client = getPb();
        if (client && client.authStore && client.authStore.isValid) {
            const records = await client.collection('settings').getList(1, 1);
            if (records.items.length > 0) {
                await client.collection('settings').update(records.items[0].id, { theme: newTheme });
            } else {
                await client.collection('settings').create({ theme: newTheme });
            }
        } else {
            await saveThemeRest(newTheme);   // plan B : appel direct à l'API
        }
        console.log('[VAFM thème] ✔ enregistré dans PocketBase :', newTheme);
        if (typeof showToast === 'function') showToast(`Thème appliqué pour tous : ${newTheme.toUpperCase()}`);
        return;
    } catch (err) {
        const st = err && err.status;
        try {
            const a = getStoredAuth();
            let exp = null;
            if (a) { try { exp = new Date(JSON.parse(atob(a.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000); } catch (e) {} }
            console.warn('[VAFM thème] diagnostic session →',
                'connecté:', !!a,
                '| collection:', a && a.user.collectionName,
                '| rôle vu par le site:', a && JSON.stringify(a.user.role),
                '| token expire le:', exp ? exp.toLocaleString() : '?',
                exp && exp < new Date() ? '(EXPIRÉ → reconnecte-toi)' : '');
        } catch (e) {}
        console.warn('[VAFM thème] ✘ Non enregistré (code ' + st + ') :', err && err.message,
            st === 400 ? '→ la règle Create/Update refuse ce compte (rôle différent de "admin" ou session expirée), ou un champ est refusé' :
            st === 401 || st === 403 ? '→ vérifie les règles Create/Update de "settings" (ton rôle admin doit être autorisé)' : '',
            err && err.response);
        if (typeof showToast === 'function') showToast(`Thème appliqué ici seulement (non enregistré : ${err && err.message})`);
        return;
    }
}

window.applyThemeUI = applyThemeUI;
window.handleThemeChange = handleThemeChange;

})();