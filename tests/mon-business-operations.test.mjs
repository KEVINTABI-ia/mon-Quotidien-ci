import test from "node:test";
import assert from "node:assert/strict";
import ops from "../mon-business/operations.js";

const movement = {
  businessId:"biz-1",activityId:"shop",itemId:"rice-25kg",unit:"bag",
  type:"purchase",quantity:10,authorUid:"owner-1",reference:"ST-001"
};

test("valide un mouvement de stock avec unité et référence",()=>{
  assert.equal(ops.validateMovement(movement).valid,true);
  assert.equal(ops.validateMovement({...movement,quantity:0}).valid,false);
});

test("calcule les entrées, ventes et pertes d'un stock indépendant",()=>{
  const rows=[
    movement,
    {...movement,type:"sale",quantity:3},
    {...movement,type:"loss",quantity:1}
  ];
  assert.equal(ops.stockBalance(rows,{businessId:"biz-1",activityId:"shop",itemId:"rice-25kg",openingQuantity:2}),8);
});

test("isole le stock d'une autre activité et d'une autre entreprise",()=>{
  const rows=[movement,{...movement,activityId:"other-shop",quantity:50},{...movement,businessId:"biz-2",quantity:100}];
  assert.equal(ops.stockBalance(rows,{businessId:"biz-1",activityId:"shop",itemId:"rice-25kg"}),10);
});

test("refuse un stock négatif",()=>{
  assert.throws(()=>ops.stockBalance([{...movement,type:"sale",quantity:2}],{
    businessId:"biz-1",activityId:"shop",itemId:"rice-25kg",openingQuantity:1
  }),RangeError);
});

test("valide un transfert inter-activités et exige un identifiant commun",()=>{
  assert.equal(ops.validateTransfer({quantity:4,sourceActivityId:"shop",destinationActivityId:"depot",transferId:"TR-1"}).valid,true);
  assert.equal(ops.validateTransfer({quantity:4,sourceActivityId:"shop",destinationActivityId:"shop",transferId:"TR-1"}).valid,false);
  assert.equal(ops.validateMovement({...movement,type:"transfer_out",destinationActivityId:"depot",transferId:"TR-1"}).valid,true);
});

const order={
  businessId:"biz-1",activityId:"shop",supplierId:"supplier-1",
  reference:"PO-001",authorUid:"owner-1",status:"requested",
  lines:[{itemId:"rice-25kg",quantity:4,unitPriceMinor:2500},{itemId:"oil-1l",quantity:3,unitPriceMinor:1200}]
};

test("valide une commande d'achat et calcule son total en unités mineures",()=>{
  assert.equal(ops.validatePurchaseOrder(order).valid,true);
  assert.equal(ops.purchaseTotalMinor(order),13600);
});

test("refuse une ligne d'achat mal formée",()=>{
  assert.equal(ops.validatePurchaseOrder({...order,lines:[{itemId:"x",quantity:1.5,unitPriceMinor:100}]}).valid,false);
});

test("contrôle le cycle de vie d'une commande et ses réceptions partielles",()=>{
  assert.equal(ops.canTransitionPurchase("requested","approved"),true);
  assert.equal(ops.canTransitionPurchase("approved","ordered"),true);
  assert.equal(ops.canTransitionPurchase("ordered","partially_received"),true);
  assert.equal(ops.canTransitionPurchase("partially_received","received"),true);
  assert.equal(ops.canTransitionPurchase("draft","received"),false);
});
