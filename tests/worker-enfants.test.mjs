import test from "node:test";
import assert from "node:assert/strict";
import { validDocId, validImageType, privatePhotoKey, publicPhotoKey } from "../cloudflare-enfants/src/index.mjs";

test("valide les identifiants de dossier sans accepter de chemin", () => {
  assert.equal(validDocId("Abcdefghij_123"), true);
  assert.equal(validDocId("../private/file"), false);
  assert.equal(validDocId("short"), false);
});
test("limite les formats aux images JPEG PNG WEBP", () => {
  assert.equal(validImageType("image/jpeg"), true);
  assert.equal(validImageType("image/png"), true);
  assert.equal(validImageType("image/webp"), true);
  assert.equal(validImageType("image/svg+xml"), false);
  assert.equal(validImageType("application/pdf"), false);
});
test("construit des clés R2 séparées et déterministes", () => {
  assert.equal(privatePhotoKey("uid123", "doc123456789"), "private/uid123/doc123456789/photo");
  assert.equal(publicPhotoKey("doc123456789"), "public/doc123456789/photo");
});
