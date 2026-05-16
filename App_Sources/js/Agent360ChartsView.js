/**
 * Agent360ChartsView.js - Graphiques Chart.js pour la Vue 360° (Qualité + Production).
 * Module agnostique : reçoit données + conteneur, dessine. IIFE, exposé sur window.HQApp.Agent360ChartsView.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    var ChartLib = typeof global.Chart !== 'undefined' ? global.Chart : null;
    var chartInstances = [];

    /**
     * Détruit toutes les instances Chart créées par ce module (évite superposition / fuites).
     * @param {HTMLElement} [containerEl] - Optionnel : si fourni, ne détruit que les graphiques dans ce conteneur.
     */
    function destroy(containerEl) {
        chartInstances.forEach(function (ch) {
            if (ch && typeof ch.destroy === 'function') {
                try { ch.destroy(); } catch (e) {}
            }
        });
        chartInstances = [];
    }

    var UI = global.HQApp && global.HQApp.UIComponents ? global.HQApp.UIComponents : null;
    var formatMmSs = UI && typeof UI.formatMmSs === 'function' ? UI.formatMmSs : function () { return '00:00'; };
    var formatDecimalHours = UI && typeof UI.formatDecimalHours === 'function'
        ? UI.formatDecimalHours
        : function (h) { return String(h); };

    var CHART_X_AXIS_TICKS = {
        autoSkip: false,
        maxRotation: 0,
        minRotation: 0,
        color: '#64748b',
        font: { size: 11, weight: '600' }
    };
    var CHART_Y_AXIS_TICKS = {
        color: '#64748b',
        font: { size: 11, weight: '600' }
    };
    var CHART_DATALABELS_FONT = { weight: 'bold', size: 11 };
    var CHART_LEGEND_LABELS = {
        color: '#64748b',
        font: { size: 11, weight: '600' },
        usePointStyle: true,
        boxWidth: 10
    };

    function yAxisTicks(callback) {
        var ticks = {
            color: CHART_Y_AXIS_TICKS.color,
            font: CHART_Y_AXIS_TICKS.font
        };
        if (callback) ticks.callback = callback;
        return ticks;
    }

    /**
     * Récupère un canvas par id. Ciblage relatif au conteneur pour éviter de résoudre un élément
     * d'une autre vue (ex. dashboard en arrière-plan) lorsque plusieurs instances partagent les mêmes IDs.
     * @param {string} id
     * @param {HTMLElement} [containerEl]
     * @returns {HTMLCanvasElement|null}
     */
    function getCanvas(id, containerEl) {
        if (containerEl) {
            return containerEl.querySelector('[id="' + id + '"]');
        }
        return document.getElementById(id);
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

    var COURRIELS_METRIC_KEYS = [
        'cloture', 'envoi_watt', 'reponses', 'ar_qualite', 'transfert', 'envoye_validation', 'refus'
    ];
    var COURRIELS_CHART_LABELS = [
        'Clôture', 'Envoi Watt', 'Réponses', 'AR Qualité', 'Transfert', 'Env. validation', 'Refus'
    ];
    var COURRIELS_CHART_COLORS = [
        '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'
    ];
    function emptyCourrielsRow() {
        var row = {};
        for (var i = 0; i < COURRIELS_METRIC_KEYS.length; i++) {
            row[COURRIELS_METRIC_KEYS[i]] = 0;
        }
        return row;
    }

    function courrielsMetricValues(row) {
        if (!row) return COURRIELS_METRIC_KEYS.map(function () { return 0; });
        return COURRIELS_METRIC_KEYS.map(function (key) { return parseFloat(row[key]) || 0; });
    }

    function isCourrielsEmpty(courRow) {
        if (!courRow) return true;
        return sum(courrielsMetricValues(courRow)) <= 0;
    }

    function isWattEmpty(wattRow) {
        if (!wattRow) return true;
        return sum([wattRow.cloture_manuelle, wattRow.reroutage_individuel, wattRow.transfert_prod]) <= 0;
    }

    /**
     * Crée un graphique en détruisant l'éventuelle instance existante sur ce canvas.
     */
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
     * Dessine les graphiques 360° : historique Qualité (Line) + KPIs Production (Bar) + Planning (Doughnut).
     * @param {HTMLElement} containerEl - Conteneur contenant les canvas (ids: agent360-qualite, agent360-telephone, agent360-courriels-volumes, agent360-watt, planning360Chart)
     * @param {object} data - { qualiteHistory: [], production: { telephone: [], courriels: [], watt: [] }, planning?: { etats: object }, agentId?: number }
     */
    function renderAgent360(containerEl, data) {
        destroy(containerEl);
        if (!containerEl || !ChartLib) return;

        var expandedByDefault = containerEl.getAttribute('data-agent360-tables-default') !== 'collapsed';

        data = data || {};
        var qualiteHistory = data.qualiteHistory || [];
        var production = data.production || {};
        var planning = data.planning || {};
        var planningEtats = planning.etats || {};
        var courriels = production.courriels || [];
        var watt = production.watt || [];
        var telAll = production.telephone || [];
        var telRowGlobal = data.agentId != null
            ? (telAll.find(function (r) { return Number(r.agentId) === Number(data.agentId); }) || null)
            : (telAll[0] || null);

        // ---- Graphique Qualité ----
        // Barres : note de chaque évaluation ; Ligne : moyenne de la campagne.
        var qualAgg = {};
        var qualAvgByIndex = [];
        var labelsQualite = [];
        var notesEval = [];
        for (var qi = 0; qi < qualiteHistory.length; qi++) {
            var q = qualiteHistory[qi];
            if (!q) continue;
            var label = q.campaignName || q.periodStart || '';
            if (!label) continue;
            var n = parseFloat(q.note);
            if (isNaN(n)) continue;
            labelsQualite.push(label);
            notesEval.push(n);
            if (!qualAgg[label]) {
                qualAgg[label] = { sum: 0, count: 0 };
            }
            qualAgg[label].sum += n;
            qualAgg[label].count += 1;
        }
        for (var qi2 = 0; qi2 < labelsQualite.length; qi2++) {
            var lbl = labelsQualite[qi2];
            var a = qualAgg[lbl];
            var avg = (a && a.count) ? (a.sum / a.count) : 0;
            qualAvgByIndex.push(avg);
        }
        var canvasQualite = getCanvas('agent360-qualite', containerEl);
        if (canvasQualite) {
            var isQualiteEmpty = labelsQualite.length === 0 || sum(notesEval) <= 0;
            clearEmptyState(canvasQualite);
            if (isQualiteEmpty) {
                showEmptyState(canvasQualite, 'Aucune évaluation', 'Aucune note qualité sur la période sélectionnée.');
            } else {
                createChart(canvasQualite, {
                    type: 'bar',
                    data: {
                        labels: labelsQualite,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Note évaluation',
                                data: notesEval,
                                backgroundColor: '#6366f1',
                                borderRadius: 4,
                                order: 1
                            },
                            {
                                type: 'line',
                                label: 'Moyenne campagne',
                                data: qualAvgByIndex,
                                borderColor: '#ef4444',
                                backgroundColor: '#ef4444',
                                borderWidth: 3,
                                tension: 0.2,
                                order: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            datalabels: {
                                color: '#6366f1',
                                align: 'top',
                                font: CHART_DATALABELS_FONT,
                                formatter: function(v, ctx) {
                                    if (!v || v === 0) return '';
                                    if (ctx.datasetIndex === 1) {
                                        return v.toFixed(2);
                                    }
                                    return v.toFixed(2);
                                }
                            }
                        },
                        scales: {
                            x: { ticks: CHART_X_AXIS_TICKS },
                            y: { min: 0, max: 10, ticks: yAxisTicks() }
                        }
                    }
                });
            }
        }

        // ---- Graphique Planning (Doughnut) ----
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
        var canvasPlanning = getCanvas('planning360Chart', containerEl);
        if (canvasPlanning) {
            var planningIsEmpty = isPlanningEmpty(planningValues);
            clearEmptyState(canvasPlanning);
            if (planningIsEmpty) {
                showEmptyState(canvasPlanning, 'Aucune donnée', 'Aucune heure planifiée sur la période sélectionnée.');
            } else {
            var palette = ['#4f46e5', '#22c55e', '#eab308', '#f97316', '#ec4899', '#06b6d4', '#0ea5e9', '#a855f7'];
            var totalPlanningHours = planningValues.reduce(function(a, b) { return a + b; }, 0);
            createChart(canvasPlanning, {
                type: 'doughnut',
                data: {
                    labels: planningLabels,
                    datasets: [{
                        label: 'Heures planifiées',
                        data: planningValues,
                        backgroundColor: planningLabels.map(function (_, idx) { return palette[idx % palette.length]; }),
                        borderWidth: 1,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: CHART_LEGEND_LABELS
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    var v = context.parsed || 0;
                                    var pct = totalPlanningHours > 0 ? ((v / totalPlanningHours) * 100).toFixed(1) : 0;
                                    return context.label + ' : ' + formatDecimalHours(v) + ' (' + pct + '%)';
                                }
                            }
                        },
                        datalabels: {
                            color: '#0f172a',
                            font: CHART_DATALABELS_FONT,
                            textAlign: 'center',
                            formatter: function (v) {
                                if (!v || v === 0) return '';
                                var pct = totalPlanningHours > 0 ? Math.round((v / totalPlanningHours) * 100) : 0;
                                return formatDecimalHours(v) + '\n(' + pct + '%)';
                            }
                        }
                    }
                }
            });
            }
        }

        // ---- Tableau Planning détail par état ----
        var planningTableContainer = containerEl ? containerEl.querySelector('#agent360-planning-table-container') : null;
        if (planningTableContainer) {
            if (planningLabels.length > 0) {
                var tableHtml = '<div class="flex flex-col h-full">';
                tableHtml += '<h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Détail Planning</h3>';
                tableHtml += '<div class="flex-1 overflow-y-auto min-h-0 pr-2">';
                tableHtml += '<table class="w-full text-left text-sm">';
                tableHtml += '<thead class="sticky top-0 bg-white z-10">';
                tableHtml += '<tr>';
                tableHtml += '<th class="pb-2 font-bold text-slate-500 border-b border-slate-100">État</th>';
                tableHtml += '<th class="pb-2 font-bold text-slate-500 border-b border-slate-100 text-right">Heures</th>';
                tableHtml += '<th class="pb-2 font-bold text-slate-500 border-b border-slate-100 text-right">%</th>';
                tableHtml += '</tr>';
                tableHtml += '</thead>';
                tableHtml += '<tbody class="divide-y divide-slate-50">';
                
                var planningData = [];
                for (var i = 0; i < planningLabels.length; i++) {
                    planningData.push({
                        label: planningLabels[i],
                        value: planningValues[i]
                    });
                }
                planningData.sort(function(a, b) { return b.value - a.value; });
                
                planningData.forEach(function(item) {
                    var pct = totalPlanningHours > 0 ? ((item.value / totalPlanningHours) * 100).toFixed(1) : 0;
                    tableHtml += '<tr class="hover:bg-slate-50 transition-colors">';
                    tableHtml += '<td class="py-2 font-medium text-slate-700">' + item.label + '</td>';
                    tableHtml += '<td class="py-2 text-right font-bold text-indigo-600">' + formatDecimalHours(item.value) + '</td>';
                    tableHtml += '<td class="py-2 text-right text-slate-500">' + pct + '%</td>';
                    tableHtml += '</tr>';
                });
                
                tableHtml += '</tbody>';
                tableHtml += '<tfoot class="sticky bottom-0 bg-white z-10">';
                tableHtml += '<tr>';
                tableHtml += '<td class="pt-2 font-black text-slate-800 border-t border-slate-100">Total</td>';
                tableHtml += '<td class="pt-2 text-right font-black text-indigo-600 border-t border-slate-100">' + formatDecimalHours(totalPlanningHours) + '</td>';
                tableHtml += '<td class="pt-2 text-right font-black text-slate-800 border-t border-slate-100">100%</td>';
                tableHtml += '</tr>';
                tableHtml += '</tfoot>';
                tableHtml += '</table>';
                tableHtml += '</div></div>';
                
                planningTableContainer.innerHTML = tableHtml;
                planningTableContainer.classList.remove('hidden');
                planningTableContainer.classList.add('flex');
            } else {
                planningTableContainer.classList.add('hidden');
                planningTableContainer.classList.remove('flex');
            }
        }

        // ---- Filtres par offre (section statique dans le DOM) ----
        var filtersContainer = containerEl.querySelector('#agent360-tel-filters');
        // Conserve les offres sélectionnées entre les refresh (changement de période).
        // Le conteneur DOM persiste pendant `view.destroy(container)` donc on peut stocker un attribut.
        var currentSelectedOffres = ['GLOBAL'];
        try {
            if (containerEl && typeof containerEl.getAttribute === 'function') {
                var savedOffres = containerEl.getAttribute('data-agent360-selected-offres');
                if (savedOffres) {
                    var parsed = JSON.parse(savedOffres);
                    if (Array.isArray(parsed) && parsed.length > 0) currentSelectedOffres = parsed;
                }
            }
        } catch (e) {}

        if (filtersContainer) {
            filtersContainer.innerHTML = '';
            var offresUniques = ['GLOBAL'];
            if (telRowGlobal && telRowGlobal.offres && Array.isArray(telRowGlobal.offres)) {
                telRowGlobal.offres.slice().sort(function(a, b) {
                    return (b.appels_traites || 0) - (a.appels_traites || 0);
                }).forEach(function(o) {
                    if (o.offre && offresUniques.indexOf(o.offre) === -1) offresUniques.push(o.offre);
                });
            }
            // Épurer les offres sauvegardées qui n'existent plus dans le périmètre courant.
            var stillValid = currentSelectedOffres.filter(function(o) { return offresUniques.indexOf(o) !== -1; });
            if (stillValid.length === 0) stillValid = ['GLOBAL'];
            currentSelectedOffres = stillValid;
            if (containerEl && typeof containerEl.setAttribute === 'function') {
                containerEl.setAttribute('data-agent360-selected-offres', JSON.stringify(currentSelectedOffres));
            }

            var CSS_ACTIVE   = 'px-2 py-0.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap bg-blue-600 text-white border-blue-600';
            var CSS_INACTIVE = 'px-2 py-0.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap bg-white text-gray-600 border-gray-300 hover:bg-gray-50';

            // Met à jour le style de tous les boutons selon la sélection courante.
            var syncButtonStyles = function() {
                Array.from(filtersContainer.children).forEach(function(btn) {
                    var o = btn.getAttribute('data-offre');
                    btn.className = currentSelectedOffres.indexOf(o) !== -1 ? CSS_ACTIVE : CSS_INACTIVE;
                });
            };

            offresUniques.forEach(function(offre) {
                var btn = document.createElement('button');
                var isGlobal = offre === 'GLOBAL';
                btn.className = currentSelectedOffres.indexOf(offre) !== -1 ? CSS_ACTIVE : CSS_INACTIVE;
                btn.textContent = isGlobal ? 'Global' : offre;
                btn.setAttribute('data-offre', offre);
                // Les boutons sont recréés à chaque render (filtersContainer.innerHTML = ''), donc
                // chaque bouton n'a qu'un seul listener — pas de risque d'accumulation.
                btn.onclick = function() {
                    if (isGlobal) {
                        currentSelectedOffres = ['GLOBAL'];
                    } else {
                        var idx = currentSelectedOffres.indexOf(offre);
                        // Retirer GLOBAL si une offre individuelle est sélectionnée.
                        currentSelectedOffres = currentSelectedOffres.filter(function(o) { return o !== 'GLOBAL'; });
                        if (idx === -1) {
                            currentSelectedOffres.push(offre);
                        } else {
                            currentSelectedOffres.splice(idx, 1);
                        }
                        // Si tout est désélectionné, retomber sur GLOBAL.
                        if (currentSelectedOffres.length === 0) currentSelectedOffres = ['GLOBAL'];
                    }
                    if (containerEl && typeof containerEl.setAttribute === 'function') {
                        containerEl.setAttribute('data-agent360-selected-offres', JSON.stringify(currentSelectedOffres));
                    }
                    syncButtonStyles();
                    renderTelephoneSection(currentSelectedOffres);
                };
                filtersContainer.appendChild(btn);
            });

            // Note explicative sous les capsules (valable pour graphiques et table)
            var filterBar = filtersContainer.parentElement;
            if (filterBar) {
                var existingNote = filterBar.querySelector('.tel-region-note');
                if (existingNote) existingNote.remove();
                var offresLabelForNote = offresUniques.filter(function(o) { return o !== 'GLOBAL'; }).join(', ');
                if (offresLabelForNote) {
                    var noteEl = document.createElement('p');
                    noteEl.className = 'tel-region-note w-full text-xs text-slate-400 italic mt-1';
                    noteEl.innerHTML = 'Les comparaisons (%) sont calculées par rapport à la moyenne régionale des agents travaillant sur les mêmes offres\u00a0: <strong>' + offresLabelForNote + '</strong>.';
                    filterBar.appendChild(noteEl);
                }
            }
        }

        // ---- Calcul des moyennes régionales par offre (table + graphiques) ----
        // acc[offre] = { dmtSum, dmtW, ..., appelsSum, agentCount }
        var emptyAcc = function() {
            return { dmtSum:0, dmtW:0, dmcSum:0, dmcW:0, dmpaSum:0, dmpaW:0, idSum:0, idW:0, repSum:0, repW:0, appelsSum:0, agentCount:0 };
        };
        var regionAcc = { GLOBAL: emptyAcc() };
        telAll.forEach(function(agent) {
            var gv = agent.appels_traites || 0;
            if (gv > 0) {
                var ra = regionAcc.GLOBAL;
                ra.dmtSum += (agent.dmt || 0) * gv; ra.dmtW += gv;
                ra.dmcSum += (agent.dmc || 0) * gv; ra.dmcW += gv;
                ra.dmpaSum += (agent.dmpa || 0) * gv; ra.dmpaW += gv;
                ra.idSum  += (agent.identifications || 0) * gv; ra.idW += gv;
                ra.repSum += (agent.reponses_immediates || 0) * gv; ra.repW += gv;
                ra.appelsSum += gv; ra.agentCount++;
            }
            if (agent.offres) {
                agent.offres.forEach(function(o) {
                    var ov = o.appels_traites || 0;
                    if (ov <= 0) return;
                    if (!regionAcc[o.offre]) regionAcc[o.offre] = emptyAcc();
                    var ro = regionAcc[o.offre];
                    ro.dmtSum += (o.dmt || 0) * ov; ro.dmtW += ov;
                    ro.dmcSum += (o.dmc || 0) * ov; ro.dmcW += ov;
                    ro.dmpaSum += (o.dmpa || 0) * ov; ro.dmpaW += ov;
                    ro.idSum  += (o.identifications || 0) * ov; ro.idW += ov;
                    ro.repSum += (o.reponses_immediates || 0) * ov; ro.repW += ov;
                    ro.appelsSum += ov; ro.agentCount++;
                });
            }
        });
        // Convertit un accumulateur brut en objet de moyennes
        var accToAvg = function(acc) {
            return {
                appels_traites:      acc.agentCount > 0 ? acc.appelsSum / acc.agentCount : 0,
                dmt:  acc.dmtW  > 0 ? acc.dmtSum  / acc.dmtW  : 0,
                dmc:  acc.dmcW  > 0 ? acc.dmcSum  / acc.dmcW  : 0,
                dmpa: acc.dmpaW > 0 ? acc.dmpaSum / acc.dmpaW : 0,
                identifications:     acc.idW  > 0 ? acc.idSum  / acc.idW  : 0,
                reponses_immediates: acc.repW > 0 ? acc.repSum / acc.repW : 0
            };
        };

        // Combine les accumulateurs d'un tableau d'offres (pour GLOBAL restreint, utilisé par les graphiques)
        var combineAccForOffres = function(offreNames) {
            var combined = emptyAcc();
            offreNames.forEach(function(name) {
                var a = regionAcc[name];
                if (!a) return;
                combined.dmtSum  += a.dmtSum;  combined.dmtW  += a.dmtW;
                combined.dmcSum  += a.dmcSum;  combined.dmcW  += a.dmcW;
                combined.dmpaSum += a.dmpaSum; combined.dmpaW += a.dmpaW;
                combined.idSum   += a.idSum;   combined.idW   += a.idW;
                combined.repSum  += a.repSum;  combined.repW  += a.repW;
                combined.appelsSum += a.appelsSum; combined.agentCount += a.agentCount;
            });
            return combined;
        };

        // ---- Tableau de détail par offre (ciblage relatif au conteneur ; fail-safe + défensif) ----
        var tableContainer = containerEl ? containerEl.querySelector('#agent360-tel-table-container') : null;
        if (tableContainer) {
            var offresList = (telRowGlobal && Array.isArray(telRowGlobal.offres)) ? telRowGlobal.offres : [];
            if (telRowGlobal) {
                try {
                    var telTableHtml = UI && UI.buildTelephoneTableHtml
                        ? UI.buildTelephoneTableHtml(offresList, telRowGlobal, regionAcc, accToAvg)
                        : '';
                    if (telTableHtml) {
                        tableContainer.innerHTML = telTableHtml;
                        tableContainer.classList.remove('hidden');
                        tableContainer.classList.add('block');
                    } else {
                        tableContainer.classList.add('hidden');
                        tableContainer.classList.remove('block');
                    }
                } catch (e) {
                    console.error('Agent360 table Téléphone:', e);
                    tableContainer.innerHTML = '<div class="px-4 py-3 border-b border-gray-100"><p class="text-xs font-black text-slate-400 uppercase tracking-widest">Téléphone - Détail par offre</p></div><div class="text-xs text-rose-500 p-2">Erreur lors de la génération des détails.</div>';
                    tableContainer.classList.remove('hidden');
                    tableContainer.classList.add('block');
                }
            } else {
                tableContainer.classList.add('hidden');
                tableContainer.classList.remove('block');
            }
        }

        // Construit un telRow synthétique en agrégeant plusieurs sous-lignes offre.
        // Les compteurs bruts (appels, transferts, consultations, rona) sont sommés.
        // Les métriques de temps et taux (dmt, dmc, dmmg, dmpa, identifications, reponses_immediates)
        // sont des moyennes pondérées par appels_traites, comme le fait StatsRepository.
        function buildTelRowForOffres(telRowGlobal, offreNames) {
            var isGlobal = !offreNames || offreNames.length === 0
                || (offreNames.length === 1 && offreNames[0] === 'GLOBAL');
            if (isGlobal) return telRowGlobal;

            var selected = (telRowGlobal && Array.isArray(telRowGlobal.offres))
                ? telRowGlobal.offres.filter(function(o) { return o && offreNames.indexOf(o.offre) !== -1; })
                : [];
            if (selected.length === 0) return null;
            if (selected.length === 1) return selected[0];

            var totalVol = 0;
            var sums  = { appels_traites: 0, transferts: 0, consultations: 0, rona: 0 };
            var wSums = { dmt: 0, dmc: 0, dmmg: 0, dmpa: 0, identifications: 0, reponses_immediates: 0 };

            selected.forEach(function(o) {
                var vol = parseFloat(o.appels_traites) || 0;
                totalVol += vol;
                Object.keys(sums).forEach(function(k) { sums[k] += parseFloat(o[k]) || 0; });
                Object.keys(wSums).forEach(function(k) { wSums[k] += (parseFloat(o[k]) || 0) * vol; });
            });

            var out = Object.assign({}, telRowGlobal, sums);
            Object.keys(wSums).forEach(function(k) {
                out[k] = totalVol > 0 ? wSums[k] / totalVol : 0;
            });
            out.offres = selected;
            return out;
        }

        // Fonction pour filtrer et afficher les données selon les offres sélectionnées
        function renderTelephoneSection(selectedOffres) {
            var telAll = production.telephone || [];

            // Récupérer les données de l'agent en premier (nécessaire pour le calcul de la moyenne)
            var telRowGlobal = data.agentId != null
                ? (telAll.find(function (r) { return Number(r.agentId) === Number(data.agentId); }) || null)
                : (telAll[0] || null);

            var isGlobal = !selectedOffres || selectedOffres.length === 0
                || (selectedOffres.length === 1 && selectedOffres[0] === 'GLOBAL');

            // Moyenne régionale : périmètre restreint aux offres sélectionnées (ou offres de l'agent si GLOBAL)
            var avgTel;
            if (isGlobal) {
                var offresForAvg = (telRowGlobal && Array.isArray(telRowGlobal.offres)) ? telRowGlobal.offres : [];
                var agentOffreNamesForAvg = offresForAvg.filter(function(o) { return o && typeof o.offre === 'string'; }).map(function(o) { return o.offre; });
                avgTel = agentOffreNamesForAvg.length > 0
                    ? accToAvg(combineAccForOffres(agentOffreNamesForAvg))
                    : accToAvg(regionAcc.GLOBAL);
            } else {
                // combineAccForOffres accepte déjà un tableau de noms d'offres
                avgTel = accToAvg(combineAccForOffres(selectedOffres));
            }

            var telRow = telRowGlobal
                ? buildTelRowForOffres(telRowGlobal, selectedOffres)
                : null;

            // Si pas de données pour cette sélection, utiliser des valeurs par défaut 0
            if (!telRow) {
                telRow = { appels_traites: 0, identifications: 0, reponses_immediates: 0, dmt: 0, dmc: 0, dmmg: 0, dmpa: 0, transferts: 0, consultations: 0, rona: 0 };
            }

            // Libellé de filtre pour les titres
            var filterLabel = isGlobal ? '' : selectedOffres.join(', ');

            // Mise à jour des titres des graphiques
            var telSection = containerEl ? containerEl.querySelector('#agent360-telephone') : null;
            if (telSection) {
                var container = telSection.closest('.bg-white');
                if (container) {
                    var titleEl = container.querySelector('h3');
                    if (titleEl) {
                        var baseTitle = 'Téléphone - Efficacité';
                        titleEl.textContent = filterLabel ? baseTitle + ' (' + filterLabel + ')' : baseTitle;
                    }
                }
            }
            
            var telDmtSection = containerEl ? containerEl.querySelector('#agent360-telephone-dmt') : null;
            if (telDmtSection) {
                var dmtContainer = telDmtSection.closest('.bg-white');
                if (dmtContainer) {
                    var dmtTitleEl = dmtContainer.querySelector('h3');
                    if (dmtTitleEl) {
                        var baseDmtTitle = 'Téléphone - Temps (s)';
                        dmtTitleEl.textContent = filterLabel ? baseDmtTitle + ' (' + filterLabel + ')' : baseDmtTitle;
                    }
                }
            }

            var canvasTel = getCanvas('agent360-telephone', containerEl);
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
                                    label: 'Agent (Volume)',
                                    data: [
                                        parseFloat(telRow.appels_traites) || 0,
                                        null,
                                        null
                                    ],
                                    backgroundColor: '#06b6d4',
                                    borderRadius: 4,
                                    yAxisID: 'y',
                                    skipNull: true,
                                    order: 2
                                },
                                {
                                    label: 'Agent (Taux %)',
                                    data: [
                                        null,
                                        (parseFloat(telRow.identifications) || 0) * 100,
                                        (parseFloat(telRow.reponses_immediates) || 0) * 100
                                    ],
                                    backgroundColor: ['transparent', '#8b5cf6', '#3b82f6'],
                                    borderRadius: 4,
                                    yAxisID: 'y1',
                                    skipNull: true,
                                    order: 2
                                },
                                {
                                    type: 'line',
                                    label: 'Moy. Région (Volume)',
                                    data: [
                                        null,
                                        null,
                                        null
                                    ],
                                    borderColor: '#ef4444',
                                    backgroundColor: '#ef4444',
                                    borderWidth: 3,
                                    pointStyle: 'line',
                                    pointRadius: 25,
                                    pointHoverRadius: 25,
                                    showLine: false,
                                    yAxisID: 'y',
                                    order: 1,
                                    datalabels: {
                                        align: 'right',
                                        anchor: 'center',
                                        offset: 4,
                                        color: '#ef4444',
                                        font: Object.assign({}, CHART_DATALABELS_FONT, { color: '#ef4444' }),
                                        backgroundColor: 'rgba(255,255,255,0.9)',
                                        borderRadius: 3,
                                        padding: { left: 3, right: 3, top: 1, bottom: 1 },
                                        formatter: function(value) {
                                            if (!value || value === 0) return '';
                                            return Math.round(value);
                                        }
                                    }
                                },
                                {
                                    type: 'line',
                                    label: 'Moy. Région (Taux %)',
                                    data: [
                                        null,
                                        (avgTel.identifications || 0) * 100,
                                        (avgTel.reponses_immediates || 0) * 100
                                    ],
                                    borderColor: '#ef4444',
                                    backgroundColor: '#ef4444',
                                    borderWidth: 3,
                                    pointStyle: 'line',
                                    pointRadius: 25,
                                    pointHoverRadius: 25,
                                    showLine: false,
                                    yAxisID: 'y1',
                                    order: 1,
                                    datalabels: {
                                        align: 'right',
                                        anchor: 'center',
                                        offset: 4,
                                        color: '#ef4444',
                                        font: Object.assign({}, CHART_DATALABELS_FONT, { color: '#ef4444' }),
                                        backgroundColor: 'rgba(255,255,255,0.9)',
                                        borderRadius: 3,
                                        padding: { left: 3, right: 3, top: 1, bottom: 1 },
                                        formatter: function(value) {
                                            if (!value || value === 0) return '';
                                            return Math.round(value) + '%';
                                        }
                                    }
                                }
                            ]
                        },
                        options: { 
                            responsive: true, 
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                datalabels: {
                                    color: '#fff',
                                    font: CHART_DATALABELS_FONT,
                                    anchor: function(context) {
                                        return context.dataset.type === 'line' ? 'center' : 'start';
                                    },
                                    align: function(context) {
                                        return context.dataset.type === 'line' ? 'right' : 'end';
                                    },
                                    offset: function(context) {
                                        return context.dataset.type === 'line' ? 4 : 4;
                                    },
                                    clamp: true,
                                    formatter: function(value, context) {
                                        if (!value || value === 0 || context.dataset.type === 'line') return '';
                                        if (context.datasetIndex === 1) return Math.round(value) + '%';
                                        return Math.round(value);
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    stacked: false,
                                    barPercentage: 1.0,
                                    categoryPercentage: 1.0,
                                    ticks: CHART_X_AXIS_TICKS
                                },
                                y: {
                                    type: 'linear',
                                    display: true,
                                    position: 'left',
                                    beginAtZero: true,
                                    stacked: false,
                                    ticks: yAxisTicks()
                                },
                                y1: {
                                    type: 'linear',
                                    display: true,
                                    position: 'right',
                                    min: 0,
                                    max: 100,
                                    grid: { drawOnChartArea: false },
                                    stacked: false,
                                    ticks: yAxisTicks()
                                }
                            }
                        }
                    });
                }
            }

            var canvasTelDmt = getCanvas('agent360-telephone-dmt', containerEl);
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
                                    data: [
                                        parseFloat(telRow.dmt) || 0,
                                        parseFloat(telRow.dmc) || 0,
                                        parseFloat(telRow.dmpa) || 0
                                    ],
                                    backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6'],
                                    borderRadius: 4,
                                    order: 1
                                },
                                {
                                    type: 'line',
                                    label: 'Moy. Région',
                                    data: [
                                        avgTel.dmt || 0,
                                        avgTel.dmc || 0,
                                        avgTel.dmpa || 0
                                    ],
                                    borderColor: '#ef4444',
                                    backgroundColor: '#ef4444',
                                    borderWidth: 3,
                                    pointStyle: 'line',
                                    pointRadius: 28,
                                    pointHoverRadius: 28,
                                    showLine: false,
                                    clip: false,
                                    order: 0
                                }
                            ]
                        },
                        options: { 
                            responsive: true, 
                            maintainAspectRatio: false,
                            plugins: {
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            var val = context.parsed.y || 0;
                                            return context.dataset.label + ': ' + formatMmSs(val);
                                        }
                                    }
                                },
                                datalabels: {
                                    color: function(context) {
                                        return context.dataset.order === 0 ? '#ef4444' : '#fff';
                                    },
                                    align: function(context) {
                                        return context.dataset.order === 0 ? 'right' : 'end';
                                    },
                                    anchor: function(context) {
                                        return context.dataset.order === 0 ? 'center' : 'start';
                                    },
                                    offset: function(context) {
                                        return context.dataset.order === 0 ? 4 : 4;
                                    },
                                    clamp: true,
                                    backgroundColor: function(context) {
                                        return context.dataset.order === 0 ? 'rgba(255,255,255,0.9)' : null;
                                    },
                                    borderRadius: function(context) {
                                        return context.dataset.order === 0 ? 3 : 0;
                                    },
                                    padding: function(context) {
                                        return context.dataset.order === 0
                                            ? { left: 3, right: 3, top: 1, bottom: 1 }
                                            : 0;
                                    },
                                    font: function(context) {
                                        return context.dataset.order === 0
                                            ? Object.assign({}, CHART_DATALABELS_FONT, { color: '#ef4444' })
                                            : CHART_DATALABELS_FONT;
                                    },
                                    formatter: function(value, context) {
                                        if (!value || value === 0) return '';
                                        return formatMmSs(value);
                                    }
                                },
                                legend: { display: false }
                            },
                            scales: {
                                x: { stacked: false, ticks: CHART_X_AXIS_TICKS },
                                y: {
                                    stacked: false,
                                    beginAtZero: true,
                                    ticks: yAxisTicks(function (value) {
                                        return formatMmSs(value);
                                    })
                                }
                            }
                        }
                    });
                }
            }

            var badgesEl = containerEl ? containerEl.querySelector('#agent360-tel-badges') : null;
            if (badgesEl) {
                badgesEl.innerHTML = 
                    '<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded">Transferts: ' + (parseFloat(telRow.transferts) || 0) + '</span>' +
                    '<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded">Consultations: ' + (parseFloat(telRow.consultations) || 0) + '</span>' +
                    '<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded">RONA: ' + (parseFloat(telRow.rona) || 0) + '</span>';
            }

            var dmtBadgesEl = containerEl ? containerEl.querySelector('#agent360-tel-dmt-badges') : null;
            if (dmtBadgesEl) {
                dmtBadgesEl.innerHTML = 
                    '<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded" title="Durée Moyenne de Mise en Garde (Attente)">DMMG: ' + formatMmSs(parseFloat(telRow.dmmg) || 0) + '</span>';
            }
        } // Fin renderTelephoneSection

        renderTelephoneSection(currentSelectedOffres);

        // --- Courriels ---
        var courRow = data.agentId != null
            ? (courriels.find(function (r) { return Number(r.agentId) === Number(data.agentId); }) || null)
            : (courriels[0] || null);
        if (!courRow) {
            courRow = emptyCourrielsRow();
        }

        var canvasCour = getCanvas('agent360-courriels-volumes', containerEl);
        if (canvasCour) {
            var courIsEmpty = isCourrielsEmpty(courRow);
            clearEmptyState(canvasCour);
            if (courIsEmpty) {
                showEmptyState(canvasCour, 'Aucune donnée', 'Aucun courriel traité sur la période sélectionnée.');
            } else {
                createChart(canvasCour, {
                    type: 'bar',
                    data: {
                        labels: COURRIELS_CHART_LABELS,
                        datasets: [
                            {
                                label: 'Agent',
                                data: courrielsMetricValues(courRow),
                                backgroundColor: COURRIELS_CHART_COLORS,
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
                                font: CHART_DATALABELS_FONT,
                                formatter: function (value) {
                                    if (!value || value === 0) return '';
                                    return Math.round(value);
                                }
                            }
                        },
                        scales: {
                            x: { ticks: CHART_X_AXIS_TICKS },
                            y: { beginAtZero: true, ticks: yAxisTicks() }
                        }
                    }
                });
            }
        }

        // ---- Tableau Courriels – détail par jour ----
        var courTableContainer = containerEl ? containerEl.querySelector('#agent360-courriels-table-container') : null;
        if (courTableContainer) {
            var agentIdNumCour = data.agentId != null ? Number(data.agentId) : NaN;
            var courrielsDetail = production.courrielsDetail || [];
            var agentCourRows = !isNaN(agentIdNumCour)
                ? courrielsDetail.filter(function (r) { return r && Number(r.agentId) === agentIdNumCour; })
                : courrielsDetail;
            var courTableHtml = UI && typeof UI.buildCourrielsDetailTableHtml === 'function'
                ? UI.buildCourrielsDetailTableHtml(agentCourRows)
                : '';
            if (courTableHtml) {
                courTableContainer.innerHTML = courTableHtml;
                courTableContainer.classList.remove('hidden');
                courTableContainer.classList.add('block');
            } else {
                courTableContainer.classList.add('hidden');
                courTableContainer.classList.remove('block');
            }
        }

        var wattRow = data.agentId != null
            ? (watt.find(function (r) { return Number(r.agentId) === Number(data.agentId); }) || null)
            : (watt[0] || null);
        if (!wattRow) {
            wattRow = { cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
        }
        var avgWatt = { cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
        if (watt.length > 0) {
            var cTot = 0, rTot = 0, tTot = 0;
            for (var wi = 0; wi < watt.length; wi++) {
                cTot += parseFloat(watt[wi].cloture_manuelle) || 0;
                rTot += parseFloat(watt[wi].reroutage_individuel) || 0;
                tTot += parseFloat(watt[wi].transfert_prod) || 0;
            }
            avgWatt.cloture_manuelle = Math.round(cTot / watt.length);
            avgWatt.reroutage_individuel = Math.round(rTot / watt.length);
            avgWatt.transfert_prod = Math.round(tTot / watt.length);
        }
        var canvasWatt = getCanvas('agent360-watt', containerEl);
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
                                label: 'Agent',
                                data: [
                                    parseFloat(wattRow.cloture_manuelle) || 0,
                                    parseFloat(wattRow.reroutage_individuel) || 0,
                                    parseFloat(wattRow.transfert_prod) || 0
                                ],
                                backgroundColor: ['#f59e0b', '#ef4444', '#ec4899'],
                                borderRadius: 4,
                                order: 1
                            },
                            {
                                type: 'line',
                                label: 'Moy. R\u00e9gion',
                                data: [avgWatt.cloture_manuelle, avgWatt.reroutage_individuel, avgWatt.transfert_prod],
                                borderColor: '#ef4444',
                                backgroundColor: '#ef4444',
                                borderWidth: 3,
                                pointStyle: 'line',
                                pointRadius: 28,
                                pointHoverRadius: 28,
                                showLine: false,
                                clip: false,
                                order: 0
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            datalabels: {
                                font: function(context) {
                                    return context.dataset.order === 0
                                        ? Object.assign({}, CHART_DATALABELS_FONT, { color: '#ef4444' })
                                        : CHART_DATALABELS_FONT;
                                },
                                color: function(context) {
                                    return context.dataset.order === 0 ? '#ef4444' : '#fff';
                                },
                                align: function(context) {
                                    return context.dataset.order === 0 ? 'right' : 'end';
                                },
                                anchor: function(context) {
                                    return context.dataset.order === 0 ? 'center' : 'start';
                                },
                                offset: function(context) {
                                    return context.dataset.order === 0 ? 4 : 4;
                                },
                                clamp: true,
                                backgroundColor: function(context) {
                                    return context.dataset.order === 0 ? 'rgba(255,255,255,0.9)' : null;
                                },
                                borderRadius: function(context) {
                                    return context.dataset.order === 0 ? 3 : 0;
                                },
                                padding: function(context) {
                                    return context.dataset.order === 0
                                        ? { left: 3, right: 3, top: 1, bottom: 1 }
                                        : 0;
                                },
                                formatter: function(value, ctx) {
                                    if (value === 0 && ctx.dataset.order === 1) return '';
                                    return Number.isInteger(value) ? value : value.toFixed(1);
                                }
                            }
                        },
                        scales: {
                            x: { stacked: false, ticks: CHART_X_AXIS_TICKS },
                            y: { stacked: false, beginAtZero: true, ticks: yAxisTicks() }
                        }
                    }
                });
            }
        }

        // ---- Tableau Watt détail par circuit (ciblage relatif ; fail-safe + défensif) ----
        var wattDetail = production.wattDetail || [];
        var wattTableContainer = containerEl ? containerEl.querySelector('#agent360-watt-table-container') : null;
        if (wattTableContainer) {
            var agentIdNum = data.agentId != null ? Number(data.agentId) : NaN;
            var agentWattRows = !isNaN(agentIdNum)
                ? wattDetail.filter(function(r) { return r && Number(r.agentId) === agentIdNum; })
                : wattDetail;
            var validWattRows = Array.isArray(agentWattRows) ? agentWattRows.filter(function(row) {
                return row && typeof row === 'object';
            }) : [];
            try {
                var wattTableHtml = UI && UI.buildWattTableHtml
                    ? UI.buildWattTableHtml(validWattRows)
                    : '';
                if (wattTableHtml) {
                    wattTableContainer.innerHTML = wattTableHtml;
                    wattTableContainer.classList.remove('hidden');
                    wattTableContainer.classList.add('block');
                } else {
                    wattTableContainer.classList.add('hidden');
                    wattTableContainer.classList.remove('block');
                }
            } catch (e) {
                console.error('Agent360 table WATT:', e);
                wattTableContainer.innerHTML = '<div class="px-4 py-3 border-b border-gray-100"><p class="text-xs font-black text-slate-400 uppercase tracking-widest">Watt – Détail par circuit</p></div><div class="text-xs text-rose-500 p-2">Erreur lors de la génération des détails.</div>';
                wattTableContainer.classList.remove('hidden');
                wattTableContainer.classList.add('block');
            }
        }

        if (UI && typeof UI.initCollapsibleTableToggles === 'function') {
            UI.initCollapsibleTableToggles(containerEl, expandedByDefault, ['agent360-tel-table-container', 'agent360-courriels-table-container', 'agent360-watt-table-container']);
        }
    }

    global.HQApp.Agent360ChartsView = {
        renderAgent360: renderAgent360,
        destroy: destroy
    };
})(typeof window !== 'undefined' ? window : this);
