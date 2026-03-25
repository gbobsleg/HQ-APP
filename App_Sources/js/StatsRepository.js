/**
 * StatsRepository.js - Lecture des stats Production (CSV Data_Stats) et Qualité (historique campagnes).
 * IIFE, exposé sur window.HQApp.StatsRepository. Dépend de FileSystemManager et PapaParse (Papa).
 * Parseur refondu : détection dynamique du séparateur, mapping Adapter (DTO), résolution Matricule → agentId,
 * agrégation par Agent et Date (sommes volumes, moyennes pondérées temps/ratios).
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    var fsManager = typeof global.HQApp !== 'undefined' ? global.HQApp.FileSystemManager : null;

    // --- Détection du séparateur (première ligne) ---

    /**
     * Normalise une chaîne d'en-tête pour la comparaison (trim, espaces insécables, apostrophes typographiques).
     * @param {string} str
     * @returns {string}
     */
    function normalizeHeader(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/\r?\n/g, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(/\u2019/g, "'")
            .replace(/\u2018/g, "'")
            .trim();
    }

    /**
     * Normalise un en-tête pour comparaison tolérante : espaces multiples → un, insensible à la casse.
     * Permet de faire correspondre "Circuit Niveau 2" avec "circuit niveau 2" ou "Circuit\nNiveau 2" (déjà normalisé).
     * @param {string} str
     * @returns {string}
     */
    function normalizeHeaderForMatch(str) {
        var n = normalizeHeader(str);
        return n.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    /**
     * Détermine le délimiteur CSV à partir d'une ligne représentative (\t, ; ou ,).
     * Utilise la première ligne qui contient au moins un délimiteur (gère les en-têtes
     * avec retours à la ligne dans les guillemets, ex. watt_YYYY-MM.csv).
     * @param {string} csvText - Contenu brut du CSV
     * @returns {string} - '\t' | ';' | ','
     */
    function detectDelimiter(csvText) {
        if (typeof csvText !== 'string' || csvText.length === 0) return ',';
        var lines = csvText.split(/\r?\n/);
        var firstLine = '';
        for (var i = 0; i < Math.min(10, lines.length); i++) {
            var line = (lines[i] || '').trim();
            if (line.indexOf(';') !== -1 || line.indexOf(',') !== -1 || line.indexOf('\t') !== -1) {
                firstLine = normalizeHeader(line);
                break;
            }
        }
        if (!firstLine) firstLine = normalizeHeader(lines[0] || '');
        var countTab = (firstLine.match(/\t/g) || []).length;
        var countSemicolon = (firstLine.match(/;/g) || []).length;
        var countComma = (firstLine.match(/,/g) || []).length;
        if (countTab > 0 && countTab >= countSemicolon && countTab >= countComma) return '\t';
        if (countSemicolon > countComma) return ';';
        return ',';
    }

    /**
     * Retourne un nombre valide, jamais NaN. Fallback 0 si valeur invalide.
     * @param {*} value
     * @returns {number}
     */
    function safeParseNumber(value) {
        if (value == null || value === '') return 0;
        var n = parseFloat(typeof value === 'string' ? value.replace(/\s/g, '').replace(',', '.') : value);
        return typeof n === 'number' && !isNaN(n) ? n : 0;
    }

    // --- Mapping Adapter : colonnes production → clés internes ---

    var COLUMN_MAPPING_TELEPHONE = [
        { production: 'Matricule', internal: 'matricule' },
        { production: 'Agent', internal: 'agentName' },
        { production: 'Date', internal: 'date' },
        { production: 'Offre', internal: 'offre' },
        { production: 'DMT', internal: 'dmt' },
        { production: 'DMC', internal: 'dmc' },
        { production: 'DMMG', internal: 'dmmg' },
        { production: 'DMPA', internal: 'dmpa' },
        { production: "Nombre d'appels aboutis", internal: 'appels_traites' },
        { production: 'Identification', internal: 'identifications' },
        { production: 'Réponses immédiates', internal: 'reponses_immediates' },
        { production: 'Transferts', internal: 'transferts' },
        { production: 'Consultations', internal: 'consultations' },
        { production: 'RONA', internal: 'rona' }
    ];

    var COLUMN_MAPPING_COURRIELS = [
        { production: 'Matricule',       internal: 'matricule' },
        { production: 'Agent',           internal: 'agentName' },
        { production: 'Date',            internal: 'date' },
        { production: 'Cl\u00f4ture',         internal: 'cloture' },
        { production: 'Cloture',         internal: 'cloture' },
        { production: 'Envoi en Watt',   internal: 'envoi_watt' },
        { production: 'R\u00e9ponse directe', internal: 'reponse_directe' },
        { production: 'Reponse directe', internal: 'reponse_directe' }
    ];

    // Nouveau format watt_YYYY-MM.csv (pré-calculé et journalier).
    var COLUMN_MAPPING_WATT = [
        { production: 'date jour-1', internal: 'date' },
        { production: "Identifiant ANAIS de l'acteur", internal: 'anaisId' },
        { production: "Nom prénom de l'acteur", internal: 'agentName' },
        { production: 'Code - libellé du circuit', internal: 'circuit' },
        { production: 'Nb affaires cloturees', internal: 'cloture_manuelle' },
        { production: 'Nb affaires reroutées', internal: 'reroutage_individuel' },
        { production: 'Nb aff transférées à la prod', internal: 'transfert_prod' }
    ];

    var PRODUCTION_COLUMN_MAPPINGS = {
        telephone: COLUMN_MAPPING_TELEPHONE,
        courriels: COLUMN_MAPPING_COURRIELS,
        watt: COLUMN_MAPPING_WATT
    };

    /**
     * Normalise une date brute vers YYYY-MM-DD.
     * Rejette les formats invalides et les dates impossibles.
     * @param {string} rawValue
     * @returns {string}
     */
    function normalizeDateToISO(rawValue) {
        if (!rawValue || typeof rawValue !== 'string') return '';
        var parts = rawValue.split(/[-/]/);
        if (parts.length !== 3) return '';

        var y, m, d;
        // Détection format YYYY-MM-DD
        if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        }
        // Détection format DD/MM/YYYY ou DD-MM-YYYY
        else if (parts[2].length === 4) {
            d = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
        } else {
            return '';
        }

        if (isNaN(y) || isNaN(m) || isNaN(d)) return '';
        // Validation calendaire stricte pour éviter l'injection de dates corrompues dans les clés d'agrégation
        if (m < 1 || m > 12 || d < 1 || d > 31) return '';

        var mStr = m < 10 ? '0' + m : String(m);
        var dStr = d < 10 ? '0' + d : String(d);
        return y + '-' + mStr + '-' + dStr;
    }

    /**
     * Construit une table "en-tête normalisé" → "clé interne" à partir du mapping et des en-têtes bruts.
     * Chaque libellé production est normalisé (normalizeHeader) pour matcher.
     * @param {Array<{production: string, internal: string}>} mapping
     * @param {Array<string>} rawHeaders - En-têtes tels que retournés par Papa
     * @returns {Object.<string, string>} - normalizedHeader -> internalKey (premier match gagnant par internal)
     */
    function buildHeaderToInternalMap(mapping, rawHeaders) {
        var normalizedToInternal = {};
        var i, h, refNorm, rawNorm;
        for (i = 0; i < mapping.length; i++) {
            var internalKey = mapping[i].internal;
            if (normalizedToInternal[internalKey] !== undefined) continue;
            refNorm = normalizeHeaderForMatch(mapping[i].production);
            if (!refNorm) continue;
            for (h = 0; h < rawHeaders.length; h++) {
                rawNorm = normalizeHeaderForMatch(rawHeaders[h]);
                if (rawNorm && rawNorm === refNorm) {
                    normalizedToInternal[internalKey] = rawHeaders[h];
                    break;
                }
            }
        }
        return normalizedToInternal;
    }

    /**
     * Vérifie si une ligne brute est vide (toutes cellules vides ou trim vides).
     * @param {object} rawRow - Ligne clé/valeur
     * @returns {boolean}
     */
    function isRowEmpty(rawRow) {
        var keys = Object.keys(rawRow || {});
        for (var k = 0; k < keys.length; k++) {
            var v = rawRow[keys[k]];
            if (v != null && String(v).trim() !== '') return false;
        }
        return true;
    }

    /**
     * Construit un DTO à partir d'une ligne brute en utilisant le mapping et la table header→internal.
     */
    function rowToDto(rawRow, mapping, headerToInternal) {
        var dto = {};
        for (var i = 0; i < mapping.length; i++) {
            var internalKey = mapping[i].internal;
            var rawKey = headerToInternal[internalKey];
            if (rawKey == null) continue;
            var val = rawRow[rawKey];

            if (internalKey === 'date') {
                // Application de l'Early Normalization
                dto[internalKey] = normalizeDateToISO(val != null ? String(val).trim() : '');
            } else if (internalKey === 'matricule' || internalKey === 'agentName' || internalKey === 'offre' || internalKey === 'circuit' || internalKey === 'anaisId') {
                dto[internalKey] = val != null ? String(val).trim() : '';
            } else {
                dto[internalKey] = safeParseNumber(val);
            }
        }
        return dto;
    }

    /**
     * Résolution Matricule → agentId via le référentiel agents. Retourne l'id si trouvé, sinon null.
     * @param {string} matricule - Valeur brute ou déjà trim
     * @param {Array<{id: number, matricule?: string}>} agents
     * @returns {number|null}
     */
    function resolveAgentId(matricule, agents) {
        if (!matricule || !Array.isArray(agents) || agents.length === 0) return null;
        var m = String(matricule).trim();
        if (m === '') return null;
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (a && String(a.matricule || '').trim() === m) return a.id != null ? Number(a.id) : null;
        }
        return null;
    }

    /**
     * Normalise un nom pour rapprochement : sans accents, tirets → espaces, espaces multiples → un, trim.
     * Permet de faire correspondre "Anne-Sophie" / "Anne Sophie", "Jérôme" / "Jerome", etc.
     * @param {string} str
     * @returns {string}
     */
    function normalizeNameForMatch(str) {
        if (typeof str !== 'string') return '';
        var s = str.trim();
        if (s === '') return '';
        var accentMap = { 'à':'a','á':'a','â':'a','ä':'a','ã':'a','å':'a','À':'a','Á':'a','Â':'a','Ä':'a','Ã':'a','Å':'a','è':'e','é':'e','ê':'e','ë':'e','È':'e','É':'e','Ê':'e','Ë':'e','ì':'i','í':'i','î':'i','ï':'i','Ì':'i','Í':'i','Î':'i','Ï':'i','ò':'o','ó':'o','ô':'o','ö':'o','Ò':'o','Ó':'o','Ô':'o','Ö':'o','ù':'u','ú':'u','û':'u','ü':'u','Ù':'u','Ú':'u','Û':'u','Ü':'u','ý':'y','ÿ':'y','Ý':'y','ñ':'n','Ñ':'n','ç':'c','Ç':'c','œ':'oe','æ':'ae','Œ':'oe','Æ':'ae' };
        var out = '';
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            out += accentMap[c] != null ? accentMap[c] : c;
        }
        out = out.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        return out.toLowerCase();
    }

    /**
     * Résolution Nom Prénom (ex. "ANNE Jessica", "AZE Anne-Sophie") → agentId via le référentiel agents.
     * Rapprochement insensible aux accents et aux tirets (normalisation des deux côtés).
     * @param {string} agentName - Valeur colonne Acteur (NOM Prénom)
     * @param {Array<{id: number, nom?: string, prénom?: string}>} agents
     * @returns {number|null}
     */
    function resolveAgentIdByName(agentName, agents) {
        if (!agentName || !Array.isArray(agents) || agents.length === 0) return null;
        var name = String(agentName).trim();
        if (name === '') return null;
        var nameNorm = normalizeNameForMatch(name);
        if (nameNorm === '') return null;
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            if (!a || a.id == null) continue;
            var refName = (String(a.nom || '').toUpperCase() + ' ' + (a['prénom'] || '')).trim();
            if (normalizeNameForMatch(refName) === nameNorm) return Number(a.id);
        }
        return null;
    }

    /**
     * Agrégation par (agentId, date) : sommes pour volumes, moyennes pondérées pour temps/ratios.
     * Puis seconde agrégation par agentId seul pour produire une ligne par agent (contrat de sortie des vues).
     * @param {Array<object>} rows - DTOs avec agentId, date, et champs métier (dmt, appels_traites, etc.)
     * @param {string} sourceKey - 'telephone' | 'courriels' | 'watt'
     * @returns {Array<object>} - Un objet par agentId avec clés attendues par les vues
     */
    function aggregateByAgentAndDate(rows, sourceKey) {
        var groupsByAgentDate = {};
        var groupsByAgentOfferDate = {};
        var weightKey, sumKey, volumeKey;
        var r, key, keyOffer, g, go, agentId, dateStr, offre, vol, dmt, volTraite, delai, tauxConf, taches, duree;
        var dmc, dmmg, dmpa, idents, repImm, transf, cons, rona;
        var emptyTelGroup = function(id, date, offreName) {
            return {
                agentId: id, date: date, offre: offreName || 'GLOBAL',
                appels_traites: 0, dmtSumSeconds: 0, dmtWeight: 0,
                dmcSumSeconds: 0, dmmgSumSeconds: 0, dmpaSumSeconds: 0,
                identsSum: 0, repImmSum: 0, transferts: 0, consultations: 0, rona: 0
            };
        };
        var addTelValues = function(grp, vol, dmt, dmc, dmmg, dmpa, idents, repImm, transf, cons, rona) {
            grp.appels_traites += vol;
            grp.dmtSumSeconds += dmt * vol;
            grp.dmtWeight += vol;
            grp.dmcSumSeconds += dmc * vol;
            grp.dmmgSumSeconds += dmmg * vol;
            grp.dmpaSumSeconds += dmpa * vol;
            grp.identsSum += idents * vol;
            grp.repImmSum += repImm * vol;
            grp.transferts += transf;
            grp.consultations += cons;
            grp.rona += rona;
        };

        if (sourceKey === 'telephone') {
            volumeKey = 'appels_traites';
            weightKey = 'appels_traites';
            for (r = 0; r < rows.length; r++) {
                agentId = rows[r].agentId;
                dateStr = (rows[r].date || '').trim() || 'unknown';
                offre = (rows[r].offre || '').trim() || 'GLOBAL';
                key = agentId + '|' + dateStr;
                keyOffer = agentId + '|' + offre + '|' + dateStr;

                if (!groupsByAgentDate[key]) {
                    groupsByAgentDate[key] = emptyTelGroup(agentId, dateStr, 'GLOBAL');
                }
                if (!groupsByAgentOfferDate[keyOffer]) {
                    groupsByAgentOfferDate[keyOffer] = emptyTelGroup(agentId, dateStr, offre);
                }

                g = groupsByAgentDate[key];
                go = groupsByAgentOfferDate[keyOffer];
                vol = safeParseNumber(rows[r].appels_traites);
                dmt = safeParseNumber(rows[r].dmt);
                dmc = safeParseNumber(rows[r].dmc);
                dmmg = safeParseNumber(rows[r].dmmg);
                dmpa = safeParseNumber(rows[r].dmpa);
                idents = safeParseNumber(rows[r].identifications);
                repImm = safeParseNumber(rows[r].reponses_immediates);
                transf = safeParseNumber(rows[r].transferts);
                cons = safeParseNumber(rows[r].consultations);
                rona = safeParseNumber(rows[r].rona);

                addTelValues(g, vol, dmt, dmc, dmmg, dmpa, idents, repImm, transf, cons, rona);
                addTelValues(go, vol, dmt, dmc, dmmg, dmpa, idents, repImm, transf, cons, rona);
            }
        } else if (sourceKey === 'courriels') {
            volumeKey = 'cloture';
            for (r = 0; r < rows.length; r++) {
                agentId = rows[r].agentId;
                dateStr = (rows[r].date || '').trim() || 'unknown';
                key = agentId + '|' + dateStr;
                if (!groupsByAgentDate[key]) {
                    groupsByAgentDate[key] = {
                        agentId: agentId,
                        date: dateStr,
                        cloture: 0,
                        envoi_watt: 0,
                        reponse_directe: 0
                    };
                }
                g = groupsByAgentDate[key];
                g.cloture         += safeParseNumber(rows[r].cloture);
                g.envoi_watt      += safeParseNumber(rows[r].envoi_watt);
                g.reponse_directe += safeParseNumber(rows[r].reponse_directe);
            }
        } else if (sourceKey === 'watt') {
            for (r = 0; r < rows.length; r++) {
                // Ne plus exclure les lignes avec circuit (nouveau format WATT détaillé).
                agentId = rows[r].agentId;
                dateStr = (rows[r].date || '').trim() || 'unknown';
                key = agentId + '_' + dateStr;
                if (!groupsByAgentDate[key]) {
                    groupsByAgentDate[key] = {
                        agentId: agentId,
                        date: dateStr,
                        cloture_manuelle: 0,
                        reroutage_individuel: 0,
                        transfert_prod: 0
                    };
                }
                g = groupsByAgentDate[key];
                g.cloture_manuelle += safeParseNumber(rows[r].cloture_manuelle);
                g.reroutage_individuel += safeParseNumber(rows[r].reroutage_individuel);
                g.transfert_prod += safeParseNumber(rows[r].transfert_prod);
            }
        }

        // Seconde agrégation : par agentId seul et par agentId + offre
        var byAgent = {};
        
        // --- 1. Agrégation globale (comme avant) ---
        var groupKeys = Object.keys(groupsByAgentDate);
        for (var j = 0; j < groupKeys.length; j++) {
            var grp = groupsByAgentDate[groupKeys[j]];
            var aid = grp.agentId;
            if (!byAgent[aid]) {
                if (sourceKey === 'telephone') {
                    byAgent[aid] = { agentId: aid, offres: {}, appels_traites: 0, dmtSumSeconds: 0, dmtWeight: 0, dmcSumSeconds: 0, dmmgSumSeconds: 0, dmpaSumSeconds: 0, identsSum: 0, repImmSum: 0, transferts: 0, consultations: 0, rona: 0 };
                } else if (sourceKey === 'courriels') {
                    byAgent[aid] = { agentId: aid, cloture: 0, envoi_watt: 0, reponse_directe: 0 };
                } else {
                    byAgent[aid] = { agentId: aid, cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
                }
            }
            var agg = byAgent[aid];
            if (sourceKey === 'telephone') {
                agg.appels_traites += grp.appels_traites;
                agg.dmtSumSeconds += grp.dmtSumSeconds;
                agg.dmtWeight += grp.dmtWeight;
                agg.dmcSumSeconds += grp.dmcSumSeconds;
                agg.dmmgSumSeconds += grp.dmmgSumSeconds;
                agg.dmpaSumSeconds += grp.dmpaSumSeconds;
                agg.identsSum += grp.identsSum;
                agg.repImmSum += grp.repImmSum;
                agg.transferts += grp.transferts;
                agg.consultations += grp.consultations;
                agg.rona += grp.rona;
            } else if (sourceKey === 'courriels') {
                agg.cloture         += grp.cloture;
                agg.envoi_watt      += grp.envoi_watt;
                agg.reponse_directe += grp.reponse_directe;
            } else {
                agg.cloture_manuelle += grp.cloture_manuelle;
                agg.reroutage_individuel += grp.reroutage_individuel;
                agg.transfert_prod += grp.transfert_prod;
            }
        }
        
        // --- 2. Agrégation par offre (uniquement pour téléphone) ---
        if (sourceKey === 'telephone') {
            var offerGroupKeys = Object.keys(groupsByAgentOfferDate);
            for (var k = 0; k < offerGroupKeys.length; k++) {
                var ogrp = groupsByAgentOfferDate[offerGroupKeys[k]];
                var oaid = ogrp.agentId;
                var ooffre = ogrp.offre;
                
                if (byAgent[oaid]) {
                    if (!byAgent[oaid].offres[ooffre]) {
                        byAgent[oaid].offres[ooffre] = {
                            offre: ooffre, appels_traites: 0, dmtSumSeconds: 0, dmtWeight: 0, dmcSumSeconds: 0, dmmgSumSeconds: 0, dmpaSumSeconds: 0, identsSum: 0, repImmSum: 0, transferts: 0, consultations: 0, rona: 0
                        };
                    }
                    var oagg = byAgent[oaid].offres[ooffre];
                    oagg.appels_traites += ogrp.appels_traites;
                    oagg.dmtSumSeconds += ogrp.dmtSumSeconds;
                    oagg.dmtWeight += ogrp.dmtWeight;
                    oagg.dmcSumSeconds += ogrp.dmcSumSeconds;
                    oagg.dmmgSumSeconds += ogrp.dmmgSumSeconds;
                    oagg.dmpaSumSeconds += ogrp.dmpaSumSeconds;
                    oagg.identsSum += ogrp.identsSum;
                    oagg.repImmSum += ogrp.repImmSum;
                    oagg.transferts += ogrp.transferts;
                    oagg.consultations += ogrp.consultations;
                    oagg.rona += ogrp.rona;
                }
            }
        }

        // Format final : tableau d'objets avec les clés attendues par les vues (agentId, dmt, appels_traites, etc.)
        var out = [];
        var agentIds = Object.keys(byAgent);
        for (var p = 0; p < agentIds.length; p++) {
            var aggItem = byAgent[agentIds[p]];
            if (sourceKey === 'telephone') {
                var globalData = {
                    agentId: aggItem.agentId,
                    dmt: aggItem.dmtWeight > 0 ? aggItem.dmtSumSeconds / aggItem.dmtWeight : 0,
                    appels_traites: aggItem.appels_traites,
                    dmc: aggItem.dmtWeight > 0 ? aggItem.dmcSumSeconds / aggItem.dmtWeight : 0,
                    dmmg: aggItem.dmtWeight > 0 ? aggItem.dmmgSumSeconds / aggItem.dmtWeight : 0,
                    dmpa: aggItem.dmtWeight > 0 ? aggItem.dmpaSumSeconds / aggItem.dmtWeight : 0,
                    identifications: aggItem.dmtWeight > 0 ? aggItem.identsSum / aggItem.dmtWeight : 0,
                    reponses_immediates: aggItem.dmtWeight > 0 ? aggItem.repImmSum / aggItem.dmtWeight : 0,
                    transferts: aggItem.transferts,
                    consultations: aggItem.consultations,
                    rona: aggItem.rona,
                    offres: []
                };
                
                var offreKeys = Object.keys(aggItem.offres);
                for (var o = 0; o < offreKeys.length; o++) {
                    var oaggItem = aggItem.offres[offreKeys[o]];
                    globalData.offres.push({
                        offre: oaggItem.offre,
                        dmt: oaggItem.dmtWeight > 0 ? oaggItem.dmtSumSeconds / oaggItem.dmtWeight : 0,
                        appels_traites: oaggItem.appels_traites,
                        dmc: oaggItem.dmtWeight > 0 ? oaggItem.dmcSumSeconds / oaggItem.dmtWeight : 0,
                        dmmg: oaggItem.dmtWeight > 0 ? oaggItem.dmmgSumSeconds / oaggItem.dmtWeight : 0,
                        dmpa: oaggItem.dmtWeight > 0 ? oaggItem.dmpaSumSeconds / oaggItem.dmtWeight : 0,
                        identifications: oaggItem.dmtWeight > 0 ? oaggItem.identsSum / oaggItem.dmtWeight : 0,
                        reponses_immediates: oaggItem.dmtWeight > 0 ? oaggItem.repImmSum / oaggItem.dmtWeight : 0,
                        transferts: oaggItem.transferts,
                        consultations: oaggItem.consultations,
                        rona: oaggItem.rona
                    });
                }
                out.push(globalData);
                
            } else if (sourceKey === 'courriels') {
                out.push({
                    agentId:          aggItem.agentId,
                    cloture:          aggItem.cloture,
                    envoi_watt:       aggItem.envoi_watt,
                    reponse_directe:  aggItem.reponse_directe
                });
            } else {
                out.push({
                    agentId: aggItem.agentId,
                    cloture_manuelle: aggItem.cloture_manuelle || 0,
                    reroutage_individuel: aggItem.reroutage_individuel || 0,
                    transfert_prod: aggItem.transfert_prod || 0
                });
            }
        }
        return out;
    }

    /**
     * Parse le CSV, applique le mapping, résout Matricule → agentId, agrège par Agent et Date.
     * Contrat de sortie : tableau d'objets { agentId, dmt, appels_traites, ... } (une ligne par agent).
     * @param {string} csvText
     * @param {string} sourceKey - 'telephone' | 'courriels' | 'watt'
     * @param {Array<{id: number, matricule?: string}>} agents - Référentiel pour résolution
     * @param {number|undefined} agentIdFilter - Si fourni, ne conserver que les lignes de cet agent
     * @returns {Array<object>}
     */
    /**
     * Parse un CSV et retourne les DTOs bruts filtrés (sans agrégation).
     * @param {string} csvText
     * @param {string} sourceKey
     * @param {Array} agents
     * @param {number|undefined} agentIdFilter
     * @param {string|null} dateFrom - YYYY-MM-DD ou null
     * @param {string|null} dateTo   - YYYY-MM-DD ou null
     * @returns {Array<object>} DTOs bruts
     */
    function parseCsvToDtos(csvText, sourceKey, agents, agentIdFilter, dateFrom, dateTo) {
        if (typeof global.Papa === 'undefined') return [];
        agents = agents || (typeof global.LISTE_AGENTS !== 'undefined' ? global.LISTE_AGENTS : []);
        var idNum = (agentIdFilter != null && agentIdFilter !== '')
            ? (typeof agentIdFilter === 'number' ? agentIdFilter : parseInt(agentIdFilter, 10))
            : NaN;
        var hasFilter = !isNaN(idNum);

        var delimiter = detectDelimiter(csvText);
        var result = global.Papa.parse(csvText, { header: true, delimiter: delimiter });
        var rawRows = result.data && Array.isArray(result.data) ? result.data : [];
        var mapping = PRODUCTION_COLUMN_MAPPINGS[sourceKey];
        if (!mapping || mapping.length === 0) return [];

        var rawHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
        var headerToInternal = buildHeaderToInternalMap(mapping, rawHeaders);
        var dtos = [];
        for (var r = 0; r < rawRows.length; r++) {
            var rawRow = rawRows[r];
            if (isRowEmpty(rawRow)) continue;
            var dto = rowToDto(rawRow, mapping, headerToInternal);
            var agentId;
            if (sourceKey === 'watt') {
                var acteur = (dto.agentName != null ? String(dto.agentName).trim() : '');
                if (acteur === '' || acteur === 'Total traité par mes équipes') continue;
                // Nouveau format WATT : rapprochement prioritaire par identifiant ANAIS (plus fiable que le nom).
                // Fallback nom uniquement si l'identifiant est absent ou non résolu.
                agentId = resolveAgentId(dto.anaisId, agents);
                if (agentId == null) {
                    agentId = resolveAgentIdByName(dto.agentName, agents);
                }
            } else {
                agentId = resolveAgentId(dto.matricule, agents);
            }
            if (agentId == null) continue;
            if (hasFilter && agentId !== idNum) continue;
            // Filtre par plage de dates (comparaison lexicographique sur ISO YYYY-MM-DD)
            // Si rowDate est vide (mapping raté), la ligne passe (pas d'élimination silencieuse)
            var rowDate = (dto.date || '').trim();
            // WATT journalier : une date valide est obligatoire pour éviter des agrégats "unknown".
            if (sourceKey === 'watt' && !rowDate) continue;
            if (rowDate) {
                if (dateFrom && rowDate < dateFrom) continue;
                if (dateTo   && rowDate > dateTo)   continue;
            }
            dto.agentId = agentId;
            delete dto.matricule;
            if (sourceKey === 'watt') {
                delete dto.agentName;
                delete dto.anaisId;
            }
            dtos.push(dto);
        }
        return dtos;
    }

    /**
     * Construit le nom de fichier CSV attendu pour une période (ex: telephone_2026-01.csv).
     * @param {string} prefix - "telephone" | "courriels" | "watt"
     * @param {number} mois - 1-12
     * @param {number} annee - ex. 2026
     * @returns {string}
     */
    function csvFileNameForPeriod(prefix, mois, annee) {
        var moisStr = String(mois).padStart(2, '0');
        return prefix + '_' + annee + '-' + moisStr + '.csv';
    }

    /**
     * Charge les stats Production (téléphone, courriels, watt) depuis Data_Stats/.
     * La liste des mois à charger est déduite uniquement de l'intervalle dateFrom/dateTo (YYYY-MM-DD).
     * @param {FileSystemDirectoryHandle} rootHandle
     * @param {object} options - { dateFrom?, dateTo?, agentId?, agents? }
     * @returns {Promise<{ telephone: [], courriels: [], watt: [] }>}
     */
    function loadProductionStats(rootHandle, options) {
        options = options || {};
        var rawFrom = options.dateFrom != null ? String(options.dateFrom) : '';
        var rawTo   = options.dateTo   != null ? String(options.dateTo)   : '';
        var dateFrom = normalizeDateToISO(rawFrom);
        var dateTo   = normalizeDateToISO(rawTo);
        var agentId  = options.agentId;
        var agents   = options.agents || (typeof global.LISTE_AGENTS !== 'undefined' ? global.LISTE_AGENTS : []);

        if (!dateFrom || !dateTo) {
            var ref = new Date();
            var t = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0, 0);
            var first = new Date(t.getFullYear(), t.getMonth(), 1, 12, 0, 0, 0);
            var last  = new Date(t.getFullYear(), t.getMonth() + 1, 0, 12, 0, 0, 0);
            var pad = function (n) { return n < 10 ? '0' + n : String(n); };
            dateFrom = first.getFullYear() + '-' + pad(first.getMonth() + 1) + '-' + pad(first.getDate());
            dateTo   = last.getFullYear()  + '-' + pad(last.getMonth() + 1)  + '-' + pad(last.getDate());
        }

        var fp = dateFrom.split('-');
        var baseAnnee = parseInt(fp[0], 10);
        var baseMois  = parseInt(fp[1], 10);
        if (isNaN(baseAnnee) || isNaN(baseMois) || baseMois < 1 || baseMois > 12) {
            var outEmpty = { telephone: [], courriels: [], watt: [], wattDetail: [] };
            if (!fsManager || !rootHandle) return Promise.resolve(outEmpty);
            return Promise.resolve(outEmpty);
        }

        var out = { telephone: [], courriels: [], watt: [], wattDetail: [] };
        if (!fsManager || !rootHandle) return Promise.resolve(out);

        var tp = dateTo.split('-');
        var endY = parseInt(tp[0], 10);
        var endM = parseInt(tp[1], 10);
        if (isNaN(endY) || isNaN(endM) || endM < 1 || endM > 12) {
            endY = baseAnnee;
            endM = baseMois;
        }

        var monthsToLoad = [];
        var y = baseAnnee, m = baseMois;
        while (y < endY || (y === endY && m <= endM)) {
            monthsToLoad.push({ mois: m, annee: y });
            if (m === 12) {
                m = 1;
                y++;
            } else {
                m++;
            }
        }

        return fsManager.getDataStatsDir(rootHandle).then(function (dataStatsDir) {
            return fsManager.listEntries(dataStatsDir).then(function (entries) {
                var files = entries.filter(function (e) { return e.kind === 'file' && e.name.toLowerCase().endsWith('.csv'); });
                var prefixes = ['telephone', 'courriels', 'watt'];
                var rawDtos  = { telephone: [], courriels: [], watt: [] };
                var promises = [];

                monthsToLoad.forEach(function(period) {
                    prefixes.forEach(function (prefix) {
                        var fileName = csvFileNameForPeriod(prefix, period.mois, period.annee);
                        var found = files.some(function (f) { return f.name === fileName; });
                        if (!found) return;
                        // IIFE pour capturer correctement key dans la closure async
                        (function(key) {
                            promises.push(
                                fsManager.readFileText(dataStatsDir, fileName).then(function (text) {
                                    var dtos = parseCsvToDtos(text, key, agents, agentId, dateFrom, dateTo);
                                    rawDtos[key] = rawDtos[key].concat(dtos);
                                }).catch(function () {})
                            );
                        })(prefix === 'telephone' ? 'telephone' : (prefix === 'courriels' ? 'courriels' : 'watt'));
                    });
                });

                return Promise.all(promises).then(function () {
                    out.telephone = aggregateByAgentAndDate(rawDtos.telephone, 'telephone');
                    out.courriels = aggregateByAgentAndDate(rawDtos.courriels, 'courriels');
                    out.watt      = aggregateByAgentAndDate(rawDtos.watt,      'watt');
                    out.wattDetail = rawDtos.watt.filter(function (r) {
                        return (r.circuit != null ? String(r.circuit).trim() : '') !== '';
                    }).map(function (r) {
                        return {
                            agentId: r.agentId,
                            circuit: String(r.circuit || '').trim(),
                            cloture_manuelle: safeParseNumber(r.cloture_manuelle),
                            reroutage_individuel: safeParseNumber(r.reroutage_individuel),
                            transfert_prod: safeParseNumber(r.transfert_prod)
                        };
                    });
                    return out;
                });
            });
        }).catch(function () {
            return out;
        });
    }

    /**
     * Charge l'historique Qualité d'un agent (notes par campagne) en parcourant les dossiers de campagnes.
     * @param {FileSystemDirectoryHandle} rootHandle - Racine du projet (non utilisé si campagnesHandle fourni)
     * @param {FileSystemDirectoryHandle} campagnesHandle - Handle du dossier Campagnes/
     * @param {number} agentId - Id de l'agent
     * @param {object} [options] - { agentDisplayName?: string } pour comparaison avec data.agent
     * @returns {Promise<Array<{ campaignName: string, periodStart: string, periodEnd?: string, note: number, date?: string }>>}
     */
    function loadQualiteHistory(rootHandle, campagnesHandle, agentId, options) {
        options = options || {};
        var agentDisplayName = options.agentDisplayName;
        var results = [];

        if (!fsManager || !campagnesHandle) return Promise.resolve(results);

        return fsManager.listEntries(campagnesHandle).then(function (entries) {
            var dirs = entries.filter(function (e) { return e.kind === 'directory'; });
            var promises = dirs.map(function (e) {
                return campagnesHandle.getDirectoryHandle(e.name).then(function (campaignDir) {
                    return fsManager.readCampaignConfig(campaignDir).then(function (config) {
                        var campaignName = config && config.name ? config.name : e.name;
                        var periodStart = config && config.period_start ? config.period_start : '';
                        var periodEnd = config && config.period_end ? config.period_end : '';
                        return fsManager.listEntries(campaignDir).then(function (campEntries) {
                            var evalFiles = campEntries.filter(function (f) {
                                return f.kind === 'file' && f.name.startsWith('eval_') && f.name.endsWith('.json');
                            });
                            var evalPromises = evalFiles.map(function (f) {
                                return fsManager.readJsonFile(campaignDir, f.name).then(function (data) {
                                    var match = (data.agentId != null && Number(data.agentId) === Number(agentId)) ||
                                        (agentDisplayName && data.agent === agentDisplayName);
                                    if (!match) return null;
                                    var note = data.note != null ? parseFloat(data.note) : 0;
                                    if (isNaN(note)) note = 0;
                                    return {
                                        campaignName: campaignName,
                                        periodStart: periodStart,
                                        periodEnd: periodEnd,
                                        note: note,
                                        date: data._timestamp ? new Date(data._timestamp).toISOString() : undefined
                                    };
                                }).catch(function () { return null; });
                            });
                            return Promise.all(evalPromises).then(function (items) {
                                return items.filter(Boolean);
                            });
                        });
                    }).catch(function () { return []; });
                }).catch(function () { return []; });
            });

            return Promise.all(promises).then(function (arrays) {
                var flat = [];
                arrays.forEach(function (arr) { flat = flat.concat(arr); });
                flat.sort(function (a, b) {
                    var da = a.periodStart || '';
                    var db = b.periodStart || '';
                    return da.localeCompare(db);
                });
                return flat;
            });
        }).catch(function () {
            return results;
        });
    }

    /**
     * Agrège les stats d'un périmètre (équipe / global) en un DTO unique prêt à afficher.
     * Contrat : le DTO retourné suit la même forme qu'un DTO agent individuel attendu par la vue 360°.
     *
     * IMPORTANT : cette fonction ne touche pas au DOM et n'effectue pas d'I/O.
     *
     * @param {{ telephone: Array, courriels: Array, watt: Array, wattDetail: Array }} rawProduction
     * @param {Array<number>|null} agentIdsInScope - null = tous les agents présents dans rawProduction
     * @returns {{ production: { telephone: Array, courriels: Array, watt: Array, wattDetail: Array } }}
     */
    function aggregatePerimeterStats(rawProduction, agentIdsInScope) {
        rawProduction = rawProduction || {};
        var telephone = Array.isArray(rawProduction.telephone) ? rawProduction.telephone : [];
        var courriels = Array.isArray(rawProduction.courriels) ? rawProduction.courriels : [];
        var watt = Array.isArray(rawProduction.watt) ? rawProduction.watt : [];
        var wattDetail = Array.isArray(rawProduction.wattDetail) ? rawProduction.wattDetail : [];

        var scopeMap = null;
        if (agentIdsInScope && Array.isArray(agentIdsInScope)) {
            scopeMap = {};
            for (var si = 0; si < agentIdsInScope.length; si++) {
                var sid = Number(agentIdsInScope[si]);
                if (!isNaN(sid)) scopeMap[sid] = true;
            }
        }
        var inScope = function (id) {
            if (!scopeMap) return true;
            var n = Number(id);
            return !isNaN(n) && !!scopeMap[n];
        };

        // --- Téléphone (GLOBAL + offres) : moyennes pondérées par appels_traites ---
        var telWeight = 0;
        var tel = {
            agentId: 0,
            appels_traites: 0,
            dmtSum: 0,
            dmcSum: 0,
            dmmgSum: 0,
            dmpaSum: 0,
            identsSum: 0,
            repImmSum: 0,
            transferts: 0,
            consultations: 0,
            rona: 0,
            offres: {}
        };

        for (var ti = 0; ti < telephone.length; ti++) {
            var row = telephone[ti];
            if (!row || typeof row !== 'object') continue;
            if (!inScope(row.agentId)) continue;

            var vol = safeParseNumber(row.appels_traites);
            tel.appels_traites += vol;
            telWeight += vol;
            tel.dmtSum += safeParseNumber(row.dmt) * vol;
            tel.dmcSum += safeParseNumber(row.dmc) * vol;
            tel.dmmgSum += safeParseNumber(row.dmmg) * vol;
            tel.dmpaSum += safeParseNumber(row.dmpa) * vol;
            tel.identsSum += safeParseNumber(row.identifications) * vol;
            tel.repImmSum += safeParseNumber(row.reponses_immediates) * vol;
            tel.transferts += safeParseNumber(row.transferts);
            tel.consultations += safeParseNumber(row.consultations);
            tel.rona += safeParseNumber(row.rona);

            var offres = row.offres;
            if (!offres || !Array.isArray(offres)) continue;
            for (var oi = 0; oi < offres.length; oi++) {
                var o = offres[oi];
                if (!o || typeof o !== 'object' || typeof o.offre !== 'string') continue;
                var name = o.offre;
                if (!tel.offres[name]) {
                    tel.offres[name] = {
                        offre: name,
                        appels_traites: 0,
                        weight: 0,
                        dmtSum: 0,
                        dmcSum: 0,
                        dmmgSum: 0,
                        dmpaSum: 0,
                        identsSum: 0,
                        repImmSum: 0,
                        transferts: 0,
                        consultations: 0,
                        rona: 0
                    };
                }
                var off = tel.offres[name];
                var ovol = safeParseNumber(o.appels_traites);
                off.appels_traites += ovol;
                off.weight += ovol;
                off.dmtSum += safeParseNumber(o.dmt) * ovol;
                off.dmcSum += safeParseNumber(o.dmc) * ovol;
                off.dmmgSum += safeParseNumber(o.dmmg) * ovol;
                off.dmpaSum += safeParseNumber(o.dmpa) * ovol;
                off.identsSum += safeParseNumber(o.identifications) * ovol;
                off.repImmSum += safeParseNumber(o.reponses_immediates) * ovol;
                off.transferts += safeParseNumber(o.transferts);
                off.consultations += safeParseNumber(o.consultations);
                off.rona += safeParseNumber(o.rona);
            }
        }

        var telOut = [];
        if (telWeight > 0 || tel.appels_traites > 0) {
            var telRow = {
                agentId: 0,
                appels_traites: tel.appels_traites,
                dmt: telWeight > 0 ? tel.dmtSum / telWeight : 0,
                dmc: telWeight > 0 ? tel.dmcSum / telWeight : 0,
                dmmg: telWeight > 0 ? tel.dmmgSum / telWeight : 0,
                dmpa: telWeight > 0 ? tel.dmpaSum / telWeight : 0,
                identifications: telWeight > 0 ? tel.identsSum / telWeight : 0,
                reponses_immediates: telWeight > 0 ? tel.repImmSum / telWeight : 0,
                transferts: tel.transferts,
                consultations: tel.consultations,
                rona: tel.rona,
                offres: []
            };

            var offerNames = Object.keys(tel.offres);
            for (var on = 0; on < offerNames.length; on++) {
                var offName = offerNames[on];
                var agg = tel.offres[offName];
                var w = agg.weight || 0;
                telRow.offres.push({
                    offre: agg.offre,
                    appels_traites: agg.appels_traites,
                    dmt: w > 0 ? agg.dmtSum / w : 0,
                    dmc: w > 0 ? agg.dmcSum / w : 0,
                    dmmg: w > 0 ? agg.dmmgSum / w : 0,
                    dmpa: w > 0 ? agg.dmpaSum / w : 0,
                    identifications: w > 0 ? agg.identsSum / w : 0,
                    reponses_immediates: w > 0 ? agg.repImmSum / w : 0,
                    transferts: agg.transferts,
                    consultations: agg.consultations,
                    rona: agg.rona
                });
            }
            telOut.push(telRow);
        }

        // --- Courriels : sommes ---
        var cour = { agentId: 0, cloture: 0, envoi_watt: 0, reponse_directe: 0 };
        var hasCour = false;
        for (var ci = 0; ci < courriels.length; ci++) {
            var crow = courriels[ci];
            if (!crow || typeof crow !== 'object') continue;
            if (!inScope(crow.agentId)) continue;
            hasCour = true;
            cour.cloture += safeParseNumber(crow.cloture);
            cour.envoi_watt += safeParseNumber(crow.envoi_watt);
            cour.reponse_directe += safeParseNumber(crow.reponse_directe);
        }
        var courOut = hasCour ? [cour] : [];

        // --- WATT : sommes ---
        var wat = { agentId: 0, cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
        var hasWatt = false;
        for (var wi = 0; wi < watt.length; wi++) {
            var wrow = watt[wi];
            if (!wrow || typeof wrow !== 'object') continue;
            if (!inScope(wrow.agentId)) continue;
            hasWatt = true;
            wat.cloture_manuelle += safeParseNumber(wrow.cloture_manuelle);
            wat.reroutage_individuel += safeParseNumber(wrow.reroutage_individuel);
            wat.transfert_prod += safeParseNumber(wrow.transfert_prod);
        }
        var wattOut = hasWatt ? [wat] : [];

        // --- WATT Detail : consolidation par circuit (sommes) ---
        var detailByCircuit = {};
        for (var di = 0; di < wattDetail.length; di++) {
            var drow = wattDetail[di];
            if (!drow || typeof drow !== 'object') continue;
            if (!inScope(drow.agentId)) continue;
            var circuit = (drow.circuit != null ? String(drow.circuit).trim() : '');
            if (!circuit) continue;
            if (!detailByCircuit[circuit]) {
                detailByCircuit[circuit] = { agentId: 0, circuit: circuit, cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
            }
            var cd = detailByCircuit[circuit];
            cd.cloture_manuelle += safeParseNumber(drow.cloture_manuelle);
            cd.reroutage_individuel += safeParseNumber(drow.reroutage_individuel);
            cd.transfert_prod += safeParseNumber(drow.transfert_prod);
        }
        var wattDetailOut = [];
        var circuits = Object.keys(detailByCircuit);
        for (var cx = 0; cx < circuits.length; cx++) {
            wattDetailOut.push(detailByCircuit[circuits[cx]]);
        }

        return {
            production: {
                telephone: telOut,
                courriels: courOut,
                watt: wattOut,
                wattDetail: wattDetailOut
            }
        };
    }

    /**
     * Charge et fusionne tous les fichiers planning_YYYY-MM.csv présents dans Data_Stats/.
     * Retourne une structure { agents: { [agentName]: { totalHours, states: { [etatPlanning]: { totalHours, entries: [] } } } } }.
     * @param {FileSystemDirectoryHandle} rootHandle
     * @returns {Promise<{agents: Object<string, { totalHours: number, states: Object<string, { totalHours: number, entries: Array }> }>}>>}
     */
    function loadPlanningStats(rootHandle) {
        var empty = { agents: {} };
        if (!fsManager || !rootHandle || typeof window === 'undefined' || !window.PlanningService) {
            console.warn('[Planning][StatsRepository] Service indisponible ou rootHandle manquant.');
            return Promise.resolve(empty);
        }

        return fsManager.getDataStatsDir(rootHandle).then(function (dataStatsDir) {
            return fsManager.listEntries(dataStatsDir).then(function (entries) {
                var planningFiles = entries.filter(function (e) {
                    return e.kind === 'file' && /^planning_\d{4}-\d{2}\.csv$/i.test(e.name);
                });

                console.log('[Planning][StatsRepository] Fichiers trouvés :', planningFiles.map(function (f) { return f.name; }));
                if (planningFiles.length === 0) return empty;

                var planningSvc = new window.PlanningService();
                var aggregated = { agents: {} };

                var promises = planningFiles.map(function (f) {
                    return dataStatsDir.getFileHandle(f.name).then(function (fileHandle) {
                        return fileHandle.getFile();
                    }).then(function (file) {
                        var bufferPromise = (file && typeof file.arrayBuffer === 'function')
                            ? file.arrayBuffer()
                            : Promise.resolve(new ArrayBuffer(0));
                        return bufferPromise;
                    }).then(function (buffer) {
                        var text = new TextDecoder('utf-8').decode(buffer);
                        if (text.indexOf('\uFFFD') !== -1) {
                            console.warn('[Planning] Fichier ANSI détecté. Bascule sur le décodeur windows-1252.');
                            text = new TextDecoder('windows-1252').decode(buffer);
                        }
                        console.log('[Planning][StatsRepository] Lecture OK fichier :', f.name, 'taille:', text && text.length);
                        var parsed = planningSvc.parseCSV(text) || { agents: {} };
                        var agents = parsed.agents || {};

                        Object.keys(agents).forEach(function (agentName) {
                            var srcAgent = agents[agentName] || {};
                            var srcStates = srcAgent.states || {};
                            if (!aggregated.agents[agentName]) {
                                aggregated.agents[agentName] = { totalHours: 0, states: {} };
                            }
                            var dstAgent = aggregated.agents[agentName];
                            dstAgent.totalHours += typeof srcAgent.totalHours === 'number' && !isNaN(srcAgent.totalHours)
                                ? srcAgent.totalHours
                                : 0;

                            Object.keys(srcStates).forEach(function (stateName) {
                                var srcState = srcStates[stateName] || {};
                                if (!dstAgent.states[stateName]) {
                                    dstAgent.states[stateName] = { totalHours: 0, entries: [] };
                                }
                                var dstState = dstAgent.states[stateName];
                                var addHours = typeof srcState.totalHours === 'number' && !isNaN(srcState.totalHours)
                                    ? srcState.totalHours
                                    : 0;
                                dstState.totalHours += addHours;

                                if (Array.isArray(srcState.entries) && srcState.entries.length > 0) {
                                    for (var i = 0; i < srcState.entries.length; i++) {
                                        var entry = srcState.entries[i];
                                        if (entry && typeof entry === 'object') {
                                            dstState.entries.push(entry);
                                        }
                                    }
                                }
                            });
                        });
                    }).catch(function (err) {
                        console.error('[Planning][StatsRepository] Erreur lecture fichier planning :', f.name, err);
                    });
                });

                return Promise.all(promises).then(function () {
                    console.log('[Planning][StatsRepository] Données globales chargées :', aggregated);
                    return aggregated;
                });
            });
        }).catch(function (err) {
            console.error('[Planning][StatsRepository] Erreur globale loadPlanningStats :', err);
            return empty;
        });
    }

    var StatsRepository = {
        loadProductionStats: loadProductionStats,
        aggregatePerimeterStats: aggregatePerimeterStats,
        loadQualiteHistory: loadQualiteHistory,
        loadPlanningStats: loadPlanningStats
    };

    global.HQApp.StatsRepository = StatsRepository;
})(typeof window !== 'undefined' ? window : this);
