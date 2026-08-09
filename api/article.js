export default async function handler(req, res) {
  const { id } = req.query;
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";

  try {
    // 1. Récupération de l'article depuis PocketBase
    const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records/${id}`);
    
    let title = "VAFM - La radio qu'il vous faut";
    let description = "Le meilleur du son en direct !";
    let imageUrl = "https://vafmlaradio.fr/LOGO-VAFM.png";

    if (response.ok) {
      const article = await response.json();
      title = `${article.titre || article.title} | VAFM`;
      
      // Nettoyage du texte HTML pour la description
      const rawText = article.texte || article.description || "";
      description = rawText.replace(/<[^>]*>?/gm, '').substring(0, 160) + "...";
      
      if (article.image) {
        imageUrl = `${POCKETBASE_URL}/api/files/actus/${article.id}/${article.image}`;
      }
    }

    // 2. Génération du HTML avec les bonnes balises SEO
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <title>${title}</title>
  <meta name="description" content="${description}">

  <!-- Open Graph / Google / Socials -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="https://vafmlaradio.fr${req.url}">

  <!-- Redirection automatique du navigateur vers l'index pour que la SPA prenne le relais -->
  <script>
    window.location.href = "${req.url}";
  </script>
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (err) {
    return res.redirect(302, '/');
  }
}