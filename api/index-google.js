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
    const clientEmail = "vafm-indexer@vafm-auth.iam.gserviceaccount.com";
    
    // Remplace par la valeur exacte de "private_key" présente dans ton fichier .json téléchargé depuis Google
    const rawKey = "-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQDfTqklWb73nLYa\nzwpx35RCSXCwbK+bmxwZvasqkzdQ7Ip/YWsjQ1TLZLLd4/iIjnc5IdfbFANNRUAf\n/h4lhTW5KxUb9RGfTcB0BjRA08Jdq8h8BmeyCCtdP/fg6hau/Qz9wIBsY0o6aodp\nO2MNg9exOT8VQA6iiqm8Etyrg9UeKbGSTvbTiyKWt+HIWid6MSbe/fOneo+SQrJG\nlzCLOlF119mxk+Bqo+PPYVwAI1jf9OW6AHP5d88/ITs86aEkPXHD8xd2kNZYxHR3\nHJtI8KUXyjqylqbjQXMFB+nXetvaUzGagmy4AqtZl50lLGC0cuD0Fwqq1ty2S6wP\nSwEuiZnJAgMBAAECgf8JxQDUoX7siYg61zpqjcPuvBSYcCjYP4qUyOq0JVZGNBMO\nTGf9IvT5JDt74Bb/fAjudvL6orJPFYVSR2VwpTAa6cecPk+6QhL2M7WvIGFghIna\nfNOmKYIikkN5LSsEFnR7C/D4zPjYyJ0j/XUku9MaVDOhhyvpiid8eVbHw8mPIciD\nqmj5QBEWlHnxt4d21/bWzHETY5zZCFUkySNy1VtGeRP/oQ+za+gGT6Ax+34JTTvm\nulPi7a5KkyWQmqsPj2qRmarOF13f5jQD8rdXS7XMyIByDAaj7knYbpcNNp2dgYfz\n8rMqMvjhq2jhJ5ac4xNuYLMZZYcAXehGZwzmbOECgYEA8hUWVYQNJPuYRBPJoTJI\n0Ga87SpBuIQ2dEop9BJMOL1UghhAHSmGIQt/KSHE5vzroY7p5NMP/uDaS+VREJ8X\nfCj8xRXIBouapZz8E6SIIc3u+1QCmAysdW/YCE6lDA78+kCzTIebnoKnTqo6oojR\nU5TAd8B2bDYH+DcVy8u7LxcCgYEA7CU+7iBmNd6gbScBIiP1Zt2s5Mo7Y+0DjD5L\nW7Bt+s6yHxtyZNqmvSN8eZUKKFDjFmLRU2Ufa1hvNUsA85tbDhYDNtQE4t3xLDs9\nhZr+M2Mmo0jktfwkVPuTpDHmjyP8A7gANHdIfUhFFDcwMTMNPPT4KAObQtT4EuNp\nMwo4Ch8CgYBRq6eTRi+hEHh4TyyxA2PpWx/V63GsrH4qkXLB8wJgCg/erAvFSuMD\ndvt5hvkE7MMaCDsEhehZlsZO4JiOwP2NV86fNw/6lVKhGOs6PUHoFa/QfrE5Vt0/\n6XG6q72m6c+TJgzXftCTk4SaV3fcqcflKMQeIoJRU5EwvnTOAneuFQKBgQCYtI05\nV+JAu7JqY2qsNSygVIFVgiFdwQsmSbJZnIHCSp+M1ibnaS2h6ay4wtRKtePjugs7\nLo1e0VU41UPMRI5hUYLKldiDDJrEy5pBJ7VybY+yz5R2ypKEEhurdkluDwsNLJOV\nWf2aZn2lUPrtFeJdpNxEo/BnC2lQbZa91sHeaQKBgG8uOJ5LZHZQUtWfRZaEuj7i\ngHLoKoVnhZQU7m2wW9XYlQhKQNI0UThySfp1jLYYba1cuzN7ykj8ZnbkxksrRlWQ\nDrIkj+m1GVLL+NTzGwIrih6rc10LOuDIcUwFfWGeRoroPHhDlVqWLH4kPJjy4wDZ\nfEoDIEvxUawltyqys1IA\n-----END PRIVATE KEY-----";

    // Reconstitution propre du format OpenSSL RSA PEM
    const formattedKey = rawKey
      .replace(/\\n/g, '\n')
      .replace(/"/g, '')
      .trim();

    const jwtClient = new google.auth.JWT({
      email: clientEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/indexing']
    });

    await jwtClient.authorize();

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