import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { cleanEmail, validatePermissions, validateActivityIds, toValue, fromValue, decodeDocument, inviteLink, enforceRateLimit, auditData } from "../cloudflare/mon-business-worker/worker.js";

test("normalise les e-mails et refuse les formats invalides",()=>{
  assert.equal(cleanEmail("  COLLABORATEUR@EXAMPLE.CI "), "collaborateur@example.ci");
  assert.throws(()=>cleanEmail("adresse-invalide"),/invalid_email/);
});

test("les permissions acceptent uniquement les clés connues et des booléens",()=>{
  assert.deepEqual(validatePermissions({view:true,edit:false}),{view:true,edit:false});
  assert.throws(()=>validatePermissions({owner:true}),/invalid_permissions/);
  assert.throws(()=>validatePermissions({view:"yes"}),/invalid_permissions/);
  assert.throws(()=>validatePermissions({view:false}),/invalid_permissions/);
  assert.throws(()=>validatePermissions([]),/invalid_permissions/);
});

test("les activités sont validées et dédupliquées",()=>{
  assert.deepEqual(validateActivityIds(["shop-a","shop-a","shop-b"]),["shop-a","shop-b"]);
  assert.throws(()=>validateActivityIds(["activité avec espace"]),/invalid_activity_ids/);
  assert.throws(()=>validateActivityIds("shop-a"),/invalid_activity_ids/);
});

test("encode et décode les types Firestore utilisés par les invitations",()=>{
  const value={string:"hello",number:123,enabled:true,at:new Date("2026-11-23T12:00:00.000Z"),items:["a","b"],nested:{ok:true}};
  const encoded=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,toValue(v)]));
  const decoded=decodeDocument({fields:encoded});
  assert.equal(decoded.string,"hello");
  assert.equal(decoded.number,123);
  assert.equal(decoded.enabled,true);
  assert.equal(decoded.at,"2026-11-23T12:00:00.000Z");
  assert.deepEqual(decoded.items,["a","b"]);
  assert.deepEqual(decoded.nested,{ok:true});
  assert.equal(fromValue({nullValue:null}),null);
});

test("le lien d'invitation garde le jeton dans le fragment URL",()=>{
  const link=inviteLink("invite_123","secret-token");
  assert.match(link,/mon-business\/index\.html#invitation=invite_123&token=secret-token$/);
  assert.equal(new URL(link).search,"");
});


test("la limitation de débit accepte une requête sous le seuil",async()=>{
  await assert.doesNotReject(()=>enforceRateLimit({limit:async()=>({success:true})},"user-1"));
});

test("la limitation de débit refuse une requête au-dessus du seuil",async()=>{
  await assert.rejects(()=>enforceRateLimit({limit:async()=>({success:false})},"user-1"),/rate_limit_exceeded/);
});

test("la limitation de débit échoue de façon fermée si le binding manque",async()=>{
  await assert.rejects(()=>enforceRateLimit(undefined,"user-1"),/rate_limiter_unavailable/);
});

test("les journaux distinguent correctement les invitations et les membres",()=>{
  const now=new Date("2026-11-24T00:00:00.000Z");
  assert.equal(auditData({businessId:"b1",actorUid:"u1",action:"invitation.created",entityId:"i1",now}).entityType,"invitation");
  assert.equal(auditData({businessId:"b1",actorUid:"u1",action:"member.access_updated",entityType:"member",entityId:"u2",now}).entityType,"member");
});

test("la page multi-activités charge sa configuration et son script est syntaxiquement valide",()=>{
  const html=fs.readFileSync("mon-business/index.html","utf8");
  const config=fs.readFileSync("mon-business/config.js","utf8");
  assert.match(html,/<script src="\\.\/config\\.js"><\\/script>/);
  assert.match(config,/window\\.MON_BUSINESS_API\\s*=\\s*["']["']/);
  assert.ok(!html.includes("currentBusinessId=businessRef.id;\\\\n      currentBusinessOwner=true;"));
  const scripts=[...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.equal(scripts.length,1);
  for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:"mon-business/index.html"}));
});
