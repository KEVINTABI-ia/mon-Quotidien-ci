import test from "node:test";
import assert from "node:assert/strict";
import sales from "../mon-business/sales.js";

const sale={businessId:"biz-1",activityId:"shop",reference:"SALE-1",authorUid:"uid-1",source:"onsite",status:"completed",lines:[{itemId:"tea",quantity:2,unitPriceMinor:1500}],paymentStatus:"paid"};

test("valide une vente et calcule le total en unités mineures",()=>{
 assert.equal(sales.validateSale(sale).valid,true);
 assert.equal(sales.saleTotalMinor(sale),3000);
});
test("refuse les lignes de vente invalides",()=>{
 assert.equal(sales.validateSale({...sale,lines:[{itemId:"tea",quantity:0,unitPriceMinor:1500}]}).valid,false);
});
test("une commande annulée ne doit pas compter comme chiffre d'affaires",()=>{
 assert.equal(sales.validateSale({...sale,status:"cancelled",countsAsRevenue:true}).valid,false);
});
test("contrôle le cycle de vie d'une commande",()=>{
 assert.equal(sales.canTransitionOrder("received","confirmed"),true);
 assert.equal(sales.canTransitionOrder("ready","in_delivery"),true);
 assert.equal(sales.canTransitionOrder("received","completed"),false);
 assert.equal(sales.canTransitionOrder("completed","cancelled"),false);
});
test("calcule l'encours et respecte un plafond de crédit par activité",()=>{
 const policy={enabled:true,maxOutstandingMinor:10000,termDays:30};
 const openItems=[{outstandingMinor:3000,status:"partial"},{outstandingMinor:1000,status:"unpaid"}];
 assert.equal(sales.creditExposure(openItems),4000);
 assert.equal(sales.validateCreditSale({policy,openItems,amountMinor:5000}).allowed,true);
 assert.equal(sales.validateCreditSale({policy,openItems,amountMinor:7000}).reason,"credit_limit_exceeded");
});
test("refuse le crédit désactivé et les paiements supérieurs au solde",()=>{
 assert.equal(sales.validateCreditSale({policy:{enabled:false},amountMinor:100}).reason,"credit_disabled");
 assert.throws(()=>sales.applyPayment({outstandingMinor:500,paidMinor:700}),TypeError);
});
test("un paiement partiel réduit la créance sans déclarer la facture totalement payée",()=>{
 assert.deepEqual(sales.applyPayment({outstandingMinor:1000,paidMinor:400}),{outstandingMinor:600,status:"partial"});
 assert.deepEqual(sales.applyPayment({outstandingMinor:1000,paidMinor:1000}),{outstandingMinor:0,status:"paid"});
});
