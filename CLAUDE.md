# GENESIS — règles du projet pour Claude Code

GENESIS est un simulateur de monde et de civilisation où **chaque individu est simulé**
et où les histoires naissent de façon **émergente et systémique**. Le joueur est spectateur.

- La vision complète, les systèmes et les données de contenu sont dans **`docs/design.md`**.
  Lis-le avant toute tâche de conception ou de nouveau système.
- **`docs/journal-de-dev.md`** est la mémoire du projet entre les sessions (chaque session
  repart sans historique de conversation) : décisions validées, écarts, dette technique, mesures.
  **Tu es le seul à écrire dans ce fichier.** **Lis-le en début de session**, et **complète-le en fin d'étape** (nouvelle entrée en haut :
  fait, décisions et écarts, dette technique avec l'étape prévue, mesures). Quand tu résous une
  dette technique, indique-le dans l'entrée de l'étape en cours.
- Si une session reprend une étape commencée ailleurs, regarde d'abord `git log` et l'état du
  code pour savoir ce qui est déjà fait.
- Le propriétaire du projet (Tanguy) ne code pas : tout le code est écrit par Claude.
  Explique tes choix en français simple dans tes messages de commit et ton compte rendu de fin de tâche.

## Les 5 piliers (ils tranchent toute décision)

1. **Chaque individu compte.** Rien n'est statistique : chaque humain, animal et plante est une entité simulée.
2. **Émergence, jamais de script.** Aucun événement écrit à l'avance.
3. **Tout est lisible.** Chaque événement enregistre ses causes pour que le journal puisse expliquer le « pourquoi ».
4. **Un monde cohérent.** Géographie, climat et ressources conditionnent tout.
5. **Moteur modulaire et piloté par les données.** Systèmes séparés, variables externalisées, un concept n'est codé qu'une fois.

## Stack

- TypeScript (strict), Electron, PixiJS (rendu de la carte), HTML/CSS (HUD), Vite (build), Vitest (tests).
- **Aucun moteur externe. Aucune compilation sur GitHub.** Tout le code source est dans le dépôt.
- Le jeu se lance sous **Windows** par double-clic sur `Lancer-GENESIS.bat` (voir plus bas).
- Dépendances minimales, versions figées dans `package-lock.json`. Toute nouvelle dépendance doit être justifiée dans le compte rendu.

## Structure du dépôt

```
Lancer-GENESIS.bat      lanceur Windows (point d'entrée du joueur)
CLAUDE.md               ce fichier
docs/design.md          design doc (référence de conception)
data/                   fichiers JSON : paramètres, savoirs, recettes, bâtiments…
src/
  sim/                  CŒUR DE SIMULATION — TypeScript pur
    core/               graine aléatoire, horloge, état du monde, journal d'événements
    systems/            un dossier par système : world, individuals, groups,
                        production, ideas, conflict
  worker/               point d'entrée du fil de simulation (Web Worker)
  shared/               types des messages échangés entre simulation et affichage
  main/                 processus principal Electron
  renderer/             affichage : carte PixiJS + HUD HTML/CSS
tests/                  tests Vitest (unitaires + simulations sans écran)
```

## Règles d'architecture (non négociables)

1. **`src/sim/` n'importe jamais** Electron, PixiJS, le DOM, ni rien de `renderer/` ou `main/`.
   La simulation doit pouvoir tourner dans Node, sans écran, dans les tests.
2. **La simulation tourne dans un fil séparé** (`worker/`). L'affichage reçoit des instantanés ou des
   différences via des messages typés définis dans `shared/`.
3. **Déterminisme.** Toute source d'aléatoire passe par le générateur à graine de `sim/core`.
   Interdit dans `sim/` : `Math.random()`, `Date.now()`, `performance.now()` et l'ordre d'itération
   non garanti. Même graine + mêmes données = même monde et même histoire.
4. **Variables externalisées.** Aucun chiffre de gameplay en dur dans le code (vitesses, durées,
   probabilités, seuils…). Tout vit dans `data/*.json`, validé au chargement par un schéma
   (message d'erreur clair en français si un fichier est invalide).
   **Chaque variable est documentée dans son schéma** : libellé et légende en français, unité,
   bornes min/max, et si un changement s'applique en direct ou exige un nouveau monde.
   Ces métadonnées alimenteront la future page « Atelier des variables » (modification en direct
   et presets) : toute nouvelle variable doit les avoir dès sa création.
8. **Rendu centralisé.** Chaque type d'entité (tuile, plante, animal, humain, bâtiment) a sa
   fonction de dessin à un seul endroit de `renderer/`. Remplacer le pixel art procédural par de
   vrais sprites ne doit toucher qu'à ces fonctions.
5. **Un système = un dossier** dans `sim/systems/`, avec un rôle unique. Les systèmes communiquent
   par l'état du monde et par le journal d'événements, pas en s'appelant dans tous les sens.
   Avant de créer un concept, vérifie qu'il n'existe pas déjà (ex. : savoirs, culture, langue,
   religion et monnaie passent tous par le **système d'idées**).
6. **Journal causal.** Tout événement notable est publié dans le journal avec : date de jeu,
   acteurs, lieu, et les identifiants des événements qui l'ont causé.
7. **Performance.** **Priorité absolue : un jeu fluide en x1** (affichage sans à-coups, mouvements
   interpolés). Les vitesses élevées (x100, x500) sont « au mieux » : elles peuvent être saccadées ou
   ralentir. Chaque individu réfléchit à son rythme (réflexions réparties dans le temps,
   pas de recalcul à chaque instant s'il n'y a rien de nouveau). Données lourdes (carte, positions,
   besoins) stockées de façon compacte (tableaux typés). Ne jamais agréger des individus en statistiques.

## Philosophie d'équilibrage (fondamental)

Ton pré-équilibrage ne doit **jamais forcer le destin**. Chaque système doit fonctionner
correctement seul ; c'est leur combinaison qui crée l'histoire, le drame, l'effondrement ou le
triomphe. Il faut distinguer ce qui est **mal équilibré** de ce qui est **simplement l'histoire**.

| Mal équilibré : à corriger | L'histoire : à laisser vivre |
| --- | --- |
| Le même résultat sur presque toutes les graines (toujours l'extinction, toujours l'explosion) | Un résultat extrême dans certains mondes seulement |
| Un comportement individuel absurde (mourir de faim à côté de nourriture accessible) | Une mort logique compte tenu de ce que l'individu savait et pouvait faire |
| Une action ou une stratégie qui domine toujours, une ressource jamais utile | Des choix différents selon le lieu, l'époque et la personnalité |
| Un résultat sans chaîne de causes lisible dans le journal | Un résultat expliqué par ses causes (sécheresse, puis famine, puis exode) |

Règles :
- **Corriger au niveau de l'individu**, en rendant une règle plus réaliste (« un vrai animal ou un
  vrai humain ferait-il ça ? »), jamais en pilotant le résultat global.
- **Interdits** : quotas de population, filets de sécurité qui sauvent une tribu ou une espèce,
  rattrapage automatique du perdant, progrès garanti, événement déclenché pour « relancer »
  l'histoire.
- **Viser des fourchettes plausibles et de la diversité**, pas des valeurs cibles. Juger un
  équilibre sur de nombreuses graines (la distribution des résultats), jamais sur une seule.
- **Tester séparément** : chaque système avec des scénarios contrôlés (il fait ce qu'il doit) ;
  l'ensemble avec des simulations longues qui vérifient l'absence d'absurdités, la présence de
  causes et la variété des histoires, pas un résultat imposé.
- Dans le compte rendu, quand un résultat surprenant apparaît, dis s'il s'agit d'un défaut
  d'équilibre (et ce que tu as corrigé) ou d'une histoire légitime (et sa chaîne de causes).

### Équilibrer sans y passer des heures

Les simulations longues coûtent cher en temps. Méthode :
- **Itérer vite** : pendant les réglages, utilise des simulations courtes et ciblées (carte
  réduite, 30 à 50 ans, 2 ou 3 graines, uniquement le scénario concerné), lancées en parallèle.
- **Valider une seule fois** : une seule validation longue en fin d'étape (par exemple 10 graines,
  200 ans), lancée en parallèle. Si les résultats sont dans des fourchettes plausibles et variés,
  on s'arrête là : pas de nouveau réglage « pour améliorer ».
- **Budget** : si la validation finale doit dépasser environ 45 minutes, réduis-la (moins de
  graines ou d'années) et indique-le dans le compte rendu.
- Après un petit ajustement, ne relance que le test concerné, pas toute la validation.

## Conventions de code

- Identifiants, noms de fichiers et commentaires de code en **anglais**.
- Tout texte visible par le joueur (HUD, journal, menus) en **français**.
- TypeScript `strict`, pas de `any` sauf justification en commentaire.
- Petites fonctions, petits fichiers ; un fichier = une responsabilité.

## Scripts npm attendus

- `npm start` : build puis lancement du jeu (utilisé par le lanceur).
- `npm test` : les tests **rapides** (moins d'une minute au total), à lancer à chaque commit.
- `npm run test:long` : les tests longs (équilibre sur 100 ans, mesures de performance),
  à lancer avant de terminer une étape.
- `npm run typecheck` : vérification des types.
- `npm run sim -- --seed 42 --years 100` : simulation sans écran qui affiche un résumé
  (population, événements marquants, durée de calcul). Outil principal pour vérifier
  qu'un système fonctionne et mesurer la performance.

## Le lanceur Windows `Lancer-GENESIS.bat`

Doit fonctionner sur un Windows récent **sans Node installé et sans droits administrateur** :

1. Utiliser `node` s'il est dans le PATH, sinon télécharger (PowerShell) une version portable
   de Node.js LTS dans `.runtime/` et l'utiliser.
2. Lancer `npm ci` si `node_modules/` manque ou si `package-lock.json` a changé depuis la dernière
   installation (garder une empreinte dans `.runtime/`).
3. Construire puis lancer le jeu (`npm start`).
4. Afficher des messages clairs en français à chaque étape, et en cas d'erreur garder la fenêtre
   ouverte (`pause`) pour que l'on puisse lire le message.

`.gitignore` doit exclure au minimum : `node_modules/`, `.runtime/`, `dist/`, `out/`.

Tu travailles sous Linux et ne peux pas exécuter le `.bat` : relis-le avec soin et indique dans
ton compte rendu ce que Tanguy doit vérifier en le lançant.

## Git : commits directs sur `main`

- **Aucune pull request, aucune branche** : tu commites et pousses directement sur `main`.
  Ne pousse jamais d'autre branche sur GitHub. Si ton outil travaille sur une branche locale,
  fusionne-la dans `main`, pousse `main` seulement, et supprime la branche distante si elle a été
  poussée par erreur.
  (Une branche `beta` sera créée plus tard par Tanguy ; d'ici là, tout va sur `main`.)
- Commits petits et cohérents, messages en **français**, clairs pour quelqu'un qui ne code pas
  (ex. : « Génération du relief et des biomes »).
- Ne pousse que du code qui passe `npm run typecheck` et `npm test` : `main` doit toujours pouvoir
  être lancé avec le `.bat`.

## Façon de travailler

- On avance **étape par étape** selon la feuille de route de `docs/design.md`
  (section « Plan technique »). Une tâche = une étape (ou une partie d'étape).
- **Ne pas anticiper** les étapes suivantes : pas de code « pour plus tard ».
- Si le design doc est ambigu ou si une contrainte technique oblige à s'en écarter, **ne décide pas
  en silence** : choisis l'option la plus simple et cohérente avec les piliers, puis signale-la
  clairement dans ton compte rendu sous un titre « Écarts et questions de design ».
- Ne modifie pas `docs/design.md` toi-même : le design est tenu à jour côté conception.

## Définition de « terminé » pour chaque étape

- `npm run typecheck` et `npm test` passent.
- `npm run test:long` passe **si l'étape a modifié `src/sim/` ou `data/`** (comportement de la
  simulation). Pour une étape qui ne touche que l'affichage, le HUD, les outils ou la
  documentation, il n'est pas nécessaire : indique-le dans le compte rendu.
- Nouveau code de simulation couvert par des tests, dont au moins une simulation sans écran
  déterministe (même graine = même résultat).
- Le jeu se construit et se lance (`npm start`).
- `docs/journal-de-dev.md` est complété.
- Les commits sont poussés sur `main`.
- Le compte rendu de fin de tâche contient, en français : ce qui a été fait, **ce que Tanguy doit
  voir en lançant le jeu**, comment le tester, et les écarts ou questions de design.
