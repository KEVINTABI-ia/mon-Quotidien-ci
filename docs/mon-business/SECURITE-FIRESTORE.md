# Mon Business — modèle de sécurité Firestore (préparation)

## Important
Ce document décrit la cible de sécurité. Il ne constitue pas un fichier de règles déployable et ne doit pas être copié tel quel dans `firestore.rules`. Les règles Firestore utilisent une logique d'autorisation additive entre les blocs `match` : une règle permissive ailleurs peut rouvrir un chemin.

## Chemins proposés
- `businesses/{businessId}`
- `businesses/{businessId}/members/{uid}`
- `businesses/{businessId}/activities/{activityId}`
- `businesses/{businessId}/auditLogs/{eventId}`
- `businessInvitations/{invitationId}`

## Matrice d'accès cible
- Non connecté : aucun accès.
- Propriétaire : accès à son entreprise et à ses activités.
- Collaborateur actif : accès uniquement aux activités explicitement affectées et aux actions explicitement accordées.
- Collaborateur suspendu/révoqué : aucun accès privé.
- Autre entreprise : aucun accès.
- Journal d'audit : lecture selon permission ; création par chemin serveur de confiance ; aucune modification/suppression par les clients.
- Invitation : lecture/acceptation limitée au destinataire prévu, expiration et révocation vérifiées.

## Invariants obligatoires
1. Vérifier `request.auth.uid` et l'appartenance au document membre du même `businessId`.
2. Ne jamais faire confiance à un rôle, un propriétaire, une activité ou une permission envoyés par le client.
3. Refuser les changements client de `ownerUid`, rôle propriétaire, statut de validation et champs de sécurité.
4. Vérifier que `activityId` appartient réellement à l'entreprise dans laquelle l'opération est écrite.
5. Interdire aux clients de supprimer ou modifier les événements d'audit.
6. Interdire les lectures globales des collections de toutes les entreprises.
7. Écrire des tests positifs et négatifs pour chaque rôle, entreprise, activité et action.
8. Examiner toutes les règles existantes qui pourraient autoriser le même chemin : une règle plus stricte ne neutralise pas une règle permissive.

## Préconditions avant intégration
- Confirmer les règles exactes d'administration et de création initiale d'entreprise.
- Définir le mécanisme de création du propriétaire de manière atomique et non falsifiable.
- Définir le traitement des invitations et les limites d'accès des comptes suspendus.
- Ajouter les règles à la configuration existante uniquement après tests avec Firebase Emulator.
- Ne pas déployer les règles avant revue complète des autorisations existantes.
