# 🎯 HQ-APP - Solution de Quality Monitoring

**Une application web d'évaluation de la qualité fonctionnant 100% en local. Rapide, sécurisée et hautement configurable.**

---

## ✨ Fonctionnalités Principales

- **Évaluations personnalisables** grâce à un système de grilles JSON.
- **Architecture "Local-First"** : fonctionnement direct dans le navigateur sans base de données complexe.
- **Tableaux de bord et suivi des KPI** intégrés.
- **Interface claire, réactive et ergonomique.**

---

## 🚀 Guide de Démarrage Rapide

### Installation en 2 minutes

1. **Cloner le dépôt** sur votre poste.

2. **Configuration métier**  
   Aller dans le dossier `App_Sources/examples/`. Dupliquer les fichiers `*.example.js` (agents, managers, sites, superviseurs, config_app, config_grille) et **enlever le `.example`** de leur nom.

3. **Placer ces fichiers** dans le dossier `App_Sources/config/`.

4. **Configuration de la grille**  
   Faire de même avec la grille d'exemple : copier `App_Sources/examples/grilles/default.example.json` vers `App_Sources/config/grilles/` (en le renommant par exemple en `default.json`).

5. **Lancer l'application** en ouvrant simplement le fichier `index.html` dans un navigateur moderne (Chrome ou Edge recommandés).

---

## 🔒 Sécurité et Vie Privée

HQ-APP est conçue **"Privacy by Design"**.

Toutes les données réelles — dossier **Campagnes/**, listes du personnel (agents, managers, superviseurs, sites), grilles de notation — restent **exclusivement sur le disque dur** de l'utilisateur. Rien n'est envoyé sur GitHub : un `.gitignore` strict exclut ces fichiers du dépôt, pour protéger votre vie privée et celle de vos équipes.

---

## 🔄 Mises à jour intégrées

Un outil de mise à jour intelligent est inclus directement dans l'interface administrateur : vous pouvez récupérer les dernières versions du code de manière transparente, **sans écraser vos données locales**.
