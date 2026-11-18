# GENESIS — Journal de développement

Mémoire du projet entre les sessions de Claude Code. **À lire en début de session, à compléter
en fin d'étape.** Les étapes les plus récentes sont en haut.

Chaque entrée contient : ce qui a été fait, les décisions et écarts validés, la dette technique
(raccourcis provisoires à reprendre plus tard, avec l'étape prévue), et les mesures clés.

---

## Étape 5 · Atelier et mesures — 18 nov. 2026

**Fait :**
- Mécanisme d'interaction commun `src/sim/core/interactions.ts`. Les humains publient leur
  position en lecture seule ; un prédateur affamé qui voit une personne seule (personne d'autre
  à moins de 6 tuiles) la prend en chasse, jamais un groupe. Le système des humains applique
  blessure ou mort et l'écrit au journal (l'animal comme acteur) ; la faune applique le repas
  (le corps devient une carcasse). Réutilisable pour la chasse, l'élevage et le combat.
- Test qui vérifie qu'aucun système n'écrit dans les données d'un autre. Il a révélé la cueillette
  de branches, qui abîmait l'arbre directement : elle passe maintenant par la flore.
- Métadonnées (libellé, légende, unité, bornes, « en direct » / « nouveau monde ») pour toutes
  les valeurs des 9 fichiers de `data/`, avec un test qui en vérifie la présence.
- Atelier des variables (F2) : par système puis par fichier, recherche, contrôles adaptés,
  valeur actuelle et par défaut, édition entrée par entrée des listes, validation des bornes et
  des règles entre fichiers, presets (différences seules, dossier `presets/`), journalisation de
  chaque modification en cours de partie.
