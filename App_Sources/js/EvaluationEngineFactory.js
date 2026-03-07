/**
 * EvaluationEngineFactory.js - Usine pour le moteur d'évaluation (saisie, payloads).
 * Phase 4 : Routage selon campaign_type. IIFE, exposé sur window.HQApp.EvaluationEngineFactory.
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

    global.HQApp.EvaluationEngineFactory = {
        getEngine: getEngine
    };
})(typeof window !== 'undefined' ? window : this);
