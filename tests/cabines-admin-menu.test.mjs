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


test("Catalogue MTN CI: les offres visibles dans les captures sont intégrées sans doublon", () => {
  const start = cabines.indexOf(' {op:"MTN"');
  const end = cabines.indexOf('];', start);
  const mtn = cabines.slice(start, end);
  assert.equal((mtn.match(/op:"MTN"/g) || []).length, 30);
  assert.match(mtn, /name:"Pass c'chic 650Mo",price:200,data:"650 Mo".*validity:"1 jour"/);
  assert.match(mtn, /name:"Pass c'chic 7,5Go",price:2500,data:"7,5 Go".*validity:"10 jours"/);
  assert.equal((mtn.match(/name:"Pass c'chic 7,5Go"/g) || []).length, 1);
  assert.match(mtn, /name:"Pass c'chic 1,5 Go \+ 60min",price:700/);
  assert.match(mtn, /name:"Appels 27 min \+ Internet 50 Mo",price:300/);
  assert.match(mtn, /name:"Internet Mois Medium",price:5000/);
  assert.match(mtn, /name:"Appels Premium",price:10000/);
});

test("Catalogue MTN CI: les offres mixtes restent classées dans leur propre catégorie", () => {
  const start = cabines.indexOf(' {op:"MTN"');
  const end = cabines.indexOf('];', start);
  const mtn = cabines.slice(start, end);
  assert.match(mtn, /type:"forfait_mixte",group:"Pass C'Chic",name:"Pass c'chic 1,5 Go \+ 60min"/);
  assert.match(mtn, /type:"forfait_mixte",group:"Pass 1 à 3 jours",name:"Appels 27 min \+ Internet 50 Mo"/);
});


test("Catalogue Moov CI: les offres visibles dans les vidéos sont intégrées", () => {
  const start = cabines.indexOf(' {op:"Moov Africa"');
  const end = cabines.indexOf(' {op:"MTN"', start);
  const moov = cabines.slice(start, end);
  assert.equal((moov.match(/op:"Moov Africa"/g) || []).length, 61);
  assert.match(moov, /name:"Appel \+ Internet 20 min \+ 150 Mo",price:200/);
  assert.match(moov, /name:"Appels 100 min \+ 500 SMS \+ 1 024 Mo \+ illimité vers 5 numéros préférés",price:1000/);
  assert.match(moov, /name:"Internet illimité 6 heures",price:1300,data:"Illimité".*validity:"6 heures"/);
  assert.match(moov, /name:"Réseaux sociaux 500 Mo",price:200,data:"500 Mo".*validity:"1 jour"/);
  assert.match(moov, /name:"1,5 Go",price:1000,data:"1,5 Go".*validity:"7 jours"/);
  assert.match(moov, /name:"Internet 5 Go",price:2000,data:"5 Go".*validity:"10 jours"/);
  assert.match(moov, /name:"400 Go",price:39000,data:"400 Go".*validity:"30 jours"/);
  assert.match(moov, /name:"Moov Folie 10 Go",price:2500,data:"10 Go".*validity:"15 jours"/);
  assert.match(moov, /name:"Pass nuit 30 min TRS \+ 2 Go",price:200,data:"2 Go".*validity:"22h–7h"/);
  assert.match(moov, /type:"forfait_appels",group:"Moov Folie",name:"Moov Folie Appels Jour",price:200/);
  assert.match(moov, /name:"Moov Folie 140 min",price:1000.*minutes:"140 min".*validity:"10 jours"/);
  assert.match(moov, /name:"Moov Folie 700 min",price:5000.*minutes:"700 min".*validity:"30 jours"/);
});

test("Catalogue Moov CI: les offres mixtes restent distinctes des offres Internet et appels", () => {
  const start = cabines.indexOf(' {op:"Moov Africa"');
  const end = cabines.indexOf(' {op:"MTN"', start);
  const moov = cabines.slice(start, end);
  assert.match(moov, /type:"forfait_mixte",group:"Appel \+ Internet"/);
  assert.match(moov, /type:"forfait_mixte",group:"Pass nuit"/);
});


test("Cabine téléphonique: les cinq logos de paiement fournis sont affichés et Jèko reste le checkout", () => {
  for (const method of ["wave", "orange", "mtn", "moov", "djamo"]) {
    assert.match(cabines, new RegExp('data-payment="' + method + '"'));
    assert.match(cabines, new RegExp('class="cab-payment-logo logo-' + method + '"'));
  }
  assert.match(cabines, /data:image\/jpeg;base64,/);
  assert.match(cabines, /id="cabPaymentMethod"/);
  assert.match(cabines, /Valider et payer avec Jèko/);
});
