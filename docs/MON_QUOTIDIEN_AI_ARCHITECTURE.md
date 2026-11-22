# MON QUOTIDIEN AI — architecture de référence

**Statut :** conception initiale, non déployée  
**Branche :** `feat/mon-quotidien-ai-foundation`  
**Objectif :** intégrer un assistant IA transversal sans remplacer les services existants de MON QUOTIDIEN CI.

## 1. Décisions d'architecture

1. **Réutiliser le backend Cloudflare Worker existant** comme passerelle IA, après vérification de sa configuration de déploiement. Ne pas créer une seconde API publique concurrente.
2. **Conserver Firebase Authentication** comme identité de référence et vérifier les jetons côté serveur à chaque requête.
3. **Conserver Firestore** pour les conversations et préférences, avec des règles et contrôles serveur limitant strictement l'accès au propriétaire et au partenaire autorisé.
4. **Garder les secrets du fournisseur IA exclusivement côté serveur**, dans les secrets Cloudflare. Aucun secret fournisseur dans `index.html`, le dépôt ou le navigateur.
5. **Brancher les outils métier sur les API et données existantes** : commandes, transport, livraisons, stocks, portefeuille et abonnements. L'assistant ne doit pas créer de fausse source de vérité.
6. **Traiter chaque action sensible comme une commande autorisée distincte**, avec validation serveur et confirmation explicite de l'utilisateur avant exécution.
7. **Séparer le droit d'utiliser l'IA du droit d'effectuer une opération métier** : l'abonnement Premium ne donne aucun privilège supplémentaire sur les données ou les actions.

## 2. Architecture logique

```text
Interface MON QUOTIDIEN CI
  └── bouton flottant + panneau de conversation
        └── Firebase Authentication (ID token)
              └── Cloudflare Worker — passerelle IA
                    ├── vérification identité / rôle / droits
                    ├── quotas techniques, anti-abus et journal d'audit
                    ├── fournisseur IA (secret serveur)
                    ├── outils métier autorisés
                    │     ├── commandes et historique
                    │     ├── transport et livraisons
                    │     ├── stocks et catalogue
                    │     ├── portefeuille et commissions
                    │     └── abonnements et paiements
                    └── Firestore — conversations et préférences
```

Ce schéma décrit la cible. Il ne signifie pas que toutes ces routes ou connexions sont déjà implémentées.

## 3. Contrat minimal de l'API conversation

- Méthode : `POST`
- Route cible : `/api/ai/chat`
- Authentification : `Authorization: Bearer <Firebase ID token>`
- Corps : `{ "message": "...", "conversationId": "..." }`
- Réponse : `{ "conversationId": "...", "answer": "...", "actions": [] }`
- Validation stricte du type, de la taille et du format des champs.
- Refus des requêtes sans identité valide ou sans autorisation.
- Ne jamais accepter du navigateur un `role`, un `partnerId`, un solde ou un statut de paiement comme preuve d'autorité.

Les noms de route et schémas sont des contrats proposés pour l'implémentation ; ils ne sont pas encore des endpoints actifs.

## 4. Autorisation des outils

Chaque outil IA doit déclarer :
- les rôles autorisés ;
- les ressources accessibles et leur propriétaire ;
- les champs nécessaires ;
- s'il s'agit d'une lecture ou d'une écriture ;
- si une confirmation explicite est requise ;
- les événements d'audit à enregistrer.

Les contrôles sont effectués dans le Worker ou le service métier de confiance, jamais uniquement dans l'interface ni sur la base d'une instruction du modèle.

### Confirmation obligatoire

Confirmation explicite avant :
- paiement, renouvellement ou changement de formule payante ;
- création ou finalisation d'une commande ;
- modification de prix, stock, profil ou coordonnées ;
- publication d'une campagne ou dépense publicitaire ;
- demande de retrait ou transfert d'argent ;
- annulation, suppression, remboursement ou sanction.

Le modèle peut préparer une opération et présenter un récapitulatif ; seul le backend autorisé peut l'exécuter après confirmation.

## 5. Abonnements IA et paiements

- Formule gratuite et formule Premium, avec droits déterminés par le serveur.
- Tarifs envisagés : client 1 000 FCFA/mois et partenaire 3 000 FCFA/mois ; à confirmer après mesure du coût réel et validation commerciale.
- Paiement via le flux Jeko existant, sans réimplémenter un second système de paiement.
- Activation Premium uniquement après vérification du webhook Jeko, validation du montant, de la devise, de la référence, du magasin et de l'identifiant de transaction.
- Traitement idempotent des événements et journal de reçus.
- Aucun numéro de carte, secret API ou clé privée dans le chat ou les journaux.

## 6. Coûts et protection de l'usage

L'expérience gratuite doit rester simple et accessible. L'absence de plafond quotidien affiché ne signifie pas absence de protection technique.

Prévoir :
- limitation de débit par utilisateur et par adresse réseau ;
- limites de taille des messages et pièces jointes ;
- choix de modèles selon la complexité ;
- cache pour les réponses non personnelles et non sensibles ;
- suivi du coût par requête, utilisateur et formule ;
- alertes de dépenses et coupe-circuit serveur ;
- protection contre les boucles d'outils et les appels coûteux répétés.

Les limites techniques doivent être transparentes et ne pas être présentées comme un quota commercial arbitraire.

## 7. Confidentialité et mémoire

- Conversations isolées par UID ; données partenaires également cloisonnées par identifiant partenaire vérifié côté serveur.
- Collecter le minimum nécessaire.
- Mémoire personnalisée désactivable, consultable et modifiable par l'utilisateur.
- Ne pas injecter dans le contexte IA des données financières, médicales ou privées sans nécessité et autorisation.
- Prévoir suppression et durée de conservation documentées.
- Ne jamais utiliser les conversations d'un utilisateur pour répondre à un autre utilisateur.

## 8. Déploiement progressif

1. Audit de configuration Cloudflare, routes, secrets, authentification et règles Firestore.
2. Passerelle IA sans outil métier : authentification, validation, réponse et journalisation.
3. Interface responsive de chat, sans action sensible.
4. Outils en lecture seule, limités au profil connecté.
5. Actions métier avec confirmation et tests d'autorisation négatifs.
6. Abonnements Jeko en environnement contrôlé, puis activation après validation.
7. Voix, langues ivoiriennes, WhatsApp et fonctions avancées après mesure de qualité et de coût.

## 9. Critères de mise en production

- tests positifs et négatifs d'authentification et d'isolation ;
- tests d'autorisation pour chaque rôle ;
- aucun secret dans les fichiers servis au navigateur ;
- validation du webhook et idempotence des paiements ;
- journalisation sans données sensibles ;
- tests automatisés existants toujours verts ;
- procédure de désactivation de la passerelle IA ;
- validation humaine avant fusion et déploiement en production.

**Important :** ce document fixe les choix de conception. Il ne constitue ni une preuve d'installation, ni une activation d'abonnement, ni un déploiement en production.
