// FICHIER D'EXEMPLE : À renommer en config_grille.js et à déplacer dans App_Sources/config/.
// Exemple minimal de CONFIG_GRILLE pour une grille d'évaluation de démonstration.
const CONFIG_GRILLE = [
    {
        "cat": "1. Accueil et prise de contact",
        "items": [
            {
                "id": "pres",
                "label": "Présentation",
                "max": 2,
                "oblig": true,
                "hint": "Se présente clairement et vérifie l'identité de l'usager.",
                "step": 1
            },
            {
                "id": "ecoute",
                "label": "Écoute active",
                "max": 2,
                "oblig": true,
                "hint": "Laisse l'usager s'exprimer sans l'interrompre et reformule si besoin.",
                "step": 1
            }
        ]
    },
    {
        "cat": "2. Résolution de la demande",
        "items": [
            {
                "id": "precision",
                "label": "Précision de la réponse",
                "max": 4,
                "oblig": true,
                "hint": "Fournit une réponse claire et conforme aux règles en vigueur.",
                "step": 2
            },
            {
                "id": "orientation",
                "label": "Orientation",
                "max": 2,
                "oblig": false,
                "hint": "Oriente l'usager vers les bons canaux ou services si nécessaire.",
                "step": 2
            }
        ]
    }
];
