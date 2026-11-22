const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Timestamp } = require("firebase/firestore");

const PROJECT_ID = "mon-transport-ci-rules-test";
const ADMIN_UID = "3LpoTLyQdtVcdtnSMAJFc7Cvnpz2";
const CLIENT_UID = "client-test-001";
const PARTNER_UID = "partner-test-001";
const OTHER_UID = "other-test-001";
const ORDER_ID = "order-test-001";

let testEnv;

function futureDate(hours = 24) {
  return Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);
}

function partnerFixture(overrides = {}) {
  return {
    uid: PARTNER_UID,
    type: "livreur_independant",
    nom: "Partenaire test",
    telephone: "00000000",
    commune: "Yopougon",
    email: "partner@example.test",
    dateNaissance: "1990-01-01",
    lieuNaissance: "Abidjan",
    numeroIdentite: "TEST-ID",
    statut: "approuve",
    etatCompte: "actif",
    statutAbonnementPartenaire: "Actif",
    dateExpirationAbonnement: futureDate(),
    enLigne: true,
    createdAt: Timestamp.now(),
    ...overrides
  };
}

function ramassageCompanyFixture(overrides = {}) {
  return {
    uid: PARTNER_UID, role: "compagnie", nom: "Compagnie test",
    telephone: "0100000000", email: "partner@example.test",
    statut: "approuve", abonnement: "actif",
    dateExpirationAbonnement: futureDate(24),
    createdAt: Timestamp.now(), ...overrides
  };
}

function privateFixture() {
  return {
    clientId: CLIENT_UID,
    clientNom: "Client test",
    clientTelephone: "0100000000",
    telephoneExpediteur: "0100000000",
    telephoneDestinataire: "0200000000",
    adresseRecuperation: "Yopougon, zone test",
    adresseLivraison: "Adjamé, zone test",
    descriptionColis: "Document de test",
    trackingNumber: "MTC-TEST-001",
    createdAt: Timestamp.now()
  };
}

async function seedBase() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await db.doc(`partenaires/${PARTNER_UID}`).set(partnerFixture());
    await db.doc(`partenaires/${OTHER_UID}`).set(partnerFixture({
      uid: OTHER_UID,
      email: "other@example.test",
      nom: "Autre partenaire"
    }));
  });
}

