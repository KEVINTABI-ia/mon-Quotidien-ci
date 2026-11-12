const crypto = require("node:crypto");

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" ||
      !/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function verifyWaveSignature(header, rawBody, secret, nowMs = Date.now()) {
  if (typeof header !== "string" || !Buffer.isBuffer(rawBody) ||
      typeof secret !== "string" || !secret) return false;
  const fields = header.split(",").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? ["", ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  const seconds = Number(timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < nowSeconds - 300 || seconds > nowSeconds + 30) return false;
  const digest = crypto.createHmac("sha256", secret).update(timestamp).update(rawBody).digest("hex");
  return signatures.some(signature => safeEqualHex(signature, digest));
}

function addMonthsClamped(date, months) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) ||
      !Number.isSafeInteger(months) || months < 0) throw new TypeError("Invalid date or month interval");
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

module.exports = { safeEqualHex, verifyWaveSignature, addMonthsClamped };
