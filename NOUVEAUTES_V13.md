# Yam’s V13 — Solo et parties sauvegardées

## Jouer

- **Solo** : choisir Facile, Normal ou Difficile à l’accueil, puis « Jouer en solo ». Le joueur humain commence ; une connexion au serveur reste nécessaire.
- **Facile** : un lancer et une case positive choisie au hasard parmi les cases disponibles.
- **Normal** : recherche de groupes de dés identiques et choix du meilleur score immédiat.
- **Difficile** : comparaison des 32 choix de dés gardés à partir de simulations de relance, avec prise en compte de la prime supérieure et des cases à préserver. Il s’agit d’une stratégie heuristique, pas d’un solveur optimal.
- Les robots emploient le même moteur de lancer et de score que les humains. Ils marquent leurs propres cases et sont prêts automatiquement pour une revanche. Ils se mettent en pause quand aucun humain n’est connecté.

## Reprise et joueurs absents

Chaque action acceptée est enregistrée dans SQLite avant d’être diffusée. La sauvegarde comprend les dés, les dés gardés, le tour, les scores, les manches passées et les jetons privés de reconnexion. Si l’enregistrement d’une action échoue, son effet est annulé et une erreur est renvoyée. L’enregistrement de la fin de manche et du classement est transactionnel, sans doublons après reconnexion.

Après redémarrage, ouvrir « Reprendre la partie en cours » depuis le même navigateur. Un onglet resté ouvert tente automatiquement de se reconnecter. Les jetons ne sont jamais inclus dans l’état public partagé aux joueurs.

L’hôte peut confier un joueur déconnecté à un robot depuis sa carte. Une confirmation explique le remplacement et permet de choisir le niveau. Les dés, les points et l’identité du joueur sont conservés. À sa reconnexion, le joueur reprend immédiatement la main ; les points inscrits par le robot restent acquis. La feuille de cette manche porte la marque « assistée » et n’entre pas dans le classement global. Le remplacement n’est autorisé ni sur un joueur connecté ni après la fin de manche. Une connexion interrompue est détectée par ping/pong, avec un délai maximal de lecture de 45 secondes.

**Stockage du site public :** `render.yaml` utilise actuellement une offre `free` et ne déclare aucun disque persistant. La sauvegarde protège les redémarrages qui conservent le fichier SQLite. Pour conserver les parties lors d’un remplacement du conteneur ou d’un redéploiement, héberger `DB_PATH` sur un stockage persistant. Aucune offre payante ni configuration distante n’a été modifiée. Copier seulement le programme sans sa base ne transfère pas les parties.

Les sauvegardes ne sont pas purgées automatiquement. Les parties déjà perdues avant cette version ne peuvent pas être récupérées. Effacer le stockage du navigateur supprime la possibilité de reprendre sa place depuis cet appareil.

## Feuilles, apparence et bilan

- Toucher une carte joueur ouvre ses 13 cases, sa prime et son total en lecture seule. La feuille se met à jour pendant le jeu.
- « Ambiance » propose les thèmes tapis vert, bleu nuit et bois chaleureux, et les dés ivoire, bleu glacier ou rose poudré. Ces choix sont mémorisés sur l’appareil.
- La fin de manche présente un podium respectant les égalités et le meilleur coup validé : combinaison, dés, points et nombre de lancers. C’est la combinaison effectivement inscrite qui est retenue, hors prime.
- L’historique compare les scores individuels au fil des manches, avec des barres dans un tableau consultable horizontalement. Les homonymes restent distincts grâce à leur identifiant.
- Le fond sonore est composé d’accords doux synthétisés localement, désactivés par défaut, avec un volume distinct de celui des effets. Il s’arrête quand la page est masquée. Aucun fichier audio distant.

## Validation

```sh
go test -race ./...
node --test app_test.js audio_test.js ui_test.js
node --check web/app.js
node --check web/audio.js
node --check web/features.js
node --check web/sw.js
```

Les tests serveur couvrent notamment les parties complètes aux trois niveaux, la reprise depuis une base sur disque, le secret des jetons, les autorisations de remplacement, le retour du joueur, la pause des robots et l’annulation d’une action si SQLite échoue. Les tests audio couvrent les volumes indépendants, le mode muet et la visibilité de la page.

Validation manuelle : création solo difficile, lancer humain, tour automatique du robot, consultation de sa feuille, choix du thème bleu et des dés glacier, activation du fond sonore et réglage du volume. Après arrêt puis redémarrage du serveur, les dés `[3,6,6,6,4]`, le premier lancer et les scores 14/30 ont été retrouvés par reconnexion automatique. Le podium et l’évolution sur trois manches ont été inspectés avec une fixture dans une base séparée ; affichage mobile à 390 px sans débordement. Douze tests JavaScript réussis. La qualité sonore sur téléphone physique n’a pas été évaluée.
