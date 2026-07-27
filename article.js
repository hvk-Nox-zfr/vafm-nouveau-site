let currentArticleData = null;
let currentCategory = null;
let currentId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Récupération des paramètres de l'URL (?type=hero&id=xxx)
    const urlParams = new URLSearchParams(window.location.search);
    currentCategory = urlParams.get('type') || 'news';
    currentId = urlParams.get('id');

    if (!currentId) {
        document.getElementById('article-title').innerText = "Article non trouvé";
        return;
    }

    await loadArticleData();
});

// Chargement des données de l'article depuis Supabase
async function loadArticleData() {
    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[currentCategory] || 'actus';

    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq('id', currentId)
        .single();

    if (error || !data) {
        console.error("Erreur chargement article:", error);
        document.getElementById('article-title').innerText = "Impossible de charger cet article.";
        return;
    }

    currentArticleData = data;

    // Normalisation des champs
    const title = data.titre || data.title || data.nom || 'Sans titre';
    const text = data.texte || data.description || data.contenu || '';
    const img = data.imageUrl || data.image_url || data.img_url || '';
    const date = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : '';

    // Injection dans le DOM
    document.getElementById('article-title').innerText = title;
    document.getElementById('article-category').innerText = currentCategory;
    document.getElementById('article-date').innerText = date ? `Publié le ${date}` : '';
    
    // Remplacement des sauts de ligne par des paragraphes
    document.getElementById('article-content').innerHTML = text.split('\n').map(p => `<p>${p}</p>`).join('');

    const imgElem = document.getElementById('article-cover');
    if (img) {
        imgElem.src = img;
        imgElem.style.display = 'block';
    } else {
        imgElem.style.display = 'none';
    }

    // Gestion de la visibilité des outils d'admin
    checkAdminAccess();
}

// Vérifie si l'admin est connecté pour afficher les boutons d'édition
function checkAdminAccess() {
    const isEdit = Boolean(appState.editMode && appState.currentUser);
    const adminControls = document.getElementById('article-admin-controls');
    if (adminControls) {
        adminControls.style.display = isEdit ? 'flex' : 'none';
    }
}

// Ouvre la modale pré-remplie
function openArticleEditorModal() {
    if (!currentArticleData) return;

    document.getElementById('editor-category').value = currentCategory;
    document.getElementById('editor-item-id').value = currentId;
    document.getElementById('editor-title').value = currentArticleData.titre || currentArticleData.title || currentArticleData.nom || '';
    document.getElementById('editor-text').value = currentArticleData.texte || currentArticleData.description || currentArticleData.contenu || '';

    const preview = document.getElementById('editor-img-preview');
    const img = currentArticleData.imageUrl || currentArticleData.image_url || '';
    if (img) {
        preview.src = img;
        preview.style.display = 'block';
    }

    document.getElementById('editor-modal').classList.add('active');
}

// Sauvegarde des modifications
async function handleArticleSave(e) {
    e.preventDefault();
    await handleCardFormSubmit(e); // Réutilise la fonction d'upload/save de script.js
    await loadArticleData(); // Recharge les données à jour
}

// Suppression de l'article
async function deleteCurrentArticle() {
    if (!confirm("Voulez-vous vraiment supprimer cet article ?")) return;

    const tableMap = { hero: 'hero', news: 'actus', shows: 'emissions', team: 'animateurs' };
    const tableName = tableMap[currentCategory];

    const { error } = await supabaseClient.from(tableName).delete().eq('id', currentId);
    if (error) {
        alert("Erreur de suppression : " + error.message);
    } else {
        window.location.href = 'index.html';
    }
}