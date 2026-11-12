import test from "node:test";
import worker from "../cloudflare-enfants/src/index.mjs";
import assert from "node:assert/strict";
import { validDocId, validImageType, matchesImageSignature, privatePhotoKey, publicPhotoKey, readBodyLimited, uploadOwnerMatches, verifyFirebaseIdToken } from "../cloudflare-enfants/src/index.mjs";
const pair = await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk",pair.publicKey),kid:"test-key",alg:"RS256",use:"sig"};
const b64 = bytes => btoa(Array.from(new Uint8Array(bytes),x=>String.fromCharCode(x)).join("")).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
async function token(overrides={}, signingPair=pair) {
 const now=Math.floor(Date.now()/1000);
 const h=b64(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT",kid:"test-key"})));
 const c=b64(new TextEncoder().encode(JSON.stringify({iss:"https://securetoken.google.com/mon-transport-ci",aud:"mon-transport-ci",sub:"user-123",user_id:"user-123",iat:now,exp:now+3600,auth_time:now-5,...overrides})));
 const input=h+"."+c;
 return input+"."+b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",signingPair.privateKey,new TextEncoder().encode(input)));
}

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
    if (url.includes("securetoken@system.gserviceaccount.com")) {
      return Response.json({ keys: [jwk] }, { headers: { "cache-control": "public, max-age=3600" } });
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
    headers: { Authorization: "Bearer " + await token(), "Content-Type": "image/png" },
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


test("valide signature, audience, émetteur et expiration des jetons Firebase", async () => {
 const valid=await token();
 const fetchKeys=async()=>Response.json({keys:[jwk]},{headers:{"cache-control":"public, max-age=3600"}});
 assert.equal((await verifyFirebaseIdToken(valid,"mon-transport-ci",fetchKeys)).uid,"user-123");
 assert.equal(await verifyFirebaseIdToken(await token({aud:"autre-projet"}),"mon-transport-ci",fetchKeys),null);
 assert.equal(await verifyFirebaseIdToken(await token({exp:Math.floor(Date.now()/1000)-1}),"mon-transport-ci",fetchKeys),null);
});
test("rejette une signature falsifiée", async () => {
 const impostor=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 assert.equal(await verifyFirebaseIdToken(await token({},impostor),"mon-transport-ci"),null);
});
