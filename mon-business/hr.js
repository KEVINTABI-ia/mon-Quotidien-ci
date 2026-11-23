/**
 * Mon Business — primitives RH : présence, congés et préparation de paie.
 * Ne calcule pas un bulletin légal définitif et n'autorise aucun paiement.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MonBusinessHR=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const clean=v=>typeof v==="string"?v.trim():"";
 const LEAVE=["pending","approved","rejected","cancelled"];
 function validateAttendance(event={}){
  const errors=[];
  for(const k of ["businessId","activityId","employeeUid","authorUid","type"])if(!clean(event[k]))errors.push(k);
  if(!["check_in","check_out","correction"].includes(event.type))errors.push("type");
  if(!(event.occurredAt instanceof Date)||Number.isNaN(event.occurredAt.getTime()))errors.push("occurredAt");
  if(event.type==="correction"&&(!clean(event.reason)||!clean(event.correctedBy)))errors.push("correctionAudit");
  return {valid:errors.length===0,errors};
 }
 function validateLeaveRequest(request={}){
  const errors=[];
  for(const k of ["businessId","activityId","employeeUid","reason"])if(!clean(request[k]))errors.push(k);
  if(!(request.startDate instanceof Date)||!(request.endDate instanceof Date)
    ||Number.isNaN(request.startDate?.getTime())||Number.isNaN(request.endDate?.getTime())
    ||request.endDate<request.startDate)errors.push("dateRange");
  if(!LEAVE.includes(request.status||"pending"))errors.push("status");
  return {valid:errors.length===0,errors};
 }
 function leaveTransition(current,next,{actorRole,reason}={}){
  if(current!=="pending"||!["approved","rejected","cancelled"].includes(next))return false;
  if(next==="cancelled")return actorRole==="employee"||actorRole==="owner";
  return ["activity_manager","general_director","owner"].includes(actorRole)
    &&(next!=="rejected"||clean(reason).length>0);
 }
 function calculatePayrollPreview({baseMinor=0,hourlyRateMinor=0,hours=0,dailyRateMinor=0,days=0,missionPayMinor=0,bonusMinor=0,commissionMinor=0,overtimeMinor=0,advancesMinor=0,deductionsMinor=0}={}){
  const values=[baseMinor,hourlyRateMinor,hours,dailyRateMinor,days,missionPayMinor,bonusMinor,commissionMinor,overtimeMinor,advancesMinor,deductionsMinor];
  if(values.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<0))throw new TypeError("Donnée de paie invalide.");
  const gross=baseMinor+Math.round(hourlyRateMinor*hours)+Math.round(dailyRateMinor*days)+missionPayMinor+bonusMinor+commissionMinor+overtimeMinor;
  const net=gross-advancesMinor-deductionsMinor;
  if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(net)||net<0)throw new RangeError("Net à payer invalide.");
  return Object.freeze({grossMinor:gross,advancesMinor,deductionsMinor,netMinor:net,requiresValidation:true,paid:false});
 }
 function canEmployeeReadHRRecord({recordType,actorRole}={}){
  return actorRole==="owner"||actorRole==="hr_authorized";
 }
 return Object.freeze({LEAVE,validateAttendance,validateLeaveRequest,leaveTransition,calculatePayrollPreview,canEmployeeReadHRRecord});
});
