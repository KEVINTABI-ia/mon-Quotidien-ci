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
