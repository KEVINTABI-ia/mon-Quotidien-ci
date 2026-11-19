# Intégration Jèko Checkout — Mon Quotidien CI

## Périmètre de cette première livraison

- Souscription annuelle automobiliste uniquement.
- Le tarif est lu côté serveur dans `configuration_abonnements/globale.services.automobiliste`.
- Le navigateur transmet uniquement le moyen de paiement choisi.
- Le paiement manuel Wave / Orange Money reste disponible.
- L'abonnement historique `abonnements_automobiliste/{uid}` n'est activé qu'après webhook authentifié.

Les autres abonnements ne sont pas encore migrés vers Jèko. Ils nécessitent un catalogue de plans validé côté serveur et une migration des droits correspondants.

## Architecture et sécurité

1. Firebase Authentication valide le jeton utilisateur.
2. Cloud Functions lit le prix, la durée et une éventuelle promotion depuis Firestore.
3. Le backend convertit les FCFA en centimes Jèko : **1 FCFA = 100 centimes**. Exemple : 3 000 FCFA = 300 000 centimes.
4. Le backend crée une demande `POST /partner_api/payment_requests` avec le magasin, une référence unique et le moyen de paiement.
5. Le navigateur est redirigé vers `redirectUrl`.
6. Le webhook vérifie `Jeko-Signature` par HMAC-SHA256 sur le corps brut, puis contrôle `Jeko-Event`, le magasin, le type de transaction, le statut, le montant, la devise, la référence et l'identifiant de demande.
7. Une transaction Firestore idempotente enregistre le paiement et active l'abonnement.

La redirection de succès n'active jamais un abonnement. Le webhook signé est la source de confirmation.

## Secrets Firebase à configurer

Ne jamais commiter ni placer ces valeurs dans le navigateur :

- `JEKO_API_KEY`
- `JEKO_API_KEY_ID`
- `JEKO_STORE_ID`
- `JEKO_WEBHOOK_SECRET`

Depuis un terminal authentifié au projet Firebase de production, exécuter :

```bash
firebase functions:secrets:set JEKO_API_KEY
firebase functions:secrets:set JEKO_API_KEY_ID
firebase functions:secrets:set JEKO_STORE_ID
firebase functions:secrets:set JEKO_WEBHOOK_SECRET
```

Le `storeId` fourni pour Mon Quotidien CI doit être vérifié avec les identifiants API utilisés avant déploiement.

## Webhook Jèko

Après déploiement, enregistrer l'URL HTTPS de la fonction `jekoWebhook` dans le Dashboard Business Jèko, pour le magasin concerné, avec l'événement `TRANSACTION_COMPLETED`.

Le secret de signature n'est affiché qu'une seule fois à la création. Le sauvegarder immédiatement dans Firebase Secret Manager.

## Déploiement

Vérifier d'abord le projet ciblé :

```bash
firebase use
```

Le projet historique indiqué par le code de l'application est `mon-transport-ci`. Confirmer qu'il s'agit bien du projet de production avant tout déploiement.

Après configuration des secrets et validation des tests :

```bash
cd functions
npm install
npm test
cd ..
firebase deploy --only functions:createJekoCheckout,functions:jekoWebhook,functions:getJekoPaymentStatus
```

Déployer ensuite les règles Firestore si elles ne sont pas déjà publiées :

```bash
firebase deploy --only firestore:rules
```

## Limites avant activation publique

- Jèko ne propose pas de sandbox séparée : utiliser un magasin dédié aux essais, avec des paiements réels de faible montant et des remboursements gérés selon les conditions Jèko.
- Aucun secret n'est fourni dans le dépôt.
- Aucun webhook n'est enregistré dans le Dashboard par cette livraison.
- Aucun paiement réel ni déploiement n'a été effectué par les tests GitHub Actions.
- Tester les paiements réussis, les erreurs, les webhooks rejoués, les montants incohérents, le mauvais magasin et les utilisateurs non authentifiés.
- Confirmer que les notifications webhook sont bien actives et surveiller leurs livraisons.

## Tests

`npm test` vérifie la signature HMAC sur le corps brut, le rejet d'un corps modifié, la conversion FCFA/centimes et le renouvellement calendaire.
