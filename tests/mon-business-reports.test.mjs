import test from "node:test";
import assert from "node:assert/strict";
import reports from "../mon-business/reports.js";
const tx=[
 {businessId:"biz",activityId:"shop-a",type:"income",status:"executed",amountMinor:10000},
 {businessId:"biz",activityId:"shop-a",type:"expense",status:"executed",amountMinor:3000},
 {businessId:"biz",activityId:"shop-b",type:"income",status:"executed",amountMinor:9000},
 {businessId:"biz",activityId:"shop-a",type:"income",status:"pending",amountMinor:5000},
 {businessId:"other",activityId:"shop-a",type:"income",status:"executed",amountMinor:50000}
];
test("un responsable d'activité ne voit que son périmètre financier",()=>{
 const summary=reports.summarizeFinance(tx,{businessId:"biz",activityIds:["shop-a"]});
 assert.equal(summary.incomeMinor,10000);
 assert.equal(summary.expenseMinor,3000);
 assert.equal(summary.resultMinor,7000);
});
test("la direction peut consolider les activités de son entreprise seulement",()=>{
 const summary=reports.summarizeFinance(tx,{businessId:"biz",canViewAll:true});
 assert.equal(summary.incomeMinor,19000);
 assert.equal(summary.transactionCount,3);
});
test("signale les données manquantes sans les remplacer par zéro",()=>{
 assert.deepEqual(reports.completeness(["amount","authorUid"],{amount:100}),{complete:false,missing:["authorUid"]});
});
test("compare uniquement les activités autorisées",()=>{
 const result=reports.compareActivities(tx,{businessId:"biz",activityIds:["shop-a"]});
 assert.equal(result.length,1);
 assert.equal(result[0].activityId,"shop-a");
});
test("détecte une baisse de revenus uniquement avec une base comparable",()=>{
 assert.equal(reports.detectRevenueDrop({currentMinor:7000,previousMinor:10000,thresholdPercent:20}).alert,true);
 assert.equal(reports.detectRevenueDrop({currentMinor:100,previousMinor:0}).reason,"no_comparable_baseline");
});
