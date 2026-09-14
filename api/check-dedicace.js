// api/check-dedicace.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        const { text } = req.body || {};
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.error("ERREUR VERCEL: GEMINI_API_KEY est introuvable dans les variables d'environnement.");
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
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("Erreur Google Gemini API:", errText);
            return res.status(500).json({ isSafe: false, reason: "Erreur du service de modération." });
        }

        const data = await response.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

        const result = JSON.parse(rawText);
        return res.status(200).json(result);

    } catch (err) {
        console.error("Erreur interne Serverless :", err);
        return res.status(500).json({ isSafe: false, reason: "Erreur serveur de modération." });
    }
}