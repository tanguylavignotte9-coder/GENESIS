# GENESIS — Game Design Document

Nov 17, 2026 · @Tanguy

## Vision

**GENESIS est un aquarium historique : on regarde une tribu de l'âge de pierre écrire sa propre histoire, peut-être jusqu'aux étoiles, avec les outils pour comprendre pourquoi chaque chose est arrivée.**

Chaque humain est simulé individuellement. Les grandes histoires (guerres, schismes, révolutions, découvertes) naissent uniquement de l'interaction entre individus et systèmes, jamais d'un script.

**Rôle du joueur : spectateur.** Il observe, explore et comprend grâce à un HUD riche. Il n'agit pas sur le monde dans la première version. Un mode « god game » (interventions divines) est envisagé plus tard, mais n'est pas prioritaire.

**Objectif n°1 :** un simulateur cohérent qui fonctionne, avant toute ambition de contenu.

**Références :** Dwarf Fortress (profondeur, légendes émergentes), RimWorld (lisibilité des histoires individuelles), WorldBox (vue d'ensemble d'un monde vivant).

**Direction artistique :** systèmes réalistes, rendu en pixel art HD agréable.

## Piliers

Cinq règles tranchent toutes les décisions de conception. Une fonctionnalité qui en viole une est refusée ou retravaillée.

1. **Chaque individu compte.** Chaque personne a une identité, une personnalité, des souvenirs, des relations et des ambitions. Aucune population n'est réduite à une statistique : on préfère limiter le nombre d'habitants plutôt que d'agréger.
2. **Émergence, jamais de script.** Aucun événement n'est écrit à l'avance. Guerres, religions, révolutions et découvertes naissent des systèmes. C'est le pilier le plus important.
3. **Tout est lisible.** Le spectateur peut toujours remonter la chaîne des causes. Une histoire qu'on ne voit pas n'existe pas.
4. **Un monde cohérent.** Géographie, climat et ressources conditionnent tout. Une civilisation du désert ne ressemble pas à une civilisation de forêt.
5. **Un moteur modulaire et piloté par les données.** Systèmes séparés, variables externalisées, interactions cartographiées. C'est ce qui permet à une IA de coder et faire évoluer le projet sans tout casser.

### Philosophie d'équilibrage

**L'équilibrage ne force jamais le destin.** Chaque système doit fonctionner seul ; c'est leur combinaison qui crée l'histoire, le drame, l'effondrement ou le triomphe. Il faut distinguer ce qui est mal équilibré de ce qui est simplement l'histoire.

| Mal équilibré : à corriger | L'histoire : à laisser vivre |
| --- | --- |
| Le même résultat sur presque tous les mondes (toujours l'extinction, toujours l'explosion) | Un résultat extrême dans certains mondes seulement |
| Un comportement individuel absurde (mourir de faim à côté de nourriture accessible) | Une mort logique compte tenu de ce que l'individu savait et pouvait faire |
| Une action ou une stratégie qui domine toujours, une ressource jamais utile | Des choix différents selon le lieu, l'époque et la personnalité |
| Un résultat sans chaîne de causes lisible | Un résultat expliqué par ses causes (sécheresse, puis famine, puis exode) |

- On corrige au niveau de l'individu, en rendant une règle plus réaliste, jamais en pilotant le résultat global.
- Sont interdits : quotas de population, filets de sécurité qui sauvent une tribu ou une espèce, rattrapage automatique du perdant, progrès garanti, événement déclenché pour relancer l'histoire.
- On vise des fourchettes plausibles et de la diversité, jugées sur de nombreux mondes, jamais une valeur cible sur un seul.

## Périmètre

La première version simule une seule espèce, l'humain, et laisse le spectateur observer sans intervenir.

