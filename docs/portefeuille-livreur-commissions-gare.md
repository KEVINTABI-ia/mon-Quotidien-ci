# Spécification technique — Portefeuille livreur et commissions

## Statut
Spécification issue des décisions validées par le responsable du projet. Cette branche ne modifie pas encore les flux de production. Elle sert de référence avant l'implémentation et les tests.

## Périmètre
- Portefeuille prépayé des livreurs indépendants.
- Recharges via Jèko, selon les moyens effectivement activés sur le compte marchand.
- Débit des commissions après livraison confirmée.
- Règles de frais de service et avances au service courrier pour expédition/récupération à la gare.
- Exclusion des modifications de prix de livraison des boutiques : la boutique continue à fixer elle-même ce prix.

La tarification dynamique (coefficient local 1,00 / 1,10 / 1,20, rayon 3 km) reste un chantier métier séparé à intégrer dans le calcul des frais de livraison classiques/éligibles. Elle ne s'applique pas au prix de livraison boutique, aux forfaits de service ni aux frais du transporteur.

## Règles financières validées

### Commissions
| Prestation | Commission de la plateforme |
|---|---:|
| Livraison boutique | 10 % des frais de livraison fixés par la boutique |
| Livraison classique | 15 % des frais de livraison réellement facturés |
| Expédition à la gare | 15 % des frais de livraison + 100 FCFA |
| Récupération à la gare | 15 % des frais de livraison + 100 FCFA |

- Arrondir la commission en FCFA selon une règle unique, documentée et testée.
- La commission de livraison est calculée uniquement sur les frais de livraison, jamais sur les articles, le prix du colis ou les frais du transporteur.
- Pour les opérations gare, les 100 FCFA sont la part de MON QUOTIDIEN CI sur le forfait de service de 600 FCFA.
- Les 500 FCFA restants du forfait de service reviennent au livreur et ne sont pas débités de son portefeuille.
- Les frais avancés au service courrier sont des remboursements au livreur, non un revenu de la plateforme et non une assiette de commission.

### Forfaits de service à la gare
| Opération | Forfait payé | Part plateforme | Part livreur |
|---|---:|---:|---:|
| Récupération | 600 FCFA | 100 FCFA | 500 FCFA |
| Expédition | 600 FCFA | 100 FCFA | 500 FCFA |

Ces montants remplacent les anciens forfaits de 700 et 500 FCFA.

### Portefeuille
- Dépôt initial de référence retenu : 5 000 FCFA.
- Alerte de solde faible à 1 000 FCFA.
- À 0 FCFA : aucune nouvelle mission ne peut être acceptée.
- Une mission déjà acceptée peut être terminée, même si le solde atteint zéro entre-temps.
- Débit à la clôture confirmée de la mission, une seule fois par commande.
- Recharge par Jèko : le portefeuille est crédité uniquement après validation du webhook Jèko signé, jamais sur la seule base d'une redirection navigateur.
- Le solde non consommé appartient au livreur ; les commissions effectivement prélevées sont enregistrées séparément.
- Les commandes annulées ou non livrées ne génèrent aucune commission.
- Le journal doit tracer recharges, commissions, remboursements d'avances courrier et ajustements administratifs, avec référence unique, horodatage et acteur.

Le montant minimal des recharges, la procédure de remboursement du solde non consommé à la clôture du compte et la gestion d'un solde positif mais inférieur à la prochaine commission estimée restent à préciser avant mise en production.

## Flux gare

### Récupération à la gare
À la création de la demande, le client indique si les frais d'expédition auprès du service courrier ont déjà été payés.
- Si déjà payés : le livreur récupère le colis sans avancer de frais au courrier.
- Sinon : le livreur avance les frais demandés par le service courrier, récupère le colis, joint le justificatif et livre le destinataire.
- Le destinataire paie les frais de livraison, le forfait de service de 600 FCFA et, si nécessaire, le remboursement exact des frais courrier avancés.
- La répartition du forfait est 100 FCFA plateforme et 500 FCFA livreur.

