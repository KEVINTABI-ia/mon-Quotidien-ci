import test from "node:test";
import assert from "node:assert/strict";
import { buildMonBusinessPlan, normalizeMonBusinessIdentity, normalizeMonBusinessTransaction } from "../cloudflare/worker.js";

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

test("MON BUSINESS valide les opérations de recette et de dépense",()=>{
  assert.deepEqual(normalizeMonBusinessTransaction({type:"recette",amountXof:2500,label:" Vente du jour ",category:"Vente"}),{type:"recette",amountXof:2500,label:"Vente du jour",category:"Vente",note:""});
  assert.equal(normalizeMonBusinessTransaction({type:"autre",amountXof:2500,label:"Vente"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:0,label:"Loyer"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:1500,label:"x"}),null);
  assert.equal(normalizeMonBusinessTransaction({type:"depense",amountXof:1.5,label:"Loyer"}),null);
});
