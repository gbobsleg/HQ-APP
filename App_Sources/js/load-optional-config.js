/**
 * Charge config_app.js, sites.js, superviseurs.js ou leurs .example.js si absents.
 * Utilise des balises <script> (pas fetch) pour fonctionner en file://.
 * Puis charge les scripts listés dans data-next (ordre préservé).
 */
(function () {
    var script = document.currentScript;
    var base = script.src.replace(/\/[^/]+$/, '/');

    function loadOptionalScript(name, next) {
        var el = document.createElement('script');
        el.charset = 'utf-8';
        el.src = base + name;
        el.onload = function () { next(); };
        el.onerror = function () {
            var fallback = document.createElement('script');
            fallback.charset = 'utf-8';
            var fallbackPath = name.replace(/^\.\.\/config\//, '../examples/').replace(/\.js$/, '.example.js');
            fallback.src = base + fallbackPath;
            fallback.onload = fallback.onerror = function () { next(); };
            document.head.appendChild(fallback);
        };
        document.head.appendChild(el);
    }

    function loadScriptsInOrder(list, done) {
        if (!list || !list.length) { done(); return; }
        var i = 0;
        function next() {
            if (i >= list.length) { done(); return; }
            var raw = list[i].trim();
            var src = raw.indexOf('http') === 0 ? raw : base + raw;
            i++;
            var el = document.createElement('script');
            el.charset = 'utf-8';
            el.src = src;
            el.onload = el.onerror = next;
            document.head.appendChild(el);
        }
        next();
    }

    var nextAttr = script.getAttribute('data-next');
    var nextList = nextAttr ? nextAttr.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];

    loadOptionalScript('../config/config_app.js', function () {
        loadOptionalScript('../config/sites.js', function () {
            loadOptionalScript('../config/superviseurs.js', function () {
                loadOptionalScript('../config/managers.js', function () {
                    loadScriptsInOrder(nextList, function () {});
                });
            });
        });
    });
})();
