# MON QUOTIDIEN AI — constats techniques et garde-fous

**Date de revue :** 22 novembre 2026  
**Base examinée :** branche `main`, commit `781014808ada1573a5ea1e623bf18787c4029fcd`  
**Branche de travail :** `feat/mon-quotidien-ai-foundation`

## Constats vérifiés

### Backend et identité
- Le Worker principal est `cloudflare/worker.js`, déclaré par `wrangler.toml` sous le nom `mon-quotidien-jeko`.
- Le Worker dispose déjà d'une fonction `requireUser` qui extrait le Bearer token et appelle Firebase Identity Toolkit `accounts:lookup` pour retrouver l'utilisateur.
- Les services Firestore sont appelés depuis le Worker via l'API Firestore REST et un compte de service.
- Le routage du Worker comprend déjà le webhook Jeko, le checkout, la consultation du statut, les plans d'abonnement, les missions livreur et les médias publicitaires R2.
- Il n'existe pas encore de route IA dédiée dans le routeur examiné.

### Paiements et portefeuille
- Le webhook Jeko lit le corps brut, vérifie la signature HMAC-SHA256, filtre les événements traités et conserve une trace de reçu pour éviter un double traitement.
- Le Worker comporte des validations serveur des montants, devises et plans pour plusieurs services existants.
- Une logique de commission et de dette du portefeuille livreur est présente. Ne pas la remplacer ni l'utiliser comme portefeuille générique sans audit métier.

### Configuration Cloudflare
- `wrangler.toml` utilise `cloudflare/worker.js` comme entrée et déclare le bucket R2 des publicités.
- Les secrets requis déclarés comprennent les informations Firebase et Jeko. Aucun secret fournisseur IA n'est actuellement déclaré dans ce fichier.
- La date de compatibilité configurée est `2024-09-23`. Elle est ancienne par rapport à la date de cette revue ; son actualisation devra être traitée comme une modification séparée, après examen des changements de runtime et exécution des tests.
- L'observabilité globale est activée, mais `observability.traces.enabled` n'est pas explicitement configuré dans le fichier examiné.

### Livraison et qualité
- Les workflows GitHub Actions les plus récents observés sur le commit de référence sont terminés avec succès : CI, tests des règles Firebase, contrôles Worker Jeko et déploiement GitHub Pages.
- Ces succès attestent des contrôles de ce commit, pas de la future fonctionnalité IA.
- Plusieurs PR non fusionnées sont présentes sur le dépôt. Elles ne doivent pas être fusionnées automatiquement dans le cadre du chantier IA.

## Risques à traiter avant le premier endpoint IA

1. **Rôle et périmètre de données :** l'identité Firebase seule ne suffit pas. Chaque requête IA devra charger le rôle et les rattachements partenaire depuis une source de confiance, puis vérifier l'accès à chaque ressource.
2. **Concurrence avec le Worker métier :** ajouter des routes au Worker existant, sans créer une API publique parallèle ni casser les routes Jeko.
3. **Secrets IA :** créer le secret uniquement dans l'environnement Cloudflare, jamais dans le dépôt ou le navigateur.
4. **Limites d'entrée :** fixer une taille maximale de message et de pièces jointes, valider les types et limiter le débit avant d'appeler le modèle.
5. **Confidentialité :** ne pas enregistrer les prompts, pièces jointes ou réponses complètes dans les journaux opérationnels ; journaliser des identifiants techniques et métriques minimales.
6. **Outils IA :** commencer en lecture seule ; imposer un contrôle serveur par outil, puis confirmation explicite pour les écritures.
7. **Paiement Premium :** réutiliser le processus Jeko existant et n'activer les droits qu'après événement vérifié et traitement idempotent.

## Prochaine tranche d'implémentation

1. Définir les schémas de conversations, messages, préférences et mémoire, avec règles d'accès.
2. Ajouter au Worker une route IA de conversation sans outil métier, protégée par Firebase Authentication.
3. Ajouter les contrôles de taille, débit, coûts, gestion d'erreur et journalisation minimale.
4. Écrire les tests d'accès refusé, jeton absent/invalide, utilisateur désactivé, origine non autorisée et isolation des conversations.
5. Ajouter l'interface chat seulement après validation du contrat API.

## Hors périmètre de cette tranche

- Aucun paiement réel, aucune modification de prix, aucun transfert ni retrait.
- Aucun déploiement de l'IA en production.
- Aucune activation Premium automatique.
- Aucune lecture ou écriture métier par le modèle.
- Aucun secret ou identifiant privé ajouté au dépôt.

**Conclusion :** le Worker Cloudflare existant est le point d'intégration le plus cohérent au vu du dépôt actuel. La première version doit rester un assistant conversationnel authentifié, sans action métier, jusqu'à validation des tests d'identité, de cloisonnement et de coûts.
