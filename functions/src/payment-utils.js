const crypto = require("node:crypto");

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" ||
      !/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifyJekoSignature(header, rawBody, secret) {
  if (typeof header !== "string" || !Buffer.isBuffer(rawBody) ||
      typeof secret !== "string" || !secret || !/^[a-f0-9]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(header, expected);
}

function xofToJekoAmountCents(amountXof) {
  if (!Number.isSafeInteger(amountXof) || amountXof < 1 || amountXof > 10000000) {
    throw new TypeError("Montant XOF invalide.");
  }
  const amountCents = amountXof * 100;
  if (!Number.isSafeInteger(amountCents) || amountCents % 100 !== 0) {
    throw new TypeError("Montant Jèko invalide.");
  }
  return amountCents;
}

function addMonthsClamped(date, months) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) ||
      !Number.isSafeInteger(months) || months < 0) throw new TypeError("Intervalle de date invalide.");
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

module.exports = { safeEqualHex, verifyJekoSignature, xofToJekoAmountCents, addMonthsClamped };
