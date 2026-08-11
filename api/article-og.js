export default async function handler(req, res) {
  const { category, id } = req.query;

  const POCKETBASE_URL = "https://vafmlaradio.fr"; // Ajuste avec l'URL de ton PocketBase

  let title = "VAFM – La Radio qu'il vous faut";
  let description = "Retrouvez toute l'actualité sur VAFM.";
  let imageUrl = "https://vafmlaradio.fr/LOGO-VAFM.png";

  try {
    const collectionMap = { hero: 'hero', news: 'actus', actus: 'actus' };
    const collectionName = collectionMap[category] || 'actus';

    const response = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}/records/${id}`);
    if (response.ok) {
      const data = await response.json();
      title = `${data.titre || data.title || 'Article'} – VAFM`;
      
      const rawText = data.texte || data.contenu || data.description || '';
      description = rawText.replace(/<[^>]*>/g, '').substring(0, 160).trim() || description;

      if (data.image) {
        imageUrl = `${POCKETBASE_URL}/api/files/${collectionName}/${id}/${data.image}`;
      }
    }
  } catch (e) {
    console.error("Erreur OG Fetch:", e);
  }

  // On renvoie un HTML minimaliste avec les bonnes métadonnées Open Graph
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
  <meta property="og:url" content="https://vafmlaradio.fr/article/${category}/${id}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

  <script>
    // Redirige les vrais utilisateurs vers l'application
    window.location.href = "/?articleCategory=${category}&articleId=${id}";
  </script>
</head>
<body>
  <p>Redirection vers l'article...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}