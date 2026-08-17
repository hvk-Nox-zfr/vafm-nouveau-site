export function getUserAvatar(username) {
  if (!username) return '/avatars/default.png';

  // Récupère la 1ère lettre, retire les accents et passe en minuscule
  const letter = username
    .trim()
    .charAt(0)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Si c'est une lettre entre a et z, on renvoie l'image correspondante
  if (/^[a-z]$/.test(letter)) {
    return `/avatars/${letter}.png`;
  }

  return '/avatars/default.png';
}