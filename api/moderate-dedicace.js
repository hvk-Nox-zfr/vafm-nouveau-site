// ============================================================================
// VAFM — Modération IA des dédicaces (Google Gemini, gratuit)
// ============================================================================
// Appelée par dedicaces.js AVANT de créer l'enregistrement PocketBase.
//
// Nécessite une variable d'environnement Vercel : GEMINI_API_KEY
// À récupérer gratuitement (sans carte bancaire) sur aistudio.google.com,
// bouton "Get API key". Le niveau gratuit permet ~1500 requêtes/jour,
// largement suffisant pour des dédicaces.
//
// Sans cette clé, on refuse par prudence plutôt que de laisser tout passer
// sans filtre.
// ============================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ approved: false, reason: 'Message manquant' });
  }

  // Même limite que côté client — on ne fait pas confiance qu'au JS du navigateur
  if (message.length > 30) {
    return res.status(200).json({ approved: false, reason: 'Message trop long' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY manquante dans les variables d'environnement Vercel");
    return res.status(200).json({ approved: false, reason: 'Modération indisponible' });
  }

  try {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Tu modères des dédicaces très courtes (30 caractères maximum) publiées publiquement sur le bandeau du site d'une radio locale familiale (VAFM). On te donne un message. Réponds SEULEMENT par un seul mot, sans aucun texte avant ni après, sans ponctuation : OUI si le message est acceptable pour un public familial (aucune insulte, propos haineux ou discriminatoire, contenu sexuel, violence, spam, lien, numéro de téléphone, ou contenu déplacé), ou NON s'il doit être bloqué. Un simple salut, prénom, ou message affectueux anodin (ex: \"coucou\", \"bonne journée\", \"salut la team\") est toujours OUI."
            }]
          },
          contents: [{ parts: [{ text: message }] }],
          generationConfig: {
            maxOutputTokens: 30,
            temperature: 0,
            // gemini-3.6-flash "réfléchit" en interne avant de répondre, et
            // ce temps de réflexion consomme une partie du budget
            // maxOutputTokens — pour une simple classification OUI/NON,
            // c'est inutile et ça faisait épuiser tout le budget avant même
            // d'écrire la réponse (finishReason: MAX_TOKENS, content vide).
            // On désactive donc la réflexion pour cette tâche précise.
            thinkingConfig: { thinkingBudget: 0 }
          },
          // Sans ceci, les filtres de sécurité par défaut de Gemini peuvent
          // bloquer la réponse à cause du SUJET de la consigne elle-même
          // (qui mentionne "insultes", "contenu sexuel" etc. comme exemples
          // à détecter) — même pour un message totalement inoffensif comme
          // "coucou". La réponse revient alors vide, et le code interprétait
          // ça comme un refus ("NON"), donnant l'impression que l'IA jugeait
          // le message vulgaire alors qu'elle n'avait tout simplement pas pu
          // répondre.
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      }
    );

    if (!aiRes.ok) {
      console.error('Erreur API Gemini :', await aiRes.text());
      return res.status(200).json({ approved: false, reason: 'technical', detail: 'Erreur de modération' });
    }

    const data = await aiRes.json();

    // Réponse bloquée par les filtres de sécurité de Gemini lui-même (pas un
    // refus de notre consigne) : on logue le détail pour comprendre, et on
    // traite ça comme une erreur technique, pas comme "message inapproprié".
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      console.error('Réponse Gemini bloquée par ses filtres internes :', blockReason, '— message :', message);
      return res.status(200).json({ approved: false, reason: 'technical', detail: `Bloqué par Gemini (${blockReason})` });
    }

    const textResponse = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();

    if (!textResponse) {
      console.error('Réponse Gemini vide/inattendue :', JSON.stringify(data));
      return res.status(200).json({ approved: false, reason: 'technical', detail: 'Réponse vide de Gemini' });
    }

    // On cherche OUI/NON n'importe où dans la réponse plutôt qu'au tout
    // début : avec seulement 5 tokens autorisés, un léger préambule avant
    // le mot-clé (même minime) le faisait tronquer avant qu'il n'apparaisse,
    // et tout finissait rejeté par défaut — d'où "coucou" refusé à tort.
    let approved;
    if (textResponse.includes('NON')) {
      approved = false;
    } else if (textResponse.includes('OUI')) {
      approved = true;
    } else {
      console.warn('Réponse Gemini ambiguë (ni OUI ni NON) :', textResponse);
      approved = false; // réponse imprévue : on refuse par prudence
    }

    return res.status(200).json({ approved, reason: approved ? null : 'content' });
  } catch (err) {
    console.error('Erreur modération dédicace :', err);
    return res.status(200).json({ approved: false, reason: 'technical', detail: 'Erreur serveur' });
  }
}