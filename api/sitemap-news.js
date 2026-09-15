export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  const SITE_URL = "https://vafmlaradio.fr";

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

  function buildSlug(article) {
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

    return { cleanTitle, fullSlug: slugPart ? `${article.id}-${slugPart}` : article.id };
  }

  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pbFormattedDate = fortyEightHoursAgo
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "");

    // Prise en compte de published_at et created pour le filtre 48h
    const filterQuery = encodeURIComponent(`is_published = true && (published_at >= "${pbFormattedDate}" || created >= "${pbFormattedDate}")`);

    const [actusRes, heroRes] = await Promise.all([
      fetch(`${POCKETBASE_URL}/api/collections/actus/records?filter=(${filterQuery})&sort=-created`),
      fetch(`${POCKETBASE_URL}/api/collections/hero/records?filter=(${filterQuery})&sort=-created`),
    ]);

    let articles = [];
    if (actusRes.ok) {
      const data = await actusRes.json();
      articles = articles.concat((data.items || []).map(a => ({ ...a, __urlCategory: "news" })));
    }
    if (heroRes.ok) {
      const data = await heroRes.json();
      articles = articles.concat((data.items || []).map(a => ({ ...a, __urlCategory: "hero" })));
    }

    const validArticles = articles.filter(art => Boolean(art.is_published));

    const urlsXml = validArticles.map(article => {
      const { cleanTitle, fullSlug } = buildSlug(article);
      const articleUrl = `${SITE_URL}/article/${article.__urlCategory}/${fullSlug}`.trim();

      const pubDateSource = article.published_at || article.created;
      const pubDate = new Date(pubDateSource).toISOString().replace(/\.\d{3}Z$/, "Z");

      return `  <url>
    <loc>${articleUrl}</loc>
    <news:news>
      <news:publication>
        <news:name>VAFM - La Radio qu'il vous faut</news:name>
        <news:language>fr</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXmlText(cleanTitle)}</news:title>
    </news:news>
  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlsXml}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(xml);

  } catch (err) {
    console.error("Erreur génération sitemap-news:", err);
    return res.status(500).json({ error: err.message });
  }
}