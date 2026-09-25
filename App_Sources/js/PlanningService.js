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
        const isDetail  = rowObj != null && this._isDetailRow(rowObj);
        const isSummary = !isDetail && rowObj != null && this._isSummaryRow(rowObj);
        if (!isDetail && !isSummary) continue;

        let durationHours;
        let startStr = '';
        let endStr   = '';

        if (isDetail) {
          startStr = (rowObj['Heure de début'] || '').trim();
          endStr   = (rowObj['Heure de fin']   || '').trim();
          durationHours = this._calculateDuration(startStr, endStr, 'hours');
        } else {
          const totalStr = ((rowObj["Total d'heures"] || rowObj['Total heures'] || '') + '').trim();
          durationHours = this._parseTotalHeures(totalStr);
        }

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
   * Détermine si une ligne est une récapitulative autonome (journée entière sans sous-événements).
   * Critère : Total d'heures renseigné ET Heure de début/fin toutes deux vides.
   * @param {Record<string, string>} rowObj
   * @returns {boolean}
   * @private
   */
  _isSummaryRow(rowObj) {
    if (!rowObj) return false;
    const total = ((rowObj["Total d'heures"] != null ? rowObj["Total d'heures"] : rowObj['Total heures'] || '') + '').trim();
    if (total === '') return false;
    const start = (rowObj['Heure de début'] || '').trim();
    const end   = (rowObj['Heure de fin']   || '').trim();
    return start === '' && end === '';
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
   * Parse une durée au format HH:MM (ex. "8:00") en heures décimales.
   * Contrairement à _parseTime, autorise des heures > 23.
   * @param {string} str
   * @returns {number} Heures décimales. 0 si invalide.
   * @private
   */
  _parseTotalHeures(str) {
    if (!str || typeof str !== 'string') return 0;
    const parts = str.trim().split(':');
    if (parts.length !== 2) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || m < 0 || m > 59) return 0;
    return h + m / 60;
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
  _defaultPlanningEtats() {
    return [
      { match: 'REUNION', label: 'RÉUNION', visible: true, telephonie: false },
      { match: 'FORMATION', label: 'FORMATION', visible: true, telephonie: false },
      { match: 'CONGE', label: 'CONGÉS', visible: true, telephonie: false },
      { match: 'MALADIE', label: 'MALADIE', visible: true, telephonie: false },
      { match: 'ABSENCE', label: 'ABSENCE', visible: true, telephonie: false },
      { match: 'CESU', label: 'CESU', visible: true, telephonie: false },
      { match: 'REPAS', label: 'REPAS', visible: true, telephonie: false },
      { match: 'DEJ CO', label: 'REPAS', visible: true, telephonie: false },
      { match: 'RDV', label: 'RDV', visible: true, telephonie: false },
      { match: 'MANDAT', label: 'MANDAT', visible: true, telephonie: false }
    ];
  }

  _planningEtatRules() {
    var cfg = typeof CONFIG_APP !== 'undefined' ? CONFIG_APP.planningEtats : null;
    if (Array.isArray(cfg) && cfg.length > 0) return cfg;
    return this._defaultPlanningEtats();
  }

  _cleanPlanningLabel(rawName) {
    var clean = String(rawName || '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .trim()
      .toUpperCase();
    if (!clean) return 'INCONNU';
    return clean;
  }

  _planningMatchKey(rawName) {
    return this._cleanPlanningLabel(rawName)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Mots du libellé : espace, virgule et trait d'union séparent.
   * La barre oblique reste dans le mot (RG/TI n'est pas TI).
   * @param {string} rawName
   * @returns {string[]}
   */
  _planningTokens(rawName) {
    return this._planningMatchKey(rawName).split(/[\s,\-]+/).filter(Boolean);
  }

  _motifTokens(motif) {
    return String(motif || '').trim().toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[\s,\-]+/)
      .filter(Boolean);
  }

  _tokensContain(labelTokens, motifTokens) {
    if (!motifTokens.length || motifTokens.length > labelTokens.length) return false;
    var last = labelTokens.length - motifTokens.length;
    for (var i = 0; i <= last; i++) {
      var same = true;
      for (var j = 0; j < motifTokens.length; j++) {
        if (labelTokens[i + j] !== motifTokens[j]) {
          same = false;
          break;
        }
      }
      if (same) return true;
    }
    return false;
  }

  /**
   * Première règle dont les mots du motif sont des mots entiers du libellé : libellé affiché et visibilité.
   * Téléphonie : vrai dès qu'une règle telephonie correspond, même si ce n'est pas la première.
   * @param {string} rawName
   * @returns {{ label: string, visible: boolean, telephonie: boolean }}
   */
  _resolvePlanningState(rawName) {
    var clean = this._cleanPlanningLabel(rawName);
    var labelTokens = this._planningTokens(rawName);
    var rules = this._planningEtatRules();
    var label = clean;
    var visible = true;
    var telephonie = false;
    var labeled = false;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i] || {};
      var motifTokens = this._motifTokens(rule.match);
      if (!this._tokensContain(labelTokens, motifTokens)) continue;
      if (!labeled) {
        label = rule.label ? String(rule.label) : clean;
        visible = rule.visible !== false;
        labeled = true;
      }
      if (rule.telephonie === true) telephonie = true;
    }
    return { label: label, visible: visible, telephonie: telephonie };
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
      const resolved = this._resolvePlanningState(row.etatPlanning);
      const stateName = resolved.label;
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
          visible: resolved.visible,
          entries: []
        };
      }

      const stateBucket = agentBucket.states[stateName];
      if (resolved.visible) stateBucket.visible = true;
      stateBucket.totalHours += durationHours;

      stateBucket.entries.push({
        date: row.date,
        site: row.site,
        equipe: row.equipe,
        etatPlanning: row.etatPlanning,
        start: row.start,
        end: row.end,
        durationHours: durationHours,
        telephonie: resolved.telephonie,
        visible: resolved.visible
      });
    }

    return result;
  }
}

// Exposition globale
window.PlanningService = PlanningService;

