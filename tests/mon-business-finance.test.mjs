import test from "node:test";
import assert from "node:assert/strict";
import finance from "../mon-business/finance.js";

const base = {
  businessId:"biz-1",activityId:"shop",cashRegisterId:"cash-shop",
  type:"income",amountMinor:10000,paymentMethod:"cash",reason:"Vente comptoir",
  authorUid:"uid-1",reference:"TX-001",status:"executed"
};

test("valide une recette en XOF et refuse un montant non entier",()=>{
  assert.equal(finance.validateTransaction(base).valid,true);
  assert.equal(finance.validateTransaction({...base,amountMinor:10.5}).valid,false);
});

test("une opération en attente ou approuvée ne modifie pas le solde",()=>{
  const rows=[
    {...base,amountMinor:5000,status:"pending"},
    {...base,amountMinor:3000,status:"approved"}
  ];
  assert.equal(finance.balanceForRegister(rows,"cash-shop",20000),20000);
});

test("seules les opérations exécutées modifient la caisse",()=>{
  const rows=[
    {...base,amountMinor:10000,type:"income"},
    {...base,amountMinor:2500,type:"expense"}
  ];
  assert.equal(finance.balanceForRegister(rows,"cash-shop",1000),8500);
});

test("un transfert débite la source et crédite la destination sans devenir un revenu",()=>{
  const transfer={
    ...base,type:"transfer",amountMinor:4000,cashRegisterId:"activity-cash",
    destinationCashRegisterId:"central-treasury",destinationActivityId:"shop"
  };
  assert.equal(finance.validateTransaction(transfer).valid,true);
  assert.equal(finance.balanceForRegister([transfer],"activity-cash",10000),6000);
  assert.equal(finance.balanceForRegister([transfer],"central-treasury",2000),6000);
  assert.deepEqual(finance.profitAndLoss([transfer]),{incomeMinor:0,expenseMinor:0,resultMinor:0});
});

test("le compte de résultat exclut les transferts internes",()=>{
  const rows=[
    {...base,type:"income",amountMinor:20000},
    {...base,type:"expense",amountMinor:7000},
    {...base,type:"transfer",amountMinor:9000,destinationCashRegisterId:"central",destinationActivityId:"shop"}
  ];
  assert.deepEqual(finance.profitAndLoss(rows),{incomeMinor:20000,expenseMinor:7000,resultMinor:13000});
});

test("les transitions d'approbation sont contrôlées et irréversibles après exécution",()=>{
  assert.equal(finance.validateTransition("pending","approved"),true);
  assert.equal(finance.validateTransition("approved","executed"),true);
  assert.equal(finance.validateTransition("executed","cancelled"),false);
  assert.equal(finance.validateTransition("pending","executed"),false);
});

test("interdit les transferts vers la même caisse et les références vides",()=>{
  assert.equal(finance.validateTransaction({...base,type:"transfer",destinationCashRegisterId:"cash-shop"}).valid,false);
  assert.equal(finance.validateTransaction({...base,reference:" "}).valid,false);
});

test("la création normalise la devise et conserve la référence",()=>{
  const tx=finance.createTransaction(base);
  assert.equal(tx.currency,"XOF");
  assert.equal(tx.reference,"TX-001");
  assert.throws(()=>finance.createTransaction({...base,amountMinor:0}),TypeError);
});
