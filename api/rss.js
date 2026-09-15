export default async function handler(req, res) {
  try {
    const pbResponse = await fetch('https://api.vafmlaradio.fr/api/collections/actus/records?sort=-created&perPage=30');
    const data = await pbResponse.json();
    const articles = data.items || [];

    const itemsXml = articles.map(item => {
      const slug = item.slug || item.id;
      const articleUrl = `https://vafmlaradio.fr/article/news/${item.id}-${slug}`;
      const imageUrl = item.image 
        ? `https://api.vafmlaradio.fr/api/files/actus/${item.id}/${item.image}`
        : 'https://vafmlaradio.fr/favicon-vafm.png';

      const title = item.title || item.titre || 'Actualité VAFM';
      const content = item.content || item.texte || item.description || '';
      const cleanContent = content.replace(/]]>/g, ']]&gt;');

      return `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <pubDate>${new Date(item.created).toUTCString()}</pubDate>
      <author>redaction@vafmlaradio.fr (VAFM)</author>
      <media:content url="${imageUrl}" medium="image" />
      <content:encoded><![CDATA[${cleanContent}]]></content:encoded>
    </item>`;
    }).join('');

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>VAFM – La Radio qu'il vous faut à Valenciennes</title>
    <link>https://vafmlaradio.fr</link>
    <description>Écoutez VAFM, la radio qu'il vous faut à Valenciennes ! Musique en direct, hits préférés et actualités locales du Valenciennois. Écoutez le direct dès maintenant.</description>
    <language>fr-FR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://pubsubhubbub.appspot.com/" rel="hub"/>
    <atom:link href="https://vafmlaradio.fr/rss.xml" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');
    return res.status(200).send(rssXml.trim());

  } catch (error) {
    return res.status(500).send('Erreur lors de la génération du flux RSS.');
  }
}