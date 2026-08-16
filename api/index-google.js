import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const authKey = req.headers['x-api-key'];
  if (authKey !== process.env.INDEXING_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL manquante' });
  }

  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    
    // Nettoyage et Reconstitution de la clé RSA PEM
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '').trim()
      : '';

    const jwtClient = new google.auth.JWT({
      email: clientEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    const indexing = google.indexing({ version: 'v3', auth: jwtClient });
    
    const response = await indexing.urlNotifications.publish({
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