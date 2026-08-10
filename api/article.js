import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { id } = req.query;
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  // Fonction pour charger et renvoyer le HTML
  const getBaseHtml = () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    return fs.readFileSync(indexPath, 'utf8');
  };

  try {
    let html = getBaseHtml();

    // Extraire l'ID propre (ex: 15 caractères PocketBase)
    const cleanId = id ? id.substring(0, 15) : null;

    if (cleanId) {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records/${cleanId}`);
      
      if (response.ok) {
        const article = await response.json();
        
        // Formatage des données
        const rawTitle = article.titre || article.title || "Actualité";
        const title = `${rawTitle} | VAFM`;
        
        const rawText = article.texte || article.description || "";
        // Nettoyage HTML + échappement des guillemets pour l'attribut content
        const cleanText = rawText.replace(/<[^>]*>?/gm, '').replace(/"/g, '&quot;').trim();
        const description = cleanText ? cleanText.substring(0, 160) + "..." : "Retrouvez toute l'actualité sur VAFM.";
        
        const imageUrl = article.image 
          ? `${POCKETBASE_URL}/api/files/actus/${article.id}/${article.image}`
          : "https://vafmlaradio.fr/LOGO-VAFM.png";

        // 1. Remplacer le titre
        html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

        // 2. Remplacer la meta description si elle existe déjà, sinon préparer le bloc
        if (/<meta\s+name="description"/i.test(html)) {
          html = html.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${description}">`);
        } else {
          html = html.replace('</head>', `  <meta name="description" content="${description}">\n</head>`);
        }

        // 3. Injecter ou remplacer les balises Open Graph (Facebook, Twitter, iMessage...)
        const ogTags = `
          <meta property="og:type" content="article">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${imageUrl}">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${description}">
          <meta name="twitter:image" content="${imageUrl}">
        `;

        html = html.replace('</head>', `${ogTags}\n</head>`);
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (err) {
    // En cas d'erreur de serveur ou de fetch, renvoyer la SPA par défaut
    console.error("Erreur durant le traitement de la requête SSR:", err);
    const html = getBaseHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}