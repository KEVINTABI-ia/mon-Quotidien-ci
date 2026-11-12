# Worker photos des déclarations d'enfants

Service distinct du Worker de notifications. Il utilise uniquement le bucket R2 privé `mon-quotidien-ci-enfants`.

## Routes
- `POST /upload/{docId}` : utilisateur Firebase connecté, photo JPG/PNG/WEBP, 8 Mio maximum. Écriture R2 create-only.
- `GET /admin/photo/{docId}?ownerUid={uid}` : administrateur uniquement, lecture de la photo en attente.
- `POST /admin/approve/{docId}` : administrateur uniquement, publication create-only et retour de l'URL.
- `GET /public/{docId}` : lecture publique uniquement si Firestore indique `statut=approuve` et contient exactement l'URL de cette photo.

L'authentification Firebase est vérifiée par Identity Toolkit `accounts:lookup`. L'UID administrateur est contrôlé côté Worker. Le bucket ne doit pas être rendu public directement.

## Configuration
1. Vérifier l'existence du bucket R2 et son nom exact avant déploiement.
2. Vérifier que l'UID admin correspond au compte de production.
3. Dans Wrangler, le binding R2 `ENFANTS_BUCKET` doit pointer vers le bucket dédié.
4. Configurer `ALLOWED_ORIGINS` avec les origines exactes réellement utilisées par l'application.
5. Aucun secret de service account n'est requis. `FIREBASE_WEB_API_KEY` est la clé Web Firebase déjà utilisée côté navigateur; elle n'est pas un secret d'authentification.
6. Déployer séparément avec `npx wrangler deploy --config cloudflare-enfants/wrangler.toml` après validation humaine du compte, bucket et coûts.

## Sécurité et limites
- Aucun endpoint DELETE ou remplacement.
- Les écritures R2 utilisent `onlyIf.etagDoesNotMatch = "*"` et sont donc create-only.
- Les clés sont déterministes par UID et dossier; les métadonnées empêchent qu'un autre propriétaire réutilise une clé.
- La lecture publique vérifie l'état approuvé dans Firestore avant de retourner l'objet.
- Les documents Firestore et leurs règles restent la source de vérité de la modération.
- Le Worker de notifications existant n'est pas modifié.
- La publication R2 précède la mise à jour Firestore faite par l'interface admin. Tant que Firestore n'est pas approuvé, la route publique reste fermée. Si la mise à jour Firestore échoue, l'administrateur peut relancer l'approbation : le Worker réutilise uniquement l'objet public déjà créé avec les mêmes métadonnées.
- Tester dans un environnement de préproduction avant tout basculement de production.

## Migration
Les anciennes photos Firebase Storage ne sont pas automatiquement copiées. Ne supprimer aucune ancienne donnée. Les nouveaux formulaires utilisent le Worker uniquement une fois que son URL est renseignée dans `declarations-enfants.js`.
