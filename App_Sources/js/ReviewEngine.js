/**
 * ReviewEngine.js - Logique métier du format qualitatif (review).
 * Grilles d'entretiens avec textarea et boolean ; complétion binaire, pas de moyenne.
 * IIFE, exposé sur window.HQApp.ReviewEngine.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    function getDefaultFormState(grid) {
        var textResponses = {};
        var booleanResponses = {};
        var sections = (grid && grid.sections) ? grid.sections : (Array.isArray(grid) ? grid : []);
        sections.forEach(function (sec) {
            (sec.fields || []).forEach(function (field) {
                if (field.type === 'textarea') {
                    textResponses[field.id] = '';
                } else if (field.type === 'boolean') {
                    booleanResponses[field.id] = false;
                }
            });
        });
        return {
            scores: {},
            comments: {},
            textResponses: textResponses,
            booleanResponses: booleanResponses,
            note: 'N/A'
        };
    }

    function buildEvalPayload(formData, options) {
        options = options || {};
        var payload = JSON.parse(JSON.stringify(formData || {}));
        if (options.agentId != null) payload.agentId = options.agentId;
        if (options.agent) payload.agent = options.agent;
        if (options.fileName) payload._fileName = options.fileName;
        payload._timestamp = options.timestamp != null ? options.timestamp : Date.now();
        if (payload.note === undefined) payload.note = 'N/A';
        if (!payload.textResponses) payload.textResponses = {};
        if (!payload.booleanResponses) payload.booleanResponses = {};
        return payload;
    }

    function computeStats(evaluations, options) {
        options = options || {};
        var totalAgents = options.totalAgents || 0;
        var targetPerAgent = options.targetPerAgent || 3;
        var isFiltered = options.isFiltered || false;
        var allAgents = options.allAgents || [];
        var campaignAssignments = options.campaignAssignments || {};
        var supervisors = options.supervisors || [];
        var getAgentById = options.getAgentById || function () { return null; };
        var getAgentDisplayName = options.getAgentDisplayName || function () { return ''; };

        var base = totalAgents || allAgents.length;
        var list = evaluations || [];
        var currentTotal = list.length;
        var referenceTotal = isFiltered ? currentTotal : base * targetPerAgent;
        var remaining = isFiltered ? 0 : Math.max(0, referenceTotal - currentTotal);
        var progressPercent = referenceTotal > 0 ? Math.round((currentTotal / referenceTotal) * 100) : 100;

        var uniqueAgentIds = new Set(list.map(function (e) { return e.agentId; }).filter(Boolean));
        var uniqueAgentNames = new Set(list.map(function (e) { return e.agent; }).filter(Boolean));
        var evaluatedAgents = uniqueAgentIds.size > 0 ? uniqueAgentIds.size : uniqueAgentNames.size;
        var totalAgentsFinal = isFiltered ? evaluatedAgents : base;

        var shortConfig = (options.duration_thresholds && options.duration_thresholds.short) || { min: 3, sec: 0 };
        var mediumConfig = (options.duration_thresholds && options.duration_thresholds.medium) || { min: 6, sec: 0 };
        var shortThresh = shortConfig.min * 60 + (shortConfig.sec || 0);
        var mediumThresh = mediumConfig.min * 60 + (mediumConfig.sec || 0);
        var totalSeconds = 0;
        var dist = { short: 0, medium: 0, long: 0 };
        list.forEach(function (e) {
            var min = parseInt(e.duree_min, 10) || 0;
            var sec = parseInt(e.duree_sec, 10) || 0;
            var durationSec = min * 60 + sec;
            totalSeconds += durationSec;
            if (durationSec < shortThresh) dist.short++;
            else if (durationSec <= mediumThresh) dist.medium++;
            else dist.long++;
        });
        var avgSec = list.length ? Math.round(totalSeconds / list.length) : 0;
        var avgM = Math.floor(avgSec / 60);
        var avgS = avgSec % 60;
        var avgDuration = (avgM <= 9 ? '0' : '') + avgM + ':' + (avgS <= 9 ? '0' : '') + avgS;

        var siteGroups = {};
        list.forEach(function (e) {
            var s = e._siteName || 'Inconnu';
            if (!siteGroups[s]) siteGroups[s] = { count: 0 };
            siteGroups[s].count++;
        });
        var siteStats = Object.keys(siteGroups).map(function (site) {
            return { site: site, avg: 'N/A', count: siteGroups[site].count };
        }).sort(function (a, b) { return b.count - a.count; });

        var offerGroups = {};
        list.forEach(function (e) {
            var o = e.offre || 'Non défini';
            if (!offerGroups[o]) offerGroups[o] = { count: 0 };
            offerGroups[o].count++;
        });
        var offerStats = Object.keys(offerGroups).map(function (offer) {
            return { offer: offer, avg: 'N/A', count: offerGroups[offer].count };
        }).sort(function (a, b) { return b.count - a.count; });

        var agentCounts = {};
        list.forEach(function (e) {
            var key = e.agentId != null ? e.agentId : e.agent;
            var displayName = e.agentId
                ? (getAgentById(e.agentId) ? getAgentDisplayName(getAgentById(e.agentId)) : e.agent)
                : e.agent;
            if (!agentCounts[key]) agentCounts[key] = { count: 0, site: e._siteName, name: displayName };
            agentCounts[key].count++;
        });
        var agentList = Object.keys(agentCounts).map(function (key) {
            var d = agentCounts[key];
            return { name: d.name, avg: 'N/A', site: d.site, count: d.count };
        }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

        var supervisorProgress = [];
        if (!isFiltered) {
            Object.keys(campaignAssignments).forEach(function (supId) {
                var assign = campaignAssignments[supId];
                var agentIds = (assign && assign.agent_ids) ? assign.agent_ids : [];
                var sup = supervisors.filter(function (s) { return String(s.id) === String(supId); })[0];
                var nom = sup ? sup.nom : 'Superviseur ' + supId;
                var target = agentIds.length * targetPerAgent;
                var completed = list.filter(function (e) {
                    var aid = e.agentId != null ? e.agentId : (allAgents.filter(function (a) { return getAgentDisplayName(a) === e.agent; })[0] || {}).id;
                    return aid != null && agentIds.indexOf(aid) !== -1;
                }).length;
                var percent = target > 0 ? Math.round((completed / target) * 100) : 100;
                if (target > 0) supervisorProgress.push({ id: supId, nom: nom, completed: completed, target: target, percent: percent });
            });
        }

        return {
            moyenne: 0,
            rubrics: {},
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
            topAgents: [],
            flopAgents: [],
            agentList: agentList
        };
    }

    function ReviewEngine() {}

    ReviewEngine.prototype.getSubTotal = function (formData, section) {
        return 0;
    };

    ReviewEngine.prototype.getDefaultFormState = function (grid) {
        return getDefaultFormState(grid);
    };

    ReviewEngine.prototype.computeNote = function (formData, grid) {
        return 'N/A';
    };

    ReviewEngine.prototype.buildEvalPayload = function (formData, options) {
        return buildEvalPayload(formData, options);
    };

    ReviewEngine.prototype.buildBilanPayload = function (agentContext, synthese, emailSentTo, evalsIncluded, isSending, fileName) {
        return {
            type: 'bilan',
            agentId: agentContext && agentContext.agentId,
            agent: agentContext && agentContext.agentName,
            date: new Date().toISOString(),
            evals_included: evalsIncluded || [],
            synthese: synthese || '',
            email_sent_to: emailSentTo || '',
            sent: !!isSending,
            _fileName: fileName || null
        };
    };

    ReviewEngine.prototype.classifyAgentStatus = function (agent, agentEvals, agentBilans, targetEvals, helpers) {
        helpers = helpers || {};
        var getSiteName = helpers.getSiteName || function () { return 'Inconnu'; };
        var getAgentDisplayName = helpers.getAgentDisplayName || function () { return ''; };
        var count = (agentEvals || []).length;
        var sorted = (agentBilans || []).slice().sort(function (a, b) { return (b._timestamp || 0) - (a._timestamp || 0); });
        var lastBilan = sorted.length > 0 ? sorted[0] : null;
        return {
            name: getAgentDisplayName(agent),
            site: getSiteName(agent && agent.siteId),
            count: count,
            avg: 'N/A',
            hasDraft: lastBilan && !lastBilan.sent,
            isSent: lastBilan && lastBilan.sent,
            sentDate: lastBilan && lastBilan.sent ? lastBilan.date : null
        };
    };

    ReviewEngine.prototype.computeAgentAverage = function (evals) {
        return 'N/A';
    };

    ReviewEngine.prototype.computeStats = function (evaluations, options) {
        return computeStats(evaluations, options);
    };

    ReviewEngine.prototype.parseEvalFile = function (data) {
        if (!data || typeof data !== 'object') return {};
        return {
            agentId: data.agentId,
            agent: data.agent,
            campagne: data.campagne,
            duree_min: data.duree_min,
            duree_sec: data.duree_sec,
            offre: data.offre,
            date_communication: data.date_communication,
            note: data.note != null ? data.note : 'N/A',
            commentaire: data.commentaire,
            scores: data.scores || {},
            comments: data.comments || {},
            textResponses: data.textResponses || {},
            booleanResponses: data.booleanResponses || {},
            _fileName: data._fileName,
            _timestamp: data._timestamp,
            _siteId: data._siteId,
            _siteName: data._siteName,
            _dateStr: data._dateStr
        };
    };

    global.HQApp.ReviewEngine = ReviewEngine;
})(typeof window !== 'undefined' ? window : this);
