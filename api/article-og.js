export default async function handler(req, res) {
  const { category, id } = req.query;

  const POCKETBASE_URL = "https://api.vafmlaradio.fr"; 

  let title = "VAFM – La Radio qu'il vous faut";
  let description = "Retrouvez toute l'actualité et la musique en direct sur VAFM.";
  let imageUrl = "https://vafmlaradio.fr/LOGO-VAFM.png";

  const rawId = id || "";
  const cleanId = rawId.split('-')[0]; // Récupère uniquement l'ID sans le slug

  if (cleanId) {
    try {
      const collectionMap = { hero: 'hero', news: 'actus', actus: 'actus' };
      const collectionName = collectionMap[category] || 'actus';

      const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${cleanId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.titre || data.title) {
          title = `${data.titre || data.title} – VAFM`;
        }
        
        const rawText = data.texte || data.contenu || data.description || '';
        if (rawText) {
          description = rawText.replace(/<[^>]*>/g, '').substring(0, 160).trim();
        }

        if (data.image) {
          imageUrl = `${POCKETBASE_URL}/api/files/${collectionName}/${cleanId}/${data.image}`;
        }
      }
    } catch (e) {
      console.error("Erreur Fetch PocketBase dans article-og:", e);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${description}">
  
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
    window.location.href = "/?articleCategory=${category || 'actus'}&articleId=${cleanId}";
  </script>
</head>
<body>
  <p>Chargement de l'article VAFM...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}