# MON BUSINESS — phase 3 : tableau de bord financier

## Indicateurs et rapports
- Tableau de bord par activité : solde consolidé des caisses, recettes exécutées, dépenses exécutées, résultat net, opérations en attente et opérations exécutées.
- Les recettes et dépenses sont calculées uniquement sur les opérations `executed`; les transferts internes sont exclus du résultat net.
- Filtres serveur par date de création, type d'opération et caisse. Les opérations sont filtrées après vérification des droits d'accès à l'activité.
- Graphique comparatif simple des recettes et dépenses sur le périmètre filtré.
- Export CSV du journal filtré et export CSV des indicateurs. Les cellules CSV sont échappées et le fichier utilise UTF-8 avec BOM.
- Le solde total des caisses reste calculé sur toutes les opérations exécutées de l'activité, indépendamment des filtres de journal.

## Limite de volume
- Le moteur de lecture actuel charge au plus 200 documents par collection. L'API signale cette limite à l'interface afin d'éviter de présenter un résultat tronqué comme exhaustif. Un futur lot devra introduire une pagination Firestore par curseur pour les historiques volumineux.
- Le filtre par date utilise la date de création de l'opération. Les exports sont limités aux lignes actuellement retournées par le journal.

## Sécurité
- Les données sont toujours lues par le Worker après contrôle de la permission `view` sur l'activité.
- Aucun accès direct du navigateur aux collections financières n'est ajouté.
- Les indicateurs financiers ne font confiance qu'aux écritures dont le statut est `executed`.
