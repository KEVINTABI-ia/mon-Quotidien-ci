const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { safeEqualHex, verifyWaveSignature, addMonthsClamped } = require("../src/payment-utils");

const secret = "wave_sn_WHS_test_secret";
const now = 1_800_000_000_000;
const timestamp = String(Math.floor(now / 1000));
const body = Buffer.from('{"id":"evt-1","data":{"id":"cos-1"}}');
const sign = (t, payload = body) => crypto.createHmac("sha256", secret).update(t).update(payload).digest("hex");

test("accepts the documented Wave timestamp + raw-body signature", () => {
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body, secret, now), true);
});

test("rejects a signature using a separator or a re-serialized body", () => {
  const wrong = crypto.createHmac("sha256", secret).update(timestamp + ".").update(body).digest("hex");
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${wrong}`, body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, Buffer.from(body.toString() + "\n"), secret, now), false);
});

test("rejects stale and excessively future timestamps", () => {
  const stale = String(Math.floor(now / 1000) - 301);
  const future = String(Math.floor(now / 1000) + 31);
  assert.equal(verifyWaveSignature(`t=${stale},v1=${sign(stale)}`, body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${future},v1=${sign(future)}`, body, secret, now), false);
});

test("accepts a valid signature among multiple v1 signatures", () => {
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${"0".repeat(64)},v1=${sign(timestamp)}`, body, secret, now), true);
});

test("rejects malformed headers, missing secrets and non-buffer bodies", () => {
  assert.equal(verifyWaveSignature("bad", body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=abc`, body, secret, now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body, "", now), false);
  assert.equal(verifyWaveSignature(`t=${timestamp},v1=${sign(timestamp)}`, body.toString(), secret, now), false);
});

test("compares only valid equal-length hexadecimal digests", () => {
  const digest = "a".repeat(64);
  assert.equal(safeEqualHex(digest, digest), true);
  assert.equal(safeEqualHex(digest, "b".repeat(64)), false);
  assert.equal(safeEqualHex("invalid", digest), false);
});

test("adds calendar months without overflowing month ends", () => {
  assert.equal(addMonthsClamped(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addMonthsClamped(new Date("2024-01-31T12:00:00.000Z"), 1).toISOString(), "2024-02-29T12:00:00.000Z");
  assert.equal(addMonthsClamped(new Date("2026-03-15T12:00:00.000Z"), 12).toISOString(), "2027-03-15T12:00:00.000Z");
});
