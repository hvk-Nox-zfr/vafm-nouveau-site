export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  try {
    // 1. Récupération des articles depuis la collection 'actus'
    let articles = [];
    try {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records?sort=-created`);
      if (response.ok) {
        const data = await response.json();
        articles = data.items || [];
      } else {
        console.error(`Erreur PocketBase API: ${response.status}`);
      }
    } catch (e) {
      console.error("Erreur de connexion PocketBase:", e);
    }

    // 2. Pages statiques
    const staticPages = ["", "/articles", "/contact"];
    const today = new Date().toISOString().split('T')[0];

    let urlsXml = staticPages.map(page => `
  <url>
    <loc>${SITE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

    // 3. Génération dynamique des URLs pour chaque article
    articles.forEach(article => {
      const articleDate = article.updated ? article.updated.split('T')[0] : today;
      
      // Utilise le champ 'slug' s'il existe, sinon l'identifiant 'id'
      const path = article.slug ? `/article/${article.slug}` : `/article.html?id=${article.id}`;
      const articleUrl = `${SITE_URL}${path}`;

      urlsXml += `
  <url>
    <loc>${articleUrl}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    // 4. Sortie XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;

    res.setHeader("Content-Type", "text/xml");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}