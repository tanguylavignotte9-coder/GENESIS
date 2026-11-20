# Données du jeu

Chaque fichier JSON de ce dossier contient des réglages du jeu. Ils sont vérifiés au
lancement : si une valeur est invalide, le jeu affiche un message clair en français.

Le plus simple pour les régler est l'**Atelier des variables**, dans le jeu (bouton « Atelier » ou
touche **F2**) : chaque variable y est expliquée (libellé, légende, unité, bornes, valeur par défaut),
se modifie en direct ou pour le prochain monde, et les réglages s'enregistrent en *presets* dans
`presets/` sans toucher à ces fichiers. Les fichiers de ce dossier restent les **valeurs par défaut**.

## `time.json` — le temps

| Clé | Rôle | Valeur actuelle |
| --- | --- | --- |
| `ticksPerRealSecond` | Nombre de « tics » (pas de simulation) calculés par seconde réelle en vitesse x1 | 10 |
| `ticksPerDay` | Nombre de tics dans une journée de jeu (4 800 tics à 10 par seconde = 8 minutes réelles) | 4800 |
| `daysPerSeason` | Nombre de jours par saison | 10 |
| `seasons` | Noms des saisons, dans l'ordre ; une année = toutes les saisons (4 × 10 = 40 jours) | Printemps, Été, Automne, Hiver |
| `speeds` | Vitesses proposées (boutons et touches 1 à 5) ; la pause est à part | 1, 5, 25, 100, 500 |
| `autosave` | Sauvegarde automatique (lue par le jeu, pas par la simulation) : intervalle en minutes réelles (0 = jamais), nombre d'emplacements « auto » utilisés à tour de rôle, sauvegarde à la fermeture | 5 min, 3, oui |

## `climate.json` — saisons et années anormales

La moitié haute de la carte est l'hémisphère nord, la moitié basse l'hémisphère sud : leurs saisons sont inversées
(quand c'est l'été au nord, c'est l'hiver au sud). La date affichée suit le calendrier de l'hémisphère nord.

| Clé | Rôle |
| --- | --- |
| `seasonalTemperature.warmestDayOfYear` | Jour le plus chaud de l'année au nord (0 = premier jour du printemps) |
| `seasonalTemperature.amplitudeByLatitude` | Écart (± °C) entre la température du moment et la moyenne annuelle, selon la latitude |
| `seasonalHumidity.amplitudeByLatitude` | Écart (± part de l'humidité moyenne) entre saison humide (l'été local) et saison sèche (l'hiver local) |
| `snow.startCelsius`, `snow.fullCelsius` | La neige apparaît sous la première température et couvre tout sous la seconde |
| `anomalies.chancePerRoll` | Probabilité de chaque tirage annuel de déclencher une année anormale |
| `anomalies.tilesPerRoll` | Un continent reçoit un tirage par tranche de ce nombre de tuiles (au moins un) |
| `anomalies.minLandmassTiles` | Les terres plus petites n'ont jamais d'année anormale |
| `anomalies.radiusMin/Max` | Taille de la région touchée (fraction de la carte) |
| `anomalies.types` | Types d'années anormales : nom, poids (fréquence relative), effets sur la température (toute l'année et en hiver), sur l'humidité (×), et phrases du journal (`{lieu}` est remplacé par le lieu) |

## `worldgen.json` — la génération du monde

Les distances (rayons, marges…) sont des fractions de la taille de la carte (0,1 = un dixième de la carte).
La latitude vaut 0 à l'équateur (milieu de la carte) et 1 aux pôles (haut et bas).

