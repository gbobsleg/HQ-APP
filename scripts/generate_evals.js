/**
 * Génère 1 à 3 grilles d'évaluation fictives par agent pour une campagne.
 * Usage: node scripts/generate_evals.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAMPAGNE_DIR = path.join(ROOT, 'Campagnes', '2026 S2');
const CONFIG_PATH = path.join(CAMPAGNE_DIR, 'campaign_config.json');

// Structure des critères (extrait de config_grille.js)
const GRID_ITEMS = [
  { id: 'pres', max: 2 }, { id: 'ident', max: 2 }, { id: 'ecoute', max: 2 },
  { id: 'quest', max: 4 }, { id: 'attente', max: 2 }, { id: 'attitude', max: 6 },
  { id: 'langage', max: 2 }, { id: 'parasites', max: 2 }, { id: 'synth', max: 1 },
  { id: 'polit', max: 2 }, { id: 'traca', max: 2 }, { id: 'perso', max: 2 },
  { id: 'si', max: 2 }, { id: 'poste', max: 2 }, { id: 'legis', max: 6 },
  { id: 'ods', max: 2 }, { id: 'rep', max: 9 }, { id: 'duree', max: 2 },
  { id: 'comp', max: 1 }, { id: 'fiches', max: 2 }
];

const OFFRES = ['Employeurs', 'Travailleurs indépendants', 'Particuliers employeurs', 'Accident du travail'];
const TOTAL_MAX = GRID_ITEMS.reduce((s, i) => s + i.max, 0);

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function randomScore(item, evalSeed) {
  const r = seededRandom(evalSeed + item.id.charCodeAt(0));
  const halfSteps = item.max <= 2 ? 2 : 1;
  const raw = 0.5 + r * 0.5;
  const score = Math.round(raw * item.max * halfSteps) / halfSteps;
  return Math.min(item.max, Math.max(0, score)).toString();
}

function generateEval(agent, campaignName, timestamp) {
  const evalSeed = timestamp + agent.id * 1000;
  const scores = {};
  let total = 0;
  GRID_ITEMS.forEach(item => {
    const s = randomScore(item, evalSeed);
    scores[item.id] = s;
    total += parseFloat(s);
  });
  const note = (total / TOTAL_MAX * 10).toFixed(1);
  const dureeMin = 1 + Math.floor(seededRandom(evalSeed + 1) * 4);
  const dureeSec = Math.floor(seededRandom(evalSeed + 2) * 60);

  return {
    agentId: agent.id,
    agent: `${agent.nom} ${agent.prénom}`,
    campagne: campaignName,
    note,
    commentaire: '',
    scores,
    comments: {},
    offre: OFFRES[Math.floor(seededRandom(evalSeed + 3) * OFFRES.length)],
    duree_min: String(dureeMin),
    duree_sec: String(dureeSec),
    date_communication: new Date(timestamp).toISOString().slice(0, 16),
    _timestamp: timestamp
  };
}

function slug(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
}

// Charger agents
eval(fs.readFileSync(path.join(ROOT, 'App_Sources', 'config', 'agents.js'), 'utf8'));
const agentsMap = new Map(LISTE_AGENTS.map(a => [a.id, a]));

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const agentIds = config.agent_ids || [];
const campaignName = path.basename(CAMPAGNE_DIR);

let count = 0;
// Base en 2026 pour que _timestamp et noms de fichiers correspondent à une date 2026
const baseTime = new Date('2026-02-01T10:00:00').getTime();

agentIds.forEach((agentId, idx) => {
  const agent = agentsMap.get(agentId);
  if (!agent) return;
  const nbEvals = 1 + (idx % 3);
  const prenomSlug = slug(agent.prénom || '');
  const nomSlug = slug(agent.nom || '');
  for (let i = 0; i < nbEvals; i++) {
    const ts = baseTime + count * 1000 + i * 111;
    const filename = `eval_${prenomSlug}_${nomSlug}_${ts}.json`;
    const filepath = path.join(CAMPAGNE_DIR, filename);
    const evalData = generateEval(agent, campaignName, ts);
    fs.writeFileSync(filepath, JSON.stringify(evalData, null, 0));
    count++;
  }
});

console.log(`${count} grilles fictives générées pour ${agentIds.length} agents.`);
