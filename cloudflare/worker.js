const FIREBASE_PROJECT_ID = "mon-transport-ci";
// Firebase Web API key is supplied securely by the Worker secret FIREBASE_API_KEY.
const JEKO_API_BASE = "https://api.jeko.africa";
const FIREBASE_CERTS = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const APP_RETURN_URL = "https://kevintabi-ia.github.io/mon-Quotidien-ci/";

let firebaseCertCache;
let firebaseCertExpiry = 0;
let oauthTokenCache;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const decodeB64url = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
const decodeJson = value => JSON.parse(new TextDecoder().decode(decodeB64url(value)));
const toB64 = value => btoa(unescape(encodeURIComponent(value)));
const fromB64 = value => decodeURIComponent(escape(atob(value)));
const TIMESTAMP_FIELDS = new Set(["createdAt","updatedAt","confirmedAt","receivedAt","dateActivation","dateExpiration","lastProviderCheckAt"]);
const fields = obj => ({ fields: Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,TIMESTAMP_FIELDS.has(k)&&typeof v==="string"?{timestampValue:new Date(v).toISOString()}:toFirestore(v)])) });
function toFirestore(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestore) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,x])=>[k,toFirestore(x)])) } };
}
function fromFirestore(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestore);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x])=>[k,fromFirestore(x)]));
  return null;
}
function docData(doc) {
  return doc ? Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v])=>[k,fromFirestore(v)])) : null;
}
function pemBytes(pem) {
  return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"")), c=>c.charCodeAt(0));
}
async function signJwt(payload, privateKeyPem) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const input = header + "." + body;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(privateKeyPem), {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return input + "." + b64url(sig);
}
async function serviceToken(env) {
  if (oauthTokenCache && oauthTokenCache.exp > Date.now()+60000) return oauthTokenCache.token;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (sa.project_id !== FIREBASE_PROJECT_ID || !sa.client_email || !sa.private_key) throw new Error("service_account_configuration_invalid");
  const now = Math.floor(Date.now()/1000);
  const assertion = await signJwt({iss:sa.client_email,scope:DATASTORE_SCOPE,aud:GOOGLE_TOKEN_URL,iat:now,exp:now+3600},sa.private_key);
  const response = await fetch(GOOGLE_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("google_oauth_failed");
  oauthTokenCache = {token:data.access_token,exp:Date.now()+Number(data.expires_in||3600)*1000};
  return data.access_token;
}
async function firestore(env, path, init={}) {
  const token = await serviceToken(env);
  const endpoint=new URL("https://firestore.googleapis.com/v1/projects/"+FIREBASE_PROJECT_ID+"/databases/(default)/documents/"+path);
  if(init.method==="PATCH"&&typeof init.body==="string") {
    try { for(const key of Object.keys(JSON.parse(init.body).fields||{})) endpoint.searchParams.append("updateMask.fieldPaths",key); } catch {}
  }
  const response = await fetch(endpoint.toString(),{
    ...init, headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})}
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    if (response.status===404) return null;
    throw new Error("firestore_"+response.status);
  }
  return data;
}
async function getDoc(env,path) { return firestore(env,path); }
function resourceName(path) { return "projects/"+FIREBASE_PROJECT_ID+"/databases/(default)/documents/"+path; }
async function commitWrites(env,writes) {
  const token=await serviceToken(env);
  const response=await fetch("https://firestore.googleapis.com/v1/projects/"+FIREBASE_PROJECT_ID+"/databases/(default)/documents:commit",{
    method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({writes})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error("firestore_commit_"+response.status);
  return data;
}
function updateWrite(path,data,updateTime,exists) {
  const write={update:{name:resourceName(path),...fields(data)},updateMask:{fieldPaths:Object.keys(data)}};
  write.currentDocument=updateTime?{updateTime}:exists===false?{exists:false}:{exists:true};
  return write;
}
function createWrite(path,data) {
  return {update:{name:resourceName(path),...fields(data)},currentDocument:{exists:false}};
}

async function firebaseUser(token, apiKey) {
  if (!apiKey) { const err=new Error("firebase_auth_API_KEY_NOT_CONFIGURED");err.authCode="API_KEY_NOT_CONFIGURED";throw err; }
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+apiKey,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:token})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    const rawCode=data.error?.message||"FIREBASE_LOOKUP_HTTP_"+response.status;
    const code=String(rawCode).split(/[ :]/)[0].replace(/[^A-Za-z0-9_.-]/g,"").slice(0,60)||"FIREBASE_LOOKUP_FAILED";
    const err=new Error("firebase_auth_"+code);
    err.authCode=code;
    throw err;
  }
  const user=data.users?.[0];
  if(!user?.localId) { const err=new Error("firebase_auth_USER_NOT_FOUND");err.authCode="USER_NOT_FOUND";throw err; }
  if(user.disabled===true) { const err=new Error("firebase_auth_USER_DISABLED");err.authCode="USER_DISABLED";throw err; }
  return {sub:user.localId,email:user.email||null};
}
async function requireUser(request, env) {
  const token=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return {user:null,diagnostic:"MISSING_BEARER_TOKEN"};
  try { return {user:await firebaseUser(token, env.FIREBASE_API_KEY),diagnostic:null}; }
  catch(e) { return {user:null,diagnostic:e.authCode||"FIREBASE_AUTH_ERROR"}; }
}
async function jeko(env,path,init={}) {
  let response;
  try {
    response=await fetch(JEKO_API_BASE+path,{...init,headers:{
      "X-API-KEY":env.JEKO_API_KEY,"X-API-KEY-ID":env.JEKO_API_KEY_ID,"content-type":"application/json",...(init.headers||{})
    },signal:AbortSignal.timeout(15000)});
  } catch(e) {
    const cause=e?.cause||null;
    const err=new Error(e?.name==="TimeoutError"?"jeko_network_timeout":"jeko_network_error");
    err.networkFailure=true;
    err.networkCause={
      name:typeof e?.name==="string"?e.name.slice(0,40):null,
      code:typeof (cause?.code||e?.code)==="string"?(cause?.code||e?.code).slice(0,60):null,
      causeName:typeof cause?.name==="string"?cause.name.slice(0,40):null,
    };
    throw err;
  }
  const raw=await response.text();
  let data={};
  try { data=raw?JSON.parse(raw):{}; } catch { data={}; }
  if(!response.ok) {
    const providerCode=[data.code,data.errorCode,data.errorReason,data.error].find(v=>typeof v==="string"&&/^[A-Za-z0-9_.-]{1,80}$/.test(v))||"";
    const err=new Error("jeko_provider_"+response.status+(providerCode?"_"+providerCode:""));
    err.providerStatus=response.status;
    err.providerCode=providerCode||null;
    err.ambiguous=response.status>=500;
    throw err;
  }
  return {data,meta:{status:response.status,contentType:response.headers.get("content-type")||"unknown"}};
}
async function createCheckout(request,env) {
  const authResult=await requireUser(request, env);
  const user=authResult.user;
  if(!user) return json({error:"unauthorized",diagnostic:authResult.diagnostic},401);
  let body={}; try{body=await request.json();}catch{return json({error:"invalid_json"},400);}
  const methods=["orange","wave","mtn","moov","djamo"];
  if(!methods.includes(body.paymentMethod)) return json({error:"invalid_payment_method"},400);
  const serviceId=body.serviceId||"automobiliste";
  if(!["automobiliste","objet_retrouve"].includes(serviceId)) return json({error:"unsupported_service"},400);
  const now=new Date();
  let amountXof, initial;
  if(serviceId==="objet_retrouve"){
    const {objectId,nomComplet,telephone,residence}=body;
    if(typeof objectId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(objectId)||typeof nomComplet!=="string"||nomComplet.trim().length<2||nomComplet.trim().length>100||
       typeof telephone!=="string"||telephone.trim().length<6||telephone.trim().length>25||
       typeof residence!=="string"||residence.trim().length<2||residence.trim().length>180) return json({error:"invalid_claim_details"},400);
    const objectDoc=await getDoc(env,"objets_retrouves/"+objectId);
    if(!objectDoc||docData(objectDoc)?.statut!=="publie") return json({error:"object_unavailable"},409);
    amountXof=1000;
    initial={uid:user.sub,serviceId,objectId,nomComplet:nomComplet.trim(),telephone:telephone.trim(),residence:residence.trim(),provider:"jeko",amountXof,amountCents:amountXof*100,currency:"XOF",status:"pending",clientReference:"MQCI-"+crypto.randomUUID().replace(/-/g,""),createdAt:now.toISOString(),updatedAt:now.toISOString()};
  } else {
    const cfgDoc=await getDoc(env,"configuration_abonnements/globale");
    const services=docData(cfgDoc)?.services||{};
    const cfg=services.automobiliste||{};
    const duration=Number(cfg.duree??12), unit=cfg.unite||"mois", base=Number(cfg.prix??1000);
    if(cfg.actif===false) return json({error:"plan_unavailable"},409);
    if(duration!==12||unit!=="mois"||!Number.isSafeInteger(base)||base<1||base>10000000) return json({error:"plan_configuration_invalid"},503);
    const start=cfg.promotionDebut?new Date(cfg.promotionDebut+"T00:00:00Z"):null, end=cfg.promotionFin?new Date(cfg.promotionFin+"T23:59:59Z"):null, promo=Number(cfg.promotionPrix||0);
    amountXof=cfg.promotionActive===true&&promo>0&&promo<=base&&start&&end&&now>=start&&now<=end?promo:base;
    initial={uid:user.sub,serviceId,planId:"annuel",provider:"jeko",amountXof,amountCents:amountXof*100,currency:"XOF",durationMonths:12,status:"pending",clientReference:"MQCI-"+crypto.randomUUID().replace(/-/g,""),createdAt:now.toISOString(),updatedAt:now.toISOString()};
  }
  const id=crypto.randomUUID().replace(/-/g,"");
  const reference="MQCI-"+id;
  initial.clientReference=reference;
  const path="payments/"+id;
  await commitWrites(env,[createWrite(path,initial)]);
  try {
    const providerResult=await jeko(env,"/partner_api/payment_requests",{method:"POST",body:JSON.stringify({
      storeId:env.JEKO_STORE_ID,amountCents:amountXof*100,currency:"XOF",reference,
      paymentDetails:{type:"redirect",data:{paymentMethod:body.paymentMethod,successUrl:APP_RETURN_URL+"?payment=return&paymentId="+id+"&serviceId="+serviceId,errorUrl:APP_RETURN_URL+"?payment=error&paymentId="+id+"&serviceId="+serviceId}}
    })});
    const checkout=providerResult.data;
    const checkoutId=checkout.id||checkout.paymentRequestId;
    const redirect=checkout.redirectUrl||checkout.paymentUrl||checkout.url;
    if(typeof checkoutId!=="string"||typeof redirect!=="string"||!/^https:\/\//i.test(redirect)) {
      const err=new Error("jeko_response_missing_checkout_fields");
      err.providerStatus=providerResult.meta.status;
      err.providerContentType=providerResult.meta.contentType;
      err.providerResponseKeys=Object.keys(checkout||{}).slice(0,20);
      err.ambiguous=true;
      throw err;
    }
    await firestore(env,path,{method:"PATCH",body:JSON.stringify(fields({providerPaymentRequestId:checkoutId,checkoutUrl:redirect,updatedAt:new Date().toISOString()}))});
    return json({paymentId:id,checkoutUrl:redirect},201);
  } catch(e) {
    const diagnostic=typeof e?.message==="string"&&/^(jeko_provider_[0-9]{3}(_[A-Za-z0-9_.-]{1,80})?|jeko_network_(timeout|error)|jeko_response_missing_checkout_fields)$/.test(e.message)?e.message:"jeko_unclassified_error";
    const ambiguous=e?.ambiguous===true||e?.networkFailure===true;
    console.error("Jeko checkout initialization failed",{serviceId,diagnostic,providerStatus:e?.providerStatus||null,providerContentType:e?.providerContentType||null,providerResponseKeys:e?.providerResponseKeys||null,networkCause:e?.networkCause||null,ambiguous});
    const status=ambiguous?"initialization_unknown":"failed";
    await firestore(env,path,{method:"PATCH",body:JSON.stringify(fields({status,initializationError:diagnostic,updatedAt:new Date().toISOString()}))}).catch(()=>{});
    return json({error:"payment_initialization_failed",diagnostic,checkRequired:ambiguous},502);
  }
}
function safeHexEqual(a,b) {
  if(!/^[a-f0-9]{64}$/i.test(a)||!/^[a-f0-9]{64}$/i.test(b)) return false;
  const x=Uint8Array.from(a.match(/../g),v=>parseInt(v,16)),y=Uint8Array.from(b.match(/../g),v=>parseInt(v,16));
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
async function verifyHmac(raw,signature,secret) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return safeHexEqual(signature,Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,raw))).map(v=>v.toString(16).padStart(2,"0")).join(""));
}
function addMonthsClamped(date,months) {
  const d=new Date(date), day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d;
}
async function webhook(request,env) {
  if(request.method!=="POST") return new Response("Method Not Allowed",{status:405});
  const raw=await request.arrayBuffer(), signature=request.headers.get("Jeko-Signature")||"";
  if(!await verifyHmac(raw,signature,env.JEKO_WEBHOOK_SECRET)) return new Response("Unauthorized",{status:401});
  const event=request.headers.get("Jeko-Event")||"";
  if(event!=="TRANSACTION_COMPLETED"&&event!=="transaction.completed") return new Response("OK",{status:200});
  let tx;try{tx=JSON.parse(new TextDecoder().decode(raw));}catch{return new Response("Bad Request",{status:400});}
  const details=tx.transactionDetails||{}, reference=details.reference, transactionId=tx.id||details.transactionId, requestId=details.id;
  if(typeof reference!=="string"||!reference.startsWith("MQCI-")||typeof transactionId!=="string"||typeof requestId!=="string") return new Response("OK",{status:200});
  const paymentId=reference.slice(5), paymentPath="payments/"+paymentId, paymentDoc=await getDoc(env,paymentPath);
  if(!paymentDoc) return new Response("OK",{status:200});
  const payment=docData(paymentDoc);
  const amount=tx.amount?.amount;
  const valid=payment.provider==="jeko"&&payment.clientReference===reference&&payment.providerPaymentRequestId===requestId&&
    tx.storeId===env.JEKO_STORE_ID&&tx.transactionType==="payment"&&tx.amount?.currency==="XOF"&&
    Number.isSafeInteger(amount)&&amount===payment.amountCents;
  if(!valid) {
    await firestore(env,paymentPath,{method:"PATCH",body:JSON.stringify(fields({status:"review_required",reviewReason:"provider_data_mismatch",updatedAt:new Date().toISOString()}))});
    return new Response("OK",{status:200});
  }
  const receiptId="jeko_"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(transactionId)))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const receiptPath="payment_webhooks/"+receiptId;
  const receipt=await getDoc(env,receiptPath);
  if(receipt) return new Response("OK",{status:200});
  const now=new Date();
  const receiptData={provider:"jeko",transactionId,outcome:tx.status==="error"?"failed":"processed",receivedAt:now.toISOString()};
  if(tx.status==="error") {
    await commitWrites(env,[
      updateWrite(paymentPath,{status:"failed",updatedAt:now.toISOString()},paymentDoc.updateTime),
      createWrite(receiptPath,receiptData)
    ]);
    return new Response("OK",{status:200});
  }
  if(tx.status!=="success") return new Response("OK",{status:200});
  if(payment.status==="succeeded") return new Response("OK",{status:200});
  if(payment.serviceId==="objet_retrouve"){
    const objectDoc=await getDoc(env,"objets_retrouves/"+payment.objectId);
    if(!objectDoc||docData(objectDoc)?.statut!=="publie"){
      await firestore(env,paymentPath,{method:"PATCH",body:JSON.stringify(fields({status:"review_required",reviewReason:"object_no_longer_available",updatedAt:now.toISOString()}))});
      return new Response("OK",{status:200});
    }
    const demandPath="demandes_recuperation_objets/"+paymentId;
    const demandData={objetId:payment.objectId,nomComplet:payment.nomComplet,telephone:payment.telephone,residence:payment.residence,
      operateur:"Jèko",referenceTransaction:transactionId,heureTransaction:now.toISOString(),montantFCFA:1000,
      statut:"paiement_verifie",uid:payment.uid,paymentId,createdAt:now.toISOString()};
    try{
      await commitWrites(env,[
        updateWrite(paymentPath,{status:"succeeded",providerTransactionId:transactionId,confirmedAt:now.toISOString(),updatedAt:now.toISOString()},paymentDoc.updateTime),
        createWrite(demandPath,demandData),
        createWrite(receiptPath,receiptData)
      ]);
    }catch(e){if(!(await getDoc(env,receiptPath)))throw e;}
    return new Response("OK",{status:200});
  }
  const subPath="abonnements_automobiliste/"+payment.uid, subDoc=await getDoc(env,subPath), sub=docData(subDoc)||{};
  const oldEnd=sub.dateExpiration?new Date(sub.dateExpiration):null;
  const renewing=oldEnd&&oldEnd>now, end=addMonthsClamped(renewing?oldEnd:now,12);
  const subData={uid:payment.uid,statut:"actif",montantFCFA:payment.amountXof,dureeMois:12,dateActivation:sub.dateActivation||now.toISOString(),dateExpiration:end.toISOString(),paymentId,operateur:"Jèko"};
  const writes=[
    updateWrite(paymentPath,{status:"succeeded",providerTransactionId:transactionId,confirmedAt:now.toISOString(),updatedAt:now.toISOString()},paymentDoc.updateTime),
    updateWrite(subPath,subData,subDoc?.updateTime,subDoc?undefined:false),
    createWrite(receiptPath,receiptData)
  ];
  try { await commitWrites(env,writes); }
  catch(e) {
    // A concurrent webhook may have committed first. Confirm receipt before returning success.
    if(!(await getDoc(env,receiptPath))) throw e;
  }
  return new Response("OK",{status:200});
}
async function jekoDiagnostic(request,env) {
  const authResult=await requireUser(request,env);
  if(!authResult.user) return json({ok:false,error:"unauthorized",diagnostic:authResult.diagnostic},401);
  if(!env.JEKO_API_KEY||!env.JEKO_API_KEY_ID) return json({ok:false,error:"jeko_credentials_not_configured"},503);
  try {
    const result=await jeko(env,"/partner_api/stores",{method:"GET"});
    const data=result.data;
    return json({
      ok:true,service:"jeko",check:"authenticated_read_only_stores",
      providerHttpStatus:result.meta.status,
      contentType:result.meta.contentType,
      responseShape:Array.isArray(data)?"array":(data&&typeof data==="object"?"object":typeof data),
      responseKeys:data&&typeof data==="object"&&!Array.isArray(data)?Object.keys(data).slice(0,20):[],
      checkedAt:new Date().toISOString()
    });
  } catch(e) {
    return json({
      ok:false,service:"jeko",check:"authenticated_read_only_stores",
      error:e?.message==="jeko_network_timeout"?"jeko_network_timeout":e?.message==="jeko_network_error"?"jeko_network_error":String(e?.message||"jeko_diagnostic_failed").slice(0,120),
      networkCause:e?.networkCause||null,
      providerHttpStatus:Number.isInteger(e?.providerStatus)?e.providerStatus:null,
      checkedAt:new Date().toISOString()
    },502);
  }
}
async function jekoNetworkDiagnostic(request,env) {
  const authResult=await requireUser(request,env);
  if(!authResult.user) return json({ok:false,error:"unauthorized",diagnostic:authResult.diagnostic},401);
  const probe=async(url,headers={})=>{
    try {
      const response=await fetch(url,{method:"GET",headers,redirect:"manual",signal:AbortSignal.timeout(10000)});
      return {reachable:true,httpStatus:response.status,contentType:response.headers.get("content-type")||"unknown"};
    } catch(e) {
      const cause=e?.cause||null;
      return {reachable:false,error:e?.name==="TimeoutError"?"timeout":"network_error",
        networkCause:{name:typeof e?.name==="string"?e.name.slice(0,40):null,
          code:typeof (cause?.code||e?.code)==="string"?(cause?.code||e?.code).slice(0,60):null,
          causeName:typeof cause?.name==="string"?cause.name.slice(0,40):null}};
    }
  };
  const base=JEKO_API_BASE+"/partner_api/stores";
  const [baseline,jekoRoot,unauthenticatedApi]=await Promise.all([
    probe("https://www.google.com/generate_204"),
    probe(JEKO_API_BASE+"/"),
    probe(base)
  ]);
  let headerValidation={ok:false};
  let authenticatedNoContentType={reachable:false,error:"credentials_not_configured"};
  let authenticatedWithContentType={reachable:false,error:"credentials_not_configured"};
  if(env.JEKO_API_KEY&&env.JEKO_API_KEY_ID) {
    const authHeaders={"X-API-KEY":env.JEKO_API_KEY,"X-API-KEY-ID":env.JEKO_API_KEY_ID};
    try {
      new Headers(authHeaders);
      headerValidation={ok:true};
      [authenticatedNoContentType,authenticatedWithContentType]=await Promise.all([
        probe(base,authHeaders),
        probe(base,{...authHeaders,"content-type":"application/json"})
      ]);
    } catch(e) {
      headerValidation={ok:false,error:e?.name==="TypeError"?"invalid_header_value":"header_construction_error"};
    }
  }
  return json({
    ok:baseline.reachable&&jekoRoot.reachable&&authenticatedNoContentType.reachable,
    service:"jeko",check:"outbound_network_header_isolation",
    baseline,jekoRoot,unauthenticatedApi,headerValidation,
    authenticatedNoContentType,authenticatedWithContentType,
    checkedAt:new Date().toISOString()
  });
}
async function paymentStatus(request,env) {
  const authResult=await requireUser(request, env);const user=authResult.user;if(!user)return json({error:"unauthorized",diagnostic:authResult.diagnostic},401);
  const url=new URL(request.url),id=url.searchParams.get("paymentId");
  if(!id||!/^[a-f0-9]{32}$/i.test(id)) return json({error:"invalid_payment_id"},400);
  const doc=await getDoc(env,"payments/"+id),payment=docData(doc);
  if(!payment||payment.uid!==user.sub||payment.provider!=="jeko") return json({error:"payment_not_found"},404);
  if(payment.status==="pending"&&payment.providerPaymentRequestId) {
    const last=payment.lastProviderCheckAt?new Date(payment.lastProviderCheckAt).getTime():0;
    if(Date.now()-last>10000) {
      try { const providerResult=await jeko(env,"/partner_api/payment_requests/"+encodeURIComponent(payment.providerPaymentRequestId));
        const provider=providerResult.data;
        const checkedAt=new Date().toISOString();
        if(provider.status==="error") {payment.status="failed";await firestore(env,"payments/"+id,{method:"PATCH",body:JSON.stringify(fields({status:"failed",lastProviderCheckAt:checkedAt,updatedAt:checkedAt}))});}
        else await firestore(env,"payments/"+id,{method:"PATCH",body:JSON.stringify(fields({lastProviderCheckAt:checkedAt}))});
      } catch {}
    }
  }
  return json({paymentId:id,status:payment.status,amountXof:payment.amountXof,currency:payment.currency,serviceId:payment.serviceId||"automobiliste"});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url), origin=request.headers.get("origin")||"";
    if(origin==="https://kevintabi-ia.github.io"&&request.method==="OPTIONS") {
      return new Response(null,{status:204,headers:{
        "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"
      }});
    }
    let response;
    if(url.pathname==="/health"&&request.method==="GET") response=json({ok:true,service:"mon-quotidien-jeko",mode:"production-locked"});
    else if(url.pathname==="/webhook") response=await webhook(request,env);
    else if(url.pathname==="/api/jeko/checkout"&&request.method==="POST") response=await createCheckout(request,env);
    else if(url.pathname==="/api/jeko/status"&&request.method==="GET") response=await paymentStatus(request,env);
    else if(url.pathname==="/api/jeko/diagnostic"&&request.method==="GET") response=await jekoDiagnostic(request,env);
    else if(url.pathname==="/api/jeko/network-diagnostic"&&request.method==="GET") response=await jekoNetworkDiagnostic(request,env);
    else response=json({error:"not_found"},404);
    if(origin==="https://kevintabi-ia.github.io") {
      const headers=new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin",origin);
      headers.set("Vary","Origin");
      response=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};