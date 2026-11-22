import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCourierWalletDebit,
  courierWalletCanAcceptMission,
  applyCourierWalletCommission,
  applyCourierWalletRecharge,
  buildCourierWalletRechargeLedger,
  courierCommissionTriggerAllowed,
  courierWalletNeedsLowBalanceAlert,
  isValidCourierWalletRechargeAmount,
  courierProfileCanCompleteMission,
  hashDeliveryConfirmationCode,
  deliveryCodeIssuanceState,
  buildCourierWalletCommissionLedger,
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

test("zero balance or outstanding commission debt blocks new missions", () => {
  assert.equal(courierWalletCanAcceptMission(0),false);
  assert.equal(courierWalletCanAcceptMission(1),true);
  assert.equal(courierWalletCanAcceptMission(-1),false);
  assert.equal(courierWalletCanAcceptMission(500,1),false);
  assert.equal(courierWalletCanAcceptMission(500,0),true);
});

test("commission is partially collected and unpaid remainder becomes debt", () => {
  assert.deepEqual(applyCourierWalletCommission({
    balanceXof:800,debtXof:0,commissionXof:1500
  }),{
    debitXof:800,balanceAfterXof:0,debtAddedXof:700,
    debtAfterXof:700,commissionSettledXof:800
  });
});

test("new commission debt is added to existing debt without negative wallet balance", () => {
  assert.deepEqual(applyCourierWalletCommission({
    balanceXof:200,debtXof:300,commissionXof:1000
  }),{
    debitXof:200,balanceAfterXof:0,debtAddedXof:800,
    debtAfterXof:1100,commissionSettledXof:200
  });
});

test("recharge pays commission debt before restoring spendable balance", () => {
  assert.deepEqual(applyCourierWalletRecharge({
    balanceXof:0,debtXof:700,rechargeXof:1000
  }),{
    debtPaymentXof:700,debtAfterXof:0,balanceCreditXof:300,balanceAfterXof:300
  });
});

test("recharge smaller than debt reduces debt and leaves wallet at zero", () => {
  assert.deepEqual(applyCourierWalletRecharge({
    balanceXof:0,debtXof:700,rechargeXof:400
  }),{
    debtPaymentXof:400,debtAfterXof:300,balanceCreditXof:0,balanceAfterXof:0
  });
});

test("invalid wallet ledger and recharge amounts are rejected", () => {
  assert.throws(()=>applyCourierWalletCommission({balanceXof:-1,debtXof:0,commissionXof:10}));
  assert.throws(()=>applyCourierWalletCommission({balanceXof:0,debtXof:0,commissionXof:1.5}));
  assert.throws(()=>applyCourierWalletRecharge({balanceXof:0,debtXof:-1,rechargeXof:100}));
  assert.throws(()=>applyCourierWalletRecharge({balanceXof:0,debtXof:0,rechargeXof:0}));
});

test("low balance alert starts at 1,000 XOF", () => {
  assert.equal(courierWalletNeedsLowBalanceAlert(1000),true);
  assert.equal(courierWalletNeedsLowBalanceAlert(999),true);
  assert.equal(courierWalletNeedsLowBalanceAlert(1001),false);
});

