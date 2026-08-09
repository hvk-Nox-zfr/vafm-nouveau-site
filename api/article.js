import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  const { id } = req.query;
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  try {
    // 1. Lire le vrai index.html du projet
    const indexPath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');

    // 2. Extraire l'ID propre (les 15 premiers caractères de la clef)
    const cleanId = id ? id.substring(0, 15) : null;

    if (cleanId) {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records/${cleanId}`);
      if (response.ok) {
        const article = await response.json();
        const title = `${article.titre || article.title} | VAFM`;
        const rawText = article.texte || article.description || "";
        const description = rawText.replace(/<[^>]*>?/gm, '').substring(0, 160) + "...";
        const imageUrl = article.image 
          ? `${POCKETBASE_URL}/api/files/actus/${article.id}/${article.image}`
          : "https://vafmlaradio.fr/LOGO-VAFM.png";

        // Inserer dynamiquement les balises SEO dans l'index.html
        html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
        html = html.replace('</head>', `
          <meta name="description" content="${description}">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}">
          <meta property="og:image" content="${imageUrl}">
          </head>
        `);
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (err) {
    // En cas d'erreur, renvoyer quand meme la SPA
    const indexPath = path.join(process.cwd(), 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }
}