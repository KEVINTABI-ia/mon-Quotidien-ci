import test from "node:test";
import assert from "node:assert/strict";
import core from "../mon-business/core.js";

test("accepte une entreprise non immatriculée en phase de lancement", () => {
  assert.deepEqual(core.validateBusinessRegistration({
    name: "Commerce test", legalStatus: "unregistered", ownerUid: "uid-owner"
  }), { valid: true, errors: [] });
});

test("exige le numéro d'immatriculation si l'entreprise est immatriculée", () => {
  assert.equal(core.validateBusinessRegistration({
    name: "Commerce test", legalStatus: "registered", ownerUid: "uid-owner"
  }).valid, false);
});

test("valide une activité et refuse les champs incomplets", () => {
  assert.equal(core.validateActivity({ name: "Boutique", type: "commerce" }).valid, true);
  assert.equal(core.validateActivity({ name: " ", type: "" }).valid, false);
});

test("isole les droits du responsable d'activité par activité et action", () => {
  const member = {
    status: "active", role: "activity_manager", activityIds: ["boutique"],
    permissions: { view: true, approve: false }
  };
  assert.equal(core.canAccessActivity(member, "boutique", "view"), true);
  assert.equal(core.canAccessActivity(member, "boutique", "approve"), false);
  assert.equal(core.canAccessActivity(member, "transport", "view"), false);
  assert.equal(core.canAccessActivity({ ...member, status: "suspended" }, "boutique", "view"), false);
});

test("le propriétaire a les droits dans son espace et le journal conserve une date", () => {
  assert.equal(core.canAccessActivity({ status: "active", role: "owner" }, "commerce", "manage_access"), true);
  const event = core.createAuditEvent({
    businessId: "biz-1", actorUid: "uid-1", action: "business.created",
    entityType: "business", entityId: "biz-1", occurredAt: new Date("2026-11-23T10:00:00Z")
  });
  assert.equal(event.occurredAt, "2026-11-23T10:00:00.000Z");
  assert.throws(() => core.createAuditEvent({}), TypeError);
});
