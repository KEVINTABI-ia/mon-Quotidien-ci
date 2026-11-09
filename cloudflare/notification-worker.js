const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ADMIN_COLLECTION = "notifications_queue";

function b64url(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}

async function googleAccessToken(env, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)
  ));
  const assertion = unsigned + "." + b64url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error("Google OAuth a répondu HTTP " + response.status);
  return (await response.json()).access_token;
}

async function firestoreRunQuery(env, accessToken, structuredQuery) {
  const url = "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(env.FIREBASE_PROJECT_ID) +
    "/databases/(default)/documents:runQuery";
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery })
  });
  if (!response.ok) throw new Error("Firestore runQuery HTTP " + response.status);
  return response.json();
}

function valueOf(fields, name) {
  const value = fields && fields[name];
  if (!value) return undefined;
  return value.stringValue ?? value.integerValue ?? value.booleanValue;
}

async function sendToDevice(projectId, accessToken, token, title, body, eventId) {
  const response = await fetch(
    "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send",
    {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { eventId: String(eventId), source: "mon-quotidien-ci" },
          webpush: { fcmOptions: { link: "https://kevintabi-ia.github.io/mon-transport-ci/" } }
        }
      })
    }
  );
  return response.ok;
}

async function markEvent(env, accessToken, documentName, status) {
  const url = "https://firestore.googleapis.com/v1/" + documentName +
    "?updateMask.fieldPaths=status&updateMask.fieldPaths=processedAt";
  const response = await fetch(url, {
    method: "PATCH",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        status: { stringValue: status },
        processedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });
  if (!response.ok) throw new Error("Mise à jour Firestore impossible : HTTP " + response.status);
}

async function processQueue(env) {
  const token = await googleAccessToken(env, FIRESTORE_SCOPE + " " + FCM_SCOPE);
  const rows = await firestoreRunQuery(env, token, {
    from: [{ collectionId: ADMIN_COLLECTION }],
    where: { fieldFilter: {
      field: { fieldPath: "status" },
      op: "EQUAL",
      value: { stringValue: "pending" }
    }},
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: 25
  });

  let processed = 0;
  for (const row of rows) {
    const doc = row.document;
    if (!doc) continue;
    const fields = doc.fields || {};
    const uid = valueOf(fields, "recipientUid");
    const title = valueOf(fields, "title");
    const body = valueOf(fields, "body");
    const eventId = doc.name.split("/").pop();
    if (!uid || !title || !body || title.length > 100 || body.length > 240) {
      await markEvent(env, token, doc.name, "invalid");
      continue;
    }

    const devices = await firestoreRunQuery(env, token, {
      from: [{ collectionId: "appareils_notifications" }],
      where: { fieldFilter: {
        field: { fieldPath: "uid" },
        op: "EQUAL",
        value: { stringValue: uid }
      }},
      limit: 30
    });

    let sent = 0;
    for (const device of devices) {
      const deviceDoc = device.document;
      const fcmToken = deviceDoc && valueOf(deviceDoc.fields, "token");
      if (fcmToken && await sendToDevice(env.FIREBASE_PROJECT_ID, token, fcmToken, title, body, eventId)) sent++;
    }
    await markEvent(env, token, doc.name, sent ? "sent" : "no_device");
    processed++;
  }
  return { processed };
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 });
    const checks = {
      hasProjectId: typeof env.FIREBASE_PROJECT_ID === "string" && env.FIREBASE_PROJECT_ID.trim().length > 0,
      hasClientEmail: typeof env.FIREBASE_CLIENT_EMAIL === "string" && env.FIREBASE_CLIENT_EMAIL.trim().length > 0,
      hasPrivateKey: typeof env.FIREBASE_PRIVATE_KEY === "string" && env.FIREBASE_PRIVATE_KEY.trim().length > 0
    };
    const configured = Object.values(checks).every(Boolean);
    return Response.json({ service: "mqci-notification-relay", configured, checks });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(processQueue(env).catch(error => {
      console.error(JSON.stringify({ event: "notification_queue_failed", message: error.message }));
    }));
  }
};
