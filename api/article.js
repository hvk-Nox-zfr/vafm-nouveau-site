import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { category, id } = req.query;
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  const getBaseHtml = () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    return fs.readFileSync(indexPath, 'utf8');
  };

  // Échappement HTML complet — le titre passe à la fois dans <title>...</title>
  // et dans des attributs content="...". Sans échapper aussi < > &, un titre
  // contenant l'un de ces caractères casse la balise et corrompt tout le
  // <head> généré (les balises suivantes ne sont plus interprétées correctement).
  const escapeHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  try {
    let html = getBaseHtml();

    // Extraction de l'ID PocketBase (ex: 15 caractères)
    const rawId = id || "";
    const cleanId = rawId.split('-')[0].substring(0, 15);

    const collectionMap = { hero: 'hero', news: 'actus', actus: 'actus' };
    const collectionName = collectionMap[category] || 'actus';

    if (cleanId) {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${cleanId}`);
      
      if (response.ok) {
        const article = await response.json();

        // Un brouillon non publié ne doit jamais être indexé ni prévisualisé
        // (ni par Google, ni dans un aperçu de partage) — on sert la page de
        // base sans balises spécifiques et sans auto-ouverture dans ce cas.
        if (article.is_published) {
          const rawTitle = article.titre || article.title || "Actualité";
          const title = escapeHtml(`${rawTitle} – VAFM`);

          const rawText = article.texte || article.contenu || article.description || "";
          const cleanText = rawText.replace(/<[^>]*>?/gm, '').trim();
          const description = escapeHtml(
            cleanText ? cleanText.substring(0, 160) : "Retrouvez toute l'actualité sur VAFM."
          );

          const imageUrl = article.image
            ? `${POCKETBASE_URL}/api/files/${collectionName}/${article.id}/${article.image}`
            : "https://vafmlaradio.fr/LOGO-VAFM.png";

          // 1. Suppression des balises de titre/description/OG par défaut de index.html
          html = html
            .replace(/<title>.*?<\/title>/gi, '')
            .replace(/<meta\s+name=["']description["'].*?>/gi, '')
            .replace(/<meta\s+property=["']og:.*?["'].*?>/gi, '')
            .replace(/<meta\s+name=["']twitter:.*?["'].*?>/gi, '');

          // 2. Preparation des nouvelles balises d'en-tête
          const headerTags = `
          <title>${title}</title>
          <meta name="description" content="${description}">
          <meta property="og:type" content="article">
          <meta property="og:site_name" content="VAFM">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${escapeHtml(imageUrl)}">
          <meta property="og:url" content="${escapeHtml(`https://vafmlaradio.fr/article/${category || 'actus'}/${rawId}`)}">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description}">
          <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
          <script>
            window.AUTO_OPEN_ARTICLE = { category: "${escapeHtml(category || 'actus')}", id: "${escapeHtml(cleanId)}" };
          </script>
        `;

          // 3. Injection directe juste avant la fermeture de </head>
          html = html.replace(/<\/head>/i, `${headerTags}\n</head>`);
        }
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (err) {
    console.error("Erreur durant le traitement de la requête SSR:", err);
    const html = getBaseHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}