import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync("mon-business/index.html","utf8");
const worker=fs.readFileSync("cloudflare/mon-business-worker/worker.js","utf8");
test("la page avancée charge Firebase et sa configuration du Worker",()=>{
  assert.match(html,/firebase-auth-compat\.js/);
  assert.match(html,/firebase-firestore-compat\.js/);
  assert.match(html,/<script src="\.\/config\.js"><\/script>/);
  assert.match(html,/window\.MON_BUSINESS_API/);
});
test("l'espace expose création entreprise, activités et invitations WhatsApp",()=>{
  for(const id of ["businessForm","activityForm","inviteForm","inviteEmail","inviteRole","inviteActivities","copyInviteLink","shareInviteLink","membersList","invitationsList"]) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/wa\.me/);
});
test("les invitations utilisent le Worker et ne sont pas écrites depuis le navigateur",()=>{
  for(const route of ["/v1/invitations","/v1/invitations/list","/v1/invitations/accept","/v1/invitations/revoke","/v1/members/update"]) assert.ok(html.includes(route));
  assert.match(html,/getIdToken\(\)/);
  assert.match(worker,/emailVerified\s*!==\s*true/);
});
test("les scripts intégrés de la page sont syntaxiquement valides",()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.equal(scripts.length,1);
  for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:"mon-business/index.html"}));
});

test("le nouvel onboarding expose le code de rattachement et l'espace de tâches",()=>{
  for(const id of ["joinActivityForm","activityJoinCode","managerTaskForm","employeeTasksCard","activityJoinRequestsList"]) assert.match(html,new RegExp('id="'+id+'"'));
  for(const route of ["/v1/activities/join-code/create","/v1/activities/join-requests/create","/v1/activities/join-requests/list","/v1/activities/join-requests/review","/v1/activities/members/list","/v1/activities/tasks/create","/v1/activities/tasks/list","/v1/activities/tasks/update-status"]) assert.ok(html.includes(route)||worker.includes(route));
  assert.match(html,/Demande envoyée/);
});
test("les nouveaux parcours de rattachement et de tâches sont routés côté Worker",()=>{
  for(const route of ["/v1/activities/join-code/create","/v1/activities/join-requests/create","/v1/activities/join-requests/list","/v1/activities/join-requests/review","/v1/activities/members/list","/v1/activities/tasks/create","/v1/activities/tasks/list","/v1/activities/tasks/update-status"]) assert.ok(worker.includes(route));
  assert.match(worker,/allDescendants:true/);
  assert.match(worker,/manage_access/);
});
