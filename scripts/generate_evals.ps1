# Genere 1 a 3 grilles fictives par agent pour la campagne 2026 S2
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$campagneDir = Join-Path $root "Campagnes\2026 S2"
$configPath = Join-Path $campagneDir "campaign_config.json"
$agentsPath = Join-Path $root "App_Sources\config\agents.js"

$gridItems = @(
    @{id='pres';max=2}, @{id='ident';max=2}, @{id='ecoute';max=2}, @{id='quest';max=4},
    @{id='attente';max=2}, @{id='attitude';max=6}, @{id='langage';max=2}, @{id='parasites';max=2},
    @{id='synth';max=1}, @{id='polit';max=2}, @{id='traca';max=2}, @{id='perso';max=2},
    @{id='si';max=2}, @{id='poste';max=2}, @{id='legis';max=6}, @{id='ods';max=2},
    @{id='rep';max=9}, @{id='duree';max=2}, @{id='comp';max=1}, @{id='fiches';max=2}
)
$totalMax = ($gridItems | ForEach-Object { $_.max } | Measure-Object -Sum).Sum
$offres = @('Employeurs','Travailleurs independants','Particuliers employeurs','Accident du travail')

# Commentaires fictifs par critere (id -> listes de commentaires possibles)
$commentairesParCritere = @{
    pres = @('Presentation conforme a la charte.', 'Bien introduite.')
    ident = @('Identification correcte du dossier.', 'Fiabilisation adequate.')
    ecoute = @('Bonne ecoute active.', 'Peut laisser davantage s''exprimer.')
    quest = @('Questionnement pertinent.', 'Reformulation a renforcer.')
    attente = @('Mise en attente correcte.')
    attitude = @('Assurance et professionnalisme.', 'Objections bien traitees.')
    langage = @('Expression claire et positive.')
    parasites = @('Quelques hesitations a reduire.', 'Debit adapte.')
    synth = @('Synthese presente mais perfectible.')
    polit = @('Formule de politesse adaptee.')
    traca = @('Fiche et commentaire coherents.')
    perso = @('Personnalisation bien appliquee.')
    si = @('Maitrise correcte des outils.')
    poste = @('Organisation du poste efficace.')
    legis = @('Bonne base reglementaire.', 'A approfondir sur certains points.')
    ods = @('ODS respectees.')
    rep = @('Reponse complete et adaptee.', 'Qualite de reponse satisfaisante.')
    duree = @('Duree coherente avec la complexite.')
    comp = @('Detection de situations complexes correcte.')
    fiches = @('Fiches bien utilisees.', 'A consulter les fiches plus systematiquement.')
}

# Commentaires generaux fictifs
$commentairesGeneraux = @(
    'Tres bonne ecoute, a encourager sur la synthese de fin d''appel.',
    'Progression notable sur les connaissances techniques.',
    'Points forts : qualite de la reponse et attitude professionnelle.',
    'Axes d''amelioration : reduire les hesitations et renforcer la reformulation.',
    'Agent a l''aise, bon traitement des objections.',
    'Fiche bien renseignee, tracabilite satisfaisante.',
    'A continuer sur cette voie, evaluation positive.',
    'Travail a mener sur la duree des appels et la consultation des fiches.',
    'Excellente conduite d''entretien, reponse complete.'
)

function SeededRandom($seed) {
    $x = [math]::Sin($seed) * 10000
    return $x - [math]::Floor($x)
}

function Slug($s) {
    if (-not $s) { return "Agent" }
    $map = @{ 'é'='e'; 'è'='e'; 'ê'='e'; 'ë'='e'; 'à'='a'; 'â'='a'; 'ä'='a'; 'ù'='u'; 'û'='u'; 'ü'='u'; 'ô'='o'; 'ö'='o'; 'î'='i'; 'ï'='i'; 'ç'='c'; 'œ'='oe'; 'æ'='ae' }
    $t = $s
    foreach ($k in $map.Keys) { $t = $t.Replace($k, $map[$k]) }
    $t = $t -replace '\s+', '_' -replace '[^\w\-]', ''
    if ([string]::IsNullOrWhiteSpace($t)) { return "Agent" }; $t.Trim('_')
}

