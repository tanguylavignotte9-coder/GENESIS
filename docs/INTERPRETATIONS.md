# Rapport d'interprétations — squelette de base (J1)

Rapport à Tanguy des choix faits sur les zones ouvertes du design doc lors de la création du squelette (procédure d'auto-interprétation §0). Les piliers et tout ce qui est marqué « (décision) » sont respectés tels quels.

## 1. Choix techniques structurants

- **Stack** : Electron 45 + TypeScript 5.9 + PixiJS 8 (WebGL) + esbuild (bundling) + vitest (tests). Cœur de sim 100 % pur dans `src/sim/` : testable en Node sans fenêtre, aucune dépendance npm dans le cœur.
- **Web Worker** : la simulation tourne dans un worker du renderer (`simWorker.ts`) ; le renderer ne reçoit que des digests (couleurs des tuiles en `ArrayBuffer` + date + stats + événements du journal). Le banc et les tests font tourner le même cœur en Node directement.
- **Config externalisée** : 8 fichiers `config/*.jsonc` (JSON avec commentaires, un par domaine). Chaque variable a un nom explicite, une unité et un commentaire en français. Le parseur enlève les commentaires, valide noms/types/plages et **refuse de démarrer** avec la liste des erreurs en français. Empreinte FNV-1a 64 bits par fichier, embarquée dans la sauvegarde : si la config a changé, un **avertissement explicite** est émis (jamais de reprise inexacte silencieuse).
- **Déterminisme / sauvegarde** : RNG mulberry32 à état uint32 sérialisable ; aucune `Math.random` ni horloge dans la sim. Format de sauvegarde versionné (`VERSION_SAUVEGARDE = 1`, table `MIGRATIONS` prête) contenant l'état complet + empreinte config + état du RNG. Test : même graine → même empreinte ; sauvegarde → reprise → continuation identique bit-à-bit.
- **Rendu** : une texture 1000×1000 mise à jour depuis un canvas 2D (1 pixel = 1 tuile, couleurs par matière/végétation/météo/élévation/pollution), caméra PixiJS avec **zoom continu** (molette) et pan (glisser). Barre de vitesses : pause, ×1, ×5, ×10, ×25, ×50 (1 mois = 300 s à ×1). Panneau journal latéral. Écran de démarrage : graine du monde.

## 2. Interprétations des zones ouvertes

- **Modèle de tuile** : la grille stocke des tableaux typés (perf) ; la classe `Tuile` n'est qu'une vue sur ces tableaux. Température/humidité stockées par tuile (niveau haut) et dérivées par niveau d'élévation (`-X °C/niveau`) — équivalent au « par niveau » du doc, bien moins coûteux.
- **Niveau 0 = pierre partout, y compris sous l'eau** : la mer occupe le **niveau 1** au-dessus du socle de pierre (niveau 0), rien n'est jamais placé au-dessus de l'eau. Conséquence : une tuile d'eau a une élévation de 1.
- **Générateur** : continents = 3 à 6 (paramètre de génération, pas un cap) sous forme de « blobs » bruités (bruit de valeur 2 octaves) + îles ; bords = ceinture d'eau salée infranchissable ; rivières = sources en altitude (≥ niveau 3) qui coulent vers le voisin le plus bas jusqu'à la mer, les cuvettes devenant des lacs ; gisements = tuiles dont la matière de surface est la ressource, avec quantité épuisable.
- **Traversabilité** : falaise = rupture d'élévation > 1 entre voisins → infranchissable ; montagne = coût d'effort ∝ dénivelé ; eau salée infranchissable sans navire ; eau douce traversable à gué (coût +2).
- **Saisons** : 4 saisons en zone tempérée, alternance sèche/humide en zone tropicale (inversée dans l'hémisphère sud), quasi aucune aux pôles (hiver/été simple). Gel hivernal visuel des eaux douces (l'eau reste buvable en V1).
- **Individu (modèle de données posé dès J1 pour l'extensibilité)** : tous les attributs du doc, besoins complets, personnalité à facettes, `sante.blessures[]` et `sante.maladies[]` **vides mais présents** (V2), enum `Action` V1 + `ActionReserveeV2` (combattre, soigner) prête sans toucher au cœur. Génétique : mix des traits physiques des parents + mutations, consanguinité détectée via ancêtres communs (profondeur 3), compétences **jamais** héritées (toujours 0 à la naissance), père de registre vs père biologique suivis séparément.
- **Journal** : append-only, filtres (type, individu, depuis un id), abonnés pour l'UI ; `lire()` renvoie des copies profondes (lecture seule garantie, testée).

## 3. Ordonnancement des jalons (réévaluation prévue par §12)

Le squelette couvre **J1 en entier** (monde + temps + rendu minimal + banc + config + sauvegarde + tests) et pose la **structure complète** des domaines J2–J7 (modèles d'entités, groupes, savoir, économie, culture, bâtiments) pour que chaque patch s'y ajoute sans réécriture. Suggestion d'ordre pour la suite : J2 (générateur complet + écran de démarrage seed/bandes) → J3 (boucle individuelle & survie) → J4 (sociétés) → J5 (culture & récits) → J6 (ères & économie) → J7 (sauvegarde exacte en jeu, écran de fin extinction, calibration ~20 h au banc).

## 4. Premières mesures du banc (J1, sandbox Linux, Node 22)

- Génération monde 1000×1000 : **~0,9 s**
- Mise à jour mensuelle pleine carte (météo + végétation) : **~33 ms/mois**, soit **~30 M tuiles/s**
- Modèle individu : **~330 000 créations/s**
- Sauvegarde JSON complète (monde + 2 000 individus) : **~70 Mo, ~1,0 s** à écrire, **~0,5 s** à relire

**Point connu à traiter en J7** : le format JSON texte des tableaux typés est volumineux ; un format binaire (ou une compression) sera envisagé si le banc le demande — la structure versionnée/migration est déjà en place.

## 5. Non fait en J1 (volontairement)

Pas de boucle comportementale des individus (J3), pas de faunes entités (J2), pas d'UI d'inspection avancée (J4+), pas d'autosave périodique en jeu (J7), pas de pouvoirs divins (V2), pas d'audio (V1 = silence total, décision).

---

# Rapport J2 — générateur de monde complet + faune + écran de démarrage

## Ce qui a été livré (J2)

- **Faune individuellement simulée** (`src/sim/faune/`) : 7 espèces réelles (cerf, bison, sanglier, lapin, loup, ours, vautour) réparties à la génération selon le biome (poids par type de végétation, dans `config/faune-flore.jsonc`). Chaque animal a âge, faim, santé, position, sexe.
- **Boucle faune mensuelle** (système qui ne touche que l'état partagé) : faim croissante → l'herbivore mange la biomasse de sa tuile (la végétation s'épuise réellement), le charognard mange les carcasses, le prédateur chasse une proie dans sa portée (index spatial reconstruit chaque mois) ; reproduction conditionnée à la faim/santé/âge ; morts naturelles par **famine, froid et vieillesse** → **carcasse déposée sur la tuile** qui se décompose chaque mois ; **migrations saisonnières** (les animaux fuient le froid hivernal vers l'équateur, les herbivores fuient vers la meilleure biomasse voisine, les prédateurs poursuivent les proies), en respectant la traversabilité (falaises/eau salée infranchissables).
- **Équilibres émergents testés** : sans végétation, la faune meurt de faim et laisse des carcasses (test) ; avec biomasse max, la population croît (test) — boucle proie-prédateur non régulée par code.
- **Écran de démarrage fonctionnel** : graine + nombre de bandes + taille des bandes, champs bornés par `config/societe.jsonc`, transmis au worker → `Simulation.initialiser({nbBandes, tailleBande})`, paramètres bornés, stockés dans l'état (`parametresDepart`, sérialisés) et consignés au journal. Les bandes/individus eux-mêmes apparaîtront en J3.
- **Rendu** : météo visible (pluie/neige/nuages/ensoleillement + gel hivernal des eaux douces), zoom continu, et **animaux visibles** (points colorés par espèce sur une couche PixiJS, envoyés dans le digest) ; barre d'état : date, vitesse, humains/animaux/événements.
- **Banc** : mesure dédiée faune (tick mensuel ~25 ms pour ~3 400 animaux ; 36 mois simulés headless : 3 394 → 3 082 vivants).

## Choix d'interprétation J2 (zones ouvertes)

- **Effectif faune** : « animaux par tuile 0–3 » du premier jet aurait donné jusqu'à 3 M d'entités — irréaliste en entités individuelles. Interprété comme un **effectif total initial** (1 500–4 000, config) réparti au prorata des poids de biome par espèce.
- **Tick faune mensuel** (et non à chaque pas de 0,1 s) : la migration saisonnière et la prédation sont des phénomènes mensuels ; le LOD par zone active s'appliquera aux individus humains en J3. Le banc mesure ce choix (~25 ms/mois pour la faune seule sur toute la carte).
- **Carcasses** : stockées comme une couche de nourriture par tuile (`carcasseNourriture`), consommée par charognards (et plus tard chasseurs humains en J3), avec décroissance mensuelle — émergence, pas de table.
- **Météo visible** : rendu par tuile (pluie assombrit, neige blanchit, gel des lacs/rivières en hiver) + état `meteo` par tuile dans l'état partagé.

## Mesures banc J2 (Node 22, sandbox)

- Génération monde + faune : **~1,1 s** ; simulation 36 mois : **~41 ms/mois** dont ~26 ms de tick faune (~3 400 animaux) ; débit tuiles ~24 M/s.

## Reste pour J3

Bandes initiales posées réellement (individus créés selon `parametresDepart`), boucle individuelle complète (besoins, perception locale, décisions, actions), survie (faim/soif/sommeil/froid), reproduction humaine, génétique, sénescence, fiches inspectables.

---

# Rapport J3 — individus vivants, survie, reproduction, fiches inspectables

## Ce qui a été livré (J3)

- **Bandes initiales posées réellement** (`entites/bandes.ts`) : `nbBandes` × `tailleBande` individus (depuis l'écran de démarrage), placés sur des terres proches d'eau douce et tempérées, âges réalistes (jeunes/adultes/anciens), compétences initiales et **5 savoirs de départ** (agriculture, hutte, feu, vêtements, élevage) portés individuellement, langue-mère commune, nom de lignée, stock commun de nourriture, dirigeant = l'aîné, journal de fondation.
- **Boucle individuelle complète** (`entites/boucleIndividu.ts`), exécutée à chaque tick pour chaque individu vivant (LOD par zone active prêt) :
  - **Besoins** qui montent avec le temps (faim, soif, sommeil, stress, sécurité, social, reproduction), allaitement des nourrissons par la mère.
  - **Décision pondérée** (besoins × poids de `config/individus.jsonc`) → action du besoin dominant : manger (stock du groupe), **cannibalisme d'un mort uniquement si faim ≥ seuil extrême et aucune autre nourriture** (traumatisme + événement « drame » au journal), cueillir (épuisement réel de la biomasse de la tuile), chasser (proie tuée → stock de viande), boire (eau douce de la tuile/voisine), chercher l'eau/la meilleure végétation dans la perception locale, dormir, **fuir un prédateur** détecté, socialiser (relations), se reproduire.
  - **Santé et sénescence émergentes** : pertes de santé par faim/déshydratation/fatigue/stress/froid ; au-delà de l'âge de sénescence, force/endurance baissent chaque année et la santé décline jusqu'à la **mort naturelle** (aucun âge plafond codé). Causes consignées au journal avec carcasse déposée sur la tuile.
  - **Reproduction réaliste** : couple de sexes opposés proches → grossesse de 9 mois (suivie sur la mère, père de registre + père biologique) → naissance avec **génétique** (mix + mutations, consanguinité, compétences jamais héritées), relations familiales, journal.
  - **Deuil** : mort d'un proche → stress et souvenir chez les survivants.
- **Extinction totale réelle** : si plus aucun humain vivant → `extinctionTotale` + événement journal (écran de fin en J7).
- **Fiche inspectable** : clic sur un humain (point blanc sur la carte) → panneau latéral complet (identité, âge, groupe/dirigeant, santé, besoins, attributs, compétences, parents registre/biologique, mère, enfants, relations nommées, connaissances).
- **Rendu** : humains en points blancs (digest `individus` id/x/y), animaux colorés, tout suit la caméra/zoom.

## Mesures banc J3 (36 mois, 3 bandes × 25, graine 42)

- 75 humains posés → **27 naissances, 29 morts, 73 vivants** en 36 mois ; simulation complète ~82 ms/mois (monde 1M tuiles + faune ~3 400 + humains inclus).

## Choix d'interprétation J3 (zones ouvertes)

- **Une action par tick** (pas de file d'ordres longue) : la boucle réactive « besoin dominant → action immédiate » est l'interprétation la plus proche d'un comportement réel à cette granularité ; la planification longue arrive avec l'intelligence (J5/J6).
- **Nourriture du groupe** : stock commun simple (nombre) par bande en J3 ; la périssabilité par type d'aliment et les greniers physiques détaillés arrivent avec l'économie (J4/J6) — noté pour le banc.
- **Perception** : scan local limité (`porteePerceptionTuiles`) pour eau/biomasse ; la mémoire des lieux hors vue et les rumeurs sont J5.
- **Prédation sur humains** : la fuite est simulée (boucle individuelle) ; la faune tue surtout d'autres animaux en J3, la mort d'humain par prédateur sera branchée avec les campements en J4.
