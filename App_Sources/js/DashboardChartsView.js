/**
 * DashboardChartsView.js - Gestion impérative des graphiques Chart.js (dashboard).
 * Phase 3 : Ségrégation UI. IIFE, exposé sur window.HQApp.DashboardChartsView.
 * Dépendance : Chart.js chargé globalement (dashboard.html).
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    var ChartLib = typeof global.Chart !== 'undefined' ? global.Chart : null;

    /**
     * Récupère un canvas par id, détruit l'instance Chart existante, optionnellement crée un nouveau graphique.
     * @param {string} id - id du canvas
     * @param {object|null} config - config Chart.js (si null, ne fait que destroy)
     * @returns {object|null} instance Chart ou null
     */
    function createSafeChart(id, config) {
        var canvas = document.getElementById(id);
        if (!canvas) return null;
        var existing = ChartLib && ChartLib.getChart && ChartLib.getChart(canvas);
        if (existing && typeof existing.destroy === 'function') existing.destroy();
        if (!config || !ChartLib) return null;
        return new ChartLib(canvas, config);
    }

    /**
     * Détruit les graphiques existants pour les ids donnés (sans en créer de nouveaux).
     * @param {string[]} canvasIds - liste des id de canvas (ex. ['dashChart', 'sitesChart', 'offersChart'])
     */
    function destroyCharts(canvasIds) {
        (canvasIds || []).forEach(function (id) {
            createSafeChart(id, null);
        });
    }

    /**
     * Rend ou met à jour les graphiques du dashboard à partir des stats.
     * Détruit les instances existantes puis crée les nouvelles. Si statsData est vide/null, ne fait que détruire.
     * @param {object} statsData - objet stats (agentList, siteStats, offerStats)
     * @param {object} options - { canvasIds: ['dashChart', 'sitesChart', 'offersChart'] } ou { ids: [...] }
     * @returns {object} { notes: Chart|null, sites: Chart|null, offers: Chart|null } pour référence éventuelle
     */
    function renderCharts(statsData, options) {
        options = options || {};
        var ids = options.ids || options.canvasIds || ['dashChart', 'sitesChart', 'offersChart'];
        destroyCharts(ids);

        if (!statsData || !ChartLib) return { notes: null, sites: null, offers: null };

        var agentList = statsData.agentList || [];
        var siteStats = statsData.siteStats || [];
        var offerStats = statsData.offerStats || [];

        var labelsNotes = agentList.map(function (a) { return a.name; });
        var dataNotes = agentList.map(function (a) { return parseFloat(a.avg) || 0; });

        var notes = createSafeChart(ids[0] || 'dashChart', {
            type: 'bar',
            data: {
                labels: labelsNotes,
                datasets: [{ label: 'Moyenne / 10', data: dataNotes, backgroundColor: '#6366f1', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
        });

        var sites = createSafeChart(ids[1] || 'sitesChart', {
            type: 'bar',
            indexAxis: 'y',
            data: {
                labels: siteStats.map(function (s) { return s.site; }),
                datasets: [{
                    label: 'Moyenne Qualité',
                    data: siteStats.map(function (s) { return parseFloat(s.avg) || 0; }),
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { min: 0, max: 10 } } }
        });

        var offers = createSafeChart(ids[2] || 'offersChart', {
            type: 'bar',
            data: {
                labels: offerStats.map(function (o) { return o.offer; }),
                datasets: [{
                    label: 'Qualité par Offre',
                    data: offerStats.map(function (o) { return parseFloat(o.avg) || 0; }),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
        });

        return { notes: notes, sites: sites, offers: offers };
    }

    global.HQApp.DashboardChartsView = {
        renderCharts: renderCharts,
        destroyCharts: destroyCharts
    };
})(typeof window !== 'undefined' ? window : this);
