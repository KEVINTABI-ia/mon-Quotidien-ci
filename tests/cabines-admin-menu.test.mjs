import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const cabines = readFileSync(new URL("../cabines.js", import.meta.url), "utf8");

test("Administration: le menu contient la rubrique Cabines téléphoniques", () => {
  assert.match(html, /id:"gestionCabinesAdmin".*titre:"Cabines téléphoniques"/);
});

test("Administration: ouvrir la rubrique appelle le panneau cabinistes", () => {
  assert.match(html, /if\(id==="gestionCabinesAdmin"\)[\s\S]*window\.cabOuvrirAdmin\(\)/);
  assert.match(cabines, /window\.cabOuvrirAdmin=panneauAdmin/);
});

test("Cabinistes: le panneau propose les décisions d'approbation et de refus", () => {
  assert.match(cabines, /cabAdminCabine/);
  assert.match(cabines, /"approuve","refuse"/);
  assert.match(cabines, /Candidatures partenaires/);
});

test("Administration cabine: afficher les opérations et le solde par cabine sans formulaire de reversement", () => {
  assert.match(cabines, /Opérations et soldes des cabines/);
  assert.match(cabines, /data-cab-payer/);
  assert.match(cabines, /window\.cabAdminPayerTransaction/);
  assert.doesNotMatch(cabines, /Enregistrer le reversement manuel/);
});

test("Paiement cabine: paiement transactionnel unique et réservé à une prestation terminée", () => {
  const start = cabines.indexOf("window.cabAdminPayerTransaction=");
  const end = cabines.indexOf("window.cabAdminCabine=", start);
  const handler = cabines.slice(start, end);
  assert.match(handler, /payDb\.runTransaction/);
  assert.ok(handler.includes('d.statut!=="terminee"'));
  assert.match(handler, /existing\.exists/);
  assert.match(handler, /reversementsTotalXof:earned/);
  assert.ok(handler.includes('type:"paiement_transaction"'));
});
