export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  function escapeXml(str) {
    if (!str) return "";
    return String(str).replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  try {
    // 1. Calculer la date limite (48h en arrière)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 2. Récupérer uniquement les articles créés il y a moins de 48 heures
    const response = await fetch(
      `${POCKETBASE_URL}/api/collections/actus/records?filter=(created>="${fortyEightHoursAgo}")&sort=-created`
    );

    let articles = [];
    if (response.ok) {
      const data = await response.json();
      articles = data.items || [];
    }

    // 3. Générer le flux XML au format Google News
    let urlsXml = articles.map(article => {
      const rawTitle = article.titre || article.title || article.slug || article.nom || "";
      
      let slugPart = "";
      if (rawTitle) {
        slugPart = rawTitle
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      const fullSlug = slugPart ? `${article.id}-${slugPart}` : article.id;
      const articleUrl = `${SITE_URL}/article/news/${fullSlug}`;

      // Date au format ISO 8601 complète (ex: 2026-08-13T21:00:00.000Z)
      const pubDate = new Date(article.created).toISOString();

      return `
  <url>
    <loc>${escapeXml(articleUrl)}</loc>
    <news:news>
      <news:publication>
        <news:name>VAFM</news:name>
        <news:language>fr</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(rawTitle)}</news:title>
    </news:news>
  </url>`;
    }).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlsXml}
</urlset>`;

    res.setHeader("Content-Type", "text/xml");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}