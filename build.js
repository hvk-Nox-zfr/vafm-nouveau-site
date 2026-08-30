// build.js — Minifie et met en cache long-terme le CSS/JS au moment du déploiement Vercel.
// Les fichiers sources dans le repo GitHub restent 100% lisibles, seule la copie
// générée dans /dist (celle qui est mise en ligne) est modifiée.
//
// Étapes :
//  1. Copie tout le site vers dist/ (sauf api/, node_modules, config...)
//  2. Minifie les .js et .css dans dist/
//  3. Renomme chaque .js/.css avec un hash de son contenu (ex: script.a1b2c3d4.js)
//     -> permet un cache navigateur "immutable" 1 an sans jamais servir une version périmée :
//        si le contenu change, le nom du fichier change automatiquement.
//  4. Met à jour les références (<link>, <script src>) dans les fichiers .html de dist/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

function walk(dir, callback) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

function minifyInPlace(dir) {
  walk(dir, (fullPath) => {
    const ext = path.extname(fullPath);
    if (ext === '.js' || ext === '.css') {
      const result = esbuild.transformSync(fs.readFileSync(fullPath, 'utf8'), {
        loader: ext === '.js' ? 'js' : 'css',
        minify: true,
        target: ext === '.js' ? 'es2018' : undefined,
      });
      fs.writeFileSync(fullPath, result.code);
    }
  });
}

// Renomme chaque .js/.css avec un hash de son contenu, retourne la table de correspondance
// { "/script.js": "/script.a1b2c3d4.js", ... }
function hashAssets(dir) {
  const renameMap = {};

  walk(dir, (fullPath) => {
    const ext = path.extname(fullPath);
    if (ext !== '.js' && ext !== '.css') return;

    const content = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);

    const relPath = '/' + path.relative(dir, fullPath).split(path.sep).join('/');
    const dirName = path.dirname(fullPath);
    const baseName = path.basename(fullPath, ext);
    const newFullPath = path.join(dirName, `${baseName}.${hash}${ext}`);
    const newRelPath = '/' + path.relative(dir, newFullPath).split(path.sep).join('/');

    fs.renameSync(fullPath, newFullPath);
    renameMap[relPath] = newRelPath;
  });

  return renameMap;
}

// Met à jour les <link href="..."> et <script src="..."> dans les fichiers html de dist/
function updateHtmlReferences(dir, renameMap) {
  walk(dir, (fullPath) => {
    if (path.extname(fullPath) !== '.html') return;

    let content = fs.readFileSync(fullPath, 'utf8');
    for (const [oldPath, newPath] of Object.entries(renameMap)) {
      // Remplace uniquement les occurrences entre guillemets (href="..." / src="...")
      content = content.split(`"${oldPath}"`).join(`"${newPath}"`);
    }
    fs.writeFileSync(fullPath, content);
  });
}

console.log('→ Copie du site vers dist/ ...');
fs.rmSync(DIST, { recursive: true, force: true });
copyRecursive(ROOT, DIST);

console.log('→ Minification des .js et .css dans dist/ ...');
minifyInPlace(DIST);

console.log('→ Renommage avec hash de contenu (cache long-terme) ...');
const renameMap = hashAssets(DIST);

console.log('→ Mise à jour des références dans les fichiers .html ...');
updateHtmlReferences(DIST, renameMap);

console.log('✓ Build terminé : dist/ prêt à être déployé.');
console.log(renameMap);