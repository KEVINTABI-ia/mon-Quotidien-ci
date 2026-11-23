/**
 * Mon Business — moteur de livraison et missions.
 * N'expose aucune position GPS et ne simule aucun suivi en temps réel.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MonBusinessLogistics=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const clean=v=>typeof v==="string"?v.trim():"";
 const STATES=Object.freeze(["waiting_assignment","assigned","pickup_in_progress","delivery_in_progress","delivered","failed","cancelled"]);
 const FLOW={
  waiting_assignment:["assigned","cancelled"],
  assigned:["waiting_assignment","pickup_in_progress","cancelled"],
  pickup_in_progress:["delivery_in_progress","failed","cancelled"],
  delivery_in_progress:["delivered","failed","cancelled"],
  delivered:[],failed:["waiting_assignment"],cancelled:[]
 };
 function validateMission(m={}){
  const errors=[];
  for(const key of ["businessId","activityId","orderId","reference","authorUid","providerType"])if(!clean(m[key]))errors.push(key);
  if(!STATES.includes(m.status))errors.push("status");
  if(!["internal","external"].includes(m.providerType))errors.push("providerType");
  if(m.status!=="waiting_assignment"&&!clean(m.providerUid))errors.push("providerUid");
  if(m.providerType==="internal"&&!clean(m.employeeUid))errors.push("employeeUid");
  if(m.providerType==="external"&&!clean(m.externalPartnerId))errors.push("externalPartnerId");
  return {valid:errors.length===0,errors};
 }
 function canTransition(current,next){return Boolean(FLOW[current]&&FLOW[current].includes(next));}
 function acceptAssignment({status,assignedProviderUid,acceptingProviderUid}={}){
  if(status!=="assigned"||!clean(assignedProviderUid)||assignedProviderUid!==acceptingProviderUid)return {accepted:false,reason:"assignment_mismatch"};
  return {accepted:true,status:"pickup_in_progress"};
 }
 function validateProof(proof={}){
  const validTypes=["signature","photo","customer_confirmation"];
  if(!validTypes.includes(proof.type))return {valid:false,reason:"invalid_type"};
  if(proof.type==="signature"&&!clean(proof.signatureRef))return {valid:false,reason:"missing_signature"};
  if(proof.type==="photo"&&!clean(proof.photoRef))return {valid:false,reason:"missing_photo"};
  if(proof.type==="customer_confirmation"&&proof.confirmed!==true)return {valid:false,reason:"not_confirmed"};
  return {valid:true};
 }
 function deliveryPrice({pricingMode,baseMinor=0,distanceKm=0,zoneMinor=0,weightKg=0,perKmMinor=0,perKgMinor=0,minimumMinor=0,surchargeMinor=0}={}){
  if(!["fixed","zone","distance","combined"].includes(pricingMode))throw new TypeError("Mode tarifaire invalide.");
  const values=[baseMinor,distanceKm,zoneMinor,weightKg,perKmMinor,perKgMinor,minimumMinor,surchargeMinor];
  if(values.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<0))throw new TypeError("Paramètre tarifaire invalide.");
  let total=baseMinor;
  if(pricingMode==="zone"||pricingMode==="combined")total+=zoneMinor;
  if(pricingMode==="distance"||pricingMode==="combined")total+=distanceKm*perKmMinor;
  if(pricingMode==="combined")total+=weightKg*perKgMinor;
  total=Math.max(total,minimumMinor)+surchargeMinor;
  if(!Number.isSafeInteger(Math.round(total)))throw new RangeError("Tarif trop élevé.");
  return Math.round(total);
 }
 return Object.freeze({STATES,validateMission,canTransition,acceptAssignment,validateProof,deliveryPrice});
});
