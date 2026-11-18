# GENESIS — Journal de développement

Mémoire du projet entre les sessions de Claude Code. **À lire en début de session, à compléter
en fin d'étape.** Les étapes les plus récentes sont en haut.

Chaque entrée contient : ce qui a été fait, les décisions et écarts validés, la dette technique
(raccourcis provisoires à reprendre plus tard, avec l'étape prévue), et les mesures clés.

---

## Étape 7 · Vie sociale (et préalables) — 18 nov. 2026

**Fait (préalables) :**
- **Fluidité en x1** : `renderer/life/glide.ts`. Quand un humain ou un animal change de tuile, son dessin
  glisse depuis sa position affichée jusqu'à la nouvelle, pendant la durée de son pas mesurée sur la vitesse
  réelle du jeu (`SimPace`, à partir de l'horloge envoyée par le worker). Marche animée (deux foulées et un
  petit rebond, les petits animaux sautillent) dans `art/human.ts` et `art/animal.ts`. Si un pas dure moins de
  40 ms (x100, x500) ou si le saut dépasse 4 tuiles, le dessin se place directement.
- **Banc d'essai** : mise en route de 15 ans de faune et de flore avant les humains (option
  `ecosystemWarmupDays` de `Simulation`), 20 jours mesurés par palier avec le jour le plus lent, test de rendu
  dans le jeu (`renderer/bench/render-test.ts` : carte entière, camp zoomé, forêt la plus peuplée ; x1 et
  x25 ; images/s moyennes et 1 % les plus lentes ; carte graphique via WebGL). `Benchmark-GENESIS.bat` lance
  désormais `npm run benchmark:game` : le jeu s'ouvre, fait le test de rendu puis le test de charge (processus
  séparé), écrit le rapport et se ferme. Le bouton de l'Atelier fait de même sans fermer. `npm run benchmark`
  (sans fenêtre) reste possible, sans test de rendu.
- **Chasse** : le gibier perçoit les humains (`fauna/human-fear.ts`, boucle sur les personnes, peu nombreuses) :
  un chasseur est remarqué à la distance de méfiance de l'espèce × la prudence propre de l'animal (tirée à la
  naissance), un passant à 40 % de cette distance ; plus il est proche, plus il est remarqué ; l'animal fuit en
  courant (`fleeSprintTiles`). Les prédateurs ne fuient pas (riposte : étape 11). Info-bulle « fuit les humains ».

**Fait (étape 7, `src/sim/systems/individuals/social/`, `data/social.json`) :**
- Relations (24 au plus par personne, tableaux typés) sur trois axes, liens familiaux (conjoint, parent,
  enfant, frère ou sœur), 3 raisons principales par relation avec leur date et l'événement du journal qui les
  explique ; les raisons s'estompent (les récentes et fortes restent) ; usure vers la valeur de base.
- Émotions (joie, tristesse, colère, peur, jalousie) et solitude, mises à jour chaque heure ; souvenirs
  marquants (13 sortes : deuil, rancune, gratitude, peur, amour…) qui s'estompent et entretiennent leur
  émotion (elle revient après une consolation) ; la personnalité évolue un peu (±0,25 au plus depuis la
  naissance). Nouveaux traits : générosité, colère facile, ambition.
