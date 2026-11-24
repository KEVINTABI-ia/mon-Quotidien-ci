# Mon Business — Phase 1 : fondations

## Statut
Cette phase est développée sur la branche `feature/mon-business`. Elle ne modifie pas l'application en production et n'est pas encore déployée.

## Objectifs de la phase
1. Permettre l'enregistrement d'une entreprise immatriculée ou non immatriculée.
2. Autoriser plusieurs secteurs d'activité dans un même espace entreprise.
3. Séparer les données par entreprise et par activité.
4. Définir les rôles, permissions granulaires et leur portée.
5. Préparer une piste d'audit des opérations.
6. Poser les règles de sécurité avant toute connexion à l'interface publique.

## Modèle de données Firestore cible

- `businesses/{businessId}` : identité et paramètres de l'entreprise, propriétaire, statut.
- `businesses/{businessId}/members/{uid}` : rôle et état d'accès du collaborateur.
- `businesses/{businessId}/activities/{activityId}` : secteurs et paramètres propres à chaque activité.
- `businesses/{businessId}/auditLogs/{eventId}` : journal append-only des événements.
- `businessInvitations/{invitationId}` : invitations à usage unique, avec expiration et statut.

Chaque document métier créé ultérieurement devra porter `businessId` et, lorsqu'il relève d'un secteur, `activityId`. Les références d'activité devront être vérifiées côté serveur / règles Firestore : un identifiant transmis par le navigateur n'est jamais une preuve d'autorisation.

## Principes de sécurité
- Authentification Firebase obligatoire pour tout espace privé.
- Le propriétaire est associé à son UID Firebase, jamais à une adresse e-mail seule.
- Aucun compte partagé : chaque collaborateur possède son propre UID.
- Autorisations vérifiées côté serveur et dans les règles Firestore, pas uniquement dans l'interface.
- Portée par entreprise et activité ; aucun accès implicite aux autres activités.
- Les journaux d'audit ne sont pas modifiables par les utilisateurs ordinaires.
- Les invitations sont expirables, révocables et limitées à une entreprise.
- Les données financières et RH auront des règles dédiées avant leur activation.

## Rôles initiaux
`owner`, `general_director`, `activity_manager`, `accountant`, `cashier`, `stock_manager`, `employee`, `observer`.

Les rôles servent de modèles. Les droits effectifs sont des permissions explicites (lecture, création, modification, approbation, annulation/correction, export, administration des accès), limitées à une entreprise et éventuellement à une activité.

## Contrôles avant ouverture
- [ ] Enregistrement entreprise immatriculée / non immatriculée.
- [ ] Création d'au moins une activité.
- [ ] Ajout de plusieurs activités dans le même espace.
- [ ] Invitation et révocation d'un collaborateur.
- [ ] Refus d'accès inter-entreprises.
- [ ] Refus d'accès à une activité non autorisée.
- [ ] Journalisation des opérations sensibles.
- [ ] Tests des règles Firestore avec les émulateurs.

## Hors périmètre de cette première livraison
Aucun déploiement Firebase, aucune modification des règles globales existantes et aucune activation dans la navigation publique. L'intégration à l'application se fera après validation des règles et des tests.
