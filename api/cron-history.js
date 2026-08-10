export async function GET() {
  try {
    const POCKETBASE_URL = "https://api.vafmlaradio.fr";
    const STATS_URL = "https://manager10.streamradio.fr:1555/status-json.xsl";

    // 1. Récupérer les métadonnées Icecast
    const response = await fetch(`${STATS_URL}?nocache=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Flux indisponible" }), { status: 500 });
    }

    const data = await response.json();
    let rawTitle = "";

    if (data && data.icestats) {
      let source = data.icestats.source;
      if (Array.isArray(source)) source = source[0];
      if (source) {
        rawTitle = source.title || source.song || "";
      }
    }

    // Ignorer si pas de titre ou titre générique VAFM
    if (!rawTitle || typeof rawTitle !== "string" || rawTitle.includes("VAFM – En Direct")) {
      return new Response(JSON.stringify({ message: "Aucun titre valide" }), { status: 200 });
    }

    const formattedTitle = rawTitle.replace(/\s+[\-\–\—]\s+/, " – ").trim();

    // 2. VÉRIFICATION DES DOUBLONS DANS POCKETBASE
    const pbCheckRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=1`, { cache: 'no-store' });
    if (pbCheckRes.ok) {
      const pbCheckData = await pbCheckRes.json();
      const latestRecord = pbCheckData.items && pbCheckData.items[0];

      // Si le tout dernier morceau en BDD est identique, ON N'AJOUTE RIEN
      if (latestRecord && latestRecord.title.toLowerCase().trim() === formattedTitle.toLowerCase().trim()) {
        return new Response(JSON.stringify({ message: "Titre déjà enregistré, ignoré." }), { status: 200 });
      }
    }

    // 3. Récupération de la pochette iTunes
    let coverUrl = '/LOGO - VAFM.png';
    try {
      const query = formattedTitle.split(' – ')[0] || formattedTitle;
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results && itunesData.results.length > 0) {
          coverUrl = itunesData.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
        }
      }
    } catch (e) {
      console.warn("Erreur pochette iTunes:", e);
    }

    // 4. Heure française (Europe/Paris)
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZone: 'Europe/Paris' 
    });

    // 5. Enregistrement unique dans PocketBase
    const postRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formattedTitle,
        time: timeFormatted,
        cover: coverUrl
      })
    });

    if (!postRes.ok) {
      throw new Error("Erreur insertion PocketBase");
    }

    // 6. Nettoyage : suppression au-delà des 10 plus récents
    try {
      const cleanRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=50`, { cache: 'no-store' });
      if (cleanRes.ok) {
        const cleanData = await cleanRes.json();
        const items = cleanData.items || [];
        if (items.length > 10) {
          const itemsToDelete = items.slice(10);
          await Promise.all(itemsToDelete.map(item => 
            fetch(`${POCKETBASE_URL}/api/collections/song_history/records/${item.id}`, { method: 'DELETE' })
          ));
        }
      }
    } catch (e) {
      console.warn("Erreur nettoyage:", e);
    }

    return new Response(JSON.stringify({ success: true, added: formattedTitle }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}