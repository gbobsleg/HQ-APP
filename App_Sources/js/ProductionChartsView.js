/**
 * ProductionChartsView.js - Vue Production & Équipes.
 * Affiche des indicateurs consolidés d'un périmètre (équipe/global) à partir d'un DTO unique pré-agrégé.
 * IIFE, exposé sur window.HQApp.ProductionChartsView.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    var ChartLib = typeof global.Chart !== 'undefined' ? global.Chart : null;
    var chartInstances = [];
    var UI = global.HQApp && global.HQApp.UIComponents ? global.HQApp.UIComponents : null;
    var formatMmSs = UI && typeof UI.formatMmSs === 'function' ? UI.formatMmSs : function () { return '00:00'; };

    /**
     * Détruit toutes les instances Chart créées par ce module.
     * @param {HTMLElement} [containerEl] - Optionnel.
     */
    function destroy(containerEl) {
        chartInstances.forEach(function (ch) {
            if (ch && typeof ch.destroy === 'function') {
                try { ch.destroy(); } catch (e) {}
            }
        });
        chartInstances = [];
    }

    function getCanvas(id, containerEl) {
        if (!containerEl) return null;
        return containerEl.querySelector('[id="' + id + '"]');
    }

    function createChart(canvas, config) {
        if (!canvas || !ChartLib || !config) return null;
        if (typeof ChartDataLabels !== 'undefined') {
            ChartLib.register(ChartDataLabels);
        }
        var existing = ChartLib.getChart && ChartLib.getChart(canvas);
        if (existing && typeof existing.destroy === 'function') existing.destroy();
        var ch = new ChartLib(canvas, config);
        chartInstances.push(ch);
        return ch;
    }

    /**
     * Affiche la vue Production & Équipes à partir d'un DTO consolidé.
     * @param {HTMLElement} containerEl
     * @param {{ production: { telephone: Array, courriels: Array, watt: Array, wattDetail: Array } }} data
     */
    function renderProductionDashboard(containerEl, data) {
        destroy(containerEl);
        if (!containerEl || !ChartLib) return;

        data = data || {};
        var production = data.production || {};
        var telRow = (production.telephone && production.telephone[0]) ? production.telephone[0] : null;
        var courRow = (production.courriels && production.courriels[0]) ? production.courriels[0] : null;
        var wattRow = (production.watt && production.watt[0]) ? production.watt[0] : null;
        var wattDetail = Array.isArray(production.wattDetail) ? production.wattDetail : [];

        // --- Graphique Téléphone - Efficacité ---
        var canvasTel = getCanvas('prod-telephone', containerEl);
        if (canvasTel && telRow) {
            createChart(canvasTel, {
                type: 'bar',
                data: {
                    labels: ['Appels traités', "Taux d'identification (%)", 'Taux de réponse immédiate (%)'],
                    datasets: [
                        {
                            label: 'Équipe (Volume)',
                            data: [parseFloat(telRow.appels_traites) || 0, null, null],
                            backgroundColor: '#06b6d4',
                            borderRadius: 4,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Équipe (Taux %)',
                            data: [null, (parseFloat(telRow.identifications) || 0) * 100, (parseFloat(telRow.reponses_immediates) || 0) * 100],
                            backgroundColor: ['transparent', '#8b5cf6', '#3b82f6'],
                            borderRadius: 4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold' },
                            formatter: function (value, context) {
                                if (value == null || value === 0) return '';
                                if (context.datasetIndex === 1) return Math.round(value) + '%';
                                return Math.round(value);
                            }
                        }
                    },
                    scales: {
                        x: { stacked: false, barPercentage: 1.0, categoryPercentage: 1.0 },
                        y: { type: 'linear', display: true, position: 'left', beginAtZero: true, stacked: false },
                        y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, stacked: false }
                    }
                }
            });
        }

        // --- Graphique Téléphone - Temps ---
        var canvasTelDmt = getCanvas('prod-telephone-dmt', containerEl);
        if (canvasTelDmt && telRow) {
            createChart(canvasTelDmt, {
                type: 'bar',
                data: {
                    labels: ['DMT', 'DMC', 'DMPA'],
                    datasets: [
                        {
                            label: 'Temps (MM:SS)',
                            data: [parseFloat(telRow.dmt) || 0, parseFloat(telRow.dmc) || 0, parseFloat(telRow.dmpa) || 0],
                            backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'],
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    var val = context.parsed.y || 0;
                                    return context.dataset.label + ': ' + formatMmSs(val);
                                }
                            }
                        },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold' },
                            formatter: function (value) {
                                if (!value || value === 0) return '';
                                return formatMmSs(value);
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function (value) { return formatMmSs(value); }
                            }
                        }
                    }
                }
            });
        }

        // --- Graphique Courriels ---
        var canvasCour = getCanvas('prod-courriels-volumes', containerEl);
        if (canvasCour && courRow) {
            createChart(canvasCour, {
                type: 'bar',
                data: {
                    labels: ['Clôture', 'Envoi Watt', 'Rép. directe'],
                    datasets: [
                        {
                            label: 'Équipe',
                            data: [parseFloat(courRow.cloture) || 0, parseFloat(courRow.envoi_watt) || 0, parseFloat(courRow.reponse_directe) || 0],
                            backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'],
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold' },
                            formatter: function (value) { return (!value || value === 0) ? '' : Math.round(value); }
                        }
                    },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // --- Graphique WATT ---
        var canvasWatt = getCanvas('prod-watt', containerEl);
        if (canvasWatt && wattRow) {
            createChart(canvasWatt, {
                type: 'bar',
                data: {
                    labels: ['Clôture', 'Reroutage', 'Transfert'],
                    datasets: [
                        {
                            label: 'Équipe',
                            data: [parseFloat(wattRow.cloture_manuelle) || 0, parseFloat(wattRow.reroutage_individuel) || 0, parseFloat(wattRow.transfert_prod) || 0],
                            backgroundColor: ['#f59e0b', '#ef4444', '#ec4899'],
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold' },
                            formatter: function (value) { return (!value || value === 0) ? '' : (Math.round(value * 10) / 10); }
                        }
                    },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // --- Tableaux (UIComponents) ---
        var telTableContainer = containerEl.querySelector('#prod-tel-table-container');
        if (telTableContainer && telRow && UI && typeof UI.buildTelephoneTableHtml === 'function') {
            var offresList = (telRow && telRow.offres && Array.isArray(telRow.offres)) ? telRow.offres : [];
            var telHtml = UI.buildTelephoneTableHtml(offresList, telRow, null, null);
            if (telHtml) {
                telTableContainer.innerHTML = telHtml;
                telTableContainer.classList.remove('hidden');
                telTableContainer.classList.add('block');
            } else {
                telTableContainer.classList.add('hidden');
                telTableContainer.classList.remove('block');
            }
        }

        var wattTableContainer = containerEl.querySelector('#prod-watt-table-container');
        if (wattTableContainer && UI && typeof UI.buildWattTableHtml === 'function') {
            var wHtml = UI.buildWattTableHtml(wattDetail);
            if (wHtml) {
                wattTableContainer.innerHTML = wHtml;
                wattTableContainer.classList.remove('hidden');
                wattTableContainer.classList.add('block');
            } else {
                wattTableContainer.classList.add('hidden');
                wattTableContainer.classList.remove('block');
            }
        }

        if (UI && typeof UI.initCollapsibleTableToggles === 'function') {
            UI.initCollapsibleTableToggles(containerEl, false, ['prod-tel-table-container', 'prod-watt-table-container']);
        }
    }

    global.HQApp.ProductionChartsView = {
        renderProductionDashboard: renderProductionDashboard,
        destroy: destroy
    };
})(typeof window !== 'undefined' ? window : this);
