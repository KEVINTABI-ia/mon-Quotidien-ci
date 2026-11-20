const PROJECT_ID = "mon-transport-ci";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_PHOTOS = 8;
const ALLOWED_ORIGINS = new Set(["https://kevintabi-ia.github.io"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}
function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{10,150}$/.test(value);
}
function detectImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { ext: "png", type: "image/png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}
async function verifyUser(request, env) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) return null;
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(env.FIREBASE_API_KEY), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: match[1] })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const user = payload.users && payload.users[0];
  if (!user || user.disabled) return null;
  return { uid: user.localId, token: match[1] };
}
async function firestoreDocument(path, token) {
  const response = await fetch("https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents/" + path, {
    headers: { Authorization: "Bearer " + token }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("firestore_unavailable");
  return response.json();
}
async function authorizePartner(user) {
  return !!(await firestoreDocument("partenaires_logement/" + encodeURIComponent(user.uid), user.token));
}
async function authorizeAd(user, annonceId) {
  const doc = await firestoreDocument("annonces_logement/" + encodeURIComponent(annonceId), user.token);
  if (!doc) return true;
  return doc.fields && doc.fields.uid && doc.fields.uid.stringValue === user.uid;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      if (!cors["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "mon-quotidien-ci-logement" }, 200, cors);
    if (request.method === "POST" && url.pathname === "/upload") {
      if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403);
      try {
        const user = await verifyUser(request, env);
        if (!user) return json({ error: "unauthorized" }, 401, cors);
        if (!(await authorizePartner(user))) return json({ error: "partner_profile_required" }, 403, cors);
        const form = await request.formData();
        const annonceId = form.get("annonceId");
        const file = form.get("file");
        if (!validId(annonceId) || !(file instanceof File)) return json({ error: "invalid_upload" }, 400, cors);
        if (file.size < 1 || file.size > MAX_FILE_SIZE) return json({ error: "file_size_invalid" }, 413, cors);
        if (!(await authorizeAd(user, annonceId))) return json({ error: "ad_not_owned" }, 403, cors);
        const prefix = "logement_photos/" + user.uid + "/" + annonceId + "/";
        const existing = await env.LOGEMENT_PHOTOS.list({ prefix, limit: MAX_PHOTOS + 1 });
        if (existing.objects.length >= MAX_PHOTOS) return json({ error: "photo_limit_reached" }, 409, cors);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const image = detectImage(bytes);
        if (!image) return json({ error: "unsupported_image_content" }, 415, cors);
        const key = prefix + crypto.randomUUID() + "." + image.ext;
        await env.LOGEMENT_PHOTOS.put(key, bytes, {
          httpMetadata: { contentType: image.type, cacheControl: "public, max-age=31536000, immutable" }
        });
        return json({ url: new URL("/images/" + key.split("/").map(encodeURIComponent).join("/"), url.origin).toString() }, 201, cors);
      } catch (error) {
        return json({ error: error.message === "firestore_unavailable" ? "authorization_service_unavailable" : "upload_failed" }, 500, cors);
      }
    }
    if (request.method === "GET" && url.pathname.startsWith("/images/")) {
      const keyParts = url.pathname.slice("/images/".length).split("/").map(decodeURIComponent);
      if (keyParts.length !== 4 || keyParts[0] !== "logement_photos" || !validId(keyParts[1]) || !validId(keyParts[2]) || !/^[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(keyParts[3])) return json({ error: "not_found" }, 404, cors);
      const object = await env.LOGEMENT_PHOTOS.get(keyParts.join("/"));
      if (!object) return json({ error: "not_found" }, 404, cors);
      const headers = new Headers(cors);
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(object.body, { headers });
    }
    return json({ error: "not_found" }, 404, cors);
  }
};
