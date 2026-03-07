// nav.js
document.addEventListener('alpine:init', () => {
    Alpine.data('navComponent', () => ({
        isSupported: 'showDirectoryPicker' in window,
        isActive(page) {
            return window.location.pathname.includes(page);
        },
        template: `
        <template x-if="!isInitializing && (!rootHandle || !campagnesHandle)">
            <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/80 backdrop-blur-md">
                <div class="bg-white p-10 rounded-[2.5rem] shadow-2xl text-center max-w-2xl mx-auto border border-white/20 animate-in zoom-in-95 duration-300">
                    
                    <!-- Cas NON SUPPORT\u00c9 (Firefox) -->
                    <template x-if="!isSupported">
                        <div>
                            <div class="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span class="text-4xl">\u{1F98A}</span>
                            </div>
                            <h2 class="text-2xl font-black text-rose-900 mb-2">Navigateur non support\u00e9</h2>
                            <p class="text-slate-500 text-sm mb-6 leading-relaxed">
                                Firefox ne supporte pas l'acc\u00e8s aux dossiers locaux requis par cette app.<br><br>
                                <span class="font-bold text-rose-600">Veuillez utiliser Edge ou Chrome.</span>
                            </p>
                        </div>
                    </template>

                    <!-- Cas SUPPORT\u00c9 -->
                    <template x-if="isSupported">
                        <div>
                            <div class="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span class="text-4xl animate-bounce">\u{1F4C1}</span>
                            </div>
                            <h2 class="text-2xl font-black text-indigo-900 mb-2">Connexion requise</h2>
                            <p class="text-slate-500 text-sm mb-4 leading-relaxed">
                                Suivez ces 2 \u00e9tapes pour s\u00e9lectionner le dossier <b>RACINE</b> du projet :
                            </p>
                            <template x-if="appRootPathForCopy">
                                <div class="mb-6 text-left space-y-4">
                                    <div class="flex gap-3 items-start">
                                        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-sm flex items-center justify-center">1</span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-slate-700 font-bold text-sm mb-1">Copiez le chemin ci-dessous en cliquant sur le bouton "Copier le chemin".</p>
                                            <div class="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-700 break-all" x-text="appRootPathForCopy"></div>
                                            <button type="button" @click="copyAppRootPath()" class="mt-2 w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold py-2 rounded-xl text-sm transition-colors">
                                                Copier le chemin
                                            </button>
                                        </div>
                                    </div>
                                    <div class="flex gap-3 items-start">
                                        <span class="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-sm flex items-center justify-center">2</span>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-slate-700 font-bold text-sm mb-2">Cliquez sur le bouton \u00ab S\u00e9lectionner la racine \u00bb ci-dessous. Dans la fen\u00eatre Windows qui s’ouvre :</p>
                                            <ul class="text-slate-600 text-sm list-decimal list-inside space-y-1 mb-2">
                                                <li>Collez le chemin dans la barre d’adresse en haut (Ctrl+V)</li>
                                                <li>Appuyez sur la touche <b>Entr\u00e9e</b></li>
                                                <li>Cliquez sur le bouton <b>\u00ab S\u00e9lectionner un dossier \u00bb</b></li>
                                            </ul>
                                            <img src="chemin-picker-aide.png" alt="O\u00f9 coller le chemin : dans la barre d’adresse en haut de la fen\u00eatre de s\u00e9lection de dossier." class="w-full rounded-xl border border-slate-200 shadow-sm" />
                                        </div>
                                    </div>
                                </div>
                            </template>
                            <button @click="connectOrRefresh(true)" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-xl transition-all">
                                \u{1F680} S\u00c9LECTIONNER LA RACINE
                            </button>
                        </div>
                    </template>
                </div>
            </div>
        </template>

        <div x-show="notification.show" 
             x-transition:enter="transition ease-out duration-300"
             x-transition:enter-start="opacity-0 transform translate-y-[-20px]"
             class="fixed top-5 right-5 z-[20000] min-w-[320px] shadow-2xl rounded-2xl p-4 flex items-center gap-3 border shadow-indigo-950/20"
             :class="notification.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-rose-600 border-rose-400 text-white'">
            <span class="text-2xl" x-text="notification.type === 'success' ? '\u2705' : '\u26A0\uFE0F'"></span>
            <div class="flex-1 text-sm font-bold" x-text="notification.message"></div>
            <button @click="notification.show = false" class="font-bold opacity-70 hover:opacity-100">\u2715</button>
        </div>

        <div class="max-w-7xl mx-auto flex justify-between items-center px-4">
            <div class="flex gap-4 items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1196.63 1186" class="h-7 w-auto flex-shrink-0 text-emerald-400" aria-hidden="true"><path fill="currentColor" d="M547.54,733.68l362.01,364.96c-71.14,43.05-153.97,73.22-237.03,83.02C192.22,1238.33-163.28,729.85,77.2,302.33c242.75-431.56,888.53-393.46,1075.28,65.41,92.85,228.14,36.66,489.62-144.21,655.79l-291.73-289.86h-169ZM481.54,317.68h-126v550h126v-217l3-3h230l122.99,123.01,6.01,2.99v-456h-128v218h-234v-218Z"/></svg>
                <span class="text-xl font-black text-emerald-400 tracking-tighter uppercase leading-none">HQ-APP</span>
                <div class="flex gap-1 border-l border-indigo-700 pl-4 text-xs font-medium uppercase tracking-wider">
                    <a href="pilotage.html" :class="isActive('pilotage.html') ? 'bg-indigo-700 text-white border-b-2 border-emerald-400' : 'text-indigo-200 hover:text-white'" class="px-3 py-2 rounded-lg transition">\u{1F680} Pilotage</a>
                    <a href="dashboard.html" :class="isActive('dashboard.html') ? 'bg-indigo-700 text-white border-b-2 border-emerald-400' : 'text-indigo-200 hover:text-white'" class="px-3 py-2 rounded-lg transition">\u{1F4C8} Statistiques</a>
                    <a href="admin.html" :class="isActive('admin.html') ? 'bg-indigo-700 text-white border-b-2 border-emerald-400' : 'text-indigo-200 hover:text-white'" class="px-3 py-2 rounded-lg transition">\u2699\uFE0F Admin</a>
                </div>
            </div>
        </div>

        <!-- FOOTER BAR -->
        <div class="fixed bottom-0 left-0 right-0 bg-slate-50 border-t border-slate-200 py-1 px-4 z-[9999] flex justify-between items-center text-[10px] font-bold text-slate-400 shadow-md">
            <div class="flex items-center gap-2 flex-wrap">
                <span>
                    HQ-APP v${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?.?.?'} &mdash; <span class="hidden sm:inline">Syst\u00e8me d'\u00e9valuation Qualit\u00e9</span>
                </span>
                <span class="mx-2 text-slate-300 select-none">|</span>
                <template x-if="updateCheck && (appConfig.updateSource.repoOwner || '').trim() && (appConfig.updateSource.repoName || '').trim()">
                    <span class="inline-flex items-center gap-1.5">
                        <span x-show="updateCheck.status === 'current'" class="inline-flex items-center gap-1 text-emerald-700">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>\u00c0 jour</span>
                        </span>
                        <span x-show="updateCheck.status === 'checking'" class="text-slate-500">V\u00e9rification des mises \u00e0 jour...</span>
                        <span x-show="updateCheck.status === 'error'" class="inline-flex items-center gap-1 text-rose-600" :title="updateCheck.error || ''">
                            <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span x-text="(updateCheck.error || 'Erreur').slice(0, 40) + ((updateCheck.error && updateCheck.error.length > 40) ? '...' : '')"></span>
                        </span>
                        <span x-show="updateCheck.status === 'available'" class="inline-flex items-center gap-1 text-amber-700">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>Mise \u00e0 jour <span x-text="updateCheck.remoteVersion"></span> dispo</span>
                            <a href="admin-mise-a-jour.html" class="underline text-amber-700 hover:text-amber-900">voir</a>
                        </span>
                        <button x-show="updateCheck.status !== 'checking'" type="button" @click="checkForUpdate()" class="text-indigo-500 hover:text-indigo-700 underline ml-0.5">V\u00e9rifier</button>
                    </span>
                </template>
                <span class="mx-2 text-slate-300 select-none">|</span>
                <button type="button" @click="window.openSharedLink && window.openSharedLink()" class="text-slate-400 hover:text-indigo-600 transition-colors py-0.5">\u{1F517} Ouvrir un dossier partag\u00e9</button>
            </div>
            <div class="flex items-center gap-2">
                <template x-if="hasStoredFolder && campagnesHandle">
                    <button @click="connectOrRefresh()" class="hover:text-indigo-600 transition-colors flex items-center gap-1 group py-0.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>Dossier : <span x-text="rootHandle ? rootHandle.name : 'Racine'" class="text-slate-600 group-hover:text-indigo-700"></span></span>
                        <span class="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 ml-1 bg-indigo-50 px-1 rounded">MODIFIER</span>
                    </button>
                </template>
                <template x-if="!hasStoredFolder || !campagnesHandle">
                     <button @click="connectOrRefresh()" class="text-rose-500 hover:text-rose-700 flex items-center gap-1 animate-pulse py-0.5">
                        <span>\u26A0\uFE0F Non connect\u00e9</span>
                    </button>
                </template>
            </div>
        </div>`
    }));
});