# Presets de l'Atelier des variables

Chaque fichier `.json` de ce dossier est un **preset** (préréglage) enregistré depuis l'Atelier des
variables (bouton « Atelier » ou touche **F2** dans le jeu). Ce dossier est versionné : un preset
enregistré peut être partagé en le validant (commit) avec GitHub Desktop.

Un preset ne contient que les **différences** avec les valeurs par défaut des fichiers de `data/`,
rangées par fichier puis par variable :

```json
{
  "nom": "Loups affamés",
  "valeurs": {
    "animals.json": {
      "species.wolf.hungerPerDay": 20,
      "humanPrey.minHunger": 20
    }
  }
}
```

- La clé d'une variable suit le fichier JSON : les noms des objets, séparés par des points ; une entrée
  de liste est désignée par son `id` (`species.wolf`) ou, à défaut, par son rang à partir de 0
  (`tribe.adultAge.1` = l'âge maximal des adultes).
- Charger un preset remet d'abord toutes les variables à leur valeur par défaut, puis applique ses valeurs.
  Une variable inconnue ou une valeur devenue invalide est ignorée, avec un message.
- Les variables « en direct » s'appliquent au monde en cours ; les autres au prochain monde.
