import test from "node:test";
import assert from "node:assert/strict";
import approvals from "../mon-business/approvals.js";
const workflow={businessId:"biz",activityId:"shop",operationType:"expense",authorUid:"owner",stages:[
 {approverRole:"activity_manager",maxAmountMinor:50000},
 {approverRole:"owner",maxAmountMinor:500000}
]};
test("valide un circuit multi-étapes et choisit les étapes selon le montant",()=>{
 assert.equal(approvals.validateWorkflow(workflow).valid,true);
 const small=approvals.createRequest({workflow,amountMinor:30000,operationType:"expense",authorUid:"cashier",reference:"EXP-1",reason:"Achat fournitures"});
 assert.equal(small.requiredStages.length,1);
 const large=approvals.createRequest({workflow,amountMinor:200000,operationType:"expense",authorUid:"cashier",reference:"EXP-2",reason:"Réparation"});
 assert.equal(large.requiredStages.length,2);
});
test("exige une approbation successive par les responsables configurés",()=>{
 let req=approvals.createRequest({workflow,amountMinor:200000,operationType:"expense",authorUid:"cashier",reference:"EXP-3",reason:"Réparation"});
 req=approvals.decide(req,{actorUid:"manager-1",actorRole:"activity_manager",decision:"approve",occurredAt:new Date()});
 assert.equal(req.status,"pending");
 assert.equal(req.currentStage,1);
 req=approvals.decide(req,{actorUid:"owner-2",actorRole:"owner",decision:"approve",occurredAt:new Date()});
 assert.equal(req.status,"approved");
});
test("interdit auto-approbation, refus sans motif et décision en double",()=>{
 const req=approvals.createRequest({workflow,amountMinor:30000,operationType:"expense",authorUid:"cashier",reference:"EXP-4",reason:"Achat"});
 assert.throws(()=>approvals.decide(req,{actorUid:"cashier",actorRole:"activity_manager",decision:"approve",occurredAt:new Date()}),/auteur/);
 assert.throws(()=>approvals.decide(req,{actorUid:"manager-1",actorRole:"activity_manager",decision:"reject",occurredAt:new Date()}),/motif/);
 const done=approvals.decide(req,{actorUid:"manager-1",actorRole:"activity_manager",decision:"approve",occurredAt:new Date()});
 assert.throws(()=>approvals.decide(done,{actorUid:"manager-1",actorRole:"activity_manager",decision:"approve",occurredAt:new Date()}),/non modifiable/);
});
test("refuse un approbateur non autorisé et les montants sans règle",()=>{
 const req=approvals.createRequest({workflow,amountMinor:30000,operationType:"expense",authorUid:"cashier",reference:"EXP-5",reason:"Achat"});
 assert.throws(()=>approvals.decide(req,{actorUid:"stranger",actorRole:"employee",decision:"approve",occurredAt:new Date()}),/non autorisé/);
 assert.throws(()=>approvals.createRequest({workflow,amountMinor:900000,operationType:"expense",authorUid:"cashier",reference:"EXP-6",reason:"Achat"}),RangeError);
});
