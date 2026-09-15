const express = require('express');
const app = express();

// Helper pour convertir une date au format RFC 822 (ex: Tue, 15 Sep 2026 15:11:57 GMT)
function toRFC822(dateString) {
  return new Date(dateString).toUTCString();
}

// Nettoyage de sécurité pour le bloc CDATA
function cleanCdata(str) {
  return (str || '').replace(/]]>/g, ']]&gt;');
}

app.get('/rss.xml', async (req, res) => {
  try {
    // 1. Récupération des 30 derniers articles récents depuis PocketBase
    const pbResponse = await fetch('https://api.vafmlaradio.fr/api/collections/actus/records?sort=-created&perPage=30');
    
    if (!pbResponse.ok) {
      throw new Error(`Erreur HTTP PocketBase: ${pbResponse.status}`);
    }

    const data = await pbResponse.json();
    const articles = data.items || [];

    // 2. Génération des balises <item>
    const itemsXml = articles.map(item => {
      // Ajuste 'slug' ou 'titre' selon les noms exacts de tes champs PocketBase
      const slug = item.slug || item.id;
      const articleUrl = `https://vafmlaradio.fr/article/news/${item.id}-${slug}`;
      
      // Image de l'article (ou image par défaut VAFM)
      const imageUrl = item.image 
        ? `https://api.vafmlaradio.fr/api/files/actus/${item.id}/${item.image}`
        : 'https://vafmlaradio.fr/LOGO-VAFM.png';

      const title = item.title || item.titre || 'Actualité VAFM';
      const content = item.content || item.texte || item.description || '';

      return `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <pubDate>${toRFC822(item.created)}</pubDate>
      <author>redaction@vafmlaradio.fr (VAFM)</author>
      <media:content url="${imageUrl}" medium="image" />
      <content:encoded><![CDATA[${cleanCdata(content)}]]></content:encoded>
    </item>`;
    }).join('');

    // 3. Assemblage du document XML complet
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>VAFM - L'actualité de la région</title>
    <link>https://vafmlaradio.fr</link>
    <description>Retrouvez toute l'actualité locale et la web radio en direct sur VAFM.</description>
    <language>fr-FR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;

    // 4. Envoi de la réponse avec le bon Content-Type XML
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(rssXml.trim());

  } catch (error) {
    console.error('Erreur lors de la génération du flux RSS :', error);
    res.status(500).send('Erreur lors de la génération du flux RSS.');
  }
});

// Lancement du serveur (adapter le port si nécessaire)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Routeur RSS actif sur http://localhost:${PORT}/rss.xml`);
});