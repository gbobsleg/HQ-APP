/**
 * Génération du PDF bilan qualité.
 * Dépend de window.jspdf (et jspdf-autotable chargé avant).
 * API : window.BilanPdf.generate(options)
 */
(function () {
    'use strict';

    function getSections(grid) {
        var sections = (grid && grid.sections) ? grid.sections : (Array.isArray(grid) ? grid : []);
        return sections.map(function (sec) {
            var fields = Array.isArray(sec && sec.fields) ? sec.fields : (Array.isArray(sec && sec.items) ? sec.items : []);
            return {
                id: sec && sec.id ? sec.id : '',
                label: sec && sec.label ? sec.label : '',
                fields: fields
            };
        });
    }

    function resolveFieldValue(field, data) {
        var safeData = data || {};
        var textResponses = safeData.textResponses || {};
        var booleanResponses = safeData.booleanResponses || {};
        var scores = safeData.scores || {};
        var comments = safeData.comments || {};
        var id = field && field.id ? field.id : '';

        if (!id || !field || !field.type) return 'Non renseigné';

        if (field.type === 'textarea') {
            var txt = (textResponses[id] != null ? String(textResponses[id]) : '').trim();
            return txt !== '' ? txt : 'Non renseigné';
        }

        if (field.type === 'boolean') {
            if (!(id in booleanResponses)) return 'Non renseigné';
            return booleanResponses[id] === true ? 'Oui' : 'Non';
        }

        if (field.type === 'scoring') {
            var raw = scores[id];
            if (raw == null || raw === '') return 'Non renseigné';
            var suffix = (field.max != null) ? '/' + field.max : '';
            var base = String(raw) + suffix;
            var comment = (comments[id] != null ? String(comments[id]) : '').trim();
            return comment ? (base + ' — ' + comment) : base;
        }

        return 'Non renseigné';
    }

    function getFileName(agentName) {
        return "Bilan_" + (agentName || '').replace(/\s+/g, '_') + "_" + new Date().toISOString().split('T')[0] + ".pdf";
    }

    function createPageHelpers(doc, margin) {
        var pageHeight = doc.internal.pageSize.height;

        function ensurePageSpace(cursor, requiredHeight) {
            if (cursor.y + requiredHeight <= pageHeight - margin) return;
            doc.addPage();
            cursor.y = margin;
        }

        function writeParagraph(cursor, text, width, lineHeight, requiredHeadRoom) {
            var t = (text == null ? '' : String(text)).trim();
            var lines = t ? doc.splitTextToSize(t, width) : [''];
            ensurePageSpace(cursor, (requiredHeadRoom || 0) + lines.length * lineHeight);
            for (var i = 0; i < lines.length; i++) {
                doc.text(lines[i], margin, cursor.y);
                cursor.y += lineHeight;
            }
            return lines.length;
        }

        return {
            ensurePageSpace: ensurePageSpace,
            writeParagraph: writeParagraph
        };
    }

    function generateScoringPdf(options) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 20;

        const agentName = options.agentName || '';
        const campaignName = options.campaignName || 'Campagne en cours';
        const supervisorName = options.supervisorName || '';
        const comment = options.comment || 'Aucun commentaire.';
        const hideNotes = !!options.hideNotesInPdf;
        const evals = options.evals || [];
        const grid = options.grid || [];

        // ---------- Page 1 : résumé ----------
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, pageWidth, 52, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(0, 52, pageWidth, 52);

        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(79, 70, 229);
        doc.text("Bilan de qualit\u00e9", pageWidth / 2, 18, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        doc.text("Agent : " + agentName, margin, 30);
        doc.text("Campagne : " + campaignName, margin, 37);
        if (supervisorName) doc.text("Superviseur : " + supervisorName, margin, 44);
        doc.setTextColor(100, 116, 139);
        doc.text("Date : " + new Date().toLocaleDateString('fr-FR'), pageWidth - margin, 40, { align: 'right' });

        const headers = hideNotes ? [["Date", "Points cl\u00e9s"]] : [["Date", "Note / 10", "Points cl\u00e9s"]];
        const data = evals.map(function (e) {
            const comments = (e.fileContent && e.fileContent.commentaire) ? e.fileContent.commentaire : "Pas de commentaire global.";
            return hideNotes ? [e.date, comments] : [e.date, e.note, comments];
        });
        const emptyRow = hideNotes ? [["—", "Aucune \u00e9valuation"]] : [["—", "—", "Aucune \u00e9valuation"]];

        doc.autoTable({
            startY: 60,
            head: headers,
            body: data.length ? data : emptyRow,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], fontSize: 10, fontStyle: 'bold', textColor: [255, 255, 255] },
            bodyStyles: { fontSize: 9, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
            columnStyles: hideNotes
                ? { 0: { cellWidth: 30 }, 1: { cellWidth: 'auto' } }
                : { 0: { cellWidth: 30 }, 1: { cellWidth: 30, fontStyle: 'bold', halign: 'center' }, 2: { cellWidth: 'auto' } }
        });

        let finalY = doc.lastAutoTable.finalY + 18;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin - 2, finalY - 4, pageWidth - 2 * margin + 4, 8, 1, 1, 'F');
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(55, 65, 81);
        doc.text("Synth\u00e8se", margin, finalY + 2);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(51, 65, 85);
        const splitComment = doc.splitTextToSize(comment, pageWidth - 2 * margin - 4);
        const lineH = 5;
        for (let i = 0; i < splitComment.length; i++) {
            doc.text(splitComment[i], margin, finalY + 10 + i * lineH);
        }

        // ---------- Une page par évaluation : détail de la grille ----------
        for (let i = 0; i < evals.length; i++) {
            const e = evals[i];
            const fc = e.fileContent || {};
            const scores = fc.scores || {};
            const comments = fc.comments || {};
            const offre = fc.offre || "—";
            const note = e.note != null ? e.note : "—";

            doc.addPage();
            finalY = 20;

            doc.setFontSize(16);
            doc.setTextColor(79, 70, 229);
            doc.text("Détail évaluation " + (i + 1) + " / " + evals.length, margin, finalY);
            finalY += 10;

            doc.setFontSize(11);
            doc.setTextColor(80);
            doc.text(hideNotes ? "Date : " + e.date + "  |  Offre : " + offre : "Date : " + e.date + "  |  Offre : " + offre + "  |  Note : " + note + " / 10", margin, finalY);
            finalY += 8;
            if (fc.commentaire) {
                doc.setFontSize(10);
                doc.setTextColor(60);
                const commLines = doc.splitTextToSize(fc.commentaire, pageWidth - 2 * margin);
                doc.text(commLines, margin, finalY);
                finalY += commLines.length * 5 + 8;
            }

            const detailHeaders = hideNotes ? [["Catégorie", "Critère", "Commentaire"]] : [["Catégorie", "Critère", "Note", "Commentaire"]];
            const detailBody = [];
            const hintRowIndices = [];
            const hintTexts = [];
            const hintSpan = hideNotes ? 2 : 3;

            for (const cat of grid) {
                const rowCount = (cat.items || []).reduce(function (n, item) { return n + 1 + (item.hint ? 1 : 0); }, 0);
                let firstRowOfCategory = true;
                for (const item of cat.items || []) {
                    const val = scores[item.id];
                    const noteStr = item.max != null ? (val != null ? val : '-') + "/" + item.max : (val != null ? String(val) : '-');
                    const label = item.label || item.id || '';
                    const hasHint = !!item.hint;
                    const catCell = firstRowOfCategory
                        ? { content: cat.label || '', rowSpan: rowCount, styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [55, 65, 81] } }
                        : null;
                    const labelCell = { content: label, styles: { fontStyle: 'bold', textColor: [30, 41, 59] } };
                    if (hideNotes) {
                        detailBody.push(catCell !== null ? [catCell, labelCell, comments[item.id] || '—'] : [labelCell, comments[item.id] || '—']);
                    } else {
                        detailBody.push(catCell !== null ? [catCell, labelCell, noteStr, comments[item.id] || '—'] : [labelCell, noteStr, comments[item.id] || '—']);
                    }
                    firstRowOfCategory = false;
                    if (hasHint) {
                        hintRowIndices.push(detailBody.length);
                        hintTexts.push(item.hint);
                        detailBody.push([{ content: '', colSpan: hintSpan }]);
                    }
                }
            }
            const detailEmptyRow = hideNotes ? [["—", "—", "Aucun critère"]] : [["—", "—", "—", "Aucun critère"]];

            doc.autoTable({
                startY: finalY,
                head: detailHeaders,
                body: detailBody.length ? detailBody : detailEmptyRow,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229], fontSize: 10, fontStyle: 'bold', textColor: [255, 255, 255] },
                bodyStyles: { fontSize: 9, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.2 },
                columnStyles: hideNotes
                    ? { 0: { cellWidth: 50 }, 1: { cellWidth: 55 }, 2: { cellWidth: 'auto' } }
                    : { 0: { cellWidth: 45 }, 1: { cellWidth: 50 }, 2: { cellWidth: 22, halign: 'center' }, 3: { cellWidth: 'auto' } },
                margin: { left: margin, right: margin },
                didDrawCell: function (data) {
                    if (data.section !== 'body') return;
                    const rowIdx = data.row.index;
                    const isHintRow = hintRowIndices.indexOf(rowIdx) !== -1;
                    const isHintCell = isHintRow && (data.column.index === 0 || data.column.index === 1);
                    if (isHintCell) {
                        const idx = hintRowIndices.indexOf(rowIdx);
                        const hintText = hintTexts[idx];
                        if (hintText == null || data.cell.width <= 0) return;
                        doc.setFillColor(241, 245, 249);
                        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                        doc.setFontSize(7);
                        doc.setFont(undefined, 'italic');
                        doc.setTextColor(100, 116, 139);
                        const x = data.cell.x + 3;
                        const w = Math.max(10, data.cell.width - 6);
                        const lines = doc.splitTextToSize(hintText, w);
                        const lineHeight = 3.5;
                        let drawY = data.cell.y + 5;
                        for (let k = 0; k < lines.length; k++) {
                            doc.text(lines[k], x, drawY);
                            drawY += lineHeight;
                        }
                        doc.setFontSize(9);
                        doc.setFont(undefined, 'normal');
                        doc.setTextColor(51, 65, 85);
                    }
                }
            });
        }

        doc.save(getFileName(agentName));
    }

    function generateReviewPdf(options) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 20;
        const contentWidth = pageWidth - (2 * margin);
        const cursor = { y: margin };
        const helpers = createPageHelpers(doc, margin);
        const ensurePageSpace = helpers.ensurePageSpace;
        const writeParagraph = helpers.writeParagraph;

        const agentName = options.agentName || '';
        const campaignName = options.campaignName || 'Campagne en cours';
        const supervisorName = options.supervisorName || '';
        const comment = options.comment || '';
        const evals = Array.isArray(options.evals) ? options.evals.slice() : [];
        const sections = getSections(options.grid || []);

        evals.sort(function (a, b) {
            var da = Date.parse((a && a.fileContent && a.fileContent.date_communication) || '');
            var db = Date.parse((b && b.fileContent && b.fileContent.date_communication) || '');
            if (!isNaN(da) && !isNaN(db)) return da - db;
            if (!isNaN(da)) return -1;
            if (!isNaN(db)) return 1;
            return 0;
        });
        const firstEval = evals.length > 0 ? (evals[0] || {}) : {};
        const firstContent = firstEval.fileContent || {};
        const rawHeaderDate = firstContent.date_communication || firstEval.date || '';
        const parsedHeaderDate = Date.parse(rawHeaderDate);
        const headerDate = !isNaN(parsedHeaderDate)
            ? (function () {
                var d = new Date(parsedHeaderDate);
                var day = String(d.getDate()).padStart(2, '0');
                var month = String(d.getMonth() + 1).padStart(2, '0');
                var year = d.getFullYear();
                var hour = String(d.getHours()).padStart(2, '0');
                var minute = String(d.getMinutes()).padStart(2, '0');
                return 'le ' + day + '-' + month + '-' + year + ' à ' + hour + ':' + minute;
            })()
            : 'Non renseignée';

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(79, 70, 229);
        doc.text("Compte-rendu d'entretien", margin, cursor.y);
        cursor.y += 10;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        ensurePageSpace(cursor, 24);
        doc.text("Agent : " + agentName, margin, cursor.y); cursor.y += 5;
        doc.text("Campagne : " + campaignName, margin, cursor.y); cursor.y += 5;
        if (supervisorName) {
            doc.text("Manager : " + supervisorName, margin, cursor.y);
            cursor.y += 5;
        }
        doc.text("Date de l'entretien : " + headerDate, margin, cursor.y);
        cursor.y += 10;

        if (evals.length === 0) {
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);
            doc.text("Aucun entretien disponible.", margin, cursor.y);
            cursor.y += 8;
        }

        for (var i = 0; i < evals.length; i++) {
            var e = evals[i] || {};
            var fc = e.fileContent || {};
            var globalComment = (fc.commentaire || '').trim();

            ensurePageSpace(cursor, 8);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(margin, cursor.y - 2, pageWidth - margin, cursor.y - 2);
            cursor.y += 6;

            for (var s = 0; s < sections.length; s++) {
                var section = sections[s] || {};
                var fields = Array.isArray(section.fields) ? section.fields : [];

                ensurePageSpace(cursor, 10);
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(79, 70, 229);
                doc.text((section.label || ('Section ' + (s + 1))), margin, cursor.y);
                cursor.y += 6;

                if (fields.length === 0) {
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'italic');
                    doc.setTextColor(100, 116, 139);
                    doc.text("Non renseigné", margin + 2, cursor.y);
                    cursor.y += 6;
                    continue;
                }

                for (var f = 0; f < fields.length; f++) {
                    var field = fields[f] || {};
                    var label = field.label || field.id || ('Champ ' + (f + 1));
                    var value = resolveFieldValue(field, fc);

                    doc.setFontSize(10);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(51, 65, 85);
                    ensurePageSpace(cursor, 6);
                    doc.text("- " + label, margin + 2, cursor.y);
                    cursor.y += 5;

                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(30, 41, 59);
                    var printedLines = writeParagraph(cursor, value, contentWidth - 6, 5, 2);
                    if (printedLines === 0) cursor.y += 5;
                    cursor.y += 2;
                }

                cursor.y += 2;
            }

            if (globalComment) {
                ensurePageSpace(cursor, 10);
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(51, 65, 85);
                doc.text("Commentaire de l'évaluateur", margin, cursor.y);
                cursor.y += 5;

                doc.setFont(undefined, 'normal');
                doc.setTextColor(30, 41, 59);
                writeParagraph(cursor, globalComment, contentWidth, 5, 2);
                cursor.y += 4;
            }

            cursor.y += 4;
        }

        ensurePageSpace(cursor, 14);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(margin, cursor.y, pageWidth - margin, cursor.y);
        cursor.y += 8;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(55, 65, 81);
        doc.text("Synthèse de l'évaluateur", margin, cursor.y);
        cursor.y += 6;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 41, 59);
        writeParagraph(cursor, (comment || 'Non renseigné'), contentWidth, 5, 2);

        doc.save(getFileName(agentName));
    }

    function generate(options) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            console.error('BilanPdf: jsPDF non chargé.');
            return;
        }
        var campaignType = (options && options.campaignType === 'review') ? 'review' : 'scoring';
        if (campaignType === 'review') {
            generateReviewPdf(options || {});
            return;
        }
        generateScoringPdf(options || {});
    }

    window.BilanPdf = { generate: generate };
})();
