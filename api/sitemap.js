export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  try {
    let articles = [];
    try {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records?sort=-created`);
      if (response.ok) {
        const data = await response.json();
        articles = data.items || [];
      }
    } catch (e) {
      console.error("Erreur de connexion PocketBase:", e);
    }

    const staticPages = ["", "/articles", "/contact"];
    const today = new Date().toISOString().split('T')[0];

    let urlsXml = staticPages.map(page => `
  <url>
    <loc>${SITE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

    articles.forEach(article => {
      // Formatage de la date en AAAA-MM-JJ
      const articleDate = article.updated ? article.updated.split('T')[0] : today;
      
      // Construction du slug propre à partir du champ 'slug' ou du titre
      let slug = article.slug;
      if (!slug && article.title) {
        slug = article.title
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime les accents
          .replace(/[^a-z0-9]/g, "-") // Remplace caractères spéciaux par tirets
          .replace(/-+/g, "-") // Évite les tirets doubles
          .replace(/^-|-$/g, ""); // Nettoie les tirets aux extrémités
      }

      // Format final : /article/news/ID-SLUG
      const articlePath = slug 
        ? `/article/news/${article.id}-${slug}` 
        : `/article/news/${article.id}`;

      urlsXml += `
  <url>
    <loc>${SITE_URL}${articlePath}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

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