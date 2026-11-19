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
- [x] Première verticale webhook — petites annonces, écriture atomique et idempotence.
- [x] Première verticale interface — renouvellement petites annonces via catalogue et checkout Jèko ; suppression du formulaire Wave/Orange et de la référence manuelle.
- [x] Première verticale sécurité — règles Firestore empêchant l'activation ou la modification des dates/paiements par le client ou l'administrateur via le SDK navigateur. L'essai gratuit initial reste autorisé.
- [x] Deuxième verticale backend — renouvellement boutique partenaire, avec contrôle de propriété/dossier approuvé, formule configurée, verrou anti-doublon, webhook Jèko et activation atomique.
- [x] Deuxième verticale interface — choix de formule et paiement Jèko depuis l'espace partenaire ; validation manuelle admin désactivée.
- [x] Deuxième verticale sécurité — blocage des demandes de renouvellement manuelles et des écritures navigateur des dates/champs d'abonnement boutique.
- [x] Troisième verticale backend — renouvellement des partenaires colis, contrôle du compte approuvé/actif, échéance essai/abonnement, verrou anti-doublon et webhook atomique.
- [x] Troisième verticale interface — espace partenaire basculé vers catalogue et checkout Jèko ; confirmation et activation manuelles désactivées.
- [x] Troisième verticale sécurité — règles partenaires empêchant les écritures navigateur des champs d'abonnement payant ; essai gratuit administrateur conservé.
- [ ] Étendre les étapes précédentes aux autres rubriques.
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

## Interfaces et règles de sécurité — petites annonces

L'interface de gestion des petites annonces propose maintenant le catalogue Jèko puis le checkout Jèko, avec Wave, Orange Money, MTN Money, Moov Money et Djamo comme moyens disponibles au sein du parcours Jèko. Les champs de référence manuelle et les coordonnées de transfert ne sont plus demandés. La liste administrative des anciens renouvellements en attente est désormais informative et ne propose plus de bouton de confirmation manuelle.

Les règles Firestore conservent la création de l'essai gratuit initial, mais interdisent les modifications navigateur des statuts, dates d'expiration et champs de paiement de l'abonnement, y compris par un administrateur connecté depuis l'interface. Le Worker avec Admin SDK est l'unique chemin d'activation. Les anciennes demandes en attente restent dans les données et doivent être traitées séparément ; elles ne sont pas automatiquement validées.

## Portée actuelle de la migration exécutable

Quatre verticales sont câblées en source (catalogue, checkout, webhook, interface et règles) : **renouvellement petites annonces**, **renouvellement des boutiques en mode partenaire déjà approuvées**, **renouvellement des partenaires colis** et **inscription/renouvellement des compagnies de voyage**. Les nouvelles inscriptions petites annonces continuent de préserver l'essai gratuit initial. Les abonnements initiaux des boutiques classiques et partenaires, ainsi que l'annuaire, restent à migrer. Cette branche n'est pas encore fusionnée ni déployée.

## Deuxième verticale : boutiques partenaires

Le Worker accepte désormais `serviceId: "boutique_renewal"` avec `boutiqueId` et `planId` parmi `boutiques_1mois`, `boutiques_2mois`, `boutiques_3mois`. Il exige un utilisateur Firebase authentifié qui possède le dossier boutique, lequel doit être de type commerce, en mode partenaire et approuvé. Prix et durée sont lus côté serveur dans `configuration_abonnements/globale`. Un verrou écrit dans le document boutique empêche les demandes concurrentes ; un paiement déjà en cours, ambigu ou à examiner bloque une nouvelle tentative.

Le webhook signé valide les données du prestataire, prolonge l'échéance avec un calcul de mois calendaires, met à jour le paiement et écrit le reçu dans un commit Firestore atomique. L'espace partenaire propose les formules Jèko et redirige vers le checkout ; les anciennes demandes de renouvellement manuelles ne peuvent plus être créées ni validées depuis le navigateur. Les anciennes demandes restent lisibles pour historique.

Limite : cette verticale couvre les **renouvellements des boutiques en mode partenaire déjà approuvées**. Elle ne migre pas encore les créations/abonnements initiaux des boutiques classiques ni l'activation initiale des partenaires, qui doivent être traités séparément. Aucun paiement réel n'a été réalisé et la branche n'est pas déployée.

## Troisième verticale : partenaires colis

Le Worker accepte `serviceId: "partenaire_colis"` et une formule parmi `partenaires_colis_1mois`, `partenaires_colis_3mois` et `partenaires_colis_6mois`. Il vérifie que le compte connecté possède un dossier partenaire approuvé et actif, que la période d'essai ou l'abonnement n'est pas encore en cours, puis lit le prix et la durée dans la configuration Firestore. Un verrou de paiement empêche les doublons et les paiements en cours/ambigus bloquent une nouvelle tentative.

Le webhook Jèko signé active la formule, calcule l'échéance, conserve l'historique des abonnements et écrit le reçu dans un commit atomique. L'espace partenaire propose désormais le checkout Jèko ; les anciennes demandes Wave/Orange et la confirmation manuelle sont désactivées. L'administration conserve l'action de démarrage de l'essai gratuit de 21 jours, mais ne peut plus activer manuellement une période payante depuis le navigateur.

Cette verticale couvre le renouvellement payant des partenaires colis approuvés (y compris la première formule après l'essai, si le dossier est déjà approuvé). Elle ne remplace pas le processus d'approbation initial du dossier.

## Quatrième verticale : compagnies de voyage

L'inscription d'une compagnie ne demande plus de transfert Wave/Orange ni de référence manuelle. Le dossier est créé avec le statut `Dossier à vérifier`, puis l'administrateur peut seulement l'approuver en le passant à `À payer` ; cette approbation ne crée aucun abonnement actif. Le titulaire règle ensuite depuis son espace compagnie avec le checkout Jèko, selon la formule et la périodicité enregistrées. Le renouvellement après expiration utilise le même parcours.

Le Worker vérifie le propriétaire du dossier, son statut (paiement initial autorisé uniquement après approbation ; renouvellement uniquement après expiration), le plan configuré dans Firestore, le montant et la durée côté serveur. Il pose un verrou anti-doublon, puis le webhook Jèko signé vérifie le paiement et active l'abonnement avec les dates et le montant confirmés dans un commit atomique. Le verrou du dossier doit correspondre au paiement traité. Les règles Firestore n'autorisent plus la création d'un dossier avec moyen/référence de paiement manuels ; l'administrateur ne peut plus activer un abonnement payé en modifiant directement les dates ou le statut actif depuis le navigateur.

Les demandes historiques en statut `En attente` ne sont pas automatiquement converties ni validées. Aucun paiement réel n'a été effectué. Le Worker, l'interface et les règles ne sont pas encore déployés.
