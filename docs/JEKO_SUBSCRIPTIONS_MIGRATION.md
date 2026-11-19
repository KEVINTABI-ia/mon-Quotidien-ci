# Migration des abonnements vers Jèko

## Décision produit

Jèko est l'unique prestataire autorisé pour tout paiement d'abonnement payant et tout renouvellement. Aucun transfert Wave/Orange déclaré par le client, référence saisie manuellement ou validation administrative ne peut activer un abonnement.

Les périodes d'essai gratuites restent inchangées. Les paiements hors abonnement (ex. frais de récupération d'objet, commandes) ne sont pas concernés.

## Périmètre identifié sur main

| Rubrique | Configuration | Document métier / activation |
|---|---|---|
| Automobiliste | `services.automobiliste` | `abonnements_automobiliste/{uid}` — déjà traité par le Worker |
| Petites annonces | `services.petites_annonces` | `abonnements_petites_annonces/{uid}` — essai gratuit conservé, renouvellement à migrer |
| Boutique / commerce classique | `services.boutiques_15j`, `boutiques_30j`, et nouvelles formules `boutiques_1mois`, `boutiques_2mois`, `boutiques_3mois` | `demandes_nouveaux_services/{id}` — publication/échéance à activer par paiement confirmé |
| Boutique partenaire | mêmes formules boutiques | `demandes_nouveaux_services/{id}` et `demandes_renouvellement_boutiques/{id}` — renouvellement à migrer |
| Partenaires colis | `partenaires_colis_1mois`, `_3mois`, `_6mois` | `partenaires/{uid}` — période d'essai conservée, renouvellement à migrer |
| Compagnies de voyage | `compagnie_essentielle_mensuel`, `_annuel`, `compagnie_professionnelle_mensuel`, `_annuel` | `compagnies/{id}` — dossier et abonnement doivent être dissociés |
| Compagnies de ramassage | `services.ramassage` | `comptes_ramassage/{uid}` — approbation du dossier séparée de l'activation payante |
| Annuaire | configuration à confirmer dans le code | `demandes_nouveaux_services/{id}` — vérifier si l'accès est soumis à un forfait ou à une validation éditoriale |

## Architecture cible

1. Le client s'authentifie avec Firebase et demande au Worker un checkout en donnant uniquement un identifiant de rubrique, une formule et l'identifiant de son dossier si celui-ci existe.
2. Le Worker vérifie l'identité, le propriétaire du dossier, l'état de la demande, la formule autorisée, son activation, son prix et sa durée dans Firestore. Le montant envoyé au prestataire est calculé côté serveur ; aucun montant fourni par le navigateur n'est accepté.
3. Le Worker crée un document `payments/{paymentId}` contenant un type d'opération explicite (`subscription_purchase` ou `subscription_renewal`), une cible métier, une formule figée, le montant XOF et la durée vérifiée, puis crée la demande Jèko.
4. Le webhook vérifie la signature HMAC, la référence, l'identifiant de demande, le magasin, la devise et le montant. Il active uniquement la cible métier enregistrée dans le document de paiement, avec une écriture atomique et idempotente.
5. Le statut de paiement est consultable par son propriétaire. Les états ambigus imposent une vérification de statut ; ils ne doivent jamais déclencher une nouvelle demande aveugle.
6. Les règles Firestore refusent les champs de déclaration manuelle et empêchent un client ou un administrateur via le SDK navigateur de confirmer un paiement. Le Worker utilise le compte de service côté serveur.
7. Les actions d'administration peuvent approuver/rejeter un dossier professionnel, mais ne peuvent pas attribuer une période payante. Approbation du dossier et activation de l'abonnement restent deux opérations distinctes.

## Contraintes de sécurité et de compatibilité

- Ne pas supprimer les données ni l'historique des anciens paiements.
- Les anciennes demandes manuelles en attente doivent être marquées comme non migrées/à régulariser ; elles ne doivent pas être automatiquement converties en paiements Jèko ni activées.
- Préserver les essais gratuits existants et empêcher leur réutilisation si `essaiGratuitUtilise` ou un état équivalent l'indique.
- Préserver les montants, promotions, durées et formules configurés ; ne pas introduire de tarif codé en dur en remplacement de la configuration.
- Pour les compagnies de voyage, permettre la création et l'examen du dossier sans activer l'abonnement. La confirmation Jèko seule renseigne les dates et le statut payant.
- Pour le ramassage, l'administration peut approuver le profil, mais seul un paiement Jèko confirmé active l'abonnement.
- Les paiements de récupération d'objet restent sur leur parcours Jèko actuel et ne doivent pas être reclassés en abonnements.

## Ordre d'implémentation

- [ ] Étape 1 — Contrat de données, mappings des rubriques et tests de sécurité.
- [ ] Étape 2 — Checkout Worker générique et vérification serveur des formules.
- [ ] Étape 3 — Activation webhook pour chaque cible, transactions atomiques et idempotence.
- [ ] Étape 4 — Migration des interfaces : suppression des coordonnées Wave/Orange et références manuelles ; bouton « Payer avec Jèko ».
- [ ] Étape 5 — Règles Firestore : bloquer les anciens chemins d'activation, conserver les créations de dossiers et essais gratuits.
- [ ] Étape 6 — Tests de non-régression, tests webhook simulés, puis un seul paiement réel contrôlé par rubrique avant activation générale.

## Critères d'acceptation

- Aucun client ne peut écrire `paiementStatut: "confirme"`, `statutAbonnement: "Actif"`, `abonnement: "actif"` ou une date d'expiration payante via Firestore client.
- Aucun bouton ou formulaire d'abonnement ne demande une référence Wave/Orange.
- Le webhook ne peut activer qu'un document cible lié au paiement Jèko vérifié.
- Un webhook répété n'ajoute pas deux périodes d'abonnement.
- Un paiement échoué ou ambigu n'active rien.
- Les essais gratuits, dossiers en attente et historiques sont préservés.
