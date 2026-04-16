/**
 * UIComponents.js - Composants UI partagés (HTML tables + toggles) pour HQ-APP.
 * ES5, IIFE, exposé sur window.HQApp.UIComponents.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    /**
     * Formate un nombre de secondes en MM:SS
     * @param {number} val
     * @returns {string}
     */
    function formatMmSs(val) {
        if (isNaN(val)) return '00:00';
        var absVal = Math.abs(val);
        var totalSeconds = Math.round(absVal);
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        var sign = val < 0 ? '-' : '';
        return sign + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    /**
     * delta% coloré : lowerIsBetter=true → négatif=vert, positif=rouge.
     * @param {number} agentVal
     * @param {number} avgVal
     * @param {boolean} lowerIsBetter
     * @returns {string}
     */
    function deltaHtml(agentVal, avgVal, lowerIsBetter) {
        if (!avgVal || avgVal === 0) return '';
        var pct = Math.round(((agentVal - avgVal) / avgVal) * 100);
        if (pct === 0) return ' <span class="text-xs text-gray-400 ml-1">±0%</span>';
        var sign = pct > 0 ? '+' : '';
        var better = lowerIsBetter ? (pct < 0) : (pct > 0);
        var cls = better ? 'text-emerald-600' : 'text-red-500';
        return ' <span class="text-xs font-semibold ' + cls + ' ml-1">' + sign + pct + '%</span>';
    }

    /**
     * Construit le HTML du tableau Téléphone (détail par offre) à partir de données déjà agrégées.
     * Fonction pure : ne touche pas au DOM, ne lit pas d'état global.
     * @param {Array} offresList - Liste brute des offres de l'agent (ou du périmètre)
     * @param {Object} telRowGlobal - Ligne agrégée (GLOBAL)
     * @param {Object} regionAcc - Accumulateurs régionaux par offre (optionnel)
     * @param {Function} accToAvg - Transforme un accumulateur en moyennes (optionnel)
     * @returns {string} HTML complet du tableau, ou chaîne vide si aucune donnée exploitable
     */
    function buildTelephoneTableHtml(offresList, telRowGlobal, regionAcc, accToAvg) {
        if (!offresList || !Array.isArray(offresList) || offresList.length === 0) {
            return '';
        }
        var validOffres = offresList.filter(function (o) {
            return o && typeof o === 'object' && typeof o.offre === 'string';
        });
        if (!telRowGlobal || validOffres.length === 0) {
            return '';
        }

        var offresTriees = validOffres.slice().sort(function (a, b) {
            return (b.appels_traites || 0) - (a.appels_traites || 0);
        });

        var th = function (t) {
            return '<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">' + t + '</th>';
        };
        var tdR = function (v) {
            return '<td class="px-4 py-3 text-right text-gray-700 whitespace-nowrap">' + v + '</td>';
        };

        var html = '<div class="agent360-table-header flex items-center justify-between px-6 py-3 border-b border-gray-100 cursor-pointer select-none hover:bg-gray-50 rounded-t-3xl" role="button" tabindex="0" aria-expanded="true"><p class="text-xs font-black text-slate-400 uppercase tracking-widest">Téléphone - Détail par offre</p><span class="agent360-chevron text-slate-400 transition-transform inline-block">▼</span></div>';
        html += '<div class="agent360-table-body"><table class="min-w-full w-full text-sm">';
        html += '<thead class="bg-gray-50"><tr>' +
            '<th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Offre</th>' +
            th('Appels') + th('DMT') + th('DMC') + th('DMPA') + th('Id. (%)') + th('Rép. Imm. (%)') +
            '</tr></thead>';
        html += '<tbody class="divide-y divide-gray-100">';

        // Lignes par offre
        offresTriees.forEach(function (o) {
            var avg;
            if (regionAcc && accToAvg) {
                var acc = regionAcc && regionAcc[o.offre] ? regionAcc[o.offre] : (regionAcc && regionAcc.GLOBAL);
                avg = acc ? accToAvg(acc) : { dmt: 0, dmc: 0, dmpa: 0, identifications: 0, reponses_immediates: 0 };
            } else {
                avg = { dmt: 0, dmc: 0, dmpa: 0, identifications: 0, reponses_immediates: 0 };
            }

            html += '<tr class="hover:bg-gray-50">';
            html += '<td class="px-4 py-3 font-medium text-gray-900">' + (o.offre || '') + '</td>';
            html += tdR(Math.round(o.appels_traites) || 0);
            html += tdR(formatMmSs(o.dmt || 0) + deltaHtml(o.dmt || 0, avg.dmt, true));
            html += tdR(formatMmSs(o.dmc || 0) + deltaHtml(o.dmc || 0, avg.dmc, true));
            html += tdR(formatMmSs(o.dmpa || 0) + deltaHtml(o.dmpa || 0, avg.dmpa, true));
            html += tdR(Math.round((o.identifications || 0) * 100) + '%' + deltaHtml((o.identifications || 0) * 100, avg.identifications * 100, false));
            html += tdR(Math.round((o.reponses_immediates || 0) * 100) + '%' + deltaHtml((o.reponses_immediates || 0) * 100, avg.reponses_immediates * 100, false));
            html += '</tr>';
        });

        // Agrégat GLOBAL restreint au périmètre des offres listées (même logique que 360°)
        var agentOffreNames = offresTriees.map(function (o) { return o.offre; });
        var combinedAcc = {
            dmtSum: 0, dmtW: 0,
            dmcSum: 0, dmcW: 0,
            dmpaSum: 0, dmpaW: 0,
            idSum: 0, idW: 0,
            repSum: 0, repW: 0,
            appelsSum: 0, agentCount: 0
        };
        if (regionAcc) {
            agentOffreNames.forEach(function (offreName) {
                var acc2 = regionAcc[offreName];
                if (!acc2) return;
                combinedAcc.dmtSum += acc2.dmtSum; combinedAcc.dmtW += acc2.dmtW;
                combinedAcc.dmcSum += acc2.dmcSum; combinedAcc.dmcW += acc2.dmcW;
                combinedAcc.dmpaSum += acc2.dmpaSum; combinedAcc.dmpaW += acc2.dmpaW;
                combinedAcc.idSum += acc2.idSum; combinedAcc.idW += acc2.idW;
                combinedAcc.repSum += acc2.repSum; combinedAcc.repW += acc2.repW;
                combinedAcc.appelsSum += acc2.appelsSum; combinedAcc.agentCount += acc2.agentCount;
            });
        }
        var avgGlobal = accToAvg ? accToAvg(combinedAcc) : {
            dmt: 0, dmc: 0, dmpa: 0, identifications: 0, reponses_immediates: 0, appels_traites: 0
        };

        // Ligne TOTAL
        html += '<tr class="bg-blue-50 font-bold border-t-2 border-blue-200">';
        html += '<td class="px-4 py-3 text-blue-800 whitespace-nowrap">TOTAL</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800">' + (Math.round(telRowGlobal.appels_traites) || 0) + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800 whitespace-nowrap">' + formatMmSs(telRowGlobal.dmt || 0) + deltaHtml(telRowGlobal.dmt || 0, avgGlobal.dmt, true) + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800 whitespace-nowrap">' + formatMmSs(telRowGlobal.dmc || 0) + deltaHtml(telRowGlobal.dmc || 0, avgGlobal.dmc, true) + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800 whitespace-nowrap">' + formatMmSs(telRowGlobal.dmpa || 0) + deltaHtml(telRowGlobal.dmpa || 0, avgGlobal.dmpa, true) + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800 whitespace-nowrap">' + Math.round((telRowGlobal.identifications || 0) * 100) + '%' + deltaHtml((telRowGlobal.identifications || 0) * 100, avgGlobal.identifications * 100, false) + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800 whitespace-nowrap">' + Math.round((telRowGlobal.reponses_immediates || 0) * 100) + '%' + deltaHtml((telRowGlobal.reponses_immediates || 0) * 100, avgGlobal.reponses_immediates * 100, false) + '</td>';
        html += '</tr></tbody></table></div>';

        return html;
    }

    /**
     * Construit le HTML du tableau Watt (détail par circuit).
     * Fonction pure : ne touche pas au DOM.
     * @param {Array} agentWattRows - Lignes Watt (filtrées/agrégées)
     * @returns {string} HTML complet du tableau, ou chaîne vide si aucune donnée exploitable
     */
    function buildWattTableHtml(agentWattRows) {
        if (!agentWattRows || !Array.isArray(agentWattRows) || agentWattRows.length === 0) {
            return '';
        }

        var sorted = agentWattRows.slice().sort(function (a, b) {
            return (parseFloat(b.cloture_manuelle) || 0) - (parseFloat(a.cloture_manuelle) || 0);
        });

        var th = function (t) {
            return '<th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">' + t + '</th>';
        };
        var tdR = function (v) {
            return '<td class="px-4 py-3 text-right text-gray-700 whitespace-nowrap">' + v + '</td>';
        };

        var html = '<div class="agent360-table-header flex items-center justify-between px-6 py-3 border-b border-gray-100 cursor-pointer select-none hover:bg-gray-50 rounded-t-3xl" role="button" tabindex="0" aria-expanded="true"><p class="text-xs font-black text-slate-400 uppercase tracking-widest">Watt – Détail par circuit</p><span class="agent360-chevron text-slate-400 transition-transform inline-block">▼</span></div>';
        html += '<div class="agent360-table-body"><table class="min-w-full w-full text-sm">';
        html += '<thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Circuit</th>' +
            th('Clôture') + th('Reroutage') + th('Transfert') + '</tr></thead><tbody class="divide-y divide-gray-100">';

        var sumCloture = 0, sumReroutage = 0, sumTransfert = 0;
        sorted.forEach(function (row) {
            var c = parseFloat(row.cloture_manuelle) || 0;
            var r = parseFloat(row.reroutage_individuel) || 0;
            var t = parseFloat(row.transfert_prod) || 0;
            sumCloture += c;
            sumReroutage += r;
            sumTransfert += t;
            html += '<tr class="hover:bg-gray-50">';
            html += '<td class="px-4 py-3 font-medium text-gray-900">' + (row.circuit != null ? String(row.circuit).replace(/</g, '&lt;') : '') + '</td>';
            html += tdR(c);
            html += tdR(r);
            html += tdR(t);
            html += '</tr>';
        });

        html += '<tr class="bg-blue-50 font-bold border-t-2 border-blue-200">';
        html += '<td class="px-4 py-3 text-blue-800 whitespace-nowrap">TOTAL</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800">' + sumCloture + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800">' + sumReroutage + '</td>';
        html += '<td class="px-4 py-3 text-right text-blue-800">' + sumTransfert + '</td>';
        html += '</tr></tbody></table></div>';

        return html;
    }

    /**
     * Initialise le repli/dépliage des sections tableaux.
     * @param {HTMLElement} containerEl
     * @param {boolean} expandedByDefault
     * @param {Array<string>} containerIdList - IDs des conteneurs à gérer
     */
    function initCollapsibleTableToggles(containerEl, expandedByDefault, containerIdList) {
        if (!containerEl || !containerIdList || !Array.isArray(containerIdList)) return;
        containerIdList.forEach(function (id) {
            var cont = containerEl.querySelector('#' + id);
            if (!cont) return;
            var header = cont.querySelector('.agent360-table-header');
            var body = cont.querySelector('.agent360-table-body');
            if (!header || !body) return;

            var applyState = function (expanded) {
                body.classList.toggle('hidden', !expanded);
                header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                var chevron = header.querySelector('.agent360-chevron');
                if (chevron) chevron.style.transform = expanded ? '' : 'rotate(-90deg)';
            };

            applyState(!!expandedByDefault);

            header.onclick = function () {
                var expanded = header.getAttribute('aria-expanded') === 'true';
                applyState(!expanded);
            };
        });
    }

    global.HQApp.UIComponents = {
        formatMmSs: formatMmSs,
        deltaHtml: deltaHtml,
        buildTelephoneTableHtml: buildTelephoneTableHtml,
        buildWattTableHtml: buildWattTableHtml,
        initCollapsibleTableToggles: initCollapsibleTableToggles
    };
})(typeof window !== 'undefined' ? window : this);

