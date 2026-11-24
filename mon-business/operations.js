/**
 * Mon Business — moteur opérationnel de stock et d'approvisionnement.
 * Calculs purs, sans accès réseau ni persistance.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MonBusinessOperations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const clean = v => typeof v === "string" ? v.trim() : "";
  const MOVEMENTS = Object.freeze(["purchase", "sale", "loss", "adjustment", "transfer_in", "transfer_out"]);
  const STATUSES = Object.freeze(["draft", "requested", "approved", "ordered", "partially_received", "received", "cancelled"]);
  const validQty = n => Number.isSafeInteger(n) && n > 0;

  function validateMovement(m = {}) {
    const errors = [];
    for (const key of ["businessId", "activityId", "itemId", "unit", "authorUid", "reference"]) {
      if (!clean(m[key])) errors.push(key);
    }
    if (!MOVEMENTS.includes(m.type)) errors.push("type");
    if (!validQty(m.quantity)) errors.push("quantity");
    if (m.type.startsWith("transfer_") && !clean(m.transferId)) errors.push("transferId");
    if (m.type === "transfer_out" && !clean(m.destinationActivityId)) errors.push("destinationActivityId");
    if (m.type === "transfer_in" && !clean(m.sourceActivityId)) errors.push("sourceActivityId");
    return { valid: errors.length === 0, errors };
  }

  function stockBalance(movements, { businessId, activityId, itemId, openingQuantity = 0 }) {
    if (!Number.isSafeInteger(openingQuantity) || openingQuantity < 0) throw new TypeError("Stock initial invalide.");
    let balance = openingQuantity;
    for (const m of movements || []) {
      if (m.businessId !== businessId || m.itemId !== itemId) continue;
      if (m.activityId === activityId) {
        if (["purchase", "transfer_in"].includes(m.type)) balance += m.quantity;
        if (["sale", "loss", "transfer_out"].includes(m.type)) balance -= m.quantity;
        if (m.type === "adjustment") balance += m.delta;
      }
      if (!Number.isSafeInteger(balance)) throw new RangeError("Dépassement de capacité du stock.");
    }
    if (balance < 0) throw new RangeError("Stock négatif : opération à bloquer ou à régulariser.");
    return balance;
  }

  function validateTransfer({ quantity, sourceActivityId, destinationActivityId, transferId } = {}) {
    const errors = [];
    if (!validQty(quantity)) errors.push("quantity");
    if (!clean(sourceActivityId)) errors.push("sourceActivityId");
    if (!clean(destinationActivityId)) errors.push("destinationActivityId");
    if (sourceActivityId && sourceActivityId === destinationActivityId) errors.push("sameActivity");
    if (!clean(transferId)) errors.push("transferId");
    return { valid: errors.length === 0, errors };
  }

  function validatePurchaseOrder(order = {}) {
    const errors = [];
    for (const key of ["businessId", "activityId", "supplierId", "reference", "authorUid"]) {
      if (!clean(order[key])) errors.push(key);
    }
    if (!STATUSES.includes(order.status)) errors.push("status");
    if (!Array.isArray(order.lines) || order.lines.length === 0) errors.push("lines");
    else for (const [i, line] of order.lines.entries()) {
      if (!clean(line.itemId) || !validQty(line.quantity)
          || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) errors.push("lines." + i);
    }
    return { valid: errors.length === 0, errors };
  }

  function purchaseTotalMinor(order) {
    const result = validatePurchaseOrder(order);
    if (!result.valid) throw new TypeError("Commande d'achat invalide : " + result.errors.join(", "));
    const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
    if (!Number.isSafeInteger(total)) throw new RangeError("Total de commande trop élevé.");
    return total;
  }

  function canTransitionPurchase(current, next) {
    const allowed = {
      draft: ["requested", "cancelled"],
      requested: ["approved", "cancelled"],
      approved: ["ordered", "cancelled"],
      ordered: ["partially_received", "received", "cancelled"],
      partially_received: ["partially_received", "received", "cancelled"],
      received: [], cancelled: []
    };
    return Boolean(allowed[current] && allowed[current].includes(next));
  }

  return Object.freeze({
    MOVEMENTS, STATUSES, validateMovement, stockBalance,
    validateTransfer, validatePurchaseOrder, purchaseTotalMinor, canTransitionPurchase
  });
});
