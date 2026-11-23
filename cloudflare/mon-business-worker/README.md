# Mon Business — Cloudflare Worker dédié

Ce Worker est indépendant du Worker Jeko. Il ne modifie pas les flux de paiement.

## Fonctions
- Création d'invitations par le propriétaire actif uniquement.
- Invitation liée à une adresse e-mail Firebase vérifiée, une entreprise, un rôle et une liste d'activités.
- Jeton aléatoire à usage unique ; seul son hash SHA-256 est conservé dans Firestore.
- Expiration (1 à 336 heures), révocation et acceptation atomique.
- Création du membre et événements d'audit dans une même transaction Firestore.
- Aucune écriture d'invitation ou de membre directement depuis le navigateur.

## Partage sans e-mail professionnel
Après création, le Worker retourne un lien que le propriétaire peut copier et partager manuellement par WhatsApp, SMS ou tout autre canal. Le secret est placé dans le fragment URL (#), qui n'est pas envoyé au serveur web dans la requête HTTP. L'application lit ce fragment, demande à l'utilisateur de se connecter avec l'adresse invitée, puis transmet le jeton au Worker.

Aucun e-mail n'est envoyé automatiquement dans cette première version.

## Secrets requis
Configurer dans l'environnement Cloudflare du Worker :
- FIREBASE_API_KEY : clé Web Firebase du projet `mon-transport-ci`.
- GOOGLE_SERVICE_ACCOUNT_JSON : JSON d'un compte de service Google dédié, limité au strict minimum nécessaire pour lire les entreprises/activités/membres et écrire les invitations/membres/journaux.

Le compte de service contourne les règles Firestore. Les contrôles d'autorisation du Worker sont donc obligatoires. Utiliser un compte de service dédié, ne pas réutiliser celui de Jeko, limiter les permissions IAM et faire tourner ses clés selon une procédure documentée. Ne jamais placer ces secrets dans GitHub, le navigateur ou les variables publiques `[vars]`.

## Déploiement
Depuis ce dossier :
1. Créer le Worker `mon-business-api` dans le bon compte Cloudflare.
2. Configurer les deux secrets ci-dessus avec `wrangler secret put`.
3. Vérifier `APP_ORIGIN` et le domaine exact de l'application.
4. Déployer avec `npx wrangler deploy`.
5. Tester `GET /health`, les contrôles CORS, l'authentification, les invitations, les expirations, les doubles acceptations et les révocations.

Le code est livré sans déploiement. L'URL du Worker devra ensuite être configurée dans l'application.

## Limites à traiter avant production
- Ajouter une règle de limitation de débit Cloudflare (par IP et par compte) sur les routes d'invitation et d'acceptation.
- Vérifier le compte de service et les autorisations IAM avec un projet de test avant production.
- Exécuter les tests Firebase Emulator et tests d'intégration avec deux sessions Firebase.
- Confirmer le chemin final de la page Mon Business et l'URL du Worker.
- Connecter l'interface : formulaire d'invitation, bouton copier/partager, acceptation depuis le fragment URL, liste et révocation des invitations.
- Ne pas activer les écritures métier financières/RH/stock tant que leurs routes serveur et règles spécifiques ne sont pas implémentées.

## Endpoints
- `POST /v1/invitations` — propriétaire connecté : `businessId, email, role, activityIds, permissions, expiresInHours?`.
- `POST /v1/invitations/accept` — collaborateur connecté et e-mail vérifié : `invitationId, token`.
- `POST /v1/invitations/revoke` — propriétaire connecté : `businessId, invitationId`.
- `GET /health` — contrôle technique sans données métier.
