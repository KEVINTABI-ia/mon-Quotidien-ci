const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { safeEqualHex, verifyWaveSignature, addMonthsClamped } = require("../src/payment-utils");

const secret = "wave-test-secret";
const now = 1_800_000_000_000;
const timestamp = String(Math.floor(now / 1000));
const body = Buffer.from('{"id":"evt-1","data":{"id":"cos-1"}}');
const sign = (t, payload = body) => crypto.createHmac("sha256", secret).update(t).update(payload).digest("hex");

test("accepts Wave timestamp + exact raw-body HMAC", () => {
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body, secret, now), true);
});
test("rejects altered payload and signatures with a separator", () => {
  const wrong = crypto.createHmac("sha256", secret).update(timestamp + ".").update(body).digest("hex");
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${wrong}`, body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, Buffer.from(body.toString() + "\n"), secret, now), false);
});
test("rejects stale and future timestamps outside tolerance", () => {
  for (const t of [String(Number(timestamp) - 301), String(Number(timestamp) + 31)]) {
    assert.equal(verifyWaveSignature(`t=${t},v1=${sign(t)}`, body, secret, now), false);
  }
});
test("accepts any valid v1 signature in a rotation header", () => {
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${"0".repeat(64)},v1=${sign(timestamp)}`, body, secret, now), true);
});
test("rejects malformed headers and invalid input types", () => {
  assert.equal(verifyWaveSignature("bad", body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=abc`, body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body.toString(), secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body, "", now), false);
});
test("compares only valid fixed-length hex digests", () => {
  assert.equal(safeEqualHex("a".repeat(64), "a".repeat(64)), true);
  assert.equal(safeEqualHex("a".repeat(64), "b".repeat(64)), false);
  assert.equal(safeEqualHex("not-hex", "a".repeat(64)), false);
});
test("adds calendar months without overflowing month ends", () => {
  assert.equal(addMonthsClamped(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addMonthsClamped(new Date("2024-01-31T12:00:00.000Z"), 1).toISOString(), "2024-02-29T12:00:00.000Z");
  assert.equal(addMonthsClamped(new Date("2026-03-15T12:00:00.000Z"), 12).toISOString(), "2027-03-15T12:00:00.000Z");
});
