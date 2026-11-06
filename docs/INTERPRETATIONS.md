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
