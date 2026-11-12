const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FIREBASE_LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

export function validDocId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{10,80}$/.test(value);
}
export function validImageType(value) {
  return ALLOWED_TYPES.has(String(value || "").toLowerCase());
}
export function matchesImageSignature(bytes, type) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (type === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  if (type === "image/webp") return b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}
export function privatePhotoKey(uid, docId) {
  return "private/" + uid + "/" + docId + "/photo";
}
export function publicPhotoKey(docId) {
  return "public/" + docId + "/photo";
}
export async function readBodyLimited(request, limit = MAX_IMAGE_BYTES) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("Payload too large");
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}
async function firebaseUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !env.FIREBASE_WEB_API_KEY) return null;
  const response = await fetch(FIREBASE_LOOKUP + "?key=" + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return null;
  const data = await response.json();
  const user = data.users && data.users[0];
  if (!user || user.disabled === true || !user.localId) return null;
  return { uid: user.localId, idToken: match[1] };
}
function isAdmin(user, env) {
  return Boolean(user && env.ADMIN_UID && user.uid === env.ADMIN_UID);
}
function assertWorkerConfig(env) {
  if (!env.ENFANTS_BUCKET || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_WEB_API_KEY || !env.ADMIN_UID) {
    throw new Error("Worker configuration is incomplete");
  }
}
async function getApprovedDocument(docId, env) {
  const url = "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(env.FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents/declarations_enfants/" + encodeURIComponent(docId);
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}
async function getFirestoreDocument(path, idToken) {
  const response = await fetch("https://firestore.googleapis.com/v1/" + path, {
    headers: { authorization: "Bearer " + idToken }
  });
  if (!response.ok) return null;
  return response.json();
}
function stringField(doc, name) {
  return doc && doc.fields && doc.fields[name] && doc.fields[name].stringValue || "";
}
export function uploadOwnerMatches(parentDoc, privateDoc, uid, docId) {
  return Boolean(parentDoc && stringField(parentDoc, "statut") === "en_attente" &&
    privateDoc && stringField(privateDoc, "uid") === uid &&
    stringField(privateDoc, "photoKey") === privatePhotoKey(uid, docId));
}
async function handle(request, env) {
  assertWorkerConfig(env);
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "GET" && parts.length === 2 && parts[0] === "public") {
    const docId = parts[1];
    if (!validDocId(docId)) return new Response("Not found", { status: 404 });
    const doc = await getApprovedDocument(docId, env);
    const expectedUrl = url.origin + "/public/" + docId;
    if (!doc || stringField(doc, "statut") !== "approuve" || stringField(doc, "photoUrl") !== expectedUrl) {
      return new Response("Not found", { status: 404 });
    }
    const object = await env.ENFANTS_BUCKET.get(publicPhotoKey(docId));
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=300");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  const user = await firebaseUser(request, env);
  if (!user) return json({ error: "Authentification Firebase requise." }, 401);
  if (request.method === "POST" && parts.length === 2 && parts[0] === "upload") {
    const docId = parts[1];
    if (!validDocId(docId)) return json({ error: "Identifiant de dossier invalide." }, 400);
    const parentPath = "projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) +
      "/databases/(default)/documents/declarations_enfants/" + encodeURIComponent(docId);
    const privatePath = parentPath + "/informations_privees/contact";
    const [parentDoc, privateDoc] = await Promise.all([
      getFirestoreDocument(parentPath, user.idToken),
      getFirestoreDocument(privatePath, user.idToken)
    ]);
    if (!uploadOwnerMatches(parentDoc, privateDoc, user.uid, docId)) {
      return json({ error: "Dossier introuvable ou accès non autorisé." }, 403);
    }
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (!validImageType(type)) return json({ error: "Format accepté : JPG, PNG ou WEBP." }, 415);
    if (declaredSize > MAX_IMAGE_BYTES) return json({ error: "Photo limitée à 8 Mo." }, 413);
    const bytes = await readBodyLimited(request, MAX_IMAGE_BYTES);
    if (!bytes || !bytes.byteLength) return json({ error: "Photo vide ou supérieure à 8 Mo." }, 413);
    if (!matchesImageSignature(bytes, type)) {
      return json({ error: "Le contenu du fichier ne correspond pas au format image annoncé." }, 415);
    }
    const key = privatePhotoKey(user.uid, docId);
    const existing = await env.ENFANTS_BUCKET.get(key);
    if (existing) {
      if (existing.customMetadata?.ownerUid === user.uid && existing.customMetadata?.docId === docId) {
        return json({ photoKey: key, reused: true });
      }
      return json({ error: "Un fichier existe déjà pour ce dossier." }, 409);
    }
    const stored = await env.ENFANTS_BUCKET.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: type, cacheControl: "private, no-store" },
      customMetadata: { ownerUid: user.uid, docId, immutable: "true" }
    });
    if (!stored) {
      const raced = await env.ENFANTS_BUCKET.get(key);
      if (raced?.customMetadata?.ownerUid === user.uid && raced?.customMetadata?.docId === docId) {
        return json({ photoKey: key, reused: true });
      }
      return json({ error: "Conflit : le fichier existe déjà." }, 409);
    }
    return json({ photoKey: key, reused: false }, 201);
  }

  if (request.method === "GET" && parts.length === 3 && parts[0] === "admin" && parts[1] === "photo") {
    if (!isAdmin(user, env)) return json({ error: "Accès administrateur requis." }, 403);
    const docId = parts[2];
    const ownerUid = url.searchParams.get("ownerUid") || "";
    if (!validDocId(docId) || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) return json({ error: "Paramètres invalides." }, 400);
    const parentPath = "projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) +
      "/databases/(default)/documents/declarations_enfants/" + encodeURIComponent(docId);
    const privatePath = parentPath + "/informations_privees/contact";
    const [parentDoc, privateDoc] = await Promise.all([
      getFirestoreDocument(parentPath, user.idToken),
      getFirestoreDocument(privatePath, user.idToken)
    ]);
    if (!parentDoc || stringField(parentDoc, "statut") !== "en_attente" ||
        !privateDoc || stringField(privateDoc, "uid") !== ownerUid ||
        stringField(privateDoc, "photoKey") !== privatePhotoKey(ownerUid, docId)) {
      return new Response("Not found", { status: 404 });
    }
    const object = await env.ENFANTS_BUCKET.get(privatePhotoKey(ownerUid, docId));
    if (!object || object.customMetadata?.ownerUid !== ownerUid || object.customMetadata?.docId !== docId) {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  if (request.method === "POST" && parts.length === 3 && parts[0] === "admin" && parts[1] === "approve") {
    if (!isAdmin(user, env)) return json({ error: "Accès administrateur requis." }, 403);
    const docId = parts[2];
    if (!validDocId(docId)) return json({ error: "Identifiant de dossier invalide." }, 400);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Corps JSON invalide." }, 400); }
    const ownerUid = String(body.ownerUid || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) return json({ error: "Propriétaire invalide." }, 400);
    const parentPath = "projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) +
      "/databases/(default)/documents/declarations_enfants/" + encodeURIComponent(docId);
    const privatePath = parentPath + "/informations_privees/contact";
    const [parentDoc, privateDoc] = await Promise.all([
      getFirestoreDocument(parentPath, user.idToken),
      getFirestoreDocument(privatePath, user.idToken)
    ]);
    if (!parentDoc || stringField(parentDoc, "statut") !== "en_attente" ||
        !privateDoc || stringField(privateDoc, "uid") !== ownerUid) {
      return json({ error: "Dossier en attente ou propriétaire introuvable." }, 404);
    }
    const sourceKey = privatePhotoKey(ownerUid, docId);
    if (stringField(privateDoc, "photoKey") !== sourceKey) {
      return json({ error: "La clé de photo ne correspond pas au dossier." }, 403);
    }
    const source = await env.ENFANTS_BUCKET.get(sourceKey);
    if (!source || source.customMetadata?.ownerUid !== ownerUid || source.customMetadata?.docId !== docId) {
      return json({ error: "Photo privée introuvable." }, 404);
    }
    const destinationKey = publicPhotoKey(docId);
    let published = await env.ENFANTS_BUCKET.get(destinationKey);
    if (published) {
      if (published.customMetadata?.ownerUid !== ownerUid || published.customMetadata?.docId !== docId) {
        return json({ error: "La photo publique existe déjà et ne peut pas être remplacée." }, 409);
      }
    } else {
      const result = await env.ENFANTS_BUCKET.put(destinationKey, source.body, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: source.httpMetadata?.contentType || "image/jpeg", cacheControl: "public, max-age=300" },
        customMetadata: { ownerUid, docId, immutable: "true" }
      });
      if (!result) {
        published = await env.ENFANTS_BUCKET.get(destinationKey);
        if (!published || published.customMetadata?.ownerUid !== ownerUid || published.customMetadata?.docId !== docId) {
          return json({ error: "Conflit pendant la publication de la photo." }, 409);
        }
      }
    }
    return json({ photoUrl: url.origin + "/public/" + docId, immutable: true });
  }
  return json({ error: "Route introuvable." }, 404);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!headers["access-control-allow-origin"]) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    try {
      const response = await handle(request, env);
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: response.status, headers: merged });
    } catch (error) {
      console.error(JSON.stringify({ event: "enfants_worker_error", message: error.message }));
      return json({ error: "Erreur interne du service photo." }, 500, headers);
    }
  }
};
