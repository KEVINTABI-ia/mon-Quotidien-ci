import test from "node:test";
import assert from "node:assert/strict";
import { buildMonBusinessPlan, normalizeMonBusinessIdentity } from "../cloudflare/worker.js";

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
