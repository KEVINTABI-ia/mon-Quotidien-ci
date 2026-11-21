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
