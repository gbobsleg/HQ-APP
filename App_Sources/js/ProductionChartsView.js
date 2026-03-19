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

    function toNumber(value) {
        var n = parseFloat(value);
        return isNaN(n) ? 0 : n;
    }

    function sum(values) {
        if (!values || !values.length) return 0;
        return values.reduce(function (acc, v) { return acc + toNumber(v); }, 0);
    }

    function clearEmptyState(canvas) {
        if (!canvas) return;
        var parent = canvas.parentElement;
        if (!parent) return;
        var marker = canvas.id || '';
        var existing = parent.querySelector('[data-empty-state-for="' + marker + '"]');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        canvas.classList.remove('hidden');
    }

    function showEmptyState(canvas, title, subtitle) {
        if (!canvas) return;
        var parent = canvas.parentElement;
        if (!parent) return;
        clearEmptyState(canvas);
        canvas.classList.add('hidden');

        var marker = canvas.id || '';
        var stateEl = document.createElement('div');
        stateEl.setAttribute('data-empty-state-for', marker);
        stateEl.className = 'h-full min-h-[220px] w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-center';
        stateEl.innerHTML =
            '<div class="text-center px-6 py-4">' +
                '<div class="mx-auto mb-3 w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400">' +
                    '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
                        '<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10"></path>' +
                    '</svg>' +
                '</div>' +
                '<p class="text-sm font-bold text-slate-600">' + (title || 'Aucune donnée') + '</p>' +
                '<p class="mt-1 text-xs text-slate-400">' + (subtitle || 'Aucune activité sur la période sélectionnée.') + '</p>' +
            '</div>';
        parent.appendChild(stateEl);
    }

    function isPlanningEmpty(planningValues) {
        return !planningValues || planningValues.length === 0 || sum(planningValues) <= 0;
    }

    function isTelephoneEmpty(telRow) {
        if (!telRow) return true;
        var total = sum([
            telRow.appels_traites,
            telRow.identifications,
            telRow.reponses_immediates,
            telRow.dmt,
            telRow.dmc,
            telRow.dmpa
        ]);
        return total <= 0;
    }

    function isCourrielsEmpty(courRow) {
        if (!courRow) return true;
        return sum([courRow.cloture, courRow.envoi_watt, courRow.reponse_directe]) <= 0;
    }

    function isWattEmpty(wattRow) {
        if (!wattRow) return true;
        return sum([wattRow.cloture_manuelle, wattRow.reroutage_individuel, wattRow.transfert_prod]) <= 0;
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
     * @param {{ production: { telephone: Array, courriels: Array, watt: Array, wattDetail: Array }, planning?: { etats: object } }} data
     */
    function renderProductionDashboard(containerEl, data) {
        destroy(containerEl);
        if (!containerEl || !ChartLib) return;

        data = data || {};
        var production = data.production || {};
        var planning = data.planning || {};
        var planningEtats = planning.etats || {};
        var telRow = (production.telephone && production.telephone[0]) ? production.telephone[0] : null;
        var courRow = (production.courriels && production.courriels[0]) ? production.courriels[0] : null;
        var wattRow = (production.watt && production.watt[0]) ? production.watt[0] : null;
        var wattDetail = Array.isArray(production.wattDetail) ? production.wattDetail : [];

        // --- Graphique Téléphone - Efficacité ---
        var canvasTel = getCanvas('prod-telephone', containerEl);
        if (canvasTel) {
            var telIsEmpty = isTelephoneEmpty(telRow);
            clearEmptyState(canvasTel);
            if (telIsEmpty) {
                showEmptyState(canvasTel, 'Aucune donnée', 'Aucun appel traité sur la période sélectionnée.');
            } else {
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
        }

        // --- Graphique Téléphone - Temps ---
        var canvasTelDmt = getCanvas('prod-telephone-dmt', containerEl);
        if (canvasTelDmt) {
            var telDmtIsEmpty = isTelephoneEmpty(telRow);
            clearEmptyState(canvasTelDmt);
            if (telDmtIsEmpty) {
                showEmptyState(canvasTelDmt, 'Aucune donnée', 'Aucun temps de traitement sur la période sélectionnée.');
            } else {
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
        }

        // --- Graphique Courriels ---
        var canvasCour = getCanvas('prod-courriels-volumes', containerEl);
        if (canvasCour) {
            var courIsEmpty = isCourrielsEmpty(courRow);
            clearEmptyState(canvasCour);
            if (courIsEmpty) {
                showEmptyState(canvasCour, 'Aucune donnée', 'Aucun courriel traité sur la période sélectionnée.');
            } else {
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
        }

        // --- Graphique WATT ---
        var canvasWatt = getCanvas('prod-watt', containerEl);
        if (canvasWatt) {
            var wattIsEmpty = isWattEmpty(wattRow);
            clearEmptyState(canvasWatt);
            if (wattIsEmpty) {
                showEmptyState(canvasWatt, 'Aucune donnée', 'Aucune action WATT sur la période sélectionnée.');
            } else {
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

        // --- Graphique Planning Production (heures par état) ---
        var planningLabels = [];
        var planningValues = [];
        Object.keys(planningEtats).forEach(function (etat) {
            var node = planningEtats[etat] || {};
            var v = typeof node.totalHours === 'number' && !isNaN(node.totalHours) ? node.totalHours : 0;
            if (v > 0) {
                planningLabels.push(etat);
                planningValues.push(v);
            }
        });
        var canvasPlanning = getCanvas('planningProdChart', containerEl);
        if (canvasPlanning) {
            var planningIsEmpty = isPlanningEmpty(planningValues);
            clearEmptyState(canvasPlanning);
            if (planningIsEmpty) {
                showEmptyState(canvasPlanning, 'Aucune donnée', 'Aucune heure planifiée sur la période sélectionnée.');
            } else {
            var palette = ['#4f46e5', '#22c55e', '#eab308', '#f97316', '#ec4899', '#06b6d4', '#0ea5e9', '#a855f7'];
            var totalPlanningHours = planningValues.reduce(function(a, b) { return a + b; }, 0);
            createChart(canvasPlanning, {
                type: 'bar',
                data: {
                    labels: planningLabels,
                    datasets: [{
                        label: 'Heures planifiées',
                        data: planningValues,
                        backgroundColor: planningLabels.map(function (_, idx) { return palette[idx % palette.length]; }),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { color: '#64748b', font: { size: 11, weight: '600' } }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Heures', color: '#94a3b8', font: { size: 11, weight: '600' } },
                            ticks: { color: '#64748b' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    var v = ctx.parsed.y || 0;
                                    var pct = totalPlanningHours > 0 ? ((v / totalPlanningHours) * 100).toFixed(1) : 0;
                                    return v.toFixed(2) + ' h (' + pct + '%)';
                                }
                            }
                        },
                        datalabels: {
                            anchor: 'end',
                            align: 'end',
                            color: '#0f172a',
                            font: { weight: 'bold', size: 10 },
                            formatter: function (v) {
                                if (!v || v === 0) return '';
                                var pct = totalPlanningHours > 0 ? Math.round((v / totalPlanningHours) * 100) : 0;
                                return v.toFixed(1) + ' h (' + pct + '%)';
                            }
                        }
                    }
                }
            });
            }
        }
    }

    global.HQApp.ProductionChartsView = {
        renderProductionDashboard: renderProductionDashboard,
        destroy: destroy
    };
})(typeof window !== 'undefined' ? window : this);
