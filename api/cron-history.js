export const dynamic = 'force-dynamic'; // Garantit qu'aucun cache Vercel ne bloque la route

export async function GET() {
  try {
    const POCKETBASE_URL = "https://api.vafmlaradio.fr";
    const STATS_URL = "https://manager10.streamradio.fr:1555/status-json.xsl";

    // 1. Récupérer les métadonnées Icecast avec un TIMEOUT de 5 secondes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let streamResponse;
    try {
      streamResponse = await fetch(`${STATS_URL}?nocache=${Date.now()}`, { 
        cache: 'no-store',
        signal: controller.signal 
      });
    } catch (e) {
      clearTimeout(timeoutId);
      // Renvoyer du 200 pour qu'il n'y ait PAS d'erreur 500 sur Cron-Job !
      return new Response(JSON.stringify({ status: "skipped", message: "Stream temporairement indisponible ou timeout" }), { status: 200 });
    }
    clearTimeout(timeoutId);

    if (!streamResponse.ok) {
      return new Response(JSON.stringify({ status: "skipped", message: "Flux indisponible (HTTP " + streamResponse.status + ")" }), { status: 200 });
    }

    const data = await streamResponse.json();
    let rawTitle = "";

    if (data && data.icestats) {
      let source = data.icestats.source;
      if (Array.isArray(source)) source = source[0];
      if (source) {
        rawTitle = source.title || source.song || "";
      }
    }

    const lowerRaw = rawTitle.toLowerCase().trim();

    // Filtre d'exclusion strict : vide ou identifiants VAFM
    if (!rawTitle || typeof rawTitle !== "string" || 
        lowerRaw.includes("vafm") || 
        lowerRaw.includes("le meilleur du son") || 
        lowerRaw.includes("radio qu'il vous faut")) {
      return new Response(JSON.stringify({ status: "skipped", message: "Aucun titre musical valide" }), { status: 200 });
    }

    const formattedTitle = rawTitle.replace(/\s+[\-\–\—]\s+/, " – ").trim();

    // 2. VÉRIFICATION DES DOUBLONS DANS POCKETBASE
    const pbCheckRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=1`, { cache: 'no-store' });
    if (pbCheckRes.ok) {
      const pbCheckData = await pbCheckRes.json();
      const latestRecord = pbCheckData.items && pbCheckData.items[0];

      // Si le tout dernier morceau en BDD est identique
      if (latestRecord && latestRecord.title && latestRecord.title.toLowerCase().trim() === formattedTitle.toLowerCase().trim()) {
        return new Response(JSON.stringify({ status: "skipped", message: "Titre déjà enregistré, ignoré." }), { status: 200 });
      }
    }

    // 3. Récupération de la pochette iTunes (avec Timeout rapide)
    let coverUrl = '/LOGO - VAFM.png';
    try {
      const itunesController = new AbortController();
      const itunesTimeout = setTimeout(() => itunesController.abort(), 3000);

      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(formattedTitle)}&entity=song&limit=1`, {
        signal: itunesController.signal
      });
      clearTimeout(itunesTimeout);

      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results && itunesData.results.length > 0) {
          coverUrl = itunesData.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
        } else {
          // Fallback : recherche sur l'artiste seul
          const artistOnly = formattedTitle.split(' – ')[0];
          const fallbackRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistOnly)}&entity=song&limit=1`);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData.results && fallbackData.results.length > 0) {
              coverUrl = fallbackData.results[0].artworkUrl100.replace('100x100bb', '300x300bb');
            }
          }
        }
      }
    } catch (e) {
      console.warn("Erreur ou timeout pochette iTunes:", e);
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
      const errText = await postRes.text();
      console.error("Erreur insertion PocketBase:", errText);
      return new Response(JSON.stringify({ status: "error", message: "Erreur PocketBase" }), { status: 200 });
    }

    // 6. Nettoyage OPTIMISÉ (Promise.all au lieu d'une boucle séquentielle lente)
    try {
      const cleanRes = await fetch(`${POCKETBASE_URL}/api/collections/song_history/records?sort=-created&limit=50`, { cache: 'no-store' });
      if (cleanRes.ok) {
        const cleanData = await cleanRes.json();
        const items = cleanData.items || [];
        
        if (items.length > 10) {
          const itemsToDelete = items.slice(10);
          // Suppression en parallèle ultra-rapide
          await Promise.allSettled(
            itemsToDelete.map(item => 
              fetch(`${POCKETBASE_URL}/api/collections/song_history/records/${item.id}`, { method: 'DELETE' })
            )
          );
        }
      }
    } catch (e) {
      console.warn("Erreur nettoyage:", e);
    }

    return new Response(JSON.stringify({ success: true, added: formattedTitle }), { status: 200 });

  } catch (err) {
    console.error("Erreur globale Cron:", err);
    // Renvoie 200 avec le détail de l'erreur pour ne PLUS JAMAIS désactiver le job sur Cron-Job.org
    return new Response(JSON.stringify({ status: "handled_error", error: err.message }), { status: 200 });
  }
}