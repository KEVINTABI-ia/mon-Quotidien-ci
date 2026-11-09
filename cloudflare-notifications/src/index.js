const API = "https://firestore.googleapis.com/v1";
const FCM = "https://fcm.googleapis.com/v1";

let cachedAccessToken = null;
let cachedAccessTokenUntil = 0;

function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object" && value.timestampValue) return value;
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, firestoreValue(v)])) } };
}

function plainValue(value) {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(plainValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, plainValue(v)]));
  return undefined;
}

function documentData(doc) {
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, plainValue(v)]));
}

async function accessToken(env) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenUntil) return cachedAccessToken;
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + b64url(new Uint8Array(signature));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Google OAuth: " + (result.error_description || result.error || response.status));
  cachedAccessToken = result.access_token;
  cachedAccessTokenUntil = Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000;
  return cachedAccessToken;
}

async function fsRequest(env, token, path, options = {}) {
  const response = await fetch(API + "/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents" + path, {
    ...options,
    headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Firestore " + response.status + ": " + JSON.stringify(body.error || body));
  return body;
}

async function queryCollection(env, token, collectionId, uid, afterName = null, limit = 20) {
  const filters = uid ? {
    fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } }
  } : null;
  const structuredQuery = {
    from: [{ collectionId }],
    ...(filters ? { where: filters } : {}),
    orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
    ...(afterName ? { startAt: { values: [{ referenceValue: afterName }], before: false } } : {}),
    limit
  };
  const rows = await fsRequest(env, token, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery })
  });
  return rows.map(row => row.document).filter(Boolean);
}

async function patchFields(env, token, docPath, fields, updateTime) {
  const params = new URLSearchParams();
  for (const field of Object.keys(fields)) params.append("updateMask.fieldPaths", field);
  if (updateTime) params.set("currentDocument.updateTime", updateTime);
  const response = await fetch(API + "/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + docPath + "?" + params, {
    method: "PATCH",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, firestoreValue(v)])) })
  });
  if (response.status === 409 || response.status === 412) return false;
  if (!response.ok) throw new Error("Firestore PATCH " + response.status + ": " + await response.text());
  return true;
}

async function sendToDevice(env, token, deviceToken, title, body, eventData) {
  const response = await fetch(FCM + "/projects/" + env.FIREBASE_PROJECT_ID + "/messages:send", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(eventData || {}).filter(([k, v]) => typeof v === "string").slice(0, 10)),
        webpush: { notification: { title, body, icon: "/mon-transport-ci/icon-transport-ci.svg" } }
      }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = JSON.stringify(result.error || result);
    const invalid = response.status === 404 || (response.status === 400 && /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(message));
    return { ok: false, invalid, error: message.slice(0, 700) };
  }
  return { ok: true };
}

async function dispatch(env) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Secrets FIREBASE_PROJECT_ID et FIREBASE_SERVICE_ACCOUNT_JSON manquants.");
  const token = await accessToken(env);
  const queue = await queryCollection(env, token, "notifications_queue");
  // One event per invocation keeps the Free-plan subrequest budget predictable.
  const pending = queue.filter(doc => documentData(doc).status === "pending").slice(0, 1);
  let processed = 0;
  for (const doc of pending) {
    const data = documentData(doc);
    const docPath = doc.name.split("/documents/")[1];
    const locked = await patchFields(env, token, docPath, {
      status: "processing",
      processedAt: new Date().toISOString()
    }, doc.updateTime);
    if (!locked) continue;
    try {
      const title = String(data.title || "").trim().slice(0, 80);
      const body = String(data.body || "").trim().slice(0, 220);
      if (!title || !body) throw new Error("Titre ou message manquant.");
      // Page recipients in small batches: each device needs one FCM request and
      // may need one deletion request if its registration token has expired.
      const devices = await queryCollection(env, token, "appareils_notifications", data.targetUid || null, data.lastDeviceName || null, 20);
      let sent = Number(data.sentCount || 0);
      let removed = Number(data.removedTokenCount || 0);
      for (const device of devices) {
        const d = documentData(device);
        if (!d.token || !d.uid) continue;
        const result = await sendToDevice(env, token, d.token, title, body, data.data || {});
        if (result.ok) sent++;
        else if (result.invalid) {
          const devicePath = device.name.split("/documents/")[1];
          await fetch(API + "/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + devicePath, {
            method: "DELETE", headers: { authorization: "Bearer " + token }
          });
          removed++;
        }
      }
      const moreRecipientsMayExist = devices.length === 20;
      await patchFields(env, token, docPath, moreRecipientsMayExist ? {
        status: "pending",
        lastDeviceName: devices[devices.length - 1].name,
        sentCount: sent,
        removedTokenCount: removed
      } : {
        status: "sent",
        sentCount: sent,
        removedTokenCount: removed,
        completedAt: new Date().toISOString()
      });
      processed++;
    } catch (error) {
      await patchFields(env, token, docPath, {
        status: "failed",
        error: String(error.message || error).slice(0, 500),
        completedAt: new Date().toISOString()
      });
    }
  }
  return { processed, found: pending.length };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatch(env).catch(error => console.error("Notification dispatcher:", error)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "mon-quotidien-ci-notifications", mode: "scheduled" });
    }
    if (request.method === "POST" && url.pathname === "/dispatch") {
      if (!env.DISPATCH_SECRET || request.headers.get("authorization") !== "Bearer " + env.DISPATCH_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        return Response.json({ ok: true, ...(await dispatch(env)) });
      } catch (error) {
        console.error(error);
        return Response.json({ ok: false, error: String(error.message || error) }, { status: 500 });
      }
    }
    return new Response("Not found", { status: 404 });
  }
};
