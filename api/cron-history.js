// api/cron-history.js

export default async function handler(req, res) {
  const POCKETBASE_URL = "https://api.vafmlaradio.fr"; // Mets l'URL de ton PocketBase
  const STATS_URL = "https://manager10.streamradio.fr:1540/api/v1/widget/status"; // URL widget Streamradio

  try {
    // 1. Récupère le morceau actuellement diffusé sur Streamradio
    const response = await fetch(`${STATS_URL}?nocache=${Date.now()}`);
    if (!response.ok) {
      return res.status(500).json({ error: "Erreur lecture Streamradio" });
    }

    const data = await response.json();
    let currentTitle = "";

    if (data && data.history && data.history.length > 0) {
      currentTitle = data.history[0].title || data.history[0].song || "";
    }

    if (!currentTitle || currentTitle === "VAFM – En Direct") {
      return res.status(200).json({ message: "Aucun titre valide à enregistrer" });
    }

    const formattedTitle = currentTitle.replace(/\s+[\-\–\—]\s+/, " – ");

    // 2. Récupère le tout dernier morceau déjà enregistré dans PocketBase
    const pbCheck = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=1`);
    const pbData = await pbCheck.json();
    const lastSavedTitle = pbData.items && pbData.items.length > 0 ? pbData.items[0].title : "";

    // 3. Si le morceau a changé, on l'ajoute dans PocketBase
    if (formattedTitle.toLowerCase().trim() !== lastSavedTitle.toLowerCase().trim()) {
      const nowTime = new Date().toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Paris'
      });

      // Pochette Deezer / iTunes rapide
      let coverUrl = "LOGO-VAFM.png";
      try {
        const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(formattedTitle)}&limit=1`);
        if (deezerRes.ok) {
          const deezerData = await deezerRes.json();
          if (deezerData.data && deezerData.data.length > 0) {
            coverUrl = deezerData.data[0].album.cover_medium;
          }
        }
      } catch (e) {}

      // Création du record dans PocketBase
      await fetch(`${POCKETBASE_URL}/api/collections/song_history/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formattedTitle,
          time: nowTime,
          cover: coverUrl
        })
      });

      // Supprime tout ce qui dépasse le 10ème enregistrement le plus récent
      const oldRecordsRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&offset=10&limit=100`);
      if (oldRecordsRes.ok) {
        const oldRecordsData = await oldRecordsRes.json();
        if (oldRecordsData.items && oldRecordsData.items.length > 0) {
          for (const record of oldRecordsData.items) {
            await fetch(`${POCKETBASE_URL}/api/collections/song_history/records/${record.id}`, {
              method: 'DELETE'
            });
          }
        }
      }

      return res.status(200).json({ success: true, added: formattedTitle });
    }

    return res.status(200).json({ message: "Le titre n'a pas changé" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}