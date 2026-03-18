class PlanningService {
  /**
   * Point d'entrée principal.
   * @param {string} csvContent Contenu brut du CSV.
   * @returns {{ agents: Record<string, any> }} Stats agrégées par agent et par état du planning.
   */
  parseCSV(csvContent) {
    console.groupCollapsed('[PlanningService] Debug parseCSV');
    try {
      if (typeof csvContent !== 'string') {
        console.warn('[PlanningService] csvContent non string, type =', typeof csvContent);
        console.groupEnd();
        return { agents: {} };
      }

      const lines = this._splitLines(csvContent);
      console.log('[PlanningService] Nombre de lignes après split :', lines.length);
      if (lines.length >= 1) console.log('[PlanningService] L1:', lines[0]);
      if (lines.length >= 2) console.log('[PlanningService] L2 (header):', lines[1]);
      if (lines.length < 2) {
        console.warn('[PlanningService] Fichier planning trop court (<2 lignes).');
        console.groupEnd();
        return { agents: {} };
      }

      const headers = this._parseHeader(lines[1]);
      console.log('[PlanningService] Headers parsés :', headers);
      if (!headers || headers.length === 0) {
        console.warn('[PlanningService] Headers vides après parsing.');
        console.groupEnd();
        return { agents: {} };
      }

      let kept = 0;
      let rejectedTotalNonEmpty = 0;
      let rejectedMissingTimes = 0;
      const sampleRows = [];

      for (let i = 2; i < Math.min(lines.length, 50); i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const rowObj = this._parseRow(line, headers);
        if (!rowObj) continue;

        const totalHeures = (rowObj["Total d'heures"] || rowObj['Total heures'] || '').trim();
        const startStrDbg = (rowObj['Heure de début'] || '').trim();
        const endStrDbg = (rowObj['Heure de fin'] || '').trim();

        const isDetail = this._isDetailRow(rowObj);

        if (isDetail) kept++;
        else {
          if (totalHeures !== '') rejectedTotalNonEmpty++;
          else if (!startStrDbg || !endStrDbg) rejectedMissingTimes++;
        }

        if (sampleRows.length < 5) {
          sampleRows.push({
            index: i,
            raw: line,
            rowObj,
            totalHeures,
            startStr: startStrDbg,
            endStr: endStrDbg,
            isDetail
          });
        }
      }

      console.log('[PlanningService] Lignes détail conservées (<=50 premières) :', kept);
      console.log("[PlanningService] Rejetées car 'Total d\\'heures' non vide :", rejectedTotalNonEmpty);
      console.log('[PlanningService] Rejetées car heures début/fin manquantes :', rejectedMissingTimes);
      console.log('[PlanningService] Échantillon de lignes :', sampleRows);

      const detailRows = [];

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const rowObj = this._parseRow(line, headers);
        if (!rowObj || !this._isDetailRow(rowObj)) continue;

        const startStr = (rowObj['Heure de début'] || '').trim();
        const endStr = (rowObj['Heure de fin'] || '').trim();
        const durationHours = this._calculateDuration(startStr, endStr, 'hours');

        if (durationHours > 0) {
          detailRows.push({
            date: (rowObj['Date'] || '').trim(),
            site: (rowObj['Site'] || '').trim(),
            equipe: (rowObj['Équipe'] || '').trim(),
            agent: (rowObj['Agent'] || '').trim(),
            etatPlanning: (rowObj['État du planning'] || '').trim(),
            start: startStr,
            end: endStr,
            durationHours: durationHours
          });
        }
      }

      console.log('[PlanningService] Nombre de lignes détail après calcul durée > 0 :', detailRows.length);
      const aggregated = this._aggregateByAgentAndState(detailRows);
      console.log('[PlanningService] Agrégat agents retourné :', aggregated);
      console.groupEnd();
      return aggregated;
    } catch (e) {
      console.error('[PlanningService] Erreur dans parseCSV :', e);
      console.groupEnd();
      return { agents: {} };
    }

  }

  /**
   * Normalise les fins de lignes et retourne un tableau de lignes.
   * Gère \r\n, \n, \r et filtre les lignes vides en fin de fichier.
   * @param {string} csvContent
   * @returns {string[]}
   * @private
   */
  _splitLines(csvContent) {
    // Normalisation des fins de lignes : remplacer \r\n et \r par \n
    const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split et conserver les lignes vides internes, mais on trim les espaces de fin
    return normalized
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l, idx, arr) => {
        // Garder toutes les lignes sauf un éventuel dernier bloc complètement vide
        if (l !== '') return true;
        // Si c'est la dernière et qu'elle est vide, on peut l'ignorer
        return idx !== arr.length - 1;
      });
  }

  /**
   * Parse la ligne d'en-tête pour obtenir un tableau de noms de colonnes.
   * @param {string} line
   * @returns {string[]}
   * @private
   */
  _parseHeader(line) {
    if (!line) return [];
    // Split simple sur la virgule, trim et suppression de guillemets
    return line.split(',').map((h) => this._cleanCell(h));
  }

  /**
   * Parse une ligne de données en objet clé/valeur basé sur les headers.
   * @param {string} line
   * @param {string[]} headers
   * @returns {Record<string, string>|null}
   * @private
   */
  _parseRow(line, headers) {
    if (!line) return null;
    const cells = line.split(',');
    const rowObj = {};

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (!header) continue;
      const rawCell = cells[i] !== undefined ? cells[i] : '';
      rowObj[header] = this._cleanCell(rawCell);
    }

    return rowObj;
  }

  /**
   * Nettoie une cellule CSV (trim + retrait de guillemets simples/doubles).
   * @param {string} value
   * @returns {string}
   * @private
   */
  _cleanCell(value) {
    if (value == null) return '';
    let v = String(value).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    return v;
  }

  /**
   * Détermine si une ligne est une ligne de détail exploitable.
   * Garde stricte : la colonne "Total d'heures" doit être vide.
   * @param {Record<string, string>} rowObj
   * @returns {boolean}
   * @private
   */
  _isDetailRow(rowObj) {
    if (!rowObj) return false;

    const totalHeures =
      (rowObj["Total d'heures"] != null
        ? rowObj["Total d'heures"]
        : rowObj['Total heures'] || '') + '';
    const totalHeuresTrimmed = totalHeures.trim();

    const start = (rowObj['Heure de début'] || '').trim();
    const end = (rowObj['Heure de fin'] || '').trim();

    // Règle stricte : si Total d'heures n'est pas strictement vide, on rejette.
    if (totalHeuresTrimmed !== '') {
      return false;
    }

    // On exige des heures de début/fin renseignées pour considérer la ligne exploitable.
    if (start === '' || end === '') {
      return false;
    }

    return true;
  }

  /**
   * Convertit une heure HH:MM en nombre de minutes depuis minuit.
   * Retourne null si le format est invalide.
   * @param {string} timeStr
   * @returns {number|null}
   * @private
   */
  _parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const trimmed = timeStr.trim();
    if (trimmed === '') return null;

    const parts = trimmed.split(':');
    if (parts.length !== 2) return null;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return hours * 60 + minutes;
  }

  /**
   * Calcule la durée entre deux heures.
   * @param {string} startStr
   * @param {string} endStr
   * @param {'minutes'|'hours'} outputAs
   * @returns {number} Durée (minutes ou heures décimales). 0 si invalide.
   * @private
   */
  _calculateDuration(startStr, endStr, outputAs) {
    const startMinutes = this._parseTime(startStr);
    const endMinutes = this._parseTime(endStr);

    if (
      startMinutes == null ||
      endMinutes == null ||
      endMinutes < startMinutes
    ) {
      return 0;
    }

    const dureeMinutes = endMinutes - startMinutes;

    if (outputAs === 'hours') {
      return dureeMinutes / 60;
    }

    return dureeMinutes;
  }

  /**
   * Normalise un libellé d'état du planning pour l'agrégation (graphiques lisibles).
   * @param {string} rawName
   * @returns {string}
   * @private
   */
  _normalizeStateName(rawName) {
    if (!rawName) return 'Inconnu';

    // 1. Suppression de tout ce qui est entre parenthèses
    let clean = String(rawName)
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .trim()
      .toUpperCase();

    // Normaliser accents pour les tests includes (RÉUNION -> REUNION, etc.)
    var cleanAscii = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // 2. Dictionnaire de mots-clés (Mapping métier)
    if (cleanAscii.includes('REUNION')) return 'RÉUNION';
    if (cleanAscii.includes('FORMATION')) return 'FORMATION';
    if (cleanAscii.includes('CONGE')) return 'CONGÉS';
    if (cleanAscii.includes('MALADIE')) return 'MALADIE';
    if (cleanAscii.includes('ABSENCE')) return 'ABSENCE';
    if (cleanAscii.includes('CESU')) return 'CESU';
    if (cleanAscii.includes('REPAS') || cleanAscii.includes('DEJ CO')) return 'REPAS';
    if (cleanAscii.includes('RDV')) return 'RDV';
    if (cleanAscii.includes('MANDAT')) return 'MANDAT';

    // Si aucun mot clé n'est trouvé, on retourne la chaîne nettoyée (MAJUSCULES)
    return clean;
  }

  /**
   * Agrège les lignes par agent puis par état du planning.
   * Utilise les heures décimales pour les totaux.
   * @param {Array<{
   *   agent: string,
   *   etatPlanning: string,
   *   date: string,
   *   site: string,
   *   equipe: string,
   *   start: string,
   *   end: string,
   *   durationHours: number
   * }>} rows
   * @returns {{ agents: Record<string, any> }}
   * @private
   */
  _aggregateByAgentAndState(rows) {
    const result = {
      agents: {}
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return result;
    }

    for (const row of rows) {
      const agentName = row.agent || 'Inconnu';
      const stateName = this._normalizeStateName(row.etatPlanning);
      const durationHours =
        typeof row.durationHours === 'number' && !Number.isNaN(row.durationHours)
          ? row.durationHours
          : 0;

      if (!result.agents[agentName]) {
        result.agents[agentName] = {
          totalHours: 0,
          states: {}
        };
      }

      const agentBucket = result.agents[agentName];
      agentBucket.totalHours += durationHours;

      if (!agentBucket.states[stateName]) {
        agentBucket.states[stateName] = {
          totalHours: 0,
          entries: []
        };
      }

      const stateBucket = agentBucket.states[stateName];
      stateBucket.totalHours += durationHours;

      stateBucket.entries.push({
        date: row.date,
        site: row.site,
        equipe: row.equipe,
        etatPlanning: row.etatPlanning,
        start: row.start,
        end: row.end,
        durationHours: durationHours
      });
    }

    return result;
  }
}

// Exposition globale
window.PlanningService = PlanningService;

