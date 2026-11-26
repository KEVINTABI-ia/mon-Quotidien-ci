# Mon Business — phase 2 : socle financier

## Principes
- Les montants sont stockés en unités mineures entières (XOF sans fraction dans les opérations FCFA) afin d'éviter les erreurs de virgule flottante.
- Chaque opération est liée à une entreprise, une activité, une caisse, un auteur, une référence et un motif.
- Une opération en attente ou approuvée ne modifie pas le solde.
- Seule une opération exécutée modifie les soldes.
- Une opération exécutée n'est jamais supprimée ou annulée silencieusement ; une correction future devra être une écriture compensatoire auditée.
- Les transferts débitent la caisse source et créditent la caisse destination ; ils ne sont ni recettes ni dépenses dans le compte de résultat.
- Les états autorisés sont pending, approved, executed, rejected et cancelled. Le passage direct de pending à executed est interdit.

## Couverture du moteur pur
Le module `mon-business/finance.js` valide les opérations, calcule les soldes par caisse, produit un compte de résultat en excluant les transferts et contrôle les transitions de statut.

## Première brique persistante : caisses
- Les caisses sont stockées sous `businesses/{businessId}/activities/{activityId}/cashRegisters/{cashRegisterId}`.
- Le propriétaire ou un collaborateur disposant du droit `create` peut créer une caisse ; la consultation exige le droit `view` sur l'activité.
- Le solde initial est saisi en FCFA entiers, stocké dans `openingBalanceMinor` (XOF sans sous-unité utilisée) et ne peut pas être modifié par l'API de création.
- La création de la caisse et son événement d'audit sont enregistrés dans un même commit Firestore via le Worker de confiance.
- Le navigateur n'écrit jamais directement dans les collections financières ; les règles Firestore existantes refusent ces écritures.
- Routes Worker : `POST /v1/finance/cash-registers/create` et `POST /v1/finance/cash-registers/list`.

## Deuxième brique : journal des opérations
- Routes Worker : `POST /v1/finance/transactions/create`, `/list`, `/approve` et `/execute`.
- Création des recettes, dépenses et transferts avec montant entier XOF, moyen de paiement, motif et référence obligatoire.
- Toute nouvelle opération est créée en `pending`. Elle ne modifie aucun solde.
- Le passage `pending → approved` est réservé aux membres autorisés à approuver.
- Le passage `approved → executed` est réservé aux membres autorisés à approuver. Il est atomique avec l'événement d'audit et un verrou optimiste sur les caisses concernées.
- Une exécution est refusée si la caisse source ne dispose pas du montant nécessaire. Aucun découvert n'est autorisé.
- Les transferts restent dans la même activité pour cette première version ; ils débitent la caisse source et créditent la caisse destinataire, sans entrer dans les recettes/dépenses du compte de résultat.
- Les soldes affichés sont recalculés à partir du solde initial et du journal des seules opérations exécutées.
- L'interface présente les caisses, les soldes calculés, le journal et les actions d'approbation/exécution réservées au propriétaire dans cette première interface.

## Hors périmètre restant
- Transferts entre activités distinctes.
- Workflow d'approbation paramétrable et multi-étapes.
- Annulation/correction d'une opération exécutée par écriture compensatoire.
- Rapprochements bancaires, pièces jointes et exports.
- Compte de résultat détaillé et tableaux de bord consolidés.
- Tests de bout en bout sur Firebase Emulator.
