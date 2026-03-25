// AppOrchestrator.js
var HQ_APP_UPDATE_CHECK_KEY = 'hq_app_update_check';
var HQ_APP_UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

var fsManager = typeof window !== 'undefined' && window.HQApp && window.HQApp.FileSystemManager;

var repository = new window.HQApp.GridRepository({
    defaultGrid: typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : null
});

function persistUpdateCheckCache(status, remoteVersion, error) {
    try {
        localStorage.setItem(HQ_APP_UPDATE_CHECK_KEY, JSON.stringify({ status: status || '', remoteVersion: remoteVersion || '', error: error || '', checkedAt: Date.now() }));
    } catch (e) {}
}

function getUpdateCheckCache() {
    try {
        var raw = localStorage.getItem(HQ_APP_UPDATE_CHECK_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data.checkedAt !== 'number') return null;
        if (Date.now() - data.checkedAt > HQ_APP_UPDATE_CHECK_TTL_MS) return null;
        return data;
    } catch (e) { return null; }
}

function app() {
    return {
        // 1. Initialisation des données de base
        grid: (repository._defaultGrid && repository._defaultGrid.sections) ? repository._defaultGrid.sections : [],
        gridTitle: (repository._defaultGrid && repository._defaultGrid.title) ? repository._defaultGrid.title : 'default',
        appConfig: (() => {
            const c = typeof CONFIG_APP !== 'undefined' ? CONFIG_APP : { duration_thresholds: { short: { min: 3, sec: 0 }, medium: { min: 6, sec: 0 } }, offers: [], target_evals: 3 };
            if (!c.updateSource) c.updateSource = { repoOwner: '', repoName: '', token: '' };
            return c;
        })(),
        
        // Formulaire actif (correspond à l'onglet sélectionné)
        form: { agent: '', campagne: '', duree_min: '', duree_sec: '', offre: '', date_communication: '', note: 0, commentaire: '', scores: {}, comments: {}, textResponses: {}, booleanResponses: {}, stats_snapshot: null, stats_analysis_comment: '' },
        
        // Contexte Dossier Agent (Nouveau)
        agentContext: {
            active: false,
            agentId: null,
            agentName: '',
            campaignName: '',
            tabs: [], // { type: 'eval'|'bilan', id: unique, label: 'Eval 1', data: {}, fileHandle: null, status: 'empty'|'loaded'|'saved' }
            activeTabIndex: 0
        },
        isPanel360Open: false,
        panel360DateFrom: '',
        panel360DateTo: '',
        isImportingStats: false,

        bilanForm: { show: false, agentName: '', evals: [], email: '', comment: '', lastSaved: null, status: 'new', hideNotesInPdf: true }, // Legacy/Used for Bilan Tab
        bilanGenerating: false,
        bilanPromptGenerated: '',
        bilanPromptModalOpen: false,
        bilanPromptTemplateEdit: '',
        evalCommentPromptTemplateEdit: '',
        reviewBilanSynthesisEdit: '',
        statsAnalysisSystemPromptEdit: '',
        emailTemplatesScoringSubjectEdit: '',
        emailTemplatesScoringBodyEdit: '',
        emailTemplatesReviewSubjectEdit: '',
        emailTemplatesReviewBodyEdit: '',
        evalCommentGenerating: false,
        isGeneratingStatsAnalysisAi: false,
        mistralApiKeyEdit: '',
        mistralApiKeyEditing: false,
        updateSourceEdit: { repoOwner: '', repoName: '', token: '' },
        updateSourceEditing: false,
        workflow: { pending: [], ready: [], done: [] },
        pendingParams: {},
        campaignConfig: null,
        rootHandle: null,
        campagnesHandle: null,
        folders: [],
        selectedAgents: [],
        selectedSupervisors: [],
        campaignAssignments: {},
        supervisorWeights: {},
        campaignAgents: [],
        assignments: {},
        forcedAssignments: {},
        poolAgents: [],
        poolFilterSite: '',
        poolFilterSearch: '',
        poolFilterSupervisor: '',
        agents: typeof LISTE_AGENTS !== 'undefined' ? LISTE_AGENTS : [],
        allAgents: typeof LISTE_AGENTS !== 'undefined' ? LISTE_AGENTS : [],
        sites: typeof LISTE_SITES !== 'undefined' ? LISTE_SITES : [],
        supervisors: typeof LISTE_SUPERVISEURS !== 'undefined' ? LISTE_SUPERVISEURS : [],
        managers: typeof LISTE_MANAGERS !== 'undefined' ? LISTE_MANAGERS : [],
        selectedFolder: null,
        isLoadingCampaign: false,
        evaluations: [],
        filesInCampaign: [],
        currentFileHandle: null,
        isEditingCampaign: false,
        currentCampaignHandle: null,
        adminShowCreateForm: false,
        campaignWizardStep: 1,
        selectedCampaignForAdmin: null,
        selectedGrilleId: 'default',
        campaignType: 'scoring',
        lastCampaignTypeForPokaYoke: 'scoring',
        period_start: '',
        period_end: '',
        statsConfig: {
            channels: { phone: true, email: true, watt: true },
            eval_start: '',
            eval_end: '',
            compare_start: '',
            compare_end: ''
        },
        statsEvaluatedPeriodDirty: false,
        grillesList: [],
        editingGridContext: null,
        currentGridId: 'default',
        isAdminCriteresPage: false,

        // Stats pour le Dashboard
        dashboardFilters: { site: '', offer: '' },
        dashboardTab: 'global', // 'global' ou 'suivi'
        allEvaluations: [], // Stockage brut
        allBilans: [], // Stockage bilans
        filteredEvaluations: [], // Stockage filtré
        charts: {}, // Stockage des instances Chart.js
        evaluationEngine: null,
        analyticsEngine: null,

        stats: { 
            moyenne: 0, 
            rubrics: {},
            evaluatedAgents: 0,
            totalAgents: 0,
            amplitude: 0,
            remaining: 0,
            totalEvaluationsTarget: 0,
            progressPercent: 0,
            supervisorProgress: [],
            avgDuration: '00:00',
            durationDistribution: { short: 0, medium: 0, long: 0 },
            siteStats: [],
            offerStats: [],
            topAgents: [],
            flopAgents: [],
            agentList: []
        },
        
        // Listes pour les filtres (dynamiques selon la campagne chargée)
        availableFilterSites: [],
        availableFilterOffers: [],
        
        hasStoredFolder: false,
        isInitializing: true,
        // Pilotage : filtre par superviseur (agents affectés)
        campaignAgentIds: [],
        campaignAssignments: {},
        campaignAssignToManager: false, // true si la campagne utilise les managers comme évaluateurs
        campaignTargetEvals: 3,
        pilotageFilterSupervisorId: '', // '' = tous les agents de la campagne ; id (string) = uniquement les agents du superviseur
        pilotageSearchAgent: '',
        // Filtres et tri page admin-agents
        agentFilterSearch: '',
        agentFilterSiteId: '',
        agentFilterManagerId: '',
        agentSortBy: 'conseiller',
        agentSortDir: 1, // 1 = asc, -1 = desc
        pilotageProgressPercent: 0, // avancement du périmètre affiché (campagne ou superviseur sélectionné)
        notification: { show: false, message: '', type: 'success' },
        newCampaignName: '',
        targetEvaluations: 3,
        assignToManager: false,
        chart: null,
        saveStatus: 'Enregistré',
        autoSaveTimeout: null,
        lastPersistedGridJson: '',
        lastPersistedEvalJson: '',
        autoSaveTimeoutEval: null,
        lastSavedBilanComment: '',
        evalSaveStatus: 'Enregistré',
        isCampaignClosed: false,

        // Mise à jour depuis GitHub
        updateCheck: { status: 'idle', remoteVersion: '', error: '' },
        updateRunning: false,
        _updateCheckIntervalId: null,

        notify(message, type = 'success') {
            this.notification = { show: true, message, type };
            setTimeout(() => { this.notification.show = false; }, 3500);
        },

        get appRootPathForCopy() {
            if (typeof location === 'undefined' || location.protocol !== 'file:') return null;
            let pathname = location.pathname || '';
            if (!pathname) return null;
            let root;
            if (pathname.indexOf('/App_Sources/') !== -1) {
                root = pathname.substring(0, pathname.indexOf('/App_Sources/'));
            } else {
                const lastSlash = pathname.lastIndexOf('/');
                root = lastSlash <= 0 ? pathname : pathname.substring(0, lastSlash);
            }
            if (!root) return null;
            try {
                root = decodeURIComponent(root);
            } catch (e) { return null; }
            if (root.charAt(0) === '/') root = root.substring(1);
            if (/^[A-Za-z]:/.test(root) || root.indexOf('/') !== -1) root = root.replace(/\//g, '\\');
            return root || null;
        },

        copyAppRootPath() {
            const path = this.appRootPathForCopy;
            if (!path) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(path).then(() => this.notify('Chemin copié.', 'success')).catch(() => {});
            }
        },

        copyShareLink() {
            const params = typeof window !== 'undefined' && window.location && window.location.search ? window.location.search : '';
            if (!params) {
                this.notify('Aucun paramètre à partager (ouvrez un dossier agent).', 'error');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(params).then(() => this.notify('Lien de partage copié !')).catch(() => this.notify('Impossible de copier.', 'error'));
            } else {
                this.notify('Impossible de copier.', 'error');
            }
        },

        openSharedLink() {
            const raw = window.prompt("Collez le lien de partage ici (URL ou paramètres à partir de ?) :");
            if (raw == null || (typeof raw === 'string' && !raw.trim())) return;
            const s = String(raw).trim();
            const query = s.indexOf('?') >= 0 ? s.substring(s.indexOf('?')) : (s ? '?' + s : '');
            if (!query) {
                if (typeof this !== 'undefined' && this.notify) this.notify('Lien non reconnu.', 'error');
                else if (typeof window !== 'undefined' && window.alert) window.alert('Lien non reconnu.');
                return;
            }
            const params = new URLSearchParams(query);
            const tab = params.get('tab');
            const isDashboardLink = tab === 'production' || tab === 'agent360' || tab === 'campagnes';
            const isSaisieLink = params.has('agent') || query.includes('agent=');
            const base = typeof window !== 'undefined' && window.location ? window.location.pathname || '' : '';
            const dashboardPath = base.includes('/') ? base.replace(/[^/]+$/, 'dashboard.html') : 'dashboard.html';
            const saisiePath = base.includes('/') ? base.replace(/[^/]+$/, 'saisie.html') : 'saisie.html';
            if (isDashboardLink) {
                window.location.href = dashboardPath + query;
                return;
            }
            if (isSaisieLink) {
                window.location.href = saisiePath + query;
                return;
            }
            if (typeof this !== 'undefined' && this.notify) this.notify('Lien non reconnu (dashboard : tab=campagnes|production|agent360 ; saisie : agent=).', 'error');
            else if (typeof window !== 'undefined' && window.alert) window.alert('Lien non reconnu (dashboard : tab=campagnes|production|agent360 ; saisie : agent=).');
        },

        updateDashboardUrl() {
            const pathname = window.location.pathname || '';
            if (!pathname.includes('dashboard')) return;
            const store = window.Alpine && window.Alpine.store && window.Alpine.store('dashboard');
            if (!store) return;
            let query = '';
            const tab = store.activeTab;
            if (tab === 'campagnes') {
                query = 'tab=campagnes';
                if (this.selectedFolder) query += '&campagne=' + encodeURIComponent(this.selectedFolder);
                if (this.dashboardFilters && this.dashboardFilters.site) query += '&site=' + encodeURIComponent(this.dashboardFilters.site);
                if (this.dashboardFilters && this.dashboardFilters.offer) query += '&offre=' + encodeURIComponent(this.dashboardFilters.offer);
            } else if (tab === 'production') {
                query = 'tab=production&perimetre=' + (store.prodPerimeter || 'global');
                if (store.prodPerimeter === 'manager' && store.prodSelectedManager) query += '&managerId=' + encodeURIComponent(store.prodSelectedManager);
                if (store.selectedDateFrom) query += '&dateFrom=' + encodeURIComponent(store.selectedDateFrom);
                if (store.selectedDateTo) query += '&dateTo=' + encodeURIComponent(store.selectedDateTo);
            } else if (tab === 'agent360') {
                query = 'tab=agent360';
                if (store.selectedAgent360) query += '&agentId=' + encodeURIComponent(store.selectedAgent360);
                if (store.selectedDateFrom) query += '&dateFrom=' + encodeURIComponent(store.selectedDateFrom);
                if (store.selectedDateTo) query += '&dateTo=' + encodeURIComponent(store.selectedDateTo);
            } else {
                return;
            }
            const base = pathname || 'dashboard.html';
            window.history.replaceState(null, '', base + (query ? '?' + query : ''));
        },

        copyDashboardShareLink() {
            const pathname = window.location.pathname || '';
            if (!pathname.includes('dashboard')) {
                this.notify('Cette action est disponible sur le dashboard.', 'error');
                return;
            }
            const search = window.location.search || '';
            if (!search) {
                this.notify('Aucune vue à partager (paramètres d’URL vides).', 'error');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(search).then(() => this.notify('Lien de la vue copié !', 'success')).catch(() => this.notify('Impossible de copier.', 'error'));
            } else {
                this.notify('Impossible de copier.', 'error');
            }
        },

        // --- MISE À JOUR DEPUIS GITHUB (délégation à update.js) ---
        async checkForUpdate() {
            const src = this.appConfig.updateSource || {};
            const owner = (src.repoOwner || '').trim();
            const repo = (src.repoName || '').trim();
            if (!owner || !repo) {
                this.updateCheck = { status: 'idle', remoteVersion: '', error: '' };
                return;
            }
            if (typeof window.HQ_APP_UPDATE === 'undefined') {
                this.updateCheck = { status: 'error', remoteVersion: '', error: 'Module de mise à jour non chargé.' };
                return;
            }
            this.updateCheck = { status: 'checking', remoteVersion: '', error: '' };
            try {
                const result = await window.HQ_APP_UPDATE.checkForUpdate({
                    owner,
                    repo,
                    token: (src.token || '').trim()
                });
                this.updateCheck = { status: result.status, remoteVersion: result.remoteVersion || '', error: result.error || '' };
                persistUpdateCheckCache(this.updateCheck.status, this.updateCheck.remoteVersion, this.updateCheck.error);
            } catch (e) {
                this.updateCheck = { status: 'error', remoteVersion: '', error: e.message || 'Impossible de vérifier les mises à jour' };
                persistUpdateCheckCache(this.updateCheck.status, this.updateCheck.remoteVersion, this.updateCheck.error);
            }
        },

        async runUpdate() {
            if (this.updateRunning || !this.rootHandle) return;
            const src = this.appConfig.updateSource || {};
            const owner = (src.repoOwner || '').trim();
            const repo = (src.repoName || '').trim();
            const token = (src.token || '').trim();
            if (!owner || !repo) {
                this.notify('Source de mise à jour non configurée.', 'error');
                return;
            }
            if (typeof window.HQ_APP_UPDATE === 'undefined') {
                this.notify('Module de mise à jour non chargé.', 'error');
                return;
            }
            this.updateRunning = true;
            this.updateCheck = { ...this.updateCheck, status: 'checking' };
            try {
                await window.HQ_APP_UPDATE.runUpdate({ rootHandle: this.rootHandle, owner, repo, token });
                this.updateCheck = { status: 'current', remoteVersion: '', error: '' };
                persistUpdateCheckCache('current', '', '');
                this.notify('Mise à jour terminée. Rechargez la page.', 'success');
                if (confirm('Mise à jour terminée. Recharger la page maintenant ?')) location.reload();
            } catch (e) {
                this.updateCheck = { ...this.updateCheck, status: 'error', error: e.message || 'Erreur lors de la mise à jour' };
                this.notify(e.message || 'Erreur lors de la mise à jour', 'error');
            } finally {
                this.updateRunning = false;
            }
        },

        deployLogs: [],
        deployRunning: false,
        releases: [],
        releasesLoading: false,
        releasesError: '',
        async loadReleases() {
            const src = this.appConfig.updateSource || {};
            const owner = (src.repoOwner || '').trim();
            const repo = (src.repoName || '').trim();
            const token = (src.token || '').trim();
            if (!owner || !repo) {
                this.releases = [];
                this.releasesError = 'Source de mise à jour non configurée.';
                this.releasesLoading = false;
                return;
            }
            if (typeof window.HQ_APP_UPDATE === 'undefined' || typeof window.HQ_APP_UPDATE.fetchReleases !== 'function') {
                this.releases = [];
                this.releasesError = 'Module de mise à jour non chargé.';
                this.releasesLoading = false;
                return;
            }
            this.releasesLoading = true;
            this.releasesError = '';
            try {
                const result = await window.HQ_APP_UPDATE.fetchReleases({ owner, repo, token });
                const raw = result.releases || [];
                const parseMd = typeof marked !== 'undefined' && typeof marked.parse === 'function' ? marked.parse : null;
                this.releases = raw.map(function (r) {
                    var body = r.body || 'Aucune note.';
                    var bodyHtml = parseMd ? parseMd(body) : body.replace(/\n/g, '<br>');
                    return { version: r.version, tag_name: r.tag_name, name: r.name, body: body, bodyHtml: bodyHtml, published_at: r.published_at };
                });
                this.releasesError = result.error || '';
            } catch (e) {
                this.releases = [];
                this.releasesError = e.message || 'Erreur lors du chargement des releases.';
            } finally {
                this.releasesLoading = false;
            }
        },
        formatReleaseDate(iso) {
            if (!iso) return '';
            try {
                const d = new Date(iso);
                return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch (e) { return ''; }
        },
        async runUpdateFromDeployPage() {
            if (this.deployRunning || !this.rootHandle) return;
            const src = this.appConfig.updateSource || {};
            const owner = (src.repoOwner || '').trim();
            const repo = (src.repoName || '').trim();
            const token = (src.token || '').trim();
            if (!owner || !repo) {
                this.notify('Source de mise à jour non configurée.', 'error');
                return;
            }
            if (typeof window.HQ_APP_UPDATE === 'undefined') {
                this.notify('Module de mise à jour non chargé.', 'error');
                return;
            }
            this.deployRunning = true;
            this.deployLogs = [];
            try {
                await window.HQ_APP_UPDATE.runUpdate({
                    rootHandle: this.rootHandle,
                    owner: owner,
                    repo: repo,
                    token: token,
                    onLog: function (msg) { this.deployLogs.push(msg); }.bind(this)
                });
                this.deployLogs.push('Terminé.');
            } catch (e) {
                this.deployLogs.push('[ERROR] ' + (e.message || e));
            } finally {
                this.deployRunning = false;
            }
        },

        get bilanCommentDirty() {
            if (!this.agentContext.active || !this.agentContext.tabs[this.agentContext.activeTabIndex]) return false;
            if (this.agentContext.tabs[this.agentContext.activeTabIndex].type !== 'bilan') return false;
            return (this.bilanForm.comment || '').trim() !== this.lastSavedBilanComment;
        },

        get badgeDuree() {
            const min = parseInt(this.form.duree_min) || 0;
            const sec = parseInt(this.form.duree_sec) || 0;
            
            if (!this.form.duree_min && !this.form.duree_sec && this.form.duree_min !== 0) return null;

            const totalMinutes = min + (sec / 60);
            
            const shortConfig = this.appConfig.duration_thresholds.short;
            const mediumConfig = this.appConfig.duration_thresholds.medium;

            const shortThreshold = shortConfig.min + (shortConfig.sec / 60);
            const mediumThreshold = mediumConfig.min + (mediumConfig.sec / 60);
            
            if (totalMinutes < shortThreshold) return { label: 'COURTE', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
            if (totalMinutes >= shortThreshold && totalMinutes <= mediumThreshold) return { label: 'MOYENNE', color: 'bg-amber-100 text-amber-700 border-amber-200' };
            return { label: 'LONGUE', color: 'bg-rose-100 text-rose-700 border-rose-200' };
        },

        get pilotageSupervisorOptions() {
            const a = this.campaignAssignments || {};
            return Object.keys(a).filter(k => (a[k].agent_ids || []).length > 0).map(supId => {
                const nom = this.getEvaluatorName(supId, this.campaignAssignToManager);
                return { id: supId, nom: nom !== 'Aucun' ? nom : 'Évaluateur ' + supId };
            });
        },

        _normalizePromptsConfig() {
            if (!this.appConfig.prompts) {
                this.appConfig.prompts = { scoring: { evalComment: '', bilanSynthesis: '' }, review: { bilanSynthesis: '', statsAnalysisSystem: '' } };
            }
            if (!this.appConfig.prompts.scoring) this.appConfig.prompts.scoring = { evalComment: '', bilanSynthesis: '' };
            if (!this.appConfig.prompts.review) this.appConfig.prompts.review = { bilanSynthesis: '', statsAnalysisSystem: '' };
            if (this.appConfig.evalCommentPromptTemplate != null && String(this.appConfig.evalCommentPromptTemplate).trim() !== '') {
                this.appConfig.prompts.scoring.evalComment = this.appConfig.evalCommentPromptTemplate;
                delete this.appConfig.evalCommentPromptTemplate;
            }
            if (this.appConfig.bilanPromptTemplate != null && String(this.appConfig.bilanPromptTemplate).trim() !== '') {
                this.appConfig.prompts.scoring.bilanSynthesis = this.appConfig.bilanPromptTemplate;
                delete this.appConfig.bilanPromptTemplate;
            }
            if (!this.appConfig.prompts.scoring.evalComment || this.appConfig.prompts.scoring.evalComment.trim() === '') {
                this.appConfig.prompts.scoring.evalComment = this.getDefaultEvalCommentPromptTemplate();
            }
            if (!this.appConfig.prompts.scoring.bilanSynthesis || this.appConfig.prompts.scoring.bilanSynthesis.trim() === '') {
                this.appConfig.prompts.scoring.bilanSynthesis = this.getDefaultBilanPromptTemplate();
            }
            if (!this.appConfig.prompts.review.bilanSynthesis || this.appConfig.prompts.review.bilanSynthesis.trim() === '') {
                this.appConfig.prompts.review.bilanSynthesis = this.getDefaultReviewBilanSynthesisTemplate();
            }
            if (!this.appConfig.prompts.review.statsAnalysisSystem || this.appConfig.prompts.review.statsAnalysisSystem.trim() === '') {
                this.appConfig.prompts.review.statsAnalysisSystem = this.getDefaultStatsAnalysisSystemPromptTemplate();
            }
        },

        _normalizeEmailTemplatesConfig() {
            var scoringSubject = 'Bilan Qualité - {{agent}}';
            var scoringBody = 'Bonjour {{agent}},\n\nVeuillez trouver ci-joint votre bilan qualité pour la campagne {{campagne}} du {{date}}.\n\nVotre note moyenne est de : {{note}}/10.\n\nSynthèse du superviseur :\n{{synthese}}\n\nCordialement,';
            var reviewSubject = 'Bilan Entretien - {{agent}}';
            var reviewBody = 'Bonjour {{agent}},\n\nVeuillez trouver ci-joint le compte-rendu de notre entretien pour la campagne {{campagne}} du {{date}}.\n\nSynthèse des échanges :\n{{synthese}}\n\nCordialement,';
            if (!this.appConfig.emailTemplates || typeof this.appConfig.emailTemplates !== 'object') {
                this.appConfig.emailTemplates = {
                    scoring: { subject: scoringSubject, body: scoringBody },
                    review: { subject: reviewSubject, body: reviewBody }
                };
                return;
            }
            if (!this.appConfig.emailTemplates.scoring || typeof this.appConfig.emailTemplates.scoring !== 'object') {
                this.appConfig.emailTemplates.scoring = { subject: scoringSubject, body: scoringBody };
            } else {
                if (!this.appConfig.emailTemplates.scoring.subject) this.appConfig.emailTemplates.scoring.subject = scoringSubject;
                if (!this.appConfig.emailTemplates.scoring.body) this.appConfig.emailTemplates.scoring.body = scoringBody;
            }
            if (!this.appConfig.emailTemplates.review || typeof this.appConfig.emailTemplates.review !== 'object') {
                this.appConfig.emailTemplates.review = { subject: reviewSubject, body: reviewBody };
            } else {
                if (!this.appConfig.emailTemplates.review.subject) this.appConfig.emailTemplates.review.subject = reviewSubject;
                if (!this.appConfig.emailTemplates.review.body) this.appConfig.emailTemplates.review.body = reviewBody;
            }
        },

        // --- GESTION CONFIG GLOBALE ---
        async saveAppConfig() {
            try {
                if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
                await fsManager.writeAppConfig(this.rootHandle, this.appConfig);
                this.notify("Configuration sauvegardée !");
            } catch (e) { this.notify("Erreur sauvegarde config.", "error"); }
        },

        addOffer(offer) {
            if (offer && !this.appConfig.offers.includes(offer)) {
                this.appConfig.offers.push(offer);
                this.saveAppConfig();
            }
        },

        removeOffer(index) {
            if (confirm("Supprimer cette offre ?")) {
                this.appConfig.offers.splice(index, 1);
                this.saveAppConfig();
            }
        },

        // --- GETTER : Nécessaire pour l'affichage des agents par équipe ---
        get groupedEvaluations() {
            if (!this.filesInCampaign || this.filesInCampaign.length === 0) return [];
            
            const groups = this.filesInCampaign.reduce((acc, file) => {
                const agentName = file.displayName || 'Inconnu';
                const teamName = file.displayTeam || 'Inconnu';
                
                if (!acc[agentName]) {
                    acc[agentName] = {
                        agent: agentName,
                        team: teamName,
                        files: []
                    };
                }
                acc[agentName].files.push(file);
                return acc;
            }, {});

            return Object.values(groups).sort((a, b) => a.agent.localeCompare(b.agent));
        },

        get groupedAgents() {
            const groups = this.agents.reduce((acc, agent) => {
                const siteId = parseInt(agent.siteId);
                const site = this.sites.find(s => parseInt(s.id) === siteId);
                const siteName = site ? site.nom : 'Sans site';
                
                if (!acc[siteName]) acc[siteName] = [];
                acc[siteName].push(agent);
                return acc;
            }, {});

            return Object.entries(groups)
                .map(([siteName, agents]) => ({ 
                    site: siteName, 
                    agents: agents.sort((a, b) => {
                        const cmp = (a.nom || '').localeCompare(b.nom || '');
                        return cmp !== 0 ? cmp : (a['pr\u00e9nom'] || '').localeCompare(b['pr\u00e9nom'] || '');
                    })
                }))
                .sort((a, b) => a.site.localeCompare(b.site));
        },

        getSiteName(id) {
            // Conversion en entier pour la comparaison
            const siteId = parseInt(id);
            const s = this.sites.find(site => parseInt(site.id) === siteId);
            return s ? s.nom : 'Inconnu';
        },

        // --- GESTION DES SITES ---
        async saveSitesList() {
            try {
                if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
                await fsManager.writeSites(this.rootHandle, this.sites);
                this.notify("Sites mis à jour !");
            } catch (e) { this.notify("Erreur d'écriture sites.", "error"); }
        },

        addSite(nom) {
            if (!nom) return;
            const newId = this.sites.length > 0 ? Math.max(...this.sites.map(s => s.id)) + 1 : 1;
            this.sites.push({ id: newId, nom: nom.trim() });
            this.saveSitesList();
        },

        updateSite(id, newName) {
            const site = this.sites.find(s => s.id === id);
            if (site && newName) {
                site.nom = newName.trim();
                this.saveSitesList();
            }
        },

        deleteSite(id) {
            // Vérifier si des agents sont liés
            const hasAgents = this.agents.some(a => a.siteId === id);
            if (hasAgents) {
                return this.notify("Impossible : des agents sont liés à ce site.", "error");
            }
            if (confirm("Supprimer ce site définitivement ?")) {
                this.sites = this.sites.filter(s => s.id !== id);
                this.saveSitesList();
            }
        },

        // --- GESTION DES SUPERVISEURS ---
        async saveSupervisorsList() {
            try {
                if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
                await fsManager.writeSupervisors(this.rootHandle, this.supervisors);
                this.notify("Superviseurs mis à jour !");
            } catch (e) { this.notify("Erreur d'écriture superviseurs.", "error"); }
        },

        addSupervisor(nom, email, weight) {
            if (!nom || !email) return this.notify("Nom et email requis.", "error");
            const newId = this.supervisors.length > 0 ? Math.max(...this.supervisors.map(s => s.id)) + 1 : 1;
            this.supervisors.push({ 
                id: newId, 
                nom: nom.trim(), 
                email: email.trim(), 
                default_weight: parseInt(weight) || 100 
            });
            this.saveSupervisorsList();
        },

        updateSupervisor(id, newName, newEmail, newWeight) {
            const supervisor = this.supervisors.find(s => s.id === id);
            if (supervisor && newName && newEmail) {
                supervisor.nom = newName.trim();
                supervisor.email = newEmail.trim();
                supervisor.default_weight = parseInt(newWeight) || 100;
                this.saveSupervisorsList();
            }
        },

        deleteSupervisor(id) {
            // Vérifier si des agents sont liés
            const hasAgents = this.allAgents.some(a => (a.managerId != null && a.managerId === id) || (a.supervisorId != null && a.supervisorId === id));
            if (hasAgents) {
                return this.notify("Impossible : des agents sont liés à ce superviseur.", "error");
            }
            if (confirm("Supprimer ce superviseur définitivement ?")) {
                this.supervisors = this.supervisors.filter(s => s.id !== id);
                this.saveSupervisorsList();
            }
        },

        // --- GESTION DES MANAGERS ---
        async saveManagersList() {
            try {
                if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
                await fsManager.writeManagers(this.rootHandle, this.managers);
                this.notify("Managers mis à jour !");
            } catch (e) { this.notify("Erreur d'écriture managers.", "error"); }
        },

        addManager(nom, email) {
            if (!nom || !email) return this.notify("Nom et email requis.", "error");
            const newId = this.managers.length > 0 ? Math.max(...this.managers.map(m => m.id)) + 1 : 1;
            this.managers.push({ id: newId, nom: nom.trim(), email: email.trim() });
            this.saveManagersList();
        },

        updateManager(id, newName, newEmail) {
            const manager = this.managers.find(m => m.id === id);
            if (manager && newName && newEmail) {
                manager.nom = newName.trim();
                manager.email = newEmail.trim();
                this.saveManagersList();
            }
        },

        deleteManager(id) {
            const hasAgents = this.allAgents.some(a => a.managerId != null && parseInt(a.managerId) === parseInt(id));
            if (hasAgents) {
                return this.notify("Impossible : des agents sont liés à ce manager.", "error");
            }
            if (confirm("Supprimer ce manager définitivement ?")) {
                this.managers = this.managers.filter(m => m.id !== id);
                this.saveManagersList();
            }
        },

        getSupervisorName(id) {
            if (id == null || id === '') return 'Aucun';
            const numId = parseInt(id, 10);
            const sup = this.supervisors.find(s => Number(s.id) === numId);
            return sup ? sup.nom : 'Aucun';
        },

        getManagerName(id) {
            if (id == null || id === '') return 'Aucun';
            const numId = parseInt(id, 10);
            const m = this.managers.find(mgr => Number(mgr.id) === numId);
            return m ? m.nom : 'Aucun';
        },

        getEvaluatorName(id, isManagerCampaign) {
            if (id == null || id === '') return 'Aucun';
            if (isManagerCampaign) return this.getManagerName(id);
            return this.getSupervisorName(id);
        },

        formatDateToFR(dateString) {
            if (!dateString || typeof dateString !== 'string') return '';
            const trimmed = dateString.trim();
            if (!trimmed) return '';
            const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return '';
            return m[3] + '/' + m[2] + '/' + m[1];
        },

        formatSecondsToMMSS(value) {
            const n = Number(value);
            const total = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
            const minutes = Math.floor(total / 60);
            const seconds = total % 60;
            return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        },

        formatPercentInt(value) {
            const n = Number(value);
            const v = Number.isFinite(n) ? Math.round(n) : 0;
            return String(v) + '%';
        },

        formatDeltaPercent(agentValue, benchmarkValue) {
            const a = Number(agentValue);
            const b = Number(benchmarkValue);
            if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return '(0%)';
            const pct = Math.round(((a - b) / b) * 100);
            if (pct > 0) return '(+' + pct + '%)';
            return '(' + pct + '%)';
        },

        getDeltaClass(agentValue, benchmarkValue, lowerIsBetter) {
            const a = Number(agentValue);
            const b = Number(benchmarkValue);
            if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 'text-slate-400';
            const diff = a - b;
            if (diff === 0) return 'text-slate-400';
            if (lowerIsBetter) return diff < 0 ? 'text-emerald-600' : 'text-rose-600';
            return diff > 0 ? 'text-emerald-600' : 'text-rose-600';
        },

        getAgentDisplayName(agent) {
            return agent && agent['pr\u00e9nom'] && agent.nom ? `${agent.nom.toUpperCase()} ${agent['pr\u00e9nom']}` : '';
        },
        getAgentById(id) {
            return this.allAgents.find(a => a.id === parseInt(id)) || null;
        },
        getFilteredAndSortedAgents() {
            let list = this.agents || [];
            const q = (this.agentFilterSearch || '').trim().toLowerCase();
            if (q) {
                list = list.filter(a => {
                    const nom = (a.nom || '').toLowerCase();
                    const prenom = (a['pr\u00e9nom'] || '').toLowerCase();
                    const matricule = (a.matricule || '').toLowerCase();
                    const email = (a.email || '').toLowerCase();
                    const display = `${nom} ${prenom}`.trim();
                    return display.includes(q) || matricule.includes(q) || email.includes(q) || nom.includes(q) || prenom.includes(q);
                });
            }
            if (this.agentFilterSiteId !== '' && this.agentFilterSiteId != null) {
                const sid = parseInt(this.agentFilterSiteId, 10);
                list = list.filter(a => parseInt(a.siteId) === sid);
            }
            if (this.agentFilterManagerId !== '' && this.agentFilterManagerId != null) {
                const mgrId = parseInt(this.agentFilterManagerId, 10);
                list = list.filter(a => a.managerId != null && parseInt(a.managerId) === mgrId);
            }
            const key = this.agentSortBy || 'conseiller';
            const dir = this.agentSortDir === -1 ? -1 : 1;
            list = [...list].sort((a, b) => {
                let cmp = 0;
                if (key === 'conseiller') {
                    const na = (a.nom || '').localeCompare(b.nom || '', 'fr');
                    cmp = na !== 0 ? na : (a['pr\u00e9nom'] || '').localeCompare(b['pr\u00e9nom'] || '', 'fr');
                } else if (key === 'matricule') cmp = (a.matricule || '').localeCompare(b.matricule || '', 'fr');
                else if (key === 'email') cmp = (a.email || '').localeCompare(b.email || '', 'fr');
                else if (key === 'site') cmp = (this.getSiteName(a.siteId) || '').localeCompare(this.getSiteName(b.siteId) || '', 'fr');
                else if (key === 'manager') cmp = (this.getManagerName(a.managerId) || '').localeCompare(this.getManagerName(b.managerId) || '', 'fr');
                return cmp * dir;
            });
            return list;
        },
        setAgentSort(col) {
            if (this.agentSortBy === col) this.agentSortDir = -this.agentSortDir;
            else { this.agentSortBy = col; this.agentSortDir = 1; }
        },

        // --- ALGORITHME DE RÉPARTITION ---
        calculateAssignments(selectedSupervisors, poolAgents, forcedAssignments = {}, existingAssignments = {}) {
            // Vérifications de base
            if (!selectedSupervisors.length || !poolAgents.length) {
                return { assignments: {}, conflicts: [] };
            }

            // 1. Nombre total d'agents (pool + déjà assignés) pour un quota proportionnel au total
            const alreadyAssignedPerSup = {};
            let totalAlreadyAssigned = 0;
            selectedSupervisors.forEach(sup => {
                const list = existingAssignments[sup.id] || [];
                alreadyAssignedPerSup[sup.id] = list.length;
                totalAlreadyAssigned += list.length;
            });
            const totalAgents = poolAgents.length + totalAlreadyAssigned;

            // 2. Quota cible par superviseur = part proportionnelle du total, moins ce qu'il a déjà
            const totalWeight = selectedSupervisors.reduce((sum, sup) => sum + sup.weight, 0);
            const quotas = {};
            const initialQuotas = {};
            selectedSupervisors.forEach(sup => {
                const targetTotal = Math.round((sup.weight / totalWeight) * totalAgents);
                const already = alreadyAssignedPerSup[sup.id] || 0;
                const remaining = Math.max(0, targetTotal - already);
                quotas[sup.id] = remaining;
                initialQuotas[sup.id] = remaining;
            });

            // 3. Mélanger aléatoirement le pool (évite biais alphabétique)
            const shuffledPool = [...poolAgents].sort(() => Math.random() - 0.5);

            // 4. Structure pour stocker les résultats
            const assignments = {};
            const conflicts = [];
            selectedSupervisors.forEach(sup => {
                assignments[sup.id] = [];
            });

            // 5. Scoring et assignation
            shuffledPool.forEach(agent => {
                let bestScore = -Infinity;
                let bestSupId = null;

                selectedSupervisors.forEach(sup => {
                    // Ne considérer que les superviseurs ayant encore du quota
                    if (quotas[sup.id] <= 0) return;

                    let score = 100; // Score de base

                    // Pénalité MAJEURE si conflit d'intérêt (agent managé par ce superviseur / manager)
                    const managerId = agent.managerId != null ? agent.managerId : agent.supervisorId;
                    if (managerId === sup.id) {
                        score -= 1000;
                    }

                    // Bonus d'équilibrage : favoriser les superviseurs éloignés de leur quota
                    if (initialQuotas[sup.id] > 0) {
                        const fillRate = (initialQuotas[sup.id] - quotas[sup.id]) / initialQuotas[sup.id];
                        score += (1 - fillRate) * 50; // Bonus jusqu'à 50 points
                    }

                    // Mise à jour du meilleur score
                    if (score > bestScore) {
                        bestScore = score;
                        bestSupId = sup.id;
                    }
                });

                // Assignation
                if (bestSupId !== null) {
                    assignments[bestSupId].push(agent.id);
                    quotas[bestSupId]--;

                    // Détecter les conflits
                    const agentManagerId = agent.managerId != null ? agent.managerId : agent.supervisorId;
                    if (agentManagerId === bestSupId) {
                        conflicts.push({
                            agent: agent.id,
                            supervisor: selectedSupervisors.find(s => s.id === bestSupId).nom,
                            reason: "direct_manager"
                        });
                    }
                } else {
                    // Dépassement des quotas (arrondis) : attribuer au superviseur qui a le moins d'agents au total
                    const existing = existingAssignments || {};
                    const totals = selectedSupervisors.map(sup => ({
                        sup,
                        total: (existing[sup.id]?.length || 0) + (assignments[sup.id]?.length || 0)
                    }));
                    totals.sort((a, b) => a.total - b.total);
                    const fallbackSup = totals[0].sup;
                    assignments[fallbackSup.id].push(agent.id);

                    const agentMgrId = agent.managerId != null ? agent.managerId : agent.supervisorId;
                    if (agentMgrId === fallbackSup.id) {
                        conflicts.push({
                            agent: agent.id,
                            supervisor: fallbackSup.nom,
                            reason: "forced_no_quota"
                        });
                    }
                }
            });

            return { assignments, conflicts };
        },

        async filterAgentsForCampaign(campaignName) {
            if (!campaignName) {
                this.agents = [...this.allAgents];
                return;
            }
            if (!fsManager) { this.agents = [...this.allAgents]; return; }
            try {
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(campaignName);
                try {
                    const config = await fsManager.readCampaignConfig(campaignHandle);
                    if (config && config.agent_ids && Array.isArray(config.agent_ids)) {
                        this.agents = this.allAgents.filter(a => config.agent_ids.includes(a.id));
                    } else {
                        this.agents = [...this.allAgents];
                    }
                } catch (e) {
                    this.agents = [...this.allAgents];
                }
            } catch (e) {
                console.error("Erreur filtre agents:", e);
                this.agents = [...this.allAgents];
            }
        },

        // --- INITIALISATION ---
        _migrateAgentsSupervisorToManager(agentList) {
            if (!agentList || !Array.isArray(agentList)) return false;
            let migrated = false;
            agentList.forEach(function (a) {
                if (a.hasOwnProperty('supervisorId') && (a.managerId == null || a.managerId === undefined)) {
                    a.managerId = a.supervisorId;
                    delete a.supervisorId;
                    migrated = true;
                }
            });
            return migrated;
        },

        async init() {
            window.openSharedLink = () => this.openSharedLink();
            if (typeof window !== 'undefined') {
                window.HQAppAppInstance = this;
            }
            this.isInitializing = true;
            this.isAdminCriteresPage = /admin-criteres\.html$/i.test(window.location.pathname || '');
            this._setEnginesFromCampaignType('scoring');

            // Migration silencieuse : supervisorId -> managerId (en mémoire)
            this._migrateAgentsSupervisorToManager(this.agents);
            if (this.allAgents !== this.agents) this._migrateAgentsSupervisorToManager(this.allAgents);

            // Sécurisation : Vérification du chargement de la configuration (seulement sur les pages de saisie)
            const needsGrid = window.location.pathname.includes('saisie.html');
            if (needsGrid && this.agentContext.active && (!this.grid || !this.grid.length)) console.warn("La grille d'évaluation n'est pas chargée ou est vide.");
            if (!this.agents || this.agents.length === 0) console.warn("Attention : Liste des agents vide ou non chargée.");

            // Migration compatibilité config
            if (typeof this.appConfig.duration_thresholds.short === 'number') {
                this.appConfig.duration_thresholds.short = { min: this.appConfig.duration_thresholds.short, sec: 0 };
            }
            if (typeof this.appConfig.duration_thresholds.medium === 'number') {
                this.appConfig.duration_thresholds.medium = { min: this.appConfig.duration_thresholds.medium, sec: 0 };
            }

            // Migration à la volée : prompts imbriqués (fallback depuis clés plates)
            this._normalizePromptsConfig();
            this._normalizeEmailTemplatesConfig();

            // État initial du formulaire (polymorphe) et état collapsed / pas pour champs scoring
            if (this.evaluationEngine && this.evaluationEngine.getDefaultFormState) {
                Object.assign(this.form, this.evaluationEngine.getDefaultFormState({ sections: this.grid }));
            }
            var sections = this.grid || [];
            sections.forEach(function (sec) {
                sec.collapsed = true;
                (sec.fields || []).forEach(function (field) {
                    if (field.type === 'scoring') {
                        var opts = this.getStepOptions(field.max);
                        if (field.step == null || field.step === undefined) {
                            field.step = opts[0] ?? 0.5;
                        } else {
                            var stepHalf = Math.round(parseFloat(field.step) * 2) / 2;
                            field.step = opts.includes(stepHalf) ? stepHalf : (opts[0] ?? 0.5);
                        }
                    }
                }.bind(this));
            }.bind(this));
            this.updateNote();
            this.lastPersistedGridJson = JSON.stringify(sections.map(function (sec) { var collapsed = sec.collapsed; var rest = Object.assign({}, sec); delete rest.collapsed; return rest; }));

            // Gestion des paramètres d'URL pour pré-remplissage
            const urlParams = new URLSearchParams(window.location.search);
            this.pendingParams = {
                agent: urlParams.get('agent'),
                campagne: urlParams.get('campagne'),
                tab: urlParams.get('tab') // 'bilan' ou index
            };
            
            // Surveillance pour l'auto-save de la grille (uniquement si les données persistables ont changé, pas collapsed)
            this.$watch('grid', () => {
                if (this.isInitializing) return;
                var secs = this.grid || [];
                const cleanGrid = secs.map(sec => { const { collapsed, ...rest } = sec; return rest; });
                if (JSON.stringify(cleanGrid) === this.lastPersistedGridJson) return;
                this.triggerAutoSave();
            });

            // Auto-save éval (Dossier Agent, onglet eval uniquement)
            this.$watch('form', () => {
                if (this.isInitializing) return;
                if (!this.agentContext.active || this.agentContext.tabs[this.agentContext.activeTabIndex]?.type !== 'eval') return;
                const snapshot = JSON.stringify(this.form);
                if (snapshot === this.lastPersistedEvalJson) return;
                this.triggerAutoSaveEval();
            }, { deep: true });
            
            this.$watch('form.campagne', async (val) => {
                if (val && !this.agentContext.active) this.filterAgentsForCampaign(val);
                if (val && this.rootHandle && this.campagnesHandle) await this.loadGridForCampaign(val);
            });
            this.$watch('period_start', (val) => {
                if (this.campaignType !== 'review') return;
                if (this.statsEvaluatedPeriodDirty) return;
                this.statsConfig.eval_start = val || '';
            });
            this.$watch('period_end', (val) => {
                if (this.campaignType !== 'review') return;
                if (this.statsEvaluatedPeriodDirty) return;
                this.statsConfig.eval_end = val || '';
            });

            try {
                this.rootHandle = await this.getStoredHandle();
                if (this.rootHandle) {
                    const options = { mode: 'readwrite' };
                    if (await this.rootHandle.queryPermission(options) === 'granted') {
                        try {
                            this.campagnesHandle = await this.rootHandle.getDirectoryHandle('Campagnes');
                            this.hasStoredFolder = true;
                            if (fsManager) {
                                try {
                                    const loaded = await fsManager.readAgents(this.rootHandle);
                                    if (loaded && Array.isArray(loaded)) {
                                        const migrated = this._migrateAgentsSupervisorToManager(loaded);
                                        this.agents = loaded;
                                        this.allAgents = loaded;
                                        if (migrated) await fsManager.writeAgents(this.rootHandle, loaded);
                                    }
                                } catch (e) { /* garder liste script */ }
                                try {
                                    const mgrs = await fsManager.readManagers(this.rootHandle);
                                    if (mgrs && Array.isArray(mgrs)) this.managers = mgrs;
                                } catch (e) { /* garder liste script */ }
                            }

                            // Chargement des données Planning globales (tous fichiers planning_YYYY-MM.csv)
                            try {
                                var repoPlanning = window.HQApp && window.HQApp.StatsRepository;
                                if (repoPlanning && typeof repoPlanning.loadPlanningStats === 'function') {
                                    this.globalPlanningData = await repoPlanning.loadPlanningStats(this.rootHandle);
                                } else {
                                    this.globalPlanningData = { agents: {} };
                                }
                            } catch (e) {
                                this.globalPlanningData = { agents: {} };
                            }

                            await this.refreshData();

                            // Pilotage / Dashboard : sélectionner campagne (URL ?campagne= > mémorisée > première)
                            const isPilotageOrDashboard = /pilotage|dashboard/.test(window.location.pathname || '');
                            if (isPilotageOrDashboard && this.folders.length > 0 && !this.selectedFolder) {
                                const urlCampagne = new URLSearchParams(window.location.search).get('campagne');
                                let folder = urlCampagne ? this.folders.find(f => f.name === urlCampagne) : null;
                                if (!folder) {
                                    try {
                                        const saved = localStorage.getItem('last_selected_campaign');
                                        if (saved) folder = this.folders.find(f => f.name === saved) || null;
                                    } catch (e) {}
                                }
                                await this.loadCampaign(folder || this.folders[0]);
                            }

                            // Dashboard : lecture des paramètres d'URL et hydratation du store + déclenchement des graphiques
                            var isDashboard = /dashboard/.test(window.location.pathname || '');
                            if (isDashboard) {
                                var params = new URLSearchParams(window.location.search);
                                var tab = params.get('tab');
                                var store = window.Alpine && window.Alpine.store && window.Alpine.store('dashboard');
                                var self = this;
                                if (store && (tab === 'campagnes' || tab === 'production' || tab === 'agent360')) {
                                    store.activeTab = tab;
                                }
                                if (store) {
                                    var dateFrom = params.get('dateFrom');
                                    if (dateFrom !== null && dateFrom !== '') store.selectedDateFrom = dateFrom;
                                    var dateTo = params.get('dateTo');
                                    if (dateTo !== null && dateTo !== '') store.selectedDateTo = dateTo;
                                    if (!store.selectedDateFrom || !store.selectedDateTo) {
                                        var ref = new Date();
                                        var t = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0, 0);
                                        var first = new Date(t.getFullYear(), t.getMonth(), 1, 12, 0, 0, 0);
                                        var last = new Date(t.getFullYear(), t.getMonth() + 1, 0, 12, 0, 0, 0);
                                        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
                                        store.selectedDateFrom = first.getFullYear() + '-' + pad(first.getMonth() + 1) + '-' + pad(first.getDate());
                                        store.selectedDateTo = last.getFullYear() + '-' + pad(last.getMonth() + 1) + '-' + pad(last.getDate());
                                    }
                                    var perimetre = params.get('perimetre');
                                    if (perimetre === 'manager' || perimetre === 'global') store.prodPerimeter = perimetre;
                                    var managerId = params.get('managerId');
                                    if (managerId !== null && managerId !== '') store.prodSelectedManager = managerId;
                                    var agentId = params.get('agentId');
                                    if (agentId !== null && agentId !== '') store.selectedAgent360 = agentId;
                                    var site = params.get('site');
                                    if (site !== null) this.dashboardFilters.site = site || '';
                                    var offre = params.get('offre');
                                    if (offre !== null) this.dashboardFilters.offer = offre || '';
                                }
                                if (store && store.activeTab === 'production' && this.rootHandle && this.allAgents && this.managers) {
                                    if (window.refreshProductionDashboard) {
                                        window.refreshProductionDashboard(this.rootHandle, store.prodPerimeter, store.prodSelectedManager, this.allAgents, this.managers, store.selectedDateFrom || null, store.selectedDateTo || null);
                                    }
                                }
                                if (store && store.activeTab === 'agent360' && store.selectedAgent360 && this.rootHandle && this.campagnesHandle) {
                                    if (window.refreshAgent360Charts) {
                                        var agentIdNum = parseInt(store.selectedAgent360, 10);
                                        var agent = this.getAgentById(agentIdNum);
                                        var agentDisplayName = agent ? this.getAgentDisplayName(agent) : '';
                                        window.refreshAgent360Charts(this.rootHandle, this.campagnesHandle, agentIdNum, agentDisplayName, this.agents || this.allAgents || [], store.selectedDateFrom || null, store.selectedDateTo || null);
                                    }
                                }
                                window.refreshDashboardFromFilters = function() {
                                    var s = window.Alpine && window.Alpine.store && window.Alpine.store('dashboard');
                                    if (!s) return;
                                    if (s.activeTab === 'production' && self.rootHandle && self.allAgents && self.managers && window.refreshProdFromStore) {
                                        window.refreshProdFromStore(self.rootHandle, self.allAgents, self.managers);
                                    }
                                    if (s.activeTab === 'agent360' && self.rootHandle && self.campagnesHandle && window.refresh360FromStore) {
                                        window.refresh360FromStore(s.selectedAgent360, self.rootHandle, self.campagnesHandle, self.allAgents);
                                    }
                                    self.updateDashboardUrl();
                                };
                            }

                            // Admin campagnes : restaurer la campagne depuis l'URL (retour depuis répartition) + charger liste grilles
                            const isAdminCampagnes = /admin-campagnes\.html$/i.test(window.location.pathname || '');
                            if (isAdminCampagnes) {
                                try {
                                    const list = await repository.getGrillesList(this.rootHandle);
                                    this.grillesList = list || [];
                                } catch (e) { this.grillesList = []; }
                                if (this.folders.length > 0) {
                                    const urlCampagne = new URLSearchParams(window.location.search).get('campagne');
                                    const folder = urlCampagne ? this.folders.find(f => f.name === urlCampagne) : null;
                                    if (folder) await this.editCampaign(folder.name);
                                }
                            }
                            // Admin critères : charger grille(s) depuis le repository (source ou snapshot campagne)
                            const isAdminCriteres = /admin-criteres\.html$/i.test(window.location.pathname || '');
                            if (isAdminCriteres) {
                                const urlCampagne = new URLSearchParams(window.location.search).get('campagne');
                                if (urlCampagne) {
                                    this.editingGridContext = { type: 'campaign', campaignName: urlCampagne };
                                    try {
                                        const sanitizedName = repository.sanitizeDirectoryName(urlCampagne);
                                        const campaignDirHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                                        let gridData = await repository.getSnapshotForCampaignSafe(this.rootHandle, campaignDirHandle);
                                        if (gridData == null && fsManager) {
                                            let grilleId = 'default';
                                            try {
                                                const c = await fsManager.readCampaignConfig(campaignDirHandle);
                                                if (c && c.grille_id) { repository.validateGrilleId(c.grille_id); grilleId = c.grille_id; }
                                            } catch (e) {}
                                            gridData = await repository.getGridById(this.rootHandle, grilleId);
                                            await repository.saveSnapshotForCampaign(this.rootHandle, campaignDirHandle, gridData);
                                        }
                                        var normalized = gridData && (gridData.sections || gridData.categories) ? gridData : repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []);
                                        this.grid = normalized.sections || [];
                                        this.gridTitle = normalized.title || 'default';
                                    } catch (e) { console.warn(e); var fallback = repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []); this.grid = fallback.sections || []; this.gridTitle = fallback.title || 'default'; }
                                } else {
                                    this.editingGridContext = { type: 'source', id: this.currentGridId };
                                    try {
                                        const list = await repository.getGrillesList(this.rootHandle);
                                        this.grillesList = list || [];
                                        if (this.grillesList.length === 0) this.currentGridId = 'default';
                                        else if (!this.grillesList.find(g => g.id === this.currentGridId)) this.currentGridId = (this.grillesList[0] && this.grillesList[0].id) || 'default';
                                        const gridData = await repository.getGridById(this.rootHandle, this.currentGridId);
                                        var normalized = gridData && (gridData.sections || gridData.categories) ? gridData : repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []);
                                        this.grid = normalized.sections || [];
                                        this.gridTitle = normalized.title || 'default';
                                    } catch (e) { var fallback = repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []); this.grid = fallback.sections || []; this.gridTitle = fallback.title || 'default'; }
                                }
                                if (this.evaluationEngine && this.evaluationEngine.getDefaultFormState) {
                                    Object.assign(this.form, this.evaluationEngine.getDefaultFormState({ sections: this.grid }));
                                }
                                var secsInit = this.grid || [];
                                secsInit.forEach(sec => {
                                    sec.collapsed = true;
                                    (sec.fields || []).forEach(field => {
                                        if (field.type === 'scoring') {
                                            const opts = this.getStepOptions(field.max);
                                            if (field.step == null || field.step === undefined) field.step = opts[0] ?? 0.5;
                                            else { const stepHalf = Math.round(parseFloat(field.step) * 2) / 2; field.step = opts.includes(stepHalf) ? stepHalf : (opts[0] ?? 0.5); }
                                        }
                                    });
                                });
                                this.updateNote();
                                this.lastPersistedGridJson = JSON.stringify(secsInit.map(sec => { const { collapsed, ...rest } = sec; return rest; }));
                            }

                            // Écoute des changements d'onglets pour auto-rafraîchissement
                            var self = this;
                            this.$watch(
                                function() {
                                    var s = window.Alpine && window.Alpine.store && window.Alpine.store('dashboard');
                                    return s ? s.activeTab : null;
                                },
                                function(newTab) {
                                    var s = window.Alpine && window.Alpine.store && window.Alpine.store('dashboard');
                                    if (!s) return;

                                    if (newTab === 'production' && self.rootHandle && self.allAgents && self.managers && window.refreshProdFromStore) {
                                        window.refreshProdFromStore(self.rootHandle, self.allAgents, self.managers);
                                    }

                                    if (newTab === 'agent360' && self.rootHandle && self.campagnesHandle && s.selectedAgent360 && window.refresh360FromStore) {
                                        window.refresh360FromStore(s.selectedAgent360, self.rootHandle, self.campagnesHandle, self.allAgents);
                                    }
                                }
                            );

                            // Si contexte Saisie "Dossier Agent"
                            if (this.pendingParams.agent && this.pendingParams.campagne) {
                                await this.loadAgentDossier(this.pendingParams.agent, this.pendingParams.campagne);
                            }
                        } catch (e) { this.rootHandle = null; console.error(e); }
                    }
                }
                // Cache et check périodique (24 h) pour l’indicateur de mise à jour dans le footer
                var src = this.appConfig.updateSource || {};
                var owner = (src.repoOwner || '').trim();
                var repo = (src.repoName || '').trim();
                if (owner && repo) {
                    var cached = getUpdateCheckCache();
                    if (cached) {
                        this.updateCheck = { status: cached.status, remoteVersion: cached.remoteVersion || '', error: cached.error || '' };
                    }
                    if (typeof window.HQ_APP_UPDATE !== 'undefined') {
                        if (!cached) {
                            var self = this;
                            setTimeout(function () { self.checkForUpdate(); }, 0);
                        }
                        if (!this._updateCheckIntervalId) {
                            var self = this;
                            this._updateCheckIntervalId = setInterval(function () { self.checkForUpdate(); }, HQ_APP_UPDATE_CHECK_TTL_MS);
                        }
                    }
                }
            } catch (e) { console.error(e); } finally {
                // Différer pour laisser le rendu réactif (grille, lastPersistedGridJson) se stabiliser avant d'autoriser le $watch d'auto-save
                var self = this;
                setTimeout(function () { self.isInitializing = false; }, 0);
            }
        },

        async loadGridForCampaign(campaignName) {
            if (!this.rootHandle || !this.campagnesHandle) return;
            if (!fsManager) return;
            try {
                const sanitizedName = repository.sanitizeDirectoryName(campaignName);
                const campaignDirHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                let gridData = await repository.getSnapshotForCampaignSafe(this.rootHandle, campaignDirHandle);
                if (gridData == null) {
                    let grilleId = 'default';
                    try {
                        const config = await fsManager.readCampaignConfig(campaignDirHandle);
                        if (config && config.grille_id && typeof config.grille_id === 'string') {
                            try {
                                repository.validateGrilleId(config.grille_id);
                                grilleId = config.grille_id;
                            } catch (e) { /* invalide, garder default */ }
                        }
                        this._setEnginesFromCampaignType(config && config.campaign_type ? config.campaign_type : 'scoring');
                    } catch (e) { /* pas de config */ }
                    gridData = await repository.getGridById(this.rootHandle, grilleId);
                    await repository.saveSnapshotForCampaign(this.rootHandle, campaignDirHandle, gridData);
                    try {
                        const config = await fsManager.readCampaignConfig(campaignDirHandle).catch(function () { return {}; });
                        config.grille_id = grilleId;
                        await fsManager.writeCampaignConfig(campaignDirHandle, config);
                    } catch (e) { /* fusion config optionnelle */ }
                }
                var normalized = gridData && (gridData.sections || gridData.categories) ? gridData : repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []);
                this.grid = normalized.sections || [];
                this.gridTitle = normalized.title || 'default';
            } catch (e) {
                console.warn('loadGridForCampaign:', e);
                var fallback = repository._normalizeGridPayload(typeof CONFIG_GRILLE !== 'undefined' ? CONFIG_GRILLE : []);
                this.grid = fallback.sections || [];
                this.gridTitle = fallback.title || 'default';
            }
        },

        // --- DOSSIER AGENT (NOUVEAU) ---
        async loadAgentDossier(agentIdOrName, campaignName) {
            const agent = typeof agentIdOrName === 'number' || (typeof agentIdOrName === 'string' && /^\d+$/.test(agentIdOrName))
                ? this.getAgentById(parseInt(agentIdOrName))
                : this.allAgents.find(a => this.getAgentDisplayName(a) === agentIdOrName);
            if (!agent) {
                this.notify("Agent introuvable.", "error");
                return;
            }
            const agentId = agent.id;
            const agentDisplayName = this.getAgentDisplayName(agent);
            
            this.agentContext.active = true;
            this.agentContext.agentId = agentId;
            this.agentContext.agentName = agentDisplayName;
            this.agentContext.campaignName = campaignName;
            this.agentContext.tabs = [];
            
            if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
            try {
                const sanitizedName = repository.sanitizeDirectoryName(campaignName);
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                await this.loadGridForCampaign(campaignName);
                
                let target = this.appConfig.target_evals || 3;
                try {
                    const c = await fsManager.readCampaignConfig(campaignHandle);
                    this.campaignConfig = c || null;
                    this.isCampaignClosed = (this.campaignConfig && this.campaignConfig.status === 'closed');
                    if (c && c.target_evals) target = parseInt(c.target_evals);
                    this._setEnginesFromCampaignType(c && c.campaign_type ? c.campaign_type : 'scoring');
                } catch(e) { this.campaignConfig = null; this.isCampaignClosed = false; }
                this.targetEvaluations = target;

                const evals = [];
                let bilan = null;

                const entries = await fsManager.listCampaignEntries(campaignHandle);
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    if (entry.kind !== 'file') continue;
                    
                    if (entry.name.startsWith('eval_') && entry.name.endsWith('.json')) {
                        try {
                            const data = await fsManager.readJsonFile(campaignHandle, entry.name);
                            const matchAgent = data.agentId === agentId || (data.agent && data.agent === agentDisplayName);
                            if (matchAgent) {
                                const match = entry.name.match(/_(\d+)\.json$/);
                                const ts = match ? parseInt(match[1]) : 0;
                                evals.push({ data: data, timestamp: ts, fileName: entry.name });
                            }
                        } catch (err) { /* ignorer fichier invalide */ }
                    } else if (entry.name.startsWith('bilan_') && entry.name.endsWith('.json')) {
                        try {
                            const data = await fsManager.readJsonFile(campaignHandle, entry.name);
                            if (data.agentId === agentId || (data.agent && data.agent === agentDisplayName)) {
                                const match = entry.name.match(/_(\d+)\.json$/);
                                const ts = match ? parseInt(match[1]) : 0;
                                if (!bilan || ts > bilan.timestamp) {
                                    bilan = { data: data, timestamp: ts, fileName: entry.name };
                                }
                            }
                        } catch (err) { /* ignorer */ }
                    }
                }

                // Trier les evals par date
                evals.sort((a,b) => a.timestamp - b.timestamp);

                // 3. Construire les onglets Eval
                // On crée autant d'onglets que d'évals existantes, + des vides jusqu'à target
                const tabCount = Math.max(target, evals.length);
                
                // Pour éviter tout conflit, on prefixe avec le timestamp courant du chargement
                const sessionPrefix = Date.now();
                const newTabs = [];

                for (let i = 0; i < tabCount; i++) {
                    const existing = evals[i];
                    const data = existing ? existing.data : this.createEmptyEval(agentId, agentDisplayName, campaignName);
                    if (existing && existing.fileName) data._fileName = existing.fileName;
                    newTabs.push({
                        type: 'eval',
                        id: `eval_${sessionPrefix}_${i}`,
                        label: `Évaluation ${i + 1}`,
                        data: data,
                        fileHandle: null,
                        status: existing ? 'saved' : 'empty'
                    });
                }

                // 4. Onglet Bilan
                const bilanData = bilan ? bilan.data : { agentId, agent: agentDisplayName, synthese: '', email_sent_to: '', sent: false };
                if (bilan && bilan.fileName) bilanData._fileName = bilan.fileName;
                newTabs.push({
                    type: 'bilan',
                    id: 'bilan',
                    label: 'Bilan Global',
                    data: bilanData,
                    fileHandle: null,
                    status: bilan ? (bilan.data.sent ? 'sent' : 'draft') : 'new'
                });

                this.agentContext.tabs = newTabs;

                // 5. Sélectionner l'onglet
                if (this.pendingParams.tab === 'bilan') {
                    this.selectTab('bilan');
                } else if (this.pendingParams.tab) {
                    let requestedIndex = -1;
                    const raw = this.pendingParams.tab;
                    if (raw.startsWith('eval_')) {
                        const x = parseInt(raw.replace('eval_', ''), 10);
                        if (!isNaN(x) && x >= 0) requestedIndex = x;
                    } else if (!isNaN(parseInt(raw, 10))) {
                        requestedIndex = parseInt(raw, 10);
                    }
                    if (requestedIndex >= 0) {
                        const evalTabs = this.agentContext.tabs.filter(t => t.type === 'eval');
                        if (evalTabs[requestedIndex]) {
                            this.selectTab(evalTabs[requestedIndex].id);
                        } else {
                            const firstEmpty = this.agentContext.tabs.find(t => t.type === 'eval' && t.status === 'empty');
                            if (firstEmpty) this.selectTab(firstEmpty.id);
                            else if (this.agentContext.tabs.length > 0) this.selectTab(this.agentContext.tabs[0].id);
                        }
                    } else {
                        const firstEmpty = this.agentContext.tabs.find(t => t.type === 'eval' && t.status === 'empty');
                        if (firstEmpty) this.selectTab(firstEmpty.id);
                        else if (this.agentContext.tabs.length > 0) this.selectTab(this.agentContext.tabs[0].id);
                    }
                } else {
                    // Par défaut : le premier onglet vide, ou le bilan si tout est plein
                    const firstEmpty = this.agentContext.tabs.find(t => t.type === 'eval' && t.status === 'empty');
                    if (firstEmpty) this.selectTab(firstEmpty.id);
                    else if (this.agentContext.tabs.length > 0) this.selectTab(this.agentContext.tabs[0].id);
                }

            } catch(e) {
                console.error("Erreur chargement dossier:", e);
                this.notify("Erreur de chargement du dossier agent.", "error");
            }
        },

        openPanel360() {
            var self = this;
            this.isPanel360Open = true;
            var agentId = this.agentContext.agentId;
            var agentName = this.agentContext.agentName || '';
            if (agentId == null) return;
            if (!this.rootHandle || !this.campagnesHandle) {
                this.notify("Sélectionnez la racine du projet (icône dossier en haut) pour charger les données 360°. En mode file://, le stockage peut être bloqué par le navigateur (Tracking Prevention).", "error");
                return;
            }
            var cfg = this.campaignConfig;
            if (cfg && cfg.period_start && cfg.period_end) {
                this.panel360DateFrom = cfg.period_start;
                this.panel360DateTo = cfg.period_end;
            } else {
                var now = new Date();
                var pad = function (n) { return n < 10 ? '0' + n : String(n); };
                this.panel360DateFrom = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-01';
                var last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                this.panel360DateTo = last.getFullYear() + '-' + pad(last.getMonth() + 1) + '-' + pad(last.getDate());
            }
            this._refreshPanel360Charts();
        },

        refreshPanel360Charts() {
            this._refreshPanel360Charts();
        },

        _refreshPanel360Charts() {
            if (!this.isPanel360Open || this.agentContext.agentId == null) return;
            var self = this;
            
            var agentId = parseInt(this.agentContext.agentId, 10);
            var agentName = this.agentContext.agentName || '';
            var agentDisplayName = agentName || '';
            var repo = window.HQApp && window.HQApp.StatsRepository;
            var view = window.HQApp && window.HQApp.Agent360ChartsView;
            
            if (!repo || !view || !this.rootHandle) return;
            
            var container = document.getElementById('saisie-agent360-container');
            if (!container) return;
            
            var dateFrom = (this.panel360DateFrom || '').trim();
            var dateTo = (this.panel360DateTo || '').trim();
            
            // Correction architecturale : Injection du référentiel du composant plutôt que du scope global
            var agentsRef = (this.agents && this.agents.length > 0) ? this.agents : (this.allAgents || []);
            
            // Planning stats : utilisées par Agent360ChartsView pour remplir le doughnut + le tableau.
            var planningStats = { etats: {} };
            try {
                var agentsList = (self.agentsList && Array.isArray(self.agentsList)) ? self.agentsList
                    : (self.allAgents && Array.isArray(self.allAgents)) ? self.allAgents
                    : (self.agents && Array.isArray(self.agents)) ? self.agents
                    : [];
                if (agentsList.length > 0) {
                    var agentObj = agentsList.find(function (a) { return a && Number(a.id) === Number(agentId); });
                    if (agentObj) {
                        agentDisplayName = self.getAgentDisplayName ? self.getAgentDisplayName(agentObj) : agentDisplayName;
                    }
                }
                planningStats = self.getFilteredPlanningStats(dateFrom, dateTo, agentDisplayName) || { etats: {} };
            } catch (e) {
                console.error('[Planning] Crash intercepté dans saisie (agent360) :', e);
            }

            Promise.all([
                repo.loadQualiteHistory(this.rootHandle, this.campagnesHandle, agentId, { agentDisplayName: agentDisplayName }),
                repo.loadProductionStats(this.rootHandle, { agents: agentsRef, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
            ]).then(function (results) {
                view.destroy(container);
                view.renderAgent360(container, {
                    qualiteHistory: results[0] || [],
                    production: results[1] || {},
                    agentId: agentId,
                    planning: planningStats
                });
            }).catch(function (err) {
                console.error("Panel 360 load error:", err);
                self.notify("Erreur chargement données 360°.", "error");
            });
        },

        async importAgentStats() {
            if (this._ensureCampaignNotClosed()) return;
            if (this.isImportingStats) return;

            const repo = window.HQApp && window.HQApp.StatsRepository;
            if (!repo || typeof repo.loadProductionStats !== 'function' || typeof repo.aggregatePerimeterStats !== 'function') {
                this.notify("Module StatsRepository indisponible.", "error");
                return;
            }
            if (!this.rootHandle) {
                this.notify("Sélectionnez la racine du projet pour importer les statistiques.", "error");
                return;
            }
            if (!this.campaignConfig || this.campaignConfig.campaign_type !== 'review') return;

            const agentId = this.agentContext.active ? Number(this.agentContext.agentId) : Number(this.form.agent);
            if (!Number.isFinite(agentId)) {
                this.notify("Agent introuvable pour l'import des statistiques.", "error");
                return;
            }

            const cfg = this.campaignConfig || {};
            const rawStatsCfg = (cfg.stats_config && typeof cfg.stats_config === 'object') ? cfg.stats_config : {};
            const rawChannels = (rawStatsCfg.channels && typeof rawStatsCfg.channels === 'object') ? rawStatsCfg.channels : {};
            const channels = {
                phone: rawChannels.phone !== undefined ? !!rawChannels.phone : true,
                email: rawChannels.email !== undefined ? !!rawChannels.email : true,
                watt: rawChannels.watt !== undefined ? !!rawChannels.watt : true
            };
            if (!channels.phone && !channels.email && !channels.watt) {
                this.notify("Aucun canal activé dans le paramétrage des statistiques.", "error");
                return;
            }

            const evalStart = rawStatsCfg.eval_start || cfg.period_start || '';
            const evalEnd = rawStatsCfg.eval_end || cfg.period_end || '';
            if (!evalStart || !evalEnd) {
                this.notify("Période évaluée introuvable dans la campagne.", "error");
                return;
            }

            this.isImportingStats = true;
            try {
                const agentsRef = (this.agents && this.agents.length > 0) ? this.agents : (this.allAgents || []);
                const production = await repo.loadProductionStats(this.rootHandle, {
                    agentId: agentId,
                    agents: agentsRef,
                    dateFrom: evalStart,
                    dateTo: evalEnd
                });
                const productionPerimeter = await repo.loadProductionStats(this.rootHandle, {
                    agents: agentsRef,
                    dateFrom: evalStart,
                    dateTo: evalEnd
                });
                const perimeterDto = repo.aggregatePerimeterStats(productionPerimeter || {}, null);

                const findByAgent = (arr) => Array.isArray(arr)
                    ? (arr.find(r => Number(r.agentId) === Number(agentId)) || null)
                    : null;
                const toNumber = (v) => {
                    const n = parseFloat(v);
                    return Number.isFinite(n) ? n : 0;
                };
                const toInt = (v) => Math.round(toNumber(v));
                const toPercentInt = (v) => {
                    const n = toNumber(v);
                    const percent = Math.abs(n) <= 1 ? (n * 100) : n;
                    return Math.round(percent);
                };

                const telRow = channels.phone ? findByAgent(production && production.telephone) : null;
                const mailRow = channels.email ? findByAgent(production && production.courriels) : null;
                const wattRow = channels.watt ? findByAgent(production && production.watt) : null;

                const zeroTel = {
                    appels_traites: 0,
                    dmt: 0,
                    dmc: 0,
                    dmmg: 0,
                    dmpa: 0,
                    identifications: 0,
                    reponses_immediates: 0,
                    transferts: 0,
                    consultations: 0,
                    rona: 0
                };

                const mapTelGlobal = (row) => {
                    if (!row) return Object.assign({}, zeroTel);
                    return {
                        appels_traites: toInt(row.appels_traites),
                        dmt: toInt(row.dmt),
                        dmc: toInt(row.dmc),
                        dmmg: toInt(row.dmmg),
                        dmpa: toInt(row.dmpa),
                        identifications: toPercentInt(row.identifications),
                        reponses_immediates: toPercentInt(row.reponses_immediates),
                        transferts: toInt(row.transferts),
                        consultations: toInt(row.consultations),
                        rona: toInt(row.rona)
                    };
                };

                const telGlobal = mapTelGlobal(telRow);
                const telByOffer = (telRow && Array.isArray(telRow.offres))
                    ? telRow.offres.map(o => ({
                        offre: o && o.offre != null ? String(o.offre) : 'GLOBAL',
                        appels_traites: toInt(o.appels_traites),
                        dmt: toInt(o.dmt),
                        dmc: toInt(o.dmc),
                        dmmg: toInt(o.dmmg),
                        dmpa: toInt(o.dmpa),
                        identifications: toPercentInt(o.identifications),
                        reponses_immediates: toPercentInt(o.reponses_immediates),
                        transferts: toInt(o.transferts),
                        consultations: toInt(o.consultations),
                        rona: toInt(o.rona),
                        hidden: false
                    }))
                    : [];
                const perimeterTelGlobal = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.telephone))
                    ? (perimeterDto.production.telephone[0] || null)
                    : null;
                const benchmarkTelGlobal = mapTelGlobal(perimeterTelGlobal);
                const benchmarkTelByOffer = (perimeterTelGlobal && Array.isArray(perimeterTelGlobal.offres))
                    ? perimeterTelGlobal.offres.map(o => ({
                        offre: o && o.offre != null ? String(o.offre) : 'GLOBAL',
                        appels_traites: toInt(o.appels_traites),
                        dmt: toInt(o.dmt),
                        dmc: toInt(o.dmc),
                        dmmg: toInt(o.dmmg),
                        dmpa: toInt(o.dmpa),
                        identifications: toPercentInt(o.identifications),
                        reponses_immediates: toPercentInt(o.reponses_immediates),
                        transferts: toInt(o.transferts),
                        consultations: toInt(o.consultations),
                        rona: toInt(o.rona)
                    }))
                    : [];

                const zeroCour = { cloture: 0, envoi_watt: 0, reponse_directe: 0 };
                const mapCourGlobal = (row) => {
                    if (!row) return Object.assign({}, zeroCour);
                    return {
                        cloture: toInt(row.cloture),
                        envoi_watt: toInt(row.envoi_watt),
                        reponse_directe: toInt(row.reponse_directe)
                    };
                };
                const courGlobal = mapCourGlobal(mailRow);
                const perimeterCourGlobal = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.courriels))
                    ? (perimeterDto.production.courriels[0] || null)
                    : null;
                const benchmarkCourGlobal = mapCourGlobal(perimeterCourGlobal);

                const zeroWatt = { cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
                const mapWattGlobal = (row) => {
                    if (!row) return Object.assign({}, zeroWatt);
                    return {
                        cloture_manuelle: toInt(row.cloture_manuelle),
                        reroutage_individuel: toInt(row.reroutage_individuel),
                        transfert_prod: toInt(row.transfert_prod)
                    };
                };
                const wattGlobal = mapWattGlobal(wattRow);
                const perimeterWattGlobal = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.watt))
                    ? (perimeterDto.production.watt[0] || null)
                    : null;
                const benchmarkWattGlobal = mapWattGlobal(perimeterWattGlobal);

                // Agrégation wattDetail par circuit sur la période (loadProductionStats renvoie wattDetail en "brut date+circuit")
                const circuitAgg = {};
                if (channels.watt && production && Array.isArray(production.wattDetail)) {
                    for (let i = 0; i < production.wattDetail.length; i++) {
                        const r = production.wattDetail[i];
                        if (!r) continue;
                        const circuit = (r.circuit != null ? String(r.circuit).trim() : '');
                        if (!circuit) continue;
                        if (!circuitAgg[circuit]) circuitAgg[circuit] = { circuit: circuit, cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
                        circuitAgg[circuit].cloture_manuelle += toNumber(r.cloture_manuelle);
                        circuitAgg[circuit].reroutage_individuel += toNumber(r.reroutage_individuel);
                        circuitAgg[circuit].transfert_prod += toNumber(r.transfert_prod);
                    }
                }
                const wattByCircuit = Object.keys(circuitAgg).map(k => {
                    const row = circuitAgg[k];
                    return {
                        circuit: row.circuit,
                        cloture_manuelle: toInt(row.cloture_manuelle),
                        reroutage_individuel: toInt(row.reroutage_individuel),
                        transfert_prod: toInt(row.transfert_prod),
                        hidden: false
                    };
                });
                const perimeterCircuitAgg = {};
                if (channels.watt && perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.wattDetail)) {
                    for (let i = 0; i < perimeterDto.production.wattDetail.length; i++) {
                        const r = perimeterDto.production.wattDetail[i];
                        if (!r) continue;
                        const circuit = (r.circuit != null ? String(r.circuit).trim() : '');
                        if (!circuit) continue;
                        if (!perimeterCircuitAgg[circuit]) perimeterCircuitAgg[circuit] = { circuit: circuit, cloture_manuelle: 0, reroutage_individuel: 0, transfert_prod: 0 };
                        perimeterCircuitAgg[circuit].cloture_manuelle += toNumber(r.cloture_manuelle);
                        perimeterCircuitAgg[circuit].reroutage_individuel += toNumber(r.reroutage_individuel);
                        perimeterCircuitAgg[circuit].transfert_prod += toNumber(r.transfert_prod);
                    }
                }
                const benchmarkWattByCircuit = Object.keys(perimeterCircuitAgg).map(k => {
                    const row = perimeterCircuitAgg[k];
                    return {
                        circuit: row.circuit,
                        cloture_manuelle: toInt(row.cloture_manuelle),
                        reroutage_individuel: toInt(row.reroutage_individuel),
                        transfert_prod: toInt(row.transfert_prod)
                    };
                });

                this.form.stats_snapshot = {
                    version: 3,
                    imported_at: new Date().toISOString(),
                    period: {
                        eval_start: evalStart,
                        eval_end: evalEnd,
                        compare_start: rawStatsCfg.compare_start || '',
                        compare_end: rawStatsCfg.compare_end || ''
                    },
                    channels: channels,
                    source: {
                        campaign: this.form.campagne || this.agentContext.campaignName || '',
                        campaign_type: 'review'
                    },
                    metrics: {
                        telephone: {
                            hidden: !channels.phone,
                            global: telGlobal,
                            by_offer: telByOffer
                        },
                        courriels: {
                            hidden: !channels.email,
                            global: courGlobal
                        },
                        watt: {
                            hidden: !channels.watt,
                            global: wattGlobal,
                            by_circuit: wattByCircuit
                        }
                    },
                    benchmark: {
                        scope: 'perimeter_eval_period',
                        telephone: {
                            global: benchmarkTelGlobal,
                            by_offer: benchmarkTelByOffer
                        },
                        courriels: {
                            global: benchmarkCourGlobal
                        },
                        watt: {
                            global: benchmarkWattGlobal,
                            by_circuit: benchmarkWattByCircuit
                        }
                    }
                };

                if (typeof this.form.stats_analysis_comment !== 'string') this.form.stats_analysis_comment = '';
                this.evalSaveStatus = 'Modifications...';
                this.notify("Statistiques importées pour la période évaluée.", "success");
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors de l'import des statistiques.", "error");
            } finally {
                this.isImportingStats = false;
            }
        },

        createEmptyEval(agentId, agentDisplayName, campagne) {
            var base = (this.evaluationEngine && this.evaluationEngine.getDefaultFormState) ? this.evaluationEngine.getDefaultFormState({ sections: this.grid }) : { scores: {}, comments: {}, textResponses: {}, booleanResponses: {}, note: '0.0' };
            return Object.assign({}, base, {
                agentId: agentId,
                agent: agentDisplayName,
                campagne: campagne,
                duree_min: '', duree_sec: '',
                offre: '',
                date_communication: '',
                commentaire: '',
                stats_snapshot: null,
                stats_analysis_comment: ''
            });
        },

        selectTab(id) {
            const index = this.agentContext.tabs.findIndex(t => t.id === id);
            if (index === -1) return;

            clearTimeout(this.autoSaveTimeoutEval);
            
            const tab = this.agentContext.tabs[index];
            this.agentContext.activeTabIndex = index;

            if (tab.type === 'eval') {
                const data = JSON.parse(JSON.stringify(tab.data));
                this.form = data;
                if (!Object.prototype.hasOwnProperty.call(this.form, 'stats_snapshot')) this.form.stats_snapshot = null;
                if (typeof this.form.stats_analysis_comment !== 'string') this.form.stats_analysis_comment = '';

                this.isImportingStats = false;
                if (this.evaluationEngine && this.evaluationEngine.computeNote) this.form.note = this.evaluationEngine.computeNote(this.form, { sections: this.grid });
                this.lastPersistedEvalJson = JSON.stringify(this.form);
                this.evalSaveStatus = 'Enregistré';
                // Bilan → Eval : le bloc formulaire est recréé (x-if), le <select> peut être rendu avant
                // les <option> (x-for). Forcer une réassignation de offre et date_communication après rendu.
                if (typeof this.$nextTick === 'function') {
                    this.$nextTick(() => {
                        if (data.offre) {
                            const val = data.offre;
                            this.form.offre = '';
                            this.$nextTick(() => { this.form.offre = val; });
                        }
                        if (data.date_communication) {
                            const dc = data.date_communication;
                            this.form.date_communication = '';
                            this.$nextTick(() => { this.form.date_communication = dc; });
                        }
                    });
                }
            } else {
                // Tab Bilan
                this.bilanForm.agentName = this.agentContext.agentName;
                this.bilanForm.comment = tab.data.synthese || '';
                const agent = this.getAgentById(this.agentContext.agentId);
                this.bilanForm.email = tab.data.email_sent_to || (agent && agent.email ? agent.email : '') || '';
                this.bilanForm.status = tab.status;
                this.bilanForm.lastSaved = tab.fileHandle ? tab.data.date : null; // Date approx si pas chargée
                
                // Préparer les données pour l'aperçu du bilan (les evals précédentes)
                // On prend toutes les evals enregistrées : status 'saved' ou présence de fileHandle (chargée depuis le disque)
                const evalsDone = this.agentContext.tabs
                    .filter(t => t.type === 'eval' && (t.status === 'saved' || t.fileHandle))
                    .map(t => {
                        const dc = t.data.date_communication;
                        let dateStr;
                        if (dc) {
                            const d = new Date(dc);
                            dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        } else {
                            dateStr = new Date(t.data._timestamp || Date.now()).toLocaleDateString();
                        }
                        return {
                            date: dateStr,
                            note: t.data.note,
                            fileContent: t.data
                        };
                    });
                
                this.bilanForm.evals = evalsDone;
                this.lastSavedBilanComment = (this.bilanForm.comment || '').trim();
            }

            // Mise à jour silencieuse de l'URL (saisie.html, Dossier Agent)
            if (window.location.pathname.includes('saisie.html') && this.agentContext.active === true) {
                const agentName = this.agentContext.agentName;
                const campaignName = this.agentContext.campaignName;
                if (agentName && campaignName) {
                    let tabValue = 'bilan';
                    if (tab.type === 'eval') {
                        const evalTabs = this.agentContext.tabs.filter(t => t.type === 'eval');
                        const evalIndex = evalTabs.findIndex(t => t.id === id);
                        tabValue = evalIndex >= 0 ? 'eval_' + evalIndex : 'eval_0';
                    }
                    const query = '?agent=' + encodeURIComponent(agentName) + '&campagne=' + encodeURIComponent(campaignName) + '&tab=' + encodeURIComponent(tabValue);
                    const nouvelleUrl = window.location.pathname + query;
                    window.history.replaceState(null, '', nouvelleUrl);
                }
            }
        },

        addEvalTab() {
            // Utiliser un timestamp + random pour garantir l'unicité absolue
            const uniqueId = 'eval_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            
            // Créer une COPIE de l'array pour manipulation atomique
            const newTabs = [...this.agentContext.tabs];
            const newIndex = newTabs.filter(t => t.type === 'eval').length;

            const newTab = {
                type: 'eval',
                id: uniqueId,
                label: `Évaluation ${newIndex + 1}`,
                data: this.createEmptyEval(this.agentContext.agentId, this.agentContext.agentName, this.agentContext.campaignName),
                fileHandle: null,
                status: 'empty'
            };
            
            // Insérer avant le bilan (dernier onglet)
            const bilanIndex = newTabs.findIndex(t => t.type === 'bilan');
            if (bilanIndex !== -1) {
                newTabs.splice(bilanIndex, 0, newTab);
            } else {
                newTabs.push(newTab);
            }
            
            // Remplacement atomique
            this.agentContext.tabs = newTabs;
            
            // Forcer un petit délai pour laisser Alpine digérer le changement de DOM avant de sélectionner
            this.$nextTick(() => {
                this.selectTab(uniqueId);
            });
        },

        async removeEvalTab(index) {
            const tab = this.agentContext.tabs[index];
            if (!tab) return;

            const confirmMessage = tab.status === 'saved' || tab.fileHandle 
                ? "ATTENTION : Vous êtes sur le point de supprimer cet onglet ET le fichier associé. Cette action est irréversible.\n\nContinuer ?"
                : "Supprimer cet onglet ?";

            if (!confirm(confirmMessage)) return;
            
            // Suppression du fichier si existant
            const fileName = (tab.data && tab.data._fileName) || (tab.fileHandle && tab.fileHandle.name);
            if ((tab.status === 'saved' || tab.fileHandle) && fileName && fsManager) {
                try {
                    const campaignHandle = await this.campagnesHandle.getDirectoryHandle(this.agentContext.campaignName);
                    await fsManager.removeEntry(campaignHandle, fileName);
                    this.notify("Fichier supprimé : " + fileName);
                } catch (e) {
                    console.error("Erreur suppression fichier:", e);
                    this.notify("Erreur lors de la suppression du fichier", "error");
                }
            }

            // Créer une COPIE de l'array
            const newTabs = [...this.agentContext.tabs];
            
            // Suppression dans la copie
            newTabs.splice(index, 1);
            
            // Renuméroter les LABELS dans la copie
            let count = 0;
            newTabs.forEach(t => {
                if (t.type === 'eval') {
                    t.label = `Évaluation ${count + 1}`;
                    count++;
                }
            });
            
            // Remplacement atomique
            this.agentContext.tabs = newTabs;
            
            // Sélectionner l'onglet précédent ou le premier dispo
            this.$nextTick(() => {
                const prevIndex = Math.max(0, index - 1);
                if (this.agentContext.tabs[prevIndex]) {
                    this.selectTab(this.agentContext.tabs[prevIndex].id);
                } else if (this.agentContext.tabs.length > 0) {
                    this.selectTab(this.agentContext.tabs[0].id);
                }
            });
        },

        // --- SAUVEGARDES CONTEXTUELLES ---
        _ensureCampaignNotClosed() {
            if (this.isCampaignClosed) {
                this.notify("Cette campagne est clôturée, aucune modification n'est autorisée.", "error");
                return true;
            }
            return false;
        },

        isEvalComplete() {
            const sections = (this.grid && this.grid.sections) ? this.grid.sections : (Array.isArray(this.grid) ? this.grid : []);
            for (let s = 0; s < sections.length; s++) {
                const fields = sections[s].fields || [];
                for (let i = 0; i < fields.length; i++) {
                    const field = fields[i];
                    if (field.oblig !== true) continue;
                    if (field.type === 'scoring') {
                        const val = this.form.scores && this.form.scores[field.id];
                        if (val == null || val === '') return false;
                    } else if (field.type === 'textarea') {
                        const val = (this.form.textResponses && this.form.textResponses[field.id] || '').trim();
                        if (val === '') return false;
                    } else if (field.type === 'boolean') {
                        if (!this.form.booleanResponses || !(field.id in this.form.booleanResponses)) return false;
                    }
                }
            }
            return true;
        },

        triggerAutoSaveEval() {
            if (this.isCampaignClosed) return;
            this.evalSaveStatus = 'Modifications...';
            clearTimeout(this.autoSaveTimeoutEval);
            this.autoSaveTimeoutEval = setTimeout(() => this.saveContextEval(true), 2000);
        },

        async saveContextEval(silent = false, isDraft = false) {
            if (this._ensureCampaignNotClosed()) return;
            const currentTab = this.agentContext.tabs[this.agentContext.activeTabIndex];
            if (currentTab.type !== 'eval') return;

            if (!this.agentContext.agentId || !this.form.campagne) return this.notify("Erreur données", "error");
            if (!fsManager) return this.notify("FileSystemManager non chargé.", "error");

            this.evalSaveStatus = 'Enregistrement...';
            try {
                const sanitizedCampagne = repository.sanitizeDirectoryName(this.form.campagne);
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedCampagne);
                
                let fileName = currentTab.data._fileName;
                if (!fileName) {
                    const agentNameForFile = (this.form.agent || this.agentContext.agentName || '').replace(/\s+/g, '_');
                    fileName = `eval_${agentNameForFile}_${Date.now()}.json`;
                }
                const ts = Date.now();
                const dataToSave = this.evaluationEngine
                    ? this.evaluationEngine.buildEvalPayload(this.form, { agentId: this.agentContext.agentId, agent: this.agentContext.agentName, fileName, timestamp: ts })
                    : Object.assign({}, this.form, { agentId: this.agentContext.agentId, agent: this.agentContext.agentName, _fileName: fileName, _timestamp: ts });
                currentTab.data = dataToSave;

                await fsManager.writeJsonFile(campaignHandle, fileName, dataToSave);

                currentTab.fileHandle = null;
                currentTab.status = this.isEvalComplete() ? 'saved' : 'draft';
                this.lastPersistedEvalJson = JSON.stringify(this.form);
                this.evalSaveStatus = 'Enregistré';

                if (this.campaignConfig && this.campaignConfig.target_evals === 1 && !isDraft && this.isEvalComplete()) {
                    try {
                        const syntheseText = this.bilanForm.comment || '';
                        const bilanFileName = `bilan_${this.agentContext.agentName.replace(/\s+/g, '_')}_${Date.now()}.json`;
                        const bilanData = this.evaluationEngine
                            ? this.evaluationEngine.buildBilanPayload(this.agentContext, syntheseText, '', [fileName], false, bilanFileName)
                            : { type: 'bilan', agentId: this.agentContext.agentId, agent: this.agentContext.agentName, date: new Date().toISOString(), evals_included: [fileName], synthese: syntheseText, email_sent_to: '', sent: false, _fileName: bilanFileName };
                        const ts = parseInt(bilanFileName.match(/_(\d+)\.json$/)?.[1], 10) || Date.now();
                        bilanData._timestamp = ts;
                        await fsManager.writeJsonFile(campaignHandle, bilanFileName, bilanData);

                        let bilanTab = this.agentContext.tabs.find(t => t.type === 'bilan');
                        if (bilanTab) {
                            bilanTab.data = bilanData;
                            bilanTab.data._fileName = bilanFileName;
                            bilanTab.status = 'empty';
                        } else {
                            this.agentContext.tabs.push({
                                type: 'bilan',
                                id: 'bilan',
                                label: 'Bilan Global',
                                data: Object.assign({}, bilanData, { _fileName: bilanFileName }),
                                fileHandle: null,
                                status: 'empty'
                            });
                        }

                        const existingIdx = this.allBilans.findIndex(b => (b.agentId === this.agentContext.agentId || b.agent === this.agentContext.agentName));
                        if (existingIdx >= 0) this.allBilans[existingIdx] = bilanData;
                        else this.allBilans.push(bilanData);
                    } catch (eBilan) {
                        console.error('Auto-bilan:', eBilan);
                    }
                }

                if (!silent) this.notify(`${currentTab.label} enregistrée !`);
            } catch (e) { 
                console.error(e);
                this.evalSaveStatus = 'Erreur';
                this.notify("Erreur d'enregistrement.", "error"); 
            }
        },

        async saveEval() {
            const agentId = parseInt(this.form.agent);
            const agent = this.getAgentById(agentId);
            if (!agent || !this.form.campagne) return this.notify("Agent et campagne requis.", "error");
            if (!fsManager) return this.notify("FileSystemManager non chargé.", "error");
            try {
                const sanitizedCampagne = repository.sanitizeDirectoryName(this.form.campagne);
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedCampagne);
                const agentDisplayName = this.getAgentDisplayName(agent);
                const fileName = `eval_${agentDisplayName.replace(/\s+/g, '_')}_${Date.now()}.json`;
                const ts = Date.now();
                const dataToSave = this.evaluationEngine
                    ? this.evaluationEngine.buildEvalPayload(this.form, { agentId: agentId, agent: agentDisplayName, fileName, timestamp: ts })
                    : Object.assign({}, this.form, { agentId: agentId, agent: agentDisplayName, _fileName: fileName, _timestamp: ts });
                await fsManager.writeJsonFile(campaignHandle, fileName, dataToSave);
                this.notify("Évaluation enregistrée !");
            } catch (e) {
                console.error(e);
                this.notify("Erreur d'enregistrement.", "error");
            }
        },

        async saveContextBilan(isSending = false) {
            if (this._ensureCampaignNotClosed()) return;
            const currentTab = this.agentContext.tabs[this.agentContext.activeTabIndex];
            if (currentTab.type !== 'bilan') return;
            if (!fsManager) return;

            if (!isSending) {
                const commentTrimmed = (this.bilanForm.comment || '').trim();
                if (commentTrimmed === '') {
                    const currentTabBilan = this.agentContext.tabs.find(t => t.type === 'bilan');
                    if (currentTabBilan) {
                        currentTabBilan.status = 'empty';
                    }
                    this.bilanForm.status = 'empty';
                    this.notify("Synthèse vide : saisissez du texte pour enregistrer un brouillon.", "error");
                    return;
                }
            }

            try {
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(this.agentContext.campaignName);
                
                let fileName = currentTab.data._fileName;
                if (!fileName) {
                    fileName = `bilan_${this.agentContext.agentName.replace(/\s+/g, '_')}_${Date.now()}.json`;
                }
                const evalsIncluded = this.bilanForm.evals.map(e => e.fileContent._fileName);
                const bilanData = this.evaluationEngine
                    ? this.evaluationEngine.buildBilanPayload(this.agentContext, this.bilanForm.comment, this.bilanForm.email, evalsIncluded, isSending, fileName)
                    : { type: 'bilan', agentId: this.agentContext.agentId, agent: this.agentContext.agentName, date: new Date().toISOString(), evals_included: evalsIncluded, synthese: this.bilanForm.comment, email_sent_to: this.bilanForm.email, sent: isSending, _fileName: fileName };

                await fsManager.writeJsonFile(campaignHandle, fileName, bilanData);

                currentTab.fileHandle = null;
                currentTab.data = bilanData;
                currentTab.status = isSending ? 'sent' : 'draft';
                
                this.bilanForm.status = currentTab.status;
                this.bilanForm.lastSaved = bilanData.date;
                this.lastSavedBilanComment = (this.bilanForm.comment || '').trim();

                this.notify(isSending ? "Bilan finalisé !" : "Brouillon sauvegardé 💾");
            } catch (e) {
                console.error(e);
                this.notify("Erreur sauvegarde bilan", "error");
            }
        },

        getCriterionLabel(criterionId) {
            var secs = this.grid || [];
            for (var s = 0; s < secs.length; s++) {
                var field = (secs[s].fields || []).find(function (f) { return f.id === criterionId; });
                if (field) return field.label || criterionId;
            }
            return criterionId;
        },

        getCriterionMax(criterionId) {
            var secs = this.grid || [];
            for (var s = 0; s < secs.length; s++) {
                var field = (secs[s].fields || []).find(function (f) { return f.id === criterionId; });
                if (field) return field.max;
            }
            return null;
        },

        getStepOptions(max) {
            const m = parseFloat(max);
            if (isNaN(m) || m <= 0) return [0.5];
            const options = new Set();
            for (let k = 1; ; k++) {
                const step = Math.round((m / k) * 100) / 100;
                if (step < 0.5) break;
                const stepHalf = Math.round(step * 2) / 2;
                if (Math.abs(step - stepHalf) < 1e-9) options.add(stepHalf);
            }
            return Array.from(options).sort((a, b) => a - b);
        },

        ensureStepForMax(item) {
            const opts = this.getStepOptions(item.max);
            const stepHalf = Math.round(parseFloat(item.step) * 2) / 2;
            item.step = opts.includes(stepHalf) ? stepHalf : (opts[0] ?? 0.5);
        },

        getDefaultBilanPromptTemplate() {
            return `Rôle : Manager-coach pragmatique.
Mission : Rédiger un bilan de performance sobre et factuel ({{evalsCount}} évaluations, campagne {{campaignName}}) en utilisant le "tu".

Consignes de rédaction :
1. Format : 5 à 7 lignes. Paragraphe unique, sans listes, sans titres.
2. Contenu :
   - Points forts : Note une réussite concrète et son utilité pour l'usager.
   - Axe de progrès : Identifie un point d'amélioration technique ou comportemental de façon directe.
   - Conclusion : Ajoute un objectif mesurable uniquement si les données le justifient ; sinon, termine par une simple validation de la dynamique actuelle.
3. Ton : Sobre, sincère et professionnel. Interdiction d'utiliser des superlatifs (ex: "incroyable", "exceptionnel", "parfait") ou une flatterie excessive. Préfère la précision à l'admiration.

Données sources :
{{evaluationsBlock}}

Rédige maintenant le commentaire de synthèse en t'appuyant sur l'ensemble des évaluations ci-dessus.`;
        },

        initBilanPromptEdit() {
            const v = this.appConfig.prompts && this.appConfig.prompts.scoring && this.appConfig.prompts.scoring.bilanSynthesis;
            this.bilanPromptTemplateEdit = (v != null && String(v).trim() !== "") ? v : this.getDefaultBilanPromptTemplate();
        },

        initMistralApiKeyEdit() {
            this.mistralApiKeyEdit = (this.appConfig.mistralApiKey != null) ? this.appConfig.mistralApiKey : '';
            this.mistralApiKeyEditing = false;
        },

        startMistralApiKeyEdit() {
            this.mistralApiKeyEditing = true;
        },

        cancelMistralApiKeyEdit() {
            this.mistralApiKeyEdit = (this.appConfig.mistralApiKey != null) ? this.appConfig.mistralApiKey : '';
            this.mistralApiKeyEditing = false;
        },

        saveMistralApiKey() {
            this.appConfig.mistralApiKey = (this.mistralApiKeyEdit != null) ? String(this.mistralApiKeyEdit).trim() : '';
            this.saveAppConfig();
            this.mistralApiKeyEditing = false;
        },

        initUpdateSourceEdit() {
            const src = this.appConfig.updateSource || {};
            this.updateSourceEdit = {
                repoOwner: (src.repoOwner != null) ? String(src.repoOwner) : '',
                repoName: (src.repoName != null) ? String(src.repoName) : '',
                token: (src.token != null) ? String(src.token) : ''
            };
            this.updateSourceEditing = false;
        },

        startUpdateSourceEdit() {
            this.updateSourceEditing = true;
        },

        cancelUpdateSourceEdit() {
            const src = this.appConfig.updateSource || {};
            this.updateSourceEdit = {
                repoOwner: (src.repoOwner != null) ? String(src.repoOwner) : '',
                repoName: (src.repoName != null) ? String(src.repoName) : '',
                token: (src.token != null) ? String(src.token) : ''
            };
            this.updateSourceEditing = false;
        },

        saveUpdateSource() {
            if (!this.appConfig.updateSource) this.appConfig.updateSource = { repoOwner: '', repoName: '', token: '' };
            this.appConfig.updateSource.repoOwner = (this.updateSourceEdit.repoOwner != null) ? String(this.updateSourceEdit.repoOwner).trim() : '';
            this.appConfig.updateSource.repoName = (this.updateSourceEdit.repoName != null) ? String(this.updateSourceEdit.repoName).trim() : '';
            this.appConfig.updateSource.token = (this.updateSourceEdit.token != null) ? String(this.updateSourceEdit.token).trim() : '';
            this.saveAppConfig();
            this.updateSourceEditing = false;
        },

        saveBilanPromptTemplate() {
            if (!this.appConfig.prompts) this.appConfig.prompts = { scoring: {}, review: {} };
            if (!this.appConfig.prompts.scoring) this.appConfig.prompts.scoring = {};
            this.appConfig.prompts.scoring.bilanSynthesis = this.bilanPromptTemplateEdit;
            this.saveAppConfig();
        },

        resetBilanPromptTemplate() {
            this.bilanPromptTemplateEdit = this.getDefaultBilanPromptTemplate();
        },

        saveReviewBilanPromptTemplate() {
            if (!this.appConfig.prompts) this.appConfig.prompts = { scoring: {}, review: {} };
            if (!this.appConfig.prompts.review) this.appConfig.prompts.review = {};
            this.appConfig.prompts.review.bilanSynthesis = this.reviewBilanSynthesisEdit;
            this.saveAppConfig();
        },

        resetReviewBilanPromptTemplate() {
            this.reviewBilanSynthesisEdit = this.getDefaultReviewBilanSynthesisTemplate();
        },

        initEmailTemplatesEdit() {
            this._normalizeEmailTemplatesConfig();
            var s = this.appConfig.emailTemplates && this.appConfig.emailTemplates.scoring;
            var r = this.appConfig.emailTemplates && this.appConfig.emailTemplates.review;
            this.emailTemplatesScoringSubjectEdit = (s && s.subject != null) ? String(s.subject) : 'Bilan Qualité - {{agent}}';
            this.emailTemplatesScoringBodyEdit = (s && s.body != null) ? String(s.body) : 'Bonjour {{agent}},\n\nVeuillez trouver ci-joint votre bilan qualité pour la campagne {{campagne}} du {{date}}.\n\nVotre note moyenne est de : {{note}}/10.\n\nSynthèse du superviseur :\n{{synthese}}\n\nCordialement,';
            this.emailTemplatesReviewSubjectEdit = (r && r.subject != null) ? String(r.subject) : 'Bilan Entretien - {{agent}}';
            this.emailTemplatesReviewBodyEdit = (r && r.body != null) ? String(r.body) : 'Bonjour {{agent}},\n\nVeuillez trouver ci-joint le compte-rendu de notre entretien pour la campagne {{campagne}} du {{date}}.\n\nSynthèse des échanges :\n{{synthese}}\n\nCordialement,';
        },

        saveEmailTemplates() {
            try {
                if (!this.appConfig.emailTemplates) this.appConfig.emailTemplates = { scoring: {}, review: {} };
                if (!this.appConfig.emailTemplates.scoring) this.appConfig.emailTemplates.scoring = {};
                if (!this.appConfig.emailTemplates.review) this.appConfig.emailTemplates.review = {};
                this.appConfig.emailTemplates.scoring.subject = (this.emailTemplatesScoringSubjectEdit != null) ? String(this.emailTemplatesScoringSubjectEdit) : '';
                this.appConfig.emailTemplates.scoring.body = (this.emailTemplatesScoringBodyEdit != null) ? String(this.emailTemplatesScoringBodyEdit) : '';
                this.appConfig.emailTemplates.review.subject = (this.emailTemplatesReviewSubjectEdit != null) ? String(this.emailTemplatesReviewSubjectEdit) : '';
                this.appConfig.emailTemplates.review.body = (this.emailTemplatesReviewBodyEdit != null) ? String(this.emailTemplatesReviewBodyEdit) : '';
                this.saveAppConfig();
                this.notify("Modèles d'emails sauvegardés !");
            } catch (e) { this.notify("Erreur sauvegarde modèles d'emails.", "error"); }
        },

        saveEvalCommentPromptTemplate() {
            if (!this.appConfig.prompts) this.appConfig.prompts = { scoring: {}, review: {} };
            if (!this.appConfig.prompts.scoring) this.appConfig.prompts.scoring = {};
            this.appConfig.prompts.scoring.evalComment = this.evalCommentPromptTemplateEdit;
            this.saveAppConfig();
        },

        buildBilanPromptForAI() {
            // Confidentialité PII : aucun prénom/nom d'agent n'est transmis à l'API IA
            const campaignName = this.agentContext.campaignName || 'Campagne';
            const isReview = this.campaignConfig && this.campaignConfig.campaign_type === 'review';
            const evals = this.bilanForm.evals || [];
            const evalsBlockLines = [];

            if (evals.length === 0) {
                evalsBlockLines.push("(Aucune évaluation disponible pour cette période.)");
            } else {
                evals.forEach((e, idx) => {
                    const d = e.fileContent || {};
                    const date = e.date || 'Date inconnue';
                    const offre = d.offre || 'Sans offre';
                    const note = e.note != null ? e.note : d.note;
                    const duree = (d.duree_min != null || d.duree_sec != null)
                        ? `${d.duree_min || 0} min ${d.duree_sec || 0} s`
                        : null;
                    evalsBlockLines.push(`=== ÉVALUATION ${idx + 1} / ${evals.length} — ${date} ===`);
                    evalsBlockLines.push(`Date et heure de la communication : ${date}`);
                    evalsBlockLines.push(`Offre : ${offre}  |  Note : ${note}/10${duree ? `  |  Durée : ${duree}` : ''}`);
                    evalsBlockLines.push("");

                    const scores = d.scores || {};
                    const comments = d.comments || {};
                    const scoreIds = Object.keys(scores);
                    if (scoreIds.length > 0) {
                        evalsBlockLines.push("Détail des critères :");
                        const gridSections = this.grid || [];
                        let hasStructuredLines = false;
                        gridSections.forEach((sec) => {
                            const sectionLabel = (sec && sec.label) ? sec.label : 'Rubrique';
                            const fields = (sec && sec.fields) ? sec.fields : [];
                            const sectionLines = [];
                            fields.forEach((field) => {
                                if (!field || field.type !== 'scoring') return;
                                const id = field.id;
                                const val = scores[id];
                                if (val == null || val === '') return;
                                const label = field.label || this.getCriterionLabel(id);
                                const max = field.max != null ? field.max : this.getCriterionMax(id);
                                const maxStr = max != null ? `/${max}` : '';
                                const comment = comments[id] ? ` — Commentaire : ${comments[id]}` : '';
                                sectionLines.push(`  - ${label} : ${val}${maxStr}${comment}`);
                            });
                            if (sectionLines.length > 0) {
                                hasStructuredLines = true;
                                evalsBlockLines.push(`  [${sectionLabel}]`);
                                sectionLines.forEach(line => evalsBlockLines.push(line));
                            }
                        });
                        // Fallback défensif si la grille est absente/incohérente.
                        if (!hasStructuredLines) {
                            scoreIds.forEach(id => {
                                const label = this.getCriterionLabel(id);
                                const max = this.getCriterionMax(id);
                                const val = scores[id];
                                const maxStr = max != null ? `/${max}` : '';
                                const comment = comments[id] ? ` — Commentaire : ${comments[id]}` : '';
                                evalsBlockLines.push(`  - ${label} : ${val}${maxStr}${comment}`);
                            });
                        }
                        evalsBlockLines.push("");
                    }

                    const commentaireGlobal = (d.commentaire || "").trim();
                    if (commentaireGlobal) {
                        evalsBlockLines.push(`[Commentaire global de l'évaluateur — uniquement pour l'évaluation ${idx + 1} ci-dessus]`);
                        evalsBlockLines.push(commentaireGlobal);
                        evalsBlockLines.push("");
                    }
                    const statsAnalysis = (d.stats_analysis_comment || '').trim();
                    if (isReview && statsAnalysis) {
                        evalsBlockLines.push("=== ANALYSE DES STATISTIQUES ===");
                        evalsBlockLines.push(statsAnalysis);
                        evalsBlockLines.push("");
                    }
                    evalsBlockLines.push("");
                });
            }

            const evaluationsBlock = evalsBlockLines.join("\n");
            const templateSource = isReview
                ? (this.appConfig.prompts && this.appConfig.prompts.review && this.appConfig.prompts.review.bilanSynthesis)
                : (this.appConfig.prompts && this.appConfig.prompts.scoring && this.appConfig.prompts.scoring.bilanSynthesis);
            const template = (templateSource != null && String(templateSource).trim() !== '') ? templateSource : (isReview ? this.getDefaultReviewBilanSynthesisTemplate() : this.getDefaultBilanPromptTemplate());
            if (isReview && evals.length > 0) {
                const reviewLines = [];
                evals.forEach((e) => {
                    const d = e.fileContent || {};
                    const date = e.date || 'Date inconnue';
                    const textResp = d.textResponses || {};
                    const boolResp = d.booleanResponses || {};
                    const scoresData = d.scores || {};
                    this.grid && this.grid.forEach((sec) => {
                        const sectionLabel = (sec && sec.label) ? sec.label : 'Rubrique';
                        let sectionLines = [];
                        (sec.fields || []).forEach((field) => {
                            if (field.type === 'textarea') {
                                const v = textResp[field.id] != null ? String(textResp[field.id]).trim() : '';
                                if (v) sectionLines.push('  - ' + (field.label || field.id) + ' : ' + v);
                            } else if (field.type === 'boolean') {
                                const b = boolResp[field.id];
                                sectionLines.push('  - ' + (field.label || field.id) + ' : ' + (b ? 'Oui' : 'Non'));
                            } else if (field.type === 'scoring') {
                                const val = scoresData[field.id];
                                if (val != null && val !== '') {
                                    const max = field.max != null ? field.max : 0;
                                    sectionLines.push('  - ' + (field.label || field.id) + ' : ' + val + '/' + max);
                                }
                            }
                        });
                        if (sectionLines.length > 0) {
                            reviewLines.push('[' + sectionLabel + ']');
                            sectionLines.forEach(line => reviewLines.push(line));
                            reviewLines.push('');
                        }
                    });
                    const statsAnalysisReview = (d.stats_analysis_comment || '').trim();
                    if (statsAnalysisReview) {
                        reviewLines.push('  - Analyse des statistiques : ' + statsAnalysisReview);
                    }
                });
                const criteriaBlock = reviewLines.length > 0 ? 'Réponses :\n\n' + reviewLines.join('\n') : '(Aucune réponse renseignée.)';
                const reviewDate = (evals[0] && evals[0].date) ? evals[0].date : 'Date inconnue';
                return template
                    .replace(/\{\{campaignName\}\}/g, campaignName)
                    .replace(/\{\{evalsCount\}\}/g, String(evals.length))
                    .replace(/\{\{evaluationsBlock\}\}/g, evaluationsBlock)
                    .replace(/\{\{criteriaBlock\}\}/g, criteriaBlock)
                    .replace(/\{\{date\}\}/g, reviewDate);
            }
            return template
                .replace(/\{\{campaignName\}\}/g, campaignName)
                .replace(/\{\{evalsCount\}\}/g, String(evals.length))
                .replace(/\{\{evaluationsBlock\}\}/g, evaluationsBlock);
        },

        async copyBilanPromptToClipboard() {
            const prompt = this.buildBilanPromptForAI();
            try {
                await navigator.clipboard.writeText(prompt);
                this.bilanPromptGenerated = prompt;
                this.bilanPromptModalOpen = true;
                this.notify("Prompt copié ! Collez-le dans ChatGPT, Claude, etc.");
            } catch (e) {
                this.bilanPromptGenerated = prompt;
                this.bilanPromptModalOpen = true;
                this.notify("Affichage du prompt (copie impossible). Utilisez le bouton Copier ci-dessous.", "error");
            }
        },

        async copyBilanPromptFromModal() {
            if (!this.bilanPromptGenerated) return;
            try {
                await navigator.clipboard.writeText(this.bilanPromptGenerated);
                this.notify("Prompt copié dans le presse-papiers.");
            } catch (e) {
                this.notify("Impossible de copier.", "error");
            }
        },

        async generateBilanWithMistral() {
            if ((this.bilanForm.evals || []).length === 0) {
                this.notify("Ajoutez des évaluations.", "error");
                return;
            }
            const apiKey = (typeof CONFIG_APP !== 'undefined' && CONFIG_APP.mistralApiKey) ? CONFIG_APP.mistralApiKey : '';
            if (!apiKey || !apiKey.trim()) {
                this.notify("Clé Mistral manquante. Renseignez CONFIG_APP.mistralApiKey dans config_app.js.", "error");
                return;
            }
            if (!window.MistralBilan || typeof window.MistralBilan.generateComment !== 'function') {
                this.notify("Module Mistral non chargé. Vérifiez que mistralBilan.js est inclus.", "error");
                return;
            }
            this.bilanGenerating = true;
            try {
                const prompt = this.buildBilanPromptForAI();
                const text = await window.MistralBilan.generateComment(prompt, CONFIG_APP.mistralApiKey);
                this.bilanForm.comment = (text || '').trim();
                this.notify("Commentaire généré.");
            } catch (e) {
                this.notify(e.message || "Erreur Mistral", "error");
            } finally {
                this.bilanGenerating = false;
            }
        },

        getDefaultEvalCommentPromptTemplate() {
            return "Rôle : Manager-coach sobre.\nMission : Rédiger un feedback flash pour l'appel du {{date}} (Offre {{offre}} - {{note}}/10) en utilisant le \"tu\".\n\nConsignes de rédaction :\n1. Style : Direct, factuel et sans fioritures. Supprime toute formule de politesse ou compliment générique (type \"Bravo\", \"Bon travail\").\n2. Format : Exactement 2 phrases (ou 2 lignes courtes).\n3. Contenu :\n   - Ligne 1 : Ton diagnostic sur la posture de communication (écoute, questionnement, fluidité).\n   - Ligne 2 : Ton évaluation de la précision technique et de la réponse apportée.\n4. Contrainte : Pas de superlatifs. Préfère les verbes d'action et les constats neutres.\n\nDonnées de l'évaluation :\n{{criteriaBlock}}\n\nRédige maintenant le commentaire global en 2 lignes.";
        },

        getDefaultReviewBilanSynthesisTemplate() {
            return "Tu es un assistant qui rédige la synthèse du bilan d'un entretien qualitatif pour un conseiller.\nDonnées de l'entretien ci-dessous (réponses aux questions qualitatives).\nRédige une synthèse en 4 à 6 lignes : points forts, axes de progrès, objectif si pertinent. Style factuel et bienveillant. Base-toi uniquement sur les données ci-dessous.\n\nDate de l'entretien : {{date}}\n\n{{criteriaBlock}}\n\nRédige maintenant la synthèse du bilan.";
        },

        getDefaultStatsAnalysisSystemPromptTemplate() {
            return "SYSTEM PROMPT\nTu es un manager bienveillant mais factuel qui fait le bilan avec son agent.\nRédige une synthèse fluide (4 à 5 phrases maximum).\nRègles strictes :\n- Adresse-toi DIRECTEMENT à l'agent en le tutoyant ('tu', 'ta', 'tes').\n- Fais des sauts de ligne pour aérer le texte, mais n'utilise JAMAIS de listes à puces (ni tirets, ni astérisques).\n- Ne commente JAMAIS les écarts de volumes totaux d'appels.\nStructure obligatoire :\n1/ Bilan global rapide.\n2/ Cite une offre en progression (utilise les chiffres pour comparer avec N-1 ET avec la moyenne régionale).\n3/ Cite une offre ou un point en dégradation (utilise les chiffres pour comparer avec N-1 ET avec la moyenne régionale).\n4/ Termine par 'Proposition d'action :' suivi d'une action très concrète.";
        },

        initEvalCommentPromptEdit() {
            const v = this.appConfig.prompts && this.appConfig.prompts.scoring && this.appConfig.prompts.scoring.evalComment;
            this.evalCommentPromptTemplateEdit = (v != null && String(v).trim() !== "") ? v : this.getDefaultEvalCommentPromptTemplate();
        },

        initReviewBilanPromptEdit() {
            const v = this.appConfig.prompts && this.appConfig.prompts.review && this.appConfig.prompts.review.bilanSynthesis;
            this.reviewBilanSynthesisEdit = (v != null && String(v).trim() !== "") ? v : this.getDefaultReviewBilanSynthesisTemplate();
        },

        initStatsAnalysisSystemPromptEdit() {
            const v = this.appConfig.prompts && this.appConfig.prompts.review && this.appConfig.prompts.review.statsAnalysisSystem;
            this.statsAnalysisSystemPromptEdit = (v != null && String(v).trim() !== "") ? v : this.getDefaultStatsAnalysisSystemPromptTemplate();
        },

        resetEvalCommentPromptTemplate() {
            this.evalCommentPromptTemplateEdit = this.getDefaultEvalCommentPromptTemplate();
        },

        saveStatsAnalysisSystemPromptTemplate() {
            if (!this.appConfig.prompts) this.appConfig.prompts = { scoring: {}, review: {} };
            if (!this.appConfig.prompts.review) this.appConfig.prompts.review = {};
            this.appConfig.prompts.review.statsAnalysisSystem = this.statsAnalysisSystemPromptEdit;
            this.saveAppConfig();
        },

        resetStatsAnalysisSystemPromptTemplate() {
            this.statsAnalysisSystemPromptEdit = this.getDefaultStatsAnalysisSystemPromptTemplate();
        },

        buildEvalCommentPromptForAI() {
            const scores = this.form.scores || {};
            const comments = this.form.comments || {};
            const sections = [];
            const gridSecs = this.grid || [];
            for (let c = 0; c < gridSecs.length; c++) {
                const sec = gridSecs[c];
                const secName = sec.label || 'Critères';
                const fields = sec.fields || [];
                const lines = [];
                for (let i = 0; i < fields.length; i++) {
                    const field = fields[i];
                    if (field.type !== 'scoring') continue;
                    const id = field.id;
                    const val = scores[id];
                    if (val == null || val === '') continue;
                    const label = field.label || this.getCriterionLabel(id);
                    const max = field.max != null ? field.max : this.getCriterionMax(id);
                    const maxStr = max != null ? '/' + max : '';
                    const comment = comments[id] ? ' — Commentaire : ' + comments[id] : '';
                    lines.push('  - ' + label + ' : ' + val + maxStr + comment);
                }
                if (lines.length > 0) {
                    sections.push(secName + '\n' + lines.join('\n'));
                }
            }
            var criteriaBlock;
            if (this.form.note === 'N/A') {
                var reviewLines = [];
                var gridSecsRev = this.grid || [];
                gridSecsRev.forEach(function (sec) {
                    (sec.fields || []).forEach(function (field) {
                        if (field.type === 'textarea') {
                            var v = (this.form.textResponses && this.form.textResponses[field.id]) ? String(this.form.textResponses[field.id]).trim() : '';
                            if (v) reviewLines.push('  - ' + (field.label || field.id) + ' : ' + v);
                        } else if (field.type === 'boolean') {
                            var b = this.form.booleanResponses && this.form.booleanResponses[field.id];
                            reviewLines.push('  - ' + (field.label || field.id) + ' : ' + (b ? 'Oui' : 'Non'));
                        } else if (field.type === 'scoring') {
                            var val = this.form.scores && this.form.scores[field.id];
                            if (val != null && val !== '') {
                                var max = field.max != null ? field.max : 0;
                                reviewLines.push('  - ' + (field.label || field.id) + ' : ' + val + '/' + max);
                            }
                        }
                    }.bind(this));
                }.bind(this));
                criteriaBlock = reviewLines.length > 0 ? 'Réponses :\n\n' + reviewLines.join('\n') : '(Aucune réponse renseignée.)';
            } else {
                criteriaBlock = sections.length > 0 ? 'Détail des critères :\n\n' + sections.join('\n\n') : '(Aucun critère renseigné.)';
            }
            const raw = this.appConfig.prompts && this.appConfig.prompts.scoring && this.appConfig.prompts.scoring.evalComment;
            const template = (raw != null && String(raw).trim() !== '') ? raw : this.getDefaultEvalCommentPromptTemplate();
            const offre = (this.form.offre || '').trim() || 'Non renseignée';
            const note = this.form.note != null ? String(this.form.note) : '—';
            const date = (this.form.date_communication || '').trim() || 'Non renseignée';
            return template
                .replace(/\{\{criteriaBlock\}\}/g, criteriaBlock)
                .replace(/\{\{offre\}\}/g, offre)
                .replace(/\{\{note\}\}/g, note)
                .replace(/\{\{date\}\}/g, date);
        },

        async buildStatsPromptForAI() {
            const snap = this.form && this.form.stats_snapshot ? this.form.stats_snapshot : null;
            if (!snap || !snap.metrics) {
                throw new Error("Aucun snapshot de statistiques disponible.");
            }
            const repo = window.HQApp && window.HQApp.StatsRepository;
            if (!repo || typeof repo.loadProductionStats !== 'function' || typeof repo.aggregatePerimeterStats !== 'function') {
                throw new Error("Module StatsRepository indisponible.");
            }
            if (!this.rootHandle) {
                throw new Error("Sélectionnez la racine du projet pour analyser les statistiques.");
            }
            const agentId = this.agentContext.active ? Number(this.agentContext.agentId) : Number(this.form.agent);
            if (!Number.isFinite(agentId)) {
                throw new Error("Agent introuvable pour l'analyse IA.");
            }

            const period = snap.period || {};
            const evalStart = period.eval_start || (this.campaignConfig && this.campaignConfig.period_start) || '';
            const evalEnd = period.eval_end || (this.campaignConfig && this.campaignConfig.period_end) || '';
            const compareStart = period.compare_start || '';
            const compareEnd = period.compare_end || '';

            const agentsRef = (this.agents && this.agents.length > 0) ? this.agents : (this.allAgents || []);
            let compareRaw = { telephone: [], courriels: [], watt: [], wattDetail: [] };
            if (compareStart && compareEnd) {
                compareRaw = await repo.loadProductionStats(this.rootHandle, {
                    agentId: agentId,
                    agents: agentsRef,
                    dateFrom: compareStart,
                    dateTo: compareEnd
                });
            }

            const perimeterRaw = await repo.loadProductionStats(this.rootHandle, {
                agents: agentsRef,
                dateFrom: evalStart || undefined,
                dateTo: evalEnd || undefined
            });
            const perimeterDto = repo.aggregatePerimeterStats(perimeterRaw || {}, null);

            const KPI_META = {
                dmt: { label: "DMT (Durée moyenne de traitement)", unit: "s", goal: "lower_is_better" },
                dmc: { label: "DMC (Durée moyenne de communication)", unit: "s", goal: "lower_is_better" },
                dmmg: { label: "DMMG (Durée de mise en garde)", unit: "s", goal: "lower_is_better" },
                dmpa: { label: "DMPA (Durée moyenne de post-appel)", unit: "s", goal: "lower_is_better" },
                identifications: { label: "Taux d'identification des appels", unit: "%", goal: "higher_is_better" },
                reponses_immediates: { label: "Taux de réponses immédiates", unit: "%", goal: "higher_is_better" },
                rona: { label: "Appels non décrochés (RONA)", unit: "", goal: "lower_is_better" }
            };
            const TIME_METRICS = { dmt: true, dmc: true, dmmg: true, dmpa: true };

            const toNumber = (v) => {
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : null;
            };
            const asPercentInt = (v) => {
                const n = toNumber(v);
                if (n == null) return null;
                const percent = Math.abs(n) <= 1 ? (n * 100) : n;
                return Math.round(percent);
            };
            const formatDuration = (seconds) => {
                const n = toNumber(seconds);
                if (n == null) return null;
                const totalSec = Math.max(0, Math.round(n));
                const m = Math.floor(totalSec / 60);
                const s = String(totalSec % 60).padStart(2, '0');
                return m + "m" + s;
            };
            const normalizeValue = (metric, value) => {
                const n = toNumber(value);
                if (n == null) return null;
                const meta = KPI_META[metric];
                if (meta && meta.unit === '%') return asPercentInt(n);
                return Math.round(n);
            };
            const formatValue = (metric, value) => {
                const n = normalizeValue(metric, value);
                if (n == null) return null;
                if (TIME_METRICS[metric]) return formatDuration(n);
                const unit = KPI_META[metric] && KPI_META[metric].unit ? KPI_META[metric].unit : '';
                return unit ? (n + unit) : String(n);
            };
            const classifyDelta = (metric, evalVal, refVal) => {
                const e = normalizeValue(metric, evalVal);
                const r = normalizeValue(metric, refVal);
                if (e == null || r == null) return null;
                const diff = e - r;
                if (diff === 0) return { status: "Stable", diff: 0, evalValue: e, refValue: r };
                const meta = KPI_META[metric] || { goal: "higher_is_better" };
                const improved = meta.goal === "lower_is_better" ? (diff < 0) : (diff > 0);
                return {
                    status: improved ? "Amélioration" : "Dégradation",
                    diff: Math.abs(diff),
                    evalValue: e,
                    refValue: r
                };
            };
            const semanticLine = (metric, evalVal, refVal, refLabel) => {
                const m = KPI_META[metric];
                if (!m) return null;
                const c = classifyDelta(metric, evalVal, refVal);
                if (!c) return null;
                if (c.status === "Stable") {
                    return "- " + m.label + " : Stable (" + c.evalValue + (m.unit || '') + " vs " + c.refValue + (m.unit || '') + ", référence " + refLabel + ").";
                }
                const diffText = TIME_METRICS[metric] ? formatDuration(c.diff) : (c.diff + (m.unit || ''));
                const evalText = TIME_METRICS[metric] ? formatDuration(c.evalValue) : (c.evalValue + (m.unit || ''));
                const refText = TIME_METRICS[metric] ? formatDuration(c.refValue) : (c.refValue + (m.unit || ''));
                return "- " + m.label + " : " + c.status + " de " + diffText + " (" + evalText + " vs " + refText + ", référence " + refLabel + ").";
            };
            const findByAgent = (arr) => Array.isArray(arr)
                ? (arr.find(r => Number(r.agentId) === Number(agentId)) || null)
                : null;
            const findOffer = (offers, name) => {
                if (!Array.isArray(offers)) return null;
                const target = String(name || '').trim();
                return offers.find(o => String((o && o.offre) || '').trim() === target) || null;
            };

            const visibleChannels = {
                phone: !!(snap.channels && snap.channels.phone && snap.metrics.telephone && snap.metrics.telephone.hidden !== true),
                email: !!(snap.channels && snap.channels.email && snap.metrics.courriels && snap.metrics.courriels.hidden !== true),
                watt: !!(snap.channels && snap.channels.watt && snap.metrics.watt && snap.metrics.watt.hidden !== true)
            };

            const contextBlock = [];
            contextBlock.push("CONTEXTE");
            contextBlock.push("- Période évaluée : " + (evalStart || 'n/a') + " -> " + (evalEnd || 'n/a'));
            contextBlock.push("- Période comparaison : " + ((compareStart && compareEnd) ? (compareStart + " -> " + compareEnd) : "n/a"));
            contextBlock.push("- Moyenne du périmètre : calcul identique au Dashboard.");

            const performanceBlock = [];
            performanceBlock.push("PERFORMANCES AGENT (période évaluée)");
            const evolutionBlock = [];
            evolutionBlock.push("EVOLUTION (vs période comparaison)");
            const benchmarkBlock = [];
            benchmarkBlock.push("MOYENNE DU PERIMETRE (vs période évaluée)");
            const phoneOfferHeader = (offerName) => {
                const name = String(offerName || '').trim();
                if (name.toUpperCase() === 'GLOBAL') return "- PERFORMANCE GLOBALE (Toutes offres confondues) :";
                return "- Détail de l'offre " + name + " :";
            };

            if (visibleChannels.phone) {
                const telEval = snap.metrics.telephone || {};
                const evalOffers = Array.isArray(telEval.by_offer) ? telEval.by_offer.filter(r => r && r.hidden !== true) : [];
                const compareTelAgent = findByAgent(compareRaw && compareRaw.telephone);
                const compareOffers = compareTelAgent && Array.isArray(compareTelAgent.offres) ? compareTelAgent.offres : [];
                const perimeterTel = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.telephone))
                    ? (perimeterDto.production.telephone[0] || null)
                    : null;
                const perimeterOffers = perimeterTel && Array.isArray(perimeterTel.offres) ? perimeterTel.offres : [];
                const telGlobal = telEval && telEval.global ? telEval.global : null;

                performanceBlock.push("Téléphone (offres visibles)");
                if (telGlobal) {
                    performanceBlock.push(phoneOfferHeader('GLOBAL') + " volume évalué=" + (normalizeValue('dmt', telGlobal.appels_traites) ?? 0) + " appels.");
                    performanceBlock.push("  " + (KPI_META.dmt.label + " : " + (formatValue('dmt', telGlobal.dmt) || 'n/a')) + " | " + (KPI_META.dmc.label + " : " + (formatValue('dmc', telGlobal.dmc) || 'n/a')) + " | " + (KPI_META.dmmg.label + " : " + (formatValue('dmmg', telGlobal.dmmg) || 'n/a')) + " | " + (KPI_META.dmpa.label + " : " + (formatValue('dmpa', telGlobal.dmpa) || 'n/a')) + " | " + (KPI_META.identifications.label + " : " + (formatValue('identifications', telGlobal.identifications) || 'n/a')) + " | " + (KPI_META.reponses_immediates.label + " : " + (formatValue('reponses_immediates', telGlobal.reponses_immediates) || 'n/a')) + " | " + (KPI_META.rona.label + " : " + (formatValue('rona', telGlobal.rona) || 'n/a')));
                    const compareGlobalLines = [
                        semanticLine('dmt', telGlobal.dmt, compareTelAgent && compareTelAgent.dmt, 'N-1 global'),
                            semanticLine('dmmg', telGlobal.dmmg, compareTelAgent && compareTelAgent.dmmg, 'N-1 global'),
                        semanticLine('identifications', telGlobal.identifications, compareTelAgent && compareTelAgent.identifications, 'N-1 global'),
                        semanticLine('reponses_immediates', telGlobal.reponses_immediates, compareTelAgent && compareTelAgent.reponses_immediates, 'N-1 global'),
                        semanticLine('rona', telGlobal.rona, compareTelAgent && compareTelAgent.rona, 'N-1 global')
                    ].filter(Boolean);
                    if (compareGlobalLines.length > 0) {
                        evolutionBlock.push(phoneOfferHeader('GLOBAL'));
                        compareGlobalLines.forEach(l => evolutionBlock.push("  " + l));
                    }
                    const benchmarkGlobalLines = [
                        semanticLine('dmt', telGlobal.dmt, perimeterTel && perimeterTel.dmt, 'moyenne périmètre globale'),
                        semanticLine('dmmg', telGlobal.dmmg, perimeterTel && perimeterTel.dmmg, 'moyenne périmètre globale'),
                        semanticLine('identifications', telGlobal.identifications, perimeterTel && perimeterTel.identifications, 'moyenne périmètre globale'),
                        semanticLine('reponses_immediates', telGlobal.reponses_immediates, perimeterTel && perimeterTel.reponses_immediates, 'moyenne périmètre globale')
                    ].filter(Boolean);
                    if (benchmarkGlobalLines.length > 0) {
                        benchmarkBlock.push(phoneOfferHeader('GLOBAL'));
                        benchmarkGlobalLines.forEach(l => benchmarkBlock.push("  " + l));
                    }
                }
                if (evalOffers.length === 0) {
                    performanceBlock.push("- Aucune offre visible.");
                } else {
                    for (let i = 0; i < evalOffers.length; i++) {
                        const e = evalOffers[i];
                        const offerName = (e.offre || 'GLOBAL');
                        const c = findOffer(compareOffers, offerName);
                        const p = findOffer(perimeterOffers, offerName);
                        performanceBlock.push(phoneOfferHeader(offerName) + " volume évalué=" + (normalizeValue('dmt', e.appels_traites) ?? 0) + " appels.");
                        performanceBlock.push("  " + (KPI_META.dmt.label + " : " + (formatValue('dmt', e.dmt) || 'n/a')) + " | " + (KPI_META.dmc.label + " : " + (formatValue('dmc', e.dmc) || 'n/a')) + " | " + (KPI_META.dmmg.label + " : " + (formatValue('dmmg', e.dmmg) || 'n/a')) + " | " + (KPI_META.dmpa.label + " : " + (formatValue('dmpa', e.dmpa) || 'n/a')) + " | " + (KPI_META.identifications.label + " : " + (formatValue('identifications', e.identifications) || 'n/a')) + " | " + (KPI_META.reponses_immediates.label + " : " + (formatValue('reponses_immediates', e.reponses_immediates) || 'n/a')) + " | " + (KPI_META.rona.label + " : " + (formatValue('rona', e.rona) || 'n/a')));

                        const compareLines = [
                            semanticLine('dmt', e.dmt, c && c.dmt, 'N-1'),
                            semanticLine('dmmg', e.dmmg, c && c.dmmg, 'N-1'),
                            semanticLine('identifications', e.identifications, c && c.identifications, 'N-1'),
                            semanticLine('reponses_immediates', e.reponses_immediates, c && c.reponses_immediates, 'N-1'),
                            semanticLine('rona', e.rona, c && c.rona, 'N-1')
                        ].filter(Boolean);
                        if (compareLines.length > 0) {
                            evolutionBlock.push(phoneOfferHeader(offerName));
                            compareLines.forEach(l => evolutionBlock.push("  " + l));
                        } else {
                            evolutionBlock.push(phoneOfferHeader(offerName) + " comparaison indisponible.");
                        }

                        const benchmarkLines = [
                            semanticLine('dmt', e.dmt, p && p.dmt, 'périmètre'),
                            semanticLine('dmmg', e.dmmg, p && p.dmmg, 'périmètre'),
                            semanticLine('identifications', e.identifications, p && p.identifications, 'périmètre'),
                            semanticLine('reponses_immediates', e.reponses_immediates, p && p.reponses_immediates, 'périmètre')
                        ].filter(Boolean);
                        if (benchmarkLines.length > 0) {
                            benchmarkBlock.push(phoneOfferHeader(offerName));
                            benchmarkLines.forEach(l => benchmarkBlock.push("  " + l));
                        } else {
                            benchmarkBlock.push(phoneOfferHeader(offerName) + " moyenne du périmètre indisponible.");
                        }
                    }
                }
            }

            if (visibleChannels.email) {
                const e = (snap.metrics && snap.metrics.courriels && snap.metrics.courriels.global) ? snap.metrics.courriels.global : null;
                const cAgent = findByAgent(compareRaw && compareRaw.courriels);
                const p = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.courriels))
                    ? (perimeterDto.production.courriels[0] || null)
                    : null;
                if (e) {
                    performanceBlock.push("- Courriels : volume évalué -> clôture=" + Math.round(e.cloture || 0) + ", envoi_watt=" + Math.round(e.envoi_watt || 0) + ", reponse_directe=" + Math.round(e.reponse_directe || 0) + ".");
                    if (cAgent) evolutionBlock.push("- Courriels : comparaison disponible (volumes informatifs seulement, ne pas conclure sur les écarts de volume).");
                    if (p) benchmarkBlock.push("- Courriels : moyenne du périmètre disponible (volumes informatifs seulement).");
                }
            }

            if (visibleChannels.watt) {
                const eGlobal = (snap.metrics && snap.metrics.watt && snap.metrics.watt.global) ? snap.metrics.watt.global : null;
                const eRows = (snap.metrics && snap.metrics.watt && Array.isArray(snap.metrics.watt.by_circuit))
                    ? snap.metrics.watt.by_circuit.filter(r => r && r.hidden !== true)
                    : [];
                const cAgent = findByAgent(compareRaw && compareRaw.watt);
                const pGlobal = (perimeterDto && perimeterDto.production && Array.isArray(perimeterDto.production.watt))
                    ? (perimeterDto.production.watt[0] || null)
                    : null;
                if (eGlobal) {
                    performanceBlock.push("- WATT : volume évalué -> clôture=" + Math.round(eGlobal.cloture_manuelle || 0) + ", reroutage=" + Math.round(eGlobal.reroutage_individuel || 0) + ", transfert=" + Math.round(eGlobal.transfert_prod || 0) + ".");
                    if (cAgent) evolutionBlock.push("- WATT : comparaison disponible (volumes informatifs seulement, ne pas conclure sur les écarts de volume).");
                    if (pGlobal) benchmarkBlock.push("- WATT : moyenne du périmètre disponible (volumes informatifs seulement).");
                }
                if (eRows.length > 0) {
                    performanceBlock.push("  Circuits visibles :");
                    for (let i = 0; i < eRows.length; i++) {
                        const row = eRows[i];
                        performanceBlock.push("   - " + (row.circuit || 'GLOBAL') + ": clôture=" + Math.round(row.cloture_manuelle || 0) + ", reroutage=" + Math.round(row.reroutage_individuel || 0) + ", transfert=" + Math.round(row.transfert_prod || 0));
                    }
                }
            }

            const rawSystemPrompt = this.appConfig.prompts && this.appConfig.prompts.review && this.appConfig.prompts.review.statsAnalysisSystem;
            const systemPrompt = (rawSystemPrompt != null && String(rawSystemPrompt).trim() !== '')
                ? String(rawSystemPrompt)
                : this.getDefaultStatsAnalysisSystemPromptTemplate();

            const userPrompt = []
                .concat(contextBlock, [''])
                .concat(performanceBlock, [''])
                .concat(evolutionBlock, [''])
                .concat(benchmarkBlock, [''])
                .concat([
                    "TACHE",
                    "Rédige maintenant la synthèse manager (4 lignes max), factuelle, orientée action, sans commentaire sur les écarts de volume total."
                ]);

            return systemPrompt + '\n\n' + userPrompt.join('\n');
        },

        async copyStatsPromptToClipboard() {
            if (!this.form || !this.form.stats_snapshot) {
                this.notify("Importez d'abord les statistiques.", "error");
                return;
            }
            try {
                const prompt = await this.buildStatsPromptForAI();
                try {
                    await navigator.clipboard.writeText(prompt);
                    this.bilanPromptGenerated = prompt;
                    this.bilanPromptModalOpen = true;
                    this.notify("Prompt copié ! Collez-le dans ChatGPT, Claude, etc.");
                } catch (e) {
                    this.bilanPromptGenerated = prompt;
                    this.bilanPromptModalOpen = true;
                    this.notify("Affichage du prompt (copie impossible). Utilisez le bouton Copier dans la modale.", "error");
                }
            } catch (e) {
                this.notify(e.message || "Erreur génération prompt stats", "error");
            }
        },

        async generateStatsAnalysisWithMistral() {
            if (this._ensureCampaignNotClosed && this._ensureCampaignNotClosed()) return;
            if (!this.form || !this.form.stats_snapshot) {
                this.notify("Importez d'abord les statistiques.", "error");
                return;
            }
            const apiKey = (typeof CONFIG_APP !== 'undefined' && CONFIG_APP.mistralApiKey) ? CONFIG_APP.mistralApiKey : '';
            if (!apiKey || !apiKey.trim()) {
                this.notify("Clé Mistral manquante. Renseignez CONFIG_APP.mistralApiKey dans config_app.js.", "error");
                return;
            }
            if (!window.MistralBilan || typeof window.MistralBilan.generateComment !== 'function') {
                this.notify("Module Mistral non chargé. Vérifiez que mistralBilan.js est inclus.", "error");
                return;
            }
            this.isGeneratingStatsAnalysisAi = true;
            try {
                const prompt = await this.buildStatsPromptForAI();
                const text = await window.MistralBilan.generateComment(prompt, CONFIG_APP.mistralApiKey);
                this.form.stats_analysis_comment = (text || '').trim();
                this.evalSaveStatus = 'Modifications...';
                this.notify("Analyse des statistiques générée.");
            } catch (e) {
                this.notify(e.message || "Erreur Mistral", "error");
            } finally {
                this.isGeneratingStatsAnalysisAi = false;
            }
        },

        async copyEvalCommentPromptToClipboard() {
            var hasContent = false;
            if (this.form.note === 'N/A') {
                hasContent = Object.keys(this.form.textResponses || {}).some(function (k) { return ((this.form.textResponses[k] || '').trim() !== ''); }.bind(this)) ||
                    Object.keys(this.form.booleanResponses || {}).some(function (k) { return this.form.booleanResponses[k]; }.bind(this)) ||
                    Object.keys(this.form.scores || {}).filter(function (k) { var v = this.form.scores[k]; return v != null && v !== ''; }.bind(this)).length > 0;
            } else {
                hasContent = Object.keys(this.form.scores || {}).filter(function (k) {
                    var v = this.form.scores[k];
                    return v != null && v !== '';
                }.bind(this)).length > 0;
            }
            if (!hasContent) {
                this.notify("Renseignez au moins un critère ou une réponse.", "error");
                return;
            }
            const prompt = this.buildEvalCommentPromptForAI();
            try {
                await navigator.clipboard.writeText(prompt);
                this.bilanPromptGenerated = prompt;
                this.bilanPromptModalOpen = true;
                this.notify("Prompt copié ! Collez-le dans ChatGPT, Claude, etc.");
            } catch (e) {
                this.bilanPromptGenerated = prompt;
                this.bilanPromptModalOpen = true;
                this.notify("Affichage du prompt (copie impossible). Utilisez le bouton Copier dans la modale.", "error");
            }
        },

        async generateEvalCommentWithMistral() {
            var hasContent = false;
            if (this.form.note === 'N/A') {
                hasContent = Object.keys(this.form.textResponses || {}).some(function (k) { return ((this.form.textResponses[k] || '').trim() !== ''); }.bind(this)) ||
                    Object.keys(this.form.booleanResponses || {}).some(function (k) { return this.form.booleanResponses[k]; }.bind(this)) ||
                    Object.keys(this.form.scores || {}).filter(function (k) { var v = this.form.scores[k]; return v != null && v !== ''; }.bind(this)).length > 0;
            } else {
                hasContent = Object.keys(this.form.scores || {}).filter(function (k) {
                    var v = this.form.scores[k];
                    return v != null && v !== '';
                }.bind(this)).length > 0;
            }
            if (!hasContent) {
                this.notify("Renseignez au moins un critère ou une réponse.", "error");
                return;
            }
            const apiKey = (typeof CONFIG_APP !== 'undefined' && CONFIG_APP.mistralApiKey) ? CONFIG_APP.mistralApiKey : '';
            if (!apiKey || !apiKey.trim()) {
                this.notify("Clé Mistral manquante. Renseignez CONFIG_APP.mistralApiKey dans config_app.js.", "error");
                return;
            }
            if (!window.MistralBilan || typeof window.MistralBilan.generateComment !== 'function') {
                this.notify("Module Mistral non chargé. Vérifiez que mistralBilan.js est inclus.", "error");
                return;
            }
            this.evalCommentGenerating = true;
            try {
                const prompt = this.buildEvalCommentPromptForAI();
                const text = await window.MistralBilan.generateComment(prompt, CONFIG_APP.mistralApiKey);
                this.form.commentaire = (text || '').trim();
                this.notify("Commentaire global généré.");
            } catch (e) {
                this.notify(e.message || "Erreur Mistral", "error");
            } finally {
                this.evalCommentGenerating = false;
            }
        },

        // --- GESTION DU REPLI (ADMIN-CRITERES / SAISIE) ---
        toggleCategory(index) {
            var secs = this.grid || [];
            if (secs[index]) secs[index].collapsed = !secs[index].collapsed;
        },

        toggleAccordion(index) {
            var secs = this.grid || [];
            if (!secs[index]) return;
            var currentState = secs[index].collapsed;
            if (currentState) {
                secs.forEach(function (c) { c.collapsed = true; });
                secs[index].collapsed = false;
            } else {
                secs[index].collapsed = true;
            }
        },

        _setEnginesFromCampaignType(campaignType) {
            var t = campaignType === 'review' ? 'review' : 'scoring';
            if (typeof window.HQApp !== 'undefined' && window.HQApp.EvaluationEngineFactory) {
                this.evaluationEngine = window.HQApp.EvaluationEngineFactory.getEngine(t);
            }
            if (typeof window.HQApp !== 'undefined' && window.HQApp.AnalyticsEngineFactory) {
                this.analyticsEngine = window.HQApp.AnalyticsEngineFactory.getEngine(t);
            }
        },

        // --- LOGIQUE DE CALCUL (délégation engines polymorphes) ---
        getSubTotal(category) {
            return this.evaluationEngine ? this.evaluationEngine.getSubTotal(this.form, category) : 0;
        },

        updateNote() {
            if (this.evaluationEngine) this.form.note = this.evaluationEngine.computeNote(this.form, { sections: this.grid });
        },

        // --- SAUVEGARDE ET AUTO-SAVE ---
        triggerAutoSave() {
            this.saveStatus = 'Modifications...';
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = setTimeout(() => {
                this.saveGridConfig(true); 
            }, 2000); 
        },

        async saveGridConfig(silent = false) {
            if (!this.rootHandle) return;
            this.saveStatus = 'Enregistrement...';
            try {
                var secs = this.grid || [];
                var cleanGrid = secs.map(function (sec) {
                    var collapsed = sec.collapsed;
                    var rest = Object.assign({}, sec);
                    delete rest.collapsed;
                    var rawFields = rest.fields || rest.items || [];
                    rest.fields = rawFields.map(function (f) {
                        var copy = Object.assign({}, f);
                        if (copy.type !== 'scoring') {
                            delete copy.max;
                            delete copy.step;
                        }
                        return copy;
                    });
                    return rest;
                });
                const payload = { title: (this.gridTitle || this.currentGridId), sections: cleanGrid };
                if (this.editingGridContext && this.editingGridContext.type === 'campaign') {
                    const sanitizedName = repository.sanitizeDirectoryName(this.editingGridContext.campaignName);
                    const campaignDirHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                    await repository.saveSnapshotForCampaign(this.rootHandle, campaignDirHandle, payload);
                } else {
                    const grille = this.grillesList.find(g => g.id === this.currentGridId);
                    if (this.currentGridId === 'default') {
                        payload.title = "Grille d'Exemple (à dupliquer)";
                    } else {
                        payload.title = (grille && grille.title) ? grille.title : this.currentGridId;
                    }
                    await repository.saveGrid(this.rootHandle, this.currentGridId, payload);
                }
                var forCompare = secs.map(function (s) { var c = s.collapsed; var r = Object.assign({}, s); delete r.collapsed; return r; });
                this.lastPersistedGridJson = JSON.stringify(forCompare);
                this.saveStatus = 'Enregistré';
                if (!silent) this.notify("Grille sauvegardée !");
            } catch (e) {
                this.saveStatus = 'Erreur';
                if (e.userMessage) this.notify(e.userMessage, "error");
                else this.notify("Erreur auto-save", "error");
            }
        },

        // --- FLÈCHES (ordre sections et champs) ---
        moveCategory(index, direction) {
            var secs = this.grid || [];
            const newIndex = index + direction;
            if (newIndex >= 0 && newIndex < secs.length) {
                const item = secs.splice(index, 1)[0];
                secs.splice(newIndex, 0, item);
            }
        },

        moveItem(catIndex, itemIndex, direction) {
            var secs = this.grid || [];
            const fields = (secs[catIndex] && secs[catIndex].fields) ? secs[catIndex].fields : [];
            const newIndex = itemIndex + direction;
            if (newIndex >= 0 && newIndex < fields.length) {
                const item = fields.splice(itemIndex, 1)[0];
                fields.splice(newIndex, 0, item);
                this.updateNote();
            }
        },

        // --- CONNEXION ET SYNC ---
        async connectOrRefresh(forcePicker = false) {
            if (!forcePicker && this.rootHandle && this.campagnesHandle) {
                if (!confirm("Voulez-vous sélectionner un nouveau dossier racine ?")) {
                    await this.refreshData();
                    return this.notify("Données rafraîchies.");
                }
                forcePicker = true;
            }
            try {
                if (forcePicker || !this.rootHandle) {
                    const handle = await window.showDirectoryPicker();
                    try {
                        await handle.getDirectoryHandle('App_Sources');
                        await handle.getDirectoryHandle('Campagnes');
                    } catch (e) {
                        return this.notify("ERREUR : Sélectionnez le dossier RACINE.", "error");
                    }
                    this.rootHandle = handle;
                    await this.storeHandle(this.rootHandle);
                    this.hasStoredFolder = true;
                }
                if (await this.rootHandle.requestPermission({mode: 'readwrite'}) === 'granted') {
                    this.campagnesHandle = await this.rootHandle.getDirectoryHandle('Campagnes');
                    await this.refreshData();
                    this.notify("Racine synchronisée !");
                }
            } catch (e) { this.notify("Action annulée.", "error"); }
        },

        async refreshData() {
            if (!this.campagnesHandle || !fsManager) return;
            const temp = [];
            for await (const entry of this.campagnesHandle.values()) {
                if (entry.kind !== 'directory') continue;
                let date = 0;
                let config = null;
                try {
                    const meta = await fsManager.readCampaignConfigWithMeta(entry);
                    date = meta.lastModified;
                    config = meta.config;
                } catch (e2) {}
                temp.push({ handle: entry, date: date, config: config });
            }
            temp.sort((a, b) => b.date - a.date);
            this.folders = temp.map(t => ({
                handle: t.handle,
                name: t.handle.name,
                status: (t.config && t.config.status === 'closed') ? 'closed' : 'active',
                campaignType: (t.config && t.config.campaign_type === 'review') ? 'review' : 'scoring',
                period_start: (t.config && t.config.period_start) ? t.config.period_start : '',
                period_end: (t.config && t.config.period_end) ? t.config.period_end : ''
            }));
        },

        // --- DASHBOARD ET STATS ---
        async loadCampaign(f) {
            const dirHandle = f && f.handle ? f.handle : f;
            const folderName = (f && f.name) ? f.name : (dirHandle && dirHandle.name);
            // Purge immédiate de l'état campagne précédente (évite contamination + race)
            this.workflow = { pending: [], ready: [], done: [] };
            this.campaignAgentIds = [];
            this.campaignAssignments = {};
            this.campaignConfig = null;
            this.isCampaignClosed = false;
            // Réinitialisation des filtres UI (évite liste vide alors que le compteur affiche un nombre)
            this.pilotageFilterSupervisorId = '';
            this.pilotageSearchAgent = '';
            this.selectedFolder = folderName;
            this.isLoadingCampaign = true;
            try {
                const path = window.location.pathname || '';
            if (folderName && (path.includes('pilotage') || path.includes('dashboard'))) try { localStorage.setItem('last_selected_campaign', folderName); } catch (e) {}
            await this.loadGridForCampaign(folderName);
            this.allEvaluations = [];
            this.allBilans = [];
            this.dashboardFilters = { site: '', offer: '' }; // Reset filtres
            
            if (typeof window.HQApp !== 'undefined' && window.HQApp.DashboardChartsView) {
                window.HQApp.DashboardChartsView.destroyCharts(['dashChart', 'sitesChart', 'offersChart']);
            }
            this.charts = {};
            
            let campaignAgentsCount = 0;
            let campaignTargetEvals = this.appConfig.target_evals || 3;

                if (!fsManager) return;
                try {
                    // 1. Config
                try {
                        const config = await fsManager.readCampaignConfig(dirHandle);
                    this.campaignConfig = config;
                    this.campaignType = (config && config.campaign_type === 'review') ? 'review' : 'scoring';
                    this.isCampaignClosed = (config && config.status === 'closed');
                    if (config.agent_ids && Array.isArray(config.agent_ids)) {
                        campaignAgentsCount = config.agent_ids.length;
                        this.campaignAgentIds = config.agent_ids;
                    } else {
                        this.campaignAgentIds = [];
                    }
                    if (config.target_evals) {
                        campaignTargetEvals = parseInt(config.target_evals);
                    }
                    this.campaignTargetEvals = campaignTargetEvals;
                    this.campaignAssignments = config.assignments || {};
                    this.campaignAssignToManager = config.assign_to_manager === true;
                    const storedSup = localStorage.getItem('pilotage_supervisor');
                    const assign = storedSup != null ? this.campaignAssignments[storedSup] : null;
                    if (storedSup != null && assign && (assign.agent_ids || []).length > 0) {
                        this.pilotageFilterSupervisorId = storedSup;
                    } else {
                        this.pilotageFilterSupervisorId = '';
                    }
                    this._setEnginesFromCampaignType(config.campaign_type || 'scoring');
                } catch (e) {
                    campaignAgentsCount = this.allAgents.length;
                    this.campaignAgentIds = [];
                    this.campaignAssignments = {};
                    this.campaignAssignToManager = false;
                    this.campaignConfig = null;
                    this.campaignType = 'scoring';
                    this.isCampaignClosed = false;
                }

                // 2. Charger les fichiers
                const entries = await fsManager.listCampaignEntries(dirHandle);
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    if (entry.name.startsWith('eval_') && entry.name.endsWith('.json')) {
                        try {
                            let data = await fsManager.readJsonFile(dirHandle, entry.name);
                            if (this.analyticsEngine) data = this.analyticsEngine.parseEvalFile(data);
                            const agentInfo = data.agentId ? this.getAgentById(data.agentId) : this.allAgents.find(a => this.getAgentDisplayName(a) === data.agent);
                            data._siteId = agentInfo ? agentInfo.siteId : null;
                            data._siteName = agentInfo ? this.getSiteName(agentInfo.siteId) : 'Inconnu';
                            const match = entry.name.match(/_(\d+)\.json$/);
                            data._timestamp = match ? parseInt(match[1]) : 0;
                            if (data.date_communication) {
                                const d = new Date(data.date_communication);
                                data._dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                            } else {
                                data._dateStr = data._timestamp ? new Date(data._timestamp).toLocaleDateString() : 'Date inconnue';
                            }
                            data._fileName = entry.name;
                            this.allEvaluations.push(data);
                        } catch (err) { /* ignorer */ }
                    } else if (entry.name.startsWith('bilan_') && entry.name.endsWith('.json')) {
                        try {
                            const data = await fsManager.readJsonFile(dirHandle, entry.name);
                            data._fileName = entry.name;
                            const match = entry.name.match(/_(\d+)\.json$/);
                            data._timestamp = match ? parseInt(match[1]) : 0;
                            this.allBilans.push(data);
                        } catch (err) { /* ignorer */ }
                    }
                }

                // 3. Filtres
                this.availableFilterSites = [...new Set(this.allEvaluations.map(e => e._siteName).filter(Boolean))].sort();
                this.availableFilterOffers = [...new Set(this.allEvaluations.map(e => e.offre).filter(Boolean))].sort();

                this.applyDashboardFilters(campaignAgentsCount, campaignTargetEvals);
                this.refreshWorkflow(campaignTargetEvals);
                this.campaignTargetEvals = campaignTargetEvals;
                if ((window.location.pathname || '').includes('dashboard')) this.updateDashboardUrl();
            } catch (e) { console.error(e); this.selectedFolder = null; this.notify("Erreur de chargement.", "error"); }
            } finally {
                this.isLoadingCampaign = false;
            }
        },

        refreshWorkflow(target) {
            this.workflow = { pending: [], ready: [], done: [] };
            const targetEvals = target ?? this.campaignTargetEvals ?? (this.appConfig.target_evals || 3);

            let agentsInScope = this.allAgents;
            if (this.campaignAgentIds && this.campaignAgentIds.length > 0) {
                agentsInScope = this.allAgents.filter(a => this.campaignAgentIds.includes(a.id));
            }
            if (this.pilotageFilterSupervisorId !== '' && this.pilotageFilterSupervisorId != null) {
                const supKey = String(this.pilotageFilterSupervisorId);
                if (this.campaignAssignments[supKey] && Array.isArray(this.campaignAssignments[supKey].agent_ids)) {
                    const assignedIds = this.campaignAssignments[supKey].agent_ids;
                    agentsInScope = agentsInScope.filter(a => assignedIds.includes(a.id));
                }
            }

            const helpers = { getSiteName: (id) => this.getSiteName(id), getAgentDisplayName: (a) => this.getAgentDisplayName(a) };
            agentsInScope.forEach(agent => {
                const agentDisplayName = this.getAgentDisplayName(agent);
                const agentEvals = this.allEvaluations.filter(e => (e.agentId === agent.id) || (e.agent === agentDisplayName));
                const agentBilans = this.allBilans.filter(b => (b.agentId === agent.id) || (b.agent === agentDisplayName));
                const statusObj = this.analyticsEngine
                    ? this.analyticsEngine.classifyAgentStatus(agent, agentEvals, agentBilans, targetEvals, helpers)
                    : { name: agentDisplayName, site: this.getSiteName(agent.siteId), count: agentEvals.length, avg: '0.0', hasDraft: false, isSent: false, sentDate: null };
                if (statusObj.isSent) this.workflow.done.push(statusObj);
                else if (statusObj.count >= targetEvals || statusObj.hasDraft) this.workflow.ready.push(statusObj);
                else this.workflow.pending.push(statusObj);
            });

            this.workflow.pending.sort((a,b) => a.name.localeCompare(b.name));
            this.workflow.ready.sort((a,b) => a.name.localeCompare(b.name));
            this.workflow.done.sort((a,b) => a.name.localeCompare(b.name));

            const scopeAgentIds = new Set(agentsInScope.map(a => a.id));
            const scopeDisplayNames = new Set(agentsInScope.map(a => this.getAgentDisplayName(a)));
            const scopeEvalsCount = this.allEvaluations.filter(e =>
                scopeAgentIds.has(e.agentId) || scopeDisplayNames.has(e.agent)
            ).length;
            const scopeTargetTotal = agentsInScope.length * targetEvals;
            this.pilotageProgressPercent = scopeTargetTotal > 0 ? Math.round((scopeEvalsCount / scopeTargetTotal) * 100) : 100;
        },

        pilotageFilterAgents(list) {
            if (!list || !Array.isArray(list)) return [];
            const q = (this.pilotageSearchAgent || '').trim().toLowerCase();
            if (!q) return list;
            return list.filter(a => {
                const name = (a.name || '').toLowerCase();
                const site = (a.site || '').toLowerCase();
                return name.includes(q) || site.includes(q);
            });
        },

        /** Remet le dernier bilan clôturé de l'agent en "À bilanter" (sent = false). */
        async remettreAgentABilanter(agentName) {
            if (!this.selectedFolder || !this.campagnesHandle) {
                this.notify("Aucune campagne sélectionnée.", "error");
                return;
            }
            const bilansAgent = this.allBilans
                .filter(b => (b.agent === agentName) || (b.agentId != null && this.getAgentDisplayName(this.getAgentById(b.agentId)) === agentName))
                .sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
            const lastBilan = bilansAgent[0];
            if (!lastBilan || !lastBilan.sent) {
                this.notify("Aucun bilan clôturé à remettre pour cet agent.", "error");
                return;
            }
            const fileName = lastBilan._fileName;
            if (!fileName) {
                this.notify("Fichier bilan introuvable.", "error");
                return;
            }
            if (!fsManager) return;
            try {
                const sanitizedFolder = repository.sanitizeDirectoryName(this.selectedFolder);
                const campaignHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedFolder);
                const data = await fsManager.readJsonFile(campaignHandle, fileName);
                data.sent = false;
                data.date = new Date().toISOString();
                await fsManager.writeJsonFile(campaignHandle, fileName, data);
                lastBilan.sent = false;
                lastBilan.date = data.date;
                this.refreshWorkflow(this.campaignTargetEvals);
                this.notify(agentName + " remis dans « À bilanter ».");
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors de la remise à bilanter.", "error");
            }
        },

        applyDashboardFilters(totalAgents = 0, targetPerAgent = 3) {
            this.filteredEvaluations = this.allEvaluations.filter(e => {
                const matchSite = this.dashboardFilters.site === '' || e._siteName === this.dashboardFilters.site;
                const matchOffer = this.dashboardFilters.offer === '' || e.offre === this.dashboardFilters.offer;
                return matchSite && matchOffer;
            });
            var agents = totalAgents || (this.campaignAgentIds && this.campaignAgentIds.length > 0 ? this.campaignAgentIds.length : 0);
            var target = totalAgents > 0 ? (targetPerAgent ?? 3) : (this.campaignTargetEvals ?? this.appConfig.target_evals ?? 3);
            this.calculateStats(agents, target);
        },

        calculateStats(totalAgents = 0, targetPerAgent = 3) {
            if (this.analyticsEngine) {
                const options = {
                    totalAgents: totalAgents || this.allAgents.length,
                    targetPerAgent: targetPerAgent,
                    isFiltered: this.dashboardFilters.site !== '' || this.dashboardFilters.offer !== '',
                    grid: this.grid,
                    campaignAssignments: this.campaignAssignments || {},
                    supervisors: this.supervisors || [],
                    allAgents: this.allAgents || [],
                    getAgentById: (id) => this.getAgentById(id),
                    getAgentDisplayName: (a) => this.getAgentDisplayName(a),
                    duration_thresholds: this.appConfig.duration_thresholds || { short: { min: 3, sec: 0 }, medium: { min: 6, sec: 0 } }
                };
                this.stats = this.analyticsEngine.computeStats(this.filteredEvaluations, options);
            } else {
                this.resetStats(totalAgents, targetPerAgent);
            }
            this.updateDashboardCharts();
        },

        resetStats(totalAgents, targetPerAgent) {
            this.stats = this.analyticsEngine
                ? this.analyticsEngine.computeStats([], { totalAgents: totalAgents || this.allAgents.length, targetPerAgent: targetPerAgent || 3, allAgents: this.allAgents || [] })
                : { moyenne: 0, rubrics: {}, evaluatedAgents: 0, totalAgents: totalAgents || this.allAgents.length, remaining: (totalAgents || this.allAgents.length) * (targetPerAgent || 3), completed: 0, totalEvaluationsTarget: (totalAgents || this.allAgents.length) * (targetPerAgent || 3), progressPercent: 0, supervisorProgress: [], avgDuration: '00:00', durationDistribution: { short: 0, medium: 0, long: 0 }, siteStats: [], offerStats: [], topAgents: [], flopAgents: [], agentList: [] };
        },

        updateDashboardCharts() {
            var self = this;
            if (typeof this.$nextTick === 'function') {
                this.$nextTick(function () {
                    if (typeof window.HQApp !== 'undefined' && window.HQApp.DashboardChartsView) {
                        window.HQApp.DashboardChartsView.renderCharts(self.stats, { ids: ['dashChart', 'sitesChart', 'offersChart'] });
                    }
                });
            } else if (typeof window.HQApp !== 'undefined' && window.HQApp.DashboardChartsView) {
                window.HQApp.DashboardChartsView.renderCharts(this.stats, { ids: ['dashChart', 'sitesChart', 'offersChart'] });
            }
        },

        async selectGridToEdit(grilleId) {
            if (!this.rootHandle || this.editingGridContext && this.editingGridContext.type === 'campaign') return;
            this.currentGridId = grilleId;
            try {
                const gridData = await repository.getGridById(this.rootHandle, grilleId);
                var normalized = gridData && (gridData.sections || gridData.categories) ? gridData : { title: 'default', sections: [] };
                this.grid = normalized.sections || [];
                this.gridTitle = normalized.title || 'default';
                var secs = this.grid || [];
                secs.forEach(function (sec) { sec.collapsed = true; });
                this.updateNote();
                this.lastPersistedGridJson = JSON.stringify(secs.map(function (sec) { var collapsed = sec.collapsed; var rest = Object.assign({}, sec); delete rest.collapsed; return rest; }));
            } catch (e) { this.notify("Erreur chargement grille", "error"); }
        },
        async createNewGrid() {
            const title = prompt("Titre de la nouvelle grille :", "Nouvelle grille");
            if (!title || !this.rootHandle) return;
            try {
                const id = await repository.generateGrilleIdFromTitle(this.rootHandle, title);
                await repository.saveGrid(this.rootHandle, id, { title: title.trim(), sections: [] });
                this.grillesList = await repository.getGrillesList(this.rootHandle);
                await this.selectGridToEdit(id);
                this.notify("Grille créée.");
            } catch (e) { this.notify(e.message || "Erreur", "error"); }
        },
        async duplicateGrid() {
            const title = prompt("Titre de la copie :", (this.grillesList.find(g => g.id === this.currentGridId) || {}).title + " (copie)");
            if (!title || !this.rootHandle) return;
            try {
                const id = await repository.generateGrilleIdFromTitle(this.rootHandle, title);
                var secs = this.grid || [];
                const cleanGrid = secs.map(sec => { const { collapsed, ...rest } = sec; return rest; });
                await repository.saveGrid(this.rootHandle, id, { title: title.trim(), sections: cleanGrid });
                this.grillesList = await repository.getGrillesList(this.rootHandle);
                await this.selectGridToEdit(id);
                this.notify("Grille dupliquée.");
            } catch (e) { this.notify(e.message || "Erreur", "error"); }
        },

        // --- ADMINISTRATION ---
        addCategory() {
            this.grid = this.grid || [];
            var arr = [];
            this.grid.push({ id: 'section_' + Date.now(), label: 'Nouvelle Rubrique', fields: arr, items: arr, collapsed: false });
        },
        deleteCategory(index) {
            var secs = this.grid || [];
            if (confirm("Supprimer la rubrique ?")) secs.splice(index, 1);
        },
        addItem(catIndex) {
            var secs = this.grid || [];
            var fields = (secs[catIndex] && secs[catIndex].fields) ? secs[catIndex].fields : (secs[catIndex].items = secs[catIndex].items || []);
            if (!secs[catIndex].fields) secs[catIndex].fields = fields;
            if (!secs[catIndex].items) secs[catIndex].items = fields;
            fields.push({ id: 'item_' + Date.now(), label: 'Nouveau critère', type: 'scoring', max: 2, step: 0.5, oblig: true, hint: 'Description...' });
        },
        deleteItem(catIdx, itemIdx) {
            var secs = this.grid || [];
            var fields = secs[catIdx] && secs[catIdx].fields;
            if (fields) fields.splice(itemIdx, 1);
        },

        async saveAgentsList() {
            try {
                if (!fsManager) { this.notify("FileSystemManager non chargé.", "error"); return; }
                await fsManager.writeAgents(this.rootHandle, this.agents);
                this.notify("Agents mis à jour !");
            } catch (e) { this.notify("Erreur d'écriture.", "error"); }
        },

        addAgent(nom, prenom, matricule, email, siteId, managerId) { 
            if(nom && prenom && siteId) { 
                const newId = this.agents.length > 0 ? Math.max(...this.agents.map(a => a.id)) + 1 : 1;
                this.agents.push({
                    id: newId,
                    nom: nom.trim(),
                    ['pr\u00e9nom']: prenom.trim(),
                    matricule: matricule ? String(matricule).trim() : '',
                    email: email ? String(email).trim() : '',
                    siteId: parseInt(siteId),
                    managerId: managerId ? parseInt(managerId) : null
                }); 
                this.saveAgentsList(); 
            } 
        },
        updateAgent(idOrIndex, nom, prenom, matricule, email, siteId, managerId) {
            if (nom && prenom && siteId) {
                const i = this.agents.findIndex(a => a.id === parseInt(idOrIndex, 10));
                if (i === -1) return;
                this.agents[i].nom = nom.trim();
                this.agents[i]['pr\u00e9nom'] = prenom.trim();
                this.agents[i].matricule = matricule ? String(matricule).trim() : '';
                this.agents[i].email = email ? String(email).trim() : '';
                this.agents[i].siteId = parseInt(siteId);
                this.agents[i].managerId = managerId ? parseInt(managerId) : null;
                this.saveAgentsList();
            }
        },
        deleteAgent(idOrIndex) {
            if (!confirm("Supprimer l'agent ?")) return;
            const i = this.agents.findIndex(a => a.id === parseInt(idOrIndex, 10));
            if (i !== -1) { this.agents.splice(i, 1); this.saveAgentsList(); }
        },

        async createCampaignFolder() {
            if (!this.newCampaignName || !this.campagnesHandle) return this.notify("Données manquantes.", "error");
            try {
                const name = repository.sanitizeDirectoryName(this.newCampaignName.trim());
                const newDir = await this.campagnesHandle.getDirectoryHandle(name, { create: true });
                await this.saveCampaignConfig(newDir);
                const count = this.selectedAgents.length;
                this.resetCampaignForm();
                await this.refreshData(); 
                this.notify(`Dossier '${name}' créé (${count} agents).`);
            } catch (e) { console.error(e); this.notify("Erreur de création.", "error"); }
        },

        async saveCampaignConfig(dirHandle, includeAssignments = false) {
            if (!fsManager || !this.selectedAgents) return;
            let existingConfig = null;
            try {
                existingConfig = await fsManager.readCampaignConfig(dirHandle);
            } catch (e) { /* pas de fichier ou erreur de lecture */ }
            if (existingConfig && existingConfig.status === 'closed') {
                this.notify("Cette campagne est clôturée, aucune modification n'est autorisée.", "error");
                return;
            }

            let grilleIdValid = 'default';
            try {
                repository.validateGrilleId(this.selectedGrilleId || 'default');
                grilleIdValid = this.selectedGrilleId;
            } catch (e) { /* invalide, garder default */ }

            const configData = {
                agent_ids: this.selectedAgents.map(id => Number(id)),
                target_evals: parseInt(this.targetEvaluations) || 3,
                date: new Date().toISOString(),
                grille_id: grilleIdValid,
                campaign_type: this.campaignType || 'scoring',
                assign_to_manager: !!this.assignToManager,
                status: existingConfig && existingConfig.status ? existingConfig.status : 'active',
                period_start: this.period_start || '',
                period_end: this.period_end || ''
            };
            if (this.campaignType === 'review') {
                configData.stats_config = {
                    channels: {
                        phone: !!(this.statsConfig && this.statsConfig.channels && this.statsConfig.channels.phone),
                        email: !!(this.statsConfig && this.statsConfig.channels && this.statsConfig.channels.email),
                        watt: !!(this.statsConfig && this.statsConfig.channels && this.statsConfig.channels.watt)
                    },
                    eval_start: (this.statsConfig && this.statsConfig.eval_start) ? this.statsConfig.eval_start : '',
                    eval_end: (this.statsConfig && this.statsConfig.eval_end) ? this.statsConfig.eval_end : '',
                    compare_start: (this.statsConfig && this.statsConfig.compare_start) ? this.statsConfig.compare_start : '',
                    compare_end: (this.statsConfig && this.statsConfig.compare_end) ? this.statsConfig.compare_end : ''
                };
            }

            if (includeAssignments) {
                if (this.campaignAssignments) configData.assignments = this.campaignAssignments;
                if (this.selectedSupervisors && this.selectedSupervisors.length > 0) configData.participating_supervisors = this.selectedSupervisors;
            } else if (existingConfig) {
                if (existingConfig.assignments) configData.assignments = existingConfig.assignments;
                if (existingConfig.participating_supervisors) configData.participating_supervisors = existingConfig.participating_supervisors;
                if (existingConfig.assign_to_manager !== undefined) configData.assign_to_manager = existingConfig.assign_to_manager;
            }

            await fsManager.writeCampaignConfig(dirHandle, configData);

            if (this.rootHandle) {
                try {
                    const gridPayload = await repository.getGridById(this.rootHandle, grilleIdValid);
                    await repository.saveSnapshotForCampaign(this.rootHandle, dirHandle, gridPayload);
                } catch (err) {
                    if (err.userMessage) this.notify(err.userMessage, 'error');
                    else console.error(err);
                }
            }
        },

        async closeCampaign(campaignName) {
            if (this._ensureCampaignNotClosed()) return;
            if (!campaignName || !this.campagnesHandle || !fsManager) return this.notify("Données manquantes.", "error");
            try {
                const sanitizedName = repository.sanitizeDirectoryName(campaignName);
                const dirHandle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                let config = null;
                try {
                    config = await fsManager.readCampaignConfig(dirHandle);
                } catch (e) { config = {}; }
                config = config || {};
                if (config.status === 'closed') {
                    this.notify("Cette campagne est déjà clôturée.", "info");
                    return;
                }
                config.status = 'closed';
                await fsManager.writeCampaignConfig(dirHandle, config);
                if (this.selectedFolder === campaignName || this.newCampaignName === campaignName) {
                    this.campaignConfig = config;
                    this.isCampaignClosed = true;
                }
                await this.refreshData();
                this.notify("Campagne clôturée.");
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors de la clôture.", "error");
            }
        },

        isStep1Valid() {
            const name = (this.newCampaignName || '').trim();
            if (!name) return false;
            if (!this.selectedGrilleId || String(this.selectedGrilleId).trim() === '') return false;
            const target = Number(this.targetEvaluations);
            if (!Number.isFinite(target) || target < 1) return false;
            if (!this.period_start || !this.period_end) return false;
            const start = new Date(this.period_start);
            const end = new Date(this.period_end);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
            if (start.getTime() > end.getTime()) return false;
            if (this.campaignType === 'review') {
                const channels = (this.statsConfig && this.statsConfig.channels) ? this.statsConfig.channels : {};
                const hasAtLeastOneChannel = !!(channels.phone || channels.email || channels.watt);
                if (!hasAtLeastOneChannel) return false;

                if (!this.statsConfig.eval_start || !this.statsConfig.eval_end) return false;
                const statsEvalStart = new Date(this.statsConfig.eval_start);
                const statsEvalEnd = new Date(this.statsConfig.eval_end);
                if (isNaN(statsEvalStart.getTime()) || isNaN(statsEvalEnd.getTime())) return false;
                if (statsEvalStart.getTime() > statsEvalEnd.getTime()) return false;

                if (!this.statsConfig.compare_start || !this.statsConfig.compare_end) return false;
                const statsCompareStart = new Date(this.statsConfig.compare_start);
                const statsCompareEnd = new Date(this.statsConfig.compare_end);
                if (isNaN(statsCompareStart.getTime()) || isNaN(statsCompareEnd.getTime())) return false;
                if (statsCompareStart.getTime() > statsCompareEnd.getTime()) return false;
            }
            return true;
        },

        isStep2Valid() {
            return Array.isArray(this.selectedAgents) && this.selectedAgents.length > 0;
        },

        get filteredPoolAgents() {
            let list = this.poolAgents || [];
            if (this.poolFilterSite !== '' && this.poolFilterSite != null) {
                const siteId = parseInt(this.poolFilterSite);
                list = list.filter(a => parseInt(a.siteId) === siteId);
            }
            if (this.poolFilterSupervisor !== '' && this.poolFilterSupervisor != null) {
                const mgrId = parseInt(this.poolFilterSupervisor);
                list = list.filter(a => (a.managerId != null && parseInt(a.managerId) === mgrId));
            }
            if (this.poolFilterSearch && this.poolFilterSearch.trim() !== '') {
                const q = this.poolFilterSearch.trim().toLowerCase();
                list = list.filter(a => this.getAgentDisplayName(a).toLowerCase().includes(q));
            }
            return list;
        },

        get totalWeight() {
            if (this.assignToManager) return this.selectedSupervisors.length * 100;
            return this.selectedSupervisors.reduce((sum, id) => {
                const sup = this.supervisors.find(s => parseInt(s.id) === parseInt(id));
                const weight = this.supervisorWeights[id] ?? sup?.default_weight ?? 100;
                return sum + weight;
            }, 0);
        },

        goToCampaignStep(step) {
            const parsed = Number(step);
            if (!Number.isFinite(parsed)) return;
            this.campaignWizardStep = Math.max(1, Math.min(3, Math.trunc(parsed)));
        },

        onCampaignTypeChanged() {
            // Poka-Yoke : un entretien qualitatif impose exactement 1 évaluation par agent.
            const prevType = this.lastCampaignTypeForPokaYoke;
            const isReview = this.campaignType === 'review';

            this.assignToManager = isReview;
            if (isReview) {
                this.targetEvaluations = 1;
                if (!this.statsEvaluatedPeriodDirty) {
                    this.statsConfig.eval_start = this.period_start || '';
                    this.statsConfig.eval_end = this.period_end || '';
                }
            } else if (prevType === 'review') {
                // Quand l'utilisateur repasse en scoring, on restaure une valeur par défaut.
                this.targetEvaluations = 3;
            }
            this.lastCampaignTypeForPokaYoke = this.campaignType;
        },

        async nextCampaignStep() {
            if (this.campaignWizardStep === 1 && !this.isStep1Valid()) {
                this.notify("Renseignez les champs requis de l'étape 1.", "error");
                return;
            }
            if (this.campaignWizardStep === 2 && !this.isStep2Valid()) {
                this.notify("Sélectionnez au moins un agent.", "error");
                return;
            }
            if (this.campaignWizardStep === 2) {
                await this.proceedToAssignments();
                return;
            }
            this.goToCampaignStep(this.campaignWizardStep + 1);
        },

        prevCampaignStep() {
            this.goToCampaignStep(this.campaignWizardStep - 1);
        },

        startNewCampaign() {
            this.resetCampaignForm();
            this.adminShowCreateForm = true;
            this.campaignWizardStep = 1;
            this.selectedCampaignForAdmin = 'new';
        },

        async editCampaign(folderName) {
            if (!fsManager) return;
            try {
                const sanitizedName = repository.sanitizeDirectoryName(folderName);
                const handle = await this.campagnesHandle.getDirectoryHandle(sanitizedName);
                this.currentCampaignHandle = handle;
                this.newCampaignName = folderName;
                this.isEditingCampaign = true;
                this.adminShowCreateForm = false;
                this.campaignWizardStep = 1;
                this.selectedCampaignForAdmin = folderName;
                this.selectedAgents = [];
                try {
                    const content = await fsManager.readCampaignConfig(handle);
                    this.campaignConfig = content;
                    this.isCampaignClosed = (content && content.status === 'closed');
                    if (content.agent_ids) this.selectedAgents = content.agent_ids;
                    this.targetEvaluations = content.target_evals || 3;
                    this.campaignType = (content.campaign_type === 'review' ? 'review' : 'scoring');
                    this.assignToManager = content.assign_to_manager === true;
                    if (content.grille_id && typeof content.grille_id === 'string') {
                        try {
                            repository.validateGrilleId(content.grille_id);
                            this.selectedGrilleId = content.grille_id;
                        } catch (e) { this.selectedGrilleId = 'default'; }
                    } else {
                        this.selectedGrilleId = 'default';
                    }
                    this.period_start = content.period_start || '';
                    this.period_end = content.period_end || '';
                    const rawStatsConfig = (content && content.stats_config && typeof content.stats_config === 'object') ? content.stats_config : {};
                    const rawChannels = (rawStatsConfig.channels && typeof rawStatsConfig.channels === 'object') ? rawStatsConfig.channels : {};
                    this.statsConfig = {
                        channels: {
                            phone: (rawChannels.phone !== undefined) ? !!rawChannels.phone : true,
                            email: (rawChannels.email !== undefined) ? !!rawChannels.email : true,
                            watt: (rawChannels.watt !== undefined) ? !!rawChannels.watt : true
                        },
                        eval_start: rawStatsConfig.eval_start || content.period_start || '',
                        eval_end: rawStatsConfig.eval_end || content.period_end || '',
                        compare_start: rawStatsConfig.compare_start || '',
                        compare_end: rawStatsConfig.compare_end || ''
                    };
                    this.statsEvaluatedPeriodDirty = false;
                } catch (e) {
                    this.targetEvaluations = 3;
                    this.selectedGrilleId = 'default';
                    this.campaignType = 'scoring';
                    this.statsConfig = {
                        channels: { phone: true, email: true, watt: true },
                        eval_start: '',
                        eval_end: '',
                        compare_start: '',
                        compare_end: ''
                    };
                    this.statsEvaluatedPeriodDirty = false;
                }

                // Poka-Yoke : forcer la valeur cible si entretien qualitatif.
                this.lastCampaignTypeForPokaYoke = this.campaignType;
                if (this.campaignType === 'review') {
                    this.assignToManager = true;
                    this.targetEvaluations = 1;
                }
                if (typeof window.HQApp !== 'undefined' && window.HQApp.ScrollView) window.HQApp.ScrollView.scrollToTop();
            } catch (e) { console.error(e); this.notify("Erreur lors du chargement de la campagne.", "error"); }
        },

        async updateCampaign() {
             if (!this.currentCampaignHandle) return;
             try {
                 await this.saveCampaignConfig(this.currentCampaignHandle);
                 this.notify(`Campagne '${this.newCampaignName}' mise à jour.`);
                 this.resetCampaignForm();
             } catch (e) { console.error(e); this.notify("Erreur de mise à jour.", "error"); }
        },

        async saveCampaignFromStep1() {
            if (!this.newCampaignName || !String(this.newCampaignName).trim()) {
                return this.notify("Nom de campagne requis.", "error");
            }
            if (!this.campagnesHandle || !fsManager) {
                return this.notify("Accès au dossier campagnes requis.", "error");
            }
            const name = repository.sanitizeDirectoryName(this.newCampaignName.trim());
            try {
                const dirHandle = this.isEditingCampaign && this.currentCampaignHandle
                    ? this.currentCampaignHandle
                    : await this.campagnesHandle.getDirectoryHandle(name, { create: true });
                await this.saveCampaignConfig(dirHandle, false);
                if (!this.isEditingCampaign) {
                    this.currentCampaignHandle = dirHandle;
                    this.isEditingCampaign = true;
                    this.selectedCampaignForAdmin = name;
                    this.adminShowCreateForm = false;
                    await this.refreshData();
                }
                this.notify(`Campagne '${name}' enregistrée.`);
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors de l'enregistrement.", "error");
            }
        },

        updateSupervisorSelection() {
            this.selectedSupervisors = (this.selectedSupervisors || []).map(id => Number(id));
            this.selectedSupervisors.forEach(id => {
                if (!this.assignments[id]) this.assignments[id] = [];
                if (!this.forcedAssignments[id]) this.forcedAssignments[id] = [];
            });
        },

        isForcedAssigned(supId, agentId) {
            const sid = Number(supId);
            const aid = Number(agentId);
            const forced = this.forcedAssignments && this.forcedAssignments[sid];
            if (!Array.isArray(forced)) return false;
            return forced.map(Number).includes(aid);
        },

        assignAgentToSupervisor(agentId, supId) {
            if (!supId || !this.selectedSupervisors.includes(supId)) return;
            const idx = this.poolAgents.findIndex(a => a.id === agentId);
            if (idx === -1) return;
            this.poolAgents.splice(idx, 1);
            if (!this.assignments[supId]) this.assignments[supId] = [];
            if (!this.assignments[supId].includes(agentId)) this.assignments[supId].push(agentId);
            if (!this.forcedAssignments[supId]) this.forcedAssignments[supId] = [];
            if (!this.forcedAssignments[supId].includes(agentId)) this.forcedAssignments[supId].push(agentId);
        },

        moveAgentToPool(agentId, supId) {
            const id = parseInt(agentId);
            const sup = parseInt(supId);
            if (!this.assignments[sup]) return;
            this.assignments[sup] = this.assignments[sup].filter(a => a !== id);
            if (this.forcedAssignments[sup]) this.forcedAssignments[sup] = this.forcedAssignments[sup].filter(a => a !== id);
            const agent = this.getAgentById(id);
            if (agent && !this.poolAgents.some(a => a.id === id)) this.poolAgents.push(agent);
        },

        reassignAgent(agentId, fromSupId, toSupIdOrPool) {
            const id = parseInt(agentId);
            const from = parseInt(fromSupId);
            if (!toSupIdOrPool || toSupIdOrPool === 'pool') {
                this.moveAgentToPool(id, from);
                return;
            }
            const to = parseInt(toSupIdOrPool);
            if (to === from) return;
            if (!this.assignments[from]) return;
            this.assignments[from] = this.assignments[from].filter(a => a !== id);
            if (this.forcedAssignments[from]) this.forcedAssignments[from] = this.forcedAssignments[from].filter(a => a !== id);
            if (!this.assignments[to]) this.assignments[to] = [];
            if (!this.assignments[to].includes(id)) this.assignments[to].push(id);
            if (!this.forcedAssignments[to]) this.forcedAssignments[to] = [];
            if (!this.forcedAssignments[to].includes(id)) this.forcedAssignments[to].push(id);
        },

        updatePoolFromAssignments() {
            const assignedIds = Object.values(this.assignments || {}).flat().map(id => Number(id));
            this.poolAgents = this.allAgents.filter(a => this.campaignAgents.includes(a.id) && !assignedIds.includes(a.id));
        },

        getQuota(supId) {
            if (this.assignToManager) return (this.assignments[supId] || []).length;
            if (this.campaignAgents.length === 0) return 0;
            const sup = this.supervisors.find(s => parseInt(s.id) === parseInt(supId));
            const weight = this.supervisorWeights[supId] ?? sup?.default_weight ?? 100;
            if (this.totalWeight === 0) return 0;
            return Math.round((weight / this.totalWeight) * this.campaignAgents.length);
        },

        calculateAutoAssignments() {
            if (this.assignToManager) return;
            if (this.selectedSupervisors.length === 0) {
                return this.notify("Sélectionnez au moins un superviseur", "error");
            }
            const result = this.calculateAssignments(
                this.selectedSupervisors.map(id => {
                    const sup = this.supervisors.find(s => parseInt(s.id) === parseInt(id));
                    return {
                        id: parseInt(id),
                        nom: sup ? sup.nom : 'Inconnu',
                        weight: this.supervisorWeights[id] ?? sup?.default_weight ?? 100
                    };
                }),
                this.poolAgents,
                this.forcedAssignments,
                this.assignments
            );

            Object.entries(result.assignments).forEach(([supId, agentIds]) => {
                const id = parseInt(supId);
                if (!this.assignments[id]) this.assignments[id] = [];
                agentIds.forEach(aid => {
                    if (!this.assignments[id].includes(aid)) this.assignments[id].push(aid);
                });
            });
            this.poolAgents = [];
            if (result.conflicts.length > 0) this.notify(`${result.conflicts.length} conflit(s) détecté(s)`, "error");
            else this.notify("Répartition effectuée avec succès !");
        },

        resetAssignments() {
            if (!confirm("Réinitialiser toutes les assignations ?")) return;
            this.assignments = {};
            this.forcedAssignments = {};
            this.poolAgents = this.allAgents.filter(a => this.campaignAgents.includes(a.id));
            this.notify("Assignations réinitialisées");
        },

        async _persistAssignments() {
            const sanitizedName = repository.sanitizeDirectoryName(this.newCampaignName.trim());
            const dirHandle = this.currentCampaignHandle
                ? this.currentCampaignHandle
                : await this.campagnesHandle.getDirectoryHandle(sanitizedName, { create: true });

            const assignmentsData = {};
            this.selectedSupervisors.forEach(supId => {
                const id = parseInt(supId);
                const sup = this.supervisors.find(s => parseInt(s.id) === id);
                assignmentsData[supId] = {
                    weight: this.supervisorWeights[id] ?? sup?.default_weight ?? 100,
                    agent_ids: this.assignments[id] || [],
                    forced_ids: this.forcedAssignments[id] || []
                };
            });

            this.campaignAssignments = assignmentsData;
            await this.saveCampaignConfig(dirHandle, true);
        },

        async saveAndFinalizeCampaign() {
            if (this.campaignAgents.length === 0) {
                return this.notify("Aucun agent dans la campagne", "error");
            }
            if (this.poolAgents.length > 0 && !confirm(`${this.poolAgents.length} agent(s) non assigné(s). Enregistrer quand même ?`)) {
                return;
            }
            if (!this.campagnesHandle || !fsManager) {
                return this.notify("Accès au dossier campagnes requis.", "error");
            }
            try {
                await this._persistAssignments();
                await this.refreshData();
                this.notify("Campagne enregistrée.");
                this.resetCampaignForm();
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors de l'enregistrement final.", "error");
            }
        },

        async proceedToAssignments() {
            if (!this.newCampaignName || this.selectedAgents.length === 0) {
                return this.notify("Nom de campagne et agents requis.", "error");
            }
            if (!this.campagnesHandle) {
                return this.notify("Accès au dossier campagnes requis.", "error");
            }
            const campaignName = repository.sanitizeDirectoryName(this.newCampaignName.trim());
            try {
                const dirHandle = this.isEditingCampaign && this.currentCampaignHandle
                    ? this.currentCampaignHandle
                    : await this.campagnesHandle.getDirectoryHandle(campaignName, { create: true });
                await this.saveCampaignConfig(dirHandle, false);
                if (!this.currentCampaignHandle) this.currentCampaignHandle = dirHandle;

                this.campaignAgents = this.selectedAgents.map(id => Number(id));
                this.assignments = {};
                this.forcedAssignments = {};
                this.poolAgents = this.allAgents.filter(a => this.campaignAgents.includes(a.id));
                this.poolFilterSite = '';
                this.poolFilterSearch = '';
                this.poolFilterSupervisor = '';
                this.selectedSupervisors = [];
                if (!this.supervisorWeights) this.supervisorWeights = {};

                let config = null;
                try {
                    config = await fsManager.readCampaignConfig(dirHandle);
                } catch (e) { config = null; }

                if (config && config.assignments && typeof config.assignments === 'object') {
                    Object.entries(config.assignments).forEach(([supId, block]) => {
                        const id = parseInt(supId);
                        const agentIds = block && block.agent_ids ? block.agent_ids : [];
                        this.assignments[id] = agentIds.map(x => parseInt(x));
                        this.forcedAssignments[id] = Array.isArray(block?.forced_ids) ? block.forced_ids.map(x => parseInt(x)) : [];
                        if (block && typeof block.weight === 'number') this.supervisorWeights[id] = block.weight;
                    });
                }

                if (config && Array.isArray(config.participating_supervisors) && config.participating_supervisors.length > 0) {
                    this.selectedSupervisors = config.participating_supervisors.map(id => parseInt(id));
                } else if (this.assignToManager) {
                    const managerIds = [...new Set(this.poolAgents.map(a => a.managerId).filter(id => id != null && id !== ''))];
                    this.selectedSupervisors = managerIds.map(id => parseInt(id));
                } else if (Object.keys(this.assignments).length > 0) {
                    this.selectedSupervisors = Object.keys(this.assignments).map(k => parseInt(k));
                }

                if (this.assignToManager) {
                    this.selectedSupervisors.forEach(id => {
                        if (!this.assignments[id]) this.assignments[id] = [];
                        if (!this.forcedAssignments[id]) this.forcedAssignments[id] = [];
                    });
                    this.poolAgents.forEach(agent => {
                        const mid = agent.managerId != null ? parseInt(agent.managerId) : null;
                        if (mid != null && this.assignments[mid] && !this.assignments[mid].includes(agent.id)) {
                            this.assignments[mid].push(agent.id);
                        }
                    });
                }

                this.updateSupervisorSelection();
                this.updatePoolFromAssignments();
                this.campaignWizardStep = 3;
            } catch (e) {
                console.error(e);
                this.notify("Erreur lors du chargement de la répartition.", "error");
            }
        },

        cancelEdit() { this.resetCampaignForm(); },
        resetCampaignForm() {
            this.newCampaignName = '';
            this.targetEvaluations = 3;
            this.selectedAgents = [];
            this.campaignAgents = [];
            this.poolAgents = [];
            this.assignments = {};
            this.forcedAssignments = {};
            this.poolFilterSite = '';
            this.poolFilterSearch = '';
            this.poolFilterSupervisor = '';
            this.selectedSupervisors = [];
            this.supervisorWeights = {};
            this.campaignAssignments = {};
            this.selectedGrilleId = 'default';
            this.campaignType = 'scoring';
            this.lastCampaignTypeForPokaYoke = 'scoring';
            this.period_start = '';
            this.period_end = '';
            this.statsConfig = {
                channels: { phone: true, email: true, watt: true },
                eval_start: '',
                eval_end: '',
                compare_start: '',
                compare_end: ''
            };
            this.statsEvaluatedPeriodDirty = false;
            this.assignToManager = false;
            this.isEditingCampaign = false;
            this.currentCampaignHandle = null;
            this.adminShowCreateForm = false;
            this.campaignWizardStep = 1;
            this.selectedCampaignForAdmin = null;
        },

        // --- EXPORT PDF BILAN (délégation au module pdfBilan.js) ---
        generateBilanPDF() {
            if (typeof window.BilanPdf === 'undefined' || typeof window.BilanPdf.generate !== 'function') {
                this.notify("Module PDF non chargé. Vérifiez que pdfBilan.js est inclus.", "error");
                return;
            }
            const agent = this.agentContext.agentId != null ? this.getAgentById(this.agentContext.agentId) : null;
            let supervisorName = '';
            if (agent && this.campaignAssignments) {
                const evaluatorId = Object.keys(this.campaignAssignments).find(k => (this.campaignAssignments[k].agent_ids || []).includes(agent.id));
                supervisorName = evaluatorId != null ? this.getEvaluatorName(evaluatorId, this.campaignAssignToManager) : '';
                if (!supervisorName && agent.managerId != null) supervisorName = this.getManagerName(agent.managerId);
            }
            const options = {
                agentName: this.bilanForm.agentName || '',
                campaignName: this.agentContext.campaignName || 'Campagne en cours',
                supervisorName: supervisorName,
                comment: this.bilanForm.comment || '',
                hideNotesInPdf: !!this.bilanForm.hideNotesInPdf,
                campaignType: (this.campaignConfig && this.campaignConfig.campaign_type === 'review' ? 'review' : 'scoring'),
                evals: this.bilanForm.evals || [],
                grid: this.grid || []
            };
            window.BilanPdf.generate(options);
        },

        prepareEmail() {
            if (!this.bilanForm.email) return;
            var campaignType = (this.campaignConfig && this.campaignConfig.campaign_type === 'review') ? 'review' : 'scoring';
            var templates = this.appConfig.emailTemplates && this.appConfig.emailTemplates[campaignType];
            var subjectStr, bodyStr;
            if (templates && templates.subject != null && templates.body != null) {
                subjectStr = String(templates.subject);
                bodyStr = String(templates.body);
                var agentName = (this.bilanForm.agentName != null) ? String(this.bilanForm.agentName) : '';
                var campaignName = (this.agentContext.campaignName != null) ? String(this.agentContext.campaignName) : '';
                var dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                var synthese = (this.bilanForm.comment != null) ? String(this.bilanForm.comment) : '';
                var noteStr = '';
                if (campaignType === 'scoring' && this.evaluationEngine && typeof this.evaluationEngine.computeAgentAverage === 'function' && this.bilanForm.evals && this.bilanForm.evals.length > 0) {
                    var evalsPayloads = this.bilanForm.evals.map(function (e) { return e.fileContent || e; });
                    noteStr = this.evaluationEngine.computeAgentAverage(evalsPayloads);
                } else if (campaignType === 'scoring') {
                    noteStr = '—';
                }
                subjectStr = subjectStr.replace(/\{\{agent\}\}/g, agentName).replace(/\{\{campagne\}\}/g, campaignName).replace(/\{\{date\}\}/g, dateStr).replace(/\{\{note\}\}/g, noteStr).replace(/\{\{synthese\}\}/g, synthese);
                bodyStr = bodyStr.replace(/\{\{agent\}\}/g, agentName).replace(/\{\{campagne\}\}/g, campaignName).replace(/\{\{date\}\}/g, dateStr).replace(/\{\{note\}\}/g, noteStr).replace(/\{\{synthese\}\}/g, synthese);
            } else {
                subjectStr = 'Bilan Qualité - ' + (this.bilanForm.agentName || '');
                bodyStr = 'Bonjour,\n\nVeuillez trouver ci-joint ton bilan qualité.\n\nSynthèse :\n' + (this.bilanForm.comment || '') + '\n\nCordialement.';
            }
            var subject = encodeURIComponent(subjectStr);
            var body = encodeURIComponent(bodyStr);
            window.location.href = 'mailto:' + this.bilanForm.email + '?subject=' + subject + '&body=' + body;
        },

        sendBilanEmail() {
            if (!this.bilanForm.email?.trim()) {
                this.notify("Veuillez renseigner l'adresse email du destinataire avant d'envoyer le bilan.", "error");
                return;
            }
            this.prepareEmail();
        },

        async closeBilan() {
            if (!this.bilanForm.comment?.trim()) {
                this.notify("Merci de rédiger une synthèse.", "error");
                return;
            }
            await this.saveContextBilan(true);
            this.notify("Bilan clôturé.");
            const campaign = this.agentContext.campaignName || '';
            window.location.href = 'pilotage.html' + (campaign ? '?campagne=' + encodeURIComponent(campaign) : '');
        },

        async getStoredHandle() { return new Promise((r)=>{const req=indexedDB.open("HQ_APP_DB",1);req.onupgradeneeded=(e)=>e.target.result.createObjectStore("handles");req.onsuccess=(e)=>{const db=e.target.result;const tx=db.transaction("handles","readonly");const g=tx.objectStore("handles").get("root");g.onsuccess=()=>r(g.result);};}); },
        async storeHandle(h) { const req=indexedDB.open("HQ_APP_DB",1);req.onsuccess=(e)=>{const db=e.target.result;const tx=db.transaction("handles","readwrite");tx.objectStore("handles").put(h,"root");}; },

        _normalizePlanningDateToISO(raw) {
            if (!raw || typeof raw !== 'string') return '';
            var str = raw.trim();
            if (!str) return '';

            // Cas déjà ISO
            if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;

            var parts = str.split(/[\\/\\-]/);
            if (parts.length !== 3) return '';
            var d = parseInt(parts[0], 10);
            var m = parseInt(parts[1], 10);
            var y = parts[2];

            if (isNaN(d) || isNaN(m)) return '';
            if (m < 1 || m > 12 || d < 1 || d > 31) return '';

            if (y.length === 2) {
                var yy = parseInt(y, 10);
                if (isNaN(yy)) return '';
                y = (2000 + yy).toString();
            } else if (y.length === 4) {
                if (isNaN(parseInt(y, 10))) return '';
            } else {
                return '';
            }

            var mStr = m < 10 ? '0' + m : '' + m;
            var dStr = d < 10 ? '0' + d : '' + d;
            return y + '-' + mStr + '-' + dStr;
        },

        // --- Planning : filtrage global / agent 360 ---
        getFilteredPlanningStats(startDateStr, endDateStr, agentName = null) {
            var self = this;
            console.groupCollapsed('[Planning] Filtrage des données');
            console.log('1. Paramètres -> Agent:', agentName, '| Du:', startDateStr, 'Au:', endDateStr);

            var planning = this.globalPlanningData && this.globalPlanningData.agents ? this.globalPlanningData : { agents: {} };
            var agents = planning.agents || {};

            console.log('2. Mémoire globale :', Object.keys(agents).length, 'agents chargés');

            var fromIso = (startDateStr || '').trim();
            var toIso = (endDateStr || '').trim();

            // 1. VUE GLOBALE (Strictement si agentName est null)
            if (agentName === null) {
                var globalEtats = {};
                Object.keys(agents).forEach((name) => {
                    var ag = agents[name] || {};
                    Object.keys(ag.states || {}).forEach((stateName) => {
                        var state = ag.states[stateName] || {};
                        var entries = Array.isArray(state.entries) ? state.entries : [];
                        if (!globalEtats[stateName]) globalEtats[stateName] = { totalHours: 0 };
                        var bucket = globalEtats[stateName];
                        for (var i = 0; i < entries.length; i++) {
                            var e = entries[i];
                            if (!e || typeof e !== 'object') continue;
                            var isoDate = self._normalizePlanningDateToISO(e.date || '');
                            if (!isoDate) continue;
                            if (fromIso && isoDate < fromIso) continue;
                            if (toIso && isoDate > toIso) continue;
                            var h = typeof e.durationHours === 'number' && !isNaN(e.durationHours) ? e.durationHours : 0;
                            bucket.totalHours += h;
                        }
                    });
                });
                console.log('3. [Vue Globale] Résultat :', globalEtats);
                console.groupEnd();
                return { etats: globalEtats };
            }

            // 2. VUE 360 AGENT
            if (agentName === '') {
                console.log('3. [Vue 360] agentName vide, retour sécurisé {}');
                console.groupEnd();
                return { etats: {} }; // Sécurité anti-fuite globale
            }

            // Normalisation pour comparer "COLAS Christine" et "Christine COLAS"
            var normalizeName = function(n) {
                if (!n) return '';
                var clean = n.toLowerCase()
                             .replace(/[àáâäãå]/g, 'a').replace(/[èéêë]/g, 'e')
                             .replace(/[ìíîï]/g, 'i').replace(/[òóôö]/g, 'o')
                             .replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
                             .replace(/[-_]/g, ' ').trim();
                return clean.split(/\s+/).sort().join(' ');
            };

            var searchNorm = normalizeName(agentName);
            var targetAgentKey = null;
            var agentKeys = Object.keys(agents);
            
            for (var k = 0; k < agentKeys.length; k++) {
                if (normalizeName(agentKeys[k]) === searchNorm) {
                    targetAgentKey = agentKeys[k];
                    break;
                }
            }

            var agent = targetAgentKey ? agents[targetAgentKey] : { states: {} };
            var outEtats = {};

            Object.keys(agent.states || {}).forEach((stateName) => {
                var state = agent.states[stateName] || {};
                var entries = Array.isArray(state.entries) ? state.entries : [];
                var totalHours = 0;
                var filteredEntries = [];

                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    if (!e || typeof e !== 'object') continue;
                    var isoDate = self._normalizePlanningDateToISO(e.date || '');
                    if (!isoDate) continue;
                    if (fromIso && isoDate < fromIso) continue;
                    if (toIso && isoDate > toIso) continue;
                    var h = typeof e.durationHours === 'number' && !isNaN(e.durationHours) ? e.durationHours : 0;
                    totalHours += h;
                    filteredEntries.push(e);
                }

                if (filteredEntries.length > 0) {
                    outEtats[stateName] = { totalHours: totalHours, entries: filteredEntries };
                }
            });

            console.log('3. [Vue 360] Cible Agent trouvée :', targetAgentKey);
            console.log('4. [Vue 360] Résultat :', outEtats);
            console.groupEnd();
            return { etats: outEtats };
        }
    }
}