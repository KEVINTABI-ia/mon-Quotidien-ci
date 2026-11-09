# Service d'envoi des notifications — Mon Quotidien CI

Ce Worker Cloudflare consomme la collection Firestore `notifications_queue` et envoie les notifications avec Firebase Cloud Messaging HTTP v1. Il fonctionne indépendamment de Firebase Cloud Functions et ne nécessite pas de passer le projet Firebase en formule Blaze.

## Sécurité

- Le compte de service Firebase est un secret Cloudflare Worker, jamais un fichier du dépôt.
- Ne jamais coller la clé privée dans `index.html`, GitHub, un ticket ou une conversation.
- Le Worker ne traite que les documents dont `status == "pending"`.
- Un document est verrouillé avec son `updateTime` avant envoi pour limiter les doubles traitements.
- Les jetons invalides sont supprimés de `appareils_notifications`.

## Déploiement Cloudflare

1. Dans Cloudflare, ouvrir **Workers & Pages** puis créer un Worker nommé `mon-quotidien-ci-notifications`.
2. Remplacer le code de démarrage par le contenu de `src/index.js` (fichier du dépôt).
3. Dans **Settings > Variables and Secrets**, créer ces secrets :
   - `FIREBASE_PROJECT_ID` = `mon-transport-ci`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = contenu complet du JSON d'un compte de service Firebase/Google autorisé à lire/écrire Firestore et envoyer FCM.
   - `DISPATCH_SECRET` = une longue valeur aléatoire unique (pour les tests manuels).
4. Dans **Settings > Triggers**, ajouter le Cron `* * * * *` (une fois par minute).
5. Déployer, puis vérifier l'URL `/health` du Worker.

### Création du compte de service

Dans Google Cloud Console, sélectionner le projet `mon-transport-ci`, créer un compte de service dédié, puis lui attribuer uniquement les rôles nécessaires à Firestore et Firebase Cloud Messaging. Générer une clé JSON et la conserver hors du dépôt. La clé JSON complète est sensible.

## Format de la file Firestore

Chaque document `notifications_queue/{id}` doit contenir :

```js
{
  status: "pending",
  title: "Mon Quotidien CI",
  body: "Une nouvelle information est disponible.",
  targetUid: "UID_UTILISATEUR", // facultatif : absent = tous les appareils enregistrés
  data: { type: "information", route: "informations" }, // chaînes uniquement
  createdAt: serverTimestamp()
}
```

États : `pending` → `processing` → `sent` ou `failed`.

**Important :** cette première livraison fournit le moteur d'envoi et son format de file. Les actions de l'application ne doivent pas encore créer directement des événements dans cette collection. Les producteurs d'événements et leurs règles Firestore seront ajoutés séparément après vérification de chaque parcours, pour éviter qu'un utilisateur puisse fabriquer des notifications ou cibler d'autres comptes.

## Test manuel

Une fois les secrets configurés, envoyer une requête POST à `/dispatch` avec l'en-tête `Authorization: Bearer <DISPATCH_SECRET>`. Le Cron fonctionne ensuite automatiquement.
