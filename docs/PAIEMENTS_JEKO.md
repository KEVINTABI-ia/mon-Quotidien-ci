# Paiements Jèko — Mon Quotidien CI

## Architecture

Le checkout Jèko est servi par le Cloudflare Worker `mon-quotidien-jeko`, afin de conserver le projet Firebase sur le forfait Spark.

- Frontend : Firebase Authentication pour la session, puis appel HTTPS au Worker.
- Backend : Cloudflare Workers.
- Données : Cloud Firestore REST API, authentifiée avec le compte de service Google.
- Confirmation : webhook Jèko signé HMAC-SHA256; aucune activation sur la seule redirection navigateur.
- Périmètre initial : abonnement annuel automobiliste.

## Routes du Worker

- `POST /api/jeko/checkout` — exige un Firebase ID token Bearer; reçoit uniquement `paymentMethod`.
- `GET /api/jeko/status?paymentId=...` — exige le même jeton et vérifie la propriété du paiement.
- `POST /webhook` — public pour Jèko; vérifie la signature sur le corps HTTP brut avant de lire le JSON.
- `GET /health` — contrôle technique sans données sensibles.

URL Worker : `https://mon-quotidien-jeko.tabikevin57.workers.dev`

URL webhook à déclarer dans le tableau de bord Jèko :
`https://mon-quotidien-jeko.tabikevin57.workers.dev/webhook`

## Secrets Cloudflare requis

Dans Workers & Pages → `mon-quotidien-jeko` → Settings → Variables and Secrets → Production, enregistrer comme **Secrets** :

- `GOOGLE_SERVICE_ACCOUNT_JSON` — JSON du compte de service Google Cloud.
- `JEKO_API_KEY`
- `JEKO_API_KEY_ID`
- `JEKO_STORE_ID`
- `JEKO_WEBHOOK_SECRET`

Ne jamais placer ces valeurs dans le dépôt, le frontend ou les journaux. Le compte de service doit avoir uniquement le rôle IAM nécessaire à Firestore (`Cloud Datastore User`) sur le projet `mon-transport-ci`.

## Flux de paiement

1. Le Worker valide le Firebase ID token auprès de Firebase Identity Toolkit.
2. Il lit le tarif annuel automobiliste dans `configuration_abonnements/globale.services.automobiliste`.
3. Il crée un document de paiement avec une référence aléatoire et appelle Jèko.
4. Le navigateur est redirigé vers l’URL HTTPS retournée par Jèko.
5. Le webhook vérifie la signature, l’événement, la référence, l’identifiant de demande, le magasin (lorsqu’il est inclus), le type, le statut, la devise et le montant.
6. Le Worker confirme le paiement, enregistre le reçu idempotent et active l’abonnement dans un commit Firestore atomique.

La redirection de succès ne déclenche jamais l’activation. Les notifications répétées ne doivent pas prolonger deux fois l’abonnement.

## Vérifications avant ouverture aux clients

- Vérifier la réponse réelle de `POST /partner_api/payment_requests` et le format de `TRANSACTION_COMPLETED`.
- Vérifier que l’événement du webhook Jèko correspond à la version de payload attendue.
- Tester un paiement réel de faible montant, puis son échec, un doublon webhook et un montant incorrect.
- Vérifier le statut Firestore et la date d’expiration après confirmation.
- Surveiller les erreurs Worker et les livraisons webhook.

Jèko ne proposant pas de sandbox selon la documentation d’intégration consultée, ne lancer aucun essai avec le magasin de production sans procédure de test et de remboursement confirmée auprès de Jèko.
