# Migration : Ajout du niveau aux cours

## 🎯 Objectif
Améliorer la logique du système en ajoutant une colonne `niveau` directement à la table `cours` au lieu de passer par les groupes.

## 🔄 Changements apportés

### 1. Structure de la base de données
- **Avant** : Le niveau était déterminé via `groupes.niveau`
- **Après** : Le niveau est directement dans `cours.niveau`

### 2. Pages modifiées

#### 📚 Page des cours (`/cours`)
- ✅ Ajout du champ `niveau` dans le formulaire d'ajout
- ✅ Ajout du champ `niveau` dans le formulaire d'édition
- ✅ Affichage du niveau dans le tableau
- ✅ Validation du niveau (L1, L2, L3, M1, M2)
- ✅ Import Excel avec support du niveau

#### 📋 Page des séances (`/seances`)
- ✅ Filtrage par niveau des cours au lieu des groupes
- ✅ Interface : Niveau → Cours → Groupe
- ✅ Formulaire d'édition adapté

#### ⚙️ Page de génération (`/generation`)
- ✅ Récupération des niveaux depuis les cours
- ✅ Récupération des spécialités depuis les cours
- ✅ Logique de sélection adaptée

#### 📅 Page d'emploi du temps (`/emploi-du-temps`)
- ✅ Filtrage par niveau des cours
- ✅ Affichage des cours du niveau sélectionné uniquement

### 3. Logique de génération
- ✅ Filtrage des séances par niveau des cours
- ✅ Génération respectant le niveau sélectionné

## 🚀 Installation

### Étape 1 : Exécuter la migration SQL
```sql
-- Exécutez le script migration_add_niveau_to_cours.sql dans Supabase
```

### Étape 2 : Mettre à jour les cours existants
1. Allez sur la page `/cours`
2. Modifiez chaque cours pour lui assigner le bon niveau
3. Ou utilisez l'import Excel avec une colonne "niveau"

### Étape 3 : Vérifier les séances
1. Allez sur la page `/seances`
2. Vérifiez que les séances sont correctement associées aux cours

## 🎯 Avantages

### ✅ Logique plus claire
- Un cours = un niveau spécifique
- Plus besoin de passer par les groupes pour déterminer le niveau

### ✅ Interface simplifiée
- Sélection directe : Niveau → Cours → Groupe
- Filtrage intuitif et rapide

### ✅ Performance améliorée
- Requêtes plus simples
- Index sur les colonnes niveau et spécialité

### ✅ Cohérence des données
- Évite les incohérences entre cours et groupes
- Validation au niveau de la base de données

## 🔧 Utilisation

### Créer un nouveau cours
1. Aller sur `/cours`
2. Remplir le nom et sélectionner le niveau
3. Le cours est maintenant lié à un niveau spécifique

### Créer une séance
1. Aller sur `/seances`
2. Sélectionner le niveau → le cours → le groupe
3. La séance hérite automatiquement du niveau du cours

### Générer un emploi du temps
1. Aller sur `/generation`
2. Sélectionner Niveau → Spécialité → Section
3. Seuls les cours du niveau sélectionné seront générés

### Consulter l'emploi du temps
1. Aller sur `/emploi-du-temps`
2. Sélectionner le niveau
3. Seuls les cours de ce niveau s'affichent

## ⚠️ Notes importantes

- **Migration des données** : Les cours existants auront le niveau 'L1' par défaut
- **Séances existantes** : Continueront de fonctionner mais devront être vérifiées
- **Groupes** : Conservent leur niveau pour d'autres usages potentiels

## 🐛 Dépannage

### Problème : "Aucun cours trouvé pour ce niveau"
- Vérifiez que les cours ont bien un niveau assigné
- Allez sur `/cours` et mettez à jour les niveaux

### Problème : "Erreur de migration SQL"
- Vérifiez que vous avez les droits d'administration sur Supabase
- Exécutez les commandes une par une

### Problème : Interface ne se charge pas
- Vérifiez que la colonne `niveau` existe dans la table `cours`
- Rechargez la page et videz le cache 