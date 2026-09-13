# Yam’s Sandra d’amour — Édition Maison V13

Créé par **Loïc Bordier** • 2026

Ce dossier contient la nouvelle interface : vert profond, ivoire et doré, dés en relief, accueil redessiné, feuille de score avec jauge de prime et confirmation de score intégrée. Les corrections multijoueurs et de reconnexion sont incluses.

La V12 ajoute le repérage du tour actif, la progression des joueurs, des effets sonores distincts et un volume mémorisé. Les sons sont synthétisés sur l’appareil, sans téléchargement audio. Le réglage système de réduction des animations est respecté.

La V13 ajoute le solo contre trois niveaux de robot, les parties sauvegardées, le remplacement temporaire des absents, les feuilles adverses, trois thèmes, le podium et un fond sonore facultatif. Voir [les nouveautés et leurs limites](NOUVEAUTES_V13.md).

## Lancer sur Mac

Depuis le Terminal :

```bash
cd ~/Desktop/yams_mobile
bash run_mac.sh
```

Ouvrir ensuite http://localhost:8080. Go doit être installé. Les fichiers web sont intégrés au programme : arrêter le serveur précédent puis relancer cette commande après une modification.

## Lancer sur Windows

Avec Go installé, exécuter `run_windows.bat`, puis ouvrir http://localhost:8080.

## Vérifier

```bash
go test -race ./...
node --test app_test.js audio_test.js ui_test.js
node --check web/features.js
node --check web/audio.js
node --check web/app.js
node --check web/sw.js
```

## Détails

- [Refonte graphique V11](DESIGN_V11.md)
- [Corrections et limites connues](AMELIORATIONS.md)

Les parties et le classement sont enregistrés dans SQLite (`DB_PATH`, par défaut `data/yams.db`). La reprise après redémarrage exige que ce fichier soit conservé. La configuration Render actuelle ne déclare pas de disque persistant : voir [les conditions de stockage](NOUVEAUTES_V13.md).

## Site public

Modifier ce dossier ne met pas automatiquement à jour le site Render. La publication nécessite un envoi vers le dépôt GitHub relié au service, puis un déploiement Render. Le fichier `render.yaml` décrit le service et le `Dockerfile` construit le programme avec ses fichiers web.
