/**
 * Mon Business — moteur de circuit d'approbation multi-étapes.
 * La persistance, l'identité de l'acteur et les notifications restent côté serveur.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MonBusinessApprovals=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const clean=v=>typeof v==="string"?v.trim():"";
 const STATUSES=Object.freeze(["pending","approved","rejected","cancelled"]);
 function validateWorkflow(w={}){
  const errors=[];
  for(const k of ["businessId","activityId","operationType","authorUid"])if(!clean(w[k]))errors.push(k);
  if(!Array.isArray(w.stages)||w.stages.length===0)errors.push("stages");
  else w.stages.forEach((stage,i)=>{
   if(!clean(stage.approverRole)&&!clean(stage.approverUid))errors.push("stages."+i+".approver");
   if(!Number.isSafeInteger(stage.maxAmountMinor)||stage.maxAmountMinor<0)errors.push("stages."+i+".maxAmountMinor");
  });
  return {valid:errors.length===0,errors};
 }
 function createRequest({workflow,amountMinor,operationType,authorUid,reference,reason}={}){
  const check=validateWorkflow(workflow);
  if(!check.valid)throw new TypeError("Circuit d'approbation invalide : "+check.errors.join(", "));
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||operationType!==workflow.operationType||!clean(authorUid)||!clean(reference)||!clean(reason)){
   throw new TypeError("Demande d'approbation incomplète.");
  }
  const stageIndex=workflow.stages.findIndex(s=>amountMinor<=s.maxAmountMinor);
  if(stageIndex<0)throw new RangeError("Aucun circuit configuré pour ce montant.");
  return Object.freeze({
   businessId:workflow.businessId,activityId:workflow.activityId,operationType,
   amountMinor,authorUid,reference,reason:clean(reason),
   status:"pending",currentStage:0,requiredStages:workflow.stages.slice(0,stageIndex+1),
   decisions:[]
  });
 }
 function decide(request,{actorUid,actorRole,decision,reason,occurredAt}={}){
  if(!request||request.status!=="pending")throw new Error("Demande non modifiable.");
  if(!clean(actorUid)||actorUid===request.authorUid)throw new Error("L'auteur ne peut pas approuver sa propre demande.");
  if(!["approve","reject"].includes(decision))throw new TypeError("Décision invalide.");
  const stage=request.requiredStages[request.currentStage];
  if(!stage)throw new Error("Étape d'approbation introuvable.");
  if(stage.approverUid?stage.approverUid!==actorUid:stage.approverRole!==actorRole)throw new Error("Approbateur non autorisé.");
  if(request.decisions.some(d=>d.actorUid===actorUid))throw new Error("Décision en double.");
  if(decision==="reject"&&!clean(reason))throw new Error("Un motif est obligatoire pour refuser.");
  if(!(occurredAt instanceof Date)||Number.isNaN(occurredAt.getTime()))throw new TypeError("Horodatage invalide.");
  const decisions=request.decisions.concat([{actorUid,actorRole,decision,reason:clean(reason),occurredAt:occurredAt.toISOString()}]);
  if(decision==="reject")return Object.freeze({...request,status:"rejected",decisions});
  const next=request.currentStage+1;
  return Object.freeze({...request,status:next>=request.requiredStages.length?"approved":"pending",currentStage:next,decisions});
 }
 return Object.freeze({STATUSES,validateWorkflow,createRequest,decide});
});
