/**
 * ScrollView.js - Gestion impérative du défilement.
 * Phase 3 : Ségrégation UI. IIFE, exposé sur window.HQApp.ScrollView.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    function scrollToTop() {
        if (typeof global.scrollTo === 'function') {
            global.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    global.HQApp.ScrollView = {
        scrollToTop: scrollToTop
    };
})(typeof window !== 'undefined' ? window : this);
