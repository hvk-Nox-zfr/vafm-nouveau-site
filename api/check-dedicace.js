// api/check-dedicace.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    // 1. Vérification explicite de la clé sur Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("[VAFM Moderation] GEMINI_API_KEY introuvable sur Vercel.");
        return res.status(200).json({ safe: false, reason: "Clé API non détectée sur Vercel." });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const text = body.text || "";

        if (!text.trim()) {
            return res.status(200).json({ safe: false, reason: "Message vide." });
        }

        // 2. Appel Gemini avec Schema Structuré Forcé
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Tu es le modérateur strict de la radio VAFM.
Analyse cette dédicace : "${text}"

Consignes :
- safe = false si le message contient : insulte, vulgarité, provocation, troll, gaminerie, haine, sexisme, harcèlement (ex: "caca", "pue", "t nul", "merde").
- safe = true si le message est amical, sympathique, amoureux, musical ou bienveillant.
- reason = explication très courte en français si safe = false.`
                        }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                safe: { type: "BOOLEAN" },
                                reason: { type: "STRING" }
                            },
                            required: ["safe"]
                        }
                    },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("[VAFM Moderation] Erreur Google:", response.status, errText);
            return res.status(200).json({ safe: false, reason: `Erreur API Google (${response.status})` });
        }

        const data = await response.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawJsonText) {
            return res.status(200).json({ safe: false, reason: "Message bloqué par la sécurité Gemini." });
        }

        const result = JSON.parse(rawJsonText);
        return res.status(200).json({
            safe: Boolean(result.safe),
            reason: result.reason || "Message refusé par la modération IA."
        });

    } catch (err) {
        console.error("[VAFM Moderation] Erreur interne :", err);
        // Impossible de faire crasher le serveur (500) : on renvoie l'erreur sous forme de message lisible
        return res.status(200).json({ safe: false, reason: "Erreur lors de l'analyse du message." });
    }
}