import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync("mon-business.html","utf8");
test("la page MON BUSINESS expose la navigation des modules métier",()=>{
  for(const module of ["overview","produit","client","vente","achat","personnel","reports"]) {
    assert.match(html,new RegExp('data-module="'+module+'"'));
    assert.match(html,new RegExp('id="module-'+module+'"'));
  }
});
test("les modules métier utilisent les routes API protégées",()=>{
  for(const route of ["/api/mon-business/dashboard","/api/mon-business/modules/","/api/mon-business/transaction"]) {
    assert.ok(html.includes(route), "route absente : "+route);
  }
  assert.match(html,/Authorization:\s*["']Bearer/);
  assert.match(html,/X-MON-BUSINESS-PASSWORD/);
});
test("la page demande une authentification et un accès MON BUSINESS dédié",()=>{
  assert.match(html,/firebase\.auth\(\)/);
  assert.match(html,/getIdToken\(\)/);
  assert.match(html,/activeBusinessPassword/);
});
test("la page contient les formulaires des principaux modules",()=>{
  for(const id of ["p-name","c-name","v-label","a-label","s-name","reportsContent"]) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
});
test("le script intégré de la page ne contient pas d'erreur de syntaxe",()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.ok(scripts.length>=1);
  for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:"mon-business.html"}));
});
