import test from "node:test";
import worker from "../cloudflare-enfants/src/index.mjs";
import assert from "node:assert/strict";
import { validDocId, validImageType, matchesImageSignature, privatePhotoKey, publicPhotoKey, readBodyLimited, uploadOwnerMatches } from "../cloudflare-enfants/src/index.mjs";

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

test("autorise le dépôt uniquement pour le propriétaire d’un dossier en attente", () => {
  const uid = "client-test-001";
  const docId = "enfant-test-001";
  const parent = { fields: { statut: { stringValue: "en_attente" } } };
  const prive = { fields: { uid: { stringValue: uid }, photoKey: { stringValue: privatePhotoKey(uid, docId) } } };
  assert.equal(uploadOwnerMatches(parent, prive, uid, docId), true);
  assert.equal(uploadOwnerMatches(parent, prive, "autre-utilisateur", docId), false);
  assert.equal(uploadOwnerMatches(parent, null, uid, docId), false);
  assert.equal(uploadOwnerMatches(null, prive, uid, docId), false);
  assert.equal(uploadOwnerMatches({ fields: { statut: { stringValue: "approuve" } } }, prive, uid, docId), false);
  assert.equal(uploadOwnerMatches(parent, { fields: { uid: { stringValue: uid }, photoKey: { stringValue: "private/autre/enfant-test-001/photo" } } }, uid, docId), false);
});


function mockUploadEnvironment(t, { parentStatus = "en_attente", ownerUid = "user-123", privateExists = true } = {}) {
  const docId = "abcdefghij123";
  const uid = "user-123";
  const expectedKey = privatePhotoKey(uid, docId);
  let putCount = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input);
    if (url.includes("identitytoolkit.googleapis.com")) {
      return Response.json({ users: [{ localId: uid }] });
    }
    if (url.includes("/declarations_enfants/" + docId + "/informations_privees/contact")) {
      return privateExists
        ? Response.json({ fields: { uid: { stringValue: ownerUid }, photoKey: { stringValue: expectedKey } } })
        : new Response("not found", { status: 404 });
    }
    if (url.includes("/declarations_enfants/" + docId)) {
      return Response.json({ fields: { statut: { stringValue: parentStatus } } });
    }
    throw new Error("Unexpected mocked fetch: " + url);
  });
  const env = {
    FIREBASE_PROJECT_ID: "mon-transport-ci",
    FIREBASE_WEB_API_KEY: "public-test-key",
    ADMIN_UID: "admin-test",
    ALLOWED_ORIGINS: "https://kevintabi-ia.github.io",
    ENFANTS_BUCKET: {
      async get() { return null; },
      async put() { putCount++; return { etag: "test-etag" }; }
    }
  };
  return { env, docId, getPutCount: () => putCount };
}

async function uploadTestRequest(docId) {
  return new Request("https://worker.test/upload/" + docId, {
    method: "POST",
    headers: { Authorization: "Bearer test-id-token", "Content-Type": "image/png" },
    body: Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  });
}

test("refuse l’upload si le dossier Firestore n’existe pas", async (t) => {
  const { env, docId, getPutCount } = mockUploadEnvironment(t, { privateExists: false });
  const response = await worker.fetch(await uploadTestRequest(docId), env);
  assert.equal(response.status, 403);
  assert.equal(getPutCount(), 0);
});

test("refuse l’upload si le dossier n’est plus en attente", async (t) => {
  const { env, docId, getPutCount } = mockUploadEnvironment(t, { parentStatus: "approuve" });
  const response = await worker.fetch(await uploadTestRequest(docId), env);
  assert.equal(response.status, 403);
  assert.equal(getPutCount(), 0);
});

test("refuse l’upload si le dossier appartient à un autre utilisateur", async (t) => {
  const { env, docId, getPutCount } = mockUploadEnvironment(t, { ownerUid: "autre-utilisateur" });
  const response = await worker.fetch(await uploadTestRequest(docId), env);
  assert.equal(response.status, 403);
  assert.equal(getPutCount(), 0);
});

test("accepte l’upload pour le propriétaire d’un dossier en attente", async (t) => {
  const { env, docId, getPutCount } = mockUploadEnvironment(t);
  const response = await worker.fetch(await uploadTestRequest(docId), env);
  assert.equal(response.status, 201);
  assert.equal(getPutCount(), 1);
});


test("journalise uniquement le code Firebase lors d’un rejet du jeton", async (t) => {
  const token = "token-ne-doit-jamais-apparaitre";
  const apiKey = "cle-ne-doit-jamais-apparaitre";
  const logs = [];
  t.mock.method(console, "warn", (line) => logs.push(String(line)));
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { message: "INVALID_ID_TOKEN" } }, { status: 400 })
  );
  const env = {
    FIREBASE_PROJECT_ID: "mon-transport-ci",
    FIREBASE_WEB_API_KEY: apiKey,
    ADMIN_UID: "admin-test",
    ALLOWED_ORIGINS: "https://kevintabi-ia.github.io",
    ENFANTS_BUCKET: { async get() { return null; }, async put() { throw new Error("unexpected write"); } }
  };
  const request = new Request("https://worker.test/admin/photo/abcdefghij123?ownerUid=user-123", {
    headers: { Authorization: "Bearer " + token }
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 401);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /INVALID_ID_TOKEN/);
  assert.match(logs[0], /"upstreamStatus":400/);
  assert.equal(logs[0].includes(token), false);
  assert.equal(logs[0].includes(apiKey), false);
});


test("classe un refus HTTP 403 Firebase sans journaliser le message brut", async (t) => {
  const token = "token-prive-a-masquer";
  const apiKey = "cle-privee-a-masquer";
  const logs = [];
  t.mock.method(console, "warn", (line) => logs.push(String(line)));
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: {
      code: 403,
      message: "Requests from this IP address are blocked.",
      status: "PERMISSION_DENIED",
      details: [{ reason: "API_KEY_IP_ADDRESS_BLOCKED" }]
    }
  }, { status: 403 }));
  const env = {
    FIREBASE_PROJECT_ID: "mon-transport-ci",
    FIREBASE_WEB_API_KEY: apiKey,
    ADMIN_UID: "admin-test",
    ALLOWED_ORIGINS: "https://kevintabi-ia.github.io",
    ENFANTS_BUCKET: { async get() { return null; }, async put() { throw new Error("unexpected write"); } }
  };
  const request = new Request("https://worker.test/admin/photo/abcdefghij123?ownerUid=user-123", {
    headers: { Authorization: "Bearer " + token }
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 401);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"firebaseCategory":"API_KEY_RESTRICTION"/);
  assert.match(logs[0], /API_KEY_IP_ADDRESS_BLOCKED/);
  assert.equal(logs[0].includes("Requests from this IP address"), false);
  assert.equal(logs[0].includes(token), false);
  assert.equal(logs[0].includes(apiKey), false);
});
