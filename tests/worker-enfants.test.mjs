import test from "node:test";
import assert from "node:assert/strict";
import { validDocId, validImageType, matchesImageSignature, privatePhotoKey, publicPhotoKey, readBodyLimited } from "../cloudflare-enfants/src/index.mjs";

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

test("vérifie la signature binaire réelle des images", () => {
  assert.equal(matchesImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(matchesImageSignature(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), "image/png"), true);
  assert.equal(matchesImageSignature(new TextEncoder().encode("RIFF0000WEBP"), "image/webp"), true);
  assert.equal(matchesImageSignature(new TextEncoder().encode("<svg></svg>"), "image/png"), false);
});

test("arrête la lecture dès que le flux dépasse la limite", async () => {
  const chunks = [
    Uint8Array.from([1, 2, 3]),
    Uint8Array.from([4, 5, 6]),
    Uint8Array.from([7, 8, 9])
  ];
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (reads < chunks.length) controller.enqueue(chunks[reads++]);
      else controller.close();
    }
  });
  const request = new Request("https://example.test/upload/abcdefghij", { method: "POST", body, duplex: "half" });
  const result = await readBodyLimited(request, 5);
  assert.equal(result, null);
  assert.ok(reads <= 2, "le flux doit être arrêté au dépassement");
});

test("accepte un flux dont la taille respecte la limite", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]));
      controller.enqueue(Uint8Array.from([3, 4]));
      controller.close();
    }
  });
  const request = new Request("https://example.test/upload/abcdefghij", { method: "POST", body, duplex: "half" });
  assert.deepEqual(Array.from(await readBodyLimited(request, 4)), [1, 2, 3, 4]);
});