describe("Mon Transport CI — règles Firestore", function () {
  this.timeout(30000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(resolve(__dirname, "..", process.env.FIRESTORE_RULES_FILE || "firestore.rules"), "utf8")
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedBase();
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });



  it("autorise une commande boutique sans tarif initial puis le fixe par le propriétaire avant l'envoi au livreur", async () => {
    const SHOP_ID = "shop-test-001";
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`demandes_nouveaux_services/${SHOP_ID}`).set({
        uid: CLIENT_UID, type: "commerce", titre: "Boutique test", categorie: "Boutique",
        commune: "Yopougon", telephone: "0100000000", description: "Commerce de test",
        email: "shop@example.test", statut: "approuve", abonnementFin: futureDate()
      });
    });
    const db = testEnv.authenticatedContext(CLIENT_UID, {email:"client@example.test"}).firestore();
    const {doc,writeBatch,serverTimestamp,updateDoc} = require("firebase/firestore");
    const orderRef=doc(db,"commandes_colis",ORDER_ID);
    const privateRef=doc(db,"commandes_colis",ORDER_ID,"informations_privees","details");
    const priceRef=doc(db,"commandes_colis",ORDER_ID,"tarification","prix");
    const createBatch=writeBatch(db);
    createBatch.set(orderRef,{clientId:CLIENT_UID,service:"livraison",depart:"Yopougon",destination:"Adjamé",statut:"commande_boutique",publicVersion:false,createdAt:serverTimestamp(),typeCommande:"boutique",boutiqueId:SHOP_ID,boutiqueUid:CLIENT_UID,boutiqueNom:"Boutique test",montantLivraisonBoutique:0});
    createBatch.set(privateRef,{...privateFixture(),createdAt:serverTimestamp(),telephoneBoutique:"0100000000",telephoneClient:"0100000000",boutiqueUid:CLIENT_UID,produitCommande:"Riz",quantiteCommande:1,prixProduit:5000});
    createBatch.set(priceRef,{distanceKm:0,distanceMetres:0,tarifKm:100,montantLivraison:0,fraisService:0,montantTotal:0,devise:"FCFA",operation:"livraison_boutique",createdAt:serverTimestamp()});
    await assertSucceeds(createBatch.commit());
    const dispatchBatch=writeBatch(db);
    dispatchBatch.update(orderRef,{montantLivraisonBoutique:1500,statut:"en_attente",publicVersion:true,dateMiseEnLivraison:serverTimestamp()});
    dispatchBatch.update(priceRef,{montantLivraison:1500,montantTotal:1500});
    await assertSucceeds(dispatchBatch.commit());
    const otherDb=testEnv.authenticatedContext(OTHER_UID,{email:"other@example.test"}).firestore();
    await assertFails(updateDoc(doc(otherDb,"commandes_colis",ORDER_ID),{montantLivraisonBoutique:2000}));
  });

  it("autorise un utilisateur authentifié à créer et lire uniquement son profil général", async () => {
    const {doc,setDoc,getDoc,serverTimestamp}=require("firebase/firestore");
    const db=testEnv.authenticatedContext(CLIENT_UID,{phone_number:"+2250700000000"}).firestore();
    const profile={uid:CLIENT_UID,nom:"Utilisateur test",telephone:"+2250700000000",email:"",modeConnexion:"telephone",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
    await assertSucceeds(setDoc(doc(db,"utilisateurs",CLIENT_UID),profile));
    await assertSucceeds(getDoc(doc(db,"utilisateurs",CLIENT_UID)));
    const other=testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(other,"utilisateurs",CLIENT_UID)));
    await assertFails(setDoc(doc(db,"utilisateurs",OTHER_UID),{...profile,uid:OTHER_UID}));
  });

  it("autorise un utilisateur à créer son profil de ramassage mais pas à s'auto-attribuer un abonnement compagnie", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID, {email:"client@example.test"}).firestore();
    const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
    await assertSucceeds(setDoc(doc(db,"comptes_ramassage",CLIENT_UID),{
      uid:CLIENT_UID,role:"usager",nom:"Utilisateur test",telephone:"0100000000",
      email:"client@example.test",statut:"actif",abonnement:"non_applicable",createdAt:serverTimestamp()
    }));
    await assertFails(setDoc(doc(db,"comptes_ramassage","fake-company"),{
      uid:"fake-company",role:"compagnie",nom:"Fausse compagnie",telephone:"0100000000",
      email:"client@example.test",statut:"approuve",abonnement:"actif",createdAt:serverTimestamp()
    }));
  });

  it("réserve l'activation et le renouvellement du forfait ramassage au webhook Jèko", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`comptes_ramassage/${PARTNER_UID}`).set(ramassageCompanyFixture({
        abonnement:"inactif",statut:"en_attente",montantAbonnement:null,dateExpirationAbonnement:null
      }));
    });
    const {doc,updateDoc,serverTimestamp,Timestamp}=require("firebase/firestore");
    const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
    const companyRef=doc(adminDb,"comptes_ramassage",PARTNER_UID);
    await assertSucceeds(updateDoc(companyRef,{
      statut:"approuve",abonnement:"essai",
      dateDebutEssai:serverTimestamp(),
      dateFinEssai:Timestamp.fromMillis(Date.now()+30*86400000)
    }));
    await assertFails(updateDoc(companyRef,{
      abonnement:"actif",montantAbonnement:2000,dureeAbonnementJours:30,
      dateExpirationAbonnement:Timestamp.fromMillis(Date.now()+30*86400000)
    }));
    await assertFails(updateDoc(companyRef,{
      abonnement:"essai",dateDebutEssai:serverTimestamp(),
      dateFinEssai:Timestamp.fromMillis(Date.now()+30*86400000)
    }));
    const companyDb=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    await assertFails(updateDoc(doc(companyDb,"comptes_ramassage",PARTNER_UID),{
      abonnement:"actif",montantAbonnement:2000,dureeAbonnementJours:30,
      dateExpirationAbonnement:serverTimestamp()
    }));
    await assertFails(updateDoc(doc(companyDb,"comptes_ramassage",PARTNER_UID),{
      dateFinEssai:Timestamp.fromMillis(Date.now()+30*86400000)
    }));
  });

  it("autorise une compagnie de ramassage dont l'abonnement est valide à publier une offre", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`comptes_ramassage/${PARTNER_UID}`).set(ramassageCompanyFixture());
    });
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {collection,addDoc,serverTimestamp}=require("firebase/firestore");
    await assertSucceeds(addDoc(collection(db,"offres_ramassage"),{
      compagnieId:PARTNER_UID,compagnieNom:"Compagnie test",telephone:"0100000000",communeDepart:"Yopougon",
      points:"Bagnon",destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      placesDisponibles:12,tarif:25000,statut:"publiee",createdAt:serverTimestamp()
    }));
  });

  it("autorise une compagnie de ramassage approuvée à publier pendant ses 30 jours d’essai", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`comptes_ramassage/${PARTNER_UID}`).set(ramassageCompanyFixture({
        abonnement:"essai",dateExpirationAbonnement:null,dateFinEssai:futureDate(24)
      }));
    });
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {collection,addDoc,serverTimestamp}=require("firebase/firestore");
    await assertSucceeds(addDoc(collection(db,"offres_ramassage"),{
      compagnieId:PARTNER_UID,compagnieNom:"Compagnie test",telephone:"0100000000",communeDepart:"Yopougon",
      points:"Bagnon",destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      placesDisponibles:12,tarif:25000,statut:"publiee",createdAt:serverTimestamp()
    }));
  });

  it("refuse à une compagnie de ramassage dont l’essai gratuit est expiré de publier une offre", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`comptes_ramassage/${PARTNER_UID}`).set(ramassageCompanyFixture({
        abonnement:"essai",dateExpirationAbonnement:null,dateFinEssai:futureDate(-24)
      }));
    });
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {collection,addDoc,serverTimestamp}=require("firebase/firestore");
    await assertFails(addDoc(collection(db,"offres_ramassage"),{
      compagnieId:PARTNER_UID,compagnieNom:"Compagnie test",communeDepart:"Yopougon",
      points:"Bagnon",destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      placesDisponibles:12,tarif:25000,statut:"publiee",createdAt:serverTimestamp()
    }));
  });

  it("refuse à une compagnie de ramassage dont l'abonnement est expiré de publier une offre", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`comptes_ramassage/${PARTNER_UID}`).set(ramassageCompanyFixture({
        dateExpirationAbonnement: Timestamp.fromMillis(Date.now()-60000)
      }));
    });
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {collection,addDoc,serverTimestamp}=require("firebase/firestore");
    await assertFails(addDoc(collection(db,"offres_ramassage"),{
      compagnieId:PARTNER_UID,compagnieNom:"Compagnie test",communeDepart:"Yopougon",
      points:"Bagnon",destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      placesDisponibles:12,tarif:25000,statut:"publiee",createdAt:serverTimestamp()
    }));
  });

  it("refuse à une compagnie non approuvée de publier une offre de ramassage", async () => {
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {collection,addDoc,serverTimestamp}=require("firebase/firestore");
    await assertFails(addDoc(collection(db,"offres_ramassage"),{
      compagnieId:PARTNER_UID,compagnieNom:"Compagnie test",communeDepart:"Yopougon",
      points:"Bagnon",destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      placesDisponibles:12,tarif:25000,statut:"publiee",createdAt:serverTimestamp()
    }));
  });

  it("autorise un utilisateur à publier une demande mais protège sa lecture des autres utilisateurs", async () => {
    const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
    const {doc,setDoc,serverTimestamp,getDoc}=require("firebase/firestore");
    const ref=doc(db,"demandes_ramassage","demande-test");
    await assertSucceeds(setDoc(ref,{
      userId:CLIENT_UID,communeDepart:"Yopougon",pointDepart:"Bagnon",
      destination:"Plateau",jours:"Lundi-vendredi",heure:"06:00",
      places:1,statut:"ouverte",createdAt:serverTimestamp()
    }));
    const other=testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(other,"demandes_ramassage","demande-test")));
  });

  it("autorise le client à créer ensemble la commande publique et ses détails privés", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID, {
      email: "client@example.test"
    }).firestore();
    const batch = require("firebase/firestore").writeBatch(db);
    const { doc, serverTimestamp } = require("firebase/firestore");
    const orderRef = doc(db, "commandes_colis", ORDER_ID);
    const privateRef = doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details");
    const details = privateFixture();
    details.createdAt = serverTimestamp();

    batch.set(orderRef, {
      clientId: CLIENT_UID,
      service: "livraison",
      depart: "Yopougon",
      destination: "Adjamé",
      statut: "en_attente",
      publicVersion: true,
      createdAt: serverTimestamp()
    });
    batch.set(privateRef, details);
    await assertSucceeds(batch.commit());
  });

  it("refuse une commande sans document privé créé dans la même opération", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID, {
      email: "client@example.test"
    }).firestore();
    const { doc, setDoc, serverTimestamp } = require("firebase/firestore");
    await assertFails(setDoc(doc(db, "commandes_colis", ORDER_ID), {
      clientId: CLIENT_UID,
      service: "livraison",
      depart: "Yopougon",
      destination: "Adjamé",
      statut: "en_attente",
      publicVersion: true,
      createdAt: serverTimestamp()
    }));
  });

  it("refuse la création isolée d'informations privées", async () => {
    const db = testEnv.authenticatedContext(CLIENT_UID, {
      email: "client@example.test"
    }).firestore();
    const { doc, setDoc, serverTimestamp } = require("firebase/firestore");
    const details = privateFixture();
    details.createdAt = serverTimestamp();
    await assertFails(setDoc(
      doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details"),
      details
    ));
  });

  it("autorise le client propriétaire à lire ses détails privés", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/informations_privees/details`).set(privateFixture());
    });
    const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertSucceeds(getDoc(doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details")));
  });

  it("refuse à un autre client et à un partenaire non affecté de lire les détails privés", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/informations_privees/details`).set(privateFixture());
    });
    const { doc, getDoc } = require("firebase/firestore");
    const other = testEnv.authenticatedContext(OTHER_UID).firestore();
    const partner = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const privateRef = db => doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details");
    await assertFails(getDoc(privateRef(other)));
    await assertFails(getDoc(privateRef(partner)));
  });

  it("autorise l'administrateur à lire les détails privés", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/informations_privees/details`).set(privateFixture());
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertSucceeds(getDoc(doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details")));
  });

  it("interdit à un partenaire de modifier son approbation ou son abonnement", async () => {
    const db = testEnv.authenticatedContext(PARTNER_UID, {
      email: "partner@example.test"
    }).firestore();
    const { doc, updateDoc } = require("firebase/firestore");
    await assertFails(updateDoc(doc(db, "partenaires", PARTNER_UID), {
      statut: "approuve",
      statutAbonnementPartenaire: "Actif",
      dateExpirationAbonnement: futureDate(720)
    }));
  });

  it("autorise le partenaire éligible à changer uniquement sa disponibilité", async () => {
    const db = testEnv.authenticatedContext(PARTNER_UID, {
      email: "partner@example.test"
    }).firestore();
    const { doc, updateDoc, serverTimestamp } = require("firebase/firestore");
    await assertSucceeds(updateDoc(doc(db, "partenaires", PARTNER_UID), {
      enLigne: false,
      derniereActivite: serverTimestamp()
    }));
  });

  it("autorise uniquement le partenaire affecté à lire les détails privés", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        service: "livraison", statut: "livreur_affecte"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/informations_privees/details`).set(privateFixture());
    });
    const { doc, getDoc } = require("firebase/firestore");
    const assigned = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const notAssigned = testEnv.authenticatedContext(OTHER_UID).firestore();
    const privateRef = db => doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details");
    await assertSucceeds(getDoc(privateRef(assigned)));
    await assertFails(getDoc(privateRef(notAssigned)));
  });

  it("autorise un partenaire approuvé, abonné et en ligne à consulter une commande en attente", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertSucceeds(getDoc(doc(db, "commandes_colis", ORDER_ID)));
  });

  it("interdit à un partenaire hors ligne de consulter les nouvelles commandes", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`partenaires/${PARTNER_UID}`).update({ enLigne: false });
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertFails(getDoc(doc(db, "commandes_colis", ORDER_ID)));
  });

  it("interdit au livreur indépendant de consulter une commande réservée à une gare", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "compagnie", statut: "en_attente", publicVersion: true,
        depart: "Gare test", destination: "Gare destination"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertFails(getDoc(doc(db, "commandes_colis", ORDER_ID)));
  });


  it("autorise l'acceptation atomique d'une commande et la création du verrou", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
      await context.firestore().doc(`portefeuilles_livreurs/${PARTNER_UID}`).set({uid:PARTNER_UID,soldeDisponibleXof:5000,detteCommissionXof:0});
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, writeBatch, serverTimestamp } = require("firebase/firestore");
    const batch = writeBatch(db);
    batch.update(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: PARTNER_UID, partenaireNom: "Partenaire test",
      partenaireType: "livreur_independant", statut: "livreur_affecte",
      dateAffectation: serverTimestamp()
    });
    batch.set(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive"), {
      commandeId: ORDER_ID, statut: "active", createdAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  it("autorise l'administrateur à attribuer une commande avec le verrou correspondant", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
      await context.firestore().doc(`portefeuilles_livreurs/${PARTNER_UID}`).set({uid:PARTNER_UID,soldeDisponibleXof:5000,detteCommissionXof:0});
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const { doc, writeBatch, serverTimestamp } = require("firebase/firestore");
    const batch = writeBatch(db);
    batch.update(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: PARTNER_UID, partenaireNom: "Partenaire test",
      partenaireType: "livreur_independant", statut: "livreur_affecte",
      dateAffectation: serverTimestamp(), affectePar: ADMIN_UID
    });
    batch.set(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive"), {
      commandeId: ORDER_ID, statut: "active", createdAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });

  it("autorise le refus avant récupération puis libère le verrou", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        partenaireNom: "Partenaire test", partenaireType: "livreur_independant",
        service: "livraison", statut: "livreur_affecte"
      });
      await db.doc(`partenaires/${PARTNER_UID}/verrous/missionActive`).set({
        commandeId: ORDER_ID, statut: "active", createdAt: Timestamp.now()
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, updateDoc, deleteField } = require("firebase/firestore");
    await assertSucceeds(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: deleteField(), partenaireNom: deleteField(),
      partenaireType: deleteField(), dateAffectation: deleteField(),
      affectePar: deleteField(), statut: "en_attente"
    }));
    const { deleteDoc } = require("firebase/firestore");
    await assertSucceeds(deleteDoc(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive")));
  });

  it("refuse le refus d'une mission après récupération du colis", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        partenaireNom: "Partenaire test", partenaireType: "livreur_independant",
        service: "livraison", statut: "colis_recupere"
      });
      await db.doc(`partenaires/${PARTNER_UID}/verrous/missionActive`).set({
        commandeId: ORDER_ID, statut: "active", createdAt: Timestamp.now()
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, updateDoc, deleteField } = require("firebase/firestore");
    await assertFails(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: deleteField(), statut: "en_attente"
    }));
  });


  it("autorise la requête réelle de file d'attente des livreurs éligibles", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { collection, query, where, limit, getDocs } = require("firebase/firestore");
    const q = query(
      collection(db, "commandes_colis"),
      where("publicVersion", "==", true),
      where("statut", "==", "en_attente"),
      where("service", "in", ["livraison", "livraison_programmee"]),
      limit(30)
    );
    const result = await assertSucceeds(getDocs(q));
    if (result.empty) throw new Error("La commande disponible n'a pas été retournée.");
  });

  it("ne retourne pas les commandes de gare dans la file d'attente des livreurs", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "compagnie", statut: "en_attente", publicVersion: true,
        depart: "Gare test", destination: "Gare destination"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { collection, query, where, limit, getDocs } = require("firebase/firestore");
    const q = query(
      collection(db, "commandes_colis"),
      where("publicVersion", "==", true),
      where("statut", "==", "en_attente"),
      where("service", "in", ["livraison", "livraison_programmee"]),
      limit(30)
    );
    const result = await assertSucceeds(getDocs(q));
    if (!result.empty) throw new Error("Une commande de gare ne doit pas apparaître dans la file des livreurs.");
  });


  it("refuse un verrou qui ne correspond à aucune commande attribuée", async () => {
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, setDoc, serverTimestamp } = require("firebase/firestore");
    await assertFails(setDoc(
      doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive"),
      { commandeId: ORDER_ID, statut: "active", createdAt: serverTimestamp() }
    ));
  });

  it("autorise le verrou uniquement avec la commande attribuée dans la même opération", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
      await context.firestore().doc(`portefeuilles_livreurs/${PARTNER_UID}`).set({uid:PARTNER_UID,soldeDisponibleXof:5000,detteCommissionXof:0});
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, writeBatch, serverTimestamp } = require("firebase/firestore");
    const batch = writeBatch(db);
    batch.update(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: PARTNER_UID, partenaireNom: "Partenaire test",
      partenaireType: "livreur_independant", statut: "livreur_affecte",
      dateAffectation: serverTimestamp()
    });
    batch.set(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive"), {
      commandeId: ORDER_ID, statut: "active", createdAt: serverTimestamp()
    });
    await assertSucceeds(batch.commit());
  });


  it("interdit de supprimer le verrou tant que la commande reste attribuée", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        service: "livraison", statut: "livreur_affecte"
      });
      await db.doc(`partenaires/${PARTNER_UID}/verrous/missionActive`).set({
        commandeId: ORDER_ID, statut: "active", createdAt: Timestamp.now()
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, deleteDoc } = require("firebase/firestore");
    await assertFails(deleteDoc(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive")));
  });

  it("autorise l'arrivée et la lecture du tarif mais interdit la clôture financière directe depuis le navigateur", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        partenaireNom: "Partenaire test", partenaireType: "livreur_independant",
        service: "livraison", statut: "colis_recupere"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/tarification/prix`).set({
        distanceKm: 4.2, distanceMetres: 4200, tarifKm: 100,
        montantLivraison: 420, fraisService: 0, montantTotal: 420,
        devise: "FCFA", operation: "livraison", createdAt: Timestamp.now()
      });
      await db.doc(`partenaires/${PARTNER_UID}/verrous/missionActive`).set({
        commandeId: ORDER_ID, statut: "active", createdAt: Timestamp.now()
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, updateDoc, deleteDoc, serverTimestamp, getDoc } = require("firebase/firestore");
    await assertSucceeds(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      statut: "arrive_destination", dateArriveeDestination: serverTimestamp()
    }));
    await assertSucceeds(getDoc(doc(db, "commandes_colis", ORDER_ID, "tarification", "prix")));
    await assertFails(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      statut: "livre", dateLivraison: serverTimestamp()
    }));
    await assertFails(deleteDoc(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive")));
  });

  it("interdit au livreur de lire le tarif avant son arrivée à destination", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, partenaireId: PARTNER_UID,
        service: "livraison", statut: "colis_recupere"
      });
      await db.doc(`commandes_colis/${ORDER_ID}/tarification/prix`).set({
        distanceKm: 4.2, distanceMetres: 4200, tarifKm: 100,
        montantLivraison: 420, fraisService: 0, montantTotal: 420,
        devise: "FCFA", operation: "livraison", createdAt: Timestamp.now()
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertFails(getDoc(doc(db, "commandes_colis", ORDER_ID, "tarification", "prix")));
  });

  it("refuse l'attribution administrative à un partenaire hors ligne", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`partenaires/${PARTNER_UID}`).update({ enLigne: false });
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente", publicVersion: true,
        depart: "Yopougon", destination: "Adjamé"
      });
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const { doc, writeBatch, serverTimestamp } = require("firebase/firestore");
    const batch = writeBatch(db);
    batch.update(doc(db, "commandes_colis", ORDER_ID), {
      partenaireId: PARTNER_UID, partenaireNom: "Partenaire test",
      partenaireType: "livreur_independant", statut: "livreur_affecte",
      dateAffectation: serverTimestamp(), affectePar: ADMIN_UID
    });
    batch.set(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive"), {
      commandeId: ORDER_ID, statut: "active", createdAt: serverTimestamp()
    });
    await assertFails(batch.commit());
  });

  it("autorise un représentant de gare éligible à consulter les commandes de compagnie", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`partenaires/${PARTNER_UID}`).set(partnerFixture({
        type: "representant_gare",
        nomGare: "Gare test",
        posteOccupe: "Représentant"
      }));
      await db.doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "compagnie", statut: "en_attente", publicVersion: true,
        depart: "Gare test", destination: "Bouaké"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { collection, query, where, limit, getDocs } = require("firebase/firestore");
    const q = query(
      collection(db, "commandes_colis"),
      where("publicVersion", "==", true),
      where("statut", "==", "en_attente"),
      where("service", "==", "compagnie"),
      limit(30)
    );
    const result = await assertSucceeds(getDocs(q));
    if (result.empty) throw new Error("La commande de compagnie n'a pas été retournée au représentant de gare.");
  });

  it("autorise la création d'un don avec ses coordonnées privées dans le même lot", async () => {
    const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
    const {doc,writeBatch,serverTimestamp}=require("firebase/firestore");
    const batch=writeBatch(db),ref=doc(db,"dons_solidarite","don-test");
    batch.set(ref,{uid:CLIENT_UID,type:"don",titre:"Vêtements enfants",categorie:"Vêtements",commune:"Yopougon",description:"Lot de vêtements propres",statut:"en_attente",createdAt:serverTimestamp()});
    batch.set(doc(db,"dons_solidarite","don-test","informations_privees","contact"),{uid:CLIENT_UID,nom:"Client test",telephone:"0100000000",email:"client@example.test",createdAt:serverTimestamp()});
    await assertSucceeds(batch.commit());
  });

  it("refuse la lecture publique des coordonnées privées d'un dossier de solidarité", async () => {
    await testEnv.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      await db.doc("dons_solidarite/don-test").set({uid:CLIENT_UID,type:"don",titre:"Vêtements",categorie:"Vêtements",commune:"Yopougon",description:"Don test",statut:"approuve"});
      await db.doc("dons_solidarite/don-test/informations_privees/contact").set({uid:CLIENT_UID,nom:"Client test",telephone:"0100000000",email:"client@example.test"});
    });
    const publicDb=testEnv.unauthenticatedContext().firestore();
    const {doc,getDoc}=require("firebase/firestore");
    await assertFails(getDoc(doc(publicDb,"dons_solidarite","don-test","informations_privees","contact")));
    const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(adminDb,"dons_solidarite","don-test","informations_privees","contact")));
  });

  it("refuse la création d'une demande de solidarité sans fiche privée associée", async () => {
    const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
    const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
    await assertFails(setDoc(doc(db,"dons_solidarite","don-sans-contact"),{uid:CLIENT_UID,type:"besoin",titre:"Aide alimentaire",categorie:"Alimentation",commune:"Yopougon",description:"Besoin de nourriture",statut:"en_attente",createdAt:serverTimestamp()}));
  });

  it("autorise la lecture publique du répertoire de proximité mais pas son écriture", async () => {
    const publicDb=testEnv.unauthenticatedContext().firestore();
    const {doc,getDoc,setDoc,serverTimestamp}=require("firebase/firestore");
    await testEnv.withSecurityRulesDisabled(async context=>{await context.firestore().doc("services_proximite/service-test").set({nom:"Station test",categorie:"station",commune:"Yopougon"});});
    await assertSucceeds(getDoc(doc(publicDb,"services_proximite","service-test")));
    await assertFails(setDoc(doc(publicDb,"services_proximite","nouvelle-station"),{nom:"Station interdite",categorie:"station",commune:"Yopougon",createdAt:serverTimestamp()}));
  });


  describe("demandes foncières privées", () => {
    const dossierId = "terrain-test-001";
    const dossier = (uid, email) => ({
      uid, email, nom: "Demandeur test", telephone: "0102030405",
      typeDemande: "verification_parcelle",
      question: "Je souhaite vérifier cette parcelle.",
      refs: { localite: "Yopougon", lotissement: "Test", ilot: "A", lot: "12", idufci: "ABCDEFGHIJKLMNOPQRST" },
      statut: "reçue", reponseAdmin: "",
      createdAt: require("firebase/firestore").serverTimestamp(),
      updatedAt: require("firebase/firestore").serverTimestamp()
    });

    it("autorise un utilisateur connecté à déposer une demande conforme", async () => {
      const db = testEnv.authenticatedContext(CLIENT_UID, { email: "client@example.test" }).firestore();
      const { doc, setDoc } = require("firebase/firestore");
      await assertSucceeds(setDoc(doc(db, "demandes_foncieres_privees", "terrain-create-001"), dossier(CLIENT_UID, "client@example.test")));
    });

    it("interdit de déposer une demande au nom d'un autre utilisateur", async () => {
      const db = testEnv.authenticatedContext(CLIENT_UID, { email: "client@example.test" }).firestore();
      const { doc, setDoc } = require("firebase/firestore");
      await assertFails(setDoc(doc(db, "demandes_foncieres_privees", "terrain-create-002"), dossier(OTHER_UID, "client@example.test")));
    });

    it("autorise le demandeur à lire son dossier mais pas celui d'un tiers", async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await context.firestore().doc("demandes_foncieres_privees/" + dossierId).set({
          uid: CLIENT_UID, email: "client@example.test", nom: "Demandeur test",
          telephone: "0102030405", typeDemande: "verification_parcelle",
          question: "Vérification demandée", refs: { localite: "Yopougon" },
          statut: "reçue", reponseAdmin: ""
        });
      });
      const own = testEnv.authenticatedContext(CLIENT_UID).firestore();
      const other = testEnv.authenticatedContext(OTHER_UID).firestore();
      const { doc, getDoc } = require("firebase/firestore");
      await assertSucceeds(getDoc(doc(own, "demandes_foncieres_privees", dossierId)));
      await assertFails(getDoc(doc(other, "demandes_foncieres_privees", dossierId)));
    });

    it("réserve la modification du rapport à l'administrateur", async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        await context.firestore().doc("demandes_foncieres_privees/" + dossierId).set({
          uid: CLIENT_UID, email: "client@example.test", nom: "Demandeur test",
          telephone: "0102030405", typeDemande: "verification_parcelle",
          question: "Vérification demandée", refs: { localite: "Yopougon" },
          statut: "reçue", reponseAdmin: ""
        });
      });
      const client = testEnv.authenticatedContext(CLIENT_UID).firestore();
      const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
      const { doc, updateDoc } = require("firebase/firestore");
      await assertFails(updateDoc(doc(client, "demandes_foncieres_privees", dossierId), {
        rapport: { resume: "Rapport falsifié" }
      }));
      await assertSucceeds(updateDoc(doc(admin, "demandes_foncieres_privees", dossierId), {
        rapport: { resume: "Rapport de vérification test" }
      }));
    });
  });


  describe("annuaire professionnel retiré", () => {
    it("refuse les nouvelles inscriptions et réserve les anciennes fiches à l’administration pour suppression", async () => {
      const clientDb=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,getDoc,deleteDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const ancienneFiche={
        uid:CLIENT_UID,type:"annuaire",titre:"Ancienne fiche",categorie:"Plomberie",
        commune:"Yopougon",telephone:"0700000000",description:"Fiche historique",
        email:"client@example.test",statut:"approuve",createdAt:serverTimestamp()
      };
      await assertFails(setDoc(doc(clientDb,"demandes_nouveaux_services","annuaire-nouveau-refuse"),ancienneFiche));
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("demandes_nouveaux_services/annuaire-historique-a-purger").set(ancienneFiche);
      });
      const publicDb=testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(publicDb,"demandes_nouveaux_services","annuaire-historique-a-purger")));
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(getDoc(doc(adminDb,"demandes_nouveaux_services","annuaire-historique-a-purger")));
      await assertFails(updateDoc(doc(adminDb,"demandes_nouveaux_services","annuaire-historique-a-purger"),{statut:"refuse"}));
      await assertSucceeds(deleteDoc(doc(adminDb,"demandes_nouveaux_services","annuaire-historique-a-purger")));
    });
  });

  describe("compagnies de voyage — gares annexes et avis", () => {
    const COMPANY_ID = "company-test-001";
    const STATION_ID = "station-test-001";
    const companySeed = async (status = "Actif") => testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc("compagnies/" + COMPANY_ID).set({
        uid: PARTNER_UID, nom: "Compagnie test", statutAbonnement: status
      });
    });
    const stationBatch = db => {
      const {doc,writeBatch,serverTimestamp}=require("firebase/firestore");
      const batch=writeBatch(db),ref=doc(db,"gares_compagnies",STATION_ID);
      batch.set(ref,{
        compagnieId:COMPANY_ID,compagnieUid:PARTNER_UID,type:"annexe",
        nom:"Gare annexe test",photo:"data:image/jpeg;base64,abcdefghijklmnopqrstuvwxyz0123456789",
        localisation:"Yopougon, Abidjan, près du marché",
        telephonePublic:"0700000000",telephoneServiceCourrier:"0500000000",
        destinations:[{ville:"Bouaké",prix:5000,heures:["06:00","08:00"]}],
        statut:"en_attente",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      batch.set(doc(ref,"informations_privees","representant"),{
        uid:PARTNER_UID,telephoneResponsable:"0100000000",createdAt:serverTimestamp()
      });
      return batch;
    };

    it("protège le numéro privé du responsable de la gare principale", async () => {
      await companySeed();
      const db=testEnv.authenticatedContext(PARTNER_UID).firestore();
      const {doc,setDoc,serverTimestamp,getDoc}=require("firebase/firestore");
      const ref=doc(db,"compagnies",COMPANY_ID,"informations_privees","gare_principale");
      await assertSucceeds(setDoc(ref,{uid:PARTNER_UID,telephoneResponsable:"0100000000",numeroIdentite:"ID-GARE-12345",createdAt:serverTimestamp()}));
      await assertFails(getDoc(ref));
      await assertFails(getDoc(doc(testEnv.authenticatedContext(OTHER_UID).firestore(),"compagnies",COMPANY_ID,"informations_privees","gare_principale")));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),"compagnies",COMPANY_ID,"informations_privees","gare_principale")));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(),"compagnies",COMPANY_ID,"informations_privees","gare_principale")));
    });

    it("autorise la compagnie propriétaire à soumettre une gare et son numéro privé atomiquement", async () => {
      await companySeed();
      const db=testEnv.authenticatedContext(PARTNER_UID).firestore();
      await assertSucceeds(stationBatch(db).commit());
    });

    it("réserve le numéro privé du représentant à l'administrateur", async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        const db=context.firestore();
        await db.doc("compagnies/"+COMPANY_ID).set({uid:PARTNER_UID,nom:"Compagnie test",statutAbonnement:"Actif"});
        await db.doc("gares_compagnies/"+STATION_ID).set({compagnieId:COMPANY_ID,compagnieUid:PARTNER_UID,statut:"en_attente"});
        await db.doc("gares_compagnies/"+STATION_ID+"/informations_privees/representant").set({uid:PARTNER_UID,telephoneResponsable:"0100000000"});
      });
      const {doc,getDoc}=require("firebase/firestore"),path=["gares_compagnies",STATION_ID,"informations_privees","representant"];
      await assertFails(getDoc(doc(testEnv.authenticatedContext(PARTNER_UID).firestore(),...path)));
      await assertFails(getDoc(doc(testEnv.authenticatedContext(OTHER_UID).firestore(),...path)));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),...path)));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(),...path)));
    });

    it("refuse à un autre utilisateur de créer une gare au nom d'une compagnie", async () => {
      await companySeed();
      const db=testEnv.authenticatedContext(OTHER_UID).firestore();
      const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      await assertFails(setDoc(doc(db,"gares_compagnies",STATION_ID),{
        compagnieId:COMPANY_ID,compagnieUid:PARTNER_UID,type:"annexe",nom:"Gare usurpée",
        photo:"data:image/jpeg;base64,abcdefghijklmnopqrstuvwxyz0123456789",
        localisation:"Yopougon, Abidjan",telephonePublic:"0700000000",
        telephoneServiceCourrier:"0500000000",destinations:[{ville:"Bouaké",prix:5000,heures:["06:00"]}],
        statut:"en_attente",createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      }));
    });

    it("autorise le dépôt d'un avis en attente et réserve sa publication à l'administrateur", async () => {
      await companySeed();
      const db=testEnv.authenticatedContext(CLIENT_UID).firestore();
      const {doc,setDoc,updateDoc,serverTimestamp,getDoc}=require("firebase/firestore");
      const ref=doc(db,"avis_compagnies","avis-test-001");
      await assertSucceeds(setDoc(ref,{
        compagnieId:COMPANY_ID,compagnieUid:PARTNER_UID,uid:CLIENT_UID,
        nomVoyageur:"Voyageur test",note:5,commentaire:"Service ponctuel et accueil agréable.",
        statut:"en_attente",createdAt:serverTimestamp()
      }));
      await assertFails(updateDoc(ref,{statut:"publie"}));
      const admin=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(admin,"avis_compagnies","avis-test-001"),{statut:"publie"}));
      await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(),"avis_compagnies","avis-test-001")));
    });

    it("refuse la publication directe d'un avis et les avis sur une compagnie inactive", async () => {
      await companySeed("En attente");
      const db=testEnv.authenticatedContext(CLIENT_UID).firestore();
      const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      const base={compagnieId:COMPANY_ID,compagnieUid:PARTNER_UID,uid:CLIENT_UID,nomVoyageur:"Voyageur test",note:5,commentaire:"Avis de test avec commentaire valide."};
      await assertFails(setDoc(doc(db,"avis_compagnies","avis-direct-publish"),{...base,statut:"publie",createdAt:serverTimestamp()}));
      await assertFails(setDoc(doc(db,"avis_compagnies","avis-inactive"),{...base,statut:"en_attente",createdAt:serverTimestamp()}));
    });
  });

  describe("Déclarations d’enfants — confidentialité Firestore", function () {
    it("autorise un utilisateur connecté à créer atomiquement un dossier en attente et ses données privées", async () => {
      const db = testEnv.authenticatedContext(CLIENT_UID).firestore();
      const { doc, writeBatch, serverTimestamp } = require("firebase/firestore");
      const dossier = doc(db, "declarations_enfants", "enfant-test-perdu");
      const batch = writeBatch(db);
      batch.set(dossier, { type:"perdu", nom:"Enfant test", age:"8", photoUrl:"", telephonePublic:"", presencePublic:"", statut:"en_attente", createdAt:serverTimestamp() });
      batch.set(doc(dossier,"informations_privees","contact"), { uid:CLIENT_UID, photoPath:"declarations_enfants_privees/client-test-001/enfant-test-perdu/photo.jpg", telephone:"0100000000", adresseExacte:"Adresse confidentielle", description:"Détail privé", createdAt:serverTimestamp() });
      await assertSucceeds(batch.commit());
    });
    it("refuse un dossier sans fiche privée atomique ou avec des champs publics supplémentaires", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID).firestore();
      const {doc,setDoc,serverTimestamp,writeBatch}=require("firebase/firestore");
      await assertFails(setDoc(doc(db,"declarations_enfants","sans-prive"),{type:"perdu",nom:"Test",age:"7",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente",createdAt:serverTimestamp()}));
      const batch=writeBatch(db), dossier=doc(db,"declarations_enfants","champ-inattendu");
      batch.set(dossier,{type:"perdu",nom:"Test",age:"7",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente",createdAt:serverTimestamp(),adresseExacte:"Ne doit pas être public"});
      batch.set(doc(dossier,"informations_privees","contact"),{uid:CLIENT_UID});
      await assertFails(batch.commit());
    });
    it("réserve la lecture du dossier en attente et des données privées au propriétaire et à l’administrateur", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        const db=context.firestore();
        await db.doc("declarations_enfants/dossier-prive").set({type:"retrouve",nom:"Enfant test",age:"",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente"});
        await db.doc("declarations_enfants/dossier-prive/informations_privees/contact").set({uid:CLIENT_UID,telephoneDeclarant:"0700000000",commissariat:"Commissariat privé"});
      });
      const {doc,getDoc}=require("firebase/firestore"), path=["declarations_enfants","dossier-prive"];
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),...path)));
      await assertFails(getDoc(doc(testEnv.authenticatedContext(OTHER_UID).firestore(),...path)));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(CLIENT_UID).firestore(),...path)));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(CLIENT_UID).firestore(),...path,"informations_privees","contact")));
      await assertFails(getDoc(doc(testEnv.authenticatedContext(OTHER_UID).firestore(),...path,"informations_privees","contact")));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),...path,"informations_privees","contact")));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(),...path)));
      await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(),...path,"informations_privees","contact")));
    });
    it("permet la lecture publique uniquement après approbation et interdit l’approbation par un utilisateur", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("declarations_enfants/dossier-approuve").set({type:"retrouve",nom:"Enfant retrouvé",age:"",photoUrl:"https://example.test/photo.jpg",telephonePublic:"",presencePublic:"avec_autorites",statut:"approuve"});
      });
      const {doc,getDoc,updateDoc,deleteDoc}=require("firebase/firestore");
      await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(),"declarations_enfants","dossier-approuve")));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),"declarations_enfants","dossier-approuve","informations_privees","contact")));
      await assertFails(getDoc(doc(testEnv.authenticatedContext(CLIENT_UID).firestore(),"declarations_enfants","dossier-approuve","informations_privees","contact")));
      await assertFails(updateDoc(doc(testEnv.authenticatedContext(CLIENT_UID).firestore(),"declarations_enfants","dossier-approuve"),{statut:"approuve",photoUrl:"https://example.test/fake.jpg",telephonePublic:"0100000000"}));
      await assertFails(deleteDoc(doc(testEnv.authenticatedContext(CLIENT_UID).firestore(),"declarations_enfants","dossier-approuve")));
    });
    it("autorise la première publication admin puis rend la photo immuable et protège la fiche", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("declarations_enfants/dossier-photo-immuable").set({type:"perdu",nom:"Enfant",age:"6",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente"});
      });
      const {doc,updateDoc,deleteDoc}=require("firebase/firestore");
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      const ref=doc(adminDb,"declarations_enfants","dossier-photo-immuable");
      const photoUrl="https://example.test/photo-originale.jpg";
      await assertSucceeds(updateDoc(ref,{statut:"approuve",photoUrl,telephonePublic:"0100000000"}));
      await assertFails(updateDoc(ref,{photoUrl:"https://example.test/photo-remplacee.jpg"}));
      await assertFails(updateDoc(ref,{photoUrl:""}));
      await assertFails(deleteDoc(ref));
      await assertSucceeds(updateDoc(ref,{nom:"Nom corrigé"}));
    });
    it("permet à l’administrateur de modérer le dossier", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("declarations_enfants/dossier-a-moderer").set({type:"perdu",nom:"Enfant",age:"6",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente"});
      });
      const {doc,updateDoc}=require("firebase/firestore");
      await assertSucceeds(updateDoc(doc(testEnv.authenticatedContext(ADMIN_UID).firestore(),"declarations_enfants","dossier-a-moderer"),{statut:"approuve",photoUrl:"https://example.test/photo.jpg",telephonePublic:"0100000000"}));
    });
  });


  describe("Paiements manuels — demandes en attente et validation administrative", () => {
    it("accepte une demande publicitaire en attente et interdit au client de confirmer son paiement", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID).firestore();
      const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const ref=doc(db,"demandes_publicites","pub-paiement-manuel");
      await assertSucceeds(setDoc(ref,{
        nom:"Annonceur test",telephone:"0700000000",activite:"Commerce",
        description:"Campagne publicitaire de test",forfait:"Découverte",
        forfaitTexte:"3 jours",dureeJours:3,montantFCFA:2000,
        statut:"en_attente",createdAt:serverTimestamp()
      }));
      await assertFails(updateDoc(ref,{statut:"paiement_confirme"}));
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(adminDb,"demandes_publicites","pub-paiement-manuel"),{
        statut:"paiement_confirme"
      }));
    });

    it("conserve les anciennes demandes manuelles automobiliste en lecture seule et interdit leur approbation", async () => {
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      const {doc,updateDoc}=require("firebase/firestore");
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("demandes_abonnement_automobiliste/auto-paiement-manuel").set({
          uid:CLIENT_UID,email:"client@example.test",operateur:"Wave",
          referencePaiement:"REF-TEST-1234",nomPayeur:"Client test",
          montantFCFA:1000,dureeMois:12,statut:"en_attente",createdAt:Timestamp.now()
        });
      });
      const legacyRef=doc(adminDb,"demandes_abonnement_automobiliste","auto-paiement-manuel");
      await assertFails(updateDoc(legacyRef,{statut:"approuve"}));
      await assertSucceeds(updateDoc(legacyRef,{statut:"refuse"}));
    });

    it("accepte une recharge Gbairai en attente de vérification", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID).firestore();
      const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      await assertSucceeds(setDoc(doc(db,"gbairai_recharges","recharge-paiement-manuel"),{
        uid:CLIENT_UID,pseudonyme:"Test",operateur:"Wave",
        referencePaiement:"REF-TEST-1234",montantFCFA:100,messages:15,
        statut:"en_attente",createdAt:serverTimestamp()
      }));
    });

    it("refuse les anciennes demandes manuelles de renouvellement Logement", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const base={
        uid:CLIENT_UID,nom:"Client test",email:"client@example.test",telephone:"0700000000",
        formule:"mensuel",montant:3000,reference:"REF-TEST-1234",
        statut:"a_verifier",createdAt:serverTimestamp()
      };
      await assertFails(setDoc(doc(db,"demandes_abonnement_logement","logement-mtn-refuse"),{...base,operateur:"MTN MoMo"}));
      await assertFails(setDoc(doc(db,"demandes_abonnement_logement","logement-moov-refuse"),{...base,operateur:"Moov Money"}));
      await assertFails(setDoc(doc(db,"demandes_abonnement_logement","logement-wave-refuse"),{...base,operateur:"Wave"}));
      await assertFails(setDoc(doc(db,"demandes_abonnement_logement","logement-orange-refuse"),{...base,operateur:"Orange Money"}));
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("partenaires_logement/"+CLIENT_UID).set({
          uid:CLIENT_UID,statutCompte:"actif",statutAbonnement:"actif",
          debutAbonnement:Timestamp.fromMillis(Date.now()-40*86400000),
          finAbonnement:Timestamp.fromMillis(Date.now()-10*86400000)
        });
        await context.firestore().doc("demandes_abonnement_logement/ancienne-demande").set({
          uid:CLIENT_UID,statut:"a_verifier",formule:"mensuel",montant:3000
        });
      });
      await assertFails(updateDoc(doc(adminDb,"partenaires_logement",CLIENT_UID),{
        statutAbonnement:"actif",debutAbonnement:serverTimestamp(),
        finAbonnement:Timestamp.fromMillis(Date.now()+30*86400000)
      }));
      await assertFails(updateDoc(doc(adminDb,"demandes_abonnement_logement","ancienne-demande"),{
        statut:"confirme",confirmedAt:serverTimestamp(),confirmedBy:ADMIN_UID
      }));
      await assertSucceeds(updateDoc(doc(adminDb,"demandes_abonnement_logement","ancienne-demande"),{
        statut:"refuse",reviewedAt:serverTimestamp(),reviewedBy:ADMIN_UID
      }));
    });

    it("refuse la création d’une demande de renouvellement boutique manuelle", async () => {
      const SHOP_ID="shop-renewal-paiement-bloque";
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("demandes_nouveaux_services/"+SHOP_ID).set({
          uid:CLIENT_UID,type:"commerce",modePartenaire:true,statut:"approuve"
        });
      });
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      await assertFails(setDoc(doc(db,"demandes_renouvellement_boutiques","renewal-paiement-manuel"),{
        boutiqueId:SHOP_ID,uid:CLIENT_UID,email:"client@example.test",
        operateur:"Wave",referencePaiement:"REF-TEST-1234",nomPayeur:"Client test",
        montantFCFA:7000,dureeJours:30,statut:"en_attente",createdAt:serverTimestamp()
      }));
    });

    it("accepte une demande boutique Jèko en attente", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      await assertSucceeds(setDoc(doc(db,"demandes_nouveaux_services","boutique-paiement-manuel"),{
        uid:CLIENT_UID,type:"commerce",titre:"Boutique test",categorie:"Boutique",
        commune:"Yopougon",telephone:"0700000000",description:"Boutique de test",
        email:"client@example.test",numeroIdentite:"ID-BOUTIQUE-12345",
        adresseBoutique:"Yopougon, Abidjan",
        planAbonnementId:"boutiques_3mois",abonnementStatut:"a_payer",
        montantAbonnement:7000,dureeAbonnementJours:90,paiementStatut:"a_payer",
        statut:"en_attente",createdAt:serverTimestamp()
      }));
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(adminDb,"demandes_nouveaux_services","boutique-paiement-manuel"),{
        statut:"approuve",traiteLe:serverTimestamp()
      }));
      await assertFails(updateDoc(doc(adminDb,"demandes_nouveaux_services","boutique-paiement-manuel"),{
        abonnementStatut:"actif",paiementStatut:"confirme",
        abonnementDebut:serverTimestamp(),
        abonnementFin:Timestamp.fromMillis(Date.now()+90*24*60*60*1000),
        dernierPaiementFCFA:7000,dernierPaiementConfirmeLe:serverTimestamp()
      }));
    });
  });


  describe("Contrôles complémentaires — paiements et parcours gratuits", () => {
    it("accepte le dépôt d’un dossier compagnie sans paiement manuel et réserve l’activation à Jèko", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,updateDoc,writeBatch,serverTimestamp}=require("firebase/firestore");
      const compagnieRef=doc(db,"compagnies","compagnie-paiement-manuel");
      const batch=writeBatch(db);
      batch.set(compagnieRef,{
        uid:CLIENT_UID,nom:"Compagnie test",agence:"Agence principale",
        localisation:"Yopougon, Abidjan",telephone:"0700000000",email:"client@example.test",
        destinations:[{ville:"Bouaké"}],
        photoGarePrincipale:"data:image/jpeg;base64,abcdefghijklmnopqrstuvwxyz0123456789",
        telephoneGarePrincipale:"0700000001",telephoneServiceCourrier:"0700000002",
        formule:"Essentielle",periodicite:"Mensuel",montant:5000,dureeMois:1,
        statutAbonnement:"Dossier à vérifier",dateCreation:serverTimestamp(),
        dateDebut:null,dateExpiration:null
      });
      batch.set(doc(compagnieRef,"informations_privees","gare_principale"),{
        uid:CLIENT_UID,telephoneResponsable:"0700000003",
        numeroIdentite:"ID-COMPAGNIE-12345",createdAt:serverTimestamp()
      });
      await assertSucceeds(batch.commit());
      await assertFails(updateDoc(compagnieRef,{
        statutAbonnement:"Actif",dateDebut:serverTimestamp(),dateExpiration:serverTimestamp()
      }));
      const sansIdentite=doc(db,"compagnies","compagnie-sans-identite"),badBatch=writeBatch(db);
      badBatch.set(sansIdentite,{
        uid:CLIENT_UID,nom:"Compagnie test",agence:"Agence principale",
        localisation:"Yopougon, Abidjan",telephone:"0700000000",email:"client@example.test",
        destinations:[{ville:"Bouaké"}],
        photoGarePrincipale:"data:image/jpeg;base64,abcdefghijklmnopqrstuvwxyz0123456789",
        telephoneGarePrincipale:"0700000001",telephoneServiceCourrier:"0700000002",
        formule:"Essentielle",periodicite:"Mensuel",montant:5000,dureeMois:1,
        statutAbonnement:"Dossier à vérifier",dateCreation:serverTimestamp(),
        dateDebut:null,dateExpiration:null
      });
      badBatch.set(doc(sansIdentite,"informations_privees","gare_principale"),{
        uid:CLIENT_UID,telephoneResponsable:"0700000003",createdAt:serverTimestamp()
      });
      await assertFails(badBatch.commit());
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(adminDb,"compagnies","compagnie-paiement-manuel"),{
        statutAbonnement:"À payer",dossierApprouveLe:serverTimestamp(),dossierApprouvePar:ADMIN_UID
      }));
    });

    it("conserve l'inscription partenaire gratuite d'une boutique pour 30 jours", async () => {
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      await assertFails(setDoc(doc(db,"demandes_nouveaux_services","boutique-partenaire-sans-identite"),{
        uid:CLIENT_UID,type:"commerce",titre:"Boutique partenaire test",
        categorie:"Boutique",commune:"Yopougon",telephone:"0700000000",
        description:"Présentation de la boutique partenaire de test.",
        email:"client@example.test",modePartenaire:true,
        statut:"en_attente",createdAt:serverTimestamp()
      }));
      await assertSucceeds(setDoc(doc(db,"demandes_nouveaux_services","boutique-partenaire-essai-gratuit"),{
        uid:CLIENT_UID,type:"commerce",titre:"Boutique partenaire test",
        categorie:"Boutique",commune:"Yopougon",telephone:"0700000000",
        description:"Présentation de la boutique partenaire de test.",
        email:"client@example.test",numeroIdentite:"ID-BOUTIQUE-12345",modePartenaire:true,
        statut:"en_attente",createdAt:serverTimestamp()
      }));
    });
  });


  it("refuse les renouvellements manuels du partenaire expiré et interdit son auto-activation", async () => {
    const expired = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    await testEnv.withSecurityRulesDisabled(async context => {
      const db=context.firestore();
      await db.doc("partenaires/"+PARTNER_UID).set(partnerFixture({
        statutAbonnementPartenaire:"Expire",
        dateExpirationAbonnement:expired,
        enLigne:false
      }));
      await db.doc("configuration_abonnements/globale").set({
        services:{
          partenaires_colis_1mois:{actif:true,prix:1000,duree:1,unite:"mois"}
        }
      });
    });
    const db=testEnv.authenticatedContext(PARTNER_UID,{email:"partner@example.test"}).firestore();
    const {doc,updateDoc,serverTimestamp}=require("firebase/firestore");
    await assertFails(updateDoc(doc(db,"partenaires",PARTNER_UID),{
      renouvellementStatut:"a_verifier",
      renouvellementFormule:"partenaires_colis_1mois",
      renouvellementMois:1,
      renouvellementMontant:1000,
      renouvellementOperateur:"Wave",
      renouvellementReference:"REF-TEST-1234",
      renouvellementDemandeLe:serverTimestamp()
    }));
    await assertFails(updateDoc(doc(db,"partenaires",PARTNER_UID),{
      statutAbonnementPartenaire:"Actif",
      dateExpirationAbonnement:serverTimestamp(),
      renouvellementStatut:"confirme"
    }));
  });


  describe("Trajet partagé — profils et réservations", () => {
    const DRIVER_UID="driver-ride-test", TRIP_ID="trip-ride-test", BOOKING_ID=TRIP_ID+"_"+CLIENT_UID;
    const profileData=(uid,overrides={})=>({uid,nom:"Conducteur test",telephone:"0700000000",categorie:"particulier",statutVerification:"en_attente",documents:{permis:true,carteGrise:true,assurance:true},createdAt:Timestamp.now(),updatedAt:Timestamp.now(),...overrides});
    const tripData=(overrides={})=>({conducteurUid:DRIVER_UID,conducteurNom:"Conducteur test",depart:"Yopougon",destination:"Plateau",dateTrajet:futureDate(24),heureDepart:"07:00",pointRencontre:"Carrefour test",placesDisponibles:1,tarifParPlace:2000,statut:"publie",createdAt:Timestamp.now(),updatedAt:Timestamp.now(),...overrides});
    it("autorise le dépôt d’un dossier complet mais interdit au conducteur de s’approuver lui-même",async()=>{
      const db=testEnv.authenticatedContext(DRIVER_UID).firestore();const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const ref=doc(db,"trajet_partage_profils",DRIVER_UID);
      await assertSucceeds(setDoc(ref,{...profileData(DRIVER_UID),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(ref,{statutVerification:"approuve",updatedAt:serverTimestamp()}));
      const adminDb=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(adminDb,"trajet_partage_profils",DRIVER_UID),{statutVerification:"approuve",updatedAt:serverTimestamp()}));
    });
    it("refuse un profil conducteur sans les trois justificatifs",async()=>{
      const db=testEnv.authenticatedContext(DRIVER_UID).firestore();const {doc,setDoc,serverTimestamp}=require("firebase/firestore");
      await assertFails(setDoc(doc(db,"trajet_partage_profils",DRIVER_UID),{...profileData(DRIVER_UID,{documents:{permis:true,carteGrise:false,assurance:false}}),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
    });
    it("exige une confirmation atomique avec décrément de place pour accepter une réservation",async()=>{
      await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await db.doc("trajet_partage_profils/"+DRIVER_UID).set(profileData(DRIVER_UID,{statutVerification:"approuve"}));await db.doc("trajets_partages/"+TRIP_ID).set(tripData());await db.doc("reservations_trajets/"+BOOKING_ID).set({trajetId:TRIP_ID,conducteurUid:DRIVER_UID,passagerUid:CLIENT_UID,passagerNom:"Passager test",dateTrajet:futureDate(24),heureDepart:"07:00",depart:"Yopougon",destination:"Plateau",pointRencontre:"Carrefour test",tarifParPlace:2000,places:1,statut:"en_attente",createdAt:Timestamp.now(),updatedAt:Timestamp.now()})});
      const driverDb=testEnv.authenticatedContext(DRIVER_UID).firestore();const {doc,writeBatch,serverTimestamp,updateDoc}=require("firebase/firestore");
      await assertFails(updateDoc(doc(driverDb,"reservations_trajets",BOOKING_ID),{statut:"acceptee",updatedAt:serverTimestamp()}));
      const batch=writeBatch(driverDb);batch.update(doc(driverDb,"trajets_partages",TRIP_ID),{placesDisponibles:0,statut:"complet",updatedAt:serverTimestamp()});batch.update(doc(driverDb,"reservations_trajets",BOOKING_ID),{statut:"acceptee",updatedAt:serverTimestamp()});await assertSucceeds(batch.commit());
    });
  });


  describe("Pharmacies professionnelles et demandes attribuées", () => {
    const PHARMACY_UID = "pharmacy-test-001";
    const REQUEST_ID = "pharmacy-request-test-001";
    it("autorise une candidature pharmacie en attente, mais interdit l’auto-approbation", async () => {
      const db=testEnv.authenticatedContext(PHARMACY_UID,{email:"pharmacy@example.test"}).firestore();
      const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const ref=doc(db,"pharmacies_professionnelles",PHARMACY_UID);
      await assertSucceeds(setDoc(ref,{uid:PHARMACY_UID,nom:"Pharmacie test",responsable:"Pharmacien test",telephone:"0700000000",email:"pharmacy@example.test",commune:"Yopougon",adresse:"Yopougon, Abidjan",referenceAutorisation:"AGREMENT-TEST",statut:"en_attente",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(ref,{statut:"approuve",updatedAt:serverTimestamp()}));
    });
    it("limite les demandes aux clients, à l’administrateur et à la pharmacie explicitement assignée", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        const db=context.firestore();
        await db.doc("pharmacies_professionnelles/"+PHARMACY_UID).set({uid:PHARMACY_UID,nom:"Pharmacie test",statut:"approuve"});
        await db.doc("demandes_pharmacie/"+REQUEST_ID).set({uid:CLIENT_UID,nom:"Client test",telephone:"0700000000",commune:"Yopougon",adresse:"Yopougon, Abidjan",produits:"Médicament test",documentPath:"",statut:"a_traiter",createdAt:Timestamp.now(),updatedAt:Timestamp.now(),pharmacieAssigneeUid:PHARMACY_UID});
      });
      const {doc,getDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const pharmacyDb=testEnv.authenticatedContext(PHARMACY_UID).firestore();
      await assertSucceeds(getDoc(doc(pharmacyDb,"demandes_pharmacie",REQUEST_ID)));
      await assertSucceeds(updateDoc(doc(pharmacyDb,"demandes_pharmacie",REQUEST_ID),{statut:"pharmacie_confirmee",prixPropose:2500,reponsePharmacie:"Disponible",updatedAt:serverTimestamp()}));
      await assertFails(updateDoc(doc(pharmacyDb,"demandes_pharmacie",REQUEST_ID),{uid:PHARMACY_UID,updatedAt:serverTimestamp()}));
      const otherDb=testEnv.authenticatedContext(OTHER_UID).firestore();
      await assertFails(getDoc(doc(otherDb,"demandes_pharmacie",REQUEST_ID)));
      const clientDb=testEnv.authenticatedContext(CLIENT_UID).firestore();
      await assertSucceeds(getDoc(doc(clientDb,"demandes_pharmacie",REQUEST_ID)));
    });
    it("interdit à une pharmacie non approuvée d’accéder aux demandes attribuées", async () => {
      await testEnv.withSecurityRulesDisabled(async context=>{
        const db=context.firestore();
        await db.doc("pharmacies_professionnelles/pending-pharmacy").set({uid:"pending-pharmacy",statut:"en_attente"});
        await db.doc("demandes_pharmacie/pending-request").set({uid:CLIENT_UID,nom:"Client",telephone:"0700000000",commune:"Cocody",adresse:"Cocody",produits:"Test",documentPath:"",statut:"a_traiter",createdAt:Timestamp.now(),updatedAt:Timestamp.now(),pharmacieAssigneeUid:"pending-pharmacy"});
      });
      const db=testEnv.authenticatedContext("pending-pharmacy").firestore();
      const {doc,getDoc}=require("firebase/firestore");
      await assertFails(getDoc(doc(db,"demandes_pharmacie","pending-request")));
    });
  });

  describe("Inscriptions partenaires — demandes en attente et identité", () => {
    const SERVICE_ID = "partner-application-test-001";
    const application = (overrides = {}) => ({
      uid: CLIENT_UID,
      type: "depannage_domicile",
      titre: "Électricien test",
      categorie: "Électricien",
      commune: "Yopougon",
      quartier: "Niangon",
      telephone: "0700000000",
      description: "Interventions électriques à domicile et dépannage.",
      infosProfessionnelles: "Dépannage électrique, installation et entretien.",
      email: "client@example.test",
      numeroIdentite: "ID-PARTENAIRE-12345",
      photoUrl: "data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PUA==",
      modePartenaire: true,
      statut: "en_attente",
      createdAt: require("firebase/firestore").serverTimestamp(),
      ...overrides
    });

    it("autorise le dépôt et la consultation de sa demande en attente, mais pas sa lecture par un tiers", async () => {
      const {doc,setDoc,getDoc}=require("firebase/firestore");
      const owner=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const ref=doc(owner,"demandes_nouveaux_services",SERVICE_ID);
      await assertSucceeds(setDoc(ref,application()));
      await assertSucceeds(getDoc(ref));
      const other=testEnv.authenticatedContext(OTHER_UID).firestore();
      await assertFails(getDoc(doc(other,"demandes_nouveaux_services",SERVICE_ID)));
      await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(),"demandes_nouveaux_services",SERVICE_ID)));
    });

    it("refuse l'auto-approbation, la modification et la suppression par le candidat", async () => {
      const {doc,setDoc,updateDoc,deleteDoc,serverTimestamp}=require("firebase/firestore");
      const owner=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      const ref=doc(owner,"demandes_nouveaux_services",SERVICE_ID);
      await assertFails(setDoc(ref,application({statut:"approuve"})));
      await assertSucceeds(setDoc(ref,application()));
      await assertFails(updateDoc(ref,{statut:"approuve",traiteLe:serverTimestamp()}));
      await assertFails(updateDoc(ref,{telephone:"0100000000"}));
      await assertFails(deleteDoc(ref));
    });

    it("exige une photo et les informations professionnelles pour le dépannage à domicile", async () => {
      const {doc,setDoc}=require("firebase/firestore");
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      await assertFails(setDoc(doc(db,"demandes_nouveaux_services","missing-id"),application({numeroIdentite:""})));
      await assertFails(setDoc(doc(db,"demandes_nouveaux_services","missing-photo"),application({photoUrl:""})));
      await assertFails(setDoc(doc(db,"demandes_nouveaux_services","missing-details"),application({infosProfessionnelles:""})));
    });

    it("refuse une adresse e-mail qui ne correspond pas au compte authentifié", async () => {
      const {doc,setDoc}=require("firebase/firestore");
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      await assertFails(setDoc(doc(db,"demandes_nouveaux_services","wrong-email"),application({email:"intrus@example.test"})));
    });

    it("accepte un compte authentifié par téléphone avec une adresse e-mail de contact valide", async () => {
      const {doc,setDoc}=require("firebase/firestore");
      const db=testEnv.authenticatedContext(CLIENT_UID,{phone_number:"+2250700000000"}).firestore();
      await assertSucceeds(setDoc(doc(db,"demandes_nouveaux_services","phone-auth-application"),application()));
    });

    it("réserve la décision d'approbation à l'administrateur", async () => {
      const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
      const owner=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      await assertSucceeds(setDoc(doc(owner,"demandes_nouveaux_services",SERVICE_ID),application()));
      const admin=testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(updateDoc(doc(admin,"demandes_nouveaux_services",SERVICE_ID),{statut:"approuve",traiteLe:serverTimestamp()}));
    });
  });

  describe("Profils livreur et représentant de gare — photo obligatoire", () => {
    const validProfile = (uid, overrides = {}) => ({
      uid,type:"livreur_independant",nom:"Livreur test",telephone:"0700000000",commune:"Yopougon",
      email:"client@example.test",dateNaissance:"1990-01-01",lieuNaissance:"Abidjan",
      numeroIdentite:"TEST-ID",quartiers:["Yopougon"],numeroPermis:"PERMIS-TEST",
      photoProfil:"data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PUA==",
      statut:"en_attente",createdAt:require("firebase/firestore").serverTimestamp(),...overrides
    });
    it("refuse un profil sans photo et interdit toute auto-approbation", async () => {
      const {doc,setDoc,updateDoc}=require("firebase/firestore");
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      await assertFails(setDoc(doc(db,"partenaires",CLIENT_UID),validProfile(CLIENT_UID,{photoProfil:""})));
      const ref=doc(db,"partenaires",CLIENT_UID);
      await assertSucceeds(setDoc(ref,validProfile(CLIENT_UID)));
      await assertFails(updateDoc(ref,{statut:"approuve"}));
    });
  });

  describe("Conversations MON QUOTIDIEN AI — confidentialité", () => {
    const conversationId = "ai-conversation-test-001";
    const ownerUid = "ai-owner-test-001";

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await db.doc(`ai_conversations/${conversationId}`).set({
          uid: ownerUid,
          title: "Conversation de test",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        await db.doc(`ai_conversations/${conversationId}/messages/message-001`).set({
          role: "assistant",
          content: "Bonjour",
          createdAt: Timestamp.now()
        });
      });
    });

    it("autorise le propriétaire à lire sa conversation et ses messages", async () => {
      const {doc, getDoc} = require("firebase/firestore");
      const db = testEnv.authenticatedContext(ownerUid).firestore();
      await assertSucceeds(getDoc(doc(db, "ai_conversations", conversationId)));
      await assertSucceeds(getDoc(doc(db, "ai_conversations", conversationId, "messages", "message-001")));
    });

    it("interdit à un autre utilisateur de lire la conversation et ses messages", async () => {
      const {doc, getDoc} = require("firebase/firestore");
      const db = testEnv.authenticatedContext(OTHER_UID).firestore();
      await assertFails(getDoc(doc(db, "ai_conversations", conversationId)));
      await assertFails(getDoc(doc(db, "ai_conversations", conversationId, "messages", "message-001")));
    });

    it("interdit la lecture sans authentification", async () => {
      const {doc, getDoc} = require("firebase/firestore");
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, "ai_conversations", conversationId)));
      await assertFails(getDoc(doc(db, "ai_conversations", conversationId, "messages", "message-001")));
    });

    it("interdit au navigateur de créer, modifier ou supprimer les conversations et messages", async () => {
      const {doc, setDoc, updateDoc, deleteDoc} = require("firebase/firestore");
      const db = testEnv.authenticatedContext(ownerUid).firestore();
      const conversationRef = doc(db, "ai_conversations", conversationId);
      const messageRef = doc(db, "ai_conversations", conversationId, "messages", "message-002");
      await assertFails(setDoc(doc(db, "ai_conversations", "client-created"), {
        uid: ownerUid, title: "Injection", createdAt: Timestamp.now(), updatedAt: Timestamp.now()
      }));
      await assertFails(updateDoc(conversationRef, {title: "Modification client"}));
      await assertFails(deleteDoc(conversationRef));
      await assertFails(setDoc(messageRef, {role: "assistant", content: "Message falsifié"}));
      await assertFails(deleteDoc(doc(db, "ai_conversations", conversationId, "messages", "message-001")));
    });
  });


  describe("Cabines téléphoniques — diffusion nationale et attribution exclusive", () => {
    const CABINE_UID = "cabine-test-001";
    const CABINE_UID_2 = "cabine-test-002";
    const requestData = () => ({
      clientUid: CLIENT_UID,
      operateur: "Orange",
      typeService: "forfait_internet",
      numeroBeneficiaire: "0700000000",
      montantPrestation: 1000,
      commune: "Yopougon",
      details: "Forfait Internet 2 Go",
      cabineUid: null,
      statut: "en_attente",
      createdAt: require("firebase/firestore").serverTimestamp(),
      updatedAt: require("firebase/firestore").serverTimestamp()
    });
    async function seedDemand() {
      await testEnv.withSecurityRulesDisabled(async context => {
        await context.firestore().doc("demandes_cabines/national-request").set(requestData());
      });
    }
    async function seedCabines() {
      await testEnv.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await db.doc("cabines_telephoniques/" + CABINE_UID).set({
          uid:CABINE_UID,nom:"Cabine A",responsable:"Responsable A",email:"cabine-a@example.test",
          telephone:"0700000001",commune:"Abidjan",adresse:"Yopougon, marché",horaires:"8h-20h",
          operateurs:["Orange","MTN"],statut:"approuve",createdAt:Timestamp.now(),updatedAt:Timestamp.now()
        });
        await db.doc("cabines_telephoniques/" + CABINE_UID_2).set({
          uid:CABINE_UID_2,nom:"Cabine B",responsable:"Responsable B",email:"cabine-b@example.test",
          telephone:"0700000002",commune:"Bouaké",adresse:"Centre-ville",horaires:"8h-20h",
          operateurs:["Orange"],statut:"approuve",createdAt:Timestamp.now(),updatedAt:Timestamp.now()
        });
      });
    }

    it("interdit à un client de publier une demande sans paiement confirmé côté serveur", async () => {
      const {doc,setDoc}=require("firebase/firestore");
      const db=testEnv.authenticatedContext(CLIENT_UID,{email:"client@example.test"}).firestore();
      await assertFails(setDoc(doc(db,"demandes_cabines","national-request"),requestData()));
    });

    it("diffuse la demande ouverte aux cabinistes approuvés de communes différentes", async () => {
      const {collection,query,where,getDocs}=require("firebase/firestore");
      await seedCabines();await seedDemand();
      for (const uid of [CABINE_UID,CABINE_UID_2]) {
        const partnerDb=testEnv.authenticatedContext(uid,{email:"cabine@example.test"}).firestore();
        const q=query(collection(partnerDb,"demandes_cabines"),where("statut","==","en_attente"),where("cabineUid","==",null));
        const result=await assertSucceeds(getDocs(q));
        if(result.empty)throw new Error("La demande ouverte n’a pas été diffusée à "+uid);
      }
    });

    it("interdit à un compte non approuvé de consulter les demandes diffusées", async () => {
      const {collection,query,where,getDocs}=require("firebase/firestore");
      await seedCabines();await seedDemand();
      const otherDb=testEnv.authenticatedContext(OTHER_UID,{email:"other@example.test"}).firestore();
      await assertFails(getDocs(query(collection(otherDb,"demandes_cabines"),where("statut","==","en_attente"),where("cabineUid","==",null))));
    });

    it("attribue une demande au premier cabiniste et bloque les autres", async () => {
      const {doc,updateDoc,serverTimestamp,getDoc}=require("firebase/firestore");
      await seedCabines();await seedDemand();
      const cabinDb=testEnv.authenticatedContext(CABINE_UID,{email:"cabine-a@example.test"}).firestore();
      await assertSucceeds(updateDoc(doc(cabinDb,"demandes_cabines","national-request"),{
        cabineUid:CABINE_UID,cabineNom:"Cabine A",statut:"acceptee",updatedAt:serverTimestamp()
      }));
      const otherCabinDb=testEnv.authenticatedContext(CABINE_UID_2,{email:"cabine-b@example.test"}).firestore();
      await assertFails(updateDoc(doc(otherCabinDb,"demandes_cabines","national-request"),{
        cabineUid:CABINE_UID_2,cabineNom:"Cabine B",statut:"acceptee",updatedAt:serverTimestamp()
      }));
      await assertFails(getDoc(doc(otherCabinDb,"demandes_cabines","national-request")));
    });

    it("autorise uniquement le cabiniste attributaire à faire progresser la demande", async () => {
      const {doc,updateDoc,serverTimestamp}=require("firebase/firestore");
      await seedCabines();await seedDemand();
      const cabinDb=testEnv.authenticatedContext(CABINE_UID,{email:"cabine-a@example.test"}).firestore();
      const ref=doc(cabinDb,"demandes_cabines","national-request");
      await assertSucceeds(updateDoc(ref,{cabineUid:CABINE_UID,cabineNom:"Cabine A",statut:"acceptee",updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(ref,{statut:"en_cours",updatedAt:serverTimestamp()}));
      await assertSucceeds(updateDoc(ref,{statut:"terminee",updatedAt:serverTimestamp()}));
    });

    it("réserve la création des reversements à l’admin et autorise leur lecture par la cabine attributaire", async () => {
      const {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp}=require("firebase/firestore");
      await seedCabines();
      await testEnv.withSecurityRulesDisabled(async context=>{
        await context.firestore().doc("demandes_cabines/completed-payout-test").set({
          ...requestData(),cabineUid:CABINE_UID,cabineNom:"Cabine A",statut:"terminee",
          montantAReverser:1000,paiementStatut:"paye"
        });
      });
      const payout={demandeId:"completed-payout-test",cabineUid:CABINE_UID,cabineNom:"Cabine A",
        montantXof:400,dateReversement:"2026-11-22",reference:"WAVE-TEST-001",
        moyenPaiement:"Wave",createdAt:serverTimestamp(),createdBy:ADMIN_UID};
      const admin=testEnv.authenticatedContext(ADMIN_UID).firestore();
      const payoutRef=doc(admin,"demandes_cabines","completed-payout-test","reversements","wave-test-001");
      await assertSucceeds(setDoc(payoutRef,payout));
      const cabin=testEnv.authenticatedContext(CABINE_UID).firestore();
      await assertSucceeds(getDoc(doc(cabin,"demandes_cabines","completed-payout-test","reversements","wave-test-001")));
      await assertFails(updateDoc(doc(cabin,"demandes_cabines","completed-payout-test","reversements","wave-test-001"),{montantXof:900}));
      await assertFails(deleteDoc(doc(admin,"demandes_cabines","completed-payout-test","reversements","wave-test-001")));
      const client=testEnv.authenticatedContext(CLIENT_UID).firestore();
      await assertFails(setDoc(doc(client,"demandes_cabines","completed-payout-test","reversements","client-forged"),{...payout,createdBy:CLIENT_UID}));
    });
  });

});