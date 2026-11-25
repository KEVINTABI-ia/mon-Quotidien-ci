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

test("Reversements cabine: la transaction ne lit que des documents et maintient un cumul atomique", () => {
  const start = cabines.indexOf("window.cabAdminEnregistrerReversement");
  const end = cabines.indexOf("window.cabAdminCabine", start);
  const handler = cabines.slice(start, end);
  assert.match(handler, /demandRef\.collection\("reversements"\)\.get\(\)/);
  assert.doesNotMatch(handler, /tx\.get\(demandRef\.collection\("reversements"\)\)/);
  assert.match(handler, /tx\.update\(demandRef,\{reversementsTotalXof:paid\+amount\}\)/);
  assert.match(handler, /tx\.get\(demandRef\).*tx\.get\(entryRef\)/s);
});
