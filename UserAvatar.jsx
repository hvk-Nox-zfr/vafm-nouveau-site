import React from 'react';
import Image from 'next/image';

export default function UserAvatar({ user, onClick }) {
  // 1. État NON CONNECTÉ : Icône SVG utilisateur stylée
  if (!user) {
    return (
      <button 
        onClick={onClick} 
        aria-label="Se connecter"
        className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800/80 hover:bg-neutral-700 transition-all border border-white/10 shadow-md backdrop-blur-md cursor-pointer group"
      >
        <svg 
          className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" 
          fill="currentColor" 
          viewBox="0 0 24 24"
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </button>
    );
  }

  // 2. État CONNECTÉ : Récupération dynamique de l'avatar selon la 1ère lettre
  const firstName = user.name || user.username || user.email || "A";
  const firstLetter = firstName.charAt(0).toLowerCase();

  // Chemin dynamique vers tes images personnalisées d'alphabet (ex: /avatars/a.png, /avatars/h.png)
  const avatarPath = `/avatars/${firstLetter}.png`; // Change l'extension en .svg ou .webp si besoin

  return (
    <button 
      onClick={onClick} 
      aria-label={`Profil de ${firstName}`}
      className="relative flex items-center justify-center w-10 h-10 rounded-full overflow-hidden transition-transform duration-200 hover:scale-105 focus:outline-none cursor-pointer shadow-lg border border-white/20"
    >
      <Image
        src={avatarPath}
        alt={`Avatar ${firstLetter.toUpperCase()}`}
        width={40}
        height={40}
        className="w-full h-full object-cover"
        // Sécurité si l'image de la lettre n'existe pas encore
        onError={(e) => {
          e.target.srcset = "/avatars/default.png"; // Avatar de secours
        }}
      />
    </button>
  );
}