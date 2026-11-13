# Migration contrôlée des photos des déclarations d'enfants vers Cloudflare R2

## Statut

Document de préparation uniquement. Cette étape ne modifie pas le parcours de production et ne bascule aucun téléversement Firebase vers R2.

## État actuel vérifié

- `declarations-enfants.js` envoie les photos dans Firebase Storage sous `declarations_enfants_privees/{uid}/{dossierId}/{fileName}`.
- La modération copie actuellement la photo vers `declarations_enfants_publics/{dossierId}/photo` dans Firebase Storage.
- Le bucket R2 `mon-quotidien-ci-enfants` a été créé en région WEUR, sans domaine public activé.
- Firebase Storage n'est pas activé sur le projet Firebase Spark.

## Architecture cible

1. Le navigateur envoie la photo à un Cloudflare Worker avec le Firebase ID token de l'utilisateur.
2. Le Worker valide cryptographiquement le token Firebase (signature, issuer, audience, expiration) et impose la limite 8 MiB et les types JPEG/PNG/WebP.
3. Le Worker écrit une seule fois dans R2, sous une clé privée déterministe liée au dossier. Une écriture conditionnelle doit empêcher tout écrasement.
4. La lecture des photos en attente est réservée à l'administrateur authentifié.
5. Lors de l'approbation, le Worker vérifie le rôle admin, copie la photo vers la clé publique avec une écriture conditionnelle, puis retourne une URL publique stable servie par le Worker.
6. Aucun endpoint de remplacement ou de suppression n'est fourni. Les objets ne sont jamais exposés via un bucket public direct.
7. Firestore conserve les métadonnées et le statut de modération. Les informations privées restent dans la sous-collection existante.

## Conditions obligatoires avant bascule

- Ajouter et tester la validation des Firebase ID tokens côté Worker, sans clé privée Firebase dans le navigateur.
- Configurer un binding R2 privé nommé `ENFANTS_BUCKET`.
- Configurer les variables Worker nécessaires, dont le Firebase project ID et l'UID administrateur attendu.
- Configurer les origines CORS autorisées pour le domaine réel de l'application.
- Modifier ensemble les parcours de dépôt, prévisualisation admin, approbation et affichage public dans `declarations-enfants.js`.
- Ajouter des tests Worker couvrant utilisateur non connecté, utilisateur non admin, fichier invalide/trop volumineux, lecture privée refusée, publication non autorisée, et refus d'écrasement.
- Vérifier que les règles Firestore n'autorisent pas un client à définir directement un `photoUrl` public ou à approuver un dossier.
- Vérifier les tests CI et un test de bout en bout sur un dossier fictif avant toute fusion.

## Sécurité et déploiement

- Ne jamais rendre le bucket public directement.
- Ne jamais ajouter de secret ou de clé privée au dépôt.
- Ne pas déployer le Worker ni modifier la configuration de production dans cette PR.
- Ne pas fusionner cette préparation comme une migration complète. La bascule applicative doit être livrée dans une PR ultérieure après tests.
- Conserver les règles de non-remplacement et de non-suppression des photos, y compris pour l'administrateur.

## Retour arrière

Tant que la PR de bascule n'est pas fusionnée et que le Worker n'est pas déployé, l'application publiée reste inchangée. Lors de la future bascule, prévoir un indicateur de configuration permettant de revenir au parcours précédent uniquement si le stockage Firebase est disponible; sinon, désactiver temporairement les nouveaux dépôts plutôt que d'exposer les fichiers.
