import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyJekoWebhookSignature, validateJekoPaymentPlan } from "../cloudflare/worker.js";

const secret = "unit-test-webhook-secret";
const payload = new TextEncoder().encode(JSON.stringify({
  id: "tx-test-001",
  status: "success",
  transactionDetails: { reference: "MQCI-0123456789abcdef", id: "request-test-001" },
  amount: { amount: 104000, currency: "XOF" },
  storeId: "store-test",
  transactionType: "payment"
}));

test("Jèko webhook: accepte une signature HMAC-SHA256 valide sur le corps brut", async () => {
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(await verifyJekoWebhookSignature(payload, signature, secret), true);
});

test("Jèko webhook: rejette une signature invalide, tronquée ou un secret absent", async () => {
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(await verifyJekoWebhookSignature(payload, "0".repeat(64), secret), false);
  assert.equal(await verifyJekoWebhookSignature(payload, signature.slice(1), secret), false);
  assert.equal(await verifyJekoWebhookSignature(payload, signature, ""), false);
});

test("Cabine: valide les frais serveur et le montant total exact", () => {
  const base = {
    provider: "jeko", serviceId: "cabine", currency: "XOF",
    amountPrestation: 1000, fraisService: 40, amountXof: 1040, amountCents: 104000,
    typeService: "forfait_internet", operateur: "Orange",
    numeroBeneficiaire: "0700000000", commune: "Yopougon",
    details: "Forfait Internet 2 Go", uid: "client-test-001"
  };
  assert.equal(validateJekoPaymentPlan(base), true);
  assert.equal(validateJekoPaymentPlan({...base, amountCents: 1040}), false);
  assert.equal(validateJekoPaymentPlan({...base, fraisService: 18}), false);
  assert.equal(validateJekoPaymentPlan({...base, amountXof: 1039}), false);
  assert.equal(validateJekoPaymentPlan({...base, amountPrestation: 199}), false);
});
