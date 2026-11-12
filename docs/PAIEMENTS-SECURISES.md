# Paiements sécurisés — Mon Quotidien CI

Cette branche ajoute une première tranche backend Wave, indépendante de l'interface existante. Aucun paiement n'est activé automatiquement dans l'application.

## Architecture
- Firebase Cloud Functions v2 (Node.js 20) comme autorité serveur.
- Firebase Auth obligatoire pour créer/consulter un paiement.
- Prix lus dans Firestore `payment_catalog/{serviceId}/plans/{planId}`, jamais depuis le navigateur.
- Checkout Wave hébergé; l'URL de retour ne confirme jamais un paiement.
- Webhook signé, fenêtre anti-rejeu, relecture de la session chez Wave, vérification de la référence, du montant et de XOF, puis transaction Firestore idempotente.
- Les règles Firestore interdisent les écritures client dans paiements, abonnements et reçus webhook.

## Configuration
1. Déployer les règles Firestore.
2. Installer les dépendances dans `functions/` puis déployer les Functions.
3. Configurer les secrets côté Firebase:
   `firebase functions:secrets:set WAVE_API_KEY`
   `firebase functions:secrets:set WAVE_WEBHOOK_SECRET`
4. Créer côté console/admin des documents catalogue validés, par exemple:
   `payment_catalog/annuaire/plans/mensuel`
   avec `{ "active": true, "amountXof": 1000, "currency": "XOF", "label": "Annuaire mensuel", "durationDays": 30 }`.
   N'activer que des prix et durées confirmés par le responsable commercial.
5. Configurer dans le tableau de bord Wave le webhook vers l'URL déployée de `waveWebhook`. Confirmer le format exact de signature et d'événement de votre compte avec la documentation marchande Wave en vigueur avant la production.
6. Les URLs success/error doivent être HTTPS et sur le domaine applicatif autorisé.

## Frontend (après déploiement)
Obtenir un Firebase ID token, appeler `createWaveCheckout` avec `serviceId`, `planId`, `successUrl`, `errorUrl`, puis rediriger le navigateur vers `checkoutUrl`. Sur la page de retour, appeler `getPaymentStatus?paymentId=...` avec le même token et afficher « confirmé » uniquement si le serveur répond `succeeded`. Ne jamais écrire le statut dans Firestore depuis le navigateur.

## Points de contrôle avant production
- Vérifier dans la documentation Wave actuelle le format du webhook, le champ d'identifiant d'événement, les champs de statut et la méthode de récupération de session; adapter si nécessaire.
- Tester les événements dupliqués, rejoués, faux, montant/devise incorrects, paiements annulés, expiration, et retries.
- Le traitement actuel ajoute une durée en jours (configuration explicite); remplacer par une règle calendaire pour les offres mensuelles/trimestrielles si c'est la politique contractuelle.
- Ajouter un processus de réconciliation et une console d'administration des remboursements avant lancement.
- Les remboursements ne sont volontairement pas exposés dans cette première tranche: ils doivent être approuvés, enregistrés séparément et confirmés par le prestataire.

## Orange Money
Aucun endpoint Orange n'est inventé ici. Le service Web Payment Côte d'Ivoire doit être activé par Orange pour le marchand. Obtenir les spécifications officielles du compte (authentification, création de paiement, callback, vérification serveur, annulation/remboursement) et implémenter un adaptateur conforme avant d'activer ce moyen de paiement. Aucun statut venant du navigateur ne doit activer un abonnement.
