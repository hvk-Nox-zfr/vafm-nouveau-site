// ============================================================================
// VAFM — Contourne la priorité du système de fichiers sur les rewrites Vercel
// ============================================================================
// vercel.json a une règle "/" -> "/api/home", mais Vercel donne toujours la
// priorité à un fichier statique existant (ici dist/index.html) avant même
// de regarder les rewrites. Résultat : la règle ne se déclenche jamais pour
// la racine du site.
// Le Routing Middleware s'exécute PLUS TÔT dans le pipeline, avant cette
// vérification — c'est le seul moyen fiable d'intercepter "/" ici.
// Scope strictement limité à "/" (voir matcher) pour ne pas interférer avec
// les rewrites /article/... qui, eux, fonctionnent très bien sans ça.
// ============================================================================

import { rewrite } from '@vercel/functions';

export const config = {
  matcher: ['/'],
};

export default function middleware(request) {
  return rewrite(new URL('/api/home', request.url));
}
