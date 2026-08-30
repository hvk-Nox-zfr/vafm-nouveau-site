export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

  function formatDate(rawDate) {
    const fallback = new Date().toISOString().split('T')[0];
    if (!rawDate) return fallback;
    try {
      const cleanDateStr = String(rawDate).trim().replace(' ', 'T');
      const d = new Date(cleanDateStr);
      if (isNaN(d.getTime())) return fallback;
      return d.toISOString().split('T')[0];
    } catch (e) {
      return fallback;
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

  function buildSlug(rawTitle, id) {
    let slugPart = "";
    if (rawTitle) {
      slugPart = rawTitle
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    return slugPart ? `${id}-${slugPart}` : id;
  }

  function articleToXml(article, urlCategory) {
    const rawDate = article.created;
    const articleDate = formatDate(rawDate);
    const rawTitle = article.titre || article.title || article.slug || article.nom || article.subject || "";
    const fullSlug = buildSlug(rawTitle, article.id);
    const articlePath = `/article/${urlCategory}/${fullSlug}`;
    const collectionName = urlCategory === "hero" ? "hero" : "actus";

    let imageXmlBlock = "";
    const imageFileName = article.image || article.img || article.poster || article.illustration;
    if (imageFileName) {
      const imageUrl = `${POCKETBASE_URL}/api/files/${collectionName}/${article.id}/${imageFileName}`;
      const imageTitle = escapeXml(rawTitle || "VAFM Actu");

      imageXmlBlock = `
    <image:image>
      <image:loc>${escapeXml(imageUrl)}</image:loc>
      <image:title>${imageTitle}</image:title>
    </image:image>`;
    }

    return `
  <url>
    <loc>${escapeXml(`${SITE_URL}${articlePath}`)}</loc>
    <lastmod>${articleDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageXmlBlock}
  </url>`;
  }

  try {
    let actusArticles = [];
    let heroArticles = [];
    try {
      // Ajout de perPage=500 pour récupérer tous les articles sans blocage à 30
      const [actusRes, heroRes] = await Promise.all([
        fetch(`${POCKETBASE_URL}/api/collections/actus/records?filter=(is_published=true)&sort=-created&perPage=500`),
        fetch(`${POCKETBASE_URL}/api/collections/hero/records?filter=(is_published=true)&sort=-created&perPage=500`),
      ]);
      if (actusRes.ok) {
        const data = await actusRes.json();
        actusArticles = data.items || [];
      }
      if (heroRes.ok) {
        const data = await heroRes.json();
        heroArticles = data.items || [];
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

    actusArticles.forEach(article => { urlsXml += articleToXml(article, "news"); });
    heroArticles.forEach(article => { urlsXml += articleToXml(article, "hero"); });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlsXml}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).send(xml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}