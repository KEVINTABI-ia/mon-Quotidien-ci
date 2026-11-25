import test from "node:test";
import assert from "node:assert/strict";
import { validateJekoPaymentPlan } from "../cloudflare/worker.js";

const base = {
  provider: "jeko",
  serviceId: "publicite",
  currency: "XOF",
  uid: "partner-user-123",
  planId: "decouverte",
  amountXof: 2000,
  amountCents: 200000,
  durationDays: 3,
  imagePath: "publicites/partenaires/partner-user-123/123e4567-e89b-12d3-a456-426614174000.jpg",
  partnerProfilePath: "partenaires/partner-user-123",
  mediaUrl: "https://firebasestorage.googleapis.com/v0/b/example/o/publicites%2Fpartenaires%2Fpartner-user-123%2F123e4567-e89b-12d3-a456-426614174000.jpg?alt=media",
  titre: "Commerce test"
};

test("validates each fixed advertising package", () => {
  const plans = [
    ["decouverte", 2000, 3],
    ["visibilite", 5000, 7],
    ["professionnel", 9000, 15],
    ["premium", 15000, 30]
  ];
  for (const [planId, amountXof, durationDays] of plans) {
    assert.equal(validateJekoPaymentPlan({
      ...base, planId, amountXof, amountCents: amountXof * 100, durationDays
    }), true);
  }
});

test("rejects altered price, duration, owner path, and non-image file", () => {
  assert.equal(validateJekoPaymentPlan({ ...base, amountXof: 1000, amountCents: 100000 }), false);
  assert.equal(validateJekoPaymentPlan({ ...base, durationDays: 30 }), false);
  assert.equal(validateJekoPaymentPlan({ ...base, imagePath: "publicites/partenaires/other-user/file.jpg" }), false);
  assert.equal(validateJekoPaymentPlan({ ...base, imagePath: base.imagePath.replace(".jpg", ".mp4") }), false);
  assert.equal(validateJekoPaymentPlan({ ...base, partnerProfilePath: "partenaires/someone-else" }), false);
});


test("validates phone cabin fees at 4 percent of the service amount", () => {
  const baseCabine = {
    provider: "jeko", serviceId: "cabine", currency: "XOF",
    uid: "client-user-123", typeService: "transfert_unites",
    operateur: "Orange", numeroBeneficiaire: "0700000000",
    commune: "Yopougon", details: "Transfert de crédit",
    amountPrestation: 500, fraisService: 20, amountXof: 520, amountCents: 52000
  };
  assert.equal(validateJekoPaymentPlan(baseCabine), true);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountPrestation: 999, fraisService: 40, amountXof: 1039, amountCents: 103900 }), true);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountPrestation: 1000, fraisService: 40, amountXof: 1040, amountCents: 104000 }), true);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountPrestation: 3000, fraisService: 120, amountXof: 3120, amountCents: 312000 }), true);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountPrestation: 3001, fraisService: 120, amountXof: 3121, amountCents: 312100 }), true);
});

test("rejects manipulated cabin fees, totals, services, and beneficiary numbers", () => {
  const baseCabine = {
    provider: "jeko", serviceId: "cabine", currency: "XOF",
    uid: "client-user-123", typeService: "transfert_unites",
    operateur: "Orange", numeroBeneficiaire: "0700000000",
    commune: "Yopougon", details: "Transfert de crédit",
    amountPrestation: 500, fraisService: 20, amountXof: 520, amountCents: 52000
  };
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, fraisService: 0 }), false);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountXof: 500, amountCents: 50000 }), false);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, typeService: "other" }), false);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, numeroBeneficiaire: "x" }), false);
  assert.equal(validateJekoPaymentPlan({ ...baseCabine, amountPrestation: 199, fraisService: 8, amountXof: 207, amountCents: 20700 }), false);
});