### Expédition depuis le client vers la gare
- Le livreur récupère le colis chez le client et avance les frais exigés par le service courrier.
- Il joint la preuve de dépôt/expédition.
- Après confirmation de l'expédition, le client règle les frais de livraison, le montant réel du service courrier et le forfait de service de 600 FCFA.
- Répartition du forfait : 100 FCFA plateforme, 500 FCFA livreur.
- L'avance courrier remboursée au livreur doit être séparée des commissions et ne doit pas être incluse dans leur calcul.

Les frais du service courrier sont variables : le système doit enregistrer le montant réel, la preuve et le statut de remboursement. Aucun montant forfaitaire transporteur ne doit être inventé.

## Constat technique du dépôt au moment de l'audit
- Le Worker Cloudflare existant gère déjà l'authentification Firebase, les paiements Jèko, les webhooks signés et les écritures Firestore via compte de service.
- Le Worker expose actuellement les routes checkout, status, webhook et divers services existants. Le service portefeuille n'est pas encore intégré.
- Dans `index.html`, l'acceptation et la clôture de missions utilisent des transactions Firestore depuis le navigateur.
- Les règles Firestore autorisent actuellement le partenaire affecté à faire passer une commande de `arrive_destination` à `livre`. Cette voie directe ne peut pas servir de déclencheur financier fiable.
- Les règles interdisent déjà les écritures clientes dans `payments` et `payment_webhooks`; le Worker utilise le compte de service pour ces écritures.

## Architecture de sécurité cible
1. **Recharge Jèko** : route Worker authentifiée qui crée une demande de paiement identifiée par une référence unique et un montant déterminé côté serveur. Le webhook vérifie la signature brute Jèko et crédite le portefeuille dans une transaction idempotente.
2. **Acceptation mission** : validation côté serveur du statut du livreur, de son abonnement, de l'absence de mission active et de son portefeuille. Le navigateur ne décide jamais si le solde permet une nouvelle mission.
3. **Clôture mission** : route Worker authentifiée qui vérifie l'identité du livreur, l'affectation et le statut autorisé, calcule la commission à partir du tarif privé confirmé, puis clôture et débite dans une seule transaction atomique/idempotente.
4. **Journal immuable** : une écriture par événement financier avec identifiant idempotent, type, commande/recharge, montant signé, solde avant/après, date et métadonnées nécessaires.
5. **Interface livreur** : solde, historique, bouton de recharge, alerte à 1 000 FCFA, état de blocage à zéro et détail des commissions.
6. **Règles Firestore** : interdire toute écriture directe du livreur sur le solde et le journal ; protéger les champs de paiement et les champs financiers des commandes.
7. **Migration sans perte** : aucune suppression ou réécriture destructive des commandes, historiques, paiements ou documents existants.

## Tests obligatoires
- Pourcentages 10 % et 15 % sur les seuls frais de livraison.
- Gare : ajout fixe de 100 FCFA, exclusion des 500 FCFA du livreur et des frais courrier.
- Montants entiers, arrondis, zéro et valeurs invalides.
- Webhook Jèko : signature invalide, événement répété, paiement échoué, montant/devise/référence incohérents.
- Débit de commission exactement une fois malgré appels concurrents ou répétés.
- Commande annulée/non livrée : aucun débit.
- Solde nul : refus de nouvelle mission ; mission déjà acceptée terminable.
- Recharge confirmée : crédit exactement une fois.
- Les boutiques conservent leur prix de livraison et le taux de commission de 10 %.
- Tests de règles Firestore : aucun client ne peut créditer/débiter son portefeuille ou modifier son journal.

## Déploiement
Aucune fusion, migration de données ou mise en production avant revue du code, tests automatisés et validation explicite. Vérifier également les obligations applicables à la conservation de fonds prépayés pour compte de tiers avant activation réelle.
