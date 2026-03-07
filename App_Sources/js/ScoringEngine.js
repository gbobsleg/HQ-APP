/**
 * ScoringEngine.js - Logique métier du format quantitatif (notation / 10, stats).
 * Phase 2 : Isolation du domaine. IIFE, exposé sur window.HQApp.ScoringEngine.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    function getSubTotal(formData, section) {
        var scores = formData && formData.scores;
        if (!scores) return 0;
        var sub = 0;
        (section.fields || []).forEach(function (field) {
            if (field.type === 'scoring') sub += parseFloat(scores[field.id] || 0);
        });
        return sub;
    }

    /**
     * Calcule la note sur 10 à partir des scores et de la grille (schéma V2 : sections/fields).
     * @param {object} formData - form (scores, ...)
     * @param {object} grid - grille { sections: [] } (champs scoring uniquement)
     * @returns {string} note affichée (ex. "7.5")
     */
    function computeNote(formData, grid) {
        var total = 0;
        var maxTotal = 0;
        var sections = (grid && grid.sections) ? grid.sections : (Array.isArray(grid) ? grid : []);
        sections.forEach(function (sec) {
            total += getSubTotal(formData, sec);
            (sec.fields || []).forEach(function (field) {
                if (field.type === 'scoring') maxTotal += (field.max || 0);
            });
        });
        if (maxTotal === 0) return '0.0';
        return ((total / maxTotal) * 10).toFixed(1);
    }

    /**
     * État initial du formulaire pour une grille V2 (scoring uniquement).
     * @param {object} grid - { sections: [] }
     * @returns {object} form partiel (scores, comments, textResponses, booleanResponses, note)
     */
    function getDefaultFormState(grid) {
        var scores = {};
        var comments = {};
        var sections = (grid && grid.sections) ? grid.sections : (Array.isArray(grid) ? grid : []);
        sections.forEach(function (sec) {
            (sec.fields || []).forEach(function (field) {
                if (field.type === 'scoring') {
                    scores[field.id] = field.max;
                    comments[field.id] = '';
                }
            });
        });
        return {
            scores: scores,
            comments: comments,
            textResponses: {},
            booleanResponses: {},
            note: '0.0'
        };
    }

    /**
     * Construit l'objet JSON à persister pour une évaluation.
     */
    function buildEvalPayload(formData, options) {
        options = options || {};
        var payload = JSON.parse(JSON.stringify(formData));
        if (options.agentId != null) payload.agentId = options.agentId;
        if (options.agent) payload.agent = options.agent;
        if (options.fileName) payload._fileName = options.fileName;
        payload._timestamp = options.timestamp != null ? options.timestamp : Date.now();
        return payload;
    }

    /**
     * Construit l'objet JSON du bilan.
     */
    function buildBilanPayload(agentContext, synthese, emailSentTo, evalsIncluded, isSending, fileName) {
        return {
            type: 'bilan',
            agentId: agentContext.agentId,
            agent: agentContext.agentName,
            date: new Date().toISOString(),
            evals_included: evalsIncluded || [],
            synthese: synthese || '',
            email_sent_to: emailSentTo || '',
            sent: !!isSending,
            _fileName: fileName || null
        };
    }

    /**
     * Classifie le statut d'un agent pour le workflow (pending / ready / done).
     * @param {object} agent - { id, siteId, ... }
     * @param {array} agentEvals - évaluations de cet agent
     * @param {array} agentBilans - bilans de cet agent (triés par timestamp desc)
     * @param {number} targetEvals - nombre cible d'évals
     * @param {object} helpers - { getSiteName: fn, getAgentDisplayName: fn }
     * @returns {object} { name, site, count, avg, hasDraft, isSent, sentDate }
     */
    function classifyAgentStatus(agent, agentEvals, agentBilans, targetEvals, helpers) {
        helpers = helpers || {};
        var getSiteName = helpers.getSiteName || function () { return 'Inconnu'; };
        var getAgentDisplayName = helpers.getAgentDisplayName || function () { return ''; };
        var count = (agentEvals || []).length;
        var avg = computeAgentAverage(agentEvals || []);
        var sorted = (agentBilans || []).slice().sort(function (a, b) { return (b._timestamp || 0) - (a._timestamp || 0); });
        var lastBilan = sorted.length > 0 ? sorted[0] : null;
        var hasDraft = lastBilan && !lastBilan.sent;
        var isSent = lastBilan && lastBilan.sent;
        var sentDate = lastBilan && lastBilan.sent ? lastBilan.date : null;
        return {
            name: getAgentDisplayName(agent),
            site: getSiteName(agent.siteId),
            count: count,
            avg: avg,
            hasDraft: hasDraft,
            isSent: isSent,
            sentDate: sentDate
        };
    }

    /**
     * Moyenne des notes d'une liste d'évaluations.
     */
    function computeAgentAverage(evals) {
        if (!evals || evals.length === 0) return '0.0';
        var sum = evals.reduce(function (acc, curr) {
            return acc + parseFloat(curr.note || 0);
        }, 0);
        return (sum / evals.length).toFixed(1);
    }

    /**
     * Calcule les statistiques (partie purement mathématique). Ne gère pas Chart.js.
     * @param {array} evaluations - liste filtrée des évaluations
     * @param {object} options - { totalAgents, targetPerAgent, isFiltered, grid, campaignAssignments, supervisors, allAgents, getAgentById, getAgentDisplayName }
     * @returns {object} stats (moyenne, rubrics, siteStats, offerStats, topAgents, flopAgents, agentList, supervisorProgress, etc.)
     */
    function computeStats(evaluations, options) {
        options = options || {};
        var totalAgents = options.totalAgents || 0;
        var targetPerAgent = options.targetPerAgent || 3;
        var isFiltered = options.isFiltered || false;
        var grid = options.grid || [];
        var campaignAssignments = options.campaignAssignments || {};
        var supervisors = options.supervisors || [];
        var allAgents = options.allAgents || [];
        var getAgentById = options.getAgentById || function () { return null; };
        var getAgentDisplayName = options.getAgentDisplayName || function () { return ''; };

        var defaultStats = {
            moyenne: 0,
            rubrics: {},
            evaluatedAgents: 0,
            totalAgents: totalAgents || allAgents.length,
            remaining: (totalAgents || allAgents.length) * targetPerAgent,
            completed: 0,
            totalEvaluationsTarget: (totalAgents || allAgents.length) * targetPerAgent,
            progressPercent: 0,
            supervisorProgress: [],
            avgDuration: '00:00',
            durationDistribution: { short: 0, medium: 0, long: 0 },
            siteStats: [],
            offerStats: [],
            topAgents: [],
            flopAgents: [],
            agentList: []
        };

        if (!evaluations || evaluations.length === 0) return defaultStats;

        var valid = evaluations.filter(function (e) { return !isNaN(parseFloat(e.note)); });
        var sum = valid.reduce(function (acc, curr) { return acc + parseFloat(curr.note); }, 0);
        var moyenne = (valid.length ? (sum / valid.length) : 0).toFixed(1);

        var currentTotal = valid.length;
        var referenceTotal = isFiltered ? currentTotal : (totalAgents > 0 ? totalAgents : allAgents.length) * targetPerAgent;
        var remaining = isFiltered ? 0 : Math.max(0, referenceTotal - currentTotal);
        var progressPercent = referenceTotal > 0 ? Math.round((currentTotal / referenceTotal) * 100) : 100;

        var uniqueAgentIds = new Set(valid.map(function (e) { return e.agentId; }).filter(Boolean));
        var uniqueAgentNames = new Set(valid.map(function (e) { return e.agent; }).filter(Boolean));
        var evaluatedAgents = uniqueAgentIds.size > 0 ? uniqueAgentIds.size : uniqueAgentNames.size;
        var totalAgentsFinal = isFiltered ? evaluatedAgents : (totalAgents > 0 ? totalAgents : allAgents.length);

        var shortConfig = (options.duration_thresholds && options.duration_thresholds.short) || { min: 3, sec: 0 };
        var mediumConfig = (options.duration_thresholds && options.duration_thresholds.medium) || { min: 6, sec: 0 };
        var shortThresh = shortConfig.min * 60 + (shortConfig.sec || 0);
        var mediumThresh = mediumConfig.min * 60 + (mediumConfig.sec || 0);

        var totalSeconds = 0;
        var dist = { short: 0, medium: 0, long: 0 };
        valid.forEach(function (e) {
            var min = parseInt(e.duree_min, 10) || 0;
            var sec = parseInt(e.duree_sec, 10) || 0;
            var durationSec = min * 60 + sec;
            totalSeconds += durationSec;
            if (durationSec < shortThresh) dist.short++;
            else if (durationSec <= mediumThresh) dist.medium++;
            else dist.long++;
        });
        var avgSec = valid.length ? Math.round(totalSeconds / valid.length) : 0;
        var avgM = Math.floor(avgSec / 60);
        var avgS = avgSec % 60;
        var avgDuration = (avgM <= 9 ? '0' : '') + avgM + ':' + (avgS <= 9 ? '0' : '') + avgS;

        var siteGroups = {};
        valid.forEach(function (e) {
            var s = e._siteName || 'Inconnu';
            if (!siteGroups[s]) siteGroups[s] = { sum: 0, count: 0 };
            siteGroups[s].sum += parseFloat(e.note);
            siteGroups[s].count++;
        });
        var siteStats = Object.keys(siteGroups).map(function (site) {
            var d = siteGroups[site];
            return { site: site, avg: (d.sum / d.count).toFixed(1) };
        }).sort(function (a, b) { return parseFloat(b.avg) - parseFloat(a.avg); });

        var offerGroups = {};
        valid.forEach(function (e) {
            var o = e.offre || 'Non défini';
            if (!offerGroups[o]) offerGroups[o] = { sum: 0, count: 0 };
            offerGroups[o].sum += parseFloat(e.note);
            offerGroups[o].count++;
        });
        var offerStats = Object.keys(offerGroups).map(function (offer) {
            var d = offerGroups[offer];
            return { offer: offer, avg: (d.sum / d.count).toFixed(1), count: d.count };
        }).sort(function (a, b) { return parseFloat(b.avg) - parseFloat(a.avg); });

        var agentScores = {};
        valid.forEach(function (e) {
            var key = e.agentId != null ? e.agentId : e.agent;
            var displayName = e.agentId
                ? (getAgentById(e.agentId) ? getAgentDisplayName(getAgentById(e.agentId)) : e.agent)
                : e.agent;
            if (!agentScores[key]) agentScores[key] = { sum: 0, count: 0, site: e._siteName, name: displayName };
            agentScores[key].sum += parseFloat(e.note);
            agentScores[key].count++;
        });
        var agentList = Object.keys(agentScores).map(function (key) {
            var d = agentScores[key];
            return { name: d.name, avg: (d.sum / d.count).toFixed(1), site: d.site, count: d.count };
        }).sort(function (a, b) { return parseFloat(b.avg) - parseFloat(a.avg); });

        var topAgents = agentList.slice(0, 3);
        var flopAgents = agentList.length >= 3 ? agentList.slice(-3).reverse() : [];
        var agentListSorted = agentList.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

        var rubricResults = {};
        var gridSections = (grid && grid.sections) ? grid.sections : (Array.isArray(grid) ? grid : []);
        gridSections.forEach(function (section) {
            var catSum = 0;
            var catMax = 0;
            var count = 0;
            valid.forEach(function (evalData) {
                if (evalData.scores) {
                    (section.fields || []).forEach(function (field) {
                        if (field.type === 'scoring') {
                            catSum += parseFloat(evalData.scores[field.id] || 0);
                            catMax += field.max || 0;
                        }
                    });
                    count++;
                }
            });
            rubricResults[section.label] = count > 0 && catMax > 0 ? ((catSum / catMax) * 100).toFixed(0) : 0;
        });

        var supervisorProgress = [];
        if (!isFiltered) {
            Object.keys(campaignAssignments).forEach(function (supId) {
                var assign = campaignAssignments[supId];
                var agentIds = (assign && assign.agent_ids) ? assign.agent_ids : [];
                var sup = supervisors.filter(function (s) { return String(s.id) === String(supId); })[0];
                var nom = sup ? sup.nom : 'Superviseur ' + supId;
                var target = agentIds.length * targetPerAgent;
                var completed = valid.filter(function (e) {
                    var aid = e.agentId != null ? e.agentId : (allAgents.filter(function (a) { return getAgentDisplayName(a) === e.agent; })[0] || {}).id;
                    return aid != null && agentIds.indexOf(aid) !== -1;
                }).length;
                var percent = target > 0 ? Math.round((completed / target) * 100) : 100;
                if (target > 0) supervisorProgress.push({ id: supId, nom: nom, completed: completed, target: target, percent: percent });
            });
        }

        return {
            moyenne: moyenne,
            rubrics: rubricResults,
            evaluatedAgents: evaluatedAgents,
            totalAgents: totalAgentsFinal,
            remaining: remaining,
            completed: currentTotal,
            totalEvaluationsTarget: referenceTotal,
            progressPercent: progressPercent,
            supervisorProgress: supervisorProgress,
            avgDuration: avgDuration,
            durationDistribution: dist,
            siteStats: siteStats,
            offerStats: offerStats,
            topAgents: topAgents,
            flopAgents: flopAgents,
            agentList: agentListSorted
        };
    }

    /**
     * Normalise les données brutes d'un fichier eval (pour affichage / filtres).
     */
    function parseEvalFile(data) {
        if (!data || typeof data !== 'object') return {};
        return {
            agentId: data.agentId,
            agent: data.agent,
            campagne: data.campagne,
            duree_min: data.duree_min,
            duree_sec: data.duree_sec,
            offre: data.offre,
            date_communication: data.date_communication,
            note: data.note,
            commentaire: data.commentaire,
            scores: data.scores || {},
            comments: data.comments || {},
            _fileName: data._fileName,
            _timestamp: data._timestamp,
            _siteId: data._siteId,
            _siteName: data._siteName,
            _dateStr: data._dateStr
        };
    }

    function ScoringEngine() {}
    ScoringEngine.prototype.getSubTotal = function (formData, section) { return getSubTotal(formData, section); };
    ScoringEngine.prototype.getDefaultFormState = function (grid) { return getDefaultFormState(grid); };
    ScoringEngine.prototype.computeNote = function (formData, grid) { return computeNote(formData, grid); };
    ScoringEngine.prototype.buildEvalPayload = function (formData, options) { return buildEvalPayload(formData, options); };
    ScoringEngine.prototype.buildBilanPayload = function (agentContext, synthese, emailSentTo, evalsIncluded, isSending, fileName) {
        return buildBilanPayload(agentContext, synthese, emailSentTo, evalsIncluded, isSending, fileName);
    };
    ScoringEngine.prototype.classifyAgentStatus = function (agent, agentEvals, agentBilans, targetEvals, helpers) {
        return classifyAgentStatus(agent, agentEvals, agentBilans, targetEvals, helpers);
    };
    ScoringEngine.prototype.computeAgentAverage = function (evals) { return computeAgentAverage(evals); };
    ScoringEngine.prototype.computeStats = function (evaluations, options) { return computeStats(evaluations, options); };
    ScoringEngine.prototype.parseEvalFile = function (data) { return parseEvalFile(data); };

    global.HQApp.ScoringEngine = ScoringEngine;
})(typeof window !== 'undefined' ? window : this);
