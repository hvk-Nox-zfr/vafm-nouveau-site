export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr";
  // On utilise l'URL d'API sans le port 1540 si elle existe, ou le flux JSON direct
  const STATS_URL = "https://manager10.streamradio.fr:1540/api/v1/widget/status";

  try {
    // 1. Récupère le morceau en cours sur Streamradio
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

    if (data && data.history && data.history.length > 0) {
      currentTitle = data.history[0].title || data.history[0].song || "";
    } else if (data && data.song) {
      currentTitle = data.song;
    }

    if (!currentTitle || currentTitle === "VAFM – En Direct") {
      return res.status(200).json({ message: "Aucun titre valide" });
    }

    const formattedTitle = currentTitle.replace(/\s+[\-\–\—]\s+/, " – ");

    // 2. Vérifie le dernier titre enregistré dans PocketBase
    const pbCheck = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=1`);
    const pbData = await pbCheck.json();
    const lastSavedTitle = pbData.items && pbData.items.length > 0 ? pbData.items[0].title : "";

    // 3. S'il s'agit d'un nouveau titre, enregistre-le
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

      // Ajout du morceau dans PocketBase
      await fetch(`${POCKETBASE_URL}/api/collections/song_history/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formattedTitle,
          time: nowTime,
          cover: coverUrl
        })
      });

      // Nettoyage : Supprime ce qui dépasse les 10 derniers
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