import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { category, id } = req.query;
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  const getBaseHtml = () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    return fs.readFileSync(indexPath, 'utf8');
  };

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
        
        const rawTitle = article.titre || article.title || "Actualité";
        const title = `${rawTitle} – VAFM`;
        
        const rawText = article.texte || article.contenu || article.description || "";
        const cleanText = rawText.replace(/<[^>]*>?/gm, '').replace(/"/g, '&quot;').trim();
        const description = cleanText ? cleanText.substring(0, 160) : "Retrouvez toute l'actualité sur VAFM.";
        
        const imageUrl = article.image 
          ? `${POCKETBASE_URL}/api/files/${collectionName}/${article.id}/${article.image}`
          : "https://vafmlaradio.fr/LOGO-VAFM.png";

        // 1. Remplacement du titre <title>
        html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

        // 2. Balises Open Graph pour iMessage / WhatsApp / Twitter
        const ogTags = `
          <meta property="og:type" content="article">
          <meta property="og:site_name" content="VAFM">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${imageUrl}">
          <meta property="og:url" content="https://vafmlaradio.fr/article/${category || 'actus'}/${rawId}">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description}">
          <meta name="twitter:image" content="${imageUrl}">
          <script>
            // Injection de l'instruction d'ouverture automatique de l'article au chargement
            window.AUTO_OPEN_ARTICLE = { category: "${category || 'actus'}", id: "${cleanId}" };
          </script>
        `;

        html = html.replace('</head>', `${ogTags}\n</head>`);
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