# Données du jeu

Chaque fichier JSON de ce dossier contient des réglages du jeu. Ils sont vérifiés au
lancement : si une valeur est invalide, le jeu affiche un message clair en français.

## `time.json` — le temps

| Clé | Rôle | Valeur actuelle |
| --- | --- | --- |
| `ticksPerRealSecond` | Nombre de « tics » (pas de simulation) calculés par seconde réelle en vitesse x1 | 10 |
| `ticksPerDay` | Nombre de tics dans une journée de jeu (4 800 tics à 10 par seconde = 8 minutes réelles) | 4800 |
| `daysPerSeason` | Nombre de jours par saison | 10 |
| `seasons` | Noms des saisons, dans l'ordre ; une année = toutes les saisons (4 × 10 = 40 jours) | Printemps, Été, Automne, Hiver |
| `speeds` | Vitesses proposées (boutons et touches 1 à 5) ; la pause est à part | 1, 5, 25, 100, 500 |

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
| `stepsPerDay` | Nombre de fois par jour où chaque animal agit (et se déplace d'au plus une case) |
| `thinkEverySteps` | Un animal réfléchit (choisit quoi faire) une fois tous les N pas, chacun à son rythme |
| `gridCellTiles` | Taille des cases de la grille qui sert à trouver les voisins (technique) |
| `needs.*` | Seuils de faim et de soif, dégâts de la faim, de la soif, du froid et de la vieillesse |
| `behavior.*` | Rayons de recherche de nourriture, de cohésion du groupe, de fuite, de recherche de partenaire… |
| `fish.*` | Poisson par tuile d'eau (rivière, lac, côte, haute mer) et sa vitesse de renouvellement |
| `carrion.*` | Carcasses laissées par les chasseurs : part qui pourrit chaque jour |
| `stats.intervalDays` | Fréquence du recensement (courbes du panneau Statistiques) |
| `events.*` | Seuils et phrases du journal (migrations, disparitions, effondrements) |

Pour chaque espèce : `diet` (herbe, viande, poisson ou une récolte de plante, avec une préférence),
`prey` (espèces chassées), `habitat` (densité de départ par biome), `populationPer1000Tiles`,
`groupSize` et `maxGroupSize` (troupeaux, meutes), âge adulte et maximal, saison des amours
(`breedingDays`, en jours de l'année locale), gestation, portée, `conceptionChance`,
territoire (`crowdingRadius`, `crowdingMax` : une femelle ne met pas bas si trop d'animaux de son espèce
l'entourent), pour les chasseurs `preyCheckRadius` / `breedingMinPrey` (assez de gibier autour pour élever
des petits), faim et soif par jour, nourriture nécessaire, température minimale, vitesse, rayons de fuite et
de chasse, `migratory` / `migrationTiles`, `domesticable` (pour l'élevage plus tard) et `carcass`
(ce que l'animal fournit à sa mort).
