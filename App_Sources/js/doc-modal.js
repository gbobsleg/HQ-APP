// doc-modal.js — Fenêtre modale pour la documentation (aucune modification de script.js)
document.addEventListener('alpine:init', () => {
    Alpine.store('docModal', { open: false, hash: '' });

    Alpine.data('docModalComponent', () => ({
        get isOpen() {
            return Alpine.store('docModal').open;
        },
        get iframeSrc() {
            const hash = Alpine.store('docModal').hash || '';
            return 'admin-doc.html' + hash;
        },
        close() {
            Alpine.store('docModal').open = false;
        }
    }));

    // Injection du modal dans le DOM
    const root = document.createElement('div');
    root.id = 'doc-modal-root';
    root.setAttribute('x-data', 'docModalComponent()');
    root.innerHTML = `
        <div x-show="isOpen"
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0"
             x-transition:enter-end="opacity-100"
             x-transition:leave="transition ease-in duration-150"
             x-transition:leave-start="opacity-100"
             x-transition:leave-end="opacity-0"
             class="fixed inset-0 z-[30000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
             @click.self="close()">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
                 @click.stop>
                <div class="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h2 class="font-black text-slate-800 text-lg">Documentation</h2>
                    <button type="button" @click="close()"
                            class="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 font-bold transition-colors flex items-center justify-center">
                        ×
                    </button>
                </div>
                <iframe :src="iframeSrc" class="flex-1 w-full min-h-[70vh] border-0 rounded-b-3xl bg-white"></iframe>
            </div>
        </div>
    `;
    document.body.appendChild(root);
});
