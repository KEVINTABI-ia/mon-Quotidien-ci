# Spécification technique — Portefeuille livreur et commissions

## Statut
- Recharge Jèko livreur : route de checkout intégrée au Worker, montant validé côté serveur, crédit déclenché uniquement après webhook Jèko signé et vérifié (référence, demande, magasin, devise et montant).
- Le crédit du portefeuille, la mise à jour du solde et l'écriture du journal de recharge sont groupés dans un commit Firestore avec préconditions et reçu idempotent.
- Espace livreur : affichage du solde, alerte, formulaire de recharge (10 000 FCFA proposé par défaut, montant modifiable), moyens Wave/Orange Money/MTN Money et historique des opérations.
- Les écritures directes du client sur le portefeuille et son journal sont interdites par les règles Firestore.
- Clôture des livraisons indépendantes : route Worker authentifiée `/api/courier/mission/complete`, transition finale, débit du portefeuille, journal et libération du verrou dans une transaction Firestore.
- Acceptation des nouvelles missions indépendantes : règles Firestore vérifient un solde strictement positif et aucune dette de commission ; les missions déjà acceptées restent terminables.
- La clôture des missions de gare reste distincte et n'est pas encore intégrée au portefeuille des livreurs indépendants.

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
- Montant minimum de recharge : 2 000 FCFA. Le formulaire propose les montants 2 000, 3 000, 4 000, 5 000, 6 000, 7 000, 8 000, 9 000 et 10 000 FCFA ; le livreur peut aussi saisir librement un autre montant, à partir de 2 000 FCFA. La valeur initiale de 10 000 FCFA reste modifiable.
- Alerte de solde faible à 1 000 FCFA.
- À 0 FCFA : aucune nouvelle mission ne peut être acceptée.
- Si une commission dépasse le solde, le solde disponible est débité jusqu'à zéro et le reliquat est enregistré comme dette distincte. Le solde disponible ne devient jamais négatif.
- Une mission déjà acceptée peut être terminée, même si le solde atteint zéro entre-temps ou si une dette de commission apparaît à la clôture.
- Toute dette de commission bloque les nouvelles missions, même si un solde disponible positif subsiste.
- **Aucune commission n'est prélevée à l'acceptation d'une mission ni pendant son exécution.**
- **Le débit intervient une seule fois, après confirmation serveur de la fin effective de la prestation.**
- Les commandes annulées ou non livrées ne génèrent aucune commission.
- Recharge par Jèko : le livreur verse le montant choisi sur le compte Jèko de MON QUOTIDIEN CI. La totalité du paiement confirmé est portée au crédit de son portefeuille (par exemple, 10 000 FCFA payés = 10 000 FCFA affichés). Le crédit intervient uniquement après validation du webhook Jèko signé, jamais sur la seule base d'une redirection navigateur. Les fonds rechargés constituent un solde prépayé dû au livreur, et non un revenu intégral de la plateforme au moment de la recharge.
- Chaque recharge confirmée rembourse d'abord la dette de commission ; seul le reliquat augmente le solde disponible.
- À chaque livraison effectivement terminée et confirmée, la commission calculée pour cette prestation est soustraite du solde prépayé (exemple : 300 FCFA de commission font passer 10 000 à 9 700 FCFA).
- À 1 000 FCFA ou moins, une alerte de solde faible est affichée au livreur. À 0 FCFA, aucune nouvelle mission ne peut être acceptée.
- Le solde non consommé appartient au livreur ; les commissions effectivement prélevées sont enregistrées séparément et constituent le revenu de commission de la plateforme.
- Le journal doit tracer recharges, commissions, remboursements d'avances courrier et ajustements administratifs, avec référence unique, horodatage et acteur.

La procédure de remboursement du solde non consommé à la clôture du compte reste à préciser avant mise en production. Le Worker impose le minimum de 2 000 FCFA et une limite technique de 10 000 000 FCFA.

## Déclencheurs de clôture et de commission

La fonction de calcul de commission ne constitue jamais, à elle seule, une autorisation de débit. Le Worker doit contrôler l'événement métier, l'affectation, le statut courant, le tarif confirmé et l'absence d'un débit antérieur.

