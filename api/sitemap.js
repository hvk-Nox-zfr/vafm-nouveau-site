export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  // Fonction utilitaire pour formater n'importe quelle date au format YYYY-MM-DD
  function formatDate(rawDate) {
    if (!rawDate) return new Date().toISOString().split('T')[0];
    try {
      // Remplace l'espace classique de PocketBase par "T" si présent
      const cleanDateStr = String(rawDate).replace(' ', 'T');
      const d = new Date(cleanDateStr);
      if (isNaN(d.getTime())) {
        return new Date().toISOString().split('T')[0];
      }
      return d.toISOString().split('T')[0];
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  }

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
      // Utilisation de la fonction formatDate sécurisée
      const articleDate = formatDate(article.updated || article.created);
      
      // 1. Récupération du titre
      const rawTitle = article.slug || article.titre || article.title || article.nom || article.subject || "";

      // 2. Transformation en slug propre
      let slugPart = "";
      if (rawTitle) {
        slugPart = rawTitle
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime les accents
          .replace(/[^a-z0-9]+/g, "-")                     // Remplace espaces et ponctuation par des tirets
          .replace(/^-|-$/g, "");                           // Supprime les tirets au début/fin
      }

      // 3. Construction de l'URL finale
      const fullSlug = slugPart ? `${article.id}-${slugPart}` : article.id;
      const articlePath = `/article/news/${fullSlug}`;

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