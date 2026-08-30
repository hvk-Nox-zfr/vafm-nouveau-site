import fs from 'fs';
import path from 'path';

// ============================================================================
// VAFM — Préchargement de l'image de bannière (fix LCP)
// ============================================================================
// L'image de la bannière d'accueil n'existait dans le HTML qu'une fois le
// JavaScript exécuté ET les données PocketBase reçues (potentiellement
// plusieurs secondes). Le navigateur ne pouvait donc pas commencer à la
// télécharger avant ça, ce qui plombait le LCP (18,5s mesurés sur mobile).
//
// Cette fonction ne touche à RIEN d'autre que l'insertion d'un
// <link rel="preload"> pour cette image : le rendu réel de la bannière
// (carrousel Swiper, textes, boutons admin) reste géré exactement comme
// avant par script.js. On donne juste au navigateur de quoi commencer le
// téléchargement de l'image en parallèle, dès la réception du HTML, au lieu
// d'attendre la fin de toute la chaîne JS + fetch.
// ============================================================================

export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  const getBaseHtml = () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    return fs.readFileSync(indexPath, 'utf8');
  };

  try {
    let html = getBaseHtml();

    const response = await fetch(`${POCKETBASE_URL}/api/collections/hero/records?perPage=200`);

    if (response.ok) {
      const data = await response.json();
      const items = data.items || [];
      // Même logique que côté client (script.js) : premier élément publié,
      // dans l'ordre renvoyé par PocketBase (pas de tri explicite ici non plus).
      const firstSlide = items.find(h => h.is_published === undefined || h.is_published === true || h.is_published === 1);

      if (firstSlide && firstSlide.image) {
        const imageUrl = `${POCKETBASE_URL}/api/files/hero/${firstSlide.id}/${firstSlide.image}?thumb=1920x960`;
        const preloadTag = `<link rel="preload" as="image" fetchpriority="high" href="${imageUrl}">\n</head>`;
        html = html.replace(/<\/head>/i, preloadTag);
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache court côté edge Vercel : la bannière change rarement d'une minute
    // à l'autre, mais on ne veut pas non plus qu'une mise à jour admin mette
    // trop longtemps à apparaître. stale-while-revalidate sert une version en
    // cache instantanément pendant que Vercel rafraîchit en arrière-plan.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).send(html);

  } catch (err) {
    console.error("Erreur préchargement bannière d'accueil:", err);
    // En cas de souci, on sert la page normale sans preload plutôt que de casser l'accueil.
    const html = getBaseHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}