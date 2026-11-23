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

## Hors périmètre avant activation réelle
- Persistance Firestore et règles d'accès financières.
- Workflow d'approbation paramétrable et multi-étapes.
- Journal d'audit serveur et pièces jointes.
- Interface de caisse, rapprochement bancaire et exports.
- Tests de bout en bout sur Firebase Emulator.
