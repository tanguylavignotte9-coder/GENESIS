# Sauvegardes partagées

Les sauvegardes de ce dossier sont **envoyées avec le dépôt** (contrairement au reste de `sauvegardes/`).

Pour transmettre à Claude Code un monde où un problème est apparu :

1. Dans le jeu, ouvrir le panneau **Sauvegardes** (bouton en bas à droite ou touche **F5**).
2. Sauvegarder le monde sous un nom parlant (« loups disparus an 80 »), puis cliquer sur **Partager** :
   la sauvegarde est copiée ici.
3. Avec GitHub Desktop, valider (« commit ») et envoyer (« push ») ce fichier, en décrivant le problème.

Claude Code peut ensuite reprendre ce monde exactement là où il était :
`npm run sim -- --load partage/<nom> --years 10`.

Une sauvegarde pèse environ 15 Mo : supprimez celles qui ne servent plus.
