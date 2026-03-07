/**
 * Logique de mise à jour de l'app depuis GitHub.
 * Exposé globalement sous window.HQ_APP_UPDATE pour être appelé depuis script.js.
 * VERSION DEBUG
 */
(function () {
    const FORBIDDEN_FILES = ['agents.js', 'sites.js', 'superviseurs.js', 'config_app.js', 'config_grille.js'];
    const ALLOWED_EXTENSIONS = ['.html', '.js', '.png', '.svg'];
    const DEBUG = true; // Activer les logs

    function log(msg, ...args) {
        if (DEBUG) console.log(`[HQ-UPDATE] ${msg}`, ...args);
    }

    function error(msg, ...args) {
        console.error(`[HQ-UPDATE] ERROR: ${msg}`, ...args);
    }

    function isUpdatePathAllowed(relativePath) {
        const path = String(relativePath).replace(/\\/g, '/').trim();
        if (!path || path.includes('..') || path.startsWith('/')) return false;
        if (path.includes('Campagnes/') || path.includes('Campagnes\\')) return false;
        if (path.startsWith('App_Sources/config/grilles/') || path.replace(/\\/g, '/').startsWith('App_Sources/config/grilles/')) return false;
        const fileName = path.split('/').pop() || path.split('\\').pop();
        if (FORBIDDEN_FILES.includes(fileName)) return false;
        if (path === 'index.html' || path === 'version.json') return true;
        if (path.startsWith('App_Sources/')) {
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
            return ALLOWED_EXTENSIONS.includes(ext);
        }
        return false;
    }

    function compareVersions(a, b) {
        log(`Comparing versions: Remote "${a}" vs Local "${b}"`);
        const pa = (a || '0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
        const pb = (b || '0').split('.').map(function (n) { return parseInt(n, 10) || 0; });
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const va = pa[i] || 0;
            const vb = pb[i] || 0;
            if (va !== vb) return va > vb ? 1 : -1;
        }
        return 0;
    }

    async function fetchManifest(owner, repo, token, onLog) {
        const versionPath = 'version.json';
        const cacheBust = '?t=' + Date.now();
        const fetchOpts = { cache: 'no-store' };
        const emit = function (m) { log(m); if (onLog) onLog(m); };
        const emitErr = function (m) { error(m); if (onLog) onLog('[ERROR] ' + m); };

        emit('Fetching manifest for ' + owner + '/' + repo);

        if (token) {
            const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(versionPath) + cacheBust;
            emit('API URL: ' + url);
            const r = await fetch(url, { ...fetchOpts, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.v3+json' } });
            if (!r.ok) {
                emitErr('API Fetch failed: ' + r.status);
                throw new Error(r.status === 404 ? 'version.json introuvable' : 'HTTP ' + r.status);
            }
            const data = await r.json();
            const jsonText = data.content ? atob(data.content.replace(/\s/g, '')) : '';
            return JSON.parse(jsonText);
        }

        const rawUrl = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/main/' + encodeURIComponent(versionPath) + cacheBust;
        emit('RAW URL (main): ' + rawUrl);
        let r = await fetch(rawUrl, fetchOpts);

        if (!r.ok && r.status === 404) {
            const rawUrlMaster = 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/master/' + encodeURIComponent(versionPath) + cacheBust;
            emit('RAW URL (master): ' + rawUrlMaster);
            r = await fetch(rawUrlMaster, fetchOpts);
        }

        if (!r.ok) {
            emitErr('RAW Fetch failed: ' + r.status);
            throw new Error('HTTP ' + r.status);
        }
        const json = await r.json();
        emit('Manifest fetched. Version: ' + json.version);
        return json;
    }

    async function checkForUpdate(opts) {
        const owner = (opts.owner || '').trim();
        const repo = (opts.repo || '').trim();
        const token = (opts.token || '').trim();
        if (!owner || !repo) {
            error('Owner/Repo missing');
            return { status: 'error', remoteVersion: '', error: 'Source de mise à jour non configurée.' };
        }
        try {
            const manifest = await fetchManifest(owner, repo, token);
            const remoteVersion = (manifest.version || '0.0.0').trim();
            const localVersion = typeof APP_VERSION !== 'undefined' ? String(APP_VERSION).trim() : '0.0.0';
            
            log(`Check result - Local: ${localVersion}, Remote: ${remoteVersion}`);
            
            const available = compareVersions(remoteVersion, localVersion) > 0;
            return { status: available ? 'available' : 'current', remoteVersion: remoteVersion, error: '' };
        } catch (e) {
            error('Check Exception', e);
            return { status: 'error', remoteVersion: '', error: e.message || 'Impossible de vérifier les mises à jour' };
        }
    }

    async function runUpdate(opts) {
        const onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
        const emit = function (m) { log(m); if (onLog) onLog(m); };
        const emitErr = function (m) { error(m); if (onLog) onLog('[ERROR] ' + m); };

        emit('Starting runUpdate...');
        const rootHandle = opts.rootHandle;
        const owner = (opts.owner || '').trim();
        const repo = (opts.repo || '').trim();
        const token = (opts.token || '').trim();
        if (!rootHandle || !owner || !repo) throw new Error('Paramètres manquants.');

        if (await rootHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            emit('Requesting permission...');
            const granted = await rootHandle.requestPermission({ mode: 'readwrite' });
            if (granted !== 'granted') throw new Error('Permission d\'écriture refusée.');
        }

        const manifest = await fetchManifest(owner, repo, token, onLog);
        const branch = manifest.defaultBranch || 'main';

        let files = [];
        try {
            const treeUrl =
                'https://api.github.com/repos/' +
                encodeURIComponent(owner) + '/' +
                encodeURIComponent(repo) +
                '/git/trees/' +
                encodeURIComponent(branch) +
                '?recursive=1';

            emit('Fetching git tree: ' + treeUrl);

            const headers = { Accept: 'application/vnd.github.v3+json' };
            if (token) {
                headers.Authorization = 'Bearer ' + token;
            }

            const res = await fetch(treeUrl, { headers: headers, cache: 'no-store' });
            if (!res.ok) {
                emitErr('Git Tree API failed: ' + res.status);
                throw new Error('Git Tree API HTTP ' + res.status);
            }

            const data = await res.json();
            const tree = Array.isArray(data.tree) ? data.tree : [];
            files = tree
                .filter(function (node) { return node && node.type === 'blob'; })
                .map(function (node) { return String(node.path || '').trim(); })
                .filter(function (p) { return !!p; });

            emit('Git tree files count: ' + files.length);
        } catch (e) {
            emitErr('Git Tree API failed, falling back to manifest.files if available. ' + (e.message || e));
            if (Array.isArray(manifest.files) && manifest.files.length > 0) {
                files = manifest.files.slice();
            } else {
                throw new Error('Impossible de construire la liste des fichiers à mettre à jour.');
            }
        }

        const toWrite = files.filter(isUpdatePathAllowed);

        emit('Files to update: ' + toWrite.length + ' (from ' + files.length + ' total files)');
        if (DEBUG) console.table(toWrite);

        const versionJsLast = toWrite.filter(function (p) { return p.replace(/\\/g, '/') === 'App_Sources/js/version.js'; });
        const rest = toWrite.filter(function (p) { return p.replace(/\\/g, '/') !== 'App_Sources/js/version.js'; });
        const ordered = rest.concat(versionJsLast);

        const versionStr = (manifest.version || '0.0.0').trim();
        const versionJsPath = 'App_Sources/js/version.js';

        for (let i = 0; i < ordered.length; i++) {
            const relativePath = ordered[i];
            const path = relativePath.replace(/\\/g, '/');
            emit('Processing: ' + path);

            let content;
            const isVersionJs = path === versionJsPath;
            if (isVersionJs) {
                content = 'const APP_VERSION = "' + versionStr.replace(/"/g, '\\"') + '";\n';
                emit('Generating version.js with version ' + versionStr);
            } else {
                try {
                    if (token) {
                        const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(path);
                        const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.v3+json' } });
                        if (!res.ok) { emitErr('Failed to fetch ' + path + ' (API)'); continue; }
                        const data = await res.json();
                        const raw = data.content ? atob(data.content.replace(/\s/g, '')) : '';
                        content = new Uint8Array(Array.from(raw, function (c) { return c.charCodeAt(0); }));
                    } else {
                        let fetchUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + path;
                        let res = await fetch(fetchUrl);
                        if (!res.ok) {
                            fetchUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/master/' + path;
                            res = await fetch(fetchUrl);
                        }
                        if (!res.ok) { emitErr('Failed to fetch ' + path + ' (RAW)'); continue; }
                        const buf = await res.arrayBuffer();
                        content = new Uint8Array(buf);
                    }
                } catch(e) {
                    emitErr('Exception fetching ' + path + ': ' + (e.message || e));
                    continue;
                }
            }

            try {
                const parts = path.split('/');
                let dir = rootHandle;
                for (let j = 0; j < parts.length - 1; j++) dir = await dir.getDirectoryHandle(parts[j], { create: true });
                const fileName = parts[parts.length - 1];
                const fileHandle = await dir.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                if (typeof content === 'string') {
                    const bytes = new TextEncoder().encode(content);
                    await writable.write(bytes);
                } else {
                    await writable.write(content instanceof Uint8Array ? content : new Uint8Array(content));
                }
                await writable.close();
                emit('Success write: ' + path);
            } catch(e) {
                emitErr('Exception writing ' + path + ': ' + (e.message || e));
            }
        }
        emit('Update completed.');
    }

    async function fetchReleases(opts) {
        const owner = (opts.owner || '').trim();
        const repo = (opts.repo || '').trim();
        const token = (opts.token || '').trim();
        if (!owner || !repo) {
            return { releases: [], error: 'Source de mise à jour non configurée.' };
        }
        const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/releases?per_page=30';
        const headers = { Accept: 'application/vnd.github.v3+json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        try {
            const r = await fetch(url, { cache: 'no-store', headers: headers });
            if (!r.ok) {
                if (r.status === 404) return { releases: [], error: 'Dépôt ou releases introuvables.' };
                if (r.status === 401) return { releases: [], error: 'Token invalide ou expiré.' };
                return { releases: [], error: 'Erreur API GitHub (' + r.status + ').' };
            }
            const data = await r.json();
            const releases = (Array.isArray(data) ? data : []).filter(function (rel) { return !rel.draft; }).map(function (rel) {
                const tag = (rel.tag_name || '').replace(/^v/i, '');
                return {
                    version: tag,
                    tag_name: rel.tag_name || '',
                    name: rel.name || tag,
                    body: rel.body || '',
                    published_at: rel.published_at || rel.created_at || ''
                };
            });
            log('Fetched ' + releases.length + ' releases');
            return { releases: releases, error: '' };
        } catch (e) {
            error('fetchReleases', e);
            return { releases: [], error: e.message || 'Impossible de récupérer les releases.' };
        }
    }

    window.HQ_APP_UPDATE = {
        isUpdatePathAllowed: isUpdatePathAllowed,
        compareVersions: compareVersions,
        checkForUpdate: checkForUpdate,
        runUpdate: runUpdate,
        fetchReleases: fetchReleases
    };
})();