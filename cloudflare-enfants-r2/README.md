# Worker R2 — photos des déclarations d'enfants

Ce Worker est une base d'intégration isolée. Il n'est pas déployé par cette PR.

## Routes
- `POST /private/{dossierId}`: utilisateur connecté, envoi unique d'une photo.
- `GET /admin/private/{dossierId}`: aperçu privé, administrateur uniquement.
- `POST /admin/publish/{dossierId}`: copie immuable vers l'espace public, administrateur uniquement.
- `GET /public/{dossierId}`: lecture de la photo publiée.

## Configuration
1. Créer le Worker avec ce dossier et lier le bucket R2 via `ENFANTS_BUCKET`.
2. Vérifier l'UID administrateur et ajouter toutes les origines exactes utilisées par l'application dans `ALLOWED_ORIGINS`.
3. Déployer d'abord en environnement de préproduction, jamais directement en production.
4. Configurer les tests d'intégration avant de connecter le front-end.

Aucun secret Firebase n'est stocké ici. Le Worker vérifie la signature RS256 des Firebase ID tokens via les clés publiques Google, ainsi que issuer, audience et expiration.

## Important — validation avant production
- Vérifier avec le runtime Cloudflare la prise en charge de `onlyIf: { etagDoesNotMatch: "*" }` pour imposer le create-only sur R2.
- Ajouter tests automatisés pour token expiré, signature invalide, CORS refusé, upload non-image, taille > 8 MiB, accès privé non-admin, publication non-admin et double écriture.
- Le Worker ne modifie pas Firestore : l'approbation Firestore reste gérée par l'application et ses règles.
- Les photos privées ne sont pas supprimées. Aucun endpoint de suppression n'existe.
- La clé de dossier doit être générée par le client avec un identifiant Firestore aléatoire.
