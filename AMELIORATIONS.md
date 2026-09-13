# Analyse et améliorations — V11.1

## Fiabilité des résultats — V11.1

- Chaque résultat de manche conserve désormais une liste de joueurs avec identifiants, noms et scores. Les homonymes restent distincts dans l’historique.
- Tous les joueurs au meilleur score gagnent en cas d’égalité ; l’écran de résultat affiche les mêmes médailles aux ex æquo. Une victoire partagée compte comme une victoire personnelle.
- Les statistiques personnelles utilisent les identifiants des gagnants, et non leur nom. Les anciennes statistiques déjà enregistrées ne sont pas recalculées.
- Le classement final reste intact après le départ d’un joueur et après une revanche. Les nouvelles inscriptions attendent que l’hôte prépare la prochaine manche.
- Le cache PWA change de version pour distribuer le JavaScript mis à jour.

Validation : `go test -race ./...` réussi, dont un scénario de fin de manche avec homonymes, égalité, sauvegarde SQLite et revanche ; 8 tests JavaScript réussis, dont les statistiques et l’affichage des médailles. Syntaxe JavaScript et `git diff --check` validés. Aucun nouveau contrôle visuel sur téléphone physique.

## Intervention précédente — V10.3

Le projet dispose d’un moteur de score cohérent, d’une interface mobile, d’un chat et d’un classement SQLite. Cette intervention conserve son identité visuelle et le nom de son créateur.

## Corrections réalisées

- Les écritures WebSocket sont sérialisées par connexion, avec une limite de temps. Les diffusions d’un salon sont aussi sérialisées.
- L’identité est transmise dans un message privé explicite. Deux joueurs portant le même nom ne dépendent plus d’une déduction du navigateur.
- La reconnexion exige un jeton secret absent des états publics. Une ancienne connexion ne peut plus déconnecter sa remplaçante. Les anciens identifiants sans jeton nécessitent de rejoindre une nouvelle partie après la mise à jour.
- Contrôle d’origine WebSocket standard et limite de taille des messages entrants.
- Les tentatives de redémarrer une manche ou d’effacer ses scores avec une revanche prématurée sont rejetées.
- Quitter un salon libère une place et transfère le rôle d’hôte. Pendant une manche, l’interface oriente vers Accueil pour préserver la reprise.
- Les temporisateurs de reconnexion sont annulés lors du retour à l’accueil. Les écouteurs réseau ne sont plus ajoutés à chaque retour.
- Le classement vide retourne une liste vide ; le navigateur accepte aussi l’ancien format null et affiche les erreurs de chargement.
- Les invitations préremplissent le code. Les dés et les cases disponibles sont accessibles au clavier ; les champs ont des libellés et les messages sont annoncés aux lecteurs d’écran.
- Le service worker ne met en cache que les ressources prévues, ne supprime que les anciens caches Yam’s et fournit une réponse de secours explicite.

## Vérification

- `go test -race ./...` : succès. Scores, seuil de prime, transitions interdites, confidentialité du jeton, reconnexion, joueurs homonymes et départ/transfert d’hôte.
- `node --test app_test.js` : 4 tests réussis (aperçu des scores et classement vide/null/erreur).
- `node --check web/app.js` et `node --check web/sw.js` : succès.
- Pas de validation visuelle sur téléphone physique effectuée.

## Limites restantes

- Les salons restent en mémoire : un redémarrage du serveur interrompt les parties. SQLite ne conserve que les résultats.
- Un joueur absent pendant une manche peut encore bloquer son tour ; il reste à définir une règle de remplacement ou d’abandon.
- Le classement global SQLite conserve les noms sans compte joueur permanent ; les corrections V11.1 concernent les résultats de manche et les nouvelles statistiques personnelles.
- Les salons inactifs ne sont pas encore purgés automatiquement.

Relancer le serveur Go après application : les fichiers web sont intégrés au binaire. Aucun déploiement distant ni modification des données SQLite n’a été effectué.
