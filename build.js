// build.js — Minifie automatiquement le CSS/JS au moment du déploiement Vercel.
// Les fichiers sources dans le repo GitHub restent 100% lisibles.
// Seule la copie générée dans /dist (mise en ligne) est minifiée, avec les mêmes noms de fichiers.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Dossiers/fichiers à ne jamais copier dans dist/
// "api" est exclu volontairement : ce sont tes fonctions serverless Vercel,
// elles doivent rester à la racine du repo (Vercel les détecte là, peu importe outputDirectory).
const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build.js', 'api',
  'package.json', 'package-lock.json', 'vercel.json', '.vercel'
]);

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function minifyInPlace(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      minifyInPlace(fullPath);
      continue;
    }

    const ext = path.extname(entry.name);
    if (ext === '.js' || ext === '.css') {
      const result = esbuild.transformSync(fs.readFileSync(fullPath, 'utf8'), {
        loader: ext === '.js' ? 'js' : 'css',
        minify: true,
        target: ext === '.js' ? 'es2018' : undefined,
      });
      fs.writeFileSync(fullPath, result.code);
    }
  }
}

console.log('→ Copie du site vers dist/ ...');
fs.rmSync(DIST, { recursive: true, force: true });
copyRecursive(ROOT, DIST);

console.log('→ Minification des .js et .css dans dist/ ...');
minifyInPlace(DIST);

console.log('✓ Build terminé : dist/ prêt à être déployé.');