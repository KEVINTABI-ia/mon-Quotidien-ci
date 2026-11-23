import test from "node:test";
import assert from "node:assert/strict";
import resources from "../mon-business/resources.js";

test("valide un fournisseur et vérifie ses coordonnées",()=>{
 assert.equal(resources.validateSupplier({businessId:"biz",name:"Fournisseur A",authorUid:"owner",email:"contact@example.ci",phone:"+2250700000000",status:"active"}).valid,true);
 assert.equal(resources.validateSupplier({businessId:"biz",name:"Fournisseur A",authorUid:"owner",email:"adresse-invalide"}).valid,false);
});
test("valide un équipement rattaché à une activité",()=>{
 const asset={businessId:"biz",activityId:"transport",name:"Tricycle 01",category:"vehicle",assetCode:"TRI-01",authorUid:"owner",status:"active",purchaseValueMinor:2500000,purchaseDate:new Date("2026-01-01")};
 assert.equal(resources.validateAsset(asset).valid,true);
 assert.equal(resources.validateAsset({...asset,status:"unknown"}).valid,false);
});
test("un dossier de maintenance terminé exige son coût réel",()=>{
 const job={businessId:"biz",activityId:"transport",assetId:"asset-1",reference:"MAINT-1",description:"Révision moteur",authorUid:"manager",status:"completed"};
 assert.equal(resources.validateMaintenance(job).valid,false);
 assert.equal(resources.validateMaintenance({...job,actualCostMinor:35000}).valid,true);
});
test("contrôle les étapes et les autorisations de transfert d'équipement",()=>{
 assert.equal(resources.canTransitionMaintenance("reported","quoted"),true);
 assert.equal(resources.canTransitionMaintenance("reported","completed"),false);
 assert.equal(resources.canTransferAsset({assetStatus:"active",sourceActivityId:"transport",destinationActivityId:"commerce",approvedByUid:"owner"}),true);
 assert.equal(resources.canTransferAsset({assetStatus:"immobilized",sourceActivityId:"transport",destinationActivityId:"commerce",approvedByUid:"owner"}),false);
});
test("additionne uniquement les coûts de maintenance exécutés",()=>{
 assert.equal(resources.maintenanceTotalMinor([{status:"completed",actualCostMinor:10000},{status:"approved",estimatedCostMinor:5000},{status:"completed",actualCostMinor:2500}]),12500);
});
