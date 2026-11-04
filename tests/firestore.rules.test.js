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
        rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8")
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

  it("autorise la clôture de livraison puis la suppression du verrou", async () => {
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
    const { doc, updateDoc, deleteDoc, serverTimestamp } = require("firebase/firestore");
    await assertSucceeds(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      statut: "livre", dateLivraison: serverTimestamp()
    }));
    await assertSucceeds(deleteDoc(doc(db, "partenaires", PARTNER_UID, "verrous", "missionActive")));
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


  it("bloque la file d'attente partenaire tant qu'une ancienne commande contient des champs privés", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente",
        depart: "Yopougon", destination: "Adjamé",
        clientTelephone: "0100000000", adresseRecuperation: "Adresse privée"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { collection, query, where, limit, getDocs, doc, getDoc } = require("firebase/firestore");
    await assertFails(getDoc(doc(db, "commandes_colis", ORDER_ID)));
    const q = query(
      collection(db, "commandes_colis"),
      where("publicVersion", "==", true),
      where("statut", "==", "en_attente"),
      where("service", "in", ["livraison", "livraison_programmee"]),
      limit(30)
    );
    const result = await assertSucceeds(getDocs(q));
    if (!result.empty) throw new Error("Une ancienne commande avec des champs privés a été exposée.");
  });

  it("autorise la migration administrative et retire les champs privés de la commande publique", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente",
        depart: "Yopougon", destination: "Adjamé",
        clientNom: "Client test", clientTelephone: "0100000000",
        telephoneExpediteur: "0100000000", telephoneDestinataire: "0200000000",
        adresseRecuperation: "Adresse de récupération", adresseLivraison: "Adresse de livraison",
        descriptionColis: "Document", trackingNumber: "MTC-LEGACY-001",
        latitudeRecuperation: 5.3, longitudeRecuperation: -4.0
      });
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const { doc, writeBatch, serverTimestamp, deleteField, getDoc } = require("firebase/firestore");
    const batch = writeBatch(db);
    const orderRef = doc(db, "commandes_colis", ORDER_ID);
    const privateRef = doc(db, "commandes_colis", ORDER_ID, "informations_privees", "details");
    batch.set(privateRef, {
      clientId: CLIENT_UID, clientNom: "Client test", clientTelephone: "0100000000",
      telephoneExpediteur: "0100000000", telephoneDestinataire: "0200000000",
      adresseRecuperation: "Adresse de récupération", adresseLivraison: "Adresse de livraison",
      descriptionColis: "Document", trackingNumber: "MTC-LEGACY-001",
      latitudeRecuperation: 5.3, longitudeRecuperation: -4.0,
      createdAt: serverTimestamp()
    });
    batch.update(orderRef, {
      clientNom: deleteField(), clientTelephone: deleteField(),
      telephoneExpediteur: deleteField(), telephoneDestinataire: deleteField(),
      adresseRecuperation: deleteField(), adresseLivraison: deleteField(),
      descriptionColis: deleteField(), trackingNumber: deleteField(),
      latitudeRecuperation: deleteField(), longitudeRecuperation: deleteField(),
      publicVersion: true
    });
    await assertSucceeds(batch.commit());
    const publicDoc = await getDoc(orderRef);
    const privateDoc = await getDoc(privateRef);
    if (publicDoc.data().trackingNumber !== undefined) throw new Error("Le numéro de suivi est encore dans la commande publique.");
    if (privateDoc.data().trackingNumber !== "MTC-LEGACY-001") throw new Error("Le numéro de suivi n'a pas été conservé dans le document privé.");
    const partnerDb = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { collection, query, where, limit, getDocs } = require("firebase/firestore");
    const q = query(
      collection(partnerDb, "commandes_colis"),
      where("publicVersion", "==", true),
      where("statut", "==", "en_attente"),
      where("service", "in", ["livraison", "livraison_programmee"]),
      limit(30)
    );
    const visible = await assertSucceeds(getDocs(q));
    if (visible.empty) throw new Error("La commande migrée n'est pas visible dans la file partenaire.");
  });

  it("refuse de retirer les anciens champs privés sans créer le document privé", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`commandes_colis/${ORDER_ID}`).set({
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente",
        trackingNumber: "MTC-LEGACY-002"
      });
    });
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const { doc, updateDoc, deleteField } = require("firebase/firestore");
    await assertFails(updateDoc(doc(db, "commandes_colis", ORDER_ID), {
      trackingNumber: deleteField()
    }));
  });

});
