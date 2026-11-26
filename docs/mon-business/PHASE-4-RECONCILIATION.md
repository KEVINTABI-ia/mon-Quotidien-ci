# MON BUSINESS — rapprochement financier (phase 1)

## Portée de cette livraison
Cette phase ajoute le moteur déterministe de rapprochement entre des lignes normalisées de relevé et les opérations financières exécutées.

Une ligne de relevé est représentée par :
- `date` : date locale au format `YYYY-MM-DD` ;
- `amountXof` : montant positif entier en FCFA ;
- `reference` : référence facultative ;
- `paymentMethod` : moyen de paiement facultatif.

Le moteur exige une égalité exacte du montant et de la date. Si un moyen de paiement est fourni, il doit également correspondre. Une référence identique départage les candidats lorsqu'elle existe.

## Résultats
Chaque ligne est classée :
- `matched` : une seule opération exécutée correspond ;
- `unmatched` : aucune opération correspondante ;
- `ambiguous` : plusieurs opérations correspondent, une validation humaine est nécessaire.

Une opération du journal ne peut être utilisée qu'une seule fois dans un même rapprochement. Les opérations en attente ou approuvées sont ignorées.

## Sécurité et limites
- Fonction pure côté Worker, sans écriture Firestore ni changement de solde.
- Maximum 500 lignes par lot.
- Aucune tolérance automatique sur les montants ou les dates.
- Cette phase ne fournit pas encore l'écran d'import CSV, la persistance des relevés ni la validation finale des écarts. Ces étapes seront livrées séparément après validation du moteur.