test("validated wallet constants are stable", () => {
  assert.deepEqual(COURIER_WALLET_RULES,{
    lowBalanceAlertXof:1000,gareServiceFeeXof:600,
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


test("10,000 XOF prepaid balance loses 300 XOF per completed delivery until 1,000 XOF alert threshold", () => {
  let balanceXof = 10000;
  for (let i = 0; i < 30; i++) {
    const result = applyCourierWalletCommission({
      balanceXof, debtXof: 0, commissionXof: 300
    });
    balanceXof = result.balanceAfterXof;
    assert.equal(result.debtAddedXof, 0);
  }
  assert.equal(balanceXof, 1000);
  assert.equal(courierWalletNeedsLowBalanceAlert(balanceXof), true);
  assert.equal(courierWalletCanAcceptMission(balanceXof, 0), true);
});

test("zero prepaid balance blocks new missions", () => {
  assert.equal(courierWalletCanAcceptMission(0, 0), false);
});


test("Jeko wallet recharge ledger credits the full confirmed payment and records debt settlement separately", () => {
  assert.deepEqual(buildCourierWalletRechargeLedger({
    balanceXof:0,debtXof:0,rechargeXof:10000,totalRechargeXof:0
  }),{
    debtPaymentXof:0,debtAfterXof:0,balanceCreditXof:10000,balanceAfterXof:10000,
    totalRechargeAfterXof:10000
  });
  assert.deepEqual(buildCourierWalletRechargeLedger({
    balanceXof:0,debtXof:700,rechargeXof:10000,totalRechargeXof:10000
  }),{
    debtPaymentXof:700,debtAfterXof:0,balanceCreditXof:9300,balanceAfterXof:9300,
    totalRechargeAfterXof:20000
  });
});


test("courier may choose any recharge amount from 2,000 XOF; presets are suggestions", () => {
  for (const amount of [2000,2500,3500,10000,25000]) {
    const result=buildCourierWalletRechargeLedger({
      balanceXof:0,debtXof:0,rechargeXof:amount,totalRechargeXof:0
    });
    assert.equal(result.balanceAfterXof,amount);
    assert.equal(result.totalRechargeAfterXof,amount);
  }
  assert.equal(isValidCourierWalletRechargeAmount(1999),false);
  assert.equal(isValidCourierWalletRechargeAmount(2000),true);
  assert.equal(isValidCourierWalletRechargeAmount(10000000),true);
  assert.equal(isValidCourierWalletRechargeAmount(10000001),false);
});


test("only approved active independent couriers can complete wallet missions",()=>{
  assert.equal(courierProfileCanCompleteMission({uid:"u1",type:"livreur_independant",statut:"approuve",etatCompte:"actif"},"u1"),true);
  assert.equal(courierProfileCanCompleteMission({uid:"u1",type:"representant_gare",statut:"approuve"},"u1"),false);
  assert.equal(courierProfileCanCompleteMission({uid:"u1",type:"livreur_independant",statut:"en_attente"},"u1"),false);
  assert.equal(courierProfileCanCompleteMission({uid:"u2",type:"livreur_independant",statut:"approuve"},"u1"),false);
});
test("server commission ledger calculates boutique and standard delivery commissions",()=>{
  assert.equal(buildCourierWalletCommissionLedger({balanceXof:1000,deliveryFeeXof:2500,serviceType:"boutique"}).totalWalletDebitXof,250);
  assert.equal(buildCourierWalletCommissionLedger({balanceXof:1000,deliveryFeeXof:2000,serviceType:"classique"}).totalWalletDebitXof,300);
  const short=buildCourierWalletCommissionLedger({balanceXof:100,deliveryFeeXof:2000,serviceType:"classique"});
  assert.equal(short.debitXof,100);
  assert.equal(short.debtAddedXof,200);
});


test("delivery confirmation code is six digits and stored as a SHA-256 hash", async () => {
  const hash=await hashDeliveryConfirmationCode("042731");
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(await hashDeliveryConfirmationCode("42731"),null);
  assert.equal(await hashDeliveryConfirmationCode("12345x"),null);
});


test("delivery code issuance is limited to three emissions per 30-minute window", () => {
  const now=new Date("2026-11-22T12:00:00.000Z");
  const first=deliveryCodeIssuanceState(null,now);
  assert.equal(first.ok,true);
  assert.equal(first.issuanceCount,1);
  const second=deliveryCodeIssuanceState({...first,attempts:1},new Date(now.getTime()+1000));
  assert.equal(second.ok,true);
  assert.equal(second.issuanceCount,2);
  const third=deliveryCodeIssuanceState({...second,attempts:2},new Date(now.getTime()+2000));
  assert.equal(third.ok,true);
  assert.equal(third.issuanceCount,3);
  const fourth=deliveryCodeIssuanceState({...third,attempts:2},new Date(now.getTime()+3000));
  assert.deepEqual(fourth,{ok:false,reason:"rate_limited"});
});

test("delivery code attempts remain cumulative across re-issuance", () => {
  const now=new Date("2026-11-22T12:00:00.000Z");
  const state=deliveryCodeIssuanceState({issuanceWindowStartedAt:now,issuanceCount:2,attempts:4},new Date(now.getTime()+1000));
  assert.deepEqual(state,{ok:true,attempts:4,issuanceCount:3,issuanceWindowStartedAt:now});
  assert.deepEqual(deliveryCodeIssuanceState({...state,attempts:5},new Date(now.getTime()+2000)),{ok:false,reason:"locked"});
});

test("delivery code issuance window resets after 30 minutes but not before", () => {
  const now=new Date("2026-11-22T12:00:00.000Z");
  const existing={issuanceWindowStartedAt:now,issuanceCount:3,attempts:5};
  assert.deepEqual(deliveryCodeIssuanceState(existing,new Date(now.getTime()+29*60*1000)),{ok:false,reason:"locked"});
  const reset=deliveryCodeIssuanceState(existing,new Date(now.getTime()+30*60*1000));
  assert.equal(reset.ok,true);
  assert.equal(reset.attempts,0);
  assert.equal(reset.issuanceCount,1);
});

test("a used delivery confirmation code cannot be re-issued", () => {
  assert.deepEqual(deliveryCodeIssuanceState({usedAt:new Date()},new Date()),{ok:false,reason:"already_used"});
});
