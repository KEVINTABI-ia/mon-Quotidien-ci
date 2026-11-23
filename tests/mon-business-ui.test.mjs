import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync("mon-business.html","utf8");
test("la page Mon Business contient les contrôles d'enregistrement et d'activités",()=>{
  for(const id of ["businessName","legalStatus","registrationNumber","activityName","activityType","createBusiness","addActivity","activities"]) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
});
test("l'initialisation Firebase utilise la configuration du projet existant",()=>{
  assert.match(html,/projectId:"mon-transport-ci"/);
  assert.match(html,/firebase\.auth\(\)/);
  assert.match(html,/firebase\.firestore\(\)/);
});
test("les écritures d'entreprise créent propriétaire et entreprise dans le même batch",()=>{
  assert.match(html,/const batch=db\.batch\(\)/);
  assert.match(html,/batch\.set\(ref\.collection\("members"\)\.doc\(currentUser\.uid\)/);
  assert.match(html,/await batch\.commit\(\)/);
});
test("la création d'activité vérifie l'entreprise courante et associe le créateur",()=>{
  assert.match(html,/if\(!currentBusinessId\|\|!currentUser\)/);
  assert.match(html,/createdBy:currentUser\.uid/);
  assert.match(html,/businessId:currentBusinessId/);
});
test("le script intégré de la page ne contient pas d'erreur de syntaxe",()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new vm.Script(scripts[0],{filename:"mon-business.html"}));
});
