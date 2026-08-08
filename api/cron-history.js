export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  // Endpoint standard Icecast / Streamradio
  const STATS_URL = "https://manager10.streamradio.fr:1540/status-json.xsl";

  try {
    const response = await fetch(`${STATS_URL}?nocache=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: `Erreur Streamradio (Statut: ${response.status})` });
    }

    const data = await response.json();
    let currentTitle = "";

    // Extraction du titre selon la structure Icecast
    if (data && data.icestats && data.icestats.source) {
      const source = Array.isArray(data.icestats.source) 
        ? data.icestats.source[0] 
        : data.icestats.source;
      currentTitle = source.title || source.yp_currently_playing || "";
    } else if (data && data.title) {
      currentTitle = data.title;
    }

    if (!currentTitle || currentTitle === "VAFM – En Direct") {
      return res.status(200).json({ message: "Aucun titre valide extrait", raw: data });
    }

    const formattedTitle = currentTitle.replace(/\s+[\-\–\—]\s+/, " – ");

    // 2. Vérification dans PocketBase
    const pbCheck = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=1`);
    const pbData = await pbCheck.json();
    const lastSavedTitle = pbData.items && pbData.items.length > 0 ? pbData.items[0].title : "";

    // 3. Enregistrement si nouveau titre
    if (formattedTitle.toLowerCase().trim() !== lastSavedTitle.toLowerCase().trim()) {
      const nowTime = new Date().toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Paris'
      });

      let coverUrl = "LOGO - VAFM.png";
      try {
        const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(formattedTitle)}&limit=1`);
        if (deezerRes.ok) {
          const deezerData = await deezerRes.json();
          if (deezerData.data && deezerData.data.length > 0) {
            coverUrl = deezerData.data[0].album.cover_medium;
          }
        }
      } catch (e) {}

      await fetch(`${POCKETBASE_URL}/api/collections/song_history/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formattedTitle,
          time: nowTime,
          cover: coverUrl
        })
      });

      // Nettoyage des anciens enregistrements (> 10)
      const oldRecordsRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&offset=10&limit=50`);
      if (oldRecordsRes.ok) {
        const oldRecordsData = await oldRecordsRes.json();
        for (const record of oldRecordsData.items || []) {
          await fetch(`${POCKETBASE_URL}/api/collections/song_history/records/${record.id}`, {
            method: 'DELETE'
          });
        }
      }

      return res.status(200).json({ success: true, added: formattedTitle });
    }

    return res.status(200).json({ message: "Le titre n'a pas changé" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}