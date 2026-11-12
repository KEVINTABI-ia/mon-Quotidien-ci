const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("node:crypto");

admin.initializeApp();
const db = admin.firestore();
const WAVE_API_KEY = defineSecret("WAVE_API_KEY");
const WAVE_WEBHOOK_SECRET = defineSecret("WAVE_WEBHOOK_SECRET");
const WAVE_API_BASE = "https://api.wave.com";

const json = (res, status, body) => res.status(status).set("Cache-Control", "no-store").json(body);
const bearer = req => (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;

async function requireUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("Authentification requise."), { status: 401 });
  return admin.auth().verifyIdToken(token, true);
}
function safeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function verifyWaveSignature(req, secret) {
  const header = req.get("wave-signature") || "";
  const fields = Object.fromEntries(header.split(",").map(part => {
    const i = part.indexOf("="); return i < 0 ? ["", ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }));
  const timestamp = fields.t;
  const signatures = header.split(",").filter(x => x.trim().startsWith("v1=")).map(x => x.trim().slice(3));
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds < nowSeconds - 300 || timestampSeconds > nowSeconds + 30) return false;
  // Wave signs the exact raw payload: Unix timestamp immediately followed by the raw body (no separator).
  const digest = crypto.createHmac("sha256", secret).update(timestamp).update(req.rawBody).digest("hex");
  return signatures.some(signature => safeEqualHex(signature, digest));
}
async function waveRequest(path, options = {}, apiKey) {
  const response = await fetch(WAVE_API_BASE + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error("Wave API error", { status: response.status, code: body?.error || body?.message || "provider_error" });
    throw Object.assign(new Error("Le prestataire de paiement n'a pas accepté la demande."), { status: 502 });
  }
  return body;
}
function validReturnUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname === "kevintabi-ia.github.io" || u.hostname.endsWith(".monquotidien.ci"));
  } catch { return false; }
}

