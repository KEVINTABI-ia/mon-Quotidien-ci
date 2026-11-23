/**
 * Mon Business — primitives métier de la phase 1.
 * Module isolé : aucune dépendance à l'application existante.
 * Les validations client améliorent l'UX mais ne remplacent jamais les règles serveur.
 */

export const BUSINESS_ROLES = Object.freeze([
  "owner",
  "general_director",
  "activity_manager",
  "accountant",
  "cashier",
  "stock_manager",
  "employee",
  "observer",
]);

export const PERMISSION_ACTIONS = Object.freeze([
  "view",
  "create",
  "edit",
  "approve",
  "cancel_correct",
  "export",
  "manage_access",
]);

const clean = (value) => typeof value === "string" ? value.trim() : "";

export function validateBusinessRegistration(input = {}) {
  const errors = [];
  const name = clean(input.name);
  const legalStatus = clean(input.legalStatus);
  const ownerUid = clean(input.ownerUid);

  if (name.length < 2 || name.length > 140) errors.push("name");
  if (!["registered", "unregistered"].includes(legalStatus)) errors.push("legalStatus");
  if (!ownerUid) errors.push("ownerUid");

  if (legalStatus === "registered" && !clean(input.registrationNumber)) {
    errors.push("registrationNumber");
  }

  return { valid: errors.length === 0, errors };
}

export function validateActivity(input = {}) {
  const errors = [];
  const name = clean(input.name);
  const type = clean(input.type);
  if (name.length < 2 || name.length > 100) errors.push("name");
  if (!type || type.length > 80) errors.push("type");
  return { valid: errors.length === 0, errors };
}

export function canAccessActivity(member, activityId, action) {
  if (!member || member.status !== "active") return false;
  if (!PERMISSION_ACTIONS.includes(action)) return false;

  const permissions = member.permissions || {};
  const scope = member.activityIds;

  // Une portée null signifie accès entreprise uniquement, pas accès automatique
  // à toutes les activités. Le propriétaire est traité explicitement.
  if (member.role === "owner") return true;
  if (!Array.isArray(scope) || !scope.includes(activityId)) return false;

  return permissions[action] === true;
}

export function createAuditEvent({
  businessId,
  activityId = null,
  actorUid,
  action,
  entityType,
  entityId,
  occurredAt,
  metadata = {},
} = {}) {
  if (!clean(businessId) || !clean(actorUid) || !clean(action)
      || !clean(entityType) || !clean(entityId)) {
    throw new TypeError("Champs obligatoires manquants pour le journal d'audit.");
  }
  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
    throw new TypeError("occurredAt doit être une date valide.");
  }

  return Object.freeze({
    businessId,
    activityId: activityId || null,
    actorUid,
    action,
    entityType,
    entityId,
    occurredAt: occurredAt.toISOString(),
    metadata: structuredClone(metadata),
  });
}
