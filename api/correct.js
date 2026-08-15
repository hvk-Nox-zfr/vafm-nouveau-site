export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { html } = req.body;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                temperature: 0.0,
                top_p: 0.1,
                messages: [
                    {
                        role: "system",
                        content: "Tu es un moteur de correction orthographique et grammaticale ultra-strict. RÈGLES OBLIGATOIRES :\n1. Corrige UNIQUEMENT les fautes d'orthographe, de grammaire, de conjugaison, de typographie et de ponctuation.\n2. NE REFORMULE PAS, ne change AUCUN mot, ne modifie pas le style ni la tournure des phrases.\n3. Conserve TOUTES les balises HTML et leur structure exactement telles qu'elles sont dans le texte original.\n4. Renvoie UNIQUEMENT le code HTML/texte corrigé, sans introduction, sans commentaire et sans balises de bloc de code markdown (pas de ```)."
                    },
                    { role: "user", content: html }
                ]
            })
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}