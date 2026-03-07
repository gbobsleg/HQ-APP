/**
 * migration_v2.js - Migration des données locales vers le format V2.0.0.
 * À exécuter une fois après mise à jour (bouton dans admin-mise-a-jour ou au premier lancement).
 * Utilise window.HQApp.FileSystemManager et window.HQApp.GridRepository.
 */
(function (global) {
    'use strict';

    var fsManager = global.HQApp && global.HQApp.FileSystemManager;
    var GridRepository = global.HQApp && global.HQApp.GridRepository;

    /**
     * Normalise une grille (V1 ou V2) vers le format strict V2 (version: 2, sections, fields, type).
     * Réplique la logique GridRepository._normalizeToV2 pour usage autonome si GridRepository absent.
     */
    function normalizeGridToV2(data) {
        var title = (data && typeof data.title === 'string') ? data.title : 'default';
        var sections = [];

        function toSection(sec, idx, itemsOrFields) {
            var fields = (itemsOrFields || []).map(function (item) {
                return item.type != null ? item : Object.assign({}, item, { type: 'scoring' });
            });
            var lbl = sec.label != null ? sec.label : (sec.cat != null ? sec.cat : 'Section ' + (idx + 1));
            return {
                id: sec.id || 'section_' + idx,
                label: lbl,
                fields: fields
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

    /**
     * Exécute la migration V2 sur le disque.
     * @param {FileSystemDirectoryHandle} rootHandle - Handle du dossier racine du projet (contient App_Sources, Campagnes).
     * @returns {Promise<{logs: string[], success: boolean}>} Résumé des opérations (succès et erreurs).
     */
    async function runV2Migration(rootHandle) {
        var logs = [];
        function logMsg(msg) { logs.push(msg); }
        function logErr(msg) { logs.push('[ERREUR] ' + msg); }

        if (!rootHandle || typeof rootHandle.getDirectoryHandle !== 'function') {
            logErr('Handle racine invalide.');
            return { logs: logs, success: false };
        }

        var fm = global.HQApp && global.HQApp.FileSystemManager;
        if (!fm) {
            logErr('FileSystemManager non chargé. Chargez FileSystemManager.js avant migration_v2.js.');
            return { logs: logs, success: false };
        }

        var gridRepo = null;
        if (global.HQApp && global.HQApp.GridRepository) {
            gridRepo = new global.HQApp.GridRepository();
        }

        var normalizeGrid = gridRepo && typeof gridRepo._normalizeGridPayload === 'function'
            ? function (data) { return gridRepo._normalizeGridPayload(data); }
            : normalizeGridToV2;

        try {
            // --- 1. Agents : supervisorId → managerId ---
            try {
                var agents = await fm.readAgents(rootHandle);
                if (agents && Array.isArray(agents)) {
                    var agentsChanged = 0;
                    agents.forEach(function (a) {
                        if (a.hasOwnProperty('supervisorId') && (a.managerId == null || a.managerId === undefined)) {
                            a.managerId = a.supervisorId;
                            delete a.supervisorId;
                            agentsChanged++;
                        }
                    });
                    if (agentsChanged > 0) {
                        await fm.writeAgents(rootHandle, agents);
                        logMsg('Agents : ' + agentsChanged + ' entrée(s) migrée(s) (supervisorId → managerId).');
                    } else {
                        logMsg('Agents : déjà au format V2 (aucune modification).');
                    }
                } else {
                    logMsg('Agents : fichier absent ou vide (ignoré).');
                }
            } catch (e) {
                logErr('Agents : ' + (e.message || e.name || String(e)));
            }

            // --- 2. Config : prompts.scoring / prompts.review ---
            try {
                var cfg = await fm.readAppConfig(rootHandle);
                if (cfg && typeof cfg === 'object') {
                    var needsWrite = false;
                    if (!cfg.prompts) cfg.prompts = { scoring: {}, review: {} };
                    if (!cfg.prompts.scoring) cfg.prompts.scoring = {};
                    if (!cfg.prompts.review) cfg.prompts.review = {};

                    if (cfg.evalCommentPromptTemplate != null && String(cfg.evalCommentPromptTemplate).trim() !== '') {
                        cfg.prompts.scoring.evalComment = cfg.evalCommentPromptTemplate;
                        delete cfg.evalCommentPromptTemplate;
                        needsWrite = true;
                    }
                    if (cfg.bilanPromptTemplate != null && String(cfg.bilanPromptTemplate).trim() !== '') {
                        cfg.prompts.scoring.bilanSynthesis = cfg.bilanPromptTemplate;
                        delete cfg.bilanPromptTemplate;
                        needsWrite = true;
                    }
                    if (!cfg.prompts.review.bilanSynthesis && cfg.prompts.review.bilanSynthesis !== '') {
                        cfg.prompts.review.bilanSynthesis = '';
                        needsWrite = true;
                    }
                    if (needsWrite) {
                        await fm.writeAppConfig(rootHandle, cfg);
                        logMsg('Config : prompts migrés vers prompts.scoring / prompts.review.');
                    } else {
                        logMsg('Config : déjà au format V2 (aucune modification).');
                    }
                } else {
                    logMsg('Config : config_app.js absent ou invalide (ignoré).');
                }
            } catch (e) {
                logErr('Config : ' + (e.message || e.name || String(e)));
            }

            // --- 3. Grilles : config/grilles/*.json → V2 ---
            try {
                var appSrc = await rootHandle.getDirectoryHandle('App_Sources');
                var configDir = await appSrc.getDirectoryHandle('config', { create: false });
                var grillesDir = await configDir.getDirectoryHandle('grilles', { create: false });
                var grilleCount = 0;
                for (var it = grillesDir.entries(), entry; !(entry = await it.next()).done;) {
                    var name = entry.value[0];
                    var handle = entry.value[1];
                    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
                    try {
                        var raw = await fm.readJsonFile(grillesDir, name);
                        if (!raw) continue;
                        var normalized = normalizeGrid(raw);
                        await fm.writeJsonFile(grillesDir, name, normalized);
                        grilleCount++;
                    } catch (e) {
                        logErr('Grille ' + name + ' : ' + (e.message || e.name || String(e)));
                    }
                }
                if (grilleCount > 0) {
                    logMsg('Grilles : ' + grilleCount + ' fichier(s) normalisé(s) en V2.');
                } else {
                    logMsg('Grilles : aucun fichier à migrer ou dossier absent.');
                }
            } catch (e) {
                if (e.name === 'NotFoundError') {
                    logMsg('Grilles : dossier config/grilles/ absent (ignoré).');
                } else {
                    logErr('Grilles : ' + (e.message || e.name || String(e)));
                }
            }

            // --- 4. Campagnes : campaign_config.json + grille_snapshot.json ---
            try {
                var campagnesHandle = await rootHandle.getDirectoryHandle('Campagnes', { create: false });
                var campaignCount = 0;
                var snapshotCount = 0;
                for (var it2 = campagnesHandle.entries(), ent; !(ent = await it2.next()).done;) {
                    var dirName = ent.value[0];
                    var dirHandle = ent.value[1];
                    if (dirHandle.kind !== 'directory') continue;
                    try {
                        var config = await fm.readCampaignConfig(dirHandle).catch(function () { return null; });
                        if (config && typeof config === 'object') {
                            var configChanged = false;
                            if (config.campaign_type === undefined || config.campaign_type === null) {
                                config.campaign_type = 'scoring';
                                configChanged = true;
                            }
                            if (config.status === undefined || config.status === null) {
                                config.status = 'active';
                                configChanged = true;
                            }
                            if (config.assign_to_manager === undefined || config.assign_to_manager === null) {
                                config.assign_to_manager = false;
                                configChanged = true;
                            }
                            if (configChanged) {
                                await fm.writeCampaignConfig(dirHandle, config);
                                campaignCount++;
                            }
                        }
                    } catch (e) {
                        logErr('Campagne ' + dirName + ' (config) : ' + (e.message || e.name || String(e)));
                    }
                    try {
                        var snapshot = await fm.readJsonFile(dirHandle, 'grille_snapshot.json').catch(function () { return null; });
                        if (snapshot && (snapshot.version !== 2 || snapshot.categories || Array.isArray(snapshot))) {
                            var normSnapshot = normalizeGrid(snapshot);
                            await fm.writeJsonFile(dirHandle, 'grille_snapshot.json', normSnapshot);
                            snapshotCount++;
                        }
                    } catch (e) {
                        if (e.name !== 'NotFoundError') {
                            logErr('Campagne ' + dirName + ' (snapshot) : ' + (e.message || e.name || String(e)));
                        }
                    }
                }
                if (campaignCount > 0 || snapshotCount > 0) {
                    logMsg('Campagnes : ' + campaignCount + ' config(s) mise(s) à jour, ' + snapshotCount + ' snapshot(s) normalisé(s).');
                } else {
                    logMsg('Campagnes : aucun dossier ou déjà au format V2.');
                }
            } catch (e) {
                if (e.name === 'NotFoundError') {
                    logMsg('Campagnes : dossier Campagnes/ absent (ignoré).');
                } else {
                    logErr('Campagnes : ' + (e.message || e.name || String(e)));
                }
            }

        } catch (e) {
            logErr('Migration : ' + (e.message || e.name || String(e)));
            return { logs: logs, success: false };
        }

        var hasError = logs.some(function (line) { return line.indexOf('[ERREUR]') === 0; });
        return { logs: logs, success: !hasError };
    }

    if (typeof global.window !== 'undefined') {
        global.window.runV2Migration = runV2Migration;
    }
    if (typeof global !== 'undefined') {
        global.runV2Migration = runV2Migration;
    }
})(typeof window !== 'undefined' ? window : this);
