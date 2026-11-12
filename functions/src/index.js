const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const { verifyWaveSignature: verifyWaveSignatureHeader, addMonthsClamped } = require("./payment-utils");

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
function verifyWaveSignature(req, secret) {
  return verifyWaveSignatureHeader(req.get("wave-signature") || "", req.rawBody, secret);
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
    return u.origin === "https://kevintabi-ia.github.io" && u.pathname.startsWith("/mon-Quotidien-ci/");
  } catch { return false; }
}

exports.createWaveCheckout = onRequest(
  { region: "europe-west1", secrets: [WAVE_API_KEY], cors: ["https://kevintabi-ia.github.io"] },
  async (req, res) => {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    let createdPaymentRef = null;
    try {
      const user = await requireUser(req);
      const { serviceId, planId, successUrl, errorUrl } = req.body || {};
      if (typeof serviceId !== "string" || typeof planId !== "string" ||
          !/^[a-z0-9_-]{2,60}$/i.test(serviceId) || !/^[a-z0-9_-]{2,40}$/i.test(planId) ||
          !validReturnUrl(successUrl) || !validReturnUrl(errorUrl)) {
        return json(res, 400, { error: "invalid_request" });
      }
      // The first rollout reuses the existing administrator-controlled automotive subscription settings.
      // Other services remain on the dedicated server-managed payment catalogue.
      let plan;
      if (serviceId === "automobiliste" && planId === "annuel") {
        const configSnap = await db.doc("configuration_abonnements/globale").get();
        const config = configSnap.exists ? (configSnap.data().services || {}).automobiliste || {} : {};
        const active = config.actif !== false;
        const durationMonths = Number(config.duree ?? 12);
        const unit = config.unite || "mois";
        const basePrice = Number(config.prix ?? 1000);
        if (!active) return json(res, 409, { error: "plan_unavailable" });
        if (durationMonths !== 12 || unit !== "mois" ||
            !Number.isSafeInteger(basePrice) || basePrice < 100 || basePrice > 10000000) {
          logger.error("Invalid automotive annual subscription configuration", { durationMonths, unit });
          return json(res, 503, { error: "plan_configuration_invalid" });
        }
        const now = new Date();
        const promoStart = config.promotionDebut ? new Date(config.promotionDebut + "T00:00:00") : null;
        const promoEnd = config.promotionFin ? new Date(config.promotionFin + "T23:59:59") : null;
        const promoPrice = Number(config.promotionPrix || 0);
        const promoActive = config.promotionActive === true && promoPrice > 0 && promoPrice <= basePrice &&
          promoStart && promoEnd && now >= promoStart && now <= promoEnd;
        plan = { active, amountXof: promoActive ? promoPrice : basePrice, currency: "XOF",
          label: "Abonnement automobiliste annuel", durationDays: 365, durationMonths: 12 };
      } else {
        const planSnap = await db.doc("payment_catalog/" + serviceId + "/plans/" + planId).get();
        if (!planSnap.exists || planSnap.data().active !== true) return json(res, 404, { error: "plan_unavailable" });
        plan = planSnap.data();
      }
      if (plan.active !== true || !Number.isSafeInteger(plan.amountXof) || plan.amountXof < 100 || plan.amountXof > 10000000 ||
          plan.currency !== "XOF" || typeof plan.label !== "string" ||
          !Number.isSafeInteger(plan.durationDays) || plan.durationDays < 1 || plan.durationDays > 3660 ||
          (serviceId === "automobiliste" && (plan.durationMonths !== 12 || plan.amountXof < 100))) {
        logger.error("Invalid server payment catalogue entry", { serviceId, planId });
        return json(res, 503, { error: "plan_configuration_invalid" });
      }
      const paymentRef = db.collection("payments").doc();
      createdPaymentRef = paymentRef;
      const clientReference = "MQCI-" + paymentRef.id;
      await paymentRef.create({
        uid: user.uid, serviceId, planId, provider: "wave", amountXof: plan.amountXof,
        durationDays: plan.durationDays, currency: "XOF", status: "pending", clientReference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      const successReturn = new URL(successUrl);
      successReturn.searchParams.set("paymentId", paymentRef.id);
      const checkout = await waveRequest("/v1/checkout/sessions", {
        method: "POST",
        body: JSON.stringify({
          amount: String(plan.amountXof), currency: "XOF", client_reference: clientReference,
          success_url: successReturn.toString(), error_url: errorUrl
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
      if (createdPaymentRef) {
        try {
          await createdPaymentRef.set({
            status: "failed",
            initializationError: error.status ? "provider_rejected" : "provider_unavailable",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (writeError) {
          logger.error("Could not mark failed checkout initialization", { paymentId: createdPaymentRef.id });
        }
      }
      logger.warn("createWaveCheckout rejected", { status: error.status || 500, message: error.message });
      return json(res, error.status || 500, { error: error.status ? "request_rejected" : "payment_initialization_failed" });
    }
  }
);

exports.waveWebhook = onRequest(
  { region: "europe-west1", secrets: [WAVE_API_KEY, WAVE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== "POST") return res.sendStatus(405);
    if (!verifyWaveSignatureHeader(req.get("wave-signature") || "", req.rawBody, WAVE_WEBHOOK_SECRET.value())) return res.sendStatus(401);
    let event;
    try { event = JSON.parse(req.rawBody.toString("utf8")); } catch { return res.sendStatus(400); }
    if (!["checkout.session.completed", "checkout.session.payment_failed"].includes(event?.type)) {
      return res.sendStatus(200);
    }
    const checkoutId = event?.data?.id;
    const eventId = event?.id;
    if (typeof checkoutId !== "string" || typeof eventId !== "string") return res.sendStatus(400);
    try {
      const receiptKey = crypto.createHash("sha256").update(eventId).digest("hex");
      const receiptRef = db.collection("payment_webhooks").doc("wave_" + receiptKey);
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
        const valid = checkout.id === checkoutId && p.provider === "wave" && (!p.providerCheckoutId || p.providerCheckoutId === checkoutId) &&
          p.clientReference === clientReference && checkout.currency === "XOF" &&
          Number.isSafeInteger(amount) && amount === p.amountXof;
        if (!valid) {
          tx.update(paymentRef, { status: "review_required", reviewReason: "provider_data_mismatch", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          tx.create(receiptRef, { provider: "wave", eventId, checkoutId, outcome: "mismatch", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        if (!success && p.status !== "succeeded" &&
          (["failed", "cancelled"].includes(checkout.payment_status) || checkout.checkout_status === "expired")) {
          tx.update(paymentRef, {
            status: checkout.checkout_status === "expired" ? "expired" : "failed",
            failureCode: checkout.last_payment_error?.code || (checkout.checkout_status === "expired" ? "checkout_expired" : "payment_failed"),
            providerPaymentStatus: checkout.payment_status || null,
            providerCheckoutStatus: checkout.checkout_status || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        if (success && p.status !== "succeeded") {
          const subRef = db.collection("subscriptions").doc(p.uid + "_" + p.serviceId);
          const legacyAutoRef = db.collection("abonnements_automobiliste").doc(p.uid);
          // Complete all transaction reads before performing any writes.
          const subSnap = await tx.get(subRef);
          const legacyAutoSnap = p.serviceId === "automobiliste" ? await tx.get(legacyAutoRef) : null;
          const now = admin.firestore.Timestamp.now();
          const oldEnd = subSnap.exists ? subSnap.data().endAt : null;
          const legacyEnd = legacyAutoSnap?.exists ? legacyAutoSnap.data().dateExpiration : null;
          const effectiveEnd = oldEnd && (!legacyEnd || oldEnd.toMillis() >= legacyEnd.toMillis()) ? oldEnd : legacyEnd;
          const renewingEarly = !!effectiveEnd && effectiveEnd.toMillis() > now.toMillis();
          const base = renewingEarly ? effectiveEnd.toMillis() : now.toMillis();
          let endAt;
          if (p.serviceId === "automobiliste") {
            endAt = admin.firestore.Timestamp.fromDate(addMonthsClamped(new Date(base), 12));
          } else {
            endAt = admin.firestore.Timestamp.fromMillis(base + p.durationDays * 86400000);
          }
          tx.update(paymentRef, {
            status: "succeeded", providerCheckoutId: checkoutId, providerTransactionId: checkout.transaction_id || null,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          tx.set(subRef, {
            uid: p.uid, serviceId: p.serviceId, planId: p.planId, status: "active",
            startAt: renewingEarly ? (subSnap.data()?.startAt || now) : now,
            endAt, lastPaymentId: paymentId, updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          if (p.serviceId === "automobiliste") {
            tx.set(legacyAutoRef, {
              uid: p.uid, statut: "actif", montantFCFA: p.amountXof, dureeMois: 12,
              dateActivation: renewingEarly && legacyAutoSnap?.exists ? legacyAutoSnap.data().dateActivation || now : now,
              dateExpiration: endAt, paymentId, operateur: "Wave"
            }, { merge: true });
          }
        }
        tx.create(receiptRef, {
          provider: "wave", eventId, checkoutId,
          outcome: success ? "processed" :
            (checkout.checkout_status === "expired" || ["failed", "cancelled"].includes(checkout.payment_status) ? "failed_or_expired" : "not_paid"),
          receivedAt: admin.firestore.FieldValue.serverTimestamp()
        });
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
