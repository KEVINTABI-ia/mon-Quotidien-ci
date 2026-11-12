# Paiements sécurisés — Mon Quotidien CI

## État de l'intégration

- Ajout d'un backend Firebase Functions v2 pour créer les sessions Wave, vérifier les webhooks signés et activer un abonnement côté serveur.
- Orange Money CI n'est pas activé : ses identifiants, son contrat marchand et sa documentation technique CI doivent être fournis avant de coder l'adaptateur. Aucun endpoint d'un autre pays n'est supposé.
- Le formulaire d'abonnement automobiliste est maintenant raccordé au checkout Wave et la confirmation serveur met à jour la collection historique `abonnements_automobiliste`. Les autres formulaires historiques restent à migrer service par service.
- Les remboursements et le rapprochement automatique restent à implémenter après validation des capacités exactes du contrat marchand.

## Architecture

Le navigateur transmet uniquement un identifiant de service et de formule. Pour l'abonnement automobiliste annuel, le backend relit la configuration administrateur `configuration_abonnements/globale.services.automobiliste`, applique le tarif promotionnel uniquement si ses dates sont valides, puis crée une session Wave. Pour les autres services, il lit le catalogue `payment_catalog/{serviceId}/plans/{planId}`. Le montant envoyé au prestataire est toujours calculé côté serveur.

Le webhook Wave est vérifié sur le corps brut avec HMAC-SHA256 (timestamp concaténé directement au corps, sans séparateur) et fenêtre temporelle anti-rejeu. Le backend récupère ensuite la session via l'API Wave et vérifie la référence client, l'identifiant de session, le montant, la devise XOF et les états de paiement. La transaction Firestore active alors l'abonnement de façon atomique et idempotente. Les échecs de paiement sont enregistrés sans activer de droits.

La redirection du navigateur vers success_url ne confirme jamais un paiement.

## Configuration

1. Vérifier le projet Firebase ciblé avant déploiement. Le code client historique pointe vers le projet mon-transport-ci ; confirmer qu'il s'agit bien du projet voulu.
2. Installer les dépendances depuis le dossier functions avec npm install.
3. Configurer les secrets avec Firebase Secret Manager :
   - firebase functions:secrets:set WAVE_API_KEY
   - firebase functions:secrets:set WAVE_WEBHOOK_SECRET
4. Déployer après revue : firebase deploy --only functions:createWaveCheckout,functions:waveWebhook,functions:getPaymentStatus
5. Enregistrer l'URL HTTPS de waveWebhook dans le portail Wave Business avec les événements checkout.session.completed et checkout.session.payment_failed.
6. Pour l'API Checkout, ne pas activer la liste blanche IP Wave tant que l'egress sortant Firebase n'a pas une IP statique dédiée. Si elle est requise pour le compte marchand, configurer un VPC connector et Cloud NAT avec IP réservée, puis autoriser uniquement cette IP /32 dans le portail Wave. Ne jamais deviner une plage IP Firebase.
7. Pour le webhook entrant, appliquer la liste des IP Wave publiée dans la documentation officielle si une couche WAF/proxy permet un filtrage fiable, en plus de la signature HMAC. La signature reste obligatoire.
8. Contrôler les journaux, les quotas, la facturation, les règles Firestore et le projet avant activation publique.

## Catalogue de prix

Pour les futurs services, le backend lit les documents de la forme payment_catalog/{serviceId}/plans/{planId}. Exemple de document :

    {
      "active": true,
      "amountXof": 1000,
      "currency": "XOF",
      "durationDays": 30,
      "label": "Formule mensuelle"
    }

Ces documents doivent être créés et modifiés uniquement par un administrateur de confiance ou le backend. Aucun prix ne doit être accepté depuis le navigateur. Ne pas activer les plans avant validation commerciale des prix et durées.

## Endpoints

### Créer un paiement

POST createWaveCheckout avec un Firebase ID token dans Authorization: Bearer. Corps JSON :

    {
      "serviceId": "annuaire",
      "planId": "mensuel",
      "successUrl": "https://kevintabi-ia.github.io/mon-Quotidien-ci/?payment=return",
      "errorUrl": "https://kevintabi-ia.github.io/mon-Quotidien-ci/?payment=error"
    }

Le serveur retourne paymentId et checkoutUrl. Ouvrir checkoutUrl dans le navigateur normal, pas dans une WebView.

### Consulter le statut

GET getPaymentStatus?paymentId=... avec le même Firebase ID token. Afficher le paiement comme confirmé uniquement si le serveur renvoie status=succeeded.

## Abonnements

Les abonnements sont enregistrés dans subscriptions/{uid}_{serviceId}. La durée provient du catalogue et est exprimée en jours dans cette version. Un renouvellement avant expiration prolonge la date existante ; après expiration, il repart de l'instant de confirmation.

Les droits d'accès des modules métier doivent ensuite être raccordés à cette collection et les règles historiques auditées. Une simple désactivation visuelle dans l'interface n'est pas un contrôle d'accès.

Les prélèvements récurrents ne sont pas supposés disponibles. Un nouveau checkout explicitement autorisé par le client est requis tant que le contrat opérateur n'établit pas une récurrence et un mandat valides.

## Orange Money CI

Avant activation, obtenir auprès d'Orange CI les endpoints et modalités exacts de création de paiement, authentification, callback, interrogation de statut, sandbox, remboursements partiels/totaux, frais et délais. Le callback doit être authentifié selon la spécification fournie par Orange et le statut doit être recoupé côté serveur lorsque l'API le permet.

## Remboursements et rapprochement

Conserver le paiement original et créer une écriture de remboursement distincte, liée au paiement, avec statut, motif, montant, opérateur, référence externe, identité de l'administrateur et clé d'idempotence. Les statuts prévus sont requested, approved, processing, succeeded, failed et rejected. Ne jamais supprimer une transaction pour simuler un remboursement.

Le rapprochement quotidien doit comparer paiements internes, transactions opérateur et versements nets : paiements manquants, doublons, montants ou devises incohérents, remboursements en attente et écarts de frais.

## Tests avant production

Depuis le dossier functions, exécuter `npm test` (7 tests unitaires couvrent les signatures, les timestamps, les corps bruts et les fins de mois).


- Jeton Firebase absent ou invalide : rejet.
- Formule inconnue/inactive : aucune session créée.
- Signature Wave invalide ou timestamp hors fenêtre : HTTP 401.
- Référence, identifiant, montant ou devise non concordants : aucun abonnement activé.
- Webhook rejoué : une seule activation.
- Retour navigateur falsifié : aucun paiement confirmé.
- Utilisateur A ne peut pas lire le paiement de B.
- Le client ne peut ni créer ni modifier paiements, abonnements ou catalogue.
- Vérifier les renouvellements avant et après expiration, ainsi que les durées de 28, 29, 30 et 31 jours.
- Tester les droits réels des modules existants : les anciens champs d'abonnement ne doivent pas permettre de contourner le nouveau contrôle serveur.

## Limites de cette livraison

Cette livraison raccorde le parcours Wave de l'abonnement automobiliste et conserve la compatibilité avec la collection historique `abonnements_automobiliste`. Elle n'active pas Orange Money, ne traite pas les remboursements et ne migre pas les contrôles d'abonnement des autres modules. Elle doit être testée dans un projet Firebase de préproduction avant déploiement.


## Tests automatisés ajoutés

Le dossier `functions/test` contient des tests Node.js sur :
- la signature HMAC Wave calculée sur le timestamp suivi du corps brut ;
- le rejet des signatures falsifiées, des corps modifiés et des timestamps hors fenêtre ;
- la prise en charge de plusieurs signatures pendant une rotation de clé ;
- les comparaisons hexadécimales en temps constant ;
- les renouvellements calendaires en fin de mois (y compris février bissextile).

Lancer localement depuis `functions/` avec `npm install`, puis `npm test`. Un workflow GitHub Actions exécute ces tests lors des changements du backend de paiement.
