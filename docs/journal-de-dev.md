# GENESIS — Journal de développement

Mémoire du projet entre les sessions de Claude Code. **À lire en début de session, à compléter
en fin d'étape.** Les étapes les plus récentes sont en haut.

Chaque entrée contient : ce qui a été fait, les décisions et écarts validés, la dette technique
(raccourcis provisoires à reprendre plus tard, avec l'étape prévue), et les mesures clés.

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
