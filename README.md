# Yam's Sandra d'amour — V10

Créé par **Loïc Bordier** • 2026

## Nouveautés V10

- dés entièrement redessinés avec vrais points ;
- animation de lancer 3D plus fluide avec rebond/tourbillon ;
- les dés gardés restent en place et sont clairement marqués ;
- petit son de dés généré directement par le navigateur, désactivable ;
- vibration légère sur appareil compatible ;
- animation YAMS plein écran avec confettis et son de victoire ;
- indicateur de connexion ;
- reconnexion progressive améliorée ;
- moyenne de score dans les statistiques personnelles ;
- correction du bouton « À propos » dupliqué en V9 ;
- toutes les fonctions multijoueur V9 conservées.

## Test local

```bash
cd ~/Desktop/yams_mobile
go mod tidy
chmod +x run_mac.sh
./run_mac.sh
```

Puis ouvrir `http://localhost:8080`.

## Envoi GitHub / Render

```bash
cd ~/Desktop/yams_mobile
go mod tidy
git init
git remote add origin https://github.com/hgnhyv8k76-web/yams-mobile-online.git
git branch -M main
git add .
git commit -m "Yam Sandra V10 animations des"
git push -u origin main --force
```


## V10.1 FIX — design néon + dés 3D

Cette version corrige et améliore :
- badge **En ligne** toujours visible ;
- header responsive sans chevauchement ;
- cartes et boutons plus arrondis ;
- dés avec profondeur 3D plus marquée ;
- ombre portée plus naturelle ;
- reflets brillants ;
- points plus gros et mieux lisibles ;
- animation de rotation plus longue et plus crédible ;
- petit rebond à l'arrêt ;
- dé gardé bleu lumineux + badge `GARDÉ` ;
- cache PWA changé en `yams-sandra-v10-1-fix`.

La mention **Créé par Loïc Bordier** est conservée.


## V10.2 FIX
- animation des dés allégée spécialement sur téléphone ;
- plus de redessin répété des points pendant le lancer mobile ;
- animation principalement GPU via `transform` ;
- son/vibration allégés sur téléphone ;
- sous-total As à Six visible ;
- seuil de 63 points visible ;
- prime +35 visible et incluse dans le total ;
- bouton Règles avec explication claire : 63 points ou plus = +35 points ;
- cache PWA V10.2.
