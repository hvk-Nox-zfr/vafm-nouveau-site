// api/cron-history/route.js (ou pages/api/cron-history.js)

export async function GET() {
  try {
    // 1. Récupérer le titre en direct depuis le flux Icecast/Streamradio
    const statsRes = await fetch("https://manager10.streamradio.fr:1555/status-json.xsl", { cache: 'no-store' });
    if (!statsRes.ok) return new Response("Erreur Stream", { status: 500 });

    const data = await statsRes.json();
    let rawTitle = data?.icestats?.source?.title || data?.icestats?.source?.[0]?.title || "";

    if (!rawTitle || rawTitle.includes("VAFM – En Direct")) {
      return new Response(JSON.stringify({ message: "Titre générique ignoré" }), { status: 200 });
    }

    const formattedTitle = rawTitle.replace(/\s+[\-\–\—]\s+/, " – ").trim();

    // 2. Vérifier le dernier titre présent dans PocketBase
    const pbUrl = "https://api.vafmlaradio.fr";
    const lastRecRes = await fetch(`${pbUrl}/api/collections/song_history/records?sort=-created&limit=1`, { cache: 'no-store' });
    if (lastRecRes.ok) {
      const lastRecData = await lastRecRes.json();
      const latestItem = lastRecData.items?.[0];

      // Si le titre est identique au dernier enregistré, ON NE FAIT RIEN (pas de doublon)
      if (latestItem && latestItem.title.toLowerCase().trim() === formattedTitle.toLowerCase().trim()) {
        return new Response(JSON.stringify({ message: "Morceau déjà enregistré" }), { status: 200 });
      }
    }

    // 3. Récupérer la pochette iTunes
    let coverUrl = '/LOGO - VAFM.png';
    try {
      const query = formattedTitle.split(' – ')[0] || formattedTitle;
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results?.[0]?.artworkUrl100) {
          coverUrl = itunesData.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
        }
      }
    } catch (e) {}

    // 4. Heure au format français (Europe/Paris)
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZone: 'Europe/Paris' 
    });

    // 5. Un seul enregistrement propre en base de données
    await fetch(`${pbUrl}/api/collections/song_history/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formattedTitle,
        time: timeFormatted,
        cover: coverUrl
      })
    });

    return new Response(JSON.stringify({ success: true, added: formattedTitle }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}