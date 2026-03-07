/**
 * Appel API Mistral pour générer le commentaire de bilan.
 * API : window.MistralBilan.generateComment(prompt, apiKey) → Promise<string>
 */
(function () {
    'use strict';

    const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
    const MODEL = 'mistral-small-latest';
    const MAX_TOKENS = 1024;

    function generateComment(prompt, apiKey) {
        if (!prompt || typeof prompt !== 'string') {
            return Promise.reject(new Error('Prompt invalide.'));
        }
        const key = (apiKey && typeof apiKey === 'string') ? apiKey.trim() : '';
        if (!key) {
            return Promise.reject(new Error('Clé API Mistral manquante.'));
        }

        const body = JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: MAX_TOKENS
        });

        return fetch(MISTRAL_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json'
            },
            body: body
        })
            .then(function (res) {
                if (!res.ok) {
                    if (res.status === 401) return Promise.reject(new Error('Clé API invalide.'));
                    if (res.status === 429) return Promise.reject(new Error('Quota dépassé. Réessayez plus tard.'));
                    if (res.status >= 500) return Promise.reject(new Error('Service Mistral indisponible.'));
                    return res.json().then(function (data) {
                        const msg = (data && data.message) ? data.message : ('Erreur ' + res.status);
                        return Promise.reject(new Error(msg));
                    }).catch(function () {
                        return Promise.reject(new Error('Erreur Mistral (' + res.status + ').'));
                    });
                }
                return res.json();
            })
            .then(function (data) {
                const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                if (content == null) {
                    return Promise.reject(new Error('Réponse Mistral invalide.'));
                }
                return String(content);
            })
            .catch(function (err) {
                if (err instanceof Error) return Promise.reject(err);
                if (err && err.message) return Promise.reject(new Error(err.message));
                return Promise.reject(new Error('Réseau indisponible.'));
            });
    }

    window.MistralBilan = { generateComment: generateComment };
})();