- Conversations comme actions (`behavior: "converse"`) : bavarder, se réconcilier, se confier, consoler,
  séduire, se disputer. Elles changent les relations des deux côtés (charme des sociables, « qui se ressemble
  s'assemble »), peuvent tourner à l'accrochage (colériques, caractères opposés, faim), font circuler les
  nouvelles. Séduire mène au couple si l'affection est réciproque ; refus si pas d'attirance ; jalousie du
  conjoint qui voit la scène. Séparation si l'affection d'un conjoint s'effondre.
- Connaissance limitée (`news.ts`) : morts, couples, coins de nourriture loin du camp, dangers. Témoins dans un
  rayon de 10 tuiles, corps retrouvé par qui passe près pendant 15 jours, puis bouche à oreille ; chaque
  récit peut perdre un détail (cause, précision du lieu). Le deuil commence quand on apprend la mort.
- Partage (`behavior: "give"`) : nourriture portée donnée à un proche qui a faim, selon la relation, la faim,
  la générosité (les parents nourrissent leurs enfants en priorité) ; un outil en double à un ami qui n'en a
  pas. Gratitude (« Lo a nourri Ka (hiver de l'an 2) »).
- Ambitions (1 à 3) : se faire des amis, trouver un compagnon, exceller dans son métier (bonus aux actions qui
  exercent la compétence, champ `skills` des actions), regagner l'estime de quelqu'un (après une dispute).
- Journal : couples, grandes amitiés, brouilles, séparations, deuils, avec leurs causes. Fiche personnage :
  émotions, solitude, ambitions, relations cliquables avec valeurs et raisons, souvenirs datés, nouvelles
  connues. **Les personnes citées dans le journal sont cliquables** (dette de l'étape 4 résolue).
- `npm run sim` liste les événements sociaux. Tests : `tests/sim/individuals/social.test.ts` (15 scénarios),
  `tests/sim/fauna/human-fear.test.ts`, `tests/renderer/glide.test.ts`, test long `tests/long/social.test.ts`.

**Décisions et écarts (à valider) :**
- La vie sociale est un sous-dossier du système des individus (le design range relations, mémoire et émotions
  dans « l'Individu »), pas un septième système.
- L'interlocuteur n'interrompt pas ce qu'il fait (pas d'action « écouter ») : simplification.
- Attirance : pour l'autre sexe, sauf une part réglable (`couples.sameSexShare`, 5 %) attirée par le même sexe.
- Accrochages ajoutés pour que des rivalités naissent (sans eux, la tribu était harmonieuse sur toutes les
  graines : **défaut d'équilibre corrigé** par une règle individuelle réaliste).
- Peu de nouveaux couples : sans vieillissement (étape 8) presque tous les adultes de départ sont en couple ;
  les veufs reprennent un compagnon une fois le deuil apaisé. **Histoire légitime** à ce stade.
- Beaucoup de personnes ont l'ambition « se faire des amis » (0 à 3 amis hors famille après 2 ans) : réaliste
  pour une bande de 30, à surveiller quand la population grandira.
- La chasse réussit environ deux fois moins souvent (le gibier fuit) : **histoire légitime**, l'arc et
  l'expérience prennent de la valeur.
- Le test de rendu remplace le monde en cours par un monde de test (graine 42, valeurs par défaut), puis un
  nouveau monde est lancé.
- L'affichage montre le mouvement avec un pas de retard sur la simulation (le glissement suit la tuile atteinte).
- Après 15 ans de mise en route, la graine 42 compte ~12 400 animaux et ~281 000 plantes (pas tout à fait
  15 000 : le chiffre réel est écrit dans le rapport).

**Dette technique :**
- Dons d'objets rares (les outils sont surtout dans le stock commun) → règles de propriété, **étape 9**.
- Mensonges, secrets → plus tard ; enseignement des savoirs → **étape 10** ; violence → **étape 11**.
- Riposte des gros animaux chassés → **étape 11**.
- Les naissances (couples féconds) → **étape 8**.
- Le test de rendu n'a été essayé qu'avec un rendu logiciel (serveurs de Claude Code) : à valider sur le PC.

**Dettes résolues :** partage entre personnes (étape 4 et 6), personnes cliquables dans le journal (étape 4),
le gibier qui ne fuyait pas les chasseurs (étape 6 ; la riposte reste pour l'étape 11).

**Mesures (serveurs de Claude Code) :**
- Banc d'essai (graine 42, 15 ans de mise en route : ~12 400 animaux et ~281 000 plantes, 20 jours mesurés) :
  avant la vie sociale 120 / 510 / 1 020 / 2 010 / 5 010 humains = 103 / 216 / 348 / 577 / 1 434 ms par jour ;
  après l'étape 108 / 229 / 405 / 747 / 1 875 ms. Plafond conseillé en x500 : ~2 340 → ~1 790 humains.
- Coût de la vie sociale et de la fuite du gibier (`tsx`, sans mise en route) : tribu de 30 → ~0 à 4 ms par jour
  (dans le bruit de mesure, ~51 ms au total) ; 1 000 humains → ~+35 à +45 ms par jour (~357 contre ~320 ms).
  Le coût grandit plus vite que la population quand les camps sont serrés (2 000 et 5 000 humains : +30 %).
- Test de rendu : vérifié seulement avec un rendu logiciel (sans carte graphique) ; les vrais chiffres viendront
  du PC de Tanguy.
- Tests rapides : 342 en ~25 s. Tests longs : 9/9 (dont le nouveau test social) en ~13 min ; le test social
  relancé après les derniers réglages : réussi.

---

## Étape 6 · Production — 18 nov. 2026

**Fait :**
- Préalable (dette de l'étape 5) : le dernier preset chargé ou enregistré est retenu
  (`presets/.actif`, non versionné) et rechargé au démarrage avant le premier monde.
- Nouveau système `src/sim/systems/production/` et cinq fichiers de données : `knowledge.json`
  (23 savoirs des ères 0-1, **« Connu au départ »** réglable dans l'Atelier), `items.json` (43 objets),
  `recipes.json` (34 recettes), `buildings.json` (18 bâtiments), `production.json` (coutume, conservation,
  qualité, chasse, champs, sources du terrain). Validation croisée entre fichiers, métadonnées partout.
- Objets en piles (qualité, propriétaire : une personne ou le camp) ; structure des objets remarquables
  prête (vide). Les aliments se gâtent selon leur demi-vie et la température (×2 tous les 10 °C),
  moins vite dans une cache, plus vite en tas à l'air libre.
- Stock commun par camp (dans la cache, sinon en tas près du feu) : dépôt des récoltes, repas pris au
  stock (enfants compris). Les objets portés pour un travail ne sont pas redéposés.
- Recettes réellement exécutées : chercher entrées et outil au stock, aller au lieu (feu, fumoir, four,
  champ…), travailler (plus vite et mieux avec la compétence), produire. Récoltes : plantes, branches,
  arbres (hache polie), terrain (pierres, silex, argile, eau, blocs), gibier (lance, arc), poisson, champ.
  Chasse via le mécanisme d'interaction commun (la faune applique la mort : `fauna/hunted.ts`), ce que le
  chasseur ne peut porter reste aux charognards. Ouvrages longs interrompus repris plus tard.
- Compétences (12) qui progressent avec la pratique ; métier = compétence la plus pratiquée.
- Besoins collectifs selon la coutume, lus par chacun dans son cerveau : réserve de nourriture par saison,
  réserve de bois, places pour dormir, feu, cache, objets voulus par membre (planification sur 3 niveaux :
  objet → outil/ingrédient → atelier), ce qui pourrit d'abord (carcasse, peau), champs à semer. Chacun
  compte ce que les *autres* apportent déjà, pas son propre apport.
- Chantiers visibles avec avancement ; matériaux réservés par celui qui les apporte ; plusieurs bâtisseurs.
- Feu de camp et huttes déplacés dans ce système (dette de l'étape 4) ; le `Camp` des humains ne garde
  que le cœur du camp et le chemin du retour.
- Déplacement du camp par consensus des adultes (`individuals/camp-move.ts`) quand la distance moyenne de
  leurs recherches de nourriture dépasse un seuil ; journal avec causes (morts de faim récentes, année
  anormale) ; les chantiers de feu, huttes et cache qui suivent ont le déplacement pour cause.
- Affichage : `renderer/art/building.ts` (tous les bâtiments, chantier, tas de provisions),
  `life/building-layer.ts` (barre d'avancement), info-bulle et panneau d'un bâtiment (Maj+clic pour viser
  un bâtiment sous les gens), fiche personnage avec compétences, métier, objets portés. Journal :
  chantier commencé, construction terminée, premier objet d'un nouveau type, déplacement du camp.
- `npm run sim` : stock du camp, bâtiments construits, premiers objets, déplacements, causes de décès.
- Tests : `tests/sim/production/` (15 tests) et `tests/long/production.test.ts` (personne ne meurt de faim
  à côté de nourriture, variété des issues, chaîne complète d'une tribu de chasseurs).

**Décisions et écarts (à valider) :**
- Recettes ajoutées faute d'équivalent dans le design : « Extraire de l'argile », « Puiser de l'eau ».
  Certaines lignes du design sont scindées (couteau / racloir, fumer viande / poisson, jarre / bols).
- Simplifications de matériaux : feuillage compté dans les branches de la hutte, perches = branches,
  « pierre à polir » et « meule » = l'objet Pierres, « gros tronc » = 10 Bois. Carcasse = unités de
  10 viandes ; dépecer une unité donne viande, peau, os, tendons fixes.
- Une cache ne protège que la nourriture ; pierres et branches peuvent rester dehors.
- Une récolte de nourriture n'est jamais un ingrédient planifié (la cueillette, la chasse et la pêche ont
  leurs propres actions) ; exception : les graines pour semer, semées aussitôt.
- Le cueilleur préfère la nourriture qui se garde (`keepingPreference`), règle individuelle réaliste.
- Moins de survivants qu'avant sur certaines graines (6 : 17 sur 30 en 3 ans) : **histoire légitime**, les
  provisions portées ne sont plus éternelles ; chaque mort de faim survient stock vide et mains vides
  (vérifié par test long). Sur 12 graines, 17 à 30 survivants après 3 ans.
- Déplacements du camp rares (2 mondes sur 12 en 3 ans) : les sites de départ sont choisis pour leur
  abondance ; c'est l'épuisement (famine, recherches lointaines) qui fait partir.

**Dette technique :**
- Consensus de déplacement du camp → à reprendre dans le système de **groupes (étape 9)**.
- Savoirs = liste + « Connu au départ » → **système d'idées (étape 10)**.
- Donner à quelqu'un (partage entre personnes) → **étape 7**.
- Traire / tondre impossibles (pas de bêtes domestiques ni de capture) ; enclos, canal, palissade, mur,
  tombe, sanctuaire jamais voulus par la coutume pour l'instant → élevage, conflit (11), idées (10).
- Outils qui ne s'usent pas ; qualité d'un bâtiment sans effet ; pas de défrichage d'arbres pour un champ.
- Le gibier ne fuit pas les chasseurs humains et la chasse au gros gibier est sans risque → faune / conflit (11).
- Le reste d'un arbre abattu est perdu (pas de tas de bois au sol).

**Mesures (serveurs de Claude Code, `tsx`) :** 1 020 humains : ~355 ms par jour de jeu (342 avant
l’étape) ; tribu de 30 avec toute la faune et la flore : 74 ms par jour de jeu. Tests longs : 8/8 en 21 min. PC de Tanguy (banc d'essai du 18 nov., étape 5) : 1 020 humains
en 215 ms/jour, plafond conseillé ~4 000 humains en x500 — à refaire avec l'étape 6.

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
- Le dernier preset actif n'est pas rechargé au démarrage → **résolu à l'étape 6**.
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
- Feu et huttes rangés dans le système des humains → **résolu à l'étape 6**.
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
