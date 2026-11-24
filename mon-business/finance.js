/**
 * Mon Business — moteur financier métier (phase 2).
 * Calculs purs : aucune écriture Firestore et aucune décision d'approbation.
 * Les règles serveur doivent revalider toutes les opérations avant persistance.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MonBusinessFinance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STATUSES = Object.freeze(["pending", "approved", "executed", "rejected", "cancelled"]);
  const TYPES = Object.freeze(["income", "expense", "transfer"]);
  const METHODS = Object.freeze(["cash", "bank", "wave", "orange_money", "mtn_money", "electronic"]);
  const clean = v => typeof v === "string" ? v.trim() : "";
  const validAmount = n => Number.isSafeInteger(n) && n > 0;

  function validateTransaction(input = {}) {
    const errors = [];
    if (!clean(input.businessId)) errors.push("businessId");
    if (!clean(input.activityId)) errors.push("activityId");
    if (!clean(input.cashRegisterId)) errors.push("cashRegisterId");
    if (!TYPES.includes(input.type)) errors.push("type");
    if (!validAmount(input.amountMinor)) errors.push("amountMinor");
    if (!METHODS.includes(input.paymentMethod)) errors.push("paymentMethod");
    if (!clean(input.reason) || input.reason.trim().length > 500) errors.push("reason");
    if (!clean(input.authorUid)) errors.push("authorUid");
    if (!clean(input.reference)) errors.push("reference");
    if (!STATUSES.includes(input.status)) errors.push("status");
    if (input.type === "transfer") {
      if (!clean(input.destinationCashRegisterId)) errors.push("destinationCashRegisterId");
      if (input.destinationCashRegisterId === input.cashRegisterId) errors.push("sameCashRegister");
    } else if (input.destinationCashRegisterId) {
      errors.push("destinationCashRegisterId");
    }
    if (input.type === "transfer" && input.activityId !== input.destinationActivityId
        && !clean(input.destinationActivityId)) errors.push("destinationActivityId");
    return { valid: errors.length === 0, errors };
  }

  function affectsBalances(tx) {
    return tx && tx.status === "executed";
  }

  function balanceForRegister(transactions, cashRegisterId, openingBalanceMinor = 0) {
    if (!Number.isSafeInteger(openingBalanceMinor) || openingBalanceMinor < 0) {
      throw new TypeError("Solde initial invalide.");
    }
    let balance = openingBalanceMinor;
    for (const tx of transactions || []) {
      if (!affectsBalances(tx)) continue;
      if (tx.cashRegisterId === cashRegisterId) {
        if (tx.type === "income") balance += tx.amountMinor;
        else balance -= tx.amountMinor;
      }
      if (tx.type === "transfer" && tx.destinationCashRegisterId === cashRegisterId) {
        balance += tx.amountMinor;
      }
      if (!Number.isSafeInteger(balance)) throw new RangeError("Dépassement de capacité du solde.");
    }
    return balance;
  }

  function profitAndLoss(transactions, { activityId = null } = {}) {
    let incomeMinor = 0, expenseMinor = 0;
    for (const tx of transactions || []) {
      if (!affectsBalances(tx) || tx.type === "transfer") continue;
      if (activityId && tx.activityId !== activityId) continue;
      if (tx.type === "income") incomeMinor += tx.amountMinor;
      if (tx.type === "expense") expenseMinor += tx.amountMinor;
    }
    if (!Number.isSafeInteger(incomeMinor) || !Number.isSafeInteger(expenseMinor)) {
      throw new RangeError("Dépassement de capacité du rapport.");
    }
    return { incomeMinor, expenseMinor, resultMinor: incomeMinor - expenseMinor };
  }

  function validateTransition(currentStatus, nextStatus) {
    const allowed = {
      pending: ["approved", "rejected", "cancelled"],
      approved: ["executed", "cancelled"],
      executed: [],
      rejected: [],
      cancelled: []
    };
    if (!STATUSES.includes(currentStatus) || !STATUSES.includes(nextStatus)) return false;
    return allowed[currentStatus].includes(nextStatus);
  }

  function createTransaction(input = {}) {
    const result = validateTransaction(input);
    if (!result.valid) {
      const error = new TypeError("Opération financière invalide : " + result.errors.join(", "));
      error.fields = result.errors;
      throw error;
    }
    return Object.freeze({
      businessId: clean(input.businessId),
      activityId: clean(input.activityId),
      cashRegisterId: clean(input.cashRegisterId),
      destinationActivityId: clean(input.destinationActivityId) || null,
      destinationCashRegisterId: clean(input.destinationCashRegisterId) || null,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: "XOF",
      paymentMethod: input.paymentMethod,
      reason: clean(input.reason),
      authorUid: clean(input.authorUid),
      reference: clean(input.reference),
      status: input.status,
      createdAt: input.createdAt instanceof Date ? input.createdAt.toISOString() : null
    });
  }

  return Object.freeze({
    STATUSES, TYPES, METHODS, validateTransaction, createTransaction,
    balanceForRegister, profitAndLoss, validateTransition
  });
});
