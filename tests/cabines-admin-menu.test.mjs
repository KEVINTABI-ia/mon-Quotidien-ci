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


test("Catalogue Orange CI: les forfaits appels et internet fournis sont présents avec leurs groupes", () => {
  const orange = cabines.slice(cabines.indexOf("const cabForfaits=["), cabines.indexOf(' {op:"Moov Africa"'));
  assert.equal((orange.match(/op:"Orange"/g) || []).length, 28);
  assert.match(orange, /name:"Pass Max It Minutes",price:1000,data:"—",minutes:"100 min",validity:"7 jours"/);
  assert.match(orange, /name:"Pass Mix Semaine",price:1000,data:"1 Go"/);
  assert.match(orange, /name:"Pass Mix Mois",price:3000,data:"2,56 Go"/);
  assert.match(orange, /name:"Pass Internet Nuit",price:250,data:"2 048 Mo \(2 Go\)".*validity:"1 jour",notes:"Pass Internet tout usage · Période : 21h à 07h"/);
  assert.match(orange, /Bonus data Spotify : 500 Mo/);
  assert.match(orange, /Accès WaW Muzik/);
});

test("Catalogue Orange CI: les cartes affichent le groupe et les précisions de chaque offre", () => {
  assert.match(cabines, /esc\(x\.group\)/);
  assert.match(cabines, /esc\(x\.notes\)/);
});

test("Catalogue Orange CI: les catalogues MTN et Moov restent présents", () => {
  assert.match(cabines, /op:"Moov Africa"/);
  assert.match(cabines, /op:"MTN"/);
});
