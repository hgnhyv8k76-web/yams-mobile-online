# Yam’s — Édition Maison V11

Refonte graphique : vert profond, ivoire, laiton, typographie de caractère et dés en relief dessinés en CSS. Aucun téléchargement de police, image externe ou bibliothèque graphique nécessaire.

- Accueil composé avec illustration de dés, présentation du jeu et panneau de création/rejoindre.
- Table sur deux colonnes sur ordinateur ; ordre mobile : joueurs, dés, feuille de score, chat.
- Dés ivoire, état gardé doré, animation de lancer et mouvement réduit respecté.
- Feuille de score avec pictogrammes, points possibles et progression vers la prime.
- Confirmation de score intégrée, dont message spécifique pour une case à zéro ; vérification que le tour n’a pas changé avant l’envoi.
- Fenêtres, classement, chat et statistiques harmonisés.
- Styles précédents remplacés par une feuille cohérente ; fonctionnalités et identité conservées.

Vérifications : accueil et partie inspectés dans le navigateur sur ordinateur et au format mobile 390 × 844 ; partie à deux joueurs, lancer, dé gardé, validation de 10 points et passage de tour. Aucun message d’erreur JavaScript dans la session finale. Les quatre tests JavaScript existants passent.

Les fichiers web étant intégrés au binaire Go, relancer/recompiler le serveur pour charger cette version. Le cache PWA porte un nouveau nom. Aucun déploiement en ligne effectué.


## V12 — Retours visuels et sonores

- Table active soulignée d’or, repères des trois lancers, progression individuelle et avatars encadrés.
- Dés gardés identifiés par une coche, scores possibles plus contrastés et retour visuel après validation.
- Bruit de lancer composé de petits impacts filtrés ; notes distinctes pour garder/libérer un dé, valider un score, commencer son tour et célébrer une victoire.
- Moteur Web Audio unique, activé par un geste utilisateur, avec volume mémorisé et coupure immédiate. Les effets sont silencieux lorsque la page est masquée. Aucun fichier audio externe.
- Les animations JavaScript des dés et les confettis respectent la préférence de réduction des mouvements. Les célébrations ne se rejouent plus sur la seule lecture d’un ancien message de chat.
- Champs mobiles à 16 px pour éviter le zoom automatique de saisie.

Validation : compilation Go, 10 tests JavaScript, contrôle de syntaxe des trois scripts et contrôle du diff. Parcours réel dans le navigateur à deux joueurs : préparation, lancer, dé gardé, mode muet, volume, validation de 15 points et changement de tour. Rendu inspecté à 1280 px et 390 px, sans débordement horizontal ni erreur console. Qualité sonore perceptive sur téléphone physique non évaluée.
