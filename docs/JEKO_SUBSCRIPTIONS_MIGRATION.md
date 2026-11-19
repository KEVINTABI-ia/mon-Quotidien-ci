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

- [x] Étape 1 — Contrat de données et première brique catalogue : endpoint authentifié `GET /api/jeko/subscription-plans?serviceId=...`. Il lit `configuration_abonnements/globale`, expose uniquement les formules actives, calcule la promotion côté serveur et masque les tarifs invalides ou nuls. Il n'initie aucun paiement.
- [x] Première verticale backend — checkout Jèko et activation webhook pour le renouvellement des petites annonces. Le Worker vérifie le propriétaire, l'expiration, l'absence de demande en attente, puis lit prix/durée dans Firestore. Le webhook vérifie les données Jèko et met à jour le document d'abonnement avec une écriture atomique idempotente.
- [ ] Étape 2 — Étendre le checkout générique aux autres formules et rubriques.
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

## Endpoint catalogue ajouté dans la branche de migration

`GET /api/jeko/subscription-plans?serviceId=...` accepte les identifiants `automobiliste`, `petites_annonces`, `boutiques`, `partenaires_colis`, `compagnie_voyage` et `ramassage`. Il exige un jeton Firebase valide. Les montants et durées viennent exclusivement de `configuration_abonnements/globale`; le navigateur ne peut pas les imposer. Les plans désactivés ou dont le tarif/durée ne sont pas valides ne sont pas proposés à l'achat. Un prix nul, notamment la configuration actuelle de ramassage, n'est pas transformé en paiement.

Limite actuelle : cet endpoint ne crée pas encore de paiement. Les rubriques listées ne doivent pas encore être considérées comme migrées vers Jèko tant que le checkout, les cibles métier du webhook, les interfaces et les règles Firestore ne sont pas terminés.

## Première verticale backend : renouvellement petites annonces

Le Worker accepte désormais `serviceId: "petites_annonces"` sur `POST /api/jeko/checkout`. Le client ne fournit ni prix ni durée. Le Worker exige un compte Firebase authentifié, un abonnement existant dont l'échéance est passée, l'absence d'un ancien paiement en attente/à vérifier, puis récupère le prix et la durée depuis `configuration_abonnements/globale.services.petites_annonces`. Le plan doit être actif, en jours, avec une durée de 1 à 365 jours et un montant positif.

Après confirmation du webhook signé et validation de la référence, de la demande, du magasin, de la devise et du montant, le Worker prolonge l'abonnement et marque le paiement confirmé dans une seule écriture Firestore atomique, protégée contre les webhooks répétés.

**Important :** cette étape backend n'a pas encore remplacé les formulaires Wave/Orange dans `index.html` ni les règles Firestore. Ne pas proposer le renouvellement petites annonces en production via ce nouveau flux tant que ces deux éléments ne sont pas migrés et testés. Les autres rubriques ne sont pas encore migrées.
