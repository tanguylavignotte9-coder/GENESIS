# Genesis

Simulateur de civilisation humaine profonde, pixel art vu de haut. V1 : un monde vivant sans guerre, où le joueur est un **pur observateur** — la valeur du jeu est dans les histoires qui émergent seules.

## Stack

- **Electron + TypeScript** : exécutable Windows autonome (`npm run pack` produit un `.exe` via electron-builder).
- **PixiJS (WebGL)** pour le rendu ; **Web Worker** pour la simulation.
- Cœur de simulation en **TypeScript pur**, indépendant du rendu, testable en Node (`src/sim/`). Electron/PixiJS ne font que rendre et saisir.
- **Variables externalisées** dans `config/*.jsonc` (un fichier par domaine, commentaires en français, unités indiquées) : aucune valeur de calibrage en dur dans le code. Validation au chargement avec messages d'erreur clairs ; empreinte des fichiers embarquée dans la sauvegarde (reprise exacte garantie, avertissement explicite sinon).
- **Déterminisme** : RNG seedé sérialisable, état complet sérialisable, format de sauvegarde versionné avec migrations.

## Lancer le jeu en 1 clic (Windows)

Double-clic sur **`Genesis.exe`** (à la racine du dépôt) :

1. vérifie si **Node.js** est installé sur le PC — sinon le **télécharge et l'installe automatiquement** dans `node-runtime/` ;
2. vérifie si les dépendances (`node_modules`, dont le binaire **Electron**) sont présentes — sinon lance **`npm install` automatiquement** ;
3. compile le jeu (`npm run build`) puis **ouvre la fenêtre Genesis**.

Aucune installation manuelle requise : une console affiche la progression, et en cas de crash de l'app un fichier `genesis-erreur.log` est écrit dans le dossier des données de l'app.

Le lanceur est un petit exécutable autonome (~10 Mo, source Go dans `launcher/`, recompilable avec `cd launcher && GOOS=windows GOARCH=amd64 go build -o ../Genesis.exe .`) — il ne embarque pas le jeu, il ne fait que bootstrap Node + dépendances + lancement.

## Commandes (développement)

```bash
npm install        # télécharge les dépendances (dont le binaire Electron)
npm start          # build + lance le jeu en dev (fenêtre Electron)
npm test           # tests vitest (déterminisme, sauvegarde, monde, config, temps, journal)
npm run typecheck  # tsc --noEmit
npm run bench      # banc de performance headless (résultats dans banc/dernier-banc.json)
node dist/scripts/banc.js --seed 7 --mois 48 --individus 5000   # banc personnalisé
```

## Arborescence

```
config/               variables de calibrage (jsonc commentés, français)
src/sim/              cœur de simulation (TypeScript pur, zéro dépendance au rendu)
  monde/              tuiles (6 niveaux, matières, gisements), générateur, climat, météo, végétation
  temps/              calendrier (mois), saisons par latitude, pause + vitesses ×1..×50
  entites/            individu (besoins, personnalité, génétique, mémoire), actions extensibles
  faune/              animaux individuellement simulés : espèces par biome, prédation, carcasses, migrations
  groupes/            bandes → nations, territoire émergent
  savoir/             connaissances atomiques à prérequis (graphe)
  economie/           objets individuels avec histoire, stocks physiques
  culture/            langues (divergence), religions génératives
  batiments/          entités bâtiments (chantier, usure, stocks)
  journal/            journal d'événements — lecture seule pour la simulation
  sauvegarde/         format versionné + migrations + empreinte config
  worker/             Web Worker : boucle de simulation
  simulation.ts       orchestrateur : les systèmes ne parlent que via l'état partagé
  banc.ts             banc de performance (mesures headless)
src/main/             processus principal Electron (fenêtre, protocole app://, IPC sauvegardes)
src/preload/          contextBridge (API sécurisée vers le renderer)
src/renderer/         PixiJS : carte, caméra/zoom continu, barre de vitesses, panneau journal
scripts/banc.ts       CLI du banc de performance
tests/                tests vitest
docs/                 design doc et rapports d'interprétation
```

## Principes d'architecture (figés)

- Les systèmes ne s'appellent jamais directement : ils lisent/écrivent uniquement **l'état partagé** (tuiles, individus, objets, bâtiments, groupes). L'individu est le hub de tout.
- Le **journal est en lecture seule** : il constate, il n'influence jamais.
- **Zéro hard cap** : seules des constantes biologiques/physiques (dans `config/`), jamais des plafonds de gameplay.
- Le joueur ne modifie jamais la simulation en V1.

Voir `docs/INTERPRETATIONS.md` pour les choix d'interprétation faits sur les zones ouvertes du design doc.

## Jalons

- **J1 ✅** — socle technique, monde minimal, banc, tests (commit initial).
- **J2 ✅** — monde complet (relief, rivières, climat, saisons, météo, végétation, gisements), faune simulée, écran de démarrage seed/bandes/taille.
- **J3 ✅** — bandes initiales, individus vivants (besoins, survie, reproduction + génétique, sénescence émergente, morts avec causes, cannibalisme de famine), fiche inspectable au clic.
- **J4 ✅** — sédentarisation (campement→village par huttes permanentes), chantiers réels, objets + troc, gouvernance (succession), territoires selon le zoom, fiches groupe, filtre journal.
- **J5 ✅** — langues divergentes (nouvelle langue à l'isolement), religions génératives (prophète, propagation, schisme, sceptiques), santé mentale (traumatismes, folie), biographies factuelles, saga du moment, favoris.
- **J6 ✅** — arbre tech à prérequis, percées de génies, transmission, mines épuisables, monnaie (pièces), pollution industrielle, nations, écrans éco/religions/langues/généalogies.
- **J7 ✅ — V1 TERMINÉE** — autosave + 3 slots manuels avec reprise exacte, écran de fin extinction + chronique de l'espèce, LOD par zone caméra, calibration multi-graines au banc, 72 tests verts.
