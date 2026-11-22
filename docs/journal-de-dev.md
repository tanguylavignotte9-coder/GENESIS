# GENESIS — Journal de développement

Mémoire du projet entre les sessions de Claude Code. **À lire en début de session, à compléter
en fin d'étape.** Les étapes les plus récentes sont en haut.

Chaque entrée contient : ce qui a été fait, les décisions et écarts validés, la dette technique
(raccourcis provisoires à reprendre plus tard, avec l'étape prévue), et les mesures clés.

---

## v1.3 · Le Wiki en jeu — 22 nov. 2026

**Fait (aucun changement de `src/sim/` ni de `data/*.json` : seulement l’affichage, `data/wiki/` et les tests) :**
- **Socle** (`src/renderer/wiki/`) : fenêtre Wiki (F1 ou H, bouton « Wiki » de la barre d’outils ; l’ancienne aide
  `hud/help-page.ts` est supprimée) avec index par chapitres repliables, recherche sur tout le Wiki (titres, mots-clés,
  textes), liens, retour (← ou Retour arrière), accueil (⌂), bouton ↻ pour relire le monde. Modules : `model.ts` (pages et
  blocs, sans DOM), `markup.ts` (`[[lien]]`, `{var:fichier.json:clé}`, `**gras**`, `## titre`, `- liste`, `> encadré`,
  `{live:id}`), `content.ts` (validation des fichiers de `data/wiki/` par le schéma commun, messages en français),
  `library.ts` (toutes les pages, recherche, références), `render.ts` et `wiki-window.ts` (DOM).
- **Chiffres en direct** : `{var:…}` affiche la valeur de l’Atelier (modifications comprises) avec son unité
  (`values.ts`, pourcentage pour fractions et probabilités), légende au survol, encadré orange si modifiée. Le Wiki
  demande les valeurs (`workshopGet`, message déjà existant) à l’ouverture ; il reçoit ensuite chaque instantané de
  l’Atelier et ne reconstruit ses pages que s’il est ouvert (sinon à l’ouverture). Avant la première réponse : valeurs
  par défaut.
- **Pages générées** (`catalog/`) : une fiche par entrée de 24 listes de données (biomes, ressources, types de temps,
  années anormales, plantes, animaux, traits, compétences, actions, émotions, souvenirs, conversations, ambitions,
  maladies, régimes, règles de propriété et d’héritage, stratégies, valeurs culturelles, croyances, savoirs, recettes,
  objets, bâtiments) : liens « ce qu’il faut / ce que ça ouvre / d’où ça vient / à quoi ça sert » calculés depuis les
  données, puis toutes ses variables en direct (un identifiant devient un lien). Plus une page par fichier de données pour
  les variables qui n’appartiennent à aucune fiche. Le contenu est reconstruit depuis les valeurs de l’Atelier
  (`rawFromVariables`), aucun texte de fiche écrit à la main ; les mots des fiches sont dans `data/wiki/libelles.json`.
- **Chapitres rédigés** (écrits en lisant le code) : accueil, démarrer en 10 minutes, monde, temps, plantes et animaux,
  humain (besoins, corps, mémoire), cerveau, mouvement, production, vie sociale, famille et cycle de vie, groupes et
  pouvoir, écosystème, idées, conflit, lire une histoire, ce qui n’est pas encore simulé, glossaire ; et 18 pages d’écrans
  (raccourcis, légende, fiche, fiche animale, bâtiment, cerveau, gouvernance, groupes, idées, journal, Atelier,
  statistiques, généalogie, relations, politique, arbre des savoirs, suivis, sauvegardes).
- **Pages vivantes** (`live.ts`) : « Ma partie » (vue d’ensemble, tribus et régime avec boutons « Voir sur la carte » et
  « Voir dans le journal » (nouveau `JournalPanel.showFiltered`), cultures/langues/religions/biens d’échange, savoirs
  connus, espèces vivantes avec effectifs) et 10 encadrés « Dans ta partie » utilisés par les chapitres. Construites à
  l’ouverture d’une page ou sur ↻ (comptage des plantes à la demande : `PlantLayer.speciesCounts`), jamais à chaque image.
- **Boutons « ? »** : fiche humaine, fiche animale, bâtiment, cerveau, gouvernance, groupes, idées, journal, Atelier,
  statistiques, sauvegardes, généalogie, relations, politique, arbre des savoirs, suivis (`wiki/help-targets.ts`).
- **Déplacé dans le Wiki** : l’aide (touches → page « Raccourcis », description des panneaux → pages « écran ») ; la
  légende des couleurs du cerveau, de la gouvernance et de la carte politique (remplacées dans ces fenêtres par un renvoi
  au « ? ») → page « Légende ». L’Atelier garde ses variables et leurs légendes (ce sont les métadonnées que le Wiki
  réutilise) et gagne un lien « En savoir plus » par fichier (le chapitre dont `dataFiles` contient ce fichier).
- **Test de couverture** (`tests/renderer/wiki.test.ts`) : chaque dossier de `src/sim/systems/` a une page rédigée
  (`systems`), chaque fichier de données un « en savoir plus » (`dataFiles`), chaque variable de l’Atelier est documentée et
  affichée par une page générée (5 228), aucun lien cassé, aucune variable citée inconnue (pages rédigées, générées,
  chapitres, pages vivantes avec un monde factice), chaque encadré et chaque « ? » mène quelque part ; plus des tests du
  balisage, de la validation (fichier invalide refusé avec un message qui le nomme) et de la recherche.
- **Dette v1.2 résolue** : le test long « 1 000 humains en x500 » est relatif à la machine
  (`tests/long/support/calibration.ts` : calcul de référence sans code de simulation, meilleur de 5 essais, mesuré avant et
  après). Seuil : 18,5 références par jour de jeu (le budget de 960 ms sur un serveur où la référence prend ~52 ms) ;
  aujourd’hui 15 références.

**Écarts relevés en lisant le code :**
- La fin de partie (« recommencer » / « faire réapparaître une tribu ») du design n’existe pas : il faut lancer un nouveau
  monde. Écrit dans « Ce qui n’est pas encore simulé ».
- La république exige l’écriture, qui n’existe pas aux ères 0 et 1 : ce régime ne peut pas apparaître.
- Le poisson n’est pas fait d’individus (stock par tuile d’eau), contrairement au pilier 1 ; les objets remarquables ont
  leur place mais n’apparaissent pas.
- La carte des systèmes du design compte 6 systèmes ; le code a 8 dossiers (monde, flore, faune séparés ; individus).
- « Type de culture » : il n’y a pas de types fixes (les cultures naissent) ; les fiches portent sur les valeurs culturelles.

**Dette technique :**
- Les libellés des variables d’enregistrements montrent l’identifiant brut (« Densité de départ par biome : taiga »,
  « Préférence alimentaire : meat ») : ils viennent du catalogue de l’Atelier (`variables.ts`, dans `src/sim/`, non touché).
  → à reprendre avec la prochaine étape qui touche `src/sim/core`.
- Le `{var:}` d’un texte n’est vérifié que par le test (pas au lancement) : une faute de frappe s’affiche en rouge.
- Pas de page dédiée à l’indicateur de performance (F3) et au banc d’essai (une ligne dans « Raccourcis » et « Atelier »).

**Mesures :** construction du Wiki 80 ms (363 pages rédigées, générées et vivantes), reconstruction après un changement de
l’Atelier 43 ms (seulement si le Wiki est ouvert), première recherche 33 ms (index), puis quelques ms. Tests rapides : 635
(16 nouveaux pour le Wiki, 71 s au total). Tests longs : non relancés (rien de `src/sim/` ni de `data/*.json` hors
`data/wiki/` n’a changé), sauf le test de performance devenu relatif (passe). Essai dans l’affichage compilé (Electron sous
Xvfb, script hors dépôt) : F1, chapitre « groupes » (10 valeurs en direct, 2 encadrés), recherche « loup », fiche du loup
(54 valeurs), retour, page « Les tribus et leur régime », « ? » du journal, « En savoir plus » de l’Atelier : aucune erreur.

---

## v1.2 · Équilibre de l'écosystème (prédateurs, soif, pourriture, religion mesurée) — 22 nov. 2026

**Diagnostic d'abord (partie A, code de la v1.1, 10 graines × 50 ans, script de suivi hors du dépôt) :**
- **Loups et lions** : tous deux s'effondrent dans les 10-15 premières années dans les 10 mondes. Aucun n'est tué par
  les humains ; partenaires presque toujours présents ; peu de jeunes morts. La **faim** cause plus de la moitié des
  morts alors que des milliers de proies vivent sur la carte ; les derniers survivants meurent ensuite de vieillesse sans
  relève. Tableau (avant tout réglage) :

| Graine | Espèce | Éteinte vers | Morts (faim / vieillesse / maladie / froid / soif / chassés) | Jeunes < 2 ans | Dernières morts |
| --- | --- | --- | --- | --- | --- |
| 2 | loups | an 45 | 108 / 128 / 9 / 0 / 0 / 0 | 13 | vieillesse 6, faim 2 |
| 3 | loups | an 50 | 236 / 155 / 17 / 0 / 0 / 0 | 51 | vieillesse 5, faim 3 |
| 5 | loups | an 45 | 268 / 152 / 13 / 0 / 0 / 0 | 47 | vieillesse 7, faim 1 |
| 5 | lions | an 25 | 79 / 37 / 10 / 0 / 0 / 0 | 4 | faim 5, vieillesse 2, maladie 1 |
| 6 | lions | an 25 | 50 / 23 / 5 / 13 / 0 / 0 | 6 | faim 8 |
| 7 | loups | an 30 | 102 / 48 / 5 / 0 / 2 / 0 | 20 | faim 6, vieillesse 2 |
| 10 | loups | an 30 | 118 / 54 / 6 / 0 / 3 / 0 | 19 | faim 5, vieillesse 3 |
| 10 | lions | an 30 | 66 / 25 / 5 / 0 / 0 / 0 | 5 | faim 3, vieillesse 5 |

  Chaîne commune trouvée en trois temps : (1) un prédateur affamé sans proie à portée partait au hasard (24 tuiles dans
  une direction tirée au sort) : médiane de 0 proie à 16 tuiles à sa mort, souvent 0 à 40 tuiles, alors que le gibier
  abondait ailleurs ; (2) une fois le pistage ajouté, les morts de faim restaient massives : suivi heure par heure, des
  loups et lions restaient **jusqu'à 68 heures « en train d'aller à une charogne »** sans jamais manger — il fallait
  arriver à 0,12 tuile du centre de la nourriture, et les membres d'une meute autour d'une même carcasse se repoussent
  (espace personnel 0,6) ; (3) la chasse réussissait une fois sur deux, quel que soit l'état de la proie.
- **Soif** : presque toutes les victimes mouraient **à 2-5 tuiles d'une eau qu'elles connaissaient**, en « allant
  boire », souvent affamées. Suivi heure par heure (graine 5, an 27) : immobiles 14 h devant un obstacle (une eau « en
  vue » était approchée en ligne droite vers un point 4 tuiles plus loin, sans calcul de chemin). Second cas (graine 10) :
  camp à 10-15 tuiles de l'eau, on ne partait boire qu'à 70 % de soif, trop tard pour un corps affaibli. Les camps sont
  près de l'eau (1 à 3 tuiles) dans les autres mondes, la mémoire des points d'eau fonctionne.
- **Religion** : la cause des 93/48/38 % de l'étape 12 n'est toujours pas reproduite. Mesuré par décennie : la part sans
  religion monte à 80-95 % la décennie où une religion naît (presque personne n'y croit encore), puis retombe à quelques %
  en 10 à 20 ans (conversions). C'est ce qu'on voyait à l'étape 12 en fin de période dans les mondes où une religion était
  jeune. Aucun saut inexpliqué.

**Fait (partie A.3, mesure de la religion, aucune règle changée) :** `npm run sim` affiche la part d'adultes sans religion
par décennie (et le nombre de religions), la chronique des religions (naissances, adoptions, schismes, extinctions) et
les conversions / pertes de foi par décennie, avec une alerte « ⚠ Saut inexpliqué » si la part varie de 25 points sans
événement de religion dans la décennie. Une religion qui n'a plus aucun fidèle est racontée au journal (« … s'éteint »).

**Fait (partie B, correctifs au niveau de l'individu) :**
- **Prédateurs** (`fauna/behavior.ts`, `animals.json → behavior`) : le **pistage** du gibier (`trackTiles`) est codé mais
  désactivé (voir la dette) ; il **mange dès qu'il est sur la tuile** de la nourriture ; une
  **proie faible** (jeune, vieille, malade, santé < 50) est prise 3 fois plus facilement et choisie en priorité, une bête
  adulte en pleine force s'échappe plus souvent (`weakPreyFactor`, `primePreyFactor`, `weakPreyHealth`).
- **Pourriture** : une carcasse pourrit selon la température (demi-vie 4,3 jours à 15 °C, deux fois plus vite tous les
  10 °C, presque plus dans le grand froid : `carrion.*`) au lieu de 15 % par jour partout. La viande, le poisson et les
  carcasses gâtés dans un stock ou un tas sont jetés et laissent de la viande aux charognards (`scavengerMeat` dans
  `items.json`). Les humains mangeaient déjà en premier ce qui se gâte le plus vite ; aucune technique de conservation
  ajoutée.
- **Soif** : une personne qui voit l'eau **calcule un vrai chemin** pour l'atteindre ; aux abords du camp, l'envie de boire
  compte la soif qui viendra pendant la marche jusqu'à l'eau connue la plus proche (`thirstAnticipation`) ; en route, on
  boit à l'eau qu'on croise.
- **Découvertes (défaut de la v1.1 trouvé par la validation)** : seul le dernier métier de la journée comptait comme
  « essai », et un savoir dont le métier n'existe pas encore (la taille de la pierre avant tout artisanat) ne progressait
  presque pas : 3 découvertes en 75 ans dans 8 mondes sur 10, jamais de chasse ni de taille. Désormais chaque métier de la
  journée compte (`LifeState.skillsToday`), et tant qu'aucune recette du métier lié n'est accessible, tout travail sert
  d'essai. Sauvegardes : **format 7**.

- **Animaux bloqués sur une rive** : un animal visait une charogne ou une tuile où manger située de l'autre côté d'une eau
  (distance seule) et restait collé à la rive jusqu'à mourir de faim. Il ne vise plus que ce qu'il peut atteindre en ligne
  droite sur la terre ferme. Étendue aux proies et au pistage, cette vérification rendait les prédateurs si efficaces
  qu'ils anéantissaient le gibier (graine 1 : 190 loups, puis aurochs 0 et chevaux 20 sur toute la carte, puis plus aucun
  prédateur) : elle a été retirée pour les proies.

**Défauts trouvés et corrigés pendant le lot :**
- Un coût de la poursuite (faim gagnée à chaque pas de chasse) a été essayé puis retiré : il gardait les prédateurs
  presque toujours au-dessus du seuil de faim où ils n'ont plus peur des humains (scénario de test : 12 personnes tuées par
  des loups et des lions en 3 semaines au lieu de 1).
