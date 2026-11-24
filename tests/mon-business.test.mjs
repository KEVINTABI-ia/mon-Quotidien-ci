import test from "node:test";
import assert from "node:assert/strict";
import { buildMonBusinessPlan, normalizeMonBusinessIdentity, normalizeMonBusinessPassword, normalizeMonBusinessTransaction, MON_BUSINESS_PASSWORD_ITERATIONS, normalizeMonBusinessRecord } from "../cloudflare/worker.js";

test("MON BUSINESS exposes only the three approved quarterly plans",()=>{
  assert.deepEqual(buildMonBusinessPlan("standard"),{label:"Standard",amountXof:15000,durationMonths:3});
  assert.deepEqual(buildMonBusinessPlan("premium"),{label:"Premium",amountXof:30000,durationMonths:3});
  assert.deepEqual(buildMonBusinessPlan("professionnel"),{label:"Professionnel",amountXof:60000,durationMonths:3});
  assert.equal(buildMonBusinessPlan("free"),null);
});
test("MON BUSINESS normalizes an Ivorian business identity",()=>{
  assert.deepEqual(normalizeMonBusinessIdentity("Épicerie Chez Awa","+225 07 00 00 00 00"),{normalizedName:"epicerie chez awa",normalizedPhone:"2250700000000"});
  assert.deepEqual(normalizeMonBusinessIdentity("Boutique","07 00 00 00 00"),{normalizedName:"boutique",normalizedPhone:"2250700000000"});
  assert.equal(normalizeMonBusinessIdentity("A","+225 07 00 00 00 00"),null);
});

test("MON BUSINESS exige un mot de passe dédié de 8 caractères minimum",()=>{
  assert.equal(normalizeMonBusinessPassword("1234567"),null);
  assert.equal(normalizeMonBusinessPassword("12345678"),"12345678");
  assert.equal(normalizeMonBusinessPassword("x".repeat(129)),null);
});
test("MON BUSINESS valide les opérations de recette et de dépense",()=>{
  assert.deepEqual(normalizeMonBusinessTransaction({type:"recette",amountXof:2500,label:" Vente du jour ",category:"Vente"}),{type:"recette",amountXof:2500,label:"Vente du jour",category:"Vente",note:""});
  assert.equal(normalizeMonBusinessTransaction({type:"autre",amountXof:2500,label:"Vente"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:0,label:"Loyer"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:1500,label:"x"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:1.5,label:"Loyer"}),null);
});

test("MON BUSINESS uses a PBKDF2 iteration count supported by Cloudflare Workers",()=>{
  assert.equal(MON_BUSINESS_PASSWORD_ITERATIONS,100000);
  assert.ok(MON_BUSINESS_PASSWORD_ITERATIONS<=100000);
});

test("MON BUSINESS validates products, customers, sales, purchases and staff records",()=>{
  assert.deepEqual(normalizeMonBusinessRecord("produit",{name:"Riz",quantity:10,unitPrice:1500,minQuantity:2}),{name:"Riz",quantity:10,unitPrice:1500,minQuantity:2});
  assert.deepEqual(normalizeMonBusinessRecord("client",{name:"Awa",phone:"0700000000"}),{name:"Awa",phone:"0700000000"});
  assert.deepEqual(normalizeMonBusinessRecord("vente",{label:"Vente comptoir",amountXof:5000}),{label:"Vente comptoir",amountXof:5000});
  assert.deepEqual(normalizeMonBusinessRecord("achat",{label:"Approvisionnement",amountXof:2500}),{label:"Approvisionnement",amountXof:2500});
  assert.deepEqual(normalizeMonBusinessRecord("personnel",{name:"Koffi",role:"Vendeur"}),{name:"Koffi",role:"Vendeur"});
  assert.equal(normalizeMonBusinessRecord("produit",{name:"Riz",quantity:-1,unitPrice:1500}),null);
  assert.equal(normalizeMonBusinessRecord("vente",{label:"Vente",amountXof:0}),null);
  assert.equal(normalizeMonBusinessRecord("unknown",{name:"x"}),null);
});