exports.createWaveCheckout = onRequest(
  { region: "europe-west1", secrets: [WAVE_API_KEY], cors: ["https://kevintabi-ia.github.io"] },
  async (req, res) => {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    try {
      const user = await requireUser(req);
      const { serviceId, planId, successUrl, errorUrl } = req.body || {};
      if (typeof serviceId !== "string" || typeof planId !== "string" || !validReturnUrl(successUrl) || !validReturnUrl(errorUrl)) {
        return json(res, 400, { error: "invalid_request" });
      }
      // Price and entitlement are read only from a server-managed catalogue.
      const planSnap = await db.doc("payment_catalog/" + serviceId + "/plans/" + planId).get();
      if (!planSnap.exists || planSnap.data().active !== true) return json(res, 404, { error: "plan_unavailable" });
      const plan = planSnap.data();
      if (!Number.isSafeInteger(plan.amountXof) || plan.amountXof < 100 || plan.currency !== "XOF" ||
          typeof plan.label !== "string" || !Number.isSafeInteger(plan.durationDays) || plan.durationDays < 1) {
        logger.error("Invalid server payment catalogue entry", { serviceId, planId });
        return json(res, 503, { error: "plan_configuration_invalid" });
      }
      const paymentRef = db.collection("payments").doc();
      const clientReference = "MQCI-" + paymentRef.id;
      await paymentRef.create({
        uid: user.uid, serviceId, planId, provider: "wave", amountXof: plan.amountXof,
        currency: "XOF", status: "pending", clientReference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      const checkout = await waveRequest("/v1/checkout/sessions", {
        method: "POST",
        body: JSON.stringify({
          amount: String(plan.amountXof), currency: "XOF", client_reference: clientReference,
          success_url: successUrl, error_url: errorUrl
        })
      }, WAVE_API_KEY.value());
      if (!checkout.id || !checkout.wave_launch_url) throw new Error("Réponse Wave incomplète.");
      await paymentRef.update({
        providerCheckoutId: checkout.id,
        checkoutUrl: checkout.wave_launch_url,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return json(res, 201, { paymentId: paymentRef.id, checkoutUrl: checkout.wave_launch_url });
    } catch (error) {
      logger.warn("createWaveCheckout rejected", { status: error.status || 500, message: error.message });
      return json(res, error.status || 500, { error: error.status ? "request_rejected" : "payment_initialization_failed" });
    }
  }
);

exports.waveWebhook = onRequest(
  { region: "europe-west1", secrets: [WAVE_API_KEY, WAVE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== "POST") return res.sendStatus(405);
    if (!verifyWaveSignature(req, WAVE_WEBHOOK_SECRET.value())) return res.sendStatus(401);
    let event;
    try { event = JSON.parse(req.rawBody.toString("utf8")); } catch { return res.sendStatus(400); }
    const checkoutId = event?.data?.id || event?.id;
    const eventId = event?.id || crypto.createHash("sha256").update(req.rawBody).digest("hex");
    if (typeof checkoutId !== "string" || typeof eventId !== "string") return res.sendStatus(400);
    try {
      const receiptRef = db.collection("payment_webhooks").doc("wave_" + eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140));
      const prior = await receiptRef.get();
      if (prior.exists) return res.sendStatus(200);
      const checkout = await waveRequest("/v1/checkout/sessions/" + encodeURIComponent(checkoutId), { method: "GET" }, WAVE_API_KEY.value());
      const clientReference = checkout.client_reference;
      if (typeof clientReference !== "string" || !clientReference.startsWith("MQCI-")) {
        await receiptRef.create({ provider: "wave", eventId, checkoutId, outcome: "ignored", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.sendStatus(200);
      }
      const paymentId = clientReference.slice(5);
      const paymentRef = db.collection("payments").doc(paymentId);
      await db.runTransaction(async tx => {
        const [paymentSnap, receiptSnap] = await Promise.all([tx.get(paymentRef), tx.get(receiptRef)]);
        if (receiptSnap.exists) return;
        if (!paymentSnap.exists) {
          tx.create(receiptRef, { provider: "wave", eventId, checkoutId, outcome: "unmatched", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        const p = paymentSnap.data();
        const success = checkout.payment_status === "succeeded" && checkout.checkout_status === "complete";
        const amount = Number(checkout.amount);
        const valid = p.provider === "wave" && p.providerCheckoutId === checkoutId &&
          p.clientReference === clientReference && checkout.currency === "XOF" &&
          Number.isSafeInteger(amount) && amount === p.amountXof;
        if (!valid) {
          tx.update(paymentRef, { status: "review_required", reviewReason: "provider_data_mismatch", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          tx.create(receiptRef, { provider: "wave", eventId, checkoutId, outcome: "mismatch", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        if (success && p.status !== "succeeded") {
          const subRef = db.collection("subscriptions").doc(p.uid + "_" + p.serviceId);
          // Firestore transactions require every read to happen before the first write.
          const subSnap = await tx.get(subRef);
          const now = admin.firestore.Timestamp.now();
          const oldEnd = subSnap.exists ? subSnap.data().endAt : null;
          const renewingEarly = !!oldEnd && oldEnd.toMillis() > now.toMillis();
          const base = renewingEarly ? oldEnd.toMillis() : now.toMillis();
          const endAt = admin.firestore.Timestamp.fromMillis(base + p.durationDays * 86400000);
          tx.update(paymentRef, {
            status: "succeeded", providerTransactionId: checkout.transaction_id || null,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          tx.set(subRef, {
            uid: p.uid, serviceId: p.serviceId, planId: p.planId, status: "active",
            startAt: renewingEarly ? subSnap.data().startAt : now,
            endAt, lastPaymentId: paymentId, updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        tx.create(receiptRef, { provider: "wave", eventId, checkoutId, outcome: success ? "processed" : "not_paid", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      return res.sendStatus(200);
    } catch (error) {
      logger.error("Wave webhook processing failed", { message: error.message });
      return res.sendStatus(500);
    }
  }
);

exports.getPaymentStatus = onRequest(
  { region: "europe-west1", cors: ["https://kevintabi-ia.github.io"] },
  async (req, res) => {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    try {
      const user = await requireUser(req);
      const paymentId = req.query.paymentId;
      if (typeof paymentId !== "string" || !/^[A-Za-z0-9_-]{15,40}$/.test(paymentId)) return json(res, 400, { error: "invalid_payment_id" });
      const snap = await db.collection("payments").doc(paymentId).get();
      if (!snap.exists || snap.data().uid !== user.uid) return json(res, 404, { error: "payment_not_found" });
      const p = snap.data();
      return json(res, 200, { paymentId, status: p.status, serviceId: p.serviceId, amountXof: p.amountXof, currency: p.currency });
    } catch (error) {
      return json(res, error.status || 500, { error: "status_unavailable" });
    }
  }
);
