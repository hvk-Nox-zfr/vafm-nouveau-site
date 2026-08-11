import { google } from 'googleapis';

export default async function handler(req, res) {
  // Sécurisation de l'API
  const authKey = req.headers['x-api-key'];
  if (authKey !== process.env.INDEXING_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL manquante' });
  }

  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

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
    console.error('Erreur Google Indexing API:', error);
    return res.status(500).json({ error: error.message });
  }
}