// FICHIER D'EXEMPLE : À renommer en config_app.js et à déplacer dans App_Sources/config/.
// Copier en config_app.js et renseigner les valeurs sensibles (clé Mistral, token, etc.)
const CONFIG_APP = {
    "updateSource": {
        "repoOwner": "demo-organisation",
        "repoName": "hq-app-demo",
        "token": ""
    },
    "duration_thresholds": {
        "short": {
            "min": 3,
            "sec": 0
        },
        "medium": {
            "min": 6,
            "sec": 0
        }
    },
    "offers": [
        "Employeurs",
        "TI-AE",
        "CESU",
        "PAJEMPLOI"
    ],
    "mistralApiKey": "",
    "mistralDisabled": false,
    "promptGenerateButtonHidden": false,
    "evalCommentPromptTemplate": "Rôle : Manager-coach sobre.\nMission : Rédiger un feedback flash pour l'appel du {{date}} (Offre {{offre}} - {{note}}/10) en utilisant le \"tu\".\n\nConsignes de rédaction :\n1. Style : Direct, factuel et sans fioritures. Supprime toute formule de politesse ou compliment générique (type \"Bravo\", \"Bon travail\").\n2. Format : Exactement 2 phrases (ou 2 lignes courtes).\n3. Contenu :\n   - Ligne 1 : Ton diagnostic sur la posture de communication (écoute, questionnement, fluidité).\n   - Ligne 2 : Ton évaluation de la précision technique et de la réponse apportée.\n4. Contrainte : Pas de superlatifs. Préfère les verbes d'action et les constats neutres.\n\nDonnées de l'évaluation :\n{{criteriaBlock}}\n\nRédige maintenant le commentaire global en 2 lignes.",
    "bilanPromptTemplate": "Rôle : Manager-coach pragmatique pour {{agentName}}.\nMission : Rédiger un bilan de performance sobre et factuel ({{evalsCount}} évaluations, campagne {{campaignName}}) en utilisant le \"tu\".\n\nConsignes de rédaction :\n1. Format : 5 à 7 lignes. Paragraphe unique, sans listes, sans titres.\n2. Contenu :\n   - Points forts : Note une réussite concrète et son utilité pour l'usager.\n   - Axe de progrès : Identifie un point d'amélioration technique ou comportemental de façon directe.\n   - Conclusion : Ajoute un objectif mesurable uniquement si les données le justifient ; sinon, termine par une simple validation de la dynamique actuelle.\n3. Ton : Sobre, sincère et professionnel. Interdiction d'utiliser des superlatifs (ex: \"incroyable\", \"exceptionnel\", \"parfait\") ou une flatterie excessive. Préfère la précision à l'admiration.\n\nDonnées sources :\n{{evaluationsBlock}}\n\n{{finalInstruction}}"
};
