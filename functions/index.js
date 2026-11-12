const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("node:crypto");

admin.initializeApp();
const db = admin.firestore();
const WAVE_API_KEY = defineSecret("WAVE_API_KEY");
const WAVE_WEBHOOK_SECRET = defineSecret("WAVE_WEBHOOK_SECRET");
const APP_BASE_URL = defineString("APP_BASE_URL", { default: "https://kevintabi-ia.github.io/mon-Quotidien-ci/" });
const ALLOWED_ORIGINS = ["https://kevintabi-ia.github.io"];

const cors = (req, res) => {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
    res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
  return false;
};
const sendError = (res, status, code, message) => res.status(status).json({ ok: false, code, message });
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a), "utf8"), bb = Buffer.from(String(b), "utf8");
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};
async function authenticatedUser(req) {
  const match = /^Bearer (.+)$/i.exec(req.get("authorization") || "");
  if (!match) throw Object.assign(new Error("Authentification requise."), { status: 401 });
  return admin.auth().verifyIdToken(match[1], true);
}
function verifyWaveSignature(header, rawBody, secret) {
  if (!header || !Buffer.isBuffer(rawBody)) return false;
  const fields = Object.fromEntries(header.split(",").map(part => {
    const i = part.indexOf("="); return i < 0 ? ["", ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }));
  const timestamp = Number(fields.t);
  if (!Number.isInteger(timestamp) || !fields.v1 || !/^[a-f0-9]{64}$/i.test(fields.v1)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (timestamp < now - 300 || timestamp > now + 30) return false;
  const expected = crypto.createHmac("sha256", secret).update(String(timestamp)).update(rawBody).digest("hex");
  return safeEqual(expected.toLowerCase(), fields.v1.toLowerCase());
}
function addCalendarMonths(date, months) {
  const d = new Date(date), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}
async function verifyWaveCheckout(checkoutId) {
  const response = await fetch("https://api.wave.com/v1/checkout/sessions/" + encodeURIComponent(checkoutId), {
    headers: { Authorization: "Bearer " + WAVE_API_KEY.value() }
  });
  if (!response.ok) throw new Error("Wave status inquiry failed: HTTP " + response.status);
  return response.json();
}
async function activateVerifiedPayment(paymentId, checkout, eventId) {
  const paymentRef = db.collection("payments").doc(paymentId);
  const eventRef = db.collection("payment_webhook_events").doc(eventId);
  await db.runTransaction(async tx => {
    const paymentSnap = await tx.get(paymentRef);
    const eventSnap = await tx.get(eventRef);
    if (eventSnap.exists) return;
    if (!paymentSnap.exists) throw new Error("Payment reference not found.");
    const payment = paymentSnap.data();
    if (payment.provider !== "wave" || payment.providerCheckoutId !== checkout.id ||
        payment.amountXof !== Number(checkout.amount) || checkout.currency !== "XOF" ||
        checkout.payment_status !== "succeeded" || checkout.checkout_status !== "complete" ||
        checkout.client_reference !== paymentId) {
      throw new Error("Provider checkout does not match the internal payment.");
    }
    tx.create(eventRef, { provider: "wave", paymentId, receivedAt: admin.firestore.FieldValue.serverTimestamp(), processed: true });
    if (payment.status === "succeeded") return;
    if (payment.status !== "pending") throw new Error("Payment is not in a payable state.");
    const subRef = db.collection("subscriptions").doc(payment.uid + "_" + payment.service);
    const subSnap = await tx.get(subRef);
    const now = new Date();
    const previousEnd = subSnap.exists ? subSnap.data().endAt?.toDate() : null;
    const baseDate = subSnap.exists && subSnap.data().status === "active" && previousEnd > now ? previousEnd : now;
    const endAt = addCalendarMonths(baseDate, payment.durationMonths);
    tx.update(paymentRef, {
      status: "succeeded", providerTransactionId: checkout.transaction_id || null,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.set(subRef, {
      uid: payment.uid, service: payment.service, plan: payment.plan, status: "active", currency: "XOF",
      endAt: admin.firestore.Timestamp.fromDate(endAt), lastPaymentId: paymentId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: subSnap.exists ? subSnap.data().createdAt : admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

exports.createPayment = onRequest({ region: "europe-west1", cors: ALLOWED_ORIGINS, secrets: [WAVE_API_KEY] }, async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Méthode non autorisée.");
  try {
    const user = await authenticatedUser(req);
    const { service, plan, provider } = req.body || {};
    if (!["wave", "orange_money"].includes(provider)) return sendError(res, 400, "INVALID_PROVIDER", "Opérateur non pris en charge.");
    if (provider === "orange_money") return sendError(res, 501, "ORANGE_API_NOT_CONFIGURED", "L’activation Orange Money nécessite les identifiants et la documentation marchand Orange CI.");
    if (typeof service !== "string" || typeof plan !== "string" ||
        !/^[a-z0-9_-]{2,60}$/i.test(service) || !/^[a-z0-9_-]{2,40}$/i.test(plan)) {
      return sendError(res, 400, "INVALID_PLAN", "Service ou formule invalide.");
    }
    const catalogId = service + "_" + plan;
    const catalogSnap = await db.collection("payment_catalog").doc(catalogId).get();
    if (!catalogSnap.exists || catalogSnap.data().active !== true) return sendError(res, 400, "PLAN_UNAVAILABLE", "Cette formule n’est pas ouverte au paiement.");
    const item = catalogSnap.data();
    if (!Number.isSafeInteger(item.amountXof) || item.amountXof < 100 || item.amountXof > 10000000 ||
        !Number.isInteger(item.durationMonths) || item.durationMonths < 1 || item.durationMonths > 24) {
      logger.error("Invalid server-side payment catalog entry", { catalogId });
      return sendError(res, 503, "PLAN_MISCONFIGURED", "Formule momentanément indisponible.");
    }
    const paymentId = "MQCI_" + crypto.randomUUID().replace(/-/g, "");
    const paymentRef = db.collection("payments").doc(paymentId);
    await paymentRef.create({
      uid: user.uid, email: user.email || null, provider: "wave", service, plan,
      amountXof: item.amountXof, currency: "XOF", durationMonths: item.durationMonths,
      status: "pending", createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const base = APP_BASE_URL.value().replace(/\/?$/, "/");
    const response = await fetch("https://api.wave.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + WAVE_API_KEY.value(), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: String(item.amountXof), currency: "XOF", client_reference: paymentId,
        success_url: base + "?payment=return&reference=" + encodeURIComponent(paymentId),
        error_url: base + "?payment=error&reference=" + encodeURIComponent(paymentId)
      })
    });
    const checkout = await response.json();
    if (!response.ok || !checkout.id || !checkout.wave_launch_url) {
      await paymentRef.update({ status: "provider_error", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      logger.error("Wave checkout creation failed", { status: response.status, paymentId });
      return sendError(res, 502, "PROVIDER_ERROR", "Wave ne peut pas créer le paiement pour le moment.");
    }
    await paymentRef.update({ providerCheckoutId: checkout.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ ok: true, paymentId, checkoutUrl: checkout.wave_launch_url, amountXof: item.amountXof, currency: "XOF" });
  } catch (error) {
    logger.error("createPayment failed", { message: error.message });
    return sendError(res, error.status || 500, "PAYMENT_CREATION_FAILED", error.status ? error.message : "Impossible de préparer le paiement.");
  }
});

exports.waveWebhook = onRequest({ region: "europe-west1", secrets: [WAVE_API_KEY, WAVE_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const rawBody = req.rawBody;
  if (!verifyWaveSignature(req.get("wave-signature"), rawBody, WAVE_WEBHOOK_SECRET.value())) return res.status(401).send("Invalid signature");
  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); }
  catch (_) { return res.status(400).send("Invalid JSON"); }
  if (!event || typeof event.id !== "string" || !event.id || !event.data?.id) return res.status(400).send("Invalid event");
  try {
    if (event.type !== "checkout.session.completed") return res.status(200).send("Ignored");
    const checkout = await verifyWaveCheckout(event.data.id);
    const paymentId = checkout.client_reference;
    if (typeof paymentId !== "string" || !paymentId.startsWith("MQCI_")) return res.status(200).send("Unmatched checkout");
    await activateVerifiedPayment(paymentId, checkout, event.id);
    return res.status(200).send("OK");
  } catch (error) {
    logger.error("Wave webhook processing failed", { eventId: event.id, message: error.message });
    return res.status(500).send("Retry later");
  }
});

exports.getPaymentStatus = onRequest({ region: "europe-west1", cors: ALLOWED_ORIGINS }, async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "GET") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Méthode non autorisée.");
  try {
    const user = await authenticatedUser(req);
    const paymentId = String(req.query.reference || "");
    const snap = await db.collection("payments").doc(paymentId).get();
    if (!snap.exists || snap.data().uid !== user.uid) return sendError(res, 404, "NOT_FOUND", "Paiement introuvable.");
    const p = snap.data();
    return res.status(200).json({ ok: true, paymentId, status: p.status, amountXof: p.amountXof, currency: p.currency });
  } catch (error) {
    return sendError(res, error.status || 500, "STATUS_CHECK_FAILED", error.status ? error.message : "Vérification impossible.");
  }
});
