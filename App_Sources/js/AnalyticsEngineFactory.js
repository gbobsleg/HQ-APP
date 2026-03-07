/**
 * AnalyticsEngineFactory.js - Usine pour le moteur analytics (workflow, statistiques).
 * Phase 4 : Routage selon campaign_type. IIFE, exposé sur window.HQApp.AnalyticsEngineFactory.
 */
(function (global) {
    'use strict';

    global.HQApp = global.HQApp || {};

    function getEngine(campaignType) {
        if (campaignType === 'review') {
            return global.HQApp.ReviewEngine ? new global.HQApp.ReviewEngine() : null;
        }
        return global.HQApp.ScoringEngine ? new global.HQApp.ScoringEngine() : null;
    }

    global.HQApp.AnalyticsEngineFactory = {
        getEngine: getEngine
    };
})(typeof window !== 'undefined' ? window : this);