| Dans le périmètre | Hors périmètre (pour l'instant) |
| --- | --- |
| Espèce humaine uniquement | Évolution biologique, autres espèces intelligentes |
| Évolution culturelle et technologique | Magie, fantastique |
| Spectateur avec HUD complet | Actions du joueur (god game) |
| Monde procédural crédible | Monde fait à la main |
| De la tribu primitive à l'ère moderne, puis futuriste | Point de départ pré-humain |
| Faune et flore simulées individuellement, avec une logique bien plus simple que les humains | Animaux aussi riches que les humains (mémoire, relations, culture) |

## Le monde

Le monde est une grande carte carrée générée procéduralement, avec plusieurs continents et des îles.

**Génération.** Trois champs de base, l'élévation, la température et l'humidité, déterminent les biomes. Le résultat doit être crédible : montagnes, fleuves qui descendent vers la mer, déserts sous les tropiques ou derrière les chaînes de montagnes, toundra aux pôles.

**Ce que la géographie conditionne :**

- les ressources disponibles (bois, pierre, minerais, gibier, plantes) ;
- les déplacements (rivières, montagnes, mers comme barrières puis comme routes) ;
- l'agriculture possible et donc la densité de population ;
- les cultures qui émergent (pilier 4).

**Faune et flore.** Chaque animal et chaque plante est simulé individuellement, avec une logique bien plus simple que celle des humains : naissance, croissance, reproduction, déplacement, mort. Une forêt peut être surexploitée, un troupeau peut disparaître ou migrer.

### Échelle de la carte

La carte utilise une **échelle stylisée**, comme WorldBox : on voit chaque personne marcher, mais les distances entre continents sont compressées. Une échelle réaliste (des milliers de kilomètres au mètre près) est impossible à simuler et inutile pour quelques milliers d'habitants. L'important est la cohérence relative : traverser un continent prend des semaines, traverser une mer exige des bateaux.

- **Taille de départ :** de l'ordre de 1024 × 1024 tuiles, à valider par un prototype de performance.
- **Une seule échelle :** pas de vue « monde » séparée de la vue « locale » ; on zoome dans la même carte.

### Climat et saisons

- **Quatre saisons**, dont l'intensité dépend de la latitude : hivers rudes au nord, saisons sèche et humide près de l'équateur.
- **Météo locale :** pluie, neige, chaleur, vent. Elle influence les déplacements, les récoltes et l'humeur.
- **Années anormales :** sécheresses, hivers interminables, années d'abondance. Ce sont des moteurs d'histoire (famines, migrations, révoltes).
- **Catastrophes naturelles :** inondations, incendies de forêt, séismes, éruptions volcaniques. Elles sont rares et liées à la géographie (pas de volcan sans zone volcanique). Les épidémies relèvent du système de santé.
- **Hors périmètre :** changement climatique à long terme et dérive des continents.

### Modèle climatique retenu (étape 1)

- **Vents dominants zonaux** (est-ouest ou ouest-est selon la latitude : alizés, vents d'ouest, vents polaires). Une chaîne nord-sud crée une ombre pluviométrique, une chaîne est-ouest presque pas.
- **Circulation à grande échelle :** équateur humide, tropiques secs, latitudes moyennes humides.
- **Eau :** rivières et lacs ne sont pas des biomes mais de l'eau posée sur le terrain. Les rivières naissent d'elles-mêmes là où l'eau s'accumule ; les cuvettes trop peu alimentées restent des bassins secs.
- **Températures :** moyennes annuelles ; les saisons les font varier à partir de l'étape 2.

## Vie et temps

Le temps n'est pas réaliste à 100 % : la vie quotidienne se déroule à vitesse naturelle, mais le progrès est compressé.

- **En vitesse x1,** on voit les personnes se déplacer normalement et accomplir une journée de tâches.
- **La construction, la recherche et l'apprentissage** avancent beaucoup plus vite que dans la réalité, pour que des siècles d'histoire tiennent dans une partie.
- **L'horizon** va de la tribu primitive à l'ère moderne, puis à un monde futuriste, si la civilisation y parvient. Rien n'est garanti : une société peut stagner ou s'effondrer.

**Point de départ :** une seule tribu, nomade ou sédentaire, qui maîtrise la cueillette, le feu et la construction de huttes.

### Calendrier compressé

Comme dans RimWorld, l'année est raccourcie pour que les générations défilent. Toutes ces valeurs sont des variables externalisées, à ajuster en jouant.

| Élément | Valeur de départ |
| --- | --- |
| Une journée en x1 | environ 8 minutes réelles |
| Une saison | 10 jours |
| Une année | 4 saisons, soit 40 jours (environ 5 h 20 en x1) |
| Vitesses | pause, x1, x5, x25, x100, x500 |
| Un siècle en x500 | environ 1 h 05 réelle |

Les humains vieillissent en années de jeu : une vie de 60 ans dure donc 60 années compressées. Les durées d'action (construire une hutte, apprendre un savoir) sont calibrées sur ce calendrier, pas sur le réel.

### Le cycle de vie

- **Naissance :** un couple a des enfants selon la santé, l'âge, la nourriture disponible et les normes de sa culture. L'enfant hérite d'une partie des traits de ses parents.
- **Enfance (0 à 14 ans) :** l'enfant dépend des adultes, joue, observe et apprend. C'est là que se forment sa personnalité, sa langue, ses croyances et ses premiers savoirs.
- **Âge adulte :** travail, couple, ambitions, rôle dans le groupe. L'âge de la majorité et les règles du mariage dépendent de la culture.
- **Vieillesse (à partir d'environ 50 ans) :** forces et santé déclinent, mais le prestige et la sagesse peuvent croître (conseil des anciens).
- **Mort :** vieillesse, maladie, blessure, famine, violence, accident. La mortalité infantile est forte au début et recule avec les savoirs (hygiène, médecine).
- **Héritage :** à la mort, les biens, titres et rôles se transmettent selon les règles de propriété et de gouvernance du groupe. Les souvenirs marquants survivent dans les récits (système d'idées).

## L'individu

Chaque humain est un agent complet, simulé en permanence. Les sept composantes ci-dessous sont toutes essentielles dès la première version.

| Composante | Ce qu'elle contient | Exemple d'histoire qu'elle permet |
| --- | --- | --- |
| Besoins | Faim, sommeil, chaleur, sécurité | Une famine pousse un clan à migrer |
| Personnalité et traits | Colérique, ambitieux, pieux, curieux… | Un chef ambitieux déclenche une guerre |
| Mémoire | Événements vécus, deuils, rancunes, gratitudes | Un fils venge son père des années plus tard |
| Relations | Famille, amitiés, rivalités, amours | Un amour interdit provoque une scission |
| Compétences | Savoir-faire qui progressent avec la pratique et l'enseignement | Un maître forgeron forme une lignée d'artisans |
| Croyances et opinions | Religion, valeurs, avis sur les autres et sur le pouvoir | Un prophète fonde une secte |
| Santé | Blessures, maladies, vieillissement | Une épidémie décime la cour royale |

**Conséquence assumée :** simuler finement chaque individu limite la population. Échelle validée : de l'ordre de quelques milliers d'habitants simultanés plutôt que des millions. Le chiffre exact sera fixé par des tests de performance.

## Le cerveau de l'individu

Chaque individu décide seul de ce qu'il fait, à chaque instant, selon une boucle en six étapes. Toutes les histoires naissent de cette boucle.

### La boucle de décision

1. **Percevoir :** ce qu'il voit autour de lui, ce qu'on lui dit, ce que ressent son corps (faim, douleur, fatigue).
2. **Ressentir :** des émotions de courte durée (peur, colère, joie, tristesse, jalousie) qui colorent ses décisions.
3. **Vouloir :** ses motivations, rangées par urgence :
   - **survie** : manger, dormir, fuir un danger ;
   - **obligations** : travail, rôle dans le groupe, ordres du chef, devoirs familiaux ;
   - **désirs et ambitions** : objectifs à long terme (devenir chef, venger son père, fonder une famille, maîtriser un savoir, convertir les autres).
4. **Décider :** chaque action possible reçoit un score selon les motivations qu'elle sert, pondéré par la personnalité, avec une part de hasard (méthode « utility AI »).
5. **Agir :** pour une ambition, il construit un plan en plusieurs étapes (devenir chef : gagner du prestige, se faire des alliés, attendre une faiblesse, défier le chef).
6. **Se souvenir :** le résultat s'inscrit en mémoire et modifie ses relations, ses opinions et ses émotions.

```
Percevoir → Ressentir → Vouloir → Décider → Agir → Se souvenir
    ↑                                                    │
    └──── mémoire, relations et émotions modifiées ──────┘
```

**Exemple :** le chef humilie un forgeron (colère, puis rancune en mémoire). La rancune fait naître une ambition de vengeance, qui produit un plan : rallier les mécontents. Ses descendants héritent de la rancune par les récits familiaux, via le système d'idées.

### Règles du cerveau

| Règle | Première version |
| --- | --- |
| Connaissance limitée : chacun ne sait que ce qu'il a vu ou ce qu'on lui a dit ; les nouvelles voyagent de bouche à oreille, en retard et déformées | Oui |
| Conversations comme actions à part entière (bavarder, se confier, débattre, séduire, menacer, enseigner) ; elles font circuler idées, rumeurs et émotions | Oui |
| Désobéissance : refuser un ordre, déserter, trahir | Oui |
| Rationalité : décisions logiques selon ce que l'individu sait | Oui ; erreurs et biais cognitifs plus tard |
| Mensonges, secrets, complots, fausses rumeurs | Non, plus tard |

### Personnalité, routine et ambitions

- **Personnalité évolutive :** les traits sont en partie hérités des parents, puis façonnés par l'enfance et les grands événements (un enfant de la guerre devient méfiant, un deuil peut rendre amer).
- **Routine :** chacun a un rythme de base (dormir la nuit, travailler le jour, manger, temps social le soir) qui varie selon le métier, la saison et la culture. Le cerveau s'en écarte quand une motivation forte l'exige.
- **Ambitions :** elles naissent des traits, des souvenirs et de la situation (un ambitieux humilié veut le pouvoir, un pieux témoin d'une catastrophe veut fonder un culte). Un individu a 1 à 3 ambitions actives à la fois, visibles dans sa fiche.

### Déplacement naturel

Humains et animaux se déplacent librement, décorrélés de la grille : ils marchent comme de vrais êtres, pas comme des pièces d'échecs.

- **Positions libres dans la simulation :** chaque individu a une position décimale, une direction et une vitesse. La grille ne sert qu'à savoir sur quel terrain il marche.
- **Chemin en deux niveaux :** le trajet général est calculé sur la grille, puis lissé (lignes droites quand la vue est dégagée, courbes ailleurs) ; un pilotage local gère accélération, freinage, virages progressifs et évitement doux des autres.
- **Vitesse variable :** marche ou course (fuite, chasse), fatigue, âge, charge portée, pente, neige, marais.
- **Déplacements en groupe :** troupeaux qui se déplacent ensemble, familles côte à côte, meutes qui encerclent leur proie.
- **Placement naturel au repos :** cercle autour du feu, répartition sur un chantier, jamais d'empilement au même point.
- **Animations v1 :** regarder dans la direction du déplacement, marcher, courir. Pas d'animation sur place (s'asseoir, gestes de travail) dans la v1.
- **Après la v1 :** des sentiers qui se creusent là où l'on passe souvent, qui accélèrent la marche et peuvent devenir des routes.

## Groupes, pouvoir et économie

Pouvoir et économie ne sont pas deux systèmes séparés : tout repose sur une seule entité, le **groupe**, codée une seule fois et réutilisée à tous les niveaux (pilier 5).

### Le groupe et ses niveaux

Un groupe réunit des individus qui vivent ou agissent ensemble. Les groupes s'emboitent par niveaux :

- **Niveau 0 :** la boîte la plus grande (tribu, royaume, république, empire).
- **Niveau 1 :** les groupes à l'intérieur (clans, familles puissantes, villes, factions, guildes).
- **Niveau 2 et plus :** les groupes à l'intérieur de ceux-ci (familles, ateliers, cellules…).

Chaque groupe, quel que soit son niveau, porte les mêmes composantes :

- **Gouvernance :** type de régime, mode d'accès au pouvoir, dirigeant(s), légitimité, et **règles de propriété** (tout commun, propriété familiale, propriété privée, impôt).
- **Stratégie de développement :** priorités du moment (expansion, commerce, défense, savoir…), fixées par ceux qui gouvernent selon leur personnalité.
- **Liens :** la culture, la religion et la monnaie que le groupe a adoptées.

**Dynamiques entre groupes :**

- **Scission :** un groupe de niveau 1 mécontent peut se détacher et devenir un groupe de niveau 0.
- **Agrégation :** un groupe de niveau 0 peut en absorber un autre (alliance, mariage, conquête), qui devient alors de niveau 1.
- **Trahison :** un individu ou un sous-groupe change de camp selon ses relations, sa mémoire et ses intérêts.

### Les régimes et l'accès au pouvoir

Tous les grands modes de pouvoir sont simulés, chacun avec son propre moyen d'accès. La colonne de droite indique les conditions qui le favorisent, pas un ordre obligatoire.

| Régime | Accès au pouvoir | Favorisé quand… |
| --- | --- | --- |
| Bande égalitaire | Prestige, consensus | Petite tribu, peu de surplus |
| Conseil des anciens | Âge, sagesse | Tribu installée, traditions fortes |
| Chefferie | Force, prestige, puis hérédité | Surplus, rivalités, premiers conflits |
| Monarchie | Hérédité, conquête | Grand territoire, administration |
| Théocratie | Désignation religieuse | Religion dominante, clergé organisé |
| Oligarchie / aristocratie | Richesse, naissance | Commerce, propriété privée |
| République / démocratie | Élection | Écriture, villes, population éduquée |
| Dictature | Coup d'État, force | Crise, guerre, effondrement d'un régime |

**Évolution des régimes.** Il n'y a pas d'échelle fixe. Un régime change par **réforme, révolution, coup d'État ou conquête**, toujours déclenchés par des individus mécontents ou ambitieux. Le retour en arrière est possible : une république peut tomber en dictature. Une civilisation avancée tend simplement vers des régimes adaptés à sa taille et à sa complexité.

### Culture, religion et monnaie : des entités partagées

Culture, religion et monnaie ne sont pas la propriété d'un groupe. Ce sont des **entités indépendantes que les groupes et les individus adoptent**.

- Une religion peut couvrir plusieurs royaumes, et un royaume peut abriter plusieurs religions.
- Une langue ou une culture peut survivre à l'empire qui l'a fait naître.
- Une monnaie peut circuler au-delà des frontières de son émetteur.
- La religion et la monnaie sont optionnelles : un groupe peut ne pas en avoir.

Toutes les dynamiques de groupe (scission, fusion, trahison) laissent une trace dans le journal, avec leurs causes (pilier 3).

**Appartenance.** Un individu appartient à un seul groupe par niveau (pour l'instant).

**Moteur du changement.** Chaque groupe a deux valeurs : la **légitimité** (ce que les membres pensent du pouvoir en place) et le **mécontentement** (qui s'accumule quand besoins, croyances ou ambitions ne sont pas satisfaits). Quand l'écart devient trop grand, des individus ambitieux passent à l'action : réforme, révolution, coup d'État ou scission.

**Profondeur :** trois niveaux (0, 1 et 2) en première version, réglable dans les données. Par exemple : royaume, puis clans et villes, puis familles.

### Mise en œuvre aux ères 0 et 1

- **Niveaux pour une tribu :** niveau 0 la tribu, niveau 1 les clans (lignées ou factions qui se forment d'elles-mêmes par la parenté et l'amitié), niveau 2 les familles (foyers).
- **Régimes :** tous les régimes existent dans les données avec leurs conditions, mais à cette époque seuls la bande égalitaire, le conseil des anciens et la chefferie ont de vraies chances d'apparaître. Aucun régime n'est imposé.
- **Accès au pouvoir :** il s'appuie sur ce qui existe déjà : le respect des membres (axe des relations), le prestige (compétences, âge, réussites), la lignée.
- **Rôle des dirigeants :** répartir les obligations, décider des déplacements de camp et des migrations, fixer la stratégie et les règles de propriété et d'héritage. Chacun peut désobéir selon la légitimité, sa relation au dirigeant et sa personnalité.
- **Plusieurs tribus :** une scission crée une nouvelle tribu autonome. Les fusions pacifiques sont possibles (alliance, mariages, petite tribu qui en rejoint une plus grande) ; la conquête vient avec le conflit (étape 11).
- **Noms :** descriptifs (« la tribu de Ka ») en attendant les langues.

## Le système d'idées : culture, religion, langues, monnaie, savoirs

Culture, religion, langues, monnaie et technologie reposent sur un seul mécanisme : l'**idée**. Une coutume, une croyance, un mot, une convention d'échange ou un savoir-faire suivent le même cycle de vie (pilier 5).

### Le cycle de vie d'une idée

- **Portée** par des individus, avec une force d'adhésion (de « vaguement d'accord » à « prêt à mourir pour »).
- **Transmise** par les relations : parents vers enfants, maître vers élève, voisins, prédicateurs, commerçants.
- **Mutée** lentement, surtout quand deux populations ne se parlent plus.
- **Perdue** si plus personne ne la porte.

### Les familles d'idées

| Entité | Ce que c'est | Comment elle naît |
| --- | --- | --- |
| Culture | Les valeurs et coutumes partagées par une population | Deux populations séparées divergent ; au-delà d'un seuil de différence, une nouvelle culture est reconnue |
| Langue | Le vocabulaire et les sonorités d'une culture | Diverge avec la culture ; génère des noms de personnes et de lieux différents selon les peuples |
| Religion | Des croyances sur le sacré, des rites, puis éventuellement un clergé | Aucune au départ. Naît du besoin d'expliquer la mort ou une catastrophe, ou d'un individu charismatique et pieux ; schismes possibles |
| Monnaie | Une convention partagée : « ce bien sert à échanger » | Troc, puis un bien d'échange que tous acceptent (coquillages, métal), puis une monnaie frappée et garantie par un groupe |
| Savoirs | Des idées pratiques : feu, poterie, forge, écriture… | Découverts par des individus, transmis par l'enseignement, perdus si leurs détenteurs meurent sans élèves |

La technologie n'est donc pas un système à part : c'est l'ensemble des savoirs portés par les individus d'un groupe.

**Hors périmètre pour l'instant :** papier-monnaie, banques, crédit et monnaies modernes.

### Apparition, prérequis et écriture

- **Apparition d'une idée nouvelle :** il faut un **besoin** (le froid pousse vers les vêtements), un **environnement** qui le permet (pas de bateau sans bois ni eau) et un **individu** dont les traits s'y prêtent (curieux, expérimenté dans le domaine). Le hasard décide qui, quand, et parfois quoi.
- **Prérequis :** chaque savoir exige des savoirs préalables cohérents (pas de forge sans feu ni minerai, pas d'écriture sans langue). C'est un réseau de dépendances, pas un ordre unique : deux peuples peuvent suivre des chemins différents.
- **L'écriture est un tournant majeur.** Avant elle, une idée ne survit que si des vivants la portent. Après elle, une idée peut dormir dans un texte et être redécouverte des siècles plus tard. Bibliothèques brûlées, savoirs perdus puis retrouvés deviennent possibles.

### Langues : simulation profonde

Chaque langue génère ses propres noms et sonorités et diverge avec le temps. Deux peuples qui ne parlent pas la même langue communiquent mal : commerce plus difficile, diplomatie plus lente, malentendus. Des interprètes ou une langue commune peuvent apparaître.

**Question ouverte :** quels sont les premiers savoirs et leur réseau de prérequis (à établir dans un document de données dédié) ?

## Travail et production

Tout ce qui existe dans le monde a été récolté, fabriqué ou construit par un individu, à un endroit, avec un savoir et des outils. Rien n'apparaît par magie dans un stock.

### Les recettes : un format unique

Récolter, cuisiner, forger, construire : toute transformation est décrite par une **recette** dans les fichiers de données (pilier 5).

| Champ d'une recette | Exemple : lingot de cuivre |
| --- | --- |
| Entrées | 2 minerais de cuivre, 1 charbon de bois |
| Savoir requis | Fonte du cuivre |
| Lieu ou outil | Four |
| Compétence utilisée | Métallurgie (influence vitesse et qualité) |
| Durée | En heures de jeu |
| Sortie | 1 lingot de cuivre, de qualité variable |

Un nouveau savoir débloque de nouvelles recettes : c'est ainsi que le système d'idées fait progresser la production.

### Objets et propriété

- **Les objets courants** (bois, grain, outils ordinaires) sont gérés en piles, avec une qualité et un propriétaire.
- **Les objets remarquables** (l'épée d'un roi, une couronne, un livre sacré) sont uniques : ils ont un nom, un créateur et une histoire, et apparaissent dans le journal.
- **Le propriétaire** est un individu, une famille ou un groupe, selon les règles de propriété de la gouvernance. Le vol devient possible dès qu'il existe une propriété.

### Métiers et division du travail

- Au départ, tout le monde fait un peu de tout : cueillir, chasser, entretenir le feu.
- Quand un surplus apparaît, des individus se **spécialisent** selon leurs compétences, leurs goûts et les besoins du groupe. Un métier n'est pas une case à cocher : c'est l'activité qu'un individu choisit le plus souvent.
- Les besoins collectifs (nourrir le groupe, bâtir, défendre) deviennent des **obligations** dans le cerveau, attribuées par le dirigeant ou par la coutume.

### Construction et peuplement

- **Bâtiments :** chaque bâtiment est une recette (matériaux, savoir, durée) avec une fonction (abri, stockage, atelier, culte, défense).
- **Peuplement émergent :** personne ne décide « ici sera une ville ». Un campement devient hameau, village, puis ville, selon la nourriture, l'eau, les routes et la sécurité. Une ville peut aussi décliner et devenir une ruine.
- **Nomadisme :** une tribu nomade déplace ses camps selon les saisons et le gibier ; la sédentarisation émerge avec l'agriculture.

### Échanges

- **Dans le groupe :** partage, dons, troc entre individus, puis marché quand la monnaie apparaît.
- **Entre groupes :** commerce porté par des individus (caravanes, marchands), freiné par la distance, les langues et la confiance. Les prix ne sont pas fixés : ils émergent de l'offre et de la demande locales.

## Conflit et diplomatie

La violence suit la même logique que le reste : ce sont des individus qui décident de se battre, et des groupes qui décident de faire la guerre.

### Du coup de poing à la guerre

| Échelle | Déclencheurs typiques | Issues possibles |
| --- | --- | --- |
| Rixe | Colère, jalousie, insulte, rancune | Blessure, mort, rancune durable, exil du coupable |
| Vendetta | Meurtre, déshonneur entre familles | Cycle de vengeances sur plusieurs générations |
| Raid | Faim, convoitise, prestige d'un chef | Pillage, captifs, représailles |
| Guerre | Stratégie du groupe, ressources, religion, ambition d'un dirigeant | Conquête, tribut, absorption (le vaincu devient groupe de niveau 1), effondrement |
| Guerre civile | Mécontentement, légitimité effondrée | Changement de régime, scission |

### Le combat

- Modèle simple en première version : force, compétence, arme, armure, moral, terrain et nombre.
- Les blessures passent par le système de santé : un guerrier peut survivre estropié, et cela change sa vie.
- Le **moral** est central : une troupe fuit bien avant d'être anéantie, et chaque soldat est un individu qui peut déserter.
- Les armes et tactiques dépendent des savoirs (lances, arcs, bronze, fer, chevaux, poudre…).

### La diplomatie

- Actions entre groupes : alliance, trêve, paix, tribut, mariage diplomatique, échange d'otages, déclaration de guerre.
- Elles sont menées par des individus (dirigeants, émissaires) et soumises à la connaissance limitée : une trêve signée peut ne pas être connue à temps sur le front.
- La langue compte : sans langue commune ni interprète, la négociation est lente et risquée.
- La mémoire compte : une trahison passée pèse sur toutes les négociations futures entre deux groupes.

## Savoirs, recettes et bâtiments

Cette section est la référence de contenu du jeu : chaque ligne deviendra une entrée des fichiers de données. Elle détaille d'abord les deux premières ères, de la tribu de départ au néolithique.

### Conventions

**Les ères ne sont que des repères.** Elles servent au HUD (« ce peuple est au néolithique ») et au classement de ce document. Rien n'est bloqué par une ère : seuls comptent les prérequis. Un peuple peut maîtriser l'agriculture sans la poterie, ou l'inverse.

| Ère | Repère |
| --- | --- |
| 0 | Paléolithique : la tribu de départ, chasse et cueillette |
| 1 | Néolithique : agriculture, élevage, villages |
| 2 | Âge du bronze : métaux, roue, écriture, premières cités |
| 3 | Âge du fer et Antiquité |
| 4 | Moyen Âge |
| 5 | Renaissance et poudre |
| 6 | Ère industrielle |
| 7 | Ère moderne |
| 8 | Ère futuriste |

**Un savoir** se décrit par : son nom, son ère de repère, ses savoirs prérequis, ses conditions d'apparition (le besoin qui pousse à le trouver et la ressource ou le milieu nécessaire) et ce qu'il débloque.

**Une recette** se décrit par : le savoir requis, les entrées, l'outil ou le lieu, la compétence utilisée et la sortie (format défini dans « Travail et production »).

**Un bâtiment** se décrit par : le savoir requis, les matériaux, sa fonction et sa capacité. Sa construction est elle-même une recette.

Les quantités et durées exactes ne figurent pas ici : elles seront réglées directement dans les fichiers de données.

### Savoirs des ères 0 et 1

La tribu de départ connaît trois savoirs : **cueillette, maîtrise du feu, huttes**. Tous les autres doivent être découverts.

| Savoir | Ère | Prérequis | Besoin qui pousse à le trouver | Ressource ou milieu requis | Débloque |
| --- | --- | --- | --- | --- | --- |
| Cueillette | 0 | — (départ) | Faim | Plantes comestibles | Récolte de baies, racines, fibres |
| Maîtrise du feu | 0 | — (départ) | Froid, sécurité | Bois | Feu de camp |
| Huttes | 0 | — (départ) | Abri | Branches, feuillage | Hutte, abri sommaire |
| Taille de la pierre | 0 | — | Couper, racler | Silex ou pierre dure | Couteau et racloir de pierre |
| Chasse | 0 | Taille de la pierre | Faim, envie de viande | Gibier | Lance, chasse, dépeçage |
| Cuisson | 0 | Maîtrise du feu | Faim, maladies alimentaires | — | Viande et racines cuites |
| Travail des peaux | 0 | Chasse | Froid | Peaux | Cuir, vêtements, tente en peaux |
| Vannerie | 0 | Cueillette | Transporter, stocker | Fibres végétales | Paniers, nasses |
| Pêche | 0 | Taille de la pierre, vannerie | Faim | Rivière, lac ou côte | Pêche à la lance et à la nasse |
| Conservation | 0 | Cuisson | Pénurie hivernale | — | Fumoir, viande fumée et séchée |
| Arc | 0 | Chasse | Gibier difficile à approcher | Bois souple, tendons | Arc et flèches |
| Pirogue | 0 | Taille de la pierre, maîtrise du feu | Traverser l'eau | Gros troncs, eau | Pirogue |
| Pierre polie | 1 | Taille de la pierre | Abattre des arbres | Pierre dure | Hache polie, défrichage |
| Agriculture | 1 | Cueillette, pierre polie | Famine, population en hausse | Céréales sauvages | Champ, semis, récolte |
| Élevage | 1 | Chasse | Gibier qui se raréfie | Animaux domesticables | Enclos, lait, laine |
| Poterie | 1 | Maîtrise du feu | Stocker liquides et grains | Argile | Four à poterie, jarres |
| Mouture | 1 | Agriculture | Rendre les grains mangeables | Pierre | Meule, farine |
| Fermentation | 1 | Agriculture, poterie | Conserver, plaisir | — | Pain levé, bière |
| Tissage | 1 | Vannerie | Vêtements légers | Laine ou lin | Métier à tisser, tissu |
| Terre crue | 1 | Huttes | Habitat durable | Argile, paille | Briques crues, maison en terre |
| Construction en pierre | 1 | Huttes, pierre polie | Protéger, impressionner | Pierre | Murs, tombes, mégalithes |
| Irrigation | 1 | Agriculture | Sécheresse | Rivière | Canaux, champs irrigués |
| Comptage | 1 | Agriculture | Gérer les stocks et les dettes | — | Marques et jetons ; prérequis de l'écriture |

Les pratiques religieuses (rites funéraires, sanctuaires) ne sont pas des savoirs : elles naissent du système d'idées, famille religion.

### Recettes des ères 0 et 1

Récolter, fabriquer et transformer passent tous par une recette. Le tiret signifie « aucun ».

| Recette | Savoir requis | Entrées | Outil ou lieu | Compétence | Sortie |
| --- | --- | --- | --- | --- | --- |
| Cueillir | Cueillette | — | Buisson, plante sauvage | Cueillette | Baies, racines, fibres |
| Ramasser du bois | — | — | Forêt, bois mort | — | Branches |
| Ramasser des pierres | — | — | Sol rocheux, rivière | — | Silex, pierres |
| Allumer un feu | Maîtrise du feu | Branches | Feu de camp | Survie | Feu entretenu |
| Tailler un outil | Taille de la pierre | Silex | — | Artisanat | Couteau ou racloir de pierre |
| Fabriquer une lance | Chasse | Branche, silex | Couteau de pierre | Artisanat | Lance |
| Chasser | Chasse | — | Lance ou arc, gibier | Chasse | Carcasse |
| Dépecer | Chasse | Carcasse | Couteau de pierre | Boucherie | Viande, peau, os, tendons |
| Cuire | Cuisson | Viande ou racines crues | Feu de camp | Cuisine | Repas cuit |
| Fumer | Conservation | Viande ou poisson | Fumoir | Cuisine | Viande ou poisson fumé |
| Tanner | Travail des peaux | Peau | Racloir de pierre | Artisanat | Cuir |
| Coudre un vêtement | Travail des peaux | Cuir, tendons | Aiguille d'os (taillée dans un os avec un couteau de pierre) | Artisanat | Vêtement de cuir |
| Tresser un panier | Vannerie | Fibres | — | Artisanat | Panier ou nasse |
| Pêcher | Pêche | — | Lance ou nasse, eau | Pêche | Poisson |
| Fabriquer un arc | Arc | Bois souple, tendons | Couteau de pierre | Artisanat | Arc, flèches |
| Creuser une pirogue | Pirogue | Gros tronc | Feu, outils de pierre | Construction | Pirogue |
| Polir une hache | Pierre polie | Pierre dure | Pierre à polir | Artisanat | Hache polie |
| Abattre un arbre | Pierre polie | — | Hache polie, arbre | Bûcheronnage | Tronc, branches |
| Semer | Agriculture | Graines | Champ | Agriculture | Champ ensemencé |
| Récolter | Agriculture | — | Champ mûr | Agriculture | Céréales, graines |
| Moudre | Mouture | Céréales | Meule | Cuisine | Farine |
| Cuire du pain | Fermentation | Farine, eau | Four à pain | Cuisine | Pain |
| Brasser | Fermentation | Céréales, eau | Jarre | Cuisine | Bière |
| Modeler et cuire une poterie | Poterie | Argile, bois | Four à poterie | Poterie | Jarre, bol |
| Traire, tondre | Élevage | — | Animal domestique | Élevage | Lait, laine |
| Tisser | Tissage | Laine ou lin | Métier à tisser | Artisanat | Tissu |
| Mouler des briques | Terre crue | Argile, paille, eau | — | Construction | Briques crues |
| Tailler un bloc | Construction en pierre | — | Carrière, hache polie | Construction | Bloc de pierre |

La qualité de chaque produit dépend de la compétence de l'artisan et de la qualité de ses outils.

**Ajustements faits à l'implémentation (étape 6) :** recettes ajoutées « Extraire de l'argile » et « Puiser de l'eau » ; certaines lignes scindées (couteau et racloir, fumer la viande et le poisson, jarre et bols) ; matériaux simplifiés (feuillage et perches comptés comme branches ; pierre à polir et meule = pierres) ; une carcasse donne des unités de 10 viandes ; la cache ne protège que la nourriture. Les fichiers de données font foi pour le détail.

**Bâtiments qui attendent leur système :** enclos (bêtes domestiques), canal d'irrigation, palissade et mur (menaces, étape 11), tombe mégalithique et sanctuaire (rites et religion, étape 10). Ils existent dans les données mais aucun besoin ne pousse encore à les construire.

### Bâtiments des ères 0 et 1

Un « bâtiment » désigne toute structure placée sur la carte, du simple feu de camp au champ cultivé.

| Bâtiment | Savoir requis | Matériaux | Fonction | Capacité |
| --- | --- | --- | --- | --- |
| Feu de camp | Maîtrise du feu | Pierres, branches | Chaleur, cuisson, lumière, lieu de vie sociale | Un foyer |
| Abri sommaire | Huttes | Branches | Dormir à couvert, provisoire | 1 à 2 personnes |
| Hutte | Huttes | Branches, feuillage ou peaux | Habitat | Une famille (4 à 6) |
| Tente en peaux | Travail des peaux | Perches, cuir | Habitat démontable des nomades | Une famille |
| Cache de stockage | — | Pierres, branches | Stocker à l'abri des bêtes | Petit stock |
| Fumoir | Conservation | Branches, peaux | Fumer viande et poisson | Un atelier |
| Champ | Agriculture | — (terrain défriché) | Culture de céréales | Une parcelle |
| Enclos | Élevage | Branches ou pierres | Garder les animaux | Un troupeau |
| Grenier | Poterie ou terre crue | Briques crues ou jarres | Stocker le grain | Grand stock |
| Maison en terre | Terre crue | Briques crues, bois | Habitat durable | Une famille |
| Four à poterie | Poterie | Argile, pierres | Cuire les poteries | Un atelier |
| Four à pain | Fermentation | Argile, pierres | Cuire le pain | Un atelier |
| Atelier de tissage | Tissage | Bois | Abriter un métier à tisser | Un atelier |
| Canal d'irrigation | Irrigation | — (terrain creusé) | Arroser les champs | Une portion de rivière |
| Palissade | Pierre polie | Troncs | Défense d'un village | Un périmètre |
| Mur de pierre | Construction en pierre | Blocs de pierre | Défense, enclos durable | Un périmètre |
| Tombe mégalithique | Construction en pierre | Blocs de pierre | Monument funéraire, prestige | Une lignée |
| Sanctuaire | — (nécessite une religion) | Selon les savoirs du groupe | Lieu de culte | Une communauté |

Le sanctuaire montre la logique du système d'idées : il ne dépend d'aucun savoir technique, mais d'une croyance partagée. Ses matériaux suivent ce que le groupe sait faire (branches, terre, pierre).

### Aperçu des ères suivantes

Ces savoirs clés donnent la direction ; chaque ère sera détaillée avec ses recettes et bâtiments avant d'être codée.

| Ère | Savoirs clés |
| --- | --- |
| 2 · Bronze | Fonte du cuivre, alliage du bronze, roue, écriture, monnaie frappée, voile, araire, calendrier |
| 3 · Fer et Antiquité | Fer, routes, aqueducs, mathématiques, philosophie, droit écrit, galères, médecine antique |
| 4 · Moyen Âge | Moulins, charrue lourde, châteaux, arbalète, universités, comptabilité, navigation à la boussole |
| 5 · Renaissance et poudre | Poudre, imprimerie, astronomie, navigation hauturière, banque, méthode scientifique |
| 6 · Industrielle | Machine à vapeur, sidérurgie, chemin de fer, usines, vaccination, télégraphe |
| 7 · Moderne | Électricité, moteur à combustion, aviation, radio, antibiotiques, informatique |
| 8 · Futuriste | Énergie de fusion, intelligence artificielle, génie génétique, spatial |

Les savoirs d'une ère avancée débloquent aussi des formes d'organisation (droit écrit, banque, universités) que le système de groupes et le système d'idées exploitent.

## Outils du spectateur (HUD)

Le HUD est la moitié du jeu : sans lui, les histoires émergentes restent invisibles (pilier 3).

| Outil | Ce qu'il montre |
| --- | --- |
| Journal du monde | La chronique des événements marquants, avec leurs causes |
| Fiche personnage | Identité, traits, besoins, compétences, croyances, souvenirs, santé |
| Arbre généalogique | Lignées, mariages, descendances |
| Carte des relations | Amitiés, rivalités, loyautés entre individus et groupes |
| Vue politique | Territoires, groupes, dirigeants, alliances et conflits |
| Statistiques | Population, ressources, technologies, courbes dans le temps |

**Suivre un personnage :** le spectateur peut attacher la caméra à un individu, marquer des favoris et recevoir des notifications sur leur vie (naissance d'un enfant, blessure, prise de pouvoir, mort). Chaque ligne du journal mène aux fiches des personnes et des groupes concernés, et à l'événement qui l'a causée.

**Cerveau visuel :** dans la fiche d'un humain ou d'un animal, un bouton « Afficher le cerveau » montre sa décision sous forme de réseau : à gauche ce qu'il ressent et sait (besoins, émotions, obligations, ambitions, traits, saison), à droite les actions possibles avec leur score, et des liens dont la couleur indique s'ils poussent (vert) ou freinent (rouge) et l'épaisseur leur force. En dessous : le détail du score de chaque action (« pourquoi cueillir », « pourquoi pas le bois ») et l'historique des 20 dernières décisions avec la raison de chaque changement d'activité. Mise à jour en direct uniquement (on met le jeu en pause pour examiner). Le détail n'est enregistré que pour l'individu affiché, sans coût pour le reste de la simulation ni effet sur le déterminisme.

**Gouvernance visuelle :** dans le panneau Groupes, un bouton montre les décisions collectives du chef (options envisagées, ce qui a pesé, pourquoi les autres ont été écartées) et la carte du soutien : chaque membre et chaque clan coloré selon son soutien, avec ses raisons, et les grandes sources de mécontentement. Prévu à l'étape 10.5.

**Sauvegarde :** on peut sauvegarder un monde complet (état de la simulation, journal, preset et variables modifiées) et le recharger exactement tel quel, avec une sauvegarde automatique régulière et plusieurs emplacements. Les mêmes sauvegardes servent à Claude Code pour reprendre ses tests à l'an 100 sans tout resimuler, et à lui transmettre un monde où un problème est apparu. Prévu en préalable de l'étape 9.

**Atelier des variables :** une page de configuration liste toutes les variables du jeu, regroupées par système, chacune avec sa légende, son unité et ses bornes. On peut les modifier en direct pendant la simulation (celles qui touchent la génération du monde s'appliquent au prochain monde), revenir aux valeurs par défaut, et sauvegarder ou charger des presets. Livré à l'étape 5 (touche F2). Au démarrage, le jeu recharge le dernier preset actif. Le banc d'essai utilise toujours les valeurs par défaut pour que les rapports restent comparables. Une modification en cours de partie fait diverger le monde de sa graine : elle est inscrite au journal.

**Mesure des performances :** les mesures de Claude Code donnent un ordre d'idée, mais seul le PC de Tanguy fait foi. Le jeu inclut donc :

- un **indicateur en jeu** (activable) : images par seconde, temps de calcul d'un jour de jeu, part du budget utilisée à la vitesse actuelle, nombre d'humains, d'animaux et de plantes ;
- un **banc d'essai** lançable d'un clic (bouton ou `Benchmark-GENESIS.bat`) : il rejoue le test de charge (100 à 5 000 humains) sur le PC et enregistre un rapport daté dans un dossier `rapports/`, à transmettre à Claude Code.

**Objectif de performance : un jeu fluide en x1** (affichage sans à-coups, mouvements interpolés) ; les vitesses élevées peuvent être saccadées. En x1, la simulation n'utilise qu'une infime part du temps disponible : l'enjeu est l'affichage. Aucun plafond de population n'est imposé, car ce serait un quota : si le PC ne suit pas, le jeu ralentit et affiche la vitesse réellement atteinte. Le banc d'essai donne un repère indicatif. Livré à l'étape 5 (F3 pour l'indicateur, \`Benchmark-GENESIS.bat\` pour le banc d'essai).

| Mesure sur le PC portable de Tanguy (18 nov. 2026, i5-10300H, 16 Go) | 120 humains | 1 020 humains | 2 010 humains | 5 010 humains |
| --- | --- | --- | --- | --- |
| Calcul d'un jour de jeu | 92 ms | 215 ms | 371 ms | 824 ms |
| Vitesse maximale tenable | x5 225 | x2 228 | x1 292 | x582 |

Ce premier banc d'essai mesure le monde à sa naissance, sur 3 jours, sans l'affichage : il sera complété (mise en route, mesure plus longue, test de rendu en x1).

## Fin de partie et relance

Si la dernière tribu s'éteint, le jeu propose deux choix :

- **Recommencer** avec un nouveau monde ;
- **Faire réapparaître une tribu** dans le monde existant, qui garde ses ruines et son histoire.

Tant qu'il reste au moins un humain, la simulation continue sans fin imposée.

## Carte des systèmes et architecture

Le moteur compte six systèmes indépendants qui communiquent par des interfaces claires : Monde, Individus, Groupes, Travail et production, Idées, Conflit et diplomatie. Les individus sont au centre : ils puisent dans le monde, le transforment, portent les idées et forment les groupes qui, en retour, les influencent.

```
          Variables externalisées (fichiers de données JSON)
                              │
┌──────────────── Simulation (une boucle par instant de jeu) ────────────────┐
│  Monde                ↔  Individus (centre)  ↔  Groupes                    │
│  relief, climat,         besoins, émotions,      niveaux 0/1/2,            │
│  faune, flore            mémoire, relations,     gouvernance, propriété,   │
│                          cerveau, vie            stratégie                 │
│     ↕                        ↕                       ↕                     │
│  Travail et production ↔  Idées              ↔  Conflit et diplomatie      │
│  recettes, objets,        culture, langues,      rixes, raids, guerres,    │
│  bâtiments, échanges      religions, monnaie,    alliances, tributs        │
│                           savoirs                                          │
└────────────────────────────────────────────────────────────────────────────┘
                              │
          Journal des événements (causes et conséquences)
                              │
                      HUD du spectateur
```

Chaque système publie ses événements dans un journal commun ; le HUD ne lit que ce journal et l'état du monde.

**Règles d'architecture :**

- **Variables externalisées :** aucun chiffre en dur dans le code (vitesse de faim, durée de construction, probabilités…). Tout se règle dans des fichiers de données lisibles.
- **Systèmes modulaires :** chaque système a un rôle unique et peut être développé et testé seul, ce qui facilite le travail d'une IA.
- **Organigramme du moteur :** cette carte est tenue à jour à chaque nouveau système.
- **Traçabilité :** chaque événement enregistre ses causes, pour que le journal puisse raconter le « pourquoi ».

## Plan technique

Le jeu est écrit en TypeScript avec Electron, entièrement codé par Claude Code dans le dépôt GitHub « genesis », et lancé sous Windows par un simple double-clic.

### Stack

| Brique | Rôle |
| --- | --- |
| TypeScript | Tout le code du jeu |
| Electron | La fenêtre du jeu sur PC |
| PixiJS | Rendu 2D de la carte en pixel art (WebGL) |
| HTML / CSS | Le HUD |
| Vite | Compilation locale du code au lancement |
| Vitest | Tests automatiques, dont des simulations sans écran |

Contraintes : aucun moteur externe, aucune compilation sur GitHub, tout le code source est dans le dépôt.

### Flux de travail

1. **Conception** dans ce design doc.
2. **Code** par Claude Code, branché sur le dépôt : une étape de la feuille de route par tâche, commitée directement sur `main` (aucune pull request ; une branche `beta` viendra plus tard).
3. **Test** par Tanguy : GitHub Desktop récupère les modifications, puis double-clic sur `Lancer-GENESIS.bat`.
4. **Lien entre les deux :** `docs/design.md` (copie de ce doc) et `CLAUDE.md` (règles de codage) vivent dans le dépôt.

### Le lanceur Windows

`Lancer-GENESIS.bat` fait tout seul, dans l'ordre :

1. utilise Node.js s'il est installé, sinon télécharge une version portable dans un sous-dossier du jeu ;
2. installe ou met à jour les dépendances si elles manquent ou ont changé ;
3. recompile le code s'il a changé ;
4. ouvre le jeu.

Node portable, dépendances et fichiers compilés sont exclus du dépôt.

### Règles d'architecture

- **Simulation séparée de l'affichage :** le cœur de simulation est du TypeScript pur, sans lien avec Electron, PixiJS ou le HUD. Il tourne dans un fil d'exécution séparé et peut être testé sans écran.
- **Déterminisme :** une graine aléatoire donnée produit toujours le même monde et la même histoire, ce qui rend les bugs reproductibles.
- **Données externalisées :** savoirs, recettes, bâtiments et paramètres vivent dans des fichiers JSON.
- **Performance :** chaque individu réfléchit à son rythme (réflexions réparties dans le temps, jamais d'agrégation statistique), données lourdes stockées de façon compacte, mesure du nombre d'individus tenables dès l'étape 4.

### Feuille de route du prototype (ères 0 et 1)

Chaque étape est livrée jouable : on peut lancer le jeu et voir le résultat. Le HUD grandit à chaque étape.

| Étape | Contenu | Ce que l'on voit |
| --- | --- | --- |
| 0 · Fondations | Structure du projet, lanceur, CLAUDE.md, premier test | Une fenêtre vide qui s'ouvre |
| 1 · Monde | Génération (relief, climat, biomes, rivières), caméra | Des mondes différents à chaque graine |
| 2 · Temps et données | Horloge, calendrier, vitesses, fichiers de données, journal | Les saisons passent, vitesses x1 à x500 |
| 3 · Faune et flore | Plantes et animaux simplifiés | Troupeaux qui migrent, forêts qui repoussent |
| 4 · Premiers humains | Cycle jour-nuit, besoins, déplacements, routine, cerveau de base, mesure de performance | La tribu cueille, fait du feu, dort |
| 5 · Atelier et mesures | Page de configuration (variables avec légende, modification en direct, presets) ; outils de mesure des performances sur le PC du joueur | On règle l'équilibre sans toucher au code et on connaît les vraies performances |
| 6 · Production | Recettes, objets, bâtiments, stocks | Huttes, outils, fumoirs |
| 7 · Vie sociale | Relations, mémoire, émotions, conversations, connaissance limitée | Amitiés, rancunes, rumeurs |
| 7.5 · Déplacement naturel | Positions libres, chemins lissés, pilotage local, vitesse variable, groupes, placement au repos, animations marcher et courir | Des êtres qui marchent naturellement, hors de la grille |
| 7.6 · Sauvegarde (en préalable de l'étape 9) | Sauvegarder et recharger un monde complet, sauvegarde automatique, instantanés pour les tests de Claude Code | On reprend une partie là où on l'a laissée |
| 8 · Cycle de vie | Naissance, vieillissement, mort, héritage | Des générations qui se succèdent |
| 9 · Groupes | Niveaux, gouvernance, légitimité, scissions | Des chefs, des clans, des schismes |
| 10 · Idées | Transmission, cultures, langues, religions, découvertes | L'agriculture inventée par quelqu'un |
| 10.5 · Cerveau visuel | Réseau de décision des humains et des animaux, gouvernance et carte du soutien des chefs | On voit pourquoi chacun agit et pourquoi un chef décide |
| 11 · Conflit | Rixes, raids, guerres, diplomatie | Les premières guerres |
| 12 · HUD complet | Journal, fiches, arbres, cartes, statistiques ; élevage (domestication, enclos, lait et laine) | L'outil d'observation final |

**Avancement :** étape 0 terminée et validée sous Windows le 17 nov. 2026. Étape 1 livrée le 17 nov. 2026 (graine 42 : 34 % de terres, 3 continents, 22 îles, 151 rivières, 66 lacs). Étape 2 livrée le 17 nov. 2026 : calendrier, vitesses, saisons inversées nord/sud (la date affichée suit le nord), années anormales régionales (environ 1,3 par an), journal causal, noms de lieux descriptifs en attendant les langues. Reportés à l'étape 4 : cycle jour-nuit (nécessaire aux routines) et météo locale. Étape 3 livrée le 18 nov. 2026 : environ 15 000 animaux (9 espèces) et 280 000 plantes pour 59 ms par jour de jeu (6 % du fil de simulation en x500) ; climat 10 fois plus rapide ; toutes les espèces survivent 100 ans, équilibre à affiner dans l'Atelier des variables. Étape 4 livrée le 18 nov. 2026 : jour-nuit, météo, tribu de 30, cerveau v1, fiche personnage ; plafond mesuré sur les serveurs de Claude Code d'environ 2 700 humains en x500 (à confirmer sur le PC de Tanguy). Sans naissances, chasse, réserves ni partage, la tribu s'éteint en moins de 100 ans : attendu à ce stade. Reste à faire : météo visible sur la carte, personnes cliquables dans le journal. Étape 5 livrée le 18 nov. 2026 : mécanisme d'interaction commun entre systèmes (attaques de prédateurs), métadonnées de toutes les variables, Atelier des variables avec presets, indicateur de performance et banc d'essai. Étape 6 livrée le 18 nov. 2026 : 34 recettes, 43 objets, 18 bâtiments, aliments qui se gâtent, stock commun du camp, chantiers, compétences et métiers, besoins collectifs selon la coutume, déplacement du camp par consensus ; savoirs de départ réglables dans l'Atelier. Famines d'hiver sur certains mondes (17 à 30 survivants sur 30 en 3 ans selon la graine) : histoire légitime. À reprendre : la chasse est sans risque (riposte des gros animaux à l'étape 11). Étape 7 livrée le 19 nov. 2026 : mouvements interpolés et animation de marche en x1, banc d'essai avec mise en route et test de rendu, gibier qui fuit les chasseurs, vie sociale dans le système des individus (relations sur trois axes avec leurs raisons, souvenirs, émotions, conversations, connaissance limitée, partage, ambitions v1, nouveaux traits : générosité, colère facile, ambition). La vie sociale coûte environ 10 à 30 % de calcul en plus, sans effet sur la fluidité en x1. Étape 8 livrée le 19 nov. 2026 (validation finale interrompue volontairement) : naissances, enfance, vieillesse, maladies contagieuses et épidémies, orphelins recueillis, héritage par coutume, arbre familial, pyramide des âges. Sur 8 mondes et 200 ans : 4 tribus survivent (pic de 62 à 107 habitants puis déclin), 4 s'éteignent. Deux défauts d'écosystème identifiés, à corriger à l'étape 7.5 : les arbres éliminent toutes les herbes (racines et céréales, seule nourriture qui se garde l'hiver) et la faune gonfle sur 200 ans (sangliers ×5 à ×8, ours ×4). Étape 7.5 livrée le 20 nov. 2026 : positions libres, chemins lissés, pilotage local, groupes, placement au repos, affaires des morts laissées au sol ; écosystème corrigé plante par plante et animal par animal (toutes les plantes vivent 200 ans, herbivores entre ×0,1 et ×3). Tribu sur 10 mondes et 100 ans : 8 survivent (55 à 107 habitants, stables après un pic vers l'an 70-90), 2 s'éteignent dans une région froide sans jamais déplacer leur camp. Défaut restant : les loups s'éteignent dans tous les mondes sans humains (lions dans 1 sur 3). Patch 7.6 + 9 livré le 20 nov. 2026 : sauvegarde complète (reprise identique octet par octet, sauvegardes automatiques, partage via sauvegardes/partage/), loups avec territoire, louve dominante et dispersion des jeunes (stables sans humains, mais loups et lions s'éteignent encore dans 5 mondes complets sur 10, reporté à l'étape 11), groupes emboités avec régimes, chefs, légitimité, migrations décidées par les dirigeants, scissions et alliances. Sur 10 mondes et 100 ans : toutes les tribus de départ vivent (49 à 192 habitants), 16 scissions, 20 tribus à la fin. Défauts restants : vie politique trop calme (aucune contestation, aucun renversement, aucune fusion) et soif en hausse (19 % des morts). Patch 10 livré le 20 nov. 2026 : système d'idées (savoirs découverts et enseignés, cultures, langues qui nomment personnes, peuples et lieux, religions avec chamans, troc entre tribus et bien d'échange), vie politique réveillée (contestations, renversements, crises de succession, fusions) et soif corrigée. Sur 10 mondes et 100 ans : toutes les tribus de départ vivent (29 à 238 habitants), 8 à 18 découvertes par monde, agriculture dans 4 mondes sur 10, théocratie dans 7, religion dans tous. À confirmer au lot suivant : diversité des cultures et des langues, soif, rareté du bien d'échange. Reste inutile : l'élevage, faute de bêtes domestiques (prévu à l'étape 12).

## Décisions prises et questions ouvertes

| Décision | Date |
| --- | --- |
| Attirance : 5 % de personnes attirées par le même sexe (réglable dans l'Atelier). Performance : on est dans les clous, ajustements éventuels après la v1 | 19 nov. 2026 |
| Visuels : pixel art généré par le code pendant le prototype ; de vrais sprites seront envisagés quand la simulation sera solide | 17 nov. 2026 |
| Stack TypeScript + Electron + PixiJS, lanceur Windows .bat, pas de moteur externe ni de compilation GitHub ; prototype limité aux ères 0 et 1 | 17 nov. 2026 |
| Décisions de Claude (carte blanche) : échelle stylisée d'une seule carte, calendrier compressé (année de 40 jours), recettes comme format unique de production, conflit et diplomatie menés par des individus, 3 niveaux de groupes, suivi de personnages dans le HUD. Validées par Tanguy. | 17 nov. 2026 |
| Personnalité évolutive, routine quotidienne, 1 à 3 ambitions actives nées des traits, souvenirs et situation | 17 nov. 2026 |
| Cerveau : boucle percevoir, ressentir, vouloir, décider (utility AI), agir, se souvenir | 17 nov. 2026 |
| Connaissance limitée, conversations et désobéissance dès la première version ; individus rationnels ; mensonges et secrets plus tard | 17 nov. 2026 |
| Une idée nouvelle naît d'un besoin, d'un environnement et d'un individu | 17 nov. 2026 |
| Les savoirs ont des prérequis cohérents (réseau, pas d'ordre unique) | 17 nov. 2026 |
| L'écriture permet de conserver et redécouvrir des idées | 17 nov. 2026 |
| Langues simulées en profondeur (barrières de communication) | 17 nov. 2026 |
| Culture, langues, religion, monnaie et technologie reposent sur un système unique d'idées | 17 nov. 2026 |
| Les langues sont simulées | 17 nov. 2026 |
| Aucune religion au départ : elle doit naître | 17 nov. 2026 |
| Monnaie : troc, bien d'échange, monnaie frappée ; formes modernes plus tard | 17 nov. 2026 |
| Un individu appartient à un seul groupe par niveau (pour l'instant) | 17 nov. 2026 |
| Les changements de régime sont pilotés par la légitimité et le mécontentement | 17 nov. 2026 |
| Pouvoir et économie reposent sur une seule entité : le groupe, emboîté par niveaux (0 = le plus grand) | 17 nov. 2026 |
| Tous les grands régimes sont simulés, chacun avec son mode d'accès au pouvoir, et peuvent évoluer | 17 nov. 2026 |
| Les règles de propriété font partie de la gouvernance | 17 nov. 2026 |
| Culture, religion et monnaie sont des entités partagées, adoptées par les groupes et les individus | 17 nov. 2026 |
| Faune et flore simulées individuellement, avec une logique simplifiée | 17 nov. 2026 |
| Population de l'ordre de quelques milliers d'habitants simultanés | 17 nov. 2026 |
| Le joueur est spectateur ; le god game viendra peut-être plus tard | 17 nov. 2026 |
| Humains uniquement, évolution culturelle et technologique, pas biologique | 17 nov. 2026 |
| Chaque individu est simulé, rien n'est statistique ; l'échelle visée est de quelques milliers d'habitants, sans plafond imposé | 17 nov. 2026 |
| Une seule tribu au départ, avec scissions, fusions et trahisons possibles | 17 nov. 2026 |
| Carte carrée procédurale, plusieurs continents et îles | 17 nov. 2026 |
| Systèmes réalistes, rendu pixel art HD | 17 nov. 2026 |
| Variables externalisées et carte des systèmes dès les fondations | 17 nov. 2026 |

**Prochaines questions à trancher :**

- [ ] Données : ères 0 et 1 définies ; détailler les ères 2 à 8 (section « Savoirs, recettes et bâtiments »)
- [ ] Prototype : valider la taille de carte et le nombre d'habitants simultanés
- [ ] Lancer l'étape 0 de la feuille de route dans Claude Code
- [ ] Plus tard : mensonges et secrets, biais cognitifs, monnaies modernes, appartenances multiples, god game, conversion des anciennes sauvegardes vers les nouvelles versions du jeu
