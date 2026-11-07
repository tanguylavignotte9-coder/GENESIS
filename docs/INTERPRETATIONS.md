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

---

# Rapport J4 — premières sociétés : sédentarisation, bâtiments, troc, gouvernance, territoires

## Ce qui a été livré (J4)

- **Bâtiments réels avec chantier** (`batiments/systemeBatiments.ts`, `batiments/chantier.ts`) : décision mensuelle par groupe (feu de camp → hutte → puits si pas d'eau proche → grenier si stock > seuil → champ si village), un ouvrier (meilleure compétence construction) est assigné (`individu.chantierId`) et **travaille à chaque tick** : les jours de chantier sont consommés au prorata de sa compétence. Matériaux prélevés réellement à la pose (bois = biomasse défrichée autour du site, pierre = socle). Usure mensuelle, **effondrement** consigné au journal.
- **Sédentarisation émergente** : dès que `nbHuttesPourSedentarisation` hutte(s) permanente(s) est/sont posée(s), la bande devient **village** (pas de seuil de population) — événement « Sédentarisation » au journal. Les champs accélèrent la pousse de végétation (×3).
- **Stocks physiques** : nourriture/bois dans les stocks communs du groupe, plafonnés par la capacité du grenier s'il existe (`capaciteGrenierBase`), sinon par le fond de hutte.
- **Objets individuels avec histoire** (`economie/objet.ts` + `systemeEconomie.ts`) : fabrication mensuelle par l'artisan du groupe (compétence artisanat), usure, casse ; **troc intra-groupe** entre membres proches quand les valeurs subjectives sont compatibles — chaque objet garde son historique de propriétaires.
- **Gouvernance primaire** (`groupes/gouvernance.ts`) : à la mort/départ du dirigeant, succession par score âge × poids + charisme × poids (influence émergente), politiques par défaut depuis la config, événement au journal.
- **Territoire émergent** : recalculé chaque mois depuis l'activité réelle (positions des membres + bâtiments + rayon autour des bâtiments), exposé dans le digest avec une couleur par groupe.
- **Interface** : **frontières colorées affichées en vue éloignée** (zoom < seuil) et estompées en vue rapprochée ; clic sur un territoire → **fiche groupe** (niveau, dirigeant, membres, bonheur, stocks, bâtiments, politiques) ; **filtre du journal** par type ; fiches individus toujours au clic.

## Mesures banc J4 (48 mois, 3 bandes × 25, graine 42)

- 3 bandes → **3 villages**, **11 bâtiments**, **46 objets**, 38 naissances, 31 morts, 82 vivants ; sim complète ~79 ms/mois.

## Choix d'interprétation J4 (zones ouvertes)

- **Décision de construire** : mensuelle, par le groupe, dans l'ordre feu → hutte → puits → grenier → champ, avec un seul chantier à la fois par groupe. C'est une politique de société paramétrable (`config/societe.jsonc`), pas un script de gameplay.
- **Matériaux** : le bois provient réellement de la biomasse défrichée autour du chantier ; la pierre du socle (carrières = J6 avec la métallurgie).
- **Valeur des objets** : subjective par type (base en config) × (1 − usure) ; le troc n'a lieu que si les valeurs sont proches (seuil en config) — aucun prix global.
- **Village = huttes permanentes** (seuil de bâtiments en config), conformément au doc : aucun seuil de population.

---

# Rapport J5 — culture & récits : langues, religions, santé mentale, chroniques, sagas, favoris

## Ce qui a été livré (J5)

- **Langues émergentes** (`culture/systemeLangues.ts`) : langue-mère unique au départ ; chaque mois, la divergence d'une langue croît au prorata de l'**isolement du groupe** (distance au groupe le plus proche / `distanceIsolementTotalTuiles`) ; au-delà du seuil, une **nouvelle langue naît** (parent renseigné, journal « Nouvelle langue »). **Barrière linguistique partielle** : malus de coopération entre individus de langues différentes, **apprentissage possible** au contact (`languesConnues`), et la barrière s'applique aussi à la recherche de partenaire.
- **Religions génératives** (`culture/systemeReligion.ts`) : un **prophète charismatique** (charisme ≥ seuil + souvenir d'un drame intense) peut recevoir une révélation et fonder un culte avec attributs **générés** (1–3 dieux nommés, tabous contextuels, jours sacrés), consigné au journal ; **propagation** par contact (taux × charisme) ; **sceptiques** (probabilité en config) jamais convertis ; **schisme** quand le bonheur des croyants s'effondre. **Rites de couple** : la reproduction n'a lieu qu'entre individus de même langue (ou langue apprise) et de religions compatibles.
- **Santé mentale** : deuil → stress + souvenir + **traumatisme** (malus) pour la famille ; cannibalisme → traumatisme ; **stress maximal prolongé → folie** (malus « folie », errance aléatoire, journal « Folie ») ; **émotions V1** (peur = sécurité, colère = rancunes, joie = bonheur) exposées sur la fiche.
- **Récits factuels** (`recit/chroniques.ts`) : biographie = **uniquement** les événements du journal de l'individu (jamais d'invention) ; chronique de groupe ; **« saga du moment »** calculée chaque mois (événement marquant récent pondéré) et affichée en bannière.
- **UI** : bannière saga, **personnages favoris** (⭐ sur la fiche, événements de favoris surlignés dans le journal), bouton **📖 Chronique** dans la fiche.

## Mesures banc J5 (240 mois = 20 ans, 4 bandes × 30, graine 42)

- Population 100 → **314 vivants** (284 naissances, 70 morts — boucle malthusienne), 4 villages, 231 objets, **2 langues et 2 religions émergées naturellement**, sim ~92 ms/mois.
- **Note de calibration (pour J7)** : la faune chute de 3 394 à 132 animaux en 20 ans (chasse humaine + prédation + surpâturage) — équilibre proie-prédateur émergent mais sévère ; à recalibrer au banc (taux de chasse/reproduction) pour des équilibres durables.

## Choix d'interprétation J5 (zones ouvertes)

- **Déclencheur de prophète** : charisme ≥ seuil **et** souvenir d'un drame récent (intensité ≥ 60) — la révélation naît des événements vécus, pas du hasard seul ; probabilité mensuelle en config (`chanceRevelationParMois`), calibrée au banc.
- **Divergence** : proportionnelle à l'isolement géographique mesuré entre centres de groupes — les îles/continents sans navigation (V1) divergent le plus, conformément à la boucle 3 du doc.
- **Folie** : seuil = N mois à stress 100 (config), puis probabilité mensuelle ; comportement = errance aléatoire (pas de script de dialogues).

---

# Rapport J6 — ères & économie : percées, extraction, monnaie, pollution, nations, écrans

## Ce qui a été livré (J6)

- **Arbre technologique** (`savoir/arbreTechnologique.ts`) : ~30 connaissances atomiques avec prérequis (pierre → bronze → fer → Antiquité → Moyen Âge → industrielle → moderne → numérique), 8 ères nommées. « Le groupe connaît » = union des connaissances réelles de ses membres.
- **Percées par génies** (`savoir/systemeSavoir.ts`) : chaque mois, chaque membre d'intelligence ≥ seuil tente une percée (probabilité × intelligence) sur un atome dont le groupe maîtrise les prérequis → consigné « Découverte » au journal. **Transmission** : maître → élève proche, accélérée par l'écriture (passif) et l'école (bâtiment). Changement d'ère journalisé.
- **Extraction réelle** : les mines ne se posent que sur un gisement de la bonne ressource proche du camp (rayon en config) ET si le groupe connaît l'usage ; le gisement **s'épuise réellement** (quantité → 0 = terre, événement journal).
- **Monnaie émergente** : quand `monnaie-metallique` est maîtrisée + forge/banque, des **pièces (objets physiques réels)** sont frappées, thésaurisées dans les stocks du groupe, journal « Monnaie ».
- **Pollution (9e boucle)** : bâtiments polluants (mines, forge, centrales, raffinerie) → couche `pollution` des tuiles autour, qui **dégrade la végétation et la santé** des individus ; la centrale à charbon consomme réellement le stock de charbon (s'arrête si vide) ; décroissance lente.
- **Nations** : un village dont le territoire d'activité dépasse le seuil (config) devient nation, journalisé avec son ère.
- **Écrans dédiés** (worker + renderer) : 📊 **Économie** (objets par type, monnaie totale, stocks par groupe), ⛪ **Religions** (prophète, dieux, tabous, croyants, schismes), 🗣 **Langues** (divergence, locuteurs, arbre des langues), 🌳 **Généalogie** (arborescence parents/enfants du personnage inspecté). L'ère du groupe s'affiche dans sa fiche.

## Mesures banc J6 (600 mois = 50 ans, 4 bandes × 30, graine 42)

- Config par défaut (percée 0,08/mois, seuil génie 85) : ère max « Âge de pierre » — la chaîne tech est lente, à calibrer.
- Config boostée (percée 0,6, seuil 70) : **ère max « Ère numérique », monnaie 465 pièces, pollution max 0,34** — la chaîne complète fonctionne de bout en bout.
- **Calibration notée pour J7** : faune éteinte en 50 ans (sur-chasse humaine) ; ~600 ms/mois à 3 500 humains → LOD de simulation à activer hors zone active ; cible ~20 h de zéro à l'ère moderne à tenir au banc.

## Choix d'interprétation J6 (zones ouvertes)

- **Percée** : un génie ne choisit pas « l'ère suivante » — il invente un atome aléatoire parmi ceux dont les prérequis sont connus ; la progression émerge de l'accumulation. Un génie = intelligence ≥ seuil (config), pas de quota.
- **Mine** : posée sur le gisement réel le plus proche ; sans gisement à portée, pas d'extraction (géographie émergente).
- **Monnaie** = objets `piece` + stock commun du groupe (objets physiques, pas un chiffre abstrait).
- **Nation** = seuil de **territoire** (pas de population) pour rester conforme au « zéro hard cap » démographique.

---

# Rapport J7 — finalisation V1 : sauvegardes en jeu, écran de fin, LOD, calibration multi-graines

## Ce qui a été livré (J7)

- **Sauvegarde exacte en jeu** : autosauvegarde périodique (slot `auto`, intervalle en config `temps.jsonc`) + **3 slots manuels** (💾1/2/3) + reprise par slot (📂). Le worker sérialise l'état complet versionné (empreinte config incluse) et le renderer l'écrit sur disque via le bridge ; avertissement explicite si la config a changé entre-temps. Test : sauvegarde à un instant quelconque → reprise bit-à-bit identique après continuation.
- **Écran de fin (extinction totale)** : quand plus aucun humain ne vit, le worker envoie la **chronique complète de l'espèce** (durée, naissances, morts, groupes fondés, découvertes, religions, langues, figures marquantes = individus les plus cités au journal, derniers événements) → overlay plein écran + bouton « nouveau monde ». C'est la seule fin possible.
- **LOD de simulation** : la caméra envoie sa zone visible au worker (`zoneActive`) ; hors zone, les individus sont simulés 1 tick sur N (`lodTicksHorsZone`, config) — jamais de simulation statistique. Test : un individu hors zone vieillit > 3× moins vite.
- **Calibration au banc, multi-graines** (voir tableau ci-dessous).

## Philosophie de calibration (réponse à Tanguy)

Aucun réglage n'est calé sur une seule graine : chaque monde est unique et volontairement imparfait. **Chaque système est individuellement équilibré** (vérifié isolément), et c'est le récit émergent qui fait le reste :

- **Diagnostic faune isolée** (humains retirés, 600×600, 400 mois) : 1 651 → **2 468 animaux vivants, 0 morts**, toutes espèces présentes → la boucle faune est stable seule. Sur les grandes cartes, l'extinction de la faune vient de la **sur-chasse humaine émergente** (boucle malthusienne) — conservé tel quel.
- **Humains** : stock de départ relevé à 150 (les petites cartes provoquaient des extinctions précoces systématiques) ; sur 1000×1000, 3 graines → 357 / 566 / 39 vivants après 400 mois, aucune extinction.
- **Technologie** : taux de percée 0,11/mois, seuil génie 78. Distribution sur graines (monde 1000, 400 mois) : graine 99 → **Ère numérique au mois 123 (≈ 10 h à ×1)**, graine 42 → Antiquité, graine 1 → Âge de pierre. La variance est **voulue** : certaines civilisations restent primitives, d'autres filent jusqu'à l'ère moderne — ordre de grandeur ~20 h respecté, sans calage sur une graine.

| Graine (monde 1000, 400 mois) | Ère max | Ère moderne atteinte | Monnaie | Humains vivants | Extinction |
|---|---|---|---|---|---|
| 1 | Âge de pierre | — | 0 | 357 | non |
| 42 | Antiquité | — | 0 | 566 | non |
| 99 | Ère numérique | mois 123 (~10 h à ×1) | 665 pièces | 39 | non |

## Perf

- Monde 1000×1000 : génération ~1,1 s ; simulation ~60–130 ms/mois selon population (LOD caméra actif en jeu) ; sauvegarde ~70 Mo JSON (~1 s), reprise ~0,5 s. Le format binaire reste une option J+ si le banc le demande.

## V1 terminée

J1–J7 livrés : monde complet, faune, individus vivants, sociétés, culture, ères jusqu'à l'ère moderne, économie/monnaie, pollution, récits, sauvegardes exactes, écran de fin, joueur pur observateur. V2 balisée dans le design doc (guerre, catastrophes, pouvoirs divins…).

---

# Round de conformité V1 (revu code vs design doc)

Tous les points relevés ont été implémentés et testés (`tests/conformite.test.ts`, 11 tests) :

1. **Transport & navigation (§3 bis)** : nouveaux atomes `construction-navale` / `port` / `charrette`, bâtiments `ponton`/`port` + véhicules entités réelles (`bateau`, `charrette` avec capacité et passagers, chantier réel). Décision mensuelle : groupe côtier + savoir naval → ponton → port → bateau. **L'eau salée devient traversable avec un bateau** (`estTraversable(..., aBateau)` branché dans la boucle individu) → les îles deviennent accessibles. **Naufrage** mensuel possible (bateau coulé + passagers morts, journal). Véhicules rendus sur la carte (carrés bleus/marron).
2. **Migrations humaines** : départ individuel (bonheur < seuil → quitte le groupe, rejoint un groupe proche ou part seul, journal « Départ ») ; **schisme collectif** (bonheur moyen < seuil de mécontentement → un meneur charismatique fonde un nouveau groupe avec `parentId`, part du stock, journal « Schisme ») ; **migration collective** quand la biomasse du territoire s'épuise (le groupe cible les meilleures terres à portée).
3. **Rumeurs avec distorsion (§2-C)** : pass mensuel entre individus proches — chaque retransmission déforme la nouvelle (niveaux de distorsion : « loup » → « grand loup » → « bête monstrueuse »…, barrière de langue = +1), stockée dans la mémoire avec `estRumeur`/`distorsion`. Jamais au journal (le journal reste factuel).
4. **Héritage & orphelins (§3)** : à la mort, les objets vont à l'héritier (enfant > partenaire > parent > dirigeant du groupe), historique + valeur affective, journal « Héritage » ; orphelins (deux parents morts) pris en charge par la bande (tuteur = dirigeant, relation famille, journal « Orphelin »).
5. **Prédation sur humains** : brancheurs maintenant — au tick (prédateur au contact → mort « prédation ») et en mensuel (rayon 3 autour du prédateur).
6. **Sentiers par piétinement (§3 bis)** : couche `passage` par tuile incrémentée à chaque déplacement (humains et faune), sentier visible + végétation rasée au-delà du seuil, décroissance lente, rendu brun sur la carte.
7. **Fermentation (§3 ter)** : atome `fermentation` (prérequis poterie + agriculture) → bière/vin/hydromel fabriqués (objets réels, valeur en config), consommation en fête (bonheur +, ivresse = malus, journal « Fête »).
8. **Bug config** : clés `atelier`/`marche`/`ecole`/`forge`/`banque`/`moulin` dupliquées dans `batiments.jsonc` → dédupliqué, et **détecteur de clés dupliquées** ajouté au parseur (refus au chargement avec le nom de la clé).
9. **Échanges inter-groupes (§4)** : troc inter-groupes entre groupes proches (nourriture contre monnaie), journal « Échange inter-groupes ».

Vérif : tsc OK, build OK, **83/83 tests**, banc 200 mois (monde 500) : ère numérique au mois 141 (~12 h à ×1), 195 pièces, 3 villages, 201 humains vivants, faune 856 (équilibre proie-prédateur avec la chasse humaine).

---

# Round de conformité V1 n°2 (relecture code vs doc)

4 points corrigés, testés dans `tests/conformite2.test.ts` (5 tests) :

1. **Élevage fonctionnel** : `enclos` branché dans la table savoir→bâtiment (savoir `elevage` de départ) et construit par les villages ; **capture** d'animaux sauvages proches de l'enclos (`chanceCaptureParMois`, journal « Capture »), animaux `domestique` attachés au groupe ; **reproduction accélérée en enclos** (`multiplicateurReproductionEnclos`), les domestiqués restent près de l'enclos ; **produits animaux** (lait → stocks du groupe, `productionAnimalParMois`).
2. **Prélèvements du dirigeant** : la politique `prelevements` prélève chaque mois une fraction des stocks communs (`prelevementPourcentReserve`) vers la **réserve** du groupe, qui finance réellement les chantiers en cours (bonus de progression dans `travailChantier`) ; journal « Prélèvement » au-delà du seuil.
3. **Noyade au gué** : à chaque arrivée sur une tuile d'eau douce à pied, risque réel de noyade (`chanceNoyadeParTraverseeGue`, augmenté si faible endurance) → mort « noyade ». L'eau salée reste infranchissable sans bateau (naufrage séparé).
4. **Bug affichage naufrage** : le compteur de passagers était vidé avant l'écriture du message → « 0 passager(s) » ; corrigé (compteur capturé avant vidage, ids impliqués au journal).

Vérif : tsc OK, build OK, **88/88 tests**.

---

# Rapport V1.2 graphismes — rendu pixel art

Patch **100 % rendu** : aucune modification de la logique de `src/sim` (les seules
touches dans `src/sim` sont du code-pont de digest, voir ci-dessous). Déterminisme
prouvé : empreinte du monde du banc **identique** avant/après, `determinisme.test.ts`
vert, et un test dédié prouve que le digest V2 ne consomme pas le RNG de la sim.

## Architecture retenue

- **Simulation dans le worker, rendu sur le thread principal** (inchangé).
- **Pont digest V2** (`src/sim/worker/digestRendu.ts`, appelé par `simWorker.ts`) :
  un mot de 32 bits par tuile (matière surface 4 bits, élévation 4 bits, végétation
  4 bits, météo 2 bits, gel 1 bit, pollution quantifiée 2 bits, sentier + niveau
  3 bits, biomasse 6 bits) + `chunkVersions` (hash FNV par chunk de 64×64 tuiles,
  saison incluse) + entités détaillées (individus avec `teintePeau`/`couleurCheveux`/
  flags dirigeant+grossesse, animaux avec id/espèce/domestique, véhicules, bâtiments
  avec type/durabilité/construction) + territoires + villages + saisons Nord/Sud.
  Le digest V1 (`digestCouleurs`, couleurs brutes 1 tuile = 1 px) est conservé tel
  quel et sert **uniquement à la minicarte**. Aucun RNG de la sim n'est appelé.
- **Atlas procédural pur** (`src/renderer/pixelart/atlas.ts`, sans DOM/Pixi, testable
  en Node) : tampon RGBA + table de sprites, RNG dédié `mulberry32` grainé par
  `rendu.graineAtlas` (jamais le RNG de la sim). Génération < 500 ms mesurée dans les
  tests, atlas ~quelques dizaines de Ko (<< 50 Mo).
- **Rendu par chunks** (`src/renderer/cartePixel.ts`) : chunks 64×64 tuiles
  (canvas 512×512 px monde), rendus à la demande, invalidés par `chunkVersions`,
  cache LRU plafonné (`maxChunkCache: 64`). Seules les tuiles/chunks visibles sont
  dessinés ; 1 tuile = 8×8 px monde (`tailleTuilePx`).
- **Entités = sprites Pixi** (pools réutilisés, culling par viewport) : humains 3×5
  (décalage −1,−2), animaux (décalage −2,−2), bâtiments centrés (décalage = moitié
  de la taille arrondie), véhicules. LOD : sous 8 px/tuile, points 2×2 (humains
  blancs, animaux couleur espèce, bâtiments carrés 4×4 couleur type, véhicules 3×3) ;
  à partir de 8 px/tuile sprites complets ; cheveux à partir de 32 px/tuile.
- **Zoom par paliers nets** [4, 8, 16, 32, 64] px/tuile, molette = palier
  suivant/précédent centré sur le curseur, `scaleMode='nearest'` sur chaque texture
  (aucun lissage).
- **Minicarte** bas-droite : canvas HTML 240 px, `image-rendering: pixelated`,
  alimentée par l'ancien rendu plat (`couleurs`), rectangle de vue + marqueurs de
  villages, clic = navigation (centrage).
- **Météo/saisons** : voile statique par tuile (météo du digest) + surcouche écran
  animée (pluie = traits obliques, neige = points, nuage = ombres mouvantes, selon la
  météo dominante de la carte) ; 4 palettes saisonnières prairie/forêt/savane
  générées dans l'atlas, commutation via `saisonNord`/`saisonSud` du digest.

## Ce qui est branché

- 9 végétations distinctes (4 variantes × hash(x,y) mod 4) + eau douce/salée
  (profonde au large : 8 voisins salés), plage, terre/colline/montagne/neige selon
  élévation, sommets enneigés (élev. ≥ 5), ombrage relief **formule exacte Annexe A**
  (`g = (e−e_gauche)+(e−e_haut)`, voile noir `min(0.28, g×2.2)`, blanc
  `min(0.14, −g×1.4)`), écume 1 px `#d9e8f2` côté terre, rivières/lacs avec
  vaguelettes animées 2 frames (zoom ≥ 8), gel hivernal (eau douce blanchie).
- Gisements : affleurement 2-3 px couleur minerai (10 minerais) ; mine `mine-*`
  sur tuile non gisement (épuisée) = entrée **murée** ; `champ` pousses vertes →
  dorées à maturité (biomasse) ; sentiers terre battue largeur selon l'usage
  (bits sentier/niveau) ; pollution = voile brun-gris progressif (quantifié 0..3).
- 33 bâtiments, chacun son sprite (spécifications pixel exactes de l'Annexe A pour
  feuDeCamp 2 frames, hutte, grenier, puits, champ, enclos, cerf/loup/aurochs ;
  même style pour les autres) + variante `:chantier` (échafaudage) + `:ruine`
  (toit effondré, débris — générée à partir du sprite normal) + `:muree` (mines).
  Animés 2 frames : feu de camp, fumoir (fumée), forge (lueur), moulin (ailes),
  cheminées centrales, bateau (sillage d'écume), charrette (roues).
- 7 espèces × 2 frames (marche = pattes alternées) : cerf (bois), bison (cornes),
  sanglier (groin + dos en poils), lapin (sautille), loup, ours, vautour **en vol**
  (battement + ombre portée décalée au sol). Domestiques = posture repos dans l'enclos.
- Humains 3×5 : tête `teintePeau` (lerp min→max de la palette), tunique = couleur
  stable par hash FNV de l'id (hors sim), 2 frames de marche (pieds alternés, détecté
  par delta de position entre digests), cheveux (`couleurCheveux`) à ≥ 32 px/tuile,
  étoile dorée 1 px favoris, couronne 1 px dirigeant, +1 px tunique grossesse.
- Territoires : teinte alpha 0.22 + bordure pixelisée 1 px, visibles sous
  `frontieresPxParTuile` = 5 (comportement V1 conservé : visible au palier 4 seul).
- Sélection = contour clignotant, survol = contour discret 1 px écran.
- `config/rendu.jsonc` : taille de tuile, palettes, paliers, seuils LOD, vitesses
  d'animation, tailles de sprites, minicarte — commenté en français, validé au
  chargement comme les autres (`parserConfigRendu`, erreurs explicites, blocage au
  démarrage si invalide).

### Règles de rendu contraignantes (inscrites en V1.2.3, applicables à tout le rendu)

1. **Une seule couche de rendu est responsable d'une tuile** : un calque d'animation
   ne doit jamais repeindre une tuile déjà rendue par la couche terrain.
2. **Une entité ne s'anime que par son état réel** (déplacement, feu actif…),
   jamais « par nature ».

## rendu.jsonc HORS empreinte de sauvegarde (propre et documenté)

`NOMS_FICHIERS_CONFIG` (qui pilote `empreintes` et donc l'empreinte de sauvegarde)
reste à 8 domaines ; `rendu.jsonc` est lu à part par `lireDossierConfig` et validé à
part par `parserConfigRendu`, **jamais** ajouté aux empreintes. Conséquence prouvée
par test : `empreintes` = 8 clés sans `rendu`, la sauvegarde ne contient pas
`empreinteConfig.rendu`, et changer `rendu.jsonc` ne produit aucun avertissement à la
reprise. Changer une palette ne casse donc jamais une sauvegarde.

## Interprétations (§0) des zones ouvertes

- « Eau salée plus sombre au large » : profondeur = tuile salée dont les 8 voisins
  sont salés (le générateur met toute la mer au niveau 1, l'élévation ne distingue
  pas la profondeur).
- Saisons tropiques (`Seche`/`Humide`) mappées sur les palettes été/printemps.
- LOD « points 1-2 px » : marqueurs 2×2 px monde (1 px écran au palier 4).
- « Bâtiments en ruine » : il n'existe pas d'état « ruine » en sim (l'effondrement
  supprime le bâtiment) → sprite dégradé quand durabilité ≤ 35 %, chantier tant que
  `enConstruction`, entrée murée quand le gisement sous la mine est épuisé.
- Météo animée en surcouche écran selon la météo dominante de la carte (le digest
  garde aussi un voile statique par tuile).
- Animations 2 frames des entités : frame choisie par delta de position entre
  digests (déplacement) + horloge pour les bâtiments animés.
- Taiga/jungle/toundra/désert/terre : dérivés « même style » (la maquette ne
  spécifie que plage/prairie/forêt/colline/montagne/neige/eau).

## Vérifications

- `tsc --noEmit` OK ; `npm run build` OK.
- `npm test` : **100/100** (88 V1 + 12 nouveaux `tests/rendu.test.ts` : chargement
  et rejet de `rendu.jsonc`, rendu hors empreinte, atlas déterministe/couverture
  9 vég. × 4 variantes + 33 bâtiments + 7 espèces × 2 frames + humain 3×5,
  plan de tuile (relief exact, écume, sentier, pollution, gisement, gel),
  digest V2 décodable + déterministe + sans consommation du RNG de la sim).
- Banc 200 mois, monde 500, graine 42 (le banc n'appelle aucun digest ; le code de
  sim n'a pas changé) :
  - avant : **131,89 ms/mois**, empreinte `d02b4d1c…`
  - après : 136,73 puis **134,31 ms/mois** (bruit de mesure), empreinte
    `d02b4d1c…` **identique** → aucune régression de sim.

## Checklist de complétude

- [x] Les 9 végétations sont visuellement distinctes + eau douce/eau salée (profonde au large)/plage/relief ombré (formule exacte)
- [x] Les 33 types de bâtiments ont chacun leur sprite + versions chantier/ruine (+ murée pour les mines épuisées)
- [x] Les 7 espèces sont animées (2 frames), le vautour vole (ombre portée au sol)
- [x] Les humains sont animés (teintePeau, tunique par hash id, cheveux ≥ 32 px/tuile, favoris, dirigeant, grossesse)
- [x] Bateau et charrette animés (écume, roues), feu de camp, forge, moulin, cheminées
- [x] Météo pluie/neige/nuage animée + gel hivernal + 4 saisons
- [x] Sentiers, gisements (et épuisement = entrée murée), pollution visibles sur la carte
- [x] Zoom par paliers nets [4,8,16,32,64] + minicarte cliquable (vue + villages) + LOD par seuils en config
- [x] npm test vert (100/100), banc sans régression (empreinte identique), rapport rédigé, commit poussé

---

# Rapport V1.2.1 — fix scintillement des animations (3 corrections ciblées, renderer seul)

Diagnostic Work : les sprites « changeaient de forme » ~4×/s sur l'eau, les animaux et
les humains. Trois causes corrigées :

1. **Graine identique pour toutes les frames d'un sprite** (`pixelart/atlas.ts`) :
   `rngPour(cle, v, frame)` incluait la frame dans la graine → taches/étincelles
   redessinées ailleurs à chaque frame. Corrigé : la frame n'entre plus dans la
   graine (`rngPour(cle, v)` dans `ajouterTuile` et l'assemblage des bâtiments) ;
   seuls les pixels explicitement déplacés par le paramètre `frame` diffèrent
   (vaguelettes `frame * 3`, flammes, fumée, ailes du moulin…). La fumée du fumoir
   passe désormais par des pixels explicites par frame au lieu du rng.
   Même règle appliquée à l'overlay météo (`cartePixel.ts#dessinerMeteo`) : hash fixe
   par élément (index seul) + dérive continue selon la frame (pluie qui glisse,
   neige qui tombe, nuages qui dérivent) — plus de saut de position par frame.
   Test de non-régression : frames 0/1 de `tuile:eau:v0` ne diffèrent que sur les
   pixels vaguelettes ; `bat:feuDeCamp` change bien de frame.
2. **Entités immobiles non animées** (`cartePixel.ts#tick`) : l'alternance de texture
   s'appliquait à toute entité « animable ». Désormais chaque entité stocke
   `mobile`/`enMouvement` : au tick, une entité mobile n'alterne que si elle bouge
   vraiment (sinon frame de repos 0, et retour à 0 quand le mouvement cesse) ;
   les bâtiments animés (feu, forge, moulin, cheminées) et le vautour (vol en
   permanence) gardent leur animation intrinsèque même immobiles.
3. **Cadence plus douce** (`config/rendu.jsonc`) : `animations.msParFrame` 250 →
   **500 ms** (sprites 3-8 px lisibles), météo pluie/neige plus vive :
   `msParFrameMeteo` 120 → **180 ms** (précipitations continues).

Vérif : tsc OK, build OK, **101/101 tests** (13 dans `tests/rendu.test.ts`). Aucun
changement de sim ; banc inchangé (empreinte identique au commit V1.2).

---

# Rapport V1.2.2 — dernières animations saccadées (eau 2×/s, vautours illisibles)

## Règle générale (inscrite ici, contraignante pour toute animation future)

> **Entre deux frames d'animation voisines, seuls des pixels explicitement déplacés
> par le paramètre `frame` peuvent changer — d'1 px de préférence. Jamais de
> changement de silhouette entière.** La graine du sprite est identique pour toutes
> ses frames (V1.2.1) : seuls les pixels adressés explicitement par `frame` bougent.

## Corrections appliquées

1. **Eau : glisser au lieu de sauter** (`atlas.ts#peindreTuileEau`, `cartePixel.ts`) :
   - 4 frames au lieu de 2 ; même graine, mêmes x et largeurs entre frames, seul `y`
   avance de **1 px par frame (mod 8)** — les vaguelettes glissent en continu.
   - `tick()` : cadence eau dédiée `animations.msParFrameEau = 350 ms`, modulo le
     nombre de frames du sprite eau ; `reconstruireVagues()` crée les sprites
     directement à la frame courante (pas de retour visuel à la frame 0).
   - Le chunk statique ne dessine que la frame 0 du sprite de tuile (sous-rect
     `s.w / s.frames`), les vagues restent animées par la couche de sprites dédiée.
2. **Vautour : silhouette fixe, plané lent** (`atlas.ts#ESPECES.vautour`) :
   - Redessiné : ailes étendues, corps, tête, bec, queue **fixes** ; seuls les 2
     pixels des bouts d'ailes montent/descendent d'1 px entre les 2 frames.
   - Cadence dédiée `animations.msParFrameVautour = 700 ms` (plané lent).
   - Ombre portée réduite à un rectangle **2×1 semi-transparent**, bien décalée
     (+3,+4) — ne ressemble plus à un second animal.
3. Tests : eau = 4 frames avec diffs entre frames voisines limités aux pixels
   vaguelettes ; vautour = ≤ 4 pixels différents entre frames ; cadences
   (500 / 350 / 700 / 180 ms) assertées.

Vérif : tsc OK, build OK, **101/101 tests**. Aucun changement de sim.

---

# Rapport V1.2.3 — eau statique (couche terrain seule) + vautour réaliste (section V1.2 graphismes)

Décisions validées avec Tanguy après diagnostic dans Work.

## Règles de rendu contraignantes (inscrites aussi dans la section V1.2 graphismes)

1. **Une seule couche de rendu est responsable d'une tuile** : un calque d'animation
   ne doit jamais repeindre une tuile déjà rendue par la couche terrain.
2. **Une entité ne s'anime que par son état réel** (déplacement, feu actif…), jamais
   « par nature ».

## Corrections appliquées

1. **Calque « vagues » supprimé entièrement** (`cartePixel.ts`) : `coucheVagues`,
   `reconstruireVagues()`, la boucle vagues de `tick()`, `vaguesDirty`,
   `dernierRebuildVagues`, et `seuils.vaguesPxParTuile` retiré de `rendu.jsonc`
   (ainsi que les cadences mortes `msParFrameEau`/`msParFrameVautour`).
   L'eau est rendue **uniquement par la couche terrain (chunks)** ; les vaguelettes
   restent un **motif statique décoratif** de la texture atlas (`tuile:eau` = 1 frame).
   Raison du bug : l'overlay repeignait toutes les tuiles d'eau (y compris l'océan
   profond `tuile:eauProfonde`) et se reconstruisait par à-coups de 300 ms pendant
   les déplacements de caméra → alternance de teintes entre deux calques.
2. **Vautour posé/en vol selon l'état réel** (aucun changement de simulation — le
   renderer connaît déjà le mouvement par delta de position entre digests) :
   - **posé** (immobile, ex. charogne) : silhouette d'oiseau au sol, **sans ombre**,
     1 frame statique (`espece:vautour:pose`);
   - **en vol** (en déplacement) : silhouette de plané reconnaissable, **1 seule
     frame** (plus de battement alterné), ombre portée légère 2×1 semi-transparente
     nettement décalée (+3,+4) (`espece:vautour:vol` + `espece:vautour:ombre`);
   - **hystérésis** : si l'état oscille entre deux digests, le vautour reste « en
     vol » 3 digests après l'arrêt (`hysteresisVol`).
   - L'animation permanente 2 frames battant en continu même posé est supprimée.
3. Tests : eau = 1 frame statique + `vaguesPxParTuile`/`msParFrameEau` absents de la
   config ; vautour = `pose`/`vol` en 1 frame chacune, silhouettes distinctes, ombre
   2×1 ; cadence restante 500 ms / météo 150-200 ms.

Vérif : tsc OK, build OK, **101/101 tests**. Aucun changement de sim.

---

# Rapport « Rework monde pré-V2 » — rework complet de la génération du monde

Patch demandé par Work/Tanguy (décisions validées le 2026-11-07) : le diagnostic V1 (continents
cercles, plages immenses, biomes découpés au laser, montagnes en dômes, eau profonde seulement en
ceinture de bord, rivières en zigzag sans confluences) venait de l'algorithme, pas des constantes.
Rework complet de `generateur.ts`, `climat.ts`, `vegetation.ts`, du schéma de config et de
`config/monde.jsonc`. **Aucune autre logique de sim n'a été touchée** (contrat de sorties
intact : élévation 0-5 en piles avec socle de pierre, matières par niveau, enum végétation à
9 valeurs, température/humidité par tuile avec saisonnalité par latitude inchangée, rivières en
EauDouce de surface, gisements sur terre).

## Périmètre et interprétations (§0)

- **« Schéma de config » = `src/sim/config/schema.ts` + `src/sim/config/parse.ts`** (le schéma et
  son validateur sont un même bloc) : `nbContinentsMin/Max`, `nbIlesMin/Max` et
  `nbSourcesRivieresParContinentMin/Max` supprimés, remplacés par des seuils physiques. Aucun
  autre fichier hors la liste autorisée n'a été modifié ; `limiteZoneTropicale/Polaire` sont
  conservés car `meteo.ts` et `calendrier.ts` s'en servent pour la **saisonnalité** (inchangée).
- **Profondeur de l'océan dans l'élévation de la tuile d'eau** : la profondeur se lit dans
  `elevation` (1 = plateau/littoral, +1 par étage jusqu'à `profondeurMaxOceanNiveaux`), avec
  remplissage en Pierre sous l'EauSalee et un clamp 1-Lipschitzien (8 voisins) pour que la mer
  reste franchissable par paliers d'un niveau même avec un bateau. Le rendu colore déjà l'eau
  profonde via `profond` (voisinage 100 % eau) et l'ombrage de relief assombrit l'abysse.
- **Fraction de terre par quantile** : le seuil de niveau de la mer n'est plus une constante mais
  le quantile du champ continental calé pour viser `fractionTerreCible` (0,30) sur l'intérieur de
  la carte — robuste à toute graine et toute taille (testé de 100x100 à 1000x1000).
- **Longueurs d'onde** : celles du relief (continents, crêtes) sont en **fraction de la taille de
  la carte** (elles doivent suivre la taille du monde, sinon les petits mondes de test seraient
  dégénérés) ; celles du climat (humidité, écotones) et les seuils océan/plages sont en **tuiles
  absolues**, comme demandé (zones humides de 100-300 tuiles).
- **Bruit apériodique** : chaque octave a sa propre grille de valeurs semée par le Rng de la sim,
  dimensionnée pour couvrir toute la carte sans bouclage (un premier essai avec grilles périodiques
  produisait un continent répété 3x — détecté en carte ASCII et corrigé).
- **Rivières** : écoulement vers le voisin de plus basse élévation, avec méandre autorisé en palier
  (sinon les plaines inondées en « lacs » de 70 000 tuiles) ; inertie directionnelle par score
  `clé - alignement x inertie` ; confluence = rejoindre une rivière existante (débit cumulé) ;
  tronc aval élargi à 2 tuiles au-delà de `seuilDebitElargissement` ; dépression fermée = lac de
  `tailleMinLacTuiles` à `tailleMaxLacTuiles` avec émissaire si le bord de la cuvette descend plus
  bas. Sources tirées en favorisant l'altitude. Le bonus d'humidité **+25** des tuiles de rivière
  est conservé de la V1 (le test de continuité exclut donc les tuiles d'eau : c'est un effet local
  de rivière, pas une ligne de latitude).
- **Gisements** : placement conservé (rejet aléatoire sur terre), pondéré par le relief —
  minerais métalliques (fer, cuivre, étain, or, argent, uranium) favorisés en montagne
  (`facteurMontagneGisementsMetalliques`), charbon/pétrole/gaz favorisés en plaine
  (`facteurPlaineGisementsSedimentaires`), sel sans préférence.
- **Empreinte de config changée** : `monde.jsonc` ayant changé, les anciennes sauvegardes sont
  refusées avec l'avertissement prévu (empreinte FNV-1a par fichier embarquée dans la
  sauvegarde) — comportement normal du format versionné, accepté pré-V2. Documenté ici.

## Ce qui a été livré (correspondance avec la méthode cible)

1. **Relief fractal organique** : fBm 5 octaves + domain warping (2 champs de déformation) +
   marge d'océan périphérique en fondu ; côtes avec fjords, baies, péninsules, mers intérieures,
   archipels (12-22 masses > 2 000 tuiles + ~1 400 îles sur 1000x1000 selon la graine). Plus aucun
   cercle. **Chaînes de montagnes** : bruit ridged orienté par un champ d'angle (crêtes allongées,
   pas de dômes). Quantification en niveaux 0-5 via `seuilsNiveauxTerre` (config).
2. **Océan à étages** : profondeur = distance de chamfer à la terre (plateau < 4 tuiles, pente
   < 14, abysse > 40), lue dans l'élévation de l'eau — plateau clair, pente, abysse au large.
3. **Plages par pente et climat** : Sable uniquement si côte basse (`niveauMaxPlage`), à moins de
   `largeurMaxPlageTuiles` (3) de l'eau, pente locale ≤ `seuilPentePlageNiveaux` et
   température ≥ `temperatureMinPlageCelsius` (8 °C) ; côtes froides = Pierre, jamais de sable
   polaire. La règle « hauteur < 0,42 → sable » est supprimée.
4. **Climat continu** : humidité = courbe lisse équateur→pôle − ceinture sèche subtropicale
   gaussienne (centre 0,22 ≈ 20°, amplitude 45) + fBm 4 octaves (grandes zones de ~220 tuiles) +
   bonus d'eau dégradé linéairement sur `largeurBonusHumiditeEauTuiles`. **Plus aucun palier** :
   saut max entre tuiles terrestres voisines < 12 points (mesuré < 6 en pratique). Température :
   latitude + refroidissement par élévation, inchangés.
5. **Écotones en mosaïque** : classification par seuils conservée, mais entrées bruitées à
   petite maille (`margeTemperatureEcotoneCelsius`, `margeHumiditeEcotonePourcent`, maille
   `longueurOndeEcotoneTuiles`) — les frontières de biomes tranchent tuile par tuile, aucune
   ligne droite de latitude.
6. **Rivières** : confluences avec débit cumulé, élargissement du tronc aval à 2 tuiles, lacs
   (min 2x2) en dépression fermée avec émissaire, inertie directionnelle en plaine. Contrat
   respecté : EauDouce en surface, sources à élévation ≥ `elevationMinSourceRiviere`.
7. **Gisements** : voir interprétations ci-dessus.

## Vérifications (rapides, côté Code — pas de longue simulation lancée)

- `tsc --noEmit` OK ; `npm run build` OK.
- `npm test` : **107/110**. Tous les tests du monde et du contrat sont verts : `monde.test.ts`
  (invariants, ceinture de bord, falaises, eau salée à bateau), `determinisme.test.ts` (même
  graine = même empreinte, sauvegarde versionnée), `config.test.ts`, `monde-proprietes.test.ts`
  (**9 nouveaux tests de propriétés**, mondes 100x100 x 5 graines : fraction de terre dans la
  fourchette, contrat de piles, ceinture de bord, tous les biomes présents, aucun sable froid,
  plages ≤ max config, aucune discontinuité d'humidité entre voisins, océan à étages
  1-Lipschitzien, rivières présentes, déterminisme), plus faune/individus/culture/j7/rendu/societe.
- **3 tests en échec, recalibration Work (hors périmètre Code)** : `conformite.test.ts` « troc
  inter-groupes », `conformite2.test.ts` « enclos construit » et « noyade au gué ». Ce sont des
  tests de longue simulation sur monde 400x400 graine 42 avec **coordonnées codées en dur**
  ((300,300), (305,305), première rivière trouvée par balayage) : en V1 ces cases étaient de
  l'océan (aucun prédateur) ; sur la nouvelle carte ce sont des terres (taïga/prédation à
  (300,300) — les 20 individus téléportés se font tuer ; première rivière en zone froide en haut
  de carte). Causes racine tracées, à recalibrer par Work sur le nouveau monde comme prévu.
- **Temps de génération 1000x1000 mesuré** (Node 22, sandbox, 5 graines 42/7/1234/2026/999) :
  **347 à 513 ms** (médiane ~410 ms) — cible < 3 s respectée avec marge.

## Checklist de complétude

- [x] Côtes organiques, plus aucun cercle reconnaissable
- [x] Chaînes de montagnes en crêtes, pas de dômes
- [x] Eau profonde au large + plateaux continentaux lisibles
- [x] Plages 1-3 tuiles, seulement côtes basses et chaudes
- [x] Humidité continue, plus aucune ligne droite de biome
- [x] Écotones en mosaïque aux frontières de biomes
- [x] Rivières : confluences, lacs, troncs rectilignes en plaine
- [x] Fraction de terre cible respectée sur plusieurs graines (29,2-29,4 % mesurées à 1000x1000)
- [x] Contrat de sorties intact (le reste de la sim inchangé)
- [x] Déterminisme vert, tests de propriétés verts, temps de génération mesuré (banc et
  simulations longues : Work s'en charge après le push — 3 tests de calibration listés ci-dessus)
- [x] Rapport INTERPRETATIONS.md rédigé, commit poussé