- **Livraison classique et livraison boutique :** débit uniquement lors du passage serveur validé de `arrive_destination` à `livre`, après confirmation effective de la fin de course et du règlement convenu.
- **Récupération à la gare :** débit après remise effective du colis au destinataire et clôture confirmée de la mission. Le retrait du colis au guichet de la gare ne suffit pas.
- **Expédition depuis le client vers la gare :** débit après confirmation du dépôt effectif du colis au service courrier. La saisie par le livreur du nom de la compagnie, de la gare et du code de suivi ne constitue pas, à elle seule, une preuve vérifiée de dépôt. Le flux actuel enregistre ces références et passe la commande à `livre` ; il devra être complété par une preuve de dépôt et une étape de confirmation avant d'autoriser le débit.
- **Événements non déclencheurs :** création, acceptation, affectation, récupération du colis, passage en transit, arrivée à destination, refus, annulation ou simple redirection vers une page de paiement.
- **Idempotence :** une clé financière stable par commande et par type de commission empêche tout double débit, y compris en cas d'appels concurrents ou de répétition de requête.
- **Atomicité :** le passage au statut final, le débit du solde, l'écriture du journal et la libération du verrou de mission doivent être effectués dans une même transaction Firestore côté Worker. En cas d'échec, aucune de ces opérations ne doit être partiellement appliquée.

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
- Dans `index.html`, l'acceptation utilise toujours une transaction Firestore, mais les règles imposent désormais un portefeuille positif et sans dette pour les livreurs indépendants.
- La clôture des livraisons indépendantes appelle le Worker ; la clôture directe côté navigateur est refusée par les règles Firestore. Le Worker vérifie l'affectation, le statut, le verrou, le tarif privé et le journal existant, puis met à jour le statut, le solde, la dette, le journal et le verrou dans une transaction Firestore.
- Le traitement de clôture du représentant de gare reste sur son parcours distinct, sans débit de portefeuille livreur.
- La clôture d'expédition gare enregistre actuellement des références saisies par le livreur et passe la commande à `livre`, sans preuve de dépôt vérifiée par le serveur.
- Les règles Firestore autorisent actuellement le partenaire affecté à faire passer une commande de `arrive_destination` à `livre`. Cette voie directe ne peut pas servir de déclencheur financier fiable.
- Les règles interdisent déjà les écritures clientes dans `payments` et `payment_webhooks`; le Worker utilise le compte de service pour ces écritures.

## Architecture de sécurité cible
1. **Recharge Jèko** : route Worker authentifiée qui crée une demande de paiement identifiée par une référence unique et un montant déterminé côté serveur. Le webhook vérifie la signature brute Jèko et crédite le portefeuille dans une transaction idempotente.
2. **Acceptation mission** : validation du statut du livreur, de son abonnement, de l'absence de mission active et du portefeuille par les règles Firestore ; le navigateur ne peut pas contourner le contrôle de solde.
3. **Clôture mission indépendante** : route Worker authentifiée qui vérifie l'identité du livreur, l'affectation et le statut autorisé, calcule la commission à partir du tarif privé confirmé, puis clôture et débite dans une seule transaction atomique/idempotente. Les missions de gare restent hors de ce flux.
4. **Journal immuable** : une écriture par événement financier avec identifiant idempotent, type, commande/recharge, montant signé, solde avant/après, date et métadonnées nécessaires.
5. **Interface livreur** : solde, historique, bouton de recharge, alerte à 1 000 FCFA, état de blocage à zéro et détail des commissions.
6. **Règles Firestore** : interdire toute écriture directe du livreur sur le solde et le journal ; protéger les champs de paiement et les champs financiers des commandes.
7. **Migration sans perte** : aucune suppression ou réécriture destructive des commandes, historiques, paiements ou documents existants.

## Tests obligatoires
- Pourcentages 10 % et 15 % sur les seuls frais de livraison.
- Gare : ajout fixe de 100 FCFA, exclusion des 500 FCFA du livreur et des frais courrier.
- Montants entiers, arrondis, zéro et valeurs invalides.
- Aucun débit lors de l'acceptation, de la récupération, du transit ou de l'arrivée à destination.
- Débit uniquement sur transition finale serveur autorisée ; expédition gare uniquement après preuve de dépôt confirmée.
- Webhook Jèko : signature invalide, événement répété, paiement échoué, montant/devise/référence incohérents.
- Débit de commission exactement une fois malgré appels concurrents ou répétés.
- Commande annulée/non livrée : aucun débit.
- Solde nul : refus de nouvelle mission ; mission déjà acceptée terminable.
- Commission supérieure au solde : débit partiel, dette distincte, blocage des nouvelles missions.
- Recharge inférieure/supérieure à la dette : remboursement prioritaire de la dette, reliquat crédité au solde disponible.
- Recharge confirmée : crédit exactement une fois.
- Les boutiques conservent leur prix de livraison et le taux de commission de 10 %.
- Tests de règles Firestore : aucun client ne peut créditer/débiter son portefeuille ou modifier son journal.

## Déploiement
Aucune fusion, migration de données ou mise en production avant revue du code, tests automatisés et validation explicite. Vérifier également les obligations applicables à la conservation de fonds prépayés pour compte de tiers avant activation réelle.