# Parse agents.js - extract JSON array
$agentsContent = Get-Content $agentsPath -Raw
$jsonMatch = [regex]::Match($agentsContent, '\[[\s\S]*\]')
$agentsArr = $jsonMatch.Value | ConvertFrom-Json
$agentsMap = @{}
$agentsArr | ForEach-Object { $agentsMap[$_.id] = $_ }

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$campaignName = "2026 S2"

# Supprimer les grilles existantes
Get-ChildItem -Path $campagneDir -Filter "eval_*.json" -ErrorAction SilentlyContinue | Remove-Item -Force
$baseTime = [long](Get-Date -UFormat %s) * 1000
$count = 0
$i = 0

foreach ($agentId in $config.agent_ids) {
    $agent = $agentsMap[$agentId]
    if (-not $agent) { continue }
    $nbEvals = 1 + ($i % 3)
    $prenomSlug = Slug $agent.'prénom'
    $nomSlug = Slug $agent.nom
    for ($j = 0; $j -lt $nbEvals; $j++) {
        $ts = $baseTime + $count * 1000 + $j * 111
        $scores = @{}
        $total = 0
        foreach ($item in $gridItems) {
            $r = SeededRandom ($ts + $agentId * 1000 + [int][char]$item.id[0])
            $raw = 0.5 + $r * 0.5
            $halfSteps = if ($item.max -le 2) { 2 } else { 1 }
            $score = [math]::Round($raw * $item.max * $halfSteps) / $halfSteps
            $score = [math]::Min($item.max, [math]::Max(0, $score))
            $scores[$item.id] = $score.ToString()
            $total += $score
        }
        $note = [math]::Round($total / $totalMax * 10, 1).ToString([System.Globalization.CultureInfo]::InvariantCulture)
        $dureeMin = 1 + [int](SeededRandom ($ts + 1) * 4)
        $dureeSec = [int](SeededRandom ($ts + 2) * 60)
        $offre = $offres[[int](SeededRandom ($ts + 3) * $offres.Count)]
        
        # Commentaires par critere (environ 25 % des criteres ont un commentaire)
        $comments = @{}
        foreach ($item in $gridItems) {
            $r = SeededRandom ($ts + 1000 + $item.id.GetHashCode() + $j * 7)
            if ($r -lt 0.25 -and $commentairesParCritere[$item.id]) {
                $liste = $commentairesParCritere[$item.id]
                $idx = [int](SeededRandom ($ts + 2000 + $item.id.GetHashCode()) * $liste.Count)
                if ($idx -ge $liste.Count) { $idx = $liste.Count - 1 }
                $comments[$item.id] = $liste[$idx]
            }
        }
        
        # Commentaire general (environ 40 % des grilles)
        $commentaire = ""
        if ((SeededRandom ($ts + 3000 + $j)) -lt 0.40) {
            $idx = [int](SeededRandom ($ts + 4000) * $commentairesGeneraux.Count)
            if ($idx -ge $commentairesGeneraux.Count) { $idx = $commentairesGeneraux.Count - 1 }
            $commentaire = $commentairesGeneraux[$idx]
        }
        
        $eval = @{
            agentId = $agentId
            agent = "$($agent.nom) $($agent.'prénom')"
            campagne = $campaignName
            note = $note
            commentaire = $commentaire
            scores = $scores
            comments = $comments
            offre = $offre
            duree_min = $dureeMin.ToString()
            duree_sec = $dureeSec.ToString()
        } | ConvertTo-Json -Compress
        
        $filename = "eval_${prenomSlug}_${nomSlug}_${ts}.json"
        $filepath = Join-Path $campagneDir $filename
        $eval | Out-File -FilePath $filepath -Encoding utf8
        $count++
    }
    $i++
}

Write-Host "$count grilles fictives generees pour $($config.agent_ids.Count) agents."
