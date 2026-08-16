export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  // Échappement ciblé pour le contenu texte XML
  function escapeXmlText(str) {
    if (!str) return "";
    return String(str)
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  try {
    // 1. Calculer la date limite (48h en arrière) au format PocketBase UTC "YYYY-MM-DD HH:mm:ss"
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pbFormattedDate = fortyEightHoursAgo
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "");

    // 2. Récupérer les articles publiés créés dans les dernières 48h
    const filterQuery = encodeURIComponent(`is_published = true && created >= "${pbFormattedDate}"`);
    
    const response = await fetch(
      `${POCKETBASE_URL}/api/collections/actus/records?filter=(${filterQuery})&sort=-created`
    );

    let articles = [];
    if (response.ok) {
      const data = await response.json();
      articles = data.items || [];
    }

    // 3. Filtrage de sécurité côté JS
    const validArticles = articles.filter(art => Boolean(art.is_published));

    // 4. Génération des blocs <url>
    const urlsXml = validArticles.map(article => {
      const rawTitle = article.titre || article.title || article.slug || article.nom || "";
      const cleanTitle = rawTitle.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
      
      let slugPart = "";
      if (cleanTitle) {
        slugPart = cleanTitle
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }

      const fullSlug = slugPart ? `${article.id}-${slugPart}` : article.id;
      const articleUrl = `${SITE_URL}/article/news/${fullSlug}`.trim();
      
      // Date W3C ISO 8601 sans millisecondes pour Google News
      const pubDate = new Date(article.created).toISOString().replace(/\.\d{3}Z$/, "Z");

      return `  <url>
    <loc>${articleUrl}</loc>
    <news:news>
      <news:publication>
        <news:name>VAFM</news:name>
        <news:language>fr</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXmlText(cleanTitle)}</news:title>
    </news:news>
  </url>`;
    }).join("\n");

    // 5. Assemblage final
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlsXml}
</urlset>`;

    // Envoi HTTP
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(xml);

  } catch (err) {
    console.error("Erreur génération sitemap-news:", err);
    return res.status(500).json({ error: err.message });
  }
}