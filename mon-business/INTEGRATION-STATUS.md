# Mon Business — état d'intégration

## Interface livrée sur la branche de développement

La page `mon-business.html` utilise la configuration Firebase du projet existant et la session Firebase Auth de l'utilisateur. Elle permet :
- de créer atomiquement le document entreprise et le document propriétaire dans un batch Firestore ;
- de prendre en charge les entreprises immatriculées et non immatriculées ;
- d'ajouter plusieurs activités sous l'entreprise ;
- de relire les activités de l'espace propriétaire ;
- de ne pas exposer de commandes d'écriture pour les modules métier qui ne disposent pas encore de services serveur.

## Limites explicites

Cette page n'est pas encore reliée à la navigation de la page d'accueil. Elle est accessible directement via `/mon-business.html` une fois la branche publiée.

Les collaborateurs autres que le propriétaire ne peuvent pas encore être invités. Les écritures financières, RH, achats, stocks, ventes, remboursements, livraisons et journaux d'audit restent désactivées depuis le navigateur. Les modules JavaScript existants sont des moteurs métier purs et ne sont pas des services de persistance.

## Contrôles obligatoires avant mise en production

- Exécuter CI et règles Firebase sur le SHA exact du dernier commit.
- Ajouter les tests émulateur pour toutes les collections métier et les scénarios inter-entreprises/inter-activités.
- Implémenter un backend de confiance pour les invitations, décisions d'approbation, mouvements financiers et journaux d'audit.
- Revoir les règles Firestore existantes dans leur totalité, car les autorisations Firestore sont additives.
- Tester la session Firebase sur l'hébergement final et le parcours mobile.
- Intégrer la page à la navigation principale après validation UX et sécurité.
- Effectuer une revue des obligations locales applicables aux données RH et comptables.

Aucun déploiement ni changement de la branche `main` n'est effectué par ce commit.
