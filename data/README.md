# Données du jeu

Chaque fichier JSON de ce dossier contient des réglages du jeu. Ils sont vérifiés au
lancement : si une valeur est invalide, le jeu affiche un message clair en français.

## `time.json` — le temps

| Clé | Rôle | Valeur actuelle |
| --- | --- | --- |
| `ticksPerRealSecond` | Nombre de « tics » (pas de simulation) calculés par seconde réelle en vitesse x1 | 10 |
| `ticksPerDay` | Nombre de tics dans une journée de jeu (4 800 tics à 10 par seconde = 8 minutes réelles) | 4800 |
| `daysPerYear` | Nombre de jours dans une année de jeu (calendrier compressé) | 40 |

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
| `humidity.latitudeFactors` | Humidité selon la latitude (équateur humide, tropiques secs…) |
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
`water` donne le nom et la couleur des rivières et des lacs.