- Une anticipation de la soif comptée partout (même en expédition) faisait rentrer les guerriers boire au camp : elle ne
  vaut qu'aux abords du camp.
- La viande jetée passe par une méthode de la faune (`leaveCarrion`) : la production n'écrit pas dans les données d'un
  autre système (test d'architecture).

**Suivi de la v1.1 (partie C) :**
- **Évasions** : avec les règles actuelles, une bête capturée adulte et sauvage s'échappe très souvent (64 % au calme dans
  un enclos, presque toujours sans enclos), un jeune rarement (16 % bien nourri). Les 19 évasions sur 63 de la graine 4
  (dont 47 bêtes abattues avant d'avoir pu fuir) correspondent à ce mélange : plausible, rien changé.
- **Chasseurs qui cherchent à 30 tuiles** : vérifié par la validation ci-dessous (aucune famine, chasse découverte et
  pratiquée).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 75 ans** (code poussé, pistage désactivé, 4 calculs en parallèle, **21 min**). Lancée 5
  fois : les précédentes ont révélé le blocage des découvertes, la soif de la graine 10, les prédateurs bloqués sur les
  rives puis l'anéantissement du gibier par le pistage ; seule la dernière est donnée.

| Graine | Hab. fin (pic) | Morts | Faim | Soif | Froid | Prédateur | Maladie | Vieillesse | Violence | Tribus | Découvertes | Sans religion fin (max par décennie) | Élevage (captures / abattues / échappées) | Loups | Lions | ms/jour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 89 (89) | 53 | 9 % | 19 % | 0 % | 0 % | 25 % | 38 % | 6 % | 3 | 4 | 0/62 (0 %) | 0 / 0 / 0 | 8 | 0 | 135 |
| 2 | 71 (71) | 48 | 2 % | 4 % | 0 % | 0 % | 35 % | 54 % | 2 % | 2 | 5 | 0/47 (0 %) | 0 / 0 / 0 | 0 | 11 | 136 |
| 3 | 54 (55) | 49 | 6 % | 2 % | 0 % | 0 % | 37 % | 45 % | 4 % | 1 | 3 | 0/38 (0 %) | 0 / 0 / 0 | 0 | 24 | 132 |
| 4 | 134 (137) | 81 | 10 % | 6 % | 1 % | 11 % | 30 % | 38 % | 1 % | 3 | 9 | 1/84 (66 %) | 0 / 0 / 0 | 0 | 11 | 152 |
| 5 | 74 (74) | 79 | 11 % | 15 % | 0 % | 0 % | 51 % | 19 % | 0 % | 1 | 7 | 42/51 (98 %) | 0 / 0 / 0 | 0 | 0 | 158 |
| 6 | 0 (30) | 54 | 0 % | 0 % | 91 % | 0 % | 4 % | 4 % | 2 % | 0 | 2 | 0/0 (0 %) | 0 / 0 / 0 | 0 | 0 | 76 |
| 7 | 90 (94) | 53 | 4 % | 8 % | 2 % | 0 % | 45 % | 40 % | 0 % | 2 | 3 | 29/63 (81 %) | 0 / 0 / 0 | 0 | 0 | 172 |
| 8 | 72 (74) | 55 | 7 % | 9 % | 2 % | 2 % | 36 % | 35 % | 7 % | 2 | 4 | 0/53 (0 %) | 0 / 0 / 0 | 0 | 0 | 124 |
| 9 | 95 (103) | 104 | 22 % | 16 % | 0 % | 0 % | 46 % | 12 % | 0 % | 1 | 3 | 1/67 (65 %) | 0 / 0 / 0 | 0 | 25 | 143 |
| 10 | 9 (69) | 110 | 21 % | 41 % | 0 % | 0 % | 25 % | 12 % | 1 % | 1 | 4 | 0/7 (92 %) | 0 / 0 / 0 | 0 | 0 | 131 |

  Humains : graine 6 éteinte par le froid (91 % des morts ; ce pays froid perd ses habitants à chaque lot) ; graine 10
  réduite à 9 personnes, **41 % des morts de soif** (souvent déjà affamées). Ailleurs 54 à 134 habitants. Soif 2 à 19 %
  dans les 8 autres mondes. Découvertes : 2 à 9. Élevage : aucun monde en 75 ans. Sans religion à la fin : 0 à 2 % dans
  7 mondes ; graines 5 et 7 : 82 % et 46 % avec une religion née dans la dernière décennie (pas de saut inexpliqué).
  **Prédateurs : loups vivants dans 1 monde, lions dans 5.**
- Tests rapides : 619. **Tests longs : 12/13** : la mesure « 1 000 humains en x500 » donne 1 011 à 1 097 ms au lieu de
  960 ; le code de la v1.1, mesuré le même jour sur la même machine, donne 1 057 ms (serveur plus lent ce jour-là ; le
  lot coûte environ 4 % de plus). Seuil non modifié.

**Dette technique :**
- **Prédateurs, non résolu → v1.3** : les correctifs d'individu (repas sur la tuile, rives, proies faibles) ont supprimé
  des absurdités réelles, mais la dynamique reste en dents de scie : un prédateur plus habile épuise localement le gibier
  puis meurt de faim (le pistage, plus réaliste, faisait s'effondrer toute la faune : désactivé, `trackTiles` = 0). Il
  manque des freins réalistes, à essayer un par un sur 10 graines : seule la louve dominante met bas (une portée par an,
  selon son état), vigilance des troupeaux (une proie avertie fuit plus tôt), densité limitée par les territoires.
- **Soif** : 41 % des morts dans la graine 10 (camp loin de l'eau, gens affamés) ; l'anticipation au camp et le vrai
  chemin vers l'eau ont supprimé les morts « à deux pas », pas celles-ci.
- Mesure de performance à reprendre sur le PC de Tanguy (banc d'essai).

**Dettes résolues :** pourriture de la viande indépendante du climat (étape 12) ; morts de soif à quelques pas d'une eau
connue (v1.1) ; découvertes bloquées par les métiers impossibles à exercer (défaut de la v1.1).

---

## v1.1 · Correctifs (monde, peur et danger, vitesse et affichage, outils, bugs de l'étape 12) — 21-22 nov. 2026

**Fait (partie A, monde) :**
- **Rivières sans diagonale** (`world/hydrology.ts`) : l'eau ne s'écoule plus que par les 4 côtés d'une tuile ; une rivière
  oblique avance en escalier (test sur 5 graines). Débit d'une rivière relevé de 400 à 500 (`riverMinFlow`) pour garder une
  densité de rivières comparable (les rivières en escalier occupent plus de tuiles).
- **Flore et eau** (`flora-system.ts`, `growsInWater` dans `plants.json`) : aucune plante ne germe ni n'est placée dans le lit
  d'une rivière (ni dans un lac), sauf les espèces qui le permettent (le roseau).
- **Un dessin par espèce** (`renderer/art/plant.ts`, `shape` propre à chaque espèce) : chêne, bouleau élancé, épicéa,
  fromager à contreforts, acacia en parasol, ronce, myrtillier, figuier, tamaris, saule nain, carotte (ombelle), igname
  (liane), pissenlit (rosette), ortie, roseau, blé (épis), lin. Les baies, figues, épis… ne sont dessinés que s'il y a
  vraiment quelque chose à cueillir (`FloraSnapshot.fruit`, `FloraSystem.hasProduce`) : un buisson cueilli ou hors saison
  reste visible, sans fruits.

**Fait (partie B, peur et danger) :**
- **Crainte des humains par espèce** (`fauna/human-fear.ts`) : `calmShare` supprimé ; chaque bête sauvage fuit tout humain,
  chasseur ou passant, à la distance de son espèce (`humanFleeTiles`) multipliée par sa prudence individuelle. Les bêtes
  domestiques ne fuient jamais. Un éleveur qui approche doucement une bête pour la capturer n'est remarqué qu'à 30 % de la
  distance (`tamerShare`) : sans cela, la capture devenait impossible.
- **Peur mutuelle** : loups (8 tuiles), lions (7) et ours (5) évitent les humains, un peu plus un groupe ou un camp
  (+10 % par personne, jusqu'à 6), sauf s'ils sont affamés (même seuil que pour attaquer). Côté humains : nouvelle action
  **« Chasser un prédateur »** (`drive_off`, entrée `threatNearCamp`) : un adulte entouré des siens marche sur un prédateur
  vu près du camp (cris, feu, armes) ; il est alors remarqué de 2,5 fois plus loin, même par un prédateur affamé.
- **Fuir met à jour l'état** : le danger (affiché « Sécurité » dans la fiche, 100 − danger) ne retombait pas parce qu'il
  décroissait à chaque pas alors que le prédateur n'était relu qu'une fois par heure ; il ne baisse plus tant qu'un prédateur
  est en vue. L'émotion « peur » monte au moins à 60 % du danger (`sightFearShare`) puis retombe à son rythme. Le cerveau
  montre toujours le danger.

**Fait (partie C, simulation et affichage) :**
- **Vitesse purement visuelle** : test `tests/worker/speed.test.ts` qui rejoue la boucle du fil de simulation (paquets de
  ticks, reste fractionnaire en x1, tous les envois vers l'affichage, cerveaux suivis, fiches, arbre des savoirs) : même
  monde octet par octet après 3 jours en x500, en x5, en x25 et avec des changements de vitesse en route (dont x1). Rien ne
  divergeait. Garde-fou ajouté : la lecture par l'affichage (fiche, arbre) ne remplit plus les caches du jour du système
  d'idées (`IdeasSystem.displayRead`).
- **Plus de téléportation** (cause trouvée) : l'affichage estimait le rythme de la simulation par une moyenne lissée ;
  après une pause il devenait infini (courbes de 25 s), après un changement de vitesse il restait faux plusieurs secondes,
  le retard dépassait 4 tuiles et l'être était posé d'un coup. Désormais le rythme de la vitesse demandée est connu tout de
  suite (`MotionInfo.ticksPerRealSecond`), la mesure ne sert qu'à ralentir si l'ordinateur ne suit pas, une pause garde le
  rythme, et un retard se rattrape en glissant (un « saut » n'est plus que le déplacement propre de l'être en un pas).
- **Bâtiments fermés** (`enclosed` dans `buildings.json` : huttes, tentes, maisons, caches, greniers, ateliers,
  sanctuaire ; pas l'appentis ni le feu) : une personne immobile sur la tuile n'est plus dessinée ni cliquable ; la fenêtre
  du bâtiment liste « À l'intérieur » avec ce que chacun fait (clic = fiche), en plus du stock.
- **Bêtes domestiques** : collier rouge et robe pie (`FaunaSnapshot.domestic`).

**Fait (partie D, outils) :**
- **Atelier** : sections repliables, repliées au départ, bouton « Tout déplier / Tout replier » ; les lignes ne sont
  construites qu'à l'ouverture d'une section.
- **Découvertes progressives** (`ideas/knowledge.ts`, `knowledge.ponder` dans `ideas.json`) : le tirage quotidien devient un
  départ de réflexion (mêmes conditions : prérequis, milieu, besoin, aptitude) ; la personne avance chaque jour, beaucoup
  plus vite les jours où elle a exercé le métier lié (`lastSkill`), selon son aptitude et l'urgence du besoin ; elle peut se
  décourager (plus quand le besoin ne presse pas ou qu'elle n'a pas pu expérimenter), s'arrêter si quelqu'un du camp a
  trouvé ou si elle quitte le milieu. Journal : « X tient une piste vers la poterie » à mi-chemin, puis la découverte (qui a
  la piste pour cause), ou l'abandon après une piste. Fiche : « Réfléchit à : poterie », progression, état de chaque
  condition ; cerveau : groupe « Réflexion ». Sauvegardes : **format 6** (les anciennes sont refusées avec un message).
- **Arbre des savoirs** (touche **K**, `ideas/knowledge-tree.ts`, `hud/knowledge-tree-panel.ts`) : graphe en colonnes
  (profondeur des prérequis) des savoirs, recettes et bâtiments ; pour la tribu choisie : connu (vert), en cours de
  découverte avec qui et où il en est (orange), conditions réunies (bleu), hors de portée (gris) ; clic : explication
  (prérequis ✓/✗, besoin, milieu, métier, qui l'a découvert, ce qu'il ouvre).

**Fait (partie E, bugs de l'étape 12) :**
- **Sans religion** : la version exacte de l'étape 12 (8a62e53) rejouée 100 ans sur les graines 5, 7 et 10 avec un suivi
  par tribu donne 0/60, 0/97 et 1/58 adultes sans religion : les 93 %, 38 % et 48 % ne se reproduisent pas avec ce code.
  En validation v1.1, les taux élevés viennent d'une **religion née il y a peu** (graine 9 : culte de Haha né d'une
  révélation l'an 48, 5 croyants sur 35 adultes à l'an 50 ; les autres n'ont simplement pas encore été convertis) :
  histoire légitime. Aucun mécanisme de disparition d'une religion avec son fondateur n'a été trouvé. `validate.ts` donne
  maintenant la foi tribu par tribu (jamais croyants / foi perdue / religions).
- **Élevage** : suivi du devenir de chaque bête capturée (graine 4, code de l'étape 12) : 63 captures → 47 abattues, 19
  échappées, 1 morte de vieillesse ; aucune ne « disparaissait », mais seul le premier abattage était écrit au journal et
  compté. Désormais chaque abattage entre dans le bilan quotidien du troupeau, un troupeau dont le camp n'existe plus
  retourne à l'état sauvage avec une ligne au journal, et `FaunaSystem.domesticTally` compte tout (rapport et
  `npm run sim`). « Personne ne capture » : l'éleveur était vu comme un chasseur et les bêtes fuyaient avant qu'il les
  atteigne : approche douce (voir partie B).
- **Appelés à la guerre** : triés par force du moment (`life.strength`), plus par vigueur ; test où les plus vigoureux sont
  de carrure frêle.

**Défauts trouvés et corrigés pendant le lot :**
- La première version de la crainte des groupes (+35 % par personne, jusqu'à 8) repoussait les loups à 27 tuiles d'un
  camp : ils ne chassaient plus autour, finissaient affamés, donc sans peur, et attaquaient les buveurs isolés (graine 4 :
  25 attaques en 3 ans contre 0 avant). Ramenée à +10 % par personne (jusqu'à 6) : 0 attaque sur la même période.
- Même cause chez les lions (graine 2 : 12 morts par des lions contre 0 avant le lot) : un prédateur lâchait sa proie dès
  qu'il apercevait un humain. Désormais, occupé à chasser ou à manger, il ne s'écarte que d'un humain tout proche
  (`busyShare`, 35 % de sa distance) : 3 morts par prédateur sur la même graine.
- 5 tests dépendaient de la carte ou d'un hasard de trajectoire : couple qui marche (départ dans la foule), test du doute
  (graine choisie), test du sommeil (mains pleines), capture de chèvres, couple bilingue (l'épouse mourait de vieillesse).
- Le gibier qui fuit aussi les passants s'écarte d'un camp animé : un chasseur ne cherchait une proie qu'à 16 tuiles
  alors que le camp jugeait la chasse possible avec du gibier à 30 tuiles (incohérence : on voulait chasser sans jamais
  partir). Le chasseur cherche maintenant à 30 tuiles (`hunting.searchTiles`). Graine 42, tribu qui sait chasser : le
  cuir revient dans les 2 ans (test long). La chasse reste plus difficile qu'avant (79 bêtes en 3 ans contre 128) : c'est
  la conséquence voulue du gibier plus craintif ; la première année, la tribu passe moins de temps à l'artisanat (lance
  vers le jour 30) et en chassant les loups du camp.
- Le balayage de la peur des humains utilisait pour tout le monde le rayon de « chasser un prédateur » (38 tuiles) : il
  n'est plus utilisé que pour la personne qui chasse un prédateur (mesure de 1 000 humains revenue sous la limite).
- La propension à se mettre à chercher (`startFactor`) a été calibrée sur 3 mondes × 40 ans (ancien tirage : 4 découvertes
  par monde ; nouveau : 2 avec 3, 3 avec 6, retenu 8).

**Décisions et écarts (à valider) :**
- Un humain qui chasse le prédateur ne lui fait pas de mal (pas de blessure) : il le fait fuir. Un prédateur affamé
  n'évite plus les humains mais fuit encore celui qui le chasse.
- La « sécurité » de la fiche est l'inverse du danger existant (pas un nouveau besoin).
- Le joueur voit les fruits avec quelques jours de retard au plus (la flore est envoyée tous les 2 jours de jeu).
- Les personnes qui ne font que traverser une hutte en marchant restent visibles : « dans un bâtiment » = immobile sur sa
  tuile.

**Dette technique :**
- **Soif** : 35 et 37 % des morts dans 2 mondes sur 10 en 50 ans (graines 5 et 10, pays secs) ; sur la graine 10, le code
  d'avant ce lot donnait 24 % → **v1.2** (soif dans les pays secs, prévue).
- Les validations de l'étape 12 ne sont pas reproductibles avec le code commité : à l'avenir, noter le commit exact de
  chaque validation.
- Élevage : aucun monde ne découvre l'élevage en 50 ans (2 sur 10 en 100 ans à l'étape 12) ; à revoir sur 100 ans.

**Dettes résolues :** bêtes domestiques non distinctes (étape 12) ; « sans religion » (examiné : non reproduit, histoire
légitime) ; « élevage rare / bêtes disparues » (destin compté et raconté) ; appelés choisis par vigueur (étape 12).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 50 ans** (commit « Prédateurs : occupés à chasser… », avant l'allongement de la recherche
  du chasseur, qui n'a été vérifié que par les tests, 4 calculs en parallèle, **≈ 25 min**) :

| Graine | Hab. fin (pic) | Décès | Soif | Froid | Prédateurs | Tribus | Découvertes | Sans religion | Loups | Lions | ms/jour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 62 (63) | 36 | 22 % | 0 | 0 | 1 | 7 | 24/37 | 52 | 34 | 121 |
| 2 | 59 (59) | 26 | 0 % | 0 | 3 | 3 | 3 | 0/40 | 0 | 13 | 112 |
| 3 | 49 (50) | 27 | 7 % | 0 | 1 | 2 | 3 | 0/29 | 0 | 31 | 112 |
| 4 | 94 (94) | 38 | 13 % | 0 | 3 | 1 | 2 | 0/57 | 4 | 22 | 94 |
| 5 | 43 (54) | 52 | 37 % | 0 | 0 | 1 | 7 | 0/31 | 0 | 0 | 123 |
| 6 | 22 (30) | 35 | 3 % | 16 | 0 | 1 | 3 | 0/17 | 53 | 0 | 72 |
| 7 | 18 (35) | 45 | 4 % | 18 | 0 | 1 | 2 | 0/10 | 0 | 27 | 111 |
| 8 | 66 (66) | 38 | 3 % | 7 | 4 | 2 | 2 | 8/37 | 13 | 14 | 91 |
| 9 | 67 (69) | 43 | 21 % | 0 | 0 | 1 | 3 | 0/43 | 7 | 16 | 131 |
| 10 | 65 (67) | 38 | 32 % | 0 | 0 | 1 | 6 | 0/43 | 0 | 0 | 98 |

  Aucune extinction humaine (une première version de la validation, avant les corrections des prédateurs, avait vu la
  graine 6 s'éteindre de froid : même région froide qu'aux lots précédents). Graine 7 : 35 → 18 habitants, 18 morts de
  froid (pays froid, histoire légitime). Morts par prédateur : 0 à 4 par monde. Loups vivants dans 6 mondes, lions dans
  8. Découvertes : 2 à 7 par monde en 50 ans (vannerie, cuisson, terre crue partout ; chasse, pêche, taille, arc, pierre
  polie, conservation ailleurs). Élevage découvert dans aucun monde en 50 ans (aucune bête domestique). Sans religion :
  0 % sauf graine 1 (24/37 : culte de Yéfdo encore jeune, 13 croyants) et graine 8 (8/37 : la petite tribu des Paipon,
  née d'une scission, n'a pas de religion ; l'autre tribu croit à 29/30). Soif : 32 et 37 % des morts (graines 10 et 5,
  pays secs) → v1.2.
- Tests rapides : 609 (~2 min). **Tests longs : 13/13** (8 fichiers, 14 min). Jeu construit (`npm run build`) et vérifié dans
  Chromium (affichage compilé, sans Electron) : carte zoomée (plantes dessinées par espèce, lac sans plante), arbre des
  savoirs, Atelier replié ; aucune erreur dans la console.

---

## Étape 12 · Force individuelle, loups, élevage, HUD complet et validation de la v1 — 21 nov. 2026

**Fait (préalable force, `individuals/life/strength.ts`, `data/life.json → strength`) :**
- Chaque personne naît avec une **carrure** (1 = moyenne, écart type 0,15) héritée pour moitié de ses parents.
  Sa **force du moment** = carrure × sexe × entraînement × vigueur (âge, maladie, grossesse, estropié) × santé.
- Écart moyen entre les sexes réglable (`femaleGap`, 10 %) : l'écart entre les personnes est plus grand (une femme
  du quart le plus fort bat l'homme moyen, testé). **Entraînement** (0..1) : gagné par les heures de travail
  physique (chasse, dépeçage, construction, bûcheronnage, champs, pêche) et par les combats, perdu sans effort.
- La force pèse dans les coups (rixes, batailles) et dans la vitesse des travaux physiques ; la fiche l'affiche
  (« Force : 104 (dans la moyenne) · carrure robuste · entraînée »). Sauvegardes : **format 5**.

**Fait (partie 1, loups, `fauna/fauna-system.ts`, `fauna/territory.ts`) :**
- Diagnostic (script de suivi de chaque meute de départ) : les meutes placées avec peu de gibier dans un rayon de
  48 tuiles mouraient presque toutes ; celles près des troupeaux survivaient. **Correction à la création du monde** :
  une meute ne s'installe que là où vit assez de gibier pour élever ses petits (`breedingMinPrey` dans
  `preyCheckRadius`, les herbivores sont placés avant) et pas sur le territoire d'une autre (`spawnSiteAttempts`).
  Sans humains : 86 loups à l'an 5 au lieu de 48, morts de faim divisées par 3 sur 5 ans.
- Mais les loups s'effondraient encore vers l'an 10-15 (cycle prédateur-proie : à 58 % de faim alors que le gibier
  abonde ailleurs). **Une meute affamée dont le territoire est vidé de gibier déplace sa tanière** là où son meneur a
  trouvé des proies (`followTheGame`). Essais rejetés (aucun effet net) : ours privés de charogne ; viande qui pourrit
  3 fois moins vite (aide un peu, mais même effondrement).
- Les troupes de lions ne se tassent plus au même endroit au départ (pas là où une autre de leur espèce chasse).

**Fait (partie 2, élevage, `fauna/domestic.ts`, `production/husbandry.ts`) :**
- Les bêtes domestiques restent des animaux de la faune (`AnimalStore.ownerCamp`, `ownerPerson`, `homeX/Y`,
  `penned`, `tame`, traite et tonte) avec un propriétaire : le camp, ou la personne qui l'a capturée sous propriété
  familiale ou privée, puis son héritier ; elles suivent leur propriétaire s'il change de camp, retournent à l'état
  sauvage si leur camp n'existe plus.
- Avec le savoir « Élevage » et des bêtes domesticables autour (aurochs → bœuf, cheval, chèvre, sanglier → porc,
  loup → chien), le camp veut un **enclos** ; action « S'occuper des bêtes » (entrée `herdNeed` du cerveau) :
  **capturer** (jeunes de préférence, ×3 plus faciles et déjà à moitié apprivoisés ; un adulte peut se débattre),
  **nourrir** de fourrage (paille, céréales, racines) quand la pâture est rase, **traire** les femelles qui
  allaitent, **tondre** les chèvres, **abattre** le surplus (enclos plein) ou en temps de disette (vieux mâles
  d'abord) : viande, peau, os sans chasse. Les bêtes paissent autour de l'enclos, boivent à l'abreuvoir, ne fuient
  plus les humains, ne sont pas chassées, se reproduisent (petits nés apprivoisés), tombent malades, peuvent être
  tuées par un prédateur, **s'échapper** (peu apprivoisées, affamées, sans enclos) ou être **emmenées par des pillards**.
- Recettes « Traire », « Tondre », « Capturer une bête », « Abattre une bête », « Nourrir les bêtes » (remplacent
  « Traire, tondre »). Journal : captures, première bête abattue, fuites (causées par la capture), morts groupées par
  jour, bêtes volées (causées par la bataille). Fiche d'un animal : « Bête domestique (chèvre) de la tribu des … ».

**Fait (partie 3, HUD, `renderer/hud/`, `renderer/map/`) :**
- **Journal** : recherche, filtres par tribu, par personne (la fiche ouverte), par type d'événement, par période ;
  « Cause » cliquable : la **chaîne des causes** jusqu'aux origines. Les entrées portent leur type, leur jour et les
  tribus concernées (`JournalEntry`).
- Barre d'outils en bas à gauche (fenêtres `Overlay`, une seule ouverte) : **Généalogie** (T : aïeux sur 3
  générations, frères et sœurs, descendance sur 4, morts †, lignées éteintes, lignées des fondateurs), **Relations**
  (R : graphe des liens d'une personne et graphe des tribus : alliances, guerres, trêves, tributs), **Politique** (P :
  calques territoires, cultures, langues, religions, alliances et guerres, et tableau), **Suivis** (F : favoris
  marqués ☆ dans la fiche, gardés par monde, notifications de naissance d'un enfant, blessure, prise de pouvoir,
  mort), **Aide** (H ou F1), **Météo** (M : pluie et neige, 320 gouttes au plus, rien en dessous d'un zoom de 3 px).
- Statistiques : onglet **« Monde et tribus »** (`sim/history.ts`, un échantillon tous les 10 jours : population,
  réserves, savoirs, bêtes, régime ; courbes par tribu ou pour le monde, tableau).
- Un **exilé seul** est affiché « Camp d'exilé » et n'est plus compté comme une tribu (panneau, statistiques,
  `npm run sim`).
- Vérifié dans Chromium (Playwright, affichage compilé avec un faux pont Electron) : barre, journal, généalogie,
  politique, statistiques, aide s'affichent ; pas d'erreur dans la console.

**Défauts trouvés et corrigés pendant le lot :** un test de religion et un test de scission dépendaient d'un tirage
au hasard (graine choisie, familles prises jusqu'à 8 personnes) ; 63 % des bêtes capturées se seraient échappées
avant d'être apprivoisées (une bête jeune l'est déjà à moitié).

**Décisions et écarts (à valider) :**
- Force : 1 = homme moyen de 20-40 ans non entraîné ; la carrure est tirée sans tenir compte du sexe, le sexe est un
  facteur ; le choix des appelés à la guerre reste par vigueur.
- Bêtes domestiques : elles boivent « à l'abreuvoir » près de l'enclos (les éleveurs ne vont pas chercher l'eau) ;
  une bête sans enclos vit au cœur du camp ; le loup domestiqué devient un chien (sans produit pour l'instant) ;
  l'aurochs domestiqué est appelé bœuf, le sanglier porc. Le lait et la laine ne viennent que des espèces qui en
  donnent (`milk`, `wool` dans `animals.json`).
- Touches choisies selon le caractère tapé (AZERTY et QWERTY) ; « A » est déjà pris par la caméra (Q en AZERTY) :
  l'arbre est sur **T**.
- Les favoris sont gardés dans le stockage du navigateur d'Electron, par graine.
- `src/cli/validate.ts` : outil de validation (JSON des mesures d'un monde).

**Dette technique :**
- **Prédateurs, non conclu** : loups vivants à l'an 100 dans 3 mondes sur 10 (2 avant), mais **lions éteints dans 5
  mondes sur 10** (1 avant). Comparaison sans humains, graine 4 : lions vivants avec l'ancien code, éteints avec le
  nouveau ; graine 2 : bien mieux avec le nouveau. Piste : loups et lions se disputent les mêmes proies (cerf,
  cheval, aurochs, sanglier, chèvre) et des loups plus nombreux affament les lions là où les deux vivent ; autre
  piste : la viande pourrit vite (15 %/jour) quel que soit le climat. → équilibrage de l'écosystème après la v1.
- **Sans religion** : 38 %, 48 % et 93 % des adultes dans 3 mondes (0 à 3 % ailleurs, 0 à 4 % au lot précédent).
  Le système des religions n'a pas changé : à examiner (tribus fusionnées sans religion ? religion qui s'éteint ?).
- **Élevage rare** : découvert dans 2 mondes sur 10, bêtes vivantes à l'an 100 dans 1 seul (graine 4 : 86 captures,
  18 fuites, 3 bœufs à la fin ; le devenir des autres — abattage, prédateurs, maladie — reste à analyser) ; graine 5 :
  savoir connu sans aucune capture.
- **Soif** : 21 et 27 % des morts dans 2 mondes (0 à 13 % ailleurs). → à surveiller.
- Les bêtes domestiques ne sont pas dessinées autrement que les sauvages sur la carte.
- Validation faite sur 100 ans et non 200 (budget).

**Dettes résolues :** loups (en partie : placement de départ et tanière qui suit le gibier) ; élevage sans effet
(étape 10) ; météo invisible sur la carte (étape 4) ; personne seule comptée comme une tribu (étape 11) ;
« personnes cliquables dans le journal » (étape 4, fait depuis, causes maintenant navigables).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 100 ans** (4 calculs en parallèle, **33 min** ; 200 ans auraient pris ~1 h 30) :

| Graine | Hab. fin (pic) | Décès | Soif | Morts violentes | Tribus | Scissions | Fusions | Guerres | Captifs | Découvertes | Agriculture | Élevage | Bêtes | Cultures | Langues | Religions | Sans religion | Loups | Lions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 257 (257) | 113 | 4 % | 3 | 2 | 2 | 1 | 0 | 1 | 13 | oui | non | — | 1/1 | 1/1 | 1/1 | 2/163 | 33 | 43 |
| 2 | 163 (163) | 115 | 4 % | 8 | 2 | 6 | 5 | 0 | 0 | 11 | non | non | — | 2/3 | 2/3 | 2/2 | 0/103 | 42 | 0 |
| 3 | 40 (40) | 70 | 27 % | 4 | 1 | 5 | 4 | 0 | 0 | 7 | non | non | — | 1/2 | 1/1 | 0/0 | 0/23 | 7 | 0 |
| 4 | 173 (173) | 120 | 13 % | 3 | 2 | 7 | 6 | 0 | 0 | 19 | oui | oui | 3 bœufs | 5/6 | 3/4 | 1/2 | 1/105 | 0 | 0 |
| 5 | 86 (94) | 142 | 9 % | 2 | 1 | 11 | 11 | 1 | 2 | 13 | non | oui | — | 6/7 | 1/1 | 2/2 | 64/69 | 0 | 45 |
| 6 | 13 (31) | 67 | 0 % | 1 | 2 | 1 | 0 | 0 | 0 | 7 | non | non | — | 2/2 | 2/2 | 0/0 | 0/9 | 0 | 38 |
| 7 | 174 (176) | 115 | 10 % | 1 | 2 | 2 | 1 | 0 | 0 | 12 | non | non | — | 2/2 | 1/1 | 1/1 | 46/121 | 0 | 51 |
| 8 | 102 (103) | 111 | 21 % | 3 | 2 | 3 | 2 | 0 | 1 | 11 | oui | non | — | 1/1 | 2/2 | 2/4 | 0/63 | 0 | 66 |
| 9 | 102 (127) | 144 | 5 % | 3 | 1 | 3 | 4 | 0 | 3 | 13 | non | non | — | 2/4 | 2/4 | 1/1 | 1/76 | 0 | 0 |
| 10 | 165 (179) | 195 | 13 % | 0 | 3 | 5 | 3 | 0 | 0 | 13 | non | non | — | 4/4 | 1/1 | 3/5 | 48/101 | 0 | 0 |

  Aucune extinction humaine ; aucun camp d'exilé à la fin ; aucune conquête ni guerre civile ; raids dans 8 mondes
  (1 à 11). Régimes : bande égalitaire, conseil des anciens et chefferie partout, théocratie dans 6 mondes. Graine 6 :
  la tribu passe de 31 à 13 dans un pays froid sans jamais découvrir la chasse (40 morts de froid sur 67) : histoire
  légitime (même région qu'aux lots précédents). Graine 1 : 18 morts par prédateur sur 113, toutes avant l'an 40, dans
  un pays riche en loups et en lions (histoire du lieu ; 1 à 14 ailleurs). Bien d'échange : silex (5), panier (1).
  Fusions : toujours de petites tribus en difficulté qui rejoignent une voisine.
- **Calcul** pendant la validation (4 en parallèle) : 109 à 231 ms par jour de jeu selon la taille du monde.
- **Calcul (machine au repos, `tsx`)** : tribu de 30 → **111 ms** par jour de jeu (87 ms au lot 11) ; **1 020 humains
  (34 camps) → 797 ms** par jour (611 ms au lot 11 ; élevage, historique des statistiques et force en plus) ; 120 →
  211 ms, 510 → 444 ms, 2 010 → 1 450 ms, 5 010 → 4 514 ms. Plafond conseillé en x500 : environ 840 humains. À
  confirmer sur le PC de Tanguy (le banc d'essai fait foi).
- Tests rapides : 589 en ~65 s. **Tests longs : 13/13** (8 fichiers, 28 min).
---

## Préalable (croire ou ne pas croire), étape 10.5 · Cerveau visuel et étape 11 · Conflit — 20-21 nov. 2026

**Fait (préalable, `ideas/religion.ts`, `data/ideas.json → religion`) :**
- Nouveau trait **« Esprit critique »** (`independence`). Le **doute** d'une personne vient de son esprit critique, de sa
  curiosité et d'une faible spiritualité (`doubt()`). Il freine la conversion, use la ferveur (`doubtPerYear`), et un
  deuil ou une catastrophe peuvent éloigner du sacré (`griefDoubtChance`, `catastropheDoubtChance`) au lieu d'en
  rapprocher (réconfort de la foi chez ceux qui ne doutent pas).
- **Pression de l'entourage** (`faithPressure`) : plus forte dans une culture hiérarchique, plus faible dans une culture
  hospitalière, multipliée sous une théocratie. Elle aide les conversions par conformisme et **retient** les douteurs
  dans la foi (jamais au-delà) ; un fervent d'une société intolérante se méfie d'un incroyant (raison « impiety »).
- On tient à sa foi (`switchResistance`) : changer de religion est plus rare qu'en adopter une, et qui a perdu la foi
  se laisse moins facilement reconvertir (`lostFaith`).
- Journal : pertes de foi avec leur raison (deuil, catastrophe, doute ; un chef ou un chaman toujours), conversions
  d'une religion à une autre, retours à la foi, chefs qui se mettent à croire. Fiche : « Sans religion », « a perdu la
  foi », « doute du sacré ». `npm run sim` compte les adultes sans religion.

**Fait (étape 10.5, cerveau visuel) :**
- Humains (`individuals/brain-trace.ts`, `brain-describe.ts`) : la décision de la personne regardée est reconstituée
  avec les mêmes entrées et les **mêmes tirages** que la décision elle-même (stockés à chaque décision dans un tableau),
  sans rien tirer ni modifier : chaque action, chaque facteur (importance, entrées, traits, culture, ambition, hasard,
  habitude), voulue mais impossible, ou bloquée (savoir, âge). Un **historique des 20 derniers changements d'activité**
  est gardé pour chacun (`People.hist*`, quelques octets par personne) avec la raison (fini, dépassé, danger).
- Animaux (`fauna/brain-trace.ts`) : les règles de priorité (fuir, chasser, boire, manger, migrer, suivre, se
  promener, se reposer) avec ce qui pousse et retient ; historique des changements tenu pour l'animal regardé seulement.
- Gouvernance (`groups/decisions.ts`, `governance.ts`) : chaque décision des dirigeants est gardée (12 par groupe) avec
  les options pesées, ce qui a pesé (caractère du chef, situation) et la note quand l'option la mieux notée n'est pas
  retenue (inertie) : stratégie, propriété, héritage, régime, déplacement du camp, raids et guerres. Carte du soutien :
  chaque adulte et chaque clan colorés selon leur soutien, avec les raisons ; sources de mécontentement.
- Affichage : bouton « Afficher le cerveau » dans la fiche d'un humain et dans la nouvelle **fiche animal** (clic sur
  un animal), panneau en réseau SVG (survol = liens d'une action), détail des scores dépliable, historique ; bouton
  « Afficher la gouvernance » dans le panneau Groupes. Mise à jour 4 fois par seconde en direct.
- Test : même graine, cerveau d'une personne et d'un animal regardés ou non → même histoire (journal, positions,
  actions, faim, tirages suivants).

**Fait (étape 11, `src/sim/systems/conflict/`, `data/conflict.json`, système « Conflit » de l'Atelier) :**
- Mécanisme commun : chaque coup passe par `Interactions.attack` (motif `fight`, `defense` ou `predation`, contexte et
  causes) ; les individus appliquent la blessure ou la mort (nouvelle cause **« violence »**, tueur dans le journal),
  la vie (life) décide d'un handicap à vie (`wounds` : **estropié**, vigueur réduite, journal).
- **Rixe** (`brawl.ts`) : la vie sociale note les disputes (`quarrelLog`) ; une dispute tourne aux coups selon la colère,
  la colère facile, la prudence, la faim et la rancune ; coups échangés (rarement un coup mal placé) ; rancune durable
  (raison « assaulted »). Un meurtre est jugé par le groupe selon son régime : **exil** (vers une tribu qui accepte, ou
  fonder un camp avec les siens) ou pardon (un chef protège sa famille).
- **Vendetta** (`feud.ts`) : un meurtre crée ou nourrit une vendetta entre deux familles (proches et descendants) ; les
  proches peuvent jurer vengeance (nouvelle ambition « Venger un proche ») ; les enfants qui grandissent reprennent la
  vengeance de leur famille ; délai après un échec ; une vendetta sans sang depuis des années s'éteint.
- **Raid et guerre** (`war.ts`) : tous les 10 jours, les dirigeants pèsent faim, envie, prestige du chef, haine, autre
  religion, rapport de force, bravoure de la culture (décision notée dans la gouvernance, selon le régime) ; trahir
  une trêve, une alliance ou un tribut est possible mais rare et mémorisé. Chaque appelé décide de partir (obéissance,
  caractère, bravoure) ; la troupe emporte des provisions, se rassemble, marche (nouvelle action « Partir au combat »,
  entrée `warCall` du cerveau ; on dort sur place), le moral s'use et certains désertent ; bataille au camp ennemi avec
  ceux qui sont là pour le défendre.
- **Combat** (`combat.ts`) : vigueur, santé, compétence de chasse, meilleure arme portée ou prise dans le stock (lance,
  hache polie, arc, couteau), vêtement de cuir, palissade ou mur, combattre chez soi, nombre ; volée des archers
  d'abord ; le moral (culture, caractère, blessures, pertes) fait fuir bien avant l'anéantissement ; débandade ;
  poursuite (morts et captifs). Pillage d'une part des réserves ; captifs intégrés au vainqueur avec une loyauté faible ;
  conquête d'un vaincu écrasé (il devient un clan, `GroupsSystem.conquer`) ; effondrement d'une tribu sans adultes.
- **Diplomatie** (`diplomacy.ts`) : une tribu lasse de la guerre envoie un **émissaire** (sociable, qui parle la langue
  de l'autre) qui marche jusqu'à l'ennemi (action « Porter un message ») ; il peut ne pas être compris ; l'offre (paix,
  trêve, tribut si l'on est le plus faible) est acceptée selon la lassitude de l'autre et les trahisons passées ; mariage
  diplomatique possible ; une troupe déjà en route n'apprend la paix qu'en rentrant (« la nouvelle n'était pas encore
  arrivée »). Tribut versé chaque année pendant 10 ans.
- **Guerre civile** (`civil-war.ts`) : une contestation ratée (le groupe publie maintenant le prétendant et ses soutiens)
  dans une tribu sans légitimité peut tourner à la bataille ; vainqueur au pouvoir, prétendant battu chassé.
- **Palissades et murs** : une menace connue (guerre, raid récent, vendetta) fait vouloir un bâtiment de défense
  (`production/plans.ts`, `custom.urgency.defense`) ; la guerre pèse sur les régimes (facteur « war » : chefferie,
  dictature possibles).
- **Chasse risquée** : aurochs, sanglier, ours (désormais chassable) et autres peuvent riposter (`riposteChance`,
  `riposteDamage` dans `animals.json`) ; moins de risque à l'arc et avec de l'expérience ; « tué par un aurochs qu'il
  chassait », « estropié de sa lutte contre un aurochs ».
- Lisibilité : journal (rixes, meurtres, exils, vendettas, vengeances, raids, déclarations de guerre, batailles avec leur
  bilan, captifs, tributs, trêves, paix, émissaires, trahisons, guerres civiles, conquêtes) avec leurs causes ; carte
  (combattants avec bandeau rouge et lance, batailles marquées de lames croisées pendant 48 h) ; fiche (mission,
  estropié, victimes, ennemis personnels) ; panneau Groupes (guerre, trêve, tribut, trahisons entre tribus).
- `npm run sim` : compteurs du conflit, morts violentes, tribus en guerre, loups et lions en vie, récits (sans les rixes).

**Loups et lions (dette de l'étape 7.6) :** le cerveau visuel d'un loup mort de faim montre qu'il restait « se reposer »
ou « suivre son groupe » à 100 % de faim, faute de proie à portée, son meneur rentrant à la tanière, alors que les cerfs
et les chevaux étaient nombreux plus loin. Corrigé au niveau de l'animal : un chasseur affamé sans proie à portée **bat
la campagne** (`behavior.huntSearchTiles`, le meneur emmène sa meute). Mesures : sur 30 ans avec humains, les loups ne
déclinent plus vers zéro (graine 1 : 26 loups à l'an 30 contre 7 à l'an 25 avant ; graine 5 : 48 contre 22) ; mais en
100 ans les loups s'éteignent encore dans 8 mondes sur 10 (les lions dans 1 sur 10). Autre constat : **avec ou sans
humains, la moitié des loups de départ meurent de faim dans les 5 premières années** (population de départ trop forte
pour les territoires : 80 → 40), ce qui laisse peu de meutes, fragiles. Non conclu dans le temps de ce lot.

**Défauts trouvés et corrigés pendant le lot (au niveau des individus) :**
- Les troupes ne marchaient pas : elles allaient manger au camp, dormir dans leur lit, rentrer à la nuit tombée.
  Désormais chacun emporte des provisions (`raid.rationDays`, `ProductionSystem.takeRations`), dort où la nuit le
  surprend et ne « rentre au camp » pas en mission ; l'appel aux armes pèse plus, sauf la nuit.
- Conversions en va-et-vient (une même personne changeait six fois de religion en dix ans) : attachement à sa foi.
- Pertes de foi puis retour à la foi le lendemain : qui a perdu la foi résiste aux conversions.
- Un vengeur frappait sa cible tous les quelques jours (36 attaques pour une vendetta) : délai après un échec
  (`feud.cooldownDays`), coups plus dangereux (armes), nom du bon mort de la famille.
- Les captifs pris par les défenseurs vainqueurs étaient donnés aux assaillants vaincus (corrigé après la validation),
  et une expédition de guerre était racontée comme un raid (texte `warParty`).
- Élision des noms dans les blessures : « d’un coup d’Oudé » (et non « de Oudé »).

**Décisions et écarts (à valider) :**
- Le détail des scores n'est calculé que pour l'être regardé ; l'**historique des 20 derniers changements** est gardé
  pour chaque humain (quelques octets, aucun calcul) pour qu'il soit visible dès l'ouverture du cerveau. Pour les
  animaux, l'historique commence quand on ouvre leur cerveau. Si le jeu est en pause à l'ouverture, le réseau apparaît à
  la prochaine décision (il suffit de relancer le temps un instant) : une décision ne peut pas être recalculée en pause
  sans tirer au hasard.
- Le cerveau d'un animal montre ses **règles de priorité** (il n'a pas de scores comme les humains) : score = urgence
  quand la règle s'applique, 0 sinon.
- La fiche d'un animal est un petit panneau (clic sur un animal, qui reste suivi par la caméra).
- Une rixe ou une vengeance mortelle entre membres d'une même tribu est jugée (exil ou pardon) ; une mort au combat
  (raid, guerre, guerre civile) ne l'est pas et ne lance pas de vendetta : elle laisse des ennemis personnels et de la
  lassitude de guerre.
- Sexes : aucun avantage de force selon le sexe dans le combat (choix neutre et simple) ; les appelés sont les adultes
  vigoureux de 16 à 50 ans, sauf les femmes enceintes.
- Le pillage prend une part de **tout** le stock (comme une scission) ; le tribut aussi.
- Mariage diplomatique : un célibataire de chaque tribu (d'abord la famille des chefs) ; celui de la plus petite tribu
  rejoint l'autre.
- La guerre civile naît d'une contestation ratée lue dans le journal (le groupe y écrit le prétendant et ses soutiens).
- Ours ajouté au gibier (il riposte fort). Nouvelle cause de mort « violence » (9 causes) ; le texte « tué par un
  fauve » accepte un contexte (« qu’il chassait »).
- Sauvegardes : format 4 (les anciennes sont refusées).

**Dette technique :**
- **Loups** : éteints dans 8 mondes sur 10 en 100 ans (lions 1 sur 10). Pistes : population de départ trop forte pour
  les territoires (la moitié meurt de faim les 5 premières années, avec ou sans humains), partage des proies dans la
  meute, meutes qui ne quittent pas un territoire vide. → étape d'équilibrage de l'écosystème.
- **Bien d'échange** encore présent dans 7 mondes sur 10 (silex, os) : pas rare. → à rediscuter (est-ce souhaité ?).
- **Soif** : 27 % des morts dans un monde sur 10 (graine 10, tribu qui migre plusieurs fois dans un pays sec) ; 2 à
  10 % ailleurs. → à surveiller.
- Aucune conquête, aucune guerre civile en 10 × 100 ans : elles exigent des tribus voisines nombreuses et une
  légitimité effondrée (testées en scénarios). Les captifs n'apparaissent qu'à la poursuite de fuyards blessés.
- Les combattants de nuit dorment sur place sans abri (pas de froid pris en compte pour une troupe).
- Le cerveau visuel ne montre pas encore les « plans » d'ambition (le design en prévoit plus tard).
- Exil : quand aucune tribu n'accueille, l'exilé fonde un camp ; une personne seule compte alors comme une tribu.

**Dettes résolues :** chasse sans risque (étape 6) ; « rencontres entre tribus » et conflits (étape 9 : raids, guerres,
paix) ; palissades et murs jamais voulus ; régimes « guerre » impossibles (le facteur « war » existe maintenant) ;
loups et lions partiellement (les lions tiennent dans 9 mondes sur 10).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 100 ans** (4 calculs en parallèle, **29 min**) :

| Graine | Hab. fin | Décès | Morts violentes | Rixes | Meurtres | Vendettas | Raids | Guerres | Batailles | Traités | Tribus fin | Loups | Lions | Sans religion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 163 | 122 | 22 (18 %) | 585 | 4 | 2 | 19 | 2 | 23 | 1 trêve | 3 | 0 | 114 | 1 / 94 |
| 2 | 164 | 177 | 3 (2 %) | 561 | 3 | 2 | 3 | 0 | 3 | — | 2 | 35 | 43 | 4 / 105 |
| 3 | 0 | 50 | 1 (2 %) | 212 | 1 | 0 | 0 | 0 | 0 | — | 0 | 0 | 61 | — |
| 4 | 103 | 129 | 0 | 333 | 0 | 0 | 1 | 0 | 1 | — | 2 | 0 | 0 | 1 / 72 |
| 5 | 142 | 117 | 17 (15 %) | 340 | 12 | 3 | 7 | 1 | 8 | 1 tribut | 2 | 45 | 39 | 0 / 84 |
| 6 | 91 | 85 | 4 (5 %) | 272 | 4 | 0 | 0 | 0 | 0 | — | 1 | 0 | 39 | 1 / 55 |
| 7 | 180 | 158 | 2 (1 %) | 395 | 2 | 1 | 1 | 0 | 1 | — | 2 | 0 | 67 | 0 / 112 |
| 8 | 176 | 130 | 3 (2 %) | 482 | 3 | 2 | 1 | 0 | 0 | — | 2 | 0 | 20 | 2 / 124 |
| 9 | 124 | 156 | 4 (3 %) | 441 | 4 | 0 | 0 | 0 | 0 | — | 2 | 0 | 30 | 0 / 78 |
| 10 | 83 | 104 | 4 (4 %) | 233 | 2 | 1 | 1 | 1 | 5 | 1 paix | 1 | 0 | 65 | 1 / 50 |

  Graine 3 : la tribu s'éteint dans un pays froid (16 morts de froid, 13 tués par des bêtes, 9 déplacements de camp) :
  histoire légitime (même région froide qu'aux étapes précédentes). Exils : 0 à 2 par monde ; vengeances (tentatives) :
  0 à 41 (deux longues vendettas, graines 5 et 9) ; déserteurs : 0 à 49 (graine 1, nombreux raids) ; trahisons 0 à 2.
  Aucune conquête ni guerre civile. Cultures (vivantes/apparues) : 1/1 dans 6 mondes, 4/4, 2/3, 1/2, 0/1 ; langues :
  1 à 2 vivantes (2/3, 2/2, 1/2). Morts de soif : 2 à 10 % (27 % graine 10). Bien d'échange : silex (4), os (3), aucun (3).
- **Calcul (machine au repos, `tsx`)** : tribu de 30 → **87 ms** par jour de jeu ; **1 020 humains (34 camps) → 611 ms**
  par jour (étape 10 : 114 et 868 ms, mesurées dans d'autres conditions). Pendant la validation (4 calculs en parallèle) :
  70 à 300 ms par jour pour des tribus de 30 à 180 personnes.
- Tests rapides : 563 en ~45 s. **Tests longs : 13/13** (8 fichiers, 25 min ; dont le nouveau test long du conflit).

---

## Préalables (vie politique, soif) et étape 10 · Idées — 20 nov. 2026

**Fait (préalable soif) :**
- Diagnostic (chaque mort de soif enregistrée avec son contexte) : presque toutes les « morts de soif » touchaient des
  personnes à bout (faim 100, froid 100, fatigue 100). La cause retenue était la **dernière atteinte** (la soif blesse
  30 fois plus vite que la faim), pas ce qui avait usé le corps. Désormais chaque personne accumule ses atteintes
  (faim, soif, froid, maladie : `People.harm`) depuis qu'elle était en pleine santé ; la cause de la mort est la plus
  lourde (la maladie seulement si l'on est encore malade).
- Comportements absurdes corrigés au niveau des individus : un malade restait couché au bord de l'eau (`be_sick`), un
  épuisé dormait au lieu d'aller boire à quelques pas (`sleep`), un mourant de soif donnait à manger aux autres
  (`give`) : la soif retient désormais ces actions. Un affamé cherchait à manger jusqu'à une soif extrême puis
  n'atteignait plus l'eau : boire passe avant manger dès que la soif se fait sentir (poids 1,2 → 1,5).
- **Défaut ancien découvert** : la réserve de nourriture « par saison » lisait le signal des saisons (−1…+1) comme
  un numéro de saison : elle restait toujours celle du printemps et la tribu ne faisait **jamais de provisions
  pour l'hiver**. Corrigé (`ClimateState.seasonIndexAt`, saison de l'hémisphère du camp). La réserve de bois suit
  aussi les saisons (36 h de feu au printemps et en été, 96 h en automne, 120 h en hiver).
- En famine d'hiver, plus personne n'allait chercher de bois (la cueillette l'emportait, le bois ne se ramassait que
  de jour) : feu éteint, toute une tribu gelait en quelques jours (graines 3 et 6). Nouvelle action « Chercher du
  bois pour le feu » quand on a froid, que le feu baisse et que la réserve est vide.

**Fait (préalable vie politique, `src/sim/systems/groups/`) :**
- **Reproches aux dirigeants** (`opinion.ts`) : chaque mort de faim, de soif, de froid ou de maladie sous leur
  autorité fait perdre confiance et respect envers eux aux proches du mort (un peu aux autres), deux fois plus dans
  les 40 jours qui suivent un déplacement ou une migration qu'ils ont décidés (raison « blamed » dans la relation).
- **Favoritisme** : un chef peu généreux dispense sa famille des corvées ; ceux qui triment lui en veulent.
- **Esprit de clan** : on soutient davantage un dirigeant de son clan, moins celui d'un clan rival.
- **Rival plus capable** : sans crise, un ambitieux nettement plus apte que le chef (chef vieilli, affaibli) peut le
  défier ; la tribu suit qui elle préfère.
- **Crise de succession** (`succession.ts`) : à la mort d'un chef, chaque adulte suit le prétendant qu'il préfère ;
  si un second prétendant ambitieux a au moins 30 % des adultes, la succession est disputée : il l'emporte, ou
  s'incline, ou emmène son clan.
- **Fusion** : une petite tribu (≤ 20) en difficulté (morts pour sa taille, ou faim) cherche refuge même chez des
  voisins peu aimés quand elle est au plus mal ; un peuple hospitalier accueille plus volontiers.

**Fait (étape 10, `src/sim/systems/ideas/`, `data/ideas.json`, `data/knowledge.json`) :**
- Un seul mécanisme : une idée (`Idea` : famille, nom, origine — qui, quand, tribu, événement —, idée mère) est
  portée par des personnes (`PersonIdeas`, tableaux typés). Cultures, langues et religions : chacun porte un petit
  vecteur (valeurs, prononciation, croyances) hérité de ses parents avec une variation, qui dérive un peu chaque jour
  et que chaque conversation rapproche de celui de l'autre (`drift.ts`). Une tribu dont la moyenne s'écarte de celle
  des autres porteurs au-delà d'un seuil fonde une nouvelle culture, une langue fille ou une religion (schisme).
- **Savoirs** : les 23 savoirs sont des idées. Découverte par un adulte qui a le besoin (faim, froid, hiver à
  passer, gibier rare, famine…, mesurés pour lui et son camp), si le milieu s'y prête (silex, argile, gibier, eau,
  céréales sauvages… autour du camp) et selon sa curiosité, son application et sa pratique du domaine, une fois les
  prérequis connus ; jamais si quelqu'un du camp le sait déjà (on l'apprend de lui). Une même découverte peut être
  refaite ailleurs (« sans rien savoir de ceux qui l'ont trouvé ailleurs »). Apprentissage : parents et tuteur, ceux
  à qui l'on a parlé, ce qu'on a vu faire au camp, les étrangers croisés ; les enfants apprennent plus vite. Les
  bébés ne savent plus rien. Perte : quand plus personne du camp ne sait, raconté une fois avec le dernier détenteur.
  Le champ de bits `people.knowledge` est remplacé par les idées (`IdeaView.knowledge`).
- **Cultures** : 5 valeurs (partage, hiérarchie, hospitalité, bravoure, place des anciens). Le vécu les façonne
  (règle de propriété, façon dont on est gouverné, opinion des autres tribus, chasse, anciens) ; elles pèsent sur les
  actions (`values[].actions` : don, chasse, fuite) et sur les groupes (facteurs « hierarchy », « equality »,
  « eldersCustom », « sharing » des régimes et des règles, accueil d'une tribu en détresse, envie d'échanger).
- **Langues** : sons tirés au hasard (consonnes, voyelles, syllabes fermées, finales des femmes et des peuples), noms
  des personnes (uniques), des tribus (« la tribu des Tamuki ») et des lieux. Langue fille = quelques changements de
  sons. Fluidité par langue (3 au plus) : enfants, conjoint, contact avec des étrangers ; compréhension entre langues
  sœurs. Alliances plus lentes, trocs plus risqués (malentendus) sans langue commune ; interprète (journal).
- **Lieux nommés** (`core/toponyms.ts`, registre partagé comme le journal) : régions, monts, rivières (par leur
  embouchure), îles, nommés par la première tribu qui s'y installe ; `describeLocation` (désormais `(world, x, y)`)
  dit « le pays de Soro », « la vallée de la Tamu », « les monts Karak », « l'île de Mena ».
- **Religions** : aucune au départ ; naissent du deuil (ancêtres), d'une catastrophe (épidémie, famine, année
  terrible : esprits, forces de la nature) chez une personne très spirituelle (nouveau trait « Spiritualité »), ou
  d'une révélation (charisme et ferveur). Conversion par la conversation, ferveur des enfants, tiédeur sans fidèles
  autour, liens de la foi, chaman puis prêtre, lieu de culte voulu par les fidèles (sanctuaire, ou tombe mégalithique
  pour un culte des ancêtres qui sait bâtir en pierre), schismes. Atout « piété » pour la théocratie.
- **Échanges** : troc entre personnes de tribus différentes qui se croisent (3 regards par jour), selon l'opinion,
  l'hospitalité et la compréhension ; un objet durable accepté sans besoin parce que d'autres l'acceptent ; quand la
  moitié des adultes d'une tribu l'acceptent, c'est son bien d'échange (facteur « trade »). Coquillages ajoutés
  (plages, parure) comme bien possible.
- Les groupes adoptent la culture, la langue, la religion (majorité des adultes) et le bien d'échange de leurs membres
  (`groups/adoption.ts`).
- Lisibilité : panneau **Idées** (touche I : cultures avec leurs valeurs, langues avec leurs sons et des noms,
  religions avec croyance, rite et clergé, savoirs avec qui les a découverts, quand et pourquoi, échanges, lieux
  nommés) ; fiche personnage (savoirs et de qui on les tient, apprentissages en cours, culture et valeurs, langues
  et aisance, religion et ferveur, bien accepté) ; journal (découvertes avec leur contexte, savoirs perdus, cultures,
  langues, religions, schismes, chamans, premiers trocs, malentendus, interprètes, biens d'échange, crises de
  succession, adoptions d'une religion). `npm run sim` résume les idées.
- Tests : `tests/sim/ideas/ideas.test.ts` (10 scénarios), succession et reproches dans `groups.test.ts`, saison de
  l'hémisphère, test long `tests/long/ideas.test.ts`.

**Réglages pendant la validation :** cultures, langues et croyances changeaient trop lentement (aucune tribu séparée
ne s'éloignait des autres en 100 ans : écarts 0,03 à 0,1) : dérive individuelle plus forte, puis seuils abaissés
(culture 0,18, langue 0,22, religion 0,25) après mesure des écarts réels (plafond vers 0,17-0,21 après 40 ans de
séparation). Bien d'échange présent dans 9 mondes sur 10 : la confiance transmise par la conversation reste
maintenant sous celle de qui a vraiment troqué.

**Décisions et écarts (à valider) :**
- Les savoirs restent décrits dans `knowledge.json` (enrichi des conditions de découverte), passé dans l'Atelier sous
  le système « Idées » ; les conditions sont un besoin et un milieu choisis dans deux listes codées (15 besoins,
  13 milieux) : un nouveau besoin demande une ligne de code.
- Le troc n'a lieu qu'entre tribus : dans une tribu, les biens sont au stock commun et passent par les dons.
- Les rites n'ont pas encore d'effet propre (funérailles, fêtes) au-delà du réconfort des fidèles en deuil.
- Une tribu prend un nom de peuple dans la langue de son fondateur ; clans et familles gardent le nom du fondateur.
- Le premier récit d'installation reste descriptif (les lieux sont nommés juste après).
- `humans.json → names` (syllabes provisoires) est retiré : un preset qui le contient affiche « variable inconnue ».
- Sauvegardes : format 3 (les anciennes sont refusées).

**Dette technique :**
- Morts de soif restantes : des affamés et malades épuisés qui n'atteignent plus l'eau (histoire légitime, à
  surveiller).
- Cultures et langues nouvelles rares en 100 ans : il faut des tribus séparées longtemps, sans fusion → à suivre sur
  de plus longues parties.
- Élevage découvert mais sans effet (pas de bêtes domestiques) → étape d'élevage.
- Calcul des idées pour 1 000 humains (~70 ms par jour sous charge) : rencontres et apprentissage à alléger si besoin.

**Dettes résolues :** savoirs = simple liste (étapes 4, 6, 8) ; savoirs reçus à la naissance (étape 8) ; noms
provisoires (étape 4, 8) et lieux descriptifs (étape 2) ; vie politique trop calme et soif (étape 9) ; emplacements
culture/religion/monnaie des groupes (étape 9).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 100 ans** (4 calculs en parallèle, ~55 min ; faite **avant** les dernières corrections de
  la soif — sommeil, don, priorité à boire —, des seuils des cultures et langues et du bien d'échange) : **10 tribus de
  départ sur 10 en vie à l'an 100** (29, 56, 77, 78, 106, 112, 123, 158, 177, 238 habitants) ; 23 scissions, 14 fusions
  (6 mondes), 18 alliances, 14 contestations (2 mondes), 9 renversements (3 mondes), 9 crises de succession
  (6 mondes) ; régimes : bande, conseil des anciens, chefferie (4 mondes), théocratie (7 mondes).
- Savoirs (fin, sur 10 mondes) : taille de la pierre, chasse, cuisson, vannerie, pêche, pirogue partout ; pierre
  polie 9 ; conservation, terre crue, construction en pierre 7 ; arc, élevage 6 ; **agriculture 4**, tissage 4,
  mouture 3, poterie 3, irrigation 2, travail des peaux 1. 8 à 18 découvertes par monde ; 4 savoirs perdus en tout.
  Religions dans 10 mondes (1 à 3 nées, schismes ou rivales), cultures et langues : 1 seule par monde (corrigé ensuite).
- Causes des 1 419 décès : maladie 39 %, soif 23 %, vieillesse 18 %, froid 12 %, faim 3 %, en couches 3 %,
  prédateurs 2 %.
- **Contrôles après corrections** : graine 3 → soif 6 morts sur 77 (8 %, contre 37 sur 132) ; graine 4 → soif
  3 morts sur 129 (2 %, contre 43 sur 187), 163 habitants à l'an 100.
- **Calcul** (`tsx`, sous charge : 4 calculs en parallèle, donc pessimiste) : tribu de 30 → 287 ms par jour de jeu,
  dont **1,1 ms** pour les idées ; **1 019 humains (34 tribus) → 1 061 ms** par jour, dont **72 ms** pour les idées
  et 11 ms pour les groupes. **Machine au repos** : tribu de 30 → **114 ms** par jour (idées 0,7 ms) ; **1 019 humains →
  868 ms** par jour (idées 55 ms, groupes 9 ms ; à l'étape 9 : 686 ms avec un autre calcul en parallèle). Le budget de
  x500 (960 ms par jour de jeu) est presque atteint avec 1 000 humains : à alléger (rencontres, apprentissage) si le PC
  de Tanguy le confirme.
- Tests rapides : 510 en ~50 s. **Tests longs : 13/13** (dont le nouveau test des idées).

---

## Étape 7.6 · Sauvegarde, loups (reste de 7.5) et étape 9 · Groupes — 20 nov. 2026

**Fait (sauvegarde, `src/sim/core/save/`, `src/main/save-store.ts`) :**
- Le monde entier est copié tel qu'il est en mémoire (graphe d'objets : références partagées, tableaux typés en
  binaire, Map/Set dans leur ordre, classes retrouvées par une **liste de clés stables** `save/classes.ts`, jamais par
  `constructor.name` qu'une compilation minifiée peut changer). Rien n'est recalculé au chargement. Les rappels entre
  systèmes (interactions, vue des personnes par la production, `walkableTile`) sont déclarés `transientKeys()` et
  recréés par `afterLoad()`. Toute classe non déclarée ou fonction non déclarée fait échouer la sauvegarde avec un
  message clair (le test long rencontre toutes les classes d'un monde de 12 ans).
- Contenu : simulation complète (carte, flore, faune, humains, relations, objets, bâtiments, générateur aléatoire,
  horloge, groupes), journal, preset actif et valeurs des variables (rechargées dans l'Atelier, validées par les
  schémas actuels : message clair si elles ne sont plus valides).
- Format versionné `SAVE_FORMAT_VERSION` (actuellement **2**, passé de 1 à 2 avec les groupes et les territoires) :
  une autre version est refusée (« faite par une version plus ancienne / plus récente du jeu »).
- Fichier : ligne `GENESIS-SAUVEGARDE`, description en JSON lisible sans charger le monde (date de jeu, graine,
  population, preset, nom, date réelle), puis le monde compressé (gzip niveau 1, en tâche de fond). Écriture dans un
  fichier temporaire puis renommage (une coupure ne détruit jamais la sauvegarde précédente).
- Jeu : panneau **Sauvegardes** (bouton à côté de « Nouveau monde », touche F5) : sauvegarder sous un nom, charger,
  partager (copie dans `sauvegardes/partage/`, versionné), supprimer ; chaque ligne affiche date de jeu, graine,
  population, preset, date réelle, taille ; une sauvegarde incompatible est marquée et ne peut pas être chargée.
  Sauvegarde automatique toutes les 5 minutes réelles sur 3 emplacements tournants et à la fermeture du jeu
  (`time.json` → `autosave`, réglable dans l'Atelier ; la fenêtre attend la sauvegarde, 20 s au plus).
- `npm run sim -- --seed 7 --years 50 --save nom` puis `npm run sim -- --load nom --years 30` (aussi avec
  `--ecosystem`). `sauvegardes/` est exclu du dépôt sauf `sauvegardes/partage/`.
- Tests : copie du graphe (références partagées, classes, nombres spéciaux, tableaux qui partagent un tampon),
  refus en français, **monde sauvegardé puis rechargé = monde jamais interrompu, octet par octet** (rapide : petite
  carte, 6 mois ; long : vraie carte, an 12, un an de plus), format refusé, magasin de fichiers. Vérifié aussi dans
  le vrai jeu (Electron sous écran virtuel) : sauvegarder, recharger, sauvegarde à la fermeture.

**Fait (loups, défaut restant de l'étape 7.5) :** diagnostic à partir de sauvegardes « écosystème seul » à l'an 60
(graines 42, 7, 3) : les loups ne mouraient pas faute de gibier (70 à 140 proies à moins de 16 tuiles par loup) mais
**ne se reproduisaient presque plus** (0 à 6 naissances par an pour 28 louves adultes) : 91 % des refus venaient de la
règle de densité des herbivores (plus de 14 loups dans un rayon de 48 tuiles), le reste du gibier compté autour.
Comportements réels ajoutés (`fauna/territory.ts`, `group-life.ts`, `behavior.ts`) :
- **territoire de meute** autour d'une tanière (`territoryTiles` 20) : une meute plus faible cède la place et va
  s'installer plus loin ; le meneur revient vers sa tanière quand il s'en écarte ;
- **seule la louve dominante** (la plus âgée de la meute) d'une meute qui tient son territoire met bas, si elle est
  bien nourrie : remplace pour les loups la règle de densité et le comptage de proies ;
- **dispersion** des jeunes adultes (`dispersalPerYear` 0,5) qui s'apparient avec un autre solitaire (jamais avec
  une meute) et fondent une meute sur une terre libre ;
- **gros gibier préféré** (`bigPreyMeat` 15) : les petites proies (lapins) seulement faute de gros gibier à portée.
- Essais successifs (écosystème seul, 30 ans depuis l'an 60, 3 graines) : territoire seul → **pullulation puis
  extinction** (graine 7 : 64 → 235 loups, gibier épuisé, plus un loup à l'an 90) ; + louve dominante → stable mais le
  nombre de meutes baisse lentement ; + dispersion → **les loups oscillent sans s'éteindre** (graine 42 : 18 → 75 → 43 ;
  graine 7 : 48 à 86 ; graine 3 : 50 à 100). Retenu.
- **Pas concluant dans les mondes complets** : dans la validation (avec humains, depuis l'an 0, 100 ans), les loups
  s'éteignent encore dans 5 mondes sur 10 et restent rares ailleurs (5 à 32 au lieu de 63 à 91) ; lions éteints dans
  5 sur 10. Arrêté là comme demandé : à reprendre à l'étape 11 (riposte, conflit) ou dans une étape d'équilibrage
  (pistes : rythme de départ des meutes au début du monde, territoire plus grand, effet des chasseurs humains).

**Fait (étape 9, `src/sim/systems/groups/`, `data/groups.json`) :**
- Une seule classe `Group` pour les trois niveaux (tribu, clan, famille) : régime, dirigeants, anciens dirigeants
  (lignée), légitimité, mécontentement, propriété, héritage, stratégie, emplacements culture/religion/monnaie (-1),
  camp (tribus), souffrances récentes, tribus connues avec opinion et alliance. Appartenance : un groupe par niveau
  (`member`, tableau typé), soutien de chacun aux dirigeants de chaque niveau (`approval`), griefs (`grievance`),
  obéissance et obligation.
- Départ : la tribu (un groupe de niveau 0 par camp) et les foyers (couple et enfants). Les clans se forment tous les
  40 jours : foyers liés par le sang autour du plus âgé, ou autour d'un ambitieux et de ses amis ; un foyer sans clan
  rejoint celui auquel il est le plus lié. Les foyers suivent la vie (enfant chez qui l'élève, nouveau couple).
- Régimes : les 8 du design avec titre, nombre de dirigeants, façon de décider (consensus, conseil, chef), hérédité,
  poids des atouts (respect, prestige, âge, lignée, force, richesse), situations qui les favorisent (petit, nombreux,
  surplus, installé, anciens, rivalités, temps durs, froid) et conditions nécessaires (religion, écriture, commerce,
  territoire, guerre : pas encore simulées, donc monarchie, théocratie, oligarchie, république et dictature ne
  peuvent pas apparaître). Le régime de départ est celui qui convient le mieux ; une réforme le change quand un autre
  convient nettement mieux.
- Dirigeants : désignés parmi les adultes selon les poids du régime ; une bande ou un conseil est revu tous les 2 ans,
  un chef garde le pouvoir jusqu'à sa mort ou son renversement.
- Les dirigeants : **répartissent les obligations** (nourriture, bois, construction, artisanat, au prorata des besoins
  du camp, à qui le fait le mieux : facteur sur l'entrée correspondante du cerveau, si l'on obéit) ; **décident des
  déplacements et migrations** (remplace le consensus de l'étape 6 : même envie individuelle, plus forte après des
  morts de faim, de froid ou de maladie ; décision selon le régime ; migration lointaine, vers la chaleur si le froid a
  tué, après beaucoup de morts ; par grand froid seul qui a faim veut partir ; un clan qui n'obéit pas reste et fonde
  sa tribu) ; **fixent la stratégie** (facteurs sur les réserves et envies de la coutume) et **les règles de propriété
  et d'héritage** (selon leur caractère et la situation, avec une inertie). L'héritage suit la règle de la tribu
  (au conjoint puis aux enfants, aux enfants seuls, à l'aîné, au groupe).
- Obéissance : chance selon la légitimité, la relation au dirigeant et le caractère (ambition, colère, application).
- Légitimité = soutien moyen des adultes (respect, affection, confiance envers les dirigeants, parenté, régime adapté,
  griefs) ; mécontentement = griefs moyens (faim, froid, deuil d'un proche, maladie, ambition contrariée), lus en partie
  dans le journal (morts par cause).
- Vie politique (tous les 5 jours par groupe) : quand mécontentement − légitimité dépasse 15 (ou légitimité < 30), un
  ambitieux agit : le chef d'un clan qui rejette le pouvoir peut emmener son clan fonder une tribu ailleurs (**scission**
  : nouveau camp près de l'eau, sur le même continent, loin des autres camps ; part des réserves sauf si tout est en
  commun) ; sinon il **conteste** : s'il est préféré par la moitié des adultes il **renverse** le dirigeant (ses
  partisans le respectent davantage), sinon il perd la face.
- Entre tribus : rencontre quand des membres se voient (10 tuiles), opinion qui suit les relations des membres
  (négative au départ après une scission), **alliance**, **fusion** d'une petite tribu en difficulté dans une plus
  grande qu'elle estime (elle devient un de ses clans), **départ d'un individu** sans attaches vers une autre tribu.
- Ambitions nouvelles dans la fiche (`social.json`) : devenir chef, fonder son clan, fonder sa tribu, données par le
  système de groupes selon le caractère et la situation, jugées par lui.
- Lisibilité : panneau **Groupes** (touche G) : chaque tribu (couleur, clic = centrer sur le camp), régime et accès au
  pouvoir, dirigeants cliquables, jauges de légitimité et de mécontentement, membres, règles, stratégie, tribus
  connues, clans et familles (dépliables), tribus disparues. Fiche personnage : tribu, clan, famille, rôle, soutien,
  obligation, désobéissance. Carte : bannière de la couleur de la tribu et son nom (avec le nombre de membres)
  au-dessus du camp. Journal : formation, désignations, changements de régime et de règles, stratégie, contestations,
  renversements, scissions, fusions, alliances, départs, rencontres, déplacements, avec leurs causes.
- `npm run sim` : tribus, clans, régimes apparus, compteurs politiques et événements politiques datés.
- Tests : `tests/sim/groups/groups.test.ts` (tribu de départ, régimes impossibles, naissances, obligations,
  scission, contestation, fusion, déterminisme).

**Défauts trouvés et corrigés pendant la validation (au niveau des individus) :**
- Migration vers une terre tirée au hasard, inconnue de tous : 21 morts de soif et 11 de froid (graine 3). Une
  migration ne vise plus qu'un lieu de nourriture connu d'un membre.
- Migration décidée par un conseil affamé en plein hiver puis en fin d'automne : toute la tribu morte de froid en
  quelques jours (graines 6 et 7). Sous 8 °C au camp, ou si le froid est prévisible dans 10 jours (par les saisons), on
  ne lève pas le camp, même affamé : le froid tue en quelques jours, la faim en quelques semaines.
- **Morts de soif en masse** (60 à 95 par monde, effondrements) : après un déplacement du camp, chacun allait boire à
  l'eau de l'ancien camp dont il se souvenait. Une eau à portée de vue passe maintenant avant un souvenir lointain
  (`actions.ts`, défaut ancien rendu visible par des déplacements plus fréquents).
- Une tribu de 100 « migrait » dès 4 morts dans l'année et déplaçait son camp deux fois par an : les temps durs et le
  seuil de migration sont une **part des membres** (12 % et 15 %).
- Règles et stratégies qui changeaient d'une semaine à l'autre : inertie (`power.ruleInertia`).
- Vie politique figée (aucune scission en 100 ans sur 10 mondes) alors que les membres d'un clan soutenaient leur
  chef bien plus que ceux de la tribu : un chef de clan ambitieux peut partir quand l'écart dépasse 25 points.

**Décisions et écarts (à valider) :**
- La sauvegarde copie l'état en mémoire plutôt que de rejouer le monde : rapide et exact, mais **toute évolution de
  l'état de la simulation (nouveau champ, nouvelle classe, nouvelle variable) doit changer `SAVE_FORMAT_VERSION`** ;
  les anciennes sauvegardes sont alors refusées (pas de conversion).
- Sauvegarde automatique en **minutes réelles** (5 min) plutôt qu'en jours de jeu (en x500, une sauvegarde par jour de
  jeu ferait une sauvegarde par seconde). Elle ne se fait pas en pause.
- Le système de groupes appelle quelques méthodes du système des individus pour les actes physiques (`moveCampTo`,
  `foundCamp`, `joinCamp`) et de la production (`applyCampPolicy`, `shareStock`, `mergeCamp`) ; il lit le journal
  (morts par cause). Le test d'architecture couvre le dossier `groups`.
- Les familles ont le régime « conseil des anciens » (le seul permis au niveau 2), sans récit au journal.
- Une scission « par refus de suivre » (clan qui n'obéit pas au moment d'un déplacement) fonde une tribu sur place.
- Fusion : la petite tribu devient **un clan** de la grande (ses propres clans disparaissent dans ce clan).
- Héritage : la règle « au groupe » donne les biens au stock commun ; « propriété commune » : un clan qui part
  n'emporte que ce que ses membres portent.
- Le paramètre `campMoveText` de `humans.json` est retiré (le texte vient de `groups.json`) ; `campMove` reste (l'envie
  individuelle de partir).
- Les régimes « impossibles » à cette époque le sont par une condition nécessaire (`requires`) mesurée à 0 tant que
  religion, écriture, commerce, territoire et guerre n'existent pas.

**Dette technique :**
- **Politique encore calme** : en 100 ans sur 10 mondes, aucune contestation, aucun renversement, aucune fusion, aucun
  départ individuel vers une autre tribu (seulement en scénarios de test) ; le mécontentement (souffrances) reste
  sous la légitimité. Les scissions par loyauté (16) et les alliances (17) apparaissent. À rééquilibrer (griefs liés
  à la taille, aux querelles avec le chef, aux décisions contestées) → prochaine étape d'équilibrage ou étape 10.
- Rencontres entre tribus étrangères rares (les tribus nées d'une scission se connaissent déjà) → avec la carte
  politique (étape 12) et le conflit (étape 11).
- Morts de soif encore 19 % des décès (6 % à l'étape 7.5) → à examiner (sécheresses ? trajets ?).
- Loups et lions (voir ci-dessus) → étape 11.
- Culture, religion, monnaie : emplacements prévus dans `Group` (-1) → étape 10.
- Les noms de clan dans la phrase « les familles de Ka et Mi » ne font pas l'élision.

**Dettes résolues :** consensus de déplacement du camp (étape 6) et héritage par coutume (étape 8) remplacés par les
décisions et règles des groupes ; « coutume » des obligations remplacée par les obligations données par les
dirigeants ; défaut des loups de l'étape 7.5 partiellement (voir ci-dessus).

**Mesures (serveurs de Claude Code) :**
- **Validation, 10 graines × 100 ans** (et non 200 : budget de 45 min ; 32 min, 4 calculs en parallèle) :
  **10 tribus de départ sur 10 en vie à l'an 100** (49, 57, 69, 74, 82, 136, 137, 141, 148, 192 habitants ; pics 70 à
  192) ; 16 scissions (0 à 3 par monde), 17 alliances, 0 fusion, 0 contestation, 0 renversement, 0 départ individuel ;
  23 tribus au total dont **20 en vie** à la fin (1 à 3 par monde) ; 3 petites tribus issues d'une scission se sont
  éteintes (graines 3, 8, 9). Régimes apparus : bande égalitaire (10 mondes), conseil des anciens (10), chefferie
  (8) ; aucun autre (impossible à cette époque). Causes des 1 428 décès : maladie 37 %, vieillesse 20 %, soif 19 %,
  faim 14 %, froid 6 %, en couches 3 %, prédateurs 1 %.
- Sauvegarde : monde de 2-3 ans ≈ 78 Mo en mémoire → 14 Mo sur disque ; sauvegarder 0,13 s, compresser ≈ 0,45 s (en
  tâche de fond), recharger 0,06 s (+ décompression). Test long : an 12 rechargé identique octet par octet.
- **Calcul** (`tsx`, une autre simulation en parallèle, donc un peu pessimiste) : tribu de 30 → **114 ms** par jour de
  jeu, dont **0,2 ms** pour les groupes ; **1 015 humains (34 tribus) → 686 ms** par jour, dont **4,7 ms** pour les
  groupes (à l'étape 7.5 : 94 et 599 ms). Pendant la validation (4 calculs en parallèle) : 130 à 360 ms par jour pour
  des tribus de 50 à 190 personnes.
- Tests rapides : 465 en ~40 s. **Tests longs : 11/11** (27 min ; dont le nouveau test long de sauvegarde). Le test
  long social exigeait une « brouille » en 2 ans sur 6 mondes : il n'y en a plus aucune, alors qu'il n'y en avait
  déjà qu'une sur 3 mondes avant cette étape (comparé avec l'ancien code) ; il compte maintenant aussi les disputes
  inscrites dans les relations (ce qu'il voulait vérifier : les conflits existent).
- Loups dans les mondes de la validation (an 100, avec humains) : 0, 0, 28, 26, 32, 5, 17, 0, 0, 0 (63 à 91 au départ).

---

## Étape 7.5 · Déplacement naturel, écosystème — 19 nov. 2026

**Fait (déplacement naturel, `src/sim/core/motion.ts`) :**
- Humains et animaux ont une **position libre** (décimale), une **vitesse** (tuiles/heure) et une **allure**
  (immobile, marche, course). Les colonnes entières `x`/`y` restent : elles donnent la tuile sous les pieds.
- **Pilotage** commun : accélération et freinage (on s'arrête pile sur sa place), virages progressifs (le
  changement de vitesse par pas est limité), évitement doux des voisins (grille de voisinage, tampon sans
  fonction de rappel), jamais d'entrée dans l'eau (on glisse le long du bord). **Aucune trigonométrie** :
  directions dans une table de 16 vecteurs écrits en dur, seulement + − × ÷ et `Math.sqrt` (déterministe
  partout). Test : même graine = mêmes positions au dernier chiffre.
- **Chemins** des humains : A* sur la grille puis tracé en **lignes droites** quand la vue est dégagée et le
  terrain pas plus dur (`smoothPath`, `Terrain.clearLine`) ; ailleurs les coins sont arrondis (on vise le point
  suivant dès `cornerTiles`). Le chemin du retour au camp regarde 4 tuiles devant.
- **Vitesse** : terrain (forêt, broussailles, gué), marais, neige, pente, météo, force selon l'âge, fatigue,
  charge portée ; **course** pour fuir ou chasser (fatigue × 2,5).
- **Placement au repos** : chacun prend la **première place libre** d'un lieu (16 places en couronne autour du
  milieu de la tuile, puis 16 plus près) ; autour du feu, **un cercle** (puis un second rang). L'évitement
  s'efface près de sa propre place. Plus d'empilement (mesuré : 0 dormeur à moins de 0,15 tuile d'un autre).
- **Groupes** : un couple qui va dans le même sens marche **côte à côte** ; un enfant **suit** son parent un
  peu en retrait et de côté, et s'arrête à côté de lui ; chaque bête d'un **troupeau** a sa place autour du
  meneur et la rejoint quand elle s'en écarte ; une **meute** approche sa proie de plusieurs côtés puis freine
  dessus ; la meute mange autour de la carcasse.
- **Vraies distances** au lieu de « même case » / « case voisine » : conversations (`talkTiles`), dons,
  contagion, témoins, corps retrouvés, apprentissage en regardant, prédateurs (vigilance, isolement, attaque),
  chasse (portées 1,4 et 3,5 tuiles), chaleur du feu, gibier qui fuit. Restent en tuiles (logique de terrain) :
  territoire du camp, sources de matériaux, emplacements des bâtiments, territoire des animaux.
- Un chasseur humain qui **voit** son gibier lui court droit dessus (sans recalculer de chemin).
- **Affichage** : instantanés avec position décimale, vitesse et allure, envoyés **seulement quand un pas a eu
  lieu** ; le dessin suit une **courbe de Hermite** entre deux pas (départ avec la vitesse affichée, arrivée
  avec la nouvelle : trajectoires arrondies, pas d'à-coup). Humains de **face, de dos ou de profil** (miroir à
  gauche) selon la direction, marche et **course** (foulées plus rapides et plus amples) ; animaux tournés du
  côté où ils vont, course animée. Aux vitesses élevées, placement direct (inchangé).
- `npm run sim -- --ecosystem` : faune et flore seules, recensement tous les 10 ans, causes de mort.

**Fait (écosystème, corrections au niveau des individus) :**
- Mesure de départ (sans humains, 200 ans, graines 42 et 7) : **carotte, igname, ortie, roseau, blé et lin
  sauvages à 0 dès 20 à 50 ans**, myrtillier à 0 vers 150 ans. Cause principale : les herbes ne se
  renouvelaient pas (trop peu de graines pour une plante qui vit 1 à 3 ans), puis les ligneux prenaient
  chaque tuile libérée. Aurochs ×0,1 à 0,4, sangliers ×4,5, chèvres ×5, ours ×5.
- Flore : graines des herbes réalistes (25 à 50 par an) ; une herbe morte de vieillesse **ressème à ses pieds**
  (60 %) ; jeunes arbres et arbustes **étouffés par l'herbe haute** (prairies ouvertes) ; herbes qui lèvent mal
  **sous un couvert fermé**, sauf les plantes de sous-bois (`shadeTolerance` : ortie, myrtille, igname) ; une
  pousse lève mal **au milieu de sa propre espèce** (parasites propres à l'espèce, effet Janzen-Connell) ;
  **broutage** des jeunes ligneux ; ronce et myrtille mieux dispersées (oiseaux).
- Faune : **intervalle entre portées** (ourse 2 ans, lionne 1,5 an, lapine 8 jours…) ; **maladies animales**
  (`sickness` : rares, contagieuses entre bêtes proches de la même espèce, immunité ensuite ; elles circulent
  d'autant plus que la population est dense) ; territoire plus exigeant pour sangliers (8) et chèvres (10) ;
  un animal affamé cherche à manger **à pleine allure** ; une louve ou une lionne bien nourrie élève ses petits
  sans exiger 150 proies autour (60 et 50).

**Fait (petite correction) :** les affaires d'un mort loin du camp **restent au sol** (baluchon sur la carte),
la nourriture y pourrit ; qui passe à moins de 3 tuiles ramasse ce qu'il peut porter ; journal « X retrouve les
affaires de Y là où il est tombé : … » avec la mort pour cause (`production.ground`, `heritage.ts`).

**Défauts trouvés et corrigés en mesurant :**
- Dormeurs qui n'arrivaient jamais à leur couche (l'évitement des voisins les repoussait) : l'évitement s'efface
  près de sa propre place. Places « par numéro » trop serrées (dormeurs à moins de 0,15 tuile) : attribution de
  la première place libre.
- Calcul 2,6 fois plus lent au début : fonctions créées à chaque appel dans les boucles chaudes (grille parcourue
  sans rappel), évitement des animaux recalculé seulement quand ils réfléchissent (1 pas sur 4). Ramené à +30 %.
- Chasse humaine : le chasseur marchait jusqu'à la case du gibier, freinait, recalculait un chemin (0 prise
  contre 15 avec l'ancien code sur le même scénario) → il court droit sur le gibier qu'il voit (9 prises).
- Poursuites des fauves aussi efficaces qu'avant (0,60 cerf par essai contre 0,53), mais un fauve affamé
  « se promenait » à 60 % de sa vitesse : un animal affamé cherche à manger à pleine allure.
- **Tribus mortes de soif** (graines 3 et 5, en moins de 10 ans) : le point d'eau mémorisé était la tuile du
  feu, et toute personne allant au feu s'asseyait en cercle à 1,2 tuile, sans pouvoir boire. Le cercle ne sert
  plus qu'à se chauffer, dormir dehors, rentrer ou se réfugier ; arrivé sans eau, on oublie ce souvenir.

**Décisions et écarts (à valider) :**
- Le pilotage est dans `core/` (comme la grille de voisinage) : un seul code pour humains et animaux.
- Les animaux gardent un pas par heure de jeu (24 par jour) : leur mouvement est lissé à l'écran par la courbe
  de Hermite. L'évitement entre animaux est rafraîchi une fois tous les 4 pas (coût).
- Les rayons exprimés auparavant « en cases » (carré) deviennent des distances réelles (disque) : portées de
  chasse humaine et rayons de chasse des fauves agrandis pour couvrir la même surface. Territoires des animaux,
  sources de matériaux et bâtiments restent comptés en tuiles (logique de terrain).
- Les bébés portés suivent exactement leur porteur (pas d'évitement entre eux).
- `walkTilesPerHour` remplace `moveChance` des animaux (même valeur, en tuiles par heure) : un preset qui
  contient `moveChance` affiche « variable inconnue ignorée ».
- Les maladies animales n'ont pas de récit au journal (seulement la cause « maladie » dans les statistiques).
- Le test de rendu n'a été lancé que sous écran virtuel (rendu logiciel) : chiffres très pessimistes.

**Dette technique :**
- Pas d'animation sur place (s'asseoir, gestes de travail) → après la v1 (prévu par le design).
- Sentiers qui se creusent → après la v1.
- Les animaux ne contournent pas un obstacle par un chemin (ils glissent le long de l'eau) : suffisant pour
  l'instant, à reprendre si des troupeaux se bloquent derrière des lacs.
- **Prédateurs fragiles** (voir « Mesures ») → à reprendre avec le système de conflit / territoire (étape 11)
  ou une étape d'équilibrage dédiée.

**Dettes résolues :** les objets des morts loin du camp ne sont plus perdus (étape 8) ; défauts d'écosystème
identifiés à l'étape 8 (herbes éliminées par les arbres, faune qui gonfle).

**Mesures (serveurs de Claude Code) :**
- **Écosystème seul, 200 ans** (graines 42, 7, 3 ; `npm run sim -- --ecosystem`) :
  - Flore : **toutes les espèces vivent encore après 200 ans** ; les arbres progressent puis plafonnent vers
    150 ans (bouleau ~49 000) ; herbes : carotte 14 000, pissenlit 43 000, blé 11 000, lin 12 000, igname 5 000,
    ortie 3 200, roseau 3 800 (graine 42) ; déclin lent des herbes les premières décennies puis stabilisation
    (succession naturelle vers la forêt là où le climat le permet, prairies qui restent ouvertes).
  - Herbivores : tous présents, entre ×0,1 et ×3 de leur effectif de départ selon le monde et l'espèce, avec des
    fluctuations (chèvres en recul durable sur la graine 42 : ×0,1 à ×0,4 ; aurochs ×1 à ×3). Plus d'explosion
    continue (sangliers ×0,6 à ×2,3 au lieu de ×5 à ×8 ; ours ×1 à ×2,7 au lieu de ×4).
  - Causes de mort des herbivores : vieillesse 15-70 %, faim 9-53 %, prédateurs 3-42 %, maladie 7-17 %.
  - **Prédateurs : défaut restant.** Loups éteints dans les 3 mondes (vers l'an 120, 160 et 200), lions dans 1
    sur 3 (an 120) ; ours toujours présents. Ils meurent surtout de faim (45-70 %). Essai de portées réalistes
    (louve 3 à 6 petits) : pire (pullulation, épuisement du gibier puis effondrement en 80-110 ans), retiré.
- **Tribu, 10 graines × 100 ans** (et non 200, pour tenir le budget de 45 min ; `npm run sim`) :
  8 survivent (55, 63, 77, 84, 86, 95, 106, 107 habitants ; pics de 78 à 119 vers l'an 70-90, puis plateau),
  2 s'éteignent : graine 6 vers l'an 45 et graine 3 vers l'an 85, toutes deux dans le froid nord-ouest
  (faim chronique, épidémies « affaiblis par la faim », famines, morts de froid, camp jamais déplacé).
  Causes de décès (1 513 morts sur les 10) : maladie 51 %, faim 24 %, vieillesse 15 %, soif 6 %, en couches 2 %,
  froid 2 %, prédateurs 0,2 %. Mortalité avant 1 an 3 à 12 % (toujours un peu basse), avant l'âge adulte 24 à 50 %.
  À l'étape 8 (200 ans) : pics puis déclin au 2e siècle faute de racines et céréales ; ici plus de déclin.
- **Calcul** (`tsx`, sans mise en route, sans autre calcul en parallèle) : tribu de 30 → **94 ms** par jour de jeu
  (65 avant l'étape, +45 % : surtout le déplacement des animaux) ; **1 000 humains → 599 ms** (505 avant, +19 %),
  sous les 960 ms d'un jour en x500. Pendant la validation (4 calculs en parallèle) : 131 à 182 ms par jour pour
  des tribus de 60 à 110 personnes.
- **Test de rendu** du banc d'essai, sous écran virtuel **sans carte graphique** (rendu logiciel) : carte
  entière 60 images/s (1 % les plus lentes : 59 en x1, 51 en x25) ; camp zoomé 21 / 18 images/s (x1 / x25) ;
  grande forêt zoomée 20 / 17. Ancien code dans les mêmes conditions : 60 ; 22 / 19 ; 21 / 19 (même ordre).
  Les vrais chiffres viendront du PC de Tanguy.
- Tests rapides : 414 en ~50 s. **Tests longs : 10/10 en 21,6 min** (dont l'équilibre sur 100 ans qui vérifie
  aussi la variété des plantes).

---

## Étape 8 · Cycle de vie — 19 nov. 2026

**Fait (`src/sim/systems/individuals/life/`, `data/life.json`) :**
- **Population extensible** : `People`, `SocialState`, `LifeState` et les tableaux de la production grandissent
  par doublement à chaque naissance (`core/columns.ts` : on ajoute à chaque tableau celui d'un magasin neuf, qui
  porte les valeurs par défaut). Les membres d'un camp sont une liste de vivants (`campMembers`), plus une plage
  d'indices contiguë.
- **Naissances** (`birth.ts`) : chaque jour, une femme qui vit avec son compagnon peut concevoir selon la
  fécondité des deux (courbes d'âge), sa santé, la faim de ses derniers jours (moyenne glissante, la famine
  empêche de concevoir), l'allaitement (espace les naissances) et l'envie du couple (affection mutuelle,
  sociabilité, petits enfants déjà là, souvenir de famine). Grossesse de 30 jours (faim et fatigue en plus,
  fausses couches plus fréquentes si la mère a faim ou est malade). Accouchement : mort-né ou mort de la mère
  plus probables pour une mère très jeune, âgée, affaiblie ou affamée. Le bébé hérite de la moyenne des traits
  des parents (50 %) avec variation, reçoit un nom, les savoirs de ses parents, ses liens familiaux ; le journal
  cite l'union des parents comme cause.
- **Petite enfance** : le bébé (moins de 2 ans) est porté (comportement `carried`), allaité jusqu'à 3 ans par sa
  mère ou une nourrice (coût en faim pour elle, lait tari après des jours de famine), nourri par son porteur ou
  au stock sinon ; il partage la chaleur de qui le porte.
- **Enfance** (jusqu'à 14 ans) : un tuteur (la mère, puis l'autre parent, puis qui recueille l'orphelin) ; les
  parents nourrissent en priorité leurs enfants et ceux qu'ils ont recueillis ; l'enfant suit son parent
  (`follow_guardian`), revient près du camp, cherche à manger seulement autour de lui et n'explore jamais, joue
  (`play` : joie, solitude apaisée, amitiés d'enfance), apprend en regardant un adulte travailler (un quart d'heure
  de pratique par heure, sans compter pour le métier). La personnalité d'un enfant est 3 fois plus marquée par
  ses souvenirs (famine, deuil, réconfort, gratitude) et peut s'écarter davantage de ses traits de naissance.
- **Orphelins** (`orphans.ts`) : l'autre parent prend le relais ; sinon, chaque jour, celui qui a appris la mort
  et a le plus envie de recueillir l'enfant le fait (famille d'abord : grands-parents, oncles et tantes, aînés ;
  puis affection pour l'enfant et pour le défunt ; générosité ; enfants déjà à charge). Personne si nul n'en a
  assez envie. Un bébé qui perd sa mère peut être pris au sein par une femme qui allaite.
- **Vieillissement** (`aging.ts`) : forces selon l'âge (vitesse, endurance, vitesse de travail), appétit selon
  l'âge (un enfant mange moins), mort de vieillesse (loi de Gompertz, 3 %/an à 60 ans, doublement tous les 8 ans),
  respect des anciens qui grandit chaque année avec leur savoir-faire.
- **Maladies** (`disease.ts`) : fièvre, dysenterie, mal de poitrine (données). Apparition favorisée par le froid
  et la faim, contagion par la proximité, gravité selon l'âge (tout-petits et vieillards), la faim et le froid ;
  guérison puis immunité ; un malade se repose et ne guérit pas de ses blessures. **Épidémie** : un récit du
  journal quand assez de malades d'une même maladie en même temps (avec les causes : année difficile, famine),
  et sa fin avec son bilan. **Famine** : récit quand plusieurs morts de faim se suivent.
- **Héritage** (`heritage.ts`) : objets au conjoint, sinon partagés entre les enfants, sinon au stock du camp ;
  rien si le corps est loin du camp. Souvenir durable du défunt (`lostOne`) chez ceux qui l'ont connu.
- **Lisibilité** : morts de vieillesse, de maladie (« affaibli par la faim »), en couches, causes reliées
  (épidémie, famine, année difficile, naissance, orphelin) ; naissances, mort-nés, orphelins recueillis, héritages.
  Fiche : âge et étape, date de naissance, santé, maladie (attrapée auprès de qui), grossesse, allaitement,
  tuteur, forces, **arbre familial cliquable** (parents ; la personne, son compagnon, frères et sœurs ; enfants).
  Statistiques : onglet Humains (courbe, pyramide des âges, causes de décès). Panneau Tribu : les vivants.
- `npm run sim` : naissances, mortalité infantile, âges au décès, épidémies, famines, orphelins, population et
  temps de calcul tous les 10 ans, événements du cycle de vie ; s'arrête quand la tribu s'éteint.
- Tests : `tests/sim/individuals/life.test.ts` (23 scénarios), test long `tests/long/life.test.ts`.

**Corrections d'équilibre faites au niveau des individus (défauts trouvés en mesurant) :**
- Un jeûne tuait en 12 jours : `starvationDamagePerHour` 0,25 → 0,1 (plusieurs semaines, comme un vrai corps).
- Un corps endormi brûle moins (`sleepHungerFactor` 0,6) ; un enfant mange moins qu'un adulte (`childAppetite`).
- **Cueillette** : en hiver, plus de 1 000 racines restaient à moins de 25 cases pendant que 60 à 90 % de la
  tribu était affamée. Deux causes : tous couraient vers le même buisson (chacun voit maintenant où vont les
  autres : `pickers` dans la production), et chaque bouchée prise sur une plante (humain ou animal) était
  arrondie à l'unité supérieure (`flora.eaten` passe en centièmes d'unité).
- Coutume de réserve plus prévoyante avant l'hiver (`foodReserveDaysBySeason` [2,3,6,4] → [3,8,14,6]).
- On gelait assis contre un feu allumé par grand froid : au coin du feu on ressent au moins 16 °C
  (`camp.besideFireCelsius`).
- Contagion et gravité des maladies réduites après les premiers essais (une dysenterie tuait 19 personnes sur 30
  la première année) ; fragilité des nouveau-nés relevée (mortalité infantile trop basse pour l'ère 0).
- Pour le bois, on épargne les buissons qui nourrissent et les plantes déjà abîmées (`work.spareFoodPlants`).
- Les prédateurs étaient la 1re cause d'extinction (24 à 49 morts par monde) : un fauve n'attaque plus un humain
  seul qu'affamé (`humanPrey.minHunger` 30 → 70, `data/animals.json`).
- Le journal ne parle d'épidémie que si au moins 10 % de la tribu est malade en même temps (`epidemic.minShare`).
- Essayé puis retiré : le rationnement au stock (de petites bouchées multipliaient les allers-retours) ;
  un seuil de départ du camp plus bas (sans effet sur la cause principale, voir plus bas).

**Constat majeur hors de cette étape (défaut de la flore, étape 3) :** sans aucun humain, en 100 ans de flore
seule (graine 7, code de l'étape 7), **toutes les herbes disparaissent de la carte** (carotte et igname sauvages,
blé et lin sauvages, ortie, roseau : 0 ; myrtillier : 41 sur 6 960) au profit des arbres et des tamaris (une
plante au plus par tuile : les plantes à vie courte ne trouvent plus de place). Or les racines et céréales sont
la seule nourriture qui se garde et qui reste l'hiver : c'est la cause du déclin des tribus au 2e siècle, mesuré
aussi avec une tribu minuscule (donc sans effet humain). Tâche proposée séparément. La faune gonfle aussi
(sangliers ×5 à ×8 en 200 ans, ours ×4), déjà noté à l'étape 3.

**Équilibre sur 200 ans : inachevé (arrêté à la demande de Tanguy, le prochain patch change l'équilibre).**
Dernier lot complet de 10 graines (avant les deux dernières corrections : bois épargné, fauves affamés) :
4 tribus sur 8 terminées encore en vie après 200 ans (14 à 22 personnes, après des pics de 62 à 107 vers
l'an 60-110), 4 éteintes (en 30 à 180 ans : prédateurs surtout, froid et faim dans un monde très froid).
Causes de décès sur 200 ans (graine 2) : maladie 48 %, faim 27 %, vieillesse 9 %, prédateurs 6 %, soif 6 %,
en couches 3 %. Mortalité avant 1 an 8 à 13 % (un peu basse pour l'ère 0), avant l'âge adulte 30 à 40 %.
Âge moyen au décès des adultes 36 à 42 ans, doyens 66 à 76 ans. Après la correction des fauves, essais sur
70 ans : graine 4 à 68 habitants à 50 ans (au lieu d'un effondrement), graine 1 stable vers 40.
**Le lot final de 10 graines × 200 ans avec le code actuel n'a pas été fait** ; `npm run test:long` non lancé.

**Décisions et écarts (à valider) :**
- Le cycle de vie est un sous-dossier du système des individus (comme la vie sociale).
- Les enfants reçoivent à la naissance les savoirs de leurs parents (la transmission viendra avec les idées).
- Pas de jumeaux ; pas de couples de même sexe féconds ; l'attirance ne se transmet pas.
- La « protection » des enfants passe par leur comportement (suivre son parent, rester près du camp) et par la
  règle des prédateurs qui n'attaquent pas un groupe ; personne ne s'interpose encore (conflit, étape 11).
- L'héritage suit une coutume par défaut (conjoint, puis enfants, puis le camp), à remplacer à l'étape 9.
- Les morts loin du camp gardent leurs objets (personne ne les retrouve encore).
- Retiré : `body.childSpeedFactor` (la vitesse des enfants vient des forces selon l'âge). Un preset qui le
  contient affiche « variable inconnue ignorée ».
- Les maladies font partie du système des individus (la santé est une composante de l'individu dans le design).

**Dette technique :**
- Pas de mensonge sur la paternité, pas de remariage arrangé, pas de règles de mariage culturelles → idées (10).
- Transmission des savoirs par l'enseignement → **étape 10** ; héritage selon la propriété du groupe → **étape 9**.
- Les objets des morts loin du camp sont perdus → plus tard (corps retrouvés).
- Les prédateurs tuent surtout des gens affaiblis par la faim : riposte et défense des enfants → **étape 11**.
- Le nom du bébé vient toujours du générateur de syllabes → langues, **étape 10**.

**Dettes résolues :** les naissances (étape 7).

**Mesures (serveurs de Claude Code, 4 simulations en parallèle, donc chiffres pessimistes) :**
- Carte entière, faune et flore comprises : 30 humains ≈ 60-90 ms par jour de jeu ; 50 à 80 humains ≈
  110-180 ms ; tribu de 107 ≈ 170-200 ms. Le cycle de vie lui-même pèse peu (âge, grossesses, maladies : boucles
  quotidiennes ; contagion et observation seulement pour les malades et les enfants).
- Tests rapides : 387 en ~30 s. Tests longs : non lancés à cette étape.

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
