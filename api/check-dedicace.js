// api/check-dedicace.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        // Décodage sécurisé du body
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const { text } = body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("ERREUR VERCEL: GEMINI_API_KEY est absente des variables d'environnement.");
            return res.status(500).json({ isSafe: false, reason: "Clé API non configurée sur Vercel." });
        }

        if (!text) {
            return res.status(400).json({ isSafe: false, reason: "Texte manquant." });
        }

        const prompt = `Tu es le modérateur strict de la web radio VAFM.
Analyse ce message de dédicace : "${text}"

Règles :
1. Interdis toute insulte, vulgarité, troll, harcèlement ou provocation (ex: "caca", "pue", "t nul", "merde"), peu importe l'orthographe, les espaces ou le verlan.
2. Autorise uniquement les dédicaces amicales, sympathiques, amoureuses ou musicales.

Réponds STRICTEMENT sous forme de JSON :
{"safe": true} ou {"safe": false, "reason": "Motif très court en français"}`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    // Désactive les filtres natifs pour laisser l'IA répondre le JSON {safe: false}
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
            console.error("Erreur HTTP Gemini:", errText);
            return res.status(500).json({ isSafe: false, reason: "Erreur du service de modération." });
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        // Si Google bloque malgré tout la réponse
        if (candidate?.finishReason === "SAFETY" || !candidate?.content) {
            return res.status(200).json({ safe: false, reason: "Message refusé par la sécurité." });
        }

        let rawText = candidate.content.parts?.[0]?.text || "";
        rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

        if (!rawText) {
            return res.status(200).json({ safe: false, reason: "Analyse impossible." });
        }

        const result = JSON.parse(rawText);
        return res.status(200).json(result);

    } catch (err) {
        console.error("Erreur interne Serverless :", err);
        return res.status(500).json({ isSafe: false, reason: "Erreur du serveur de modération." });
    }
}