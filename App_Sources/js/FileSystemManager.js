/**
 * FileSystemManager.js - Abstraction I/O (File System Access API).
 * Phase 1 : lecture/écriture config, campagnes, évaluations, bilans, agents.
 * IIFE, exposé sur window.HQApp.FileSystemManager. Compatible file:// (Zero-Server).
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    var CONFIG_APP_FILENAME = 'config_app.js';
    var SITES_FILENAME = 'sites.js';
    var SUPERVISEURS_FILENAME = 'superviseurs.js';
    var MANAGERS_FILENAME = 'managers.js';
    var AGENTS_FILENAME = 'agents.js';
    var CAMPAIGN_CONFIG_FILENAME = 'campaign_config.json';
    var APP_SOURCES_DIR = 'App_Sources';
    var CONFIG_DIR = 'config';
    var JS_DIR = 'js';
    var DATA_STATS_DIR = 'Data_Stats';

    function getConfigDir(rootHandle) {
        return rootHandle.getDirectoryHandle(APP_SOURCES_DIR).then(function (appSrc) {
            return appSrc.getDirectoryHandle(CONFIG_DIR, { create: true });
        });
    }

    function getJsDir(rootHandle) {
        return rootHandle.getDirectoryHandle(APP_SOURCES_DIR).then(function (appSrc) {
            return appSrc.getDirectoryHandle(JS_DIR, { create: true });
        });
    }

    /**
     * Retourne le DirectoryHandle du dossier Data_Stats à la racine du projet.
     * @param {FileSystemDirectoryHandle} rootHandle
     * @returns {Promise<FileSystemDirectoryHandle>}
     */
    function getDataStatsDir(rootHandle) {
        return rootHandle.getDirectoryHandle(DATA_STATS_DIR);
    }

    /**
     * Parse un fichier JS du type "const VAR_NAME = <json>;" et retourne l'objet.
     * @param {string} content - Contenu brut du fichier
     * @param {string} varName - Nom de la variable (ex: CONFIG_APP, LISTE_AGENTS)
     * @returns {object|array}
     */
    function parseJsConstFile(content, varName) {
        if (!content || typeof content !== 'string') return null;
        var regex = new RegExp('^\\s*var\\s+' + varName + '\\s*=\\s*|^\\s*const\\s+' + varName + '\\s*=\\s*', 'i');
        var trimmed = content.trim().replace(regex, '').replace(/;\s*$/, '');
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            return null;
        }
    }

    /**
     * Lit un fichier dans un répertoire et retourne son contenu texte.
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {string} fileName
     * @returns {Promise<string>}
     */
    function readFileText(dirHandle, fileName) {
        return dirHandle.getFileHandle(fileName).then(function (fh) {
            return fh.getFile();
        }).then(function (file) {
            return file.text();
        });
    }

    /**
     * Écrit du texte dans un fichier (crée ou écrase).
     * @param {FileSystemDirectoryHandle} dirHandle
     * @param {string} fileName
     * @param {string} content
     * @returns {Promise<void>}
     */
    function writeFileText(dirHandle, fileName, content) {
        return dirHandle.getFileHandle(fileName, { create: true }).then(function (fh) {
            return fh.createWritable();
        }).then(function (w) {
            return w.write(content).then(function () { return w.close(); });
        });
    }

    var FileSystemManager = {
        // --- Config globale (fichiers .js avec const VAR = ...) ---
        readAppConfig: function (rootHandle) {
            return getConfigDir(rootHandle).then(function (configDir) {
                return readFileText(configDir, CONFIG_APP_FILENAME);
            }).then(function (text) {
                return parseJsConstFile(text, 'CONFIG_APP');
            }).catch(function () {
                return null;
            });
        },

        writeAppConfig: function (rootHandle, data) {
            return getConfigDir(rootHandle).then(function (configDir) {
                var content = 'const CONFIG_APP = ' + JSON.stringify(data, null, 4) + ';';
                return writeFileText(configDir, CONFIG_APP_FILENAME, content);
            });
        },

        readSites: function (rootHandle) {
            return getConfigDir(rootHandle).then(function (configDir) {
                return readFileText(configDir, SITES_FILENAME);
            }).then(function (text) {
                return parseJsConstFile(text, 'LISTE_SITES');
            }).catch(function () {
                return null;
            });
        },

        writeSites: function (rootHandle, data) {
            return getConfigDir(rootHandle).then(function (configDir) {
                var content = 'const LISTE_SITES = ' + JSON.stringify(data, null, 4) + ';';
                return writeFileText(configDir, SITES_FILENAME, content);
            });
        },

        readSupervisors: function (rootHandle) {
            return getConfigDir(rootHandle).then(function (configDir) {
                return readFileText(configDir, SUPERVISEURS_FILENAME);
            }).then(function (text) {
                return parseJsConstFile(text, 'LISTE_SUPERVISEURS');
            }).catch(function () {
                return null;
            });
        },

        writeSupervisors: function (rootHandle, data) {
            return getConfigDir(rootHandle).then(function (configDir) {
                var content = 'const LISTE_SUPERVISEURS = ' + JSON.stringify(data, null, 4) + ';';
                return writeFileText(configDir, SUPERVISEURS_FILENAME, content);
            });
        },

        readManagers: function (rootHandle) {
            return getConfigDir(rootHandle).then(function (configDir) {
                return readFileText(configDir, MANAGERS_FILENAME);
            }).then(function (text) {
                return parseJsConstFile(text, 'LISTE_MANAGERS');
            }).catch(function () {
                return null;
            });
        },

        writeManagers: function (rootHandle, data) {
            return getConfigDir(rootHandle).then(function (configDir) {
                var content = 'const LISTE_MANAGERS = ' + JSON.stringify(data, null, 4) + ';';
                return writeFileText(configDir, MANAGERS_FILENAME, content);
            });
        },

        // --- Campagnes (campaign_config.json + fichiers JSON dans un dossier campagne) ---
        readCampaignConfig: function (campaignDirHandle) {
            return readFileText(campaignDirHandle, CAMPAIGN_CONFIG_FILENAME).then(function (text) {
                return JSON.parse(text);
            });
        },

        /**
         * Lit campaign_config.json et retourne config + lastModified (pour tri des campagnes).
         * @param {FileSystemDirectoryHandle} campaignDirHandle
         * @returns {Promise<{config: object, lastModified: number}>}
         */
        readCampaignConfigWithMeta: function (campaignDirHandle) {
            return campaignDirHandle.getFileHandle(CAMPAIGN_CONFIG_FILENAME).then(function (fh) {
                return fh.getFile();
            }).then(function (file) {
                return file.text().then(function (text) {
                    var config = JSON.parse(text);
                    var date = config.date ? new Date(config.date).getTime() : file.lastModified;
                    return { config: config, lastModified: date };
                });
            });
        },

        writeCampaignConfig: function (campaignDirHandle, data) {
            var content = JSON.stringify(data, null, 2);
            return writeFileText(campaignDirHandle, CAMPAIGN_CONFIG_FILENAME, content);
        },

        /**
         * Liste les entrées (fichiers/dossiers) d'un dossier quelconque.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @returns {Promise<Array<{name: string, kind: string}>>}
         */
        listEntries: function (dirHandle) {
            var entries = [];
            return (async function () {
                for (var it = dirHandle.values(), entry; !(entry = await it.next()).done;) {
                    entries.push({ name: entry.value.name, kind: entry.value.kind });
                }
                return entries;
            })();
        },

        /**
         * Liste les entrées (fichiers/dossiers) d'un dossier campagne.
         * @param {FileSystemDirectoryHandle} campaignDirHandle
         * @returns {Promise<Array<{name: string, kind: string}>>}
         */
        listCampaignEntries: function (campaignDirHandle) {
            return this.listEntries(campaignDirHandle);
        },

        /**
         * Lit un fichier dans un répertoire et retourne son contenu texte.
         * @param {FileSystemDirectoryHandle} dirHandle
         * @param {string} fileName
         * @returns {Promise<string>}
         */
        readFileText: function (dirHandle, fileName) {
            return readFileText(dirHandle, fileName);
        },

        /**
         * Retourne le DirectoryHandle du dossier Data_Stats à la racine du projet.
         * @param {FileSystemDirectoryHandle} rootHandle
         * @returns {Promise<FileSystemDirectoryHandle>}
         */
        getDataStatsDir: function (rootHandle) {
            return getDataStatsDir(rootHandle);
        },

        readJsonFile: function (dirHandle, fileName) {
            return readFileText(dirHandle, fileName).then(function (text) {
                return JSON.parse(text);
            });
        },

        writeJsonFile: function (dirHandle, fileName, data) {
            var content = JSON.stringify(data, null, 2);
            return writeFileText(dirHandle, fileName, content);
        },

        removeEntry: function (dirHandle, fileName) {
            return dirHandle.removeEntry(fileName);
        },

        // --- Agents (App_Sources/config/agents.js) ---
        readAgents: function (rootHandle) {
            return getConfigDir(rootHandle).then(function (configDir) {
                return readFileText(configDir, AGENTS_FILENAME);
            }).then(function (text) {
                return parseJsConstFile(text, 'LISTE_AGENTS');
            }).catch(function () {
                return null;
            });
        },

        writeAgents: function (rootHandle, data) {
            return getConfigDir(rootHandle).then(function (configDir) {
                var content = 'const LISTE_AGENTS = ' + JSON.stringify(data, null, 2) + ';';
                return writeFileText(configDir, AGENTS_FILENAME, content);
            });
        }
    };

    global.HQApp.FileSystemManager = FileSystemManager;
})(typeof window !== 'undefined' ? window : this);
