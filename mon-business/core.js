/**
 * Mon Business — primitives métier de la phase 1.
 * Module isolé, utilisable côté navigateur et dans les tests Node.
 * Les validations client ne remplacent jamais les règles serveur.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MonBusinessCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BUSINESS_ROLES = Object.freeze([
    "owner", "general_director", "activity_manager", "accountant",
    "cashier", "stock_manager", "employee", "observer"
  ]);
  const PERMISSION_ACTIONS = Object.freeze([
    "view", "create", "edit", "approve", "cancel_correct", "export", "manage_access"
  ]);
  const clean = (value) => typeof value === "string" ? value.trim() : "";

  function validateBusinessRegistration(input = {}) {
    const errors = [];
    const name = clean(input.name);
    const legalStatus = clean(input.legalStatus);
    const ownerUid = clean(input.ownerUid);
    if (name.length < 2 || name.length > 140) errors.push("name");
    if (!["registered", "unregistered"].includes(legalStatus)) errors.push("legalStatus");
    if (!ownerUid) errors.push("ownerUid");
    if (legalStatus === "registered" && !clean(input.registrationNumber)) errors.push("registrationNumber");
    return { valid: errors.length === 0, errors };
  }

  function validateActivity(input = {}) {
    const errors = [];
    const name = clean(input.name);
    const type = clean(input.type);
    if (name.length < 2 || name.length > 100) errors.push("name");
    if (!type || type.length > 80) errors.push("type");
    return { valid: errors.length === 0, errors };
  }

  function canAccessActivity(member, activityId, action) {
    if (!member || member.status !== "active") return false;
    if (!PERMISSION_ACTIONS.includes(action)) return false;
    if (member.role === "owner") return true;
    if (!Array.isArray(member.activityIds) || !member.activityIds.includes(activityId)) return false;
    return member.permissions?.[action] === true;
  }

  function createAuditEvent({
    businessId, activityId = null, actorUid, action,
    entityType, entityId, occurredAt, metadata = {}
  } = {}) {
    if (!clean(businessId) || !clean(actorUid) || !clean(action)
        || !clean(entityType) || !clean(entityId)) {
      throw new TypeError("Champs obligatoires manquants pour le journal d'audit.");
    }
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new TypeError("occurredAt doit être une date valide.");
    }
    return Object.freeze({
      businessId, activityId: activityId || null, actorUid, action,
      entityType, entityId, occurredAt: occurredAt.toISOString(),
      metadata: JSON.parse(JSON.stringify(metadata))
    });
  }

  return Object.freeze({
    BUSINESS_ROLES, PERMISSION_ACTIONS, validateBusinessRegistration,
    validateActivity, canAccessActivity, createAuditEvent
  });
});