- Indicateur de performance (F3) ; si le PC ne suit pas, le jeu ralentit et la vitesse atteinte
  s'affiche en rouge. Banc d'essai (`Benchmark-GENESIS.bat`, qui appelle
  `Lancer-GENESIS.bat --benchmark`, ou bouton dans l'Atelier) avec le code compilé, rapports
  datés texte + JSON dans `rapports/`.

**Décisions et écarts validés :**
- Moins de morts par prédateur (0 à 2 en 10 ans selon le monde, contre 1 à 7 avant) : histoire
  légitime, l'animal décide, préfère une carcasse et évite les groupes. Réglages déplacés de
  `humans.json` vers `animals.json` → `humanPrey`.
- Pas de plafond de population imposé ; le rapport du banc d'essai donne un repère indicatif.
- Le banc d'essai utilise toujours les valeurs par défaut (rapports comparables).
- Certaines variables sont « nouveau monde » pour des raisons techniques (identifiants, noms,
  valeurs calculées à la création du monde).
- Une modification en direct fait diverger le monde de sa graine ; le journal garde la trace.

**Dette technique :**
- Le dernier preset actif n'est pas rechargé au démarrage → **décidé : le recharger
  automatiquement** (à faire à l'étape 6).
- Impossible d'ajouter ou de supprimer une entrée de liste (nouvelle espèce, nouvelle plante)
  depuis l'Atelier : il faut passer par les fichiers JSON → plus tard, si le besoin se confirme.
- `.bat` modifiés et non testés sous Windows par Claude Code : à confirmer par Tanguy.

**Dettes de l'étape 4 résolues :** frontière entre systèmes pour les prédateurs ; métadonnées
des anciennes variables.

**Mesures :** en attente du premier rapport du banc d'essai sur le PC de Tanguy.

---

## Étape 4 · Premiers humains — 18 nov. 2026

**Fait :** cycle jour-nuit (durée du jour selon saison et latitude), météo locale par région,
tribu de 30 personnes avec familles, feu de camp et 6 huttes au départ, noms provisoires par
syllabes, traits de personnalité, besoins (faim, soif, sommeil, chaleur, sécurité), inventaire
porté, mémoire spatiale, cerveau v1 (utility AI, actions et courbes dans les données), routine
jour/nuit, recherche de chemin, morts (faim, soif, froid, prédateur). Fiche personnage avec
action en cours, sa raison et les 3 meilleures options. Panneau « Tribu ». Rendu regroupé dans
`renderer/art/`. Tests séparés : `npm test` (~15 s) et `npm run test:long` (~17 min).

**Décisions et écarts validés :**
- La tribu s'éteint en moins de 100 ans (pas de naissances, chasse, réserves ni partage) :
  histoire légitime à ce stade, pas un défaut d'équilibre.
- Ajout du pissenlit et récolte des racines de carotte sauvage jusqu'à la fin de l'hiver
  (réalisme, pas filet de sécurité).
- Test d'équilibre de la faune sur la vraie carte 1024 (graines 42 et 7).
- **Pas de plafond de population imposé** (ce serait un quota) : si la simulation ne suit pas,
  le jeu ralentit et affiche la vitesse réelle.

**Dette technique :**
- Le système des humains déplace et nourrit les prédateurs qui attaquent : violation de la
  frontière entre systèmes → **résolu à l'étape 5** (mécanisme d'interaction commun).
- Feu et huttes rangés dans le système des humains → à déplacer dans les bâtiments (**étape 6**).
- Savoirs = simple liste dans `humans.json` → à remplacer par le système d'idées (**étape 10**).
- Pas de partage de nourriture, même avec les enfants → **étape 7** (vie sociale).
- Météo invisible sur la carte (seulement info-bulle et fiche) → à faire (polish).
- Les morts dans le journal ne sont pas des liens cliquables vers la personne → **étape 12** au plus tard.
- Seules les nouvelles variables ont leurs métadonnées → **résolu à l'étape 5**.

**Mesures (serveurs de Claude Code, indicatives) :** 120 humains : 91 ms/jour ; 1 020 : 342 ms ;
2 010 : 451 ms ; 5 010 : 1 358 ms. Repère : ~2 700 humains tiennent en x500. Les vraies valeurs
viendront du banc d'essai lancé sur le PC de Tanguy (étape 5).

---

## Étape 3 · Faune et flore — 17-18 nov. 2026

**Fait :** systèmes `flora` et `fauna` séparés de `world`. Une plante individuelle au plus par
tuile (tableaux typés), herbe = couverture du sol par tuile. 9 espèces animales individuelles
(cerf, aurochs, cheval sauvage, chèvre sauvage, sanglier, lapin, loup, ours, lion), troupeaux,
meutes, migrations, carcasses. Poisson = ressource par tuile d'eau. Panneau Statistiques
(courbes de population), suivi d'un animal par la caméra.

**Décisions et écarts validés :**
- Équilibre par règles individuelles : une femelle ne met bas que si son territoire n'est pas
  surpeuplé ; louve et lionne seulement si elles voient assez de gibier.
- Les ours ne chassent pas (baies, racines, poisson, carcasses).
- Les animaux connaissent le chemin vers l'eau dans un rayon de 250 tuiles.
- Journal : une mention de migration tous les 10 ans par espèce, continent et sens.
- Ressources fournies par plantes et animaux décrites dans les données, utilisées à partir des
  humains.

**Équilibre à affiner (Atelier des variables) :** chèvres et sangliers ×5-6 en 100 ans,
aurochs en déclin, chevaux qui s'effondrent sur certaines graines, loups peu nombreux.

**Mesures :** climat calculé à la demande (100 ans : 26,1 s → 2,4 s). ~15 000 animaux et
~280 000 plantes : 59 ms par jour de jeu.

---

## Étape 2 · Temps et données — 17 nov. 2026

**Fait :** calendrier (4 saisons de 10 jours, année de 40 jours), vitesses pause à x500,
saisons inversées nord/sud (la date affichée suit le nord), neige et sécheresse visibles,
années anormales régionales (sécheresse, hiver rigoureux, abondance ; ~1,3 par an), journal
causal (date, lieu, acteurs, causes), panneau Journal avec centrage de la caméra.

**Décisions et écarts validés :**
- Une année anormale dure une année de calendrier. Réglages dans `data/climate.json`.
- Noms de lieux descriptifs (« le grand continent ») en attendant les langues (étape 10).
- `data/time.json` : `daysPerSeason` + liste des saisons (la durée de l'année est réglée à un
  seul endroit).

---

## Étape 1 · Monde — 17 nov. 2026

**Fait :** carte 1024 × 1024, continents, îles, ceintures montagneuses, température (latitude,
altitude), humidité (vents, ombre pluviométrique), 14 biomes, rivières et lacs. Rendu par
morceaux, caméra, info-bulle, choix de la graine. Réglages dans `data/worldgen.json` et
`data/biomes.json`, expliqués dans `data/README.md`.

**Décisions et écarts validés :**
- Vents dominants zonaux uniquement (alizés, vents d'ouest, vents polaires).
- Circulation à grande échelle : équateur humide, tropiques secs, latitudes moyennes humides.
- Rivières qui naissent d'elles-mêmes ; cuvettes peu alimentées = bassins secs.
- Lacs et rivières = eau posée sur le terrain, pas des biomes.
- Pistes de réglage visuel : `coastWarpStrength` (côtes plus découpées), `noiseCelsius`
  (casser les bandes de biomes trop régulières).

---

## Étape 0 · Fondations — 17 nov. 2026

**Fait :** TypeScript strict, Electron, PixiJS, Vite, Vitest. Générateur aléatoire à graine,
horloge dans un worker. Test d'architecture qui interdit dans `src/sim/` Math.random, Date.now,
Electron, PixiJS et le DOM. `Lancer-GENESIS.bat` (Node portable si absent, `npm ci` si
dépendances changées) validé sous Windows.

**Décisions et écarts validés :** recompilation à chaque lancement (~1 s) plutôt que détection
des changements ; dépendances de développement `tsx` et `@types/node`.
