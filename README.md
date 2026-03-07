# 🎯 HQ-APP — Solution de Quality Monitoring

**Application web d'évaluation de la qualité, 100 % locale. Rapide, sécurisée et hautement configurable.**

---

## ✨ Fonctionnalités principales

- **Architecture Local-First** : lecture directe des fichiers sur le disque via la **File System Access API** du navigateur — aucune base de données, tout reste sur votre machine.
- **Dashboard global** : suivi des KPI de production et de qualité (téléphone, courriels, WATT, avancement des évaluations) avec graphiques et filtres par période, site et offre.
- **Vue Agent 360°** : dossier individuel détaillé par agent, croisant qualité (historique des notes par campagne) et production (volumes, temps, efficacité) pour un suivi personnalisé.
- **Grilles d'évaluation 100 % personnalisables** : grilles au format JSON, adaptables à vos critères, rubriques et barèmes sans toucher au code.
- **Interface claire et réactive** : pilotage des campagnes, saisie des évaluations, bilans et administration depuis une seule application.

---

## 🚀 Guide de démarrage rapide

### Installation en 3 étapes

1. **Cloner ou télécharger le dépôt** sur votre poste (et l’extraire si besoin).

2. **Lancer le script d’installation**  
   Exécuter **`setup.bat`** à la racine du projet. Il :
   - crée les dossiers vitaux **`Campagnes`**, **`Data_Stats`** et **`config`** (dont **`config/grilles`**) ;
   - copie les fichiers de configuration par défaut depuis **`App_Sources/examples/`** vers **`App_Sources/config/`** (agents, managers, sites, superviseurs, config app, grille) **sans écraser** vos fichiers existants.

3. **Ouvrir l’application**  
   Ouvrir **`index.html`** dans **Chrome** ou **Edge**, puis sélectionner le **dossier racine du projet** lorsque le navigateur le demande. L’application se connecte à ce dossier et charge vos campagnes et données.

> 💡 *Une documentation détaillée (configuration avancée, structure des dossiers, mises à jour) peut compléter ce guide selon les besoins de votre équipe.*

---

## 🔒 Sécurité et vie privée

HQ-APP est conçue **« Privacy by Design »**.

Toutes les données — dossiers **Campagnes/** et **Data_Stats/**, listes du personnel (agents, managers, superviseurs, sites), grilles de notation — restent **uniquement sur votre disque**. Aucune donnée n’est envoyée vers un serveur externe ; un **`.gitignore`** strict évite de versionner ces contenus sensibles et protège la vie privée de vos équipes.

---

## 🔄 Mises à jour intégrées

Un **système de mise à jour** est intégré dans l’interface d’administration : vous pouvez récupérer les dernières versions du code depuis le dépôt configuré, **sans écraser vos données locales** (campagnes, config, stats). Idéal pour rester à jour tout en gardant le contrôle de vos fichiers.
