import test from "node:test";
import assert from "node:assert/strict";
import hr from "../mon-business/hr.js";
test("valide un pointage horodaté sans géolocalisation",()=>{
 assert.equal(hr.validateAttendance({businessId:"biz",activityId:"shop",employeeUid:"emp",authorUid:"emp",type:"check_in",occurredAt:new Date()}).valid,true);
});
test("une correction de pointage exige motif et auteur",()=>{
 assert.equal(hr.validateAttendance({businessId:"biz",activityId:"shop",employeeUid:"emp",authorUid:"manager",type:"correction",occurredAt:new Date()}).valid,false);
});
test("valide une demande de congé et refuse une période inversée",()=>{
 const common={businessId:"biz",activityId:"shop",employeeUid:"emp",reason:"Congé annuel",status:"pending"};
 assert.equal(hr.validateLeaveRequest({...common,startDate:new Date("2026-12-01"),endDate:new Date("2026-12-05")}).valid,true);
 assert.equal(hr.validateLeaveRequest({...common,startDate:new Date("2026-12-05"),endDate:new Date("2026-12-01")}).valid,false);
});
test("une décision de refus doit contenir un motif et être prise par un responsable",()=>{
 assert.equal(hr.leaveTransition("pending","rejected",{actorRole:"activity_manager"}),false);
 assert.equal(hr.leaveTransition("pending","rejected",{actorRole:"activity_manager",reason:"Effectif insuffisant"}),true);
 assert.equal(hr.leaveTransition("pending","approved",{actorRole:"employee"}),false);
});
test("prépare une paie en FCFA sans effectuer le paiement",()=>{
 const preview=hr.calculatePayrollPreview({baseMinor:100000,hourlyRateMinor:500,hours:10,bonusMinor:5000,advancesMinor:10000});
 assert.equal(preview.grossMinor,110000);
 assert.equal(preview.netMinor,100000);
 assert.equal(preview.requiresValidation,true);
 assert.equal(preview.paid,false);
});
test("n'autorise pas l'employé à lire les dossiers RH dans le paramétrage choisi",()=>{
 assert.equal(hr.canEmployeeReadHRRecord({recordType:"payslip",actorRole:"employee"}),false);
 assert.equal(hr.canEmployeeReadHRRecord({recordType:"payslip",actorRole:"owner"}),true);
});
