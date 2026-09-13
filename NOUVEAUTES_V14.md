# V14 — Défis, QR code, réactions et son mobile

## Défis en trois ou cinq manches

À l’accueil, « Format de la partie » permet de choisir les manches libres ou un défi en 3/5 manches, en solo comme en multijoueur. Le format est fixé à la création et sauvegardé avec la partie.

Le classement cumulé additionne les scores des manches terminées, prime comprise. Les victoires de manche sont indiquées séparément ; elles ne remplacent pas le total des points. Le meilleur total remporte le défi, avec victoire partagée en cas d’égalité. Les homonymes restent distincts.

L’hôte prépare chaque manche suivante, puis les humains confirment leur disponibilité avec « Je suis prêt ». Après la dernière manche, la série est terminée : créer une nouvelle table permet de rejouer. Les inscriptions et départs définitifs sont bloqués entre les manches d’un défi entamé, pour conserver les mêmes participants. « Accueil » préserve la reprise ; le remplacement temporaire d’un absent par un robot reste disponible.

## QR code d’invitation

Le bouton « QR code » de la table affiche le lien à scanner, le code lisible et un lien cliquable de secours. L’image est produite par le serveur avec la bibliothèque Go `github.com/skip2/go-qrcode`, sans envoyer l’invitation à un service tiers. Elle contient uniquement l’adresse publique et le code de partie, aucun jeton personnel.

Un QR affichant `localhost` n’est pas accessible depuis un autre téléphone : ouvrir d’abord la table via l’adresse Wi-Fi du serveur ou l’adresse du site public. Cette limite est indiquée dans la fenêtre. L’invitation ne contourne pas les restrictions de partie complète ou déjà commencée.

## Réactions animées

Les réactions ❤️ 😂 🎲 👏 apparaissent pendant 1,8 seconde au-dessus du joueur qui les envoie. Elles restent aussi dans le chat. Les réactions anciennes ne sont pas rejouées lors d’une reconnexion ; un délai minimum entre envois limite les rafales.

« Ambiance » propose un bouton pour masquer les animations sur cet appareil. Le réglage est mémorisé. Avec la préférence système de réduction des mouvements, l’emoji apparaît sans déplacement.

## Son sur téléphone

Le moteur réactive maintenant les contextes audio `suspended` et `interrupted`. Ce dernier état peut notamment survenir après un passage en arrière-plan sur Safari iOS : [documentation MDN](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state).

L’activation est tentée au relâchement tactile (`touchend`) et au clic, en plus du clavier et du début d’appui. Une tentative encore bloquée au début de l’appui peut être renouvelée à sa fin. Si un effet arrive pendant la reprise, seul le dernier effet récent est conservé ; il est abandonné si le son est coupé ou la page masquée.

Dans « Ambiance », « Tester / réactiver le son » recrée le moteur audio puis joue deux notes. Le volume des effets y est aussi réglable. Le message confirme le démarrage du moteur, pas le son réellement entendu : vérifier le volume multimédia, le mode silencieux et une éventuelle sortie Bluetooth si le test reste inaudible. Le fond sonore conserve son volume indépendant.

## Vérifications

- `go test -race ./...` : réussi, dont les totaux sur 3/5 manches, les égalités, le verrouillage des participants, l’enchaînement de trois manches et la sauvegarde.
- `node --test app_test.js audio_test.js ui_test.js` : 18 tests réussis, dont les interruptions audio, la réactivation tactile, le test sonore et l’absence de répétition des réactions.
- Syntaxe des scripts, compilation Go et `git diff --check` : réussis.
- Navigateur : défi de trois manches créé, classement initial affiché, invitation QR chargée, réaction attribuée au joueur, masquage et test audio contrôlés. Rendu à 390 px sans débordement horizontal ni erreur console.
- Le QR de test a été décodé avec Apple Vision ; son contenu correspondait exactement au lien attendu.
- Pas d’écoute vérifiée sur téléphone physique. Les tests simulent les transitions d’état audio, sans garantir le routage ou le volume de chaque appareil.

Les fichiers web sont intégrés au programme : recompiler/relancer le serveur ou déployer la version après envoi sur GitHub. Le cache PWA est versionné V14.
