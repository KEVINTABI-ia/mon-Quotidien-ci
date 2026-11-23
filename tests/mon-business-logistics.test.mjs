import test from "node:test";
import assert from "node:assert/strict";
import logistics from "../mon-business/logistics.js";
const mission={businessId:"biz",activityId:"shop",orderId:"ord-1",reference:"DL-1",authorUid:"owner",providerType:"internal",status:"assigned",providerUid:"driver-1",employeeUid:"driver-1"};
test("valide une mission interne attribuée",()=>assert.equal(logistics.validateMission(mission).valid,true));
test("refuse une mission externe sans partenaire identifié",()=>assert.equal(logistics.validateMission({...mission,providerType:"external",employeeUid:undefined}).valid,false));
test("un livreur ne peut accepter la mission d'un autre",()=>{
 assert.equal(logistics.acceptAssignment({status:"assigned",assignedProviderUid:"driver-1",acceptingProviderUid:"driver-2"}).accepted,false);
 assert.equal(logistics.acceptAssignment({status:"assigned",assignedProviderUid:"driver-1",acceptingProviderUid:"driver-1"}).status,"pickup_in_progress");
});
test("contrôle les étapes de livraison",()=>{
 assert.equal(logistics.canTransition("waiting_assignment","assigned"),true);
 assert.equal(logistics.canTransition("delivery_in_progress","delivered"),true);
 assert.equal(logistics.canTransition("waiting_assignment","delivered"),false);
});
test("exige une preuve réelle de livraison",()=>{
 assert.equal(logistics.validateProof({type:"customer_confirmation",confirmed:true}).valid,true);
 assert.equal(logistics.validateProof({type:"photo"}).valid,false);
 assert.equal(logistics.validateProof({type:"signature",signatureRef:"proof/signature-1"}).valid,true);
});
test("calcule un tarif fixe et combiné sans inventer de GPS",()=>{
 assert.equal(logistics.deliveryPrice({pricingMode:"fixed",baseMinor:1000,minimumMinor:500}),1000);
 assert.equal(logistics.deliveryPrice({pricingMode:"combined",baseMinor:500,zoneMinor:200,distanceKm:3,perKmMinor:100,weightKg:2,perKgMinor:50}),1100);
 assert.throws(()=>logistics.deliveryPrice({pricingMode:"unknown"}),TypeError);
});
