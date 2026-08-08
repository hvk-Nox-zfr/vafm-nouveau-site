export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  try {
    // 1. Récupération dynamique de la liste de tes articles depuis PocketBase
    let articles = [];
    try {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/articles/records?sort=-created`);
      if (response.ok) {
        const data = await response.json();
        articles = data.items || [];
      }
    } catch (e) {
      console.error("Erreur récupération articles pour le sitemap:", e);
    }

    // 2. Construction de la liste des URLs (Pages fixes + Articles dynamiques)
    const staticPages = [
      "",
      "/articles",
      "/contact"
    ];

    const today = new Date().toISOString().split('T')[0];

    let urlsXml = staticPages.map(page => `
  <url>
    <loc>${SITE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

    // Ajout automatique de chaque article présent dans PocketBase
    articles.forEach(article => {
      const articleDate = article.updated ? article.updated.split('T')[0] : today;
      // Remplace 'slug' par 'id' ou la propriété correspondant au lien de l'article sur ton site
      const articleUrl = `${SITE_URL}/article.html?id=${article.id}`;

      urlsXml += `
  <url>
    <loc>${articleUrl}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // 3. Assemblage du XML complet
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;

    // 4. Envoi de la réponse avec le Content-Type XML
    res.setHeader("Content-Type", "text/xml");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}