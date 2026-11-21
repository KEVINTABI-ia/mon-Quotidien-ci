import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCourierWalletDebit,
  courierWalletCanAcceptMission,\n  courierCommissionTriggerAllowed,
  courierWalletNeedsLowBalanceAlert,
  COURIER_WALLET_RULES
} from "../cloudflare/worker.js";

test("boutique commission is 10% of delivery only", () => {
  assert.deepEqual(calculateCourierWalletDebit({serviceType:"boutique",deliveryFeeXof:2500}), {
    deliveryCommissionRate:0.10, deliveryCommissionXof:250,
    platformServiceFeeXof:0, courierServiceShareXof:0, totalWalletDebitXof:250
  });
});

test("classic delivery commission is 15% of delivery only", () => {
  assert.equal(calculateCourierWalletDebit({serviceType:"classique",deliveryFeeXof:1000}).totalWalletDebitXof,150);
});

test("gare recovery adds only 100 XOF platform share and preserves 500 XOF courier share", () => {
  assert.deepEqual(calculateCourierWalletDebit({serviceType:"gare_recuperation",deliveryFeeXof:1000,serviceFeeXof:600}), {
    deliveryCommissionRate:0.15, deliveryCommissionXof:150,
    platformServiceFeeXof:100, courierServiceShareXof:500, totalWalletDebitXof:250
  });
});

test("gare dispatch uses the same service split", () => {
  const result=calculateCourierWalletDebit({serviceType:"gare_expedition",deliveryFeeXof:0,serviceFeeXof:600});
  assert.equal(result.totalWalletDebitXof,100);
  assert.equal(result.courierServiceShareXof,500);
});

test("courier service fee and postal advances are not included in delivery commission", () => {
  assert.equal(calculateCourierWalletDebit({serviceType:"gare_expedition",deliveryFeeXof:2000,serviceFeeXof:600}).totalWalletDebitXof,400);
});

test("invalid operation, fractional amounts and wrong gare fee are rejected", () => {
  assert.throws(()=>calculateCourierWalletDebit({serviceType:"unknown",deliveryFeeXof:100}));
  assert.throws(()=>calculateCourierWalletDebit({serviceType:"classique",deliveryFeeXof:10.5}));
  assert.throws(()=>calculateCourierWalletDebit({serviceType:"gare_expedition",deliveryFeeXof:1000,serviceFeeXof:700}));
});

test("percentage rounding is to the nearest FCFA", () => {
  assert.equal(calculateCourierWalletDebit({serviceType:"classique",deliveryFeeXof:101}).deliveryCommissionXof,15);
});

test("zero balance blocks new missions but a positive balance allows them", () => {
  assert.equal(courierWalletCanAcceptMission(0),false);
  assert.equal(courierWalletCanAcceptMission(1),true);
  assert.equal(courierWalletCanAcceptMission(-1),false);
});

test("low balance alert starts at 1,000 XOF", () => {
  assert.equal(courierWalletNeedsLowBalanceAlert(1000),true);
  assert.equal(courierWalletNeedsLowBalanceAlert(999),true);
  assert.equal(courierWalletNeedsLowBalanceAlert(1001),false);
});

test("validated wallet constants are stable", () => {
  assert.deepEqual(COURIER_WALLET_RULES,{
    lowBalanceAlertXof:1000,initialDepositXof:5000,gareServiceFeeXof:600,
    garePlatformServiceShareXof:100,gareCourierServiceShareXof:500,dynamicPricingMaxMultiplier:1.20
  });
});

test("commission trigger is forbidden at acceptance, pickup, transit and arrival", () => {
  for (const status of ["livreur_affecte","colis_recupere","en_transit","arrive_destination"]) {
    assert.equal(courierCommissionTriggerAllowed({
      serviceType:"classique",fromStatus:status,toStatus:status==="arrive_destination"?"arrive_destination":status,
      serverConfirmed:true
    }),false);
  }
});

test("standard and boutique commission triggers require server-confirmed final transition", () => {
  for (const serviceType of ["classique","boutique","gare_recuperation"]) {
    assert.equal(courierCommissionTriggerAllowed({
      serviceType,fromStatus:"arrive_destination",toStatus:"livre",serverConfirmed:true
    }),true);
    assert.equal(courierCommissionTriggerAllowed({
      serviceType,fromStatus:"arrive_destination",toStatus:"livre",serverConfirmed:false
    }),false);
  }
});

test("gare dispatch commission requires confirmed postal deposit", () => {
  const base={serviceType:"gare_expedition",fromStatus:"arrive_destination",toStatus:"livre",serverConfirmed:true};
  assert.equal(courierCommissionTriggerAllowed(base),false);
  assert.equal(courierCommissionTriggerAllowed({...base,postalDepositConfirmed:true}),true);
});

test("unknown service cannot trigger a commission", () => {
  assert.equal(courierCommissionTriggerAllowed({
    serviceType:"unknown",fromStatus:"arrive_destination",toStatus:"livre",serverConfirmed:true
  }),false);
});
