/**
 * Mon Business — rapports et indicateurs consolidés.
 * N'invente aucune donnée : les champs absents sont signalés comme incomplets.
 */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MonBusinessReports=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const clean=v=>typeof v==="string"?v.trim():"";
 function filterByScope(rows,{businessId,activityIds,canViewAll=false}={}){
  if(!clean(businessId))return [];
  return (rows||[]).filter(row=>row.businessId===businessId&&(
   canViewAll||(Array.isArray(activityIds)&&activityIds.includes(row.activityId))
  ));
 }
 function summarizeFinance(transactions,{businessId,activityIds,canViewAll=false}={}){
  const rows=filterByScope(transactions,{businessId,activityIds,canViewAll})
   .filter(x=>x.status==="executed"&&["income","expense"].includes(x.type));
  let incomeMinor=0,expenseMinor=0;
  for(const row of rows){
   if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<0)throw new TypeError("Montant financier invalide.");
   if(row.type==="income")incomeMinor+=row.amountMinor;
   else expenseMinor+=row.amountMinor;
  }
  if(!Number.isSafeInteger(incomeMinor)||!Number.isSafeInteger(expenseMinor))throw new RangeError("Total financier trop élevé.");
  return {incomeMinor,expenseMinor,resultMinor:incomeMinor-expenseMinor,transactionCount:rows.length,source:"validated_records"};
 }
 function completeness(requiredFields,record){
  const missing=requiredFields.filter(key=>record?.[key]===undefined||record?.[key]===null||record?.[key]==="");
  return {complete:missing.length===0,missing};
 }
 function compareActivities(rows,{businessId,activityIds}={}){
  const scoped=filterByScope(rows,{businessId,activityIds});
  const ids=[...new Set(scoped.map(x=>x.activityId).filter(Boolean))];
  return ids.map(activityId=>{
   const selected=scoped.filter(x=>x.activityId===activityId);
   const totals=summarizeFinance(selected,{businessId,activityIds:[activityId]});
   return {activityId,...totals};
  });
 }
 function detectRevenueDrop({currentMinor,previousMinor,thresholdPercent=20}={}){
  if(!Number.isSafeInteger(currentMinor)||currentMinor<0||!Number.isSafeInteger(previousMinor)||previousMinor<0
    ||typeof thresholdPercent!=="number"||thresholdPercent<=0||thresholdPercent>100)throw new TypeError("Paramètres d'analyse invalides.");
  if(previousMinor===0)return {alert:false,reason:"no_comparable_baseline"};
  const dropPercent=(previousMinor-currentMinor)/previousMinor*100;
  return {alert:dropPercent>=thresholdPercent,dropPercent:Number(dropPercent.toFixed(2)),thresholdPercent};
 }
 return Object.freeze({filterByScope,summarizeFinance,completeness,compareActivities,detectRevenueDrop});
});
