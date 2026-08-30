// ==========================================================================
// ROUTING MIDDLEWARE VERCEL — Rendu des pages d'article pour les robots
// ==========================================================================
// Objectif : quand Googlebot, ou le robot de prévisualisation de Facebook /
// WhatsApp / Twitter / Discord, etc. demande une page /article/..., on lui
// répond avec une petite page HTML autonome contenant le vrai titre, la
// vraie image et le JSON-LD NewsArticle — allés chercher directement dans
// PocketBase, côté serveur, avant tout JavaScript.
//
// Pour un visiteur humain normal (vous, un auditeur), ce middleware ne fait
// RIEN : la requête continue vers le site habituel, la SPA complète avec le
// lecteur et la session admin, exactement comme aujourd'hui.
//
// Fichier à placer à la RACINE du dépôt (au même niveau que package.json).
// ==========================================================================

import { next } from '@vercel/functions';

// Adresse publique de PocketBase (via le tunnel Cloudflare).
// Peut être surchargée par une variable d'environnement Vercel si besoin.
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'https://api.vafmlaradio.fr';
const SITE_URL = 'https://vafmlaradio.fr';

// Liste des robots connus (moteurs de recherche + aperçus de partage sur
// les réseaux sociaux / messageries). Si vous voyez d'autres robots dans vos
// logs Vercel qui devraient être servis en pré-rendu, ajoutez-les ici.
const BOT_UA_REGEX = new RegExp(
  [
    'googlebot',
    'google-inspectiontool',
    'adsbot-google',
    'mediapartners-google',
    'bingbot',
    'yandex',
    'baiduspider',
    'duckduckbot',
    'facebookexternalhit',
    'facebot',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'telegrambot',
    'discordbot',
    'slackbot',
    'pinterest',
    'redditbot',
    'applebot',
    'embedly',
    'quora link preview',
    'vkshare',
    'skypeuripreview',
    'w3c_validator',
  ].join('|'),
  'i'
);

export const config = {
  // Ne s'exécute que sur les pages d'article, pour ne rien ralentir ailleurs
  matcher: '/article/:path*',
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export default async function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';

  // Visiteur humain (ou robot non reconnu) → on ne touche à rien,
  // la SPA habituelle continue de se charger normalement.
  if (!BOT_UA_REGEX.test(userAgent)) {
    return next();
  }

  const url = new URL(request.url);
  // ex: /article/actus/abc123def456-mon-titre → ["article", "actus", "abc123def456-mon-titre"]
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length < 3) {
    return next();
  }

  const rawCategory = segments[1];
  const idSlug = segments[2];

  // Les identifiants PocketBase font 15 caractères — même convention que
  // celle déjà utilisée côté client dans checkUrlForArticle() (script.js).
  const id = idSlug.substring(0, 15);

  const collectionMap = { hero: 'hero', news: 'actus', actus: 'actus' };
  const collectionName = collectionMap[rawCategory] || 'actus';

  try {
    const res = await fetch(
      `${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!res.ok) {
      // Article introuvable / supprimé : on laisse la SPA gérer normalement
      // (elle affichera son propre message d'erreur).
      return next();
    }

    const data = await res.json();

    if (!data.is_published) {
      // Brouillon non publié : on ne veut surtout pas qu'un robot l'indexe.
      return next();
    }

    const title = data.titre || data.title || data.nom || "VAFM – La Radio qu'il vous faut";
    const rawText = data.texte || data.contenu || data.description || data.text || '';
    const plainText = rawText.replace(/<[^>]*>/g, '').trim().substring(0, 160);
    const description = plainText || 'Écoutez VAFM, la radio qu\'il vous faut à Valenciennes.';

    let image = `${SITE_URL}/LOGO-VAFM.png`;
    const rawImg = data.image || data.img;
    if (rawImg) {
      image = rawImg.startsWith('http')
        ? rawImg
        : `${POCKETBASE_URL}/api/files/${collectionName}/${id}/${rawImg}`;
    }

    const publishedIso = new Date(data.published_at || data.created || Date.now()).toISOString();
    const modifiedIso = new Date(data.updated || data.created || Date.now()).toISOString();
    const canonicalUrl = `${SITE_URL}${url.pathname}`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      headline: title,
      image: [image],
      datePublished: publishedIso,
      dateModified: modifiedIso,
      author: [{
        '@type': 'Organization',
        name: "VAFM - La Radio qu'il vous faut",
        url: SITE_URL,
      }],
      publisher: {
        '@type': 'Organization',
        name: "VAFM - La Radio qu'il vous faut",
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/LOGO-VAFM.png` },
      },
      description,
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} – VAFM</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="VAFM">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="article:published_time" content="${publishedIso}">
<meta property="article:modified_time" content="${modifiedIso}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<article>
  <h1>${escapeHtml(title)}</h1>
  <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
  <div>${rawText}</div>
  <p><a href="${canonicalUrl}">Lire l'article sur VAFM</a></p>
</article>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Cache quelques minutes côté CDN Vercel pour éviter que chaque
        // passage de robot ne tape directement le PC qui héberge PocketBase.
        'cache-control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (err) {
    console.error('[middleware] Erreur récupération article PocketBase :', err);
    // En cas de souci (tunnel Cloudflare down, etc.), on ne bloque jamais
    // le visiteur : la SPA normale prend le relais.
    return next();
  }
}
