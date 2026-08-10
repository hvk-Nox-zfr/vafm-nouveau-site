export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  // Fonction utilitaire pour formater n'importe quelle date au format YYYY-MM-DD
  function formatDate(rawDate) {
    if (!rawDate) return new Date().toISOString().split('T')[0];
    try {
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

  // Fonction utilitaire pour échapper les caractères spéciaux XML
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
      const articleDate = formatDate(article.updated || article.created);
      
      const rawTitle = article.slug || article.titre || article.title || article.nom || article.subject || "";

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

      // Récupération de l'image de l'article depuis PocketBase
      let imageXmlBlock = "";
      const imageFileName = article.img || article.image || article.poster;
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
    <loc>${SITE_URL}${articlePath}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageXmlBlock}
  </url>`;
    });

    // Ajout du namespace image requis par Google
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