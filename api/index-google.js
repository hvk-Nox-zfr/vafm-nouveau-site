import { google } from 'googleapis';

export default async function handler(req, res) {
  const authKey = req.headers['x-api-key'];
  if (authKey !== process.env.INDEXING_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL manquante' });
  }

  try {
    // S'assure de parser proprement le JSON qu'il vienne de Vercel
    let serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (typeof serviceAccount === 'string') {
      serviceAccount = JSON.parse(serviceAccount);
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("Le compte de service Google est incomplet ou mal configuré.");
    }

    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ['https://www.googleapis.com/auth/indexing'],
      null
    );

    await jwtClient.authorize();

    const response = await google.indexing({ version: 'v3', auth: jwtClient }).urlNotifications.publish({
      requestBody: {
        url: url,
        type: 'URL_UPDATED'
      }
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('Erreur Google Indexing API:', error.message);
    return res.status(500).json({ error: error.message });
  }
}