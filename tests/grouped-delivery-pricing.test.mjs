import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGroupedDeliveryPrice,
  GROUPED_DELIVERY_PRICING
} from "../cloudflare/worker.js";

test("grouped tour price follows the validated distance and shop formula",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:8,shopCount:3});
  assert.equal(result.rawPriceXof,2100);
  assert.equal(result.totalPriceXof,2100);
  assert.equal(result.currency,"XOF");
});

test("grouped tour price rounds to the nearest 100 XOF",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:1.2,shopCount:2});
  assert.equal(result.rawPriceXof,880);
  assert.equal(result.roundedPriceXof,900);
  assert.equal(result.totalPriceXof,1000);
});

test("grouped tour minimum price is enforced after rounding",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:1,shopCount:2});
  assert.equal(result.roundedPriceXof,900);
  assert.equal(result.totalPriceXof,GROUPED_DELIVERY_PRICING.minimumTourPriceXof);
});

test("grouped tour accepts the configured upper shop and distance limits",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:250,shopCount:25});
  assert.equal(result.shopCount,25);
  assert.ok(result.totalPriceXof>0);
});

test("grouped tour rejects invalid distance and shop counts",()=>{
  for(const roadDistanceKm of [0,-1,NaN,Infinity,251,"8",null]){
    assert.throws(()=>calculateGroupedDeliveryPrice({roadDistanceKm,shopCount:2}),/invalid_grouped_delivery_distance/);
  }
  for(const shopCount of [0,1,1.5,26,"3",null]){
    assert.throws(()=>calculateGroupedDeliveryPrice({roadDistanceKm:8,shopCount}),/invalid_grouped_delivery_shop_count/);
  }
});