| Clé | Rôle |
| --- | --- |
| `size` | Côté de la carte en tuiles (1024 = 1024 × 1024 tuiles) |
| `elevation.continentCountMin/Max` | Nombre de continents (tiré au hasard entre les deux) |
| `elevation.continentRadiusMin/Max` | Taille des continents |
| `elevation.continentSpacing` | Écart minimal entre continents (plus grand = continents mieux séparés) |
| `elevation.continentShelf` | Largeur de la pente entre le fond marin et le plateau continental |
| `elevation.islandCountMin/Max`, `islandRadiusMin/Max` | Nombre et taille des îles |
| `elevation.coastWarp…` | Découpage des côtes (plus fort = côtes plus déchiquetées) |
| `elevation.detail…` | Petites variations du relief |
| `elevation.oceanFraction` | Part de la carte sous la mer (0,66 = deux tiers d'océan) |
| `elevation.lowlandMaxMeters` | Altitude maximale des plaines et collines |
| `elevation.mountainBelt…` | Où se trouvent les chaînes de montagnes (seuil plus bas = plus de montagnes) |
| `elevation.ridge…`, `mountainMaxMeters` | Forme et hauteur des montagnes |
| `elevation.maxOceanDepthMeters` | Profondeur maximale des océans |
| `temperature.equatorCelsius`, `poleCelsius` | Température moyenne au niveau de la mer à l'équateur et aux pôles |
| `temperature.lapseRateCelsiusPerKm` | Refroidissement par kilomètre d'altitude |
| `humidity.windBands` | Vents dominants par bande de latitude (`fromEast` = alizés, `fromWest` = vents d'ouest) |
| `humidity.oceanEvaporation` | Vitesse à laquelle l'air se recharge en humidité au-dessus de l'eau |
| `humidity.landRainPerTile` | Assèchement de l'air à chaque tuile de terre traversée |
| `humidity.orographicRainPerMeter` | Pluie forcée par les montagnes (ombre pluviométrique derrière elles) |
| `humidity.latitudeFactors` | Humidité selon la latitude (équateur humide, tropiques secs…) ; chaque point a une `latitude` et une `value` |
| `hydrology.riverMinFlow` | Quantité d'eau accumulée pour qu'une rivière apparaisse (plus bas = plus de rivières) |
| `hydrology.runoffPerKmOfAltitude` | Les montagnes alimentent davantage les rivières (pluie et neige) |
| `hydrology.lakeMinDepthMeters`, `lakeMinInflow` | Profondeur et alimentation minimales d'un lac |
| `beachMaxDistance` | Distance maximale à la mer pour une plage |

## `biomes.json` — les biomes

Chaque biome a un identifiant, un nom affiché, une couleur et des conditions
(`minAltitude`, `maxAltitude` en mètres, `minTemperature`, `maxTemperature` en °C,
`minHumidity`, `maxHumidity` de 0 à 1, `coastal` = près de la mer).
Une tuile prend **le premier biome de la liste** dont toutes les conditions sont remplies.
Le dernier biome « ocean » et le dernier biome « land » n'ont aucune condition : ce sont les biomes par défaut.
`vegetation: true` marque les biomes dont la végétation jaunit en saison sèche (affichage seulement).
`seasonColors` donne la couleur de la neige et de la végétation sèche.
`water` donne le nom et la couleur des rivières et des lacs.

## `resources.json` — les ressources

Liste des ressources (bois, baies, viande, peau…) avec leur nom affiché. Les plantes et les animaux
y font référence par leur identifiant ; une ressource inconnue est signalée au lancement.

## `plants.json` — la flore

Chaque tuile de terre porte **au plus une plante** (arbre, arbuste ou plante utile), avec son espèce,
son âge, sa taille et sa santé. L'**herbe** n'est pas faite d'individus : c'est une quantité par tuile
qui pousse et se fait brouter.

| Clé | Rôle |
| --- | --- |
| `updateIntervalDays` | Chaque plante n'est mise à jour qu'une fois tous les N jours (les tuiles sont réparties sur les jours) |
| `fitnessTolerance…` | Jusqu'où une espèce supporte un climat moyen hors de sa plage idéale |
| `growthMinCelsius` | En dessous, les plantes ne grandissent pas |
| `health.*` | Récupération, dégâts du gel, de la sécheresse et d'un climat inadapté (par jour) |
| `seedlingHealth`, `seedlingGrowth` | Santé et taille d'une plante qui vient de germer |
| `initialCoverByBiome` | Part des tuiles de chaque biome couvertes au départ |
| `shadeByKind` | Part de l'herbe qui pousse encore sous un arbre, un arbuste ou une herbe |
| `establishment.*` | Où une graine prend racine (étape 7.5) : `grassCompetitionByKind`, part des graines étouffées par une herbe haute (les jeunes arbres s'installent mal dans une prairie) ; `canopyShadeByKind`, part perdue sous un couvert d'arbres fermé (les herbes ont besoin de lumière) ; `canopyGrowth`, taille à partir de laquelle un arbre fait de l'ombre |
| `browsing.*` | Broutage (étape 7.5) : un herbivore qui broute une tuile abîme le jeune arbre ou arbuste qui y pousse tant qu'il est plus petit que `maxGrowth` de sa taille adulte (`damagePerGrassUnit` de santé par unité d'herbe broutée) |
| `grass.*` | Herbe : quantité maximale, pousse par jour, température minimale, humidité idéale, couverture par biome |
| `species` | Les espèces (voir ci-dessous) |

Pour chaque espèce : `kind` (tree, shrub, herb), `shape` et `color` / `accentColor` (dessin),
`abundance` (fréquence au départ), `temperature` et `humidity` (climat moyen idéal [min, max]),
`frostCelsius` et `droughtHumidity` (seuils de gel et de sécheresse), `maxAgeYears`, `maturityYears`,
`growthYears`, `seedsPerYear`, `seedRadius` (distance des graines), `germinationChance`,
`produce` (récolte saisonnière : ressource, jours de l'année locale `fromDay`–`toDay`, quantité)
et `materials` (ce qu'elle donne une fois coupée).

## `animals.json` — la faune

Chaque animal est un individu : espèce, âge, sexe, faim, soif, santé, position, groupe.

| Clé | Rôle |
| --- | --- |
| `stepsPerDay` | Nombre de fois par jour où chaque animal agit et se déplace (24 = une fois par heure) |
| `thinkEverySteps` | Un animal réfléchit (choisit quoi faire) une fois tous les N pas, chacun à son rythme |
| `gridCellTiles` | Taille des cases de la grille qui sert à trouver les voisins (technique) |
| `needs.*` | Seuils de faim et de soif, dégâts de la faim, de la soif, du froid et de la vieillesse |
| `behavior.*` | Rayons de recherche de nourriture, de cohésion du groupe, de fuite, de recherche de partenaire… |
| `fish.*` | Poisson par tuile d'eau (rivière, lac, côte, haute mer) et sa vitesse de renouvellement |
| `carrion.*` | Carcasses laissées par les chasseurs : part qui pourrit chaque jour |
| `stats.intervalDays` | Fréquence du recensement (courbes du panneau Statistiques) |
| `humanPrey.*` | Prédateurs et humains : espèces qui peuvent attaquer une personne seule, faim minimale, distance en dessous de laquelle une personne n'est pas « seule », chance d'attaque par pas, blessure |
| `events.*` | Seuils et phrases du journal (migrations, disparitions, effondrements) |
| `sickness.*` | Maladies des animaux (étape 7.5) : chance par jour de tomber malade de soi-même, distance et chance de contagion entre animaux de la même espèce, durée, gravité (santé perdue par jour), durée de l'immunité après guérison |
| `movement.*` | Déplacement naturel (étape 7.5) : accélération (virages plus ou moins larges), course de panique, allure de promenade, distance d'arrivée, espace personnel et évitement, espacement et souplesse des troupeaux, encerclement d'une proie par la meute, distance de contact pour la terrasser |

Pour chaque espèce : `diet` (herbe, viande, poisson ou une récolte de plante, avec une préférence),
`prey` (espèces chassées), `habitat` (densité de départ par biome), `populationPer1000Tiles`,
`groupSize` et `maxGroupSize` (troupeaux, meutes), âge adulte et maximal, saison des amours
(`breedingDays`, en jours de l'année locale), gestation, portée, `conceptionChance`,
territoire (`crowdingRadius`, `crowdingMax` : une femelle ne met pas bas si trop d'animaux de son espèce
l'entourent), pour les chasseurs `preyCheckRadius` / `breedingMinPrey` (assez de gibier autour pour élever
des petits), faim et soif par jour, nourriture nécessaire, température minimale, vitesse, rayons de fuite et
de chasse, `migratory` / `migrationTiles`, `domesticable` (pour l'élevage plus tard) et `carcass`
(ce que l'animal fournit à sa mort). Vitesses en tuiles par heure : `walkTilesPerHour` (marche),
`fleeSprintTiles` (fuite devant un humain), `sprintTiles` (poursuite d'un chasseur).
`birthIntervalDays` : une mère ne conçoit pas de nouveau tant qu'elle élève ses petits.
Espèces territoriales (étape 9, les loups) : `territoryTiles` (rayon défendu autour de la tanière ; une meute
cède la place à une plus forte, seule la femelle dominante d'une meute qui tient son territoire met bas : cela
remplace pour elles `crowdingRadius` / `crowdingMax` et le gibier compté autour), `dispersalPerYear` (chance par an
qu'un jeune adulte parte fonder sa meute avec un autre solitaire). `bigPreyMeat` : un chasseur préfère les proies
qui donnent au moins cette viande et ne se rabat sur les petites que faute de gros gibier à portée.

## Métadonnées des variables (Atelier des variables)

Chaque variable de chaque fichier est documentée **dans son schéma** (code de validation) :
libellé et légende en français, unité, bornes min/max pour les nombres, et mode d'application
(`live` = s'applique en direct au monde en cours, `newWorld` = au prochain monde généré).
Un test vérifie qu'aucune variable de `data/` n'en manque : toute nouvelle variable doit avoir sa fiche.

## `climate.json` → `daylight` — le jour et la nuit

| Clé | Rôle |
| --- | --- |
| `equinoxHours` | Heures de jour aux équinoxes (et toute l'année à l'équateur) |
| `deviationByLatitude` | Heures de jour en plus au cœur de l'été (et en moins en hiver), selon la latitude |
| `twilightHours` | Durée de l'aube et du crépuscule |

## `weather.json` — la météo locale

La carte est découpée en régions carrées ; chaque jour, chaque région tire sa météo (beau temps, pluie,
neige ou froid vif) selon son humidité et sa température du moment. La météo change la température ressentie
par les humains et leur vitesse de marche.

## `humans.json` — les humains

| Partie | Rôle |
| --- | --- |
| `tribe` | Nombre et taille des tribus de départ, part d'anciens, enfants par couple, âges (les bâtiments de départ sont dans `production.json`) |
| `site` | Choix de l'emplacement du camp : climat tempéré, eau douce proche, plantes nourricières autour |
| `traits` | Traits de caractère (prudence, sociabilité, curiosité, ardeur au travail, générosité, colère, ambition, spiritualité) ; les noms des personnes viennent de leur langue (`ideas.json`) |
| `skills`, `skillLearning` | Compétences (cueillette, artisanat, chasse…), le métier affiché pour chacune, vitesse d'apprentissage par la pratique |
| `stepsPerHour`, `thinkEveryMinutes` | Rythme d'action et de réflexion de chaque personne |
| `needs` | Vitesse de la faim (moins vite en dormant), de la soif, de la fatigue, du froid ; dégâts et guérison (un jeûne tue en plusieurs semaines) |
| `body` | Vitesse de marche, course (fuir, chasser), perception, charge qu'on peut porter (`carryCapacity`), vitesse des repas |
| `movement` | Déplacement naturel (étape 7.5) : accélération et virages, arrivée, lignes droites des chemins, espace personnel et évitement, place de chacun sur un lieu et cercle autour du feu, ralentissements (marais, neige, pente, fatigue, charge), essoufflement de la course, marche côte à côte d'un couple, enfant qui suit son parent, distance de conversation, chemin bloqué |
| `camp` | Chaleur maximale d'un abri ou d'un feu, territoire connu autour du camp (le feu et les huttes sont des bâtiments : `buildings.json`) |
| `memory` | Nombre de points d'eau et de coins de cueillette retenus, durée avant l'oubli |
| `danger` | Animaux redoutés, vigilance, isolement, peur en groupe, viande laissée par un corps (les attaques elles-mêmes se règlent dans `animals.json` → `humanPrey`) |
| `terrain` | Coûts de marche (forêt, broussailles, gué, pente) pour la recherche de chemin |
| `decision` | Part de hasard, persévérance, envie de déposer au stock en passant, ouvrage en cours qu'on finit |
| `actions` | Les actions du cerveau (voir ci-dessous) |
| `campMove` | Envie de déplacer le camp (distance de cueillette qui fait vouloir partir, part d'adultes nécessaire pour une décision collective, délai entre deux départs) ; la décision revient aux dirigeants (`groups.json`) |
| `deathTexts`, `settlementText` | Phrases du journal |

**Les actions** (« utility AI ») : chaque action a un poids et des *considérations*. Chaque considération
lit une entrée entre 0 et 1 (faim, soif, fatigue, froid, danger, nuit, jour, nourriture à portée, charge portée, feu bas,
éloignement du camp, isolement, réserves du camp à remplir, besoin d'un bâtiment ou d'objets…) et la passe dans une courbe : `linear` (a·x + b), `power` (x^a) ou
`logistic` (1 / (1 + e^(−b·(x − a))), une marche douce autour de `a`). Le score de l'action est le poids
multiplié par toutes ses considérations, puis par l'effet des traits de caractère (`traits`). La personne
fait l'action au meilleur score qui est possible à ce moment-là ; `reason` indique l'entrée affichée comme
raison dans sa fiche. `behavior` choisit le comportement programmé ; les comportements de travail
(`harvest`, `craft`, `build`, `deposit`, `tend_fire`) exécutent les recettes de `recipes.json` (`recipes`
donne les recettes utilisables, `items` ce qu'une récolte cherche). `minAge` : âge minimal.
Depuis l'étape 8, des entrées et des comportements servent aux enfants et aux malades : `infant` (bébé
porté, comportement `carried`), `child`, `young`, `guardianAway` (loin de son parent, comportement
`follow_guardian`), `playmates` (comportement `play`), `sick` (garder le lit).

## `knowledge.json` — les savoirs

Les savoirs des ères 0 et 1, qui sont des idées du système d'idées (`ideas.json`) : nom (et nom avec son
article pour le journal, `the`), ère de repère, prérequis (tous nécessaires pour le découvrir ou l'apprendre)
et **conditions de découverte** (`discovery`) : le besoin qui pousse à le trouver (`need` : faim, froid,
hiver à passer, gibier rare, famine…), ce que les alentours du camp doivent offrir (`environment` : silex,
argile, gibier, eau, céréales sauvages…), la compétence dont la pratique aide (`skill`) et la facilité
(`chance`, 1 = ordinaire). **`startsKnown`** (« Connu au départ », dans l'Atelier) décide ce que sait la tribu
de départ : par défaut cueillette, maîtrise du feu et huttes. Une recette, un bâtiment ou une action ne sont
utilisables que par qui connaît leur savoir.

## `ideas.json` — le système d'idées (étape 10)

Un seul mécanisme pour les savoirs, les cultures, les langues, les religions et les biens d'échange : une idée
est portée par des personnes avec une force, se transmet par les relations, dérive quand des populations ne se
parlent plus et disparaît quand plus personne ne la porte.

| Clé | Rôle |
| --- | --- |
| `everyDays` | Rythme des examens (écarts entre populations, chamans, biens d'échange, noms de lieux) |
| `knowledge` | Découverte (chance par jour, traits et pratique qui aident, milieu observé autour du camp), apprentissage (enseignement par un parent ou quelqu'un à qui l'on parle, observation du travail, observation d'étrangers, enfants plus rapides) |
| `values` | Les valeurs d'une culture (partage, hiérarchie, hospitalité, bravoure, place des anciens) et leur effet sur l'envie de faire certaines actions (`actions`) ; les groupes en tiennent compte (régimes, règles, accueil) |
| `culture` | Dérive des valeurs, influence des conversations, poids du vécu, écart à partir duquel une nouvelle culture est reconnue |
| `language` | Sons dans lesquels les langues puisent, nombre de syllabes des noms, finales des noms de femmes et de peuples, dérive de la prononciation, écart qui fait naître une langue fille, apprentissage d'une langue étrangère (au foyer, au contact), compréhension entre langues sœurs |
| `religion` | Croyances possibles et leurs rites, chances de naissance (deuil, catastrophe, révélation), conversion, ferveur des enfants, tiédeur, chaman et prêtre, lieu de culte, liens de la foi |
| `trade` | Rencontres entre tribus, envie d'échanger (opinion, hospitalité), malentendus (langue), objets qui peuvent devenir un bien d'échange et part des adultes qui doivent l'accepter |
| `texts`, `needTexts`, `environmentTexts` | Phrases du journal |

## `items.json` — les objets

Tous les objets : ressources des plantes et des animaux (même identifiant que dans `resources.json`) et objets
fabriqués. Pour chacun : catégorie (nourriture, matériau, outil, vêtement), encombrement, valeur nutritive,
conservation (demi-vie en jours : les baies pourrissent vite, les racines et la viande fumée lentement ; le froid
ralentit, la chaleur accélère), chaleur d'un vêtement, aide au transport (panier), valeur comme combustible, et
**besoin coutumier** (`wantPerMember` : combien le camp en veut par membre ; en dessous, fabriquer devient un
besoin collectif). L'ordre des objets est l'ordre de priorité de la coutume.

## `recipes.json` — les recettes

Format unique de production (pilier 5) : savoir requis, compétence, durée d'une fournée, entrées (l'un des
objets listés suffit), outils (l'un d'eux suffit, non consommé), lieu ou atelier (`station`), produits. Une
**récolte** a une `source` : plantes (`plantProduce`), branches (`plantBranches`), arbres (`tree`), terrain
(`terrain` : pierres, silex, argile, eau, blocs), gibier (`prey`), poisson (`fish`), champ mûr (`field`) ou
bêtes d'élevage (`livestock`, pas encore possible). `effect` : `fuel` alimente un feu, `sow` ensemence un champ.

## `buildings.json` — les bâtiments

Chaque bâtiment est une recette de construction : savoir (l'un de ceux listés), matériaux, heures de travail
(plusieurs personnes peuvent y travailler), fonction (feu, abri, stockage, atelier, champ…), places pour dormir,
chaleur, réserve de combustible, capacité et conservation d'un stock, et **quand le camp le veut** (`want`) :
pas de feu, pas assez de places pour dormir, provisions à protéger, atelier d'une recette voulue, un pour
tant de membres, ou jamais pour l'instant (murs, tombes, sanctuaire…).

## `production.json` — le travail et les stocks

Bâtiments de départ, conservation des aliments (température de référence, effet de la chaleur, tas à l'air libre),
**coutume** (jours de réserve de nourriture voulus selon la saison locale, réserve de bois, urgence de chaque besoin
collectif), qualité des produits (compétence, outils, hasard), travail (rapidité des experts, recherche de
matériaux, goût pour la nourriture qui se garde, emplacement des constructions), chasse (repérage, portée de la
lance et de l'arc, réussite, taille d'une carcasse, patience), champs (croissance, rendement), sources de terrain
(où trouver pierres, silex, argile, eau) et phrases du journal. `ground.findTiles` : les affaires d'une personne
morte loin du camp restent au sol ; qui passe à cette distance les ramasse (étape 7.5).

## `social.json` — la vie sociale (étape 7)

Toutes les valeurs sont expliquées dans l'Atelier des variables (système « Humains », fichier `social.json`).

| Clé | Rôle |
| --- | --- |
| `reachTiles`, `scanEveryMinutes` | Distance à laquelle on va parler à quelqu'un ou le nourrir ; fréquence à laquelle on regarde qui est autour |
| `relations` | Relations retenues (24 au plus), usure quotidienne, liens de départ, valeurs des liens familiaux, seuils d'amitié, de grande amitié, de rivalité et de brouille, mémoire des raisons |
| `emotions` | Les cinq émotions (joie, tristesse, colère, peur, jalousie) : nom et apaisement par heure |
| `loneliness` | Besoin de compagnie qui monte quand on ne parle à personne (plus vite chez les sociables) |
| `memories` | Souvenirs marquants : force, estompage (demi-vie), émotion qu'ils entretiennent, effet sur la personnalité, texte de la fiche |
| `conversation` | Bavarder, se confier, consoler, séduire, se disputer : effets sur l'affection, la confiance et le respect des deux côtés ; accrochages (caractères opposés, colériques, faim) ; jalousie ; nouvelles échangées |
| `couples` | Âge, écart d'âge, attirance, affection nécessaire pour dire oui, séparation, fin du deuil |
| `news` | Nouvelles retenues, témoins, perte de détails à chaque fois qu'on raconte (jamais de mensonge), oubli |
| `sharing` | Faim qui pousse les autres à donner, ce qu'on garde pour soi, part donnée, gratitude |
| `ambitions` | 1 à 3 ambitions : se faire des amis, trouver un compagnon, exceller dans son métier, regagner l'estime de quelqu'un |
| `texts`, `reasons`, `kinNames`, `newsTexts` | Phrases du journal et de la fiche personnage |

## `life.json` — le cycle de vie (étape 8)

Toutes les valeurs sont expliquées dans l'Atelier des variables (système « Humains », fichier `life.json`).
Aucune règle ne limite ni ne soutient la population : naissances et morts viennent de chaque individu.

| Clé | Rôle |
| --- | --- |
| `stages` | Âges de la vie : fin de l'enfance (14 ans), bébé porté, sevrage, âge du jeu, vieillesse |
| `fertility` | Fécondité d'un couple : âges des deux partenaires, allaitement qui espace les naissances, faim des derniers jours (la famine empêche de concevoir), santé ; envie d'enfant (affection mutuelle, sociabilité, petits enfants déjà là, peur de la faim) |
| `pregnancy` | Durée (30 jours = 9 mois du calendrier compressé), faim en plus, fatigue, fausses couches (plus fréquentes chez une mère affamée ou malade) |
| `birth` | Risques de l'accouchement pour la mère et l'enfant, plus grands pour une mère très jeune, âgée, affaiblie ou affamée ; santé du nouveau-né |
| `heredity` | Part des traits de caractère venue des parents, variation |
| `infancy` | Allaitement (ce qu'il coûte à la mère, lait tari par la faim), bébé non allaité nourri par son porteur ou au stock |
| `childhood` | L'enfant suit son parent, reste près du camp, cherche près de lui, apprend en regardant les adultes travailler, joue ; l'enfance marque davantage la personnalité |
| `aging` | Forces du corps selon l'âge (vitesse, endurance, travail physique), respect qui grandit pour les anciens |
| `oldAge` | Mort de vieillesse : chance qui double tous les quelques ans (loi de Gompertz), plus forte chez un corps affaibli |
| `diseases` | Maladies : apparition (froid et faim la favorisent), contagion par la proximité, durée, gravité (aggravée par la faim et le froid), immunité, faiblesse du malade |
| `frailty`, `ageVulnerability` | Faim et froid qui affaiblissent face aux maladies ; fragilité des tout-petits et des vieillards |
| `epidemic`, `famine` | Quand le journal parle d'épidémie (malades en même temps) ou de famine (morts de faim rapprochées) : un récit, jamais un événement déclenché |
| `orphans` | Qui recueille un orphelin : famille d'abord, puis proches du défunt, selon l'affection, la générosité et les enfants déjà à charge ; personne si nul n'en a envie |
| `census` | Fréquence des points de la courbe de population |
| `texts` | Phrases du journal (naissances, épidémies, famines, orphelins, héritages) |

## `groups.json` — groupes, pouvoir et règles (étape 9)

Un seul concept de groupe pour tous les niveaux : 0 la tribu, 1 les clans, 2 les familles (foyers).

| Clé | Rôle |
| --- | --- |
| `levels`, `nameTemplates` | Noms des niveaux et des groupes (« la tribu des {nom} » : le nom du peuple dans sa langue ; « le clan de {nom} » : son fondateur) |
| `adultAge`, `elderAge` | Âge à partir duquel on compte dans la vie politique, âge d'un ancien |
| `factors` | Comment on mesure la situation d’un groupe (petit, nombreux, surplus, installé, anciens, rivalités, temps durs : part des membres morts en un an) |
| `regimes` | Les 8 régimes : titre des dirigeants, nombre de dirigeants, façon de décider (consensus, conseil, chef), hérédité, niveaux possibles, poids de chaque atout pour accéder au pouvoir (`weights` : respect, prestige, âge, lignée, force, richesse), situations qui le favorisent (`favors`) et conditions nécessaires (`requires` : religion, écriture, commerce, territoire, guerre… pas encore simulées, donc ces régimes ne peuvent pas apparaître) |
| `power` | Échelles des atouts des candidats, inertie d'un régime avant une réforme |
| `property`, `inheritance`, `strategies` | Règles de propriété, d'héritage et stratégies possibles, choisies par les dirigeants selon leur caractère (`traits`) et la situation (`favors`) ; une stratégie multiplie les réserves et envies de la coutume (nourriture, bois, construction, artisanat) |
| `duties` | Obligations confiées par les dirigeants : poids du travail confié et des autres travaux, favoritisme d'un chef peu généreux envers sa famille et grief de ceux qui triment |
| `opinion` | Soutien aux dirigeants (respect, affection, confiance, régime adapté, bien-être, esprit de clan) et griefs (faim, froid, deuil, maladie, ambition contrariée, oubli) ; reproches aux dirigeants pour les morts sous leur autorité (plus encore après un déplacement décidé par eux) |
| `obedience` | Chance d'obéir selon la légitimité, la relation au dirigeant et le caractère |
| `politics` | Rythme de la vie politique, écart mécontentement − légitimité qui fait agir les ambitieux, soutien nécessaire pour renverser un chef, réformes, défi d'un rival plus capable, crise de succession à la mort d'un chef |
| `clans`, `families` | Formation des clans (liens du sang, amitiés, ambition) et des foyers |
| `scission`, `fusion`, `betrayal`, `contact` | Départ d'un clan pour fonder une tribu, petite tribu en difficulté qui en rejoint une autre, départ d'un individu vers une autre tribu, rencontres, opinions et alliances entre tribus |
| `moves` | Déplacements du camp et migrations décidés par les dirigeants, selon les souffrances passées |
| `texts`, `factorTexts`, `featureTexts`, `dutyNames`, `causeTexts` | Phrases du journal et de la fiche personnage |
