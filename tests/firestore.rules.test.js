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
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente",
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
        clientId: CLIENT_UID, service: "livraison", statut: "en_attente",
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
        clientId: CLIENT_UID, service: "compagnie", statut: "en_attente",
        depart: "Gare test", destination: "Gare destination"
      });
    });
    const db = testEnv.authenticatedContext(PARTNER_UID).firestore();
    const { doc, getDoc } = require("firebase/firestore");
    await assertFails(getDoc(doc(db, "commandes_colis", ORDER_ID)));
  });

});
