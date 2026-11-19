import test from "node:test";
import assert from "node:assert/strict";
import { buildSubscriptionPlans } from "../cloudflare/worker.js";

test("Cars de ramassage expose exactement 2 000 FCFA pour 30 jours", () => {
  const [plan] = buildSubscriptionPlans("ramassage", {
    ramassage: { prix: 9000, duree: 90, unite: "mois", actif: true, essai: 5 }
  }, new Date("2026-11-19T12:00:00Z"));
  assert.equal(plan.planId, "ramassage");
  assert.equal(plan.priceXof, 2000);
  assert.equal(plan.regularPriceXof, 2000);
  assert.equal(plan.duration, 30);
  assert.equal(plan.unit, "jours");
  assert.equal(plan.trialDays, 30);
  assert.equal(plan.available, true);
});

test("le catalogue ramassage respecte la désactivation administrative", () => {
  const [plan] = buildSubscriptionPlans("ramassage", { ramassage: { actif: false, prix: 9000, duree: 90 } });
  assert.equal(plan.available, false);
  assert.equal(plan.priceXof, null);
});

test("le catalogue Logement conserve ses trois formules de checkout", () => {
  const plans = buildSubscriptionPlans("logement", {});
  assert.deepEqual(plans.map(p => [p.planId, p.priceXof, p.duration, p.unit]), [
    ["mensuel", 3000, 1, "mois"],
    ["trimestriel", 8000, 3, "mois"],
    ["semestriel", 15000, 6, "mois"]
  ]);
});

test("un service inconnu n'expose aucun plan", () => {
  assert.equal(buildSubscriptionPlans("service_inconnu", {}), null);
});

test("le catalogue Petites annonces reprend les mêmes valeurs par défaut que le checkout", () => {
  const [plan] = buildSubscriptionPlans("petites_annonces", {});
  assert.equal(plan.planId, "petites_annonces");
  assert.equal(plan.priceXof, 500);
  assert.equal(plan.duration, 30);
  assert.equal(plan.unit, "jours");
});

test("le catalogue Automobiliste reprend le forfait annuel par défaut du checkout", () => {
  const [plan] = buildSubscriptionPlans("automobiliste", {});
  assert.equal(plan.planId, "annuel");
  assert.equal(plan.priceXof, 1000);
  assert.equal(plan.duration, 12);
  assert.equal(plan.unit, "mois");
});

test("le catalogue Petites annonces reflète la configuration tarifaire du checkout", () => {
  const [plan] = buildSubscriptionPlans("petites_annonces", {
    petites_annonces: { prix: 700, duree: 45, unite: "jours", actif: true }
  });
  assert.equal(plan.priceXof, 700);
  assert.equal(plan.duration, 45);
  assert.equal(plan.unit, "jours");
});

test("le catalogue Automobiliste reflète le prix configuré tout en conservant 12 mois", () => {
  const [plan] = buildSubscriptionPlans("automobiliste", {
    automobiliste: { prix: 2500, duree: 12, unite: "mois", actif: true }
  });
  assert.equal(plan.priceXof, 2500);
  assert.equal(plan.duration, 12);
  assert.equal(plan.unit, "mois");
});

test("les forfaits fixes Logement et Ramassage ne peuvent pas être modifiés par la configuration", () => {
  const logement = buildSubscriptionPlans("logement", {
    mensuel: { prix: 9900, duree: 12, unite: "mois" }
  })[0];
  const ramassage = buildSubscriptionPlans("ramassage", {
    ramassage: { prix: 9900, duree: 12, unite: "mois" }
  })[0];
  assert.deepEqual([logement.priceXof, logement.duration, logement.unit], [3000, 1, "mois"]);
  assert.deepEqual([ramassage.priceXof, ramassage.duration, ramassage.unit], [2000, 30, "jours"]);
});

import { validateJekoPaymentPlan } from "../cloudflare/worker.js";

test("webhook valide les forfaits fixes Logement et Ramassage", () => {
  assert.equal(validateJekoPaymentPlan({provider:"jeko",currency:"XOF",serviceId:"logement_renewal",planId:"trimestriel",amountXof:8000,amountCents:800000,durationDays:90}),true);
  assert.equal(validateJekoPaymentPlan({provider:"jeko",currency:"XOF",serviceId:"ramassage",planId:"ramassage",amountXof:2000,amountCents:200000,durationDays:30}),true);
  assert.equal(validateJekoPaymentPlan({provider:"jeko",currency:"XOF",serviceId:"annuaire_renewal",planId:"annuaire",amountXof:1000,amountCents:100000,durationDays:30}),true);
});

test("webhook refuse un montant ou une durée fixe incohérents", () => {
  assert.equal(validateJekoPaymentPlan({provider:"jeko",currency:"XOF",serviceId:"logement_renewal",planId:"trimestriel",amountXof:9000,amountCents:900000,durationDays:90}),false);
  assert.equal(validateJekoPaymentPlan({provider:"jeko",currency:"XOF",serviceId:"ramassage",planId:"ramassage",amountXof:2000,amountCents:200000,durationDays:60}),false);
});

test("webhook exige un instantané serveur cohérent pour les plans configurables", () => {
  const base={provider:"jeko",currency:"XOF",serviceId:"partenaire_colis",planId:"partenaires_colis_3mois",amountXof:6000,amountCents:600000,durationMonths:3,planAmountXof:6000,planDurationMonths:3,planSnapshotVersion:1};
  assert.equal(validateJekoPaymentPlan(base),true);
  assert.equal(validateJekoPaymentPlan({...base,amountXof:7000,amountCents:700000}),false);
  assert.equal(validateJekoPaymentPlan({...base,durationMonths:6}),false);
  assert.equal(validateJekoPaymentPlan({...base,planDurationMonths:6}),false);
  assert.equal(validateJekoPaymentPlan({...base,planAmountXof:7000}),false);
});

test("webhook refuse une devise ou des centimes incohérents", () => {
  const base={provider:"jeko",currency:"XOF",serviceId:"ramassage",planId:"ramassage",amountXof:2000,amountCents:200000,durationDays:30};
  assert.equal(validateJekoPaymentPlan({...base,currency:"USD"}),false);
  assert.equal(validateJekoPaymentPlan({...base,amountCents:2000}),false);
});
