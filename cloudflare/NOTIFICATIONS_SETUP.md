# Relais sécurisé des notifications — Mon Quotidien CI

Ce Worker est le relais serveur FCM. Il ne contient aucune clé privée dans le dépôt.

## Fonctionnement
- Un déclencheur Cron vérifie chaque minute la collection Firestore `notifications_queue`.
- Il traite au maximum 25 documents dont `status = "pending"`.
- Chaque document doit contenir `recipientUid`, `title`, `body`, `createdAt` et `status`.
- Les jetons sont recherchés dans `appareils_notifications` par UID.
- Après tentative, le document passe à `sent`, `no_device` ou `invalid`.

## Secrets Cloudflare à configurer
Dans **Workers & Pages → mqci-notification-relay → Settings → Variables and Secrets**, ajouter comme secrets :
- `FIREBASE_CLIENT_EMAIL` : champ `client_email` du compte de service Firebase.
- `FIREBASE_PRIVATE_KEY` : champ `private_key` complet, avec ses lignes PEM.
- `FIREBASE_PROJECT_ID` : `mon-transport-ci` (variable texte).

Le compte de service doit avoir les autorisations Google nécessaires pour lire/mettre à jour Firestore et envoyer des messages FCM. Ne jamais publier le fichier JSON ni la clé privée dans GitHub, ici dans le chat, ou dans le code du site.

## Déclencheur
Configurer le Cron : `* * * * *` (une exécution par minute).

## Sécurité et état
Les documents de file doivent être créés par l'administrateur ou par un backend de confiance. Ne jamais permettre à un visiteur de créer librement une notification ou de choisir un destinataire. La collection doit rester inaccessible en lecture publique.
Les événements de l'application (information, emploi validé, objet publié, Gbairai, acceptation et fin de livraison) doivent être reliés à cette file dans une étape distincte avant d'annoncer que les notifications automatiques sont actives.

## Test de santé
Après configuration, ouvrir l'URL du Worker suivie de `/health`. La réponse doit indiquer `configured: true`.
