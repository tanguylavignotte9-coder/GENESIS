# Données du jeu

Chaque fichier JSON de ce dossier contient des réglages du jeu. Ils sont vérifiés au
lancement : si une valeur est invalide, le jeu affiche un message clair en français.

## `time.json` — le temps

| Clé | Rôle | Valeur actuelle |
| --- | --- | --- |
| `ticksPerRealSecond` | Nombre de « tics » (pas de simulation) calculés par seconde réelle en vitesse x1 | 10 |
| `ticksPerDay` | Nombre de tics dans une journée de jeu (4 800 tics à 10 par seconde = 8 minutes réelles) | 4800 |
| `daysPerYear` | Nombre de jours dans une année de jeu (calendrier compressé) | 40 |
