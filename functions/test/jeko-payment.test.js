const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyJekoSignature, xofToJekoAmountCents, addMonthsClamped } = require("../src/payment-utils");

const secret = "test-webhook-secret";
const body = Buffer.from('{"id":"txn-1","status":"success"}');

test("verifies Jèko HMAC on exact raw body", () => {
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyJekoSignature(signature, body, secret), true);
  assert.equal(verifyJekoSignature(signature, Buffer.from(body.toString() + "\\n"), secret), false);
  assert.equal(verifyJekoSignature("sha256=" + signature, body, secret), false);
  assert.equal(verifyJekoSignature("0".repeat(64), body, secret), false);
  assert.equal(verifyJekoSignature(signature, body, ""), false);
});

test("converts XOF into Jèko centimes exactly", () => {
  assert.equal(xofToJekoAmountCents(1000), 100000);
  assert.equal(xofToJekoAmountCents(3000), 300000);
  assert.equal(xofToJekoAmountCents(5000), 500000);
  assert.throws(() => xofToJekoAmountCents(0));
  assert.throws(() => xofToJekoAmountCents(1.5));
});

test("renews twelve calendar months without overflowing month ends", () => {
  assert.equal(addMonthsClamped(new Date("2026-02-28T12:00:00.000Z"), 12).toISOString(), "2027-02-28T12:00:00.000Z");
  assert.equal(addMonthsClamped(new Date("2024-02-29T12:00:00.000Z"), 12).toISOString(), "2025-02-28T12:00:00.000Z");
});
