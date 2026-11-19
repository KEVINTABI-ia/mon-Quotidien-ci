const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const { verifyJekoSignature, xofToJekoAmountCents, addMonthsClamped } = require("./payment-utils");

admin.initializeApp();
const db = admin.firestore();
const JEKO_API_KEY = defineSecret("JEKO_API_KEY");
const JEKO_API_KEY_ID = defineSecret("JEKO_API_KEY_ID");
const JEKO_STORE_ID = defineSecret("JEKO_STORE_ID");
const JEKO_WEBHOOK_SECRET = defineSecret("JEKO_WEBHOOK_SECRET");
const JEKO_API_BASE = "https://api.jeko.africa";
const APP_RETURN_URL = "https://kevintabi-ia.github.io/mon-Quotidien-ci/";

const json = (res, status, body) => res.status(status).set("Cache-Control", "no-store").json(body);
const bearer = req => (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;

async function requireUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("Authentification requise."), { status: 401 });
  return admin.auth().verifyIdToken(token, true);
}

async function jekoRequest(path, options = {}) {
  const response = await fetch(JEKO_API_BASE + path, {
    ...options,
    headers: {
      "X-API-KEY": JEKO_API_KEY.value(),
      "X-API-KEY-ID": JEKO_API_KEY_ID.value(),
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error("Jèko API error", { status: response.status, code: body?.error || body?.message || "provider_error" });
    throw Object.assign(new Error("Jèko n'a pas accepté la demande de paiement."), { status: 502 });
  }
  return body;
}

function tarifAutomobiliste(config) {
  const active = config.actif !== false;
  const duration = Number(config.duree ?? 12);
  const unit = config.unite || "mois";
  const basePrice = Number(config.prix ?? 1000);
  if (!active) throw Object.assign(new Error("plan_unavailable"), { status: 409 });
  if (duration !== 12 || unit !== "mois" || !Number.isSafeInteger(basePrice) || basePrice < 1 || basePrice > 10000000) {
    throw Object.assign(new Error("plan_configuration_invalid"), { status: 503 });
  }
  const now = new Date();
  const promoStart = config.promotionDebut ? new Date(config.promotionDebut + "T00:00:00") : null;
  const promoEnd = config.promotionFin ? new Date(config.promotionFin + "T23:59:59") : null;
  const promoPrice = Number(config.promotionPrix || 0);
  const promoActive = config.promotionActive === true && promoPrice > 0 && promoPrice <= basePrice &&
    promoStart && promoEnd && now >= promoStart && now <= promoEnd;
  return promoActive ? promoPrice : basePrice;
}

exports.createJekoCheckout = onRequest(
  { region: "europe-west1", secrets: [JEKO_API_KEY, JEKO_API_KEY_ID, JEKO_STORE_ID], cors: ["https://kevintabi-ia.github.io"] },
  async (req, res) => {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    let paymentRef = null;
    try {
      const user = await requireUser(req);
      const { paymentMethod = "wave" } = req.body || {};
      const methods = ["orange", "wave", "mtn", "moov", "djamo", "jeko"];
      if (!methods.includes(paymentMethod)) return json(res, 400, { error: "invalid_payment_method" });

      const configSnap = await db.doc("configuration_abonnements/globale").get();
      const config = configSnap.exists ? (configSnap.data().services || {}).automobiliste || {} : {};
      const amountXof = tarifAutomobiliste(config);
      const amountCents = xofToJekoAmountCents(amountXof);

      paymentRef = db.collection("payments").doc();
      const reference = "MQCI-" + paymentRef.id;
      await paymentRef.create({
        uid: user.uid, serviceId: "automobiliste", planId: "annuel", provider: "jeko",
        amountXof, currency: "XOF", durationMonths: 12, status: "pending", clientReference: reference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const successUrl = new URL(APP_RETURN_URL);
      successUrl.searchParams.set("payment", "return");
      successUrl.searchParams.set("paymentId", paymentRef.id);
      const errorUrl = new URL(APP_RETURN_URL);
      errorUrl.searchParams.set("payment", "error");
      errorUrl.searchParams.set("paymentId", paymentRef.id);
      const checkout = await jekoRequest("/partner_api/payment_requests", {
        method: "POST",
        body: JSON.stringify({
          storeId: JEKO_STORE_ID.value(), amountCents, currency: "XOF", reference,
          paymentDetails: {
            type: "redirect",
            data: { paymentMethod, successUrl: successUrl.toString(), errorUrl: errorUrl.toString() }
          }
        })
      });
      if (typeof checkout.id !== "string" || checkout.reference !== reference ||
          checkout.storeId !== JEKO_STORE_ID.value() || checkout.status !== "pending" ||
          typeof checkout.storeId !== "string" || typeof checkout.redirectUrl !== "string" || !/^https:\/\/\//i.test(checkout.redirectUrl)) {
        throw new Error("Réponse Jèko incomplète ou incohérente.");
      }
      await paymentRef.update({
        providerPaymentRequestId: checkout.id, checkoutUrl: checkout.redirectUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return json(res, 201, { paymentId: paymentRef.id, checkoutUrl: checkout.redirectUrl });
    } catch (error) {
      if (paymentRef) {
        try {
          await paymentRef.set({
            status: "failed",
            initializationError: error.status ? "provider_rejected" : "provider_unavailable",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (writeError) {
          logger.error("Could not mark failed Jèko checkout", { paymentId: paymentRef.id });
        }
      }
      logger.warn("createJekoCheckout rejected", { status: error.status || 500, message: error.message });
      return json(res, error.status || 500, { error: error.status ? error.message : "payment_initialization_failed" });
    }
  }
);

exports.jekoWebhook = onRequest(
  { region: "europe-west1", secrets: [JEKO_WEBHOOK_SECRET, JEKO_STORE_ID], cors: false },
  async (req, res) => {
    if (req.method !== "POST") return res.sendStatus(405);
    if (!verifyJekoSignature(req.get("jeko-signature") || "", req.rawBody, JEKO_WEBHOOK_SECRET.value())) return res.sendStatus(401);
    const eventName = req.get("jeko-event") || "";
    const version = req.get("jeko-webhook-version") || "";
    if (!version || !/^[a-zA-Z0-9._-]{1,40}$/.test(version)) return res.sendStatus(400);
    let transaction;
    try { transaction = JSON.parse(req.rawBody.toString("utf8")); } catch { return res.sendStatus(400); }
    if (eventName !== "TRANSACTION_COMPLETED") return res.sendStatus(200);

    const details = transaction?.transactionDetails || {};
    const reference = details.reference;
    const transactionId = transaction?.id;
    const requestId = details.id;
    if (typeof transactionId !== "string" || typeof reference !== "string" || typeof requestId !== "string") return res.sendStatus(400);
    if (!reference.startsWith("MQCI-")) return res.sendStatus(200);

    try {
      const paymentId = reference.slice(5);
      const paymentRef = db.collection("payments").doc(paymentId);
      const receiptKey = crypto.createHash("sha256").update(transactionId).digest("hex");
      const receiptRef = db.collection("payment_webhooks").doc("jeko_" + receiptKey);
      await db.runTransaction(async tx => {
        const [paymentSnap, receiptSnap] = await Promise.all([tx.get(paymentRef), tx.get(receiptRef)]);
        if (receiptSnap.exists) return;
        if (!paymentSnap.exists) {
          tx.create(receiptRef, { provider: "jeko", eventName, transactionId, outcome: "unmatched", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        const payment = paymentSnap.data();
        const amountXof = transaction?.amount?.amount;
        const commonValid = payment.provider === "jeko" && payment.clientReference === reference &&
          payment.providerPaymentRequestId === requestId && transaction.storeId === JEKO_STORE_ID.value() &&
          transaction.transactionType === "payment" && transaction.amount?.currency === "XOF" &&
          Number.isSafeInteger(amountXof) && amountXof === payment.amountXof;
        if (!commonValid) {
          tx.update(paymentRef, { status: "review_required", reviewReason: "provider_data_mismatch", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          tx.create(receiptRef, { provider: "jeko", eventName, transactionId, outcome: "mismatch", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        if (transaction.status === "error") {
          if (payment.status !== "succeeded") tx.update(paymentRef, { status: "failed", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          tx.create(receiptRef, { provider: "jeko", eventName, transactionId, outcome: "failed", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        if (transaction.status !== "success") {
          tx.create(receiptRef, { provider: "jeko", eventName, transactionId, outcome: "ignored_status", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }
        if (payment.status !== "succeeded") {
          const subscriptionRef = db.collection("abonnements_automobiliste").doc(payment.uid);
          const subscriptionSnap = await tx.get(subscriptionRef);
          const now = admin.firestore.Timestamp.now();
          const oldEnd = subscriptionSnap.exists ? subscriptionSnap.data().dateExpiration : null;
          const renewingEarly = !!oldEnd && oldEnd.toMillis() > now.toMillis();
          const baseDate = renewingEarly ? oldEnd.toDate() : now.toDate();
          const endAt = admin.firestore.Timestamp.fromDate(addMonthsClamped(baseDate, 12));
          tx.update(paymentRef, {
            status: "succeeded", providerTransactionId: transactionId,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          tx.set(subscriptionRef, {
            uid: payment.uid, statut: "actif", montantFCFA: payment.amountXof, dureeMois: 12,
            dateActivation: renewingEarly && subscriptionSnap.exists ? subscriptionSnap.data().dateActivation || now : now,
            dateExpiration: endAt, paymentId, operateur: "Jèko"
          }, { merge: true });
        }
        tx.create(receiptRef, { provider: "jeko", eventName, transactionId, outcome: "processed", receivedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      return res.sendStatus(200);
    } catch (error) {
      logger.error("Jèko webhook processing failed", { message: error.message });
      return res.sendStatus(500);
    }
  }
);

exports.getJekoPaymentStatus = onRequest(
  { region: "europe-west1", cors: ["https://kevintabi-ia.github.io"] },
  async (req, res) => {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    try {
      const user = await requireUser(req);
      const paymentId = req.query.paymentId;
      if (typeof paymentId !== "string" || !/^[A-Za-z0-9_-]{15,40}$/.test(paymentId)) return json(res, 400, { error: "invalid_payment_id" });
      const snap = await db.collection("payments").doc(paymentId).get();
      if (!snap.exists || snap.data().uid !== user.uid || snap.data().provider !== "jeko") return json(res, 404, { error: "payment_not_found" });
      const payment = snap.data();
      return json(res, 200, { paymentId, status: payment.status, amountXof: payment.amountXof, currency: payment.currency });
    } catch (error) {
      return json(res, error.status || 500, { error: "status_unavailable" });
    }
  }
);
