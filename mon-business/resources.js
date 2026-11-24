/**
 * Mon Business — fournisseurs, équipements et maintenance.
 * Primitives de validation indépendantes de toute persistance.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MonBusinessResources=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const clean=v=>typeof v==="string"?v.trim():"";
 const ASSET_STATES=Object.freeze(["active","maintenance","immobilized","transferred","retired"]);
 const MAINTENANCE_STATES=Object.freeze(["reported","quoted","approved","in_progress","completed","rejected","cancelled"]);
 function validateSupplier(s={}){
  const errors=[];
  for(const k of ["businessId","name","authorUid"])if(!clean(s[k]))errors.push(k);
  if(s.email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)))errors.push("email");
  if(s.phone&&clean(s.phone).length<6)errors.push("phone");
  if(s.status&&!["active","inactive","blocked"].includes(s.status))errors.push("status");
  return {valid:errors.length===0,errors};
 }
 function validateAsset(a={}){
  const errors=[];
  for(const k of ["businessId","activityId","name","category","assetCode","authorUid"])if(!clean(a[k]))errors.push(k);
  if(!ASSET_STATES.includes(a.status))errors.push("status");
  if(a.purchaseValueMinor!==undefined&&(!Number.isSafeInteger(a.purchaseValueMinor)||a.purchaseValueMinor<0))errors.push("purchaseValueMinor");
  if(a.purchaseDate!==undefined&&(!(a.purchaseDate instanceof Date)||Number.isNaN(a.purchaseDate.getTime())))errors.push("purchaseDate");
  return {valid:errors.length===0,errors};
 }
 function validateMaintenance(job={}){
  const errors=[];
  for(const k of ["businessId","activityId","assetId","reference","description","authorUid"])if(!clean(job[k]))errors.push(k);
  if(!MAINTENANCE_STATES.includes(job.status))errors.push("status");
  if(job.estimatedCostMinor!==undefined&&(!Number.isSafeInteger(job.estimatedCostMinor)||job.estimatedCostMinor<0))errors.push("estimatedCostMinor");
  if(job.actualCostMinor!==undefined&&(!Number.isSafeInteger(job.actualCostMinor)||job.actualCostMinor<0))errors.push("actualCostMinor");
  if(job.status==="completed"&&job.actualCostMinor===undefined)errors.push("actualCostMinor");
  if(job.status==="rejected"&&!clean(job.rejectionReason))errors.push("rejectionReason");
  return {valid:errors.length===0,errors};
 }
 function canTransitionMaintenance(current,next){
  const flow={
   reported:["quoted","rejected","cancelled"],
   quoted:["approved","rejected","cancelled"],
   approved:["in_progress","cancelled"],
   in_progress:["completed","cancelled"],
   completed:[],rejected:[],cancelled:[]
  };
  return Boolean(flow[current]&&flow[current].includes(next));
 }
 function canTransferAsset({assetStatus,destinationActivityId,sourceActivityId,approvedByUid}={}){
  return assetStatus==="active"&&clean(sourceActivityId)!==""&&clean(destinationActivityId)!==""
   &&sourceActivityId!==destinationActivityId&&clean(approvedByUid)!=="";
 }
 function maintenanceTotalMinor(jobs=[]){
  let total=0;
  for(const job of jobs){
   if(job.status!=="completed")continue;
   if(!Number.isSafeInteger(job.actualCostMinor)||job.actualCostMinor<0)throw new TypeError("Coût de maintenance invalide.");
   total+=job.actualCostMinor;
   if(!Number.isSafeInteger(total))throw new RangeError("Total de maintenance trop élevé.");
  }
  return total;
 }
 return Object.freeze({ASSET_STATES,MAINTENANCE_STATES,validateSupplier,validateAsset,validateMaintenance,canTransitionMaintenance,canTransferAsset,maintenanceTotalMinor});
});
