import test from "node:test";
import assert from "node:assert/strict";
import { cleanEmail, validatePermissions, validateActivityIds, toValue, fromValue, decodeDocument, inviteLink, enforceRateLimit, summarizeFinanceTransactions, collectQueryPages, reconcileStatementLines } from "../cloudflare/mon-business-worker/worker.js";

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

test("le rapport financier exclut les opérations non exécutées et les transferts du résultat",()=>{
  const rows=[
    {type:"income",amountMinor:25000,status:"executed"},
    {type:"expense",amountMinor:7000,status:"executed"},
    {type:"transfer",amountMinor:5000,status:"executed"},
    {type:"income",amountMinor:9000,status:"pending"},
    {type:"expense",amountMinor:3000,status:"approved"}
  ];
  assert.deepEqual(summarizeFinanceTransactions(rows,{cash:18000}),{
    incomeMinor:25000,expenseMinor:7000,transferMinor:5000,
    pendingCount:2,executedCount:3,resultMinor:18000,totalBalanceMinor:18000
  });
});

test("le rapport financier refuse les totaux hors capacité entière sûre",()=>{
  assert.throws(()=>summarizeFinanceTransactions([
    {type:"income",amountMinor:Number.MAX_SAFE_INTEGER,status:"executed"},
    {type:"income",amountMinor:1,status:"executed"}
  ]),/finance_report_overflow/);
});


test("la lecture paginée récupère toutes les pages, au-delà de 200 documents",async()=>{
  const source=Array.from({length:437},(_,i)=>({id:i}));
  const offsets=[];
  const rows=await collectQueryPages(async(offset,limit)=>{
    offsets.push({offset,limit});
    return source.slice(offset,offset+limit);
  });
  assert.equal(rows.length,437);
  assert.deepEqual(offsets.map(x=>x.offset),[0,200,400]);
});

test("la lecture paginée détecte explicitement un volume supérieur au plafond",async()=>{
  const source=Array.from({length:5001},(_,i)=>({id:i}));
  await assert.rejects(()=>collectQueryPages(async(offset,limit)=>source.slice(offset,offset+limit)),/finance_collection_too_large/);
});

test("la lecture paginée accepte exactement le plafond sans marquer le rapport incomplet",async()=>{
  const source=Array.from({length:5000},(_,i)=>({id:i}));
  const rows=await collectQueryPages(async(offset,limit)=>source.slice(offset,offset+limit));
  assert.equal(rows.length,5000);
});


test("le rapprochement associe une ligne à une opération exécutée avec date, montant et référence",()=>{
  const result=reconcileStatementLines([{date:"2026-11-25",amountXof:2500,reference:"REC-01",paymentMethod:"wave"}],[
    {id:"tx-1",status:"executed",amountMinor:2500,createdAt:"2026-11-25T09:00:00.000Z",reference:"REC-01",paymentMethod:"wave"}
  ]);
  assert.deepEqual(result,{results:[{lineIndex:0,status:"matched",transactionId:"tx-1"}],summary:{total:1,matched:1,unmatched:0,ambiguous:0}});
});

test("le rapprochement ne réutilise pas deux fois la même opération",()=>{
  const result=reconcileStatementLines([
    {date:"2026-11-25",amountXof:2500,reference:"REC-01"},
    {date:"2026-11-25",amountXof:2500,reference:"REC-01"}
  ],[{id:"tx-1",status:"executed",amountMinor:2500,createdAt:"2026-11-25T09:00:00.000Z",reference:"REC-01"}]);
  assert.deepEqual(result.summary,{total:2,matched:1,unmatched:1,ambiguous:0});
});

test("le rapprochement signale les correspondances multiples comme ambiguës",()=>{
  const tx=[1,2].map(n=>({id:"tx-"+n,status:"executed",amountMinor:1000,createdAt:"2026-11-25T09:00:00.000Z"}));
  const result=reconcileStatementLines([{date:"2026-11-25",amountXof:1000}],tx);
  assert.equal(result.results[0].status,"ambiguous");
  assert.equal(result.summary.ambiguous,1);
});

test("le rapprochement ignore les opérations en attente et valide les montants",()=>{
  const result=reconcileStatementLines([{date:"2026-11-25",amountXof:1000}],[
    {id:"pending",status:"pending",amountMinor:1000,createdAt:"2026-11-25T09:00:00.000Z"}
  ]);
  assert.equal(result.results[0].status,"unmatched");
  assert.throws(()=>reconcileStatementLines([{date:"25/11/2026",amountXof:1000}],[]),/invalid_statement_line/);
});


test("le prévisualiseur de rapprochement retourne les statuts sans écrire de transaction",()=>{
  const lines=[{date:"2026-11-26",amountXof:2500,reference:"REF-1",paymentMethod:"wave"}];
  const transactions=[{id:"tx-1",status:"executed",amountMinor:2500,createdAt:"2026-11-26T10:00:00.000Z",reference:"REF-1",paymentMethod:"wave"}];
  const result=reconcileStatementLines(lines,transactions);
  assert.equal(result.summary.matched,1);
  assert.equal(transactions.length,1);
  assert.equal(transactions[0].status,"executed");
});
