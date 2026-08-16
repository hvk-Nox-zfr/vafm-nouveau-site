export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  function formatDate(rawDate) {
    if (!rawDate) return "2026-01-01";
    try {
      const cleanDateStr = String(rawDate).trim().replace(' ', 'T');
      const d = new Date(cleanDateStr);
      if (isNaN(d.getTime())) return "2026-01-01";
      return d.toISOString().split('T')[0];
    } catch (e) {
      return "2026-01-01";
    }
  }

  function escapeXml(str) {
    if (!str) return "";
    return String(str).replace(/[<>&'"]/g, function (c) {
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
    let articles = [];
    try {
      // Ajout de perPage=500 pour récupérer tous les articles sans blocage à 30
      const response = await fetch(`${POCKETBASE_URL}/api/collections/actus/records?sort=-created&perPage=500`);
      if (response.ok) {
        const data = await response.json();
        articles = data.items || [];
      }
    } catch (e) {
      console.error("Erreur de connexion PocketBase:", e);
    }

    // Uniquement la page d'accueil si /articles et /contact n'existent pas
    const staticPages = [""];
    const today = new Date().toISOString().split('T')[0];

    let urlsXml = staticPages.map(page => `
  <url>
    <loc>${SITE_URL}${page}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`).join("");

    articles.forEach(article => {
      const rawDate = article.created;
      const articleDate = formatDate(rawDate);
      const rawTitle = article.titre || article.title || article.slug || article.nom || article.subject || "";

      let slugPart = "";
      if (rawTitle) {
        slugPart = rawTitle
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      const fullSlug = slugPart ? `${article.id}-${slugPart}` : article.id;
      const articlePath = `/article/news/${fullSlug}`;

      let imageXmlBlock = "";
      const imageFileName = article.image || article.img || article.poster || article.illustration;
      if (imageFileName) {
        const imageUrl = `${POCKETBASE_URL}/api/files/actus/${article.id}/${imageFileName}`;
        const imageTitle = escapeXml(rawTitle || "VAFM Actu");
        
        imageXmlBlock = `
    <image:image>
      <image:loc>${escapeXml(imageUrl)}</image:loc>
      <image:title>${imageTitle}</image:title>
    </image:image>`;
      }

      urlsXml += `
  <url>
    <loc>${escapeXml(`${SITE_URL}${articlePath}`)}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageXmlBlock}
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlsXml}
</urlset>`;

    res.setHeader("Content-Type", "text/xml");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}