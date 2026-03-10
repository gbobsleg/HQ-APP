/**
 * GridRepository.js - Accès fichiers grilles (sources et snapshots campagne).
 * Architecture adaptée pour exécution file:// (Zero-Server) via Namespace.
 */
(function(global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    class GridRepository {
        constructor(options = {}) {
            this._defaultGrid = this._normalizeGridPayload(options.defaultGrid || { title: 'default', sections: [] });
            // Remplacement du cache de valeur par un cache de promesse pour contrer le Cache Stampede
            this._grillesListPromise = null;

            this.GRILLE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
            this.MAX_GRILLE_ID_LENGTH = 60; // Augmenté pour tolérer le suffixe de collision (timestamp)
            this.MAX_SLUG_BASE_LENGTH = 40; // Limite stricte pour la partie sémantique du slug
            this.SNAPSHOT_FILENAME = 'grille_snapshot.json';
            this.GRILLES_DIR = 'grilles';
        }

        /**
         * Adaptateur : convertit toute grille (V1 ou V2) en schéma V2 unique { title, sections }.
         * V1 : categories[].items ou categories[].criteria → sections[].fields avec type: 'scoring'.
         */
        _normalizeToV2(data) {
            const title = (data && typeof data.title === 'string') ? data.title : 'default';
            let sections = [];

            function toSection(sec, idx, itemsOrFields) {
                var fields = (itemsOrFields || []).map(function (item) {
                    return item.type != null ? item : Object.assign({}, item, { type: 'scoring' });
                });
                var lbl = sec.label != null ? sec.label : (sec.cat != null ? sec.cat : 'Section ' + (idx + 1));
                return {
                    id: sec.id || 'section_' + idx,
                    label: lbl,
                    fields: fields,
                    cat: lbl,
                    items: fields
                };
            }
            if (Array.isArray(data)) {
                sections = data.map(function (cat, idx) {
                    var items = cat.items || cat.criteria || [];
                    return toSection(cat, idx, items);
                });
            } else if (data && Array.isArray(data.sections)) {
                sections = data.sections.map(function (sec, idx) {
                    var fields = sec.fields || sec.items || [];
                    return toSection(sec, idx, fields);
                });
            } else if (data && Array.isArray(data.categories)) {
                sections = data.categories.map(function (cat, idx) {
                    var items = cat.items || cat.criteria || [];
                    return toSection(cat, idx, items);
                });
            }

            return { version: 2, title: title, sections: sections };
        }

        _normalizeGridPayload(data) {
            var out = this._normalizeToV2(data);
            out.version = 2;
            return out;
        }

        validateGrilleId(grilleId) {
            if (typeof grilleId !== 'string' || !this.GRILLE_ID_REGEX.test(grilleId) || grilleId.length > this.MAX_GRILLE_ID_LENGTH) {
                throw new Error('grille_id invalide (caractères ou longueur non autorisés).');
            }
            return grilleId;
        }

        sanitizeDirectoryName(name) {
            if (!name || typeof name !== 'string') throw new Error('Nom de dossier invalide.');
            const dangerousPattern = /[\0-\x1F/\\<>:"|?*]/g;
            if (dangerousPattern.test(name) || name.includes('..')) {
                throw new Error(`Tentative d'accès illégal ou caractères non supportés : ${name}`);
            }
            const trimmed = name.trim();
            if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(trimmed)) {
                throw new Error(`Nom de dossier système réservé interdit : ${trimmed}`);
            }
            return trimmed;
        }

        _validateGridSchema(data) {
            if (!data) return false;
            if (Array.isArray(data)) return true;
            return Array.isArray(data.categories) || Array.isArray(data.sections);
        }

        async _getAppSourcesConfigDir(rootHandle) {
            try {
                const appSrc = await rootHandle.getDirectoryHandle('App_Sources');
                return await appSrc.getDirectoryHandle('config', { create: true });
            } catch (e) {
                if (e.name === 'NotFoundError') {
                    return await rootHandle.getDirectoryHandle('config', { create: true });
                }
                throw e;
            }
        }

        /**
         * Crée default.json uniquement s'il n'existe pas (garde anti-écrasement).
         * Si le fichier existe déjà, retourne sans écrire.
         */
        async _bootstrapDefaultGrid(rootHandle) {
            const configDir = await this._getAppSourcesConfigDir(rootHandle);
            const grillesDir = await configDir.getDirectoryHandle(this.GRILLES_DIR, { create: true });
            try {
                await grillesDir.getFileHandle('default.json');
                console.warn("[GridRepository] default.json existe déjà. Annulation du bootstrap automatique pour éviter l'écrasement.");
                return;
            } catch (e) {
                /* Le fichier n'existe pas, on peut le créer */
            }
            const fileHandle = await grillesDir.getFileHandle('default.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(this._defaultGrid, null, 2));
            await writable.close();
            this._grillesListPromise = null;
        }

        async getGridById(rootHandle, grilleId) {
            this.validateGrilleId(grilleId);
            try {
                const configDir = await this._getAppSourcesConfigDir(rootHandle);
                const grillesDir = await configDir.getDirectoryHandle(this.GRILLES_DIR);
                const fileHandle = await grillesDir.getFileHandle(`${grilleId}.json`);
                const file = await fileHandle.getFile();
                const text = await file.text();

                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error('JSON invalide.'); }

                if (!this._validateGridSchema(data)) {
                    throw new Error('Schéma de grille invalide.');
                }
                var normalized = this._normalizeGridPayload(data);
                return normalized;

            } catch (err) {
                if (err.name === 'NotFoundError' && grilleId === 'default') {
                    try {
                        await this._bootstrapDefaultGrid(rootHandle);
                    } catch (e) { /* ignore bootstrap failure */ }
                    return this._defaultGrid;
                }
                throw err;
            }
        }

        getGrillesList(rootHandle) {
            // Si une opération de lecture est déjà en cours ou terminée, retourner sa promesse
            if (this._grillesListPromise) {
                return this._grillesListPromise;
            }

            // Encapsuler l'I/O dans une promesse auto-exécutée et la mettre en cache
            this._grillesListPromise = (async () => {
                try {
                    const configDir = await this._getAppSourcesConfigDir(rootHandle);
                    const grillesDir = await configDir.getDirectoryHandle(this.GRILLES_DIR, { create: false });

                    const results = [];
                    for await (const [name, handle] of grillesDir.entries()) {
                        if (handle.kind === 'file' && name.endsWith('.json')) {
                            const id = name.slice(0, -5);
                            try {
                                const file = await handle.getFile();
                                const text = await file.text();
                                const data = JSON.parse(text);
                                results.push({ id, title: data.title || id });
                            } catch (e) {
                                results.push({ id, title: id });
                            }
                        }
                    }
                    return results;
                } catch (e) {
                    if (e.name === 'NotFoundError') {
                        try {
                            await this._bootstrapDefaultGrid(rootHandle);
                            return [{ id: 'default', title: this._defaultGrid.title }];
                        } catch (bootstrapErr) { /* ignore */ }
                    }
                    return [];
                }
            })();

            return this._grillesListPromise;
        }

        async saveGrid(rootHandle, grilleId, payload) {
            this.validateGrilleId(grilleId);
            const normalized = this._normalizeGridPayload(payload);
            const content = JSON.stringify(normalized, null, 2);

            try {
                const configDir = await this._getAppSourcesConfigDir(rootHandle);
                const grillesDir = await configDir.getDirectoryHandle(this.GRILLES_DIR, { create: true });
                const fileHandle = await grillesDir.getFileHandle(`${grilleId}.json`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();

                // Invalidation stricte du cache de promesse suite à une modification
                this._grillesListPromise = null;
            } catch (err) {
                if (err.name === 'NoModificationAllowedError' || err instanceof DOMException) {
                    err.userMessage = 'Fichier verrouillé ou en cours de synchronisation ; réessayez plus tard.';
                }
                throw err;
            }
        }

        async getSnapshotForCampaignSafe(rootHandle, campaignDirHandle) {
            try {
                const fileHandle = await campaignDirHandle.getFileHandle(this.SNAPSHOT_FILENAME);
                const file = await fileHandle.getFile();
                const text = await file.text();

                if (!text.trim()) {
                    console.warn('Corruption : Snapshot 0-byte. Traitement comme inexistant.');
                    return null;
                }

                const data = JSON.parse(text);
                if (!this._validateGridSchema(data)) {
                    console.warn('Corruption : Schéma invalide. Traitement comme inexistant.');
                    return null;
                }
                return this._normalizeGridPayload(data);
            } catch (error) {
                if (error.name === 'NotFoundError') return null;
                throw error;
            }
        }

        async saveSnapshotForCampaign(rootHandle, campaignDirHandle, payload) {
            const content = JSON.stringify(this._normalizeGridPayload(payload), null, 2);

            try {
                const fileHandle = await campaignDirHandle.getFileHandle(this.SNAPSHOT_FILENAME);
                const file = await fileHandle.getFile();

                // Prévention du deadlock sur corruption partielle :
                // On n'avorte l'écriture que si le fichier existant est structurellement valide.
                const text = await file.text();
                if (text.trim()) {
                    try {
                        const data = JSON.parse(text);
                        if (this._validateGridSchema(data)) {
                            return; // Snapshot existant et parfaitement valide : on avorte (Anti-TOCTOU)
                        }
                    } catch (e) {
                        // JSON invalide ou schéma corrompu : on laisse le flux continuer pour forcer l'écrasement
                    }
                }
            } catch (err) {
                // Si l'erreur n'est pas NotFoundError (ex: problème de permission local), on la propage
                if (err.name !== 'NotFoundError') {
                    throw err;
                }
            }

            // Phase de création ou d'écrasement légitime d'un fichier corrompu
            try {
                const fileHandle = await campaignDirHandle.getFileHandle(this.SNAPSHOT_FILENAME, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch (writeErr) {
                if (writeErr.name === 'NoModificationAllowedError' || writeErr instanceof DOMException) {
                    writeErr.userMessage = 'Fichier verrouillé ou en cours de synchronisation ; réessayez plus tard.';
                }
                throw writeErr;
            }
        }

        async generateGrilleIdFromTitle(rootHandle, title) {
            const baseSlug = (title || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')                     // Décompose les caractères accentués (é -> e + ´)
                .replace(/[\u0300-\u036f]/g, '')      // Supprime les diacritiques isolés
                .replace(/\s+/g, '_')                 // Remplace les espaces par des underscores
                .replace(/[^a-z0-9_-]/g, '')          // Nettoie tout le reste
                .slice(0, this.MAX_SLUG_BASE_LENGTH) || 'grille'; // Troncature sur la limite sémantique de base

            const list = await this.getGrillesList(rootHandle);
            const ids = new Set(list.map(x => x.id));

            let candidate = baseSlug;
            let n = 0;
            const timestamp = Date.now();
            while (ids.has(candidate)) {
                candidate = `${baseSlug}_${timestamp}${n ? `_${n}` : ''}`;
                n++;
            }
            return candidate;
        }
    }

    global.HQApp.GridRepository = GridRepository;

})(typeof window !== 'undefined' ? window : this);
