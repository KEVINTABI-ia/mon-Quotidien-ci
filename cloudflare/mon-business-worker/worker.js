const PROJECT_ID = "mon-transport-ci";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const FIREBASE_LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const APP_INVITE_URL = "https://kevintabi-ia.github.io/mon-Quotidien-ci/mon-business/index.html";

const ROLES = new Set(["general_director","activity_manager","accountant","cashier","stock_manager","employee","observer"]);
const PERMISSIONS = new Set(["view","create","edit","approve","cancel_correct","export","manage_access"]);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers }
});
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const fromB64 = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
const pemBytes = pem => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,"").replace(/\s/g,"")), c=>c.charCodeAt(0));

function toValue(value) {
  if (value === null) return {nullValue:null};
  if (value instanceof Date) return {timestampValue:value.toISOString()};
  if (typeof value === "boolean") return {booleanValue:value};
  if (typeof value === "number") return Number.isInteger(value) ? {integerValue:String(value)} : {doubleValue:value};
  if (typeof value === "string") return {stringValue:value};
  if (Array.isArray(value)) return {arrayValue:{values:value.map(toValue)}};
  if (typeof value === "object") return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,toValue(v)]))}};
  throw new TypeError("unsupported_firestore_value");
}
function fromValue(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values||[]).map(fromValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,fromValue(v)]));
  return null;
}
function decodeDocument(doc) {
  return doc ? Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,fromValue(v)])) : null;
}
function firestoreFields(data) {
  return {fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,toValue(v)]))};
}
function assertId(value, label="id") {
  if (typeof value!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpError(400,"invalid_"+label);
  return value;
}
function cleanEmail(value) {
  if (typeof value!=="string") throw new HttpError(400,"invalid_email");
  const email=value.trim().toLowerCase();
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400,"invalid_email");
  return email;
}
function validatePermissions(value) {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new HttpError(400,"invalid_permissions");
  const entries=Object.entries(value);
  if (entries.some(([key,flag])=>!PERMISSIONS.has(key)||typeof flag!=="boolean") || value.view!==true) throw new HttpError(400,"invalid_permissions");
  return Object.fromEntries(entries);
}
function validateActivityIds(value) {
  if (!Array.isArray(value) || value.length>100 || value.some(x=>typeof x!=="string"||! /^[A-Za-z0-9_-]{1,128}$/.test(x))) {
    throw new HttpError(400,"invalid_activity_ids");
  }
  return [...new Set(value)];
}
class HttpError extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
async function enforceRateLimit(binding,key) {
  if (!binding || typeof binding.limit!=="function") throw new HttpError(503,"rate_limiter_unavailable");
  let result;
  try { result=await binding.limit({key}); }
  catch { throw new HttpError(503,"rate_limiter_unavailable"); }
  if (result?.success!==true) throw new HttpError(429,"rate_limit_exceeded");
}
let oauthCache;
async function signJwt(payload, privateKeyPem) {
  const header=b64url(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const body=b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const input=header+"."+body;
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(privateKeyPem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(input));
  return input+"."+b64url(signature);
}
async function googleAccessToken(env) {
  if (oauthCache && oauthCache.expires>Date.now()+60000) return oauthCache.token;
  let account;
  try { account=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||""); } catch { throw new Error("service_account_secret_invalid"); }
  if (account.project_id!==PROJECT_ID || !account.client_email || !account.private_key) throw new Error("service_account_secret_invalid");
  const now=Math.floor(Date.now()/1000);
  const assertion=await signJwt({iss:account.client_email,scope:DATASTORE_SCOPE,aud:GOOGLE_TOKEN_URL,iat:now,exp:now+3600},account.private_key);
  const response=await fetch(GOOGLE_TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  const data=await response.json().catch(()=>({}));
  if (!response.ok || !data.access_token) throw new Error("google_oauth_failed");
  oauthCache={token:data.access_token,expires:Date.now()+Number(data.expires_in||3600)*1000};
  return oauthCache.token;
}
function docPath(path) {
  return "https://firestore.googleapis.com/v1/projects/"+PROJECT_ID+"/databases/(default)/documents/"+path;
}
async function getDoc(env,path) {
  const response=await fetch(docPath(path),{headers:{authorization:"Bearer "+await googleAccessToken(env)}});
  if (response.status===404) return null;
  if (!response.ok) throw new Error("firestore_read_failed");
  const doc=await response.json();
  return {data:decodeDocument(doc),updateTime:doc.updateTime,name:doc.name};
}
function writeDocument(path,data,condition,partial=false) {
  const write={update:{name:"projects/"+PROJECT_ID+"/databases/(default)/documents/"+path,...firestoreFields(data)}};
  if (partial) write.updateMask={fieldPaths:Object.keys(data)};
  write.currentDocument=condition==="create"?{exists:false}:{updateTime:condition};
  return write;
}
async function commit(env,writes) {
  const response=await fetch("https://firestore.googleapis.com/v1/projects/"+PROJECT_ID+"/databases/(default)/documents:commit",{
    method:"POST",headers:{authorization:"Bearer "+await googleAccessToken(env),"content-type":"application/json"},body:JSON.stringify({writes})
  });
  if (!response.ok) {
    if (response.status===409 || response.status===400 || response.status===412) throw new HttpError(409,"record_changed_retry");
    throw new Error("firestore_write_failed");
  }
  return response.json().catch(()=>({}));
}
async function authenticate(request,env) {
  const token=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length>10000) throw new HttpError(401,"authentication_required");
  const response=await fetch(FIREBASE_LOOKUP+"?key="+encodeURIComponent(env.FIREBASE_API_KEY||""),{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:token})
  });
  const data=await response.json().catch(()=>({}));
  const user=data.users?.[0];
  if (!response.ok || !user?.localId || user.disabled===true) throw new HttpError(401,"invalid_session");
  if (!user.email || user.emailVerified!==true) throw new HttpError(403,"verified_email_required");
  return {uid:user.localId,email:cleanEmail(user.email)};
}
async function requireOwner(env,user,businessId) {
  const [business,member]=await Promise.all([
    getDoc(env,"businesses/"+businessId),
    getDoc(env,"businesses/"+businessId+"/members/"+user.uid)
  ]);
  if (!business || !member || business.data.ownerUid!==user.uid || member.data.role!=="owner" || member.data.status!=="active") {
    throw new HttpError(403,"owner_access_required");
  }
  return business.data;
}
async function verifyActivities(env,businessId,activityIds) {
  for (const activityId of activityIds) {
    if (!await getDoc(env,"businesses/"+businessId+"/activities/"+activityId)) throw new HttpError(400,"activity_not_found");
  }
}
async function digest(value) {
  return b64url(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
}
function constantTimeEqual(left,right) {
  if (typeof left!=="string" || typeof right!=="string" || left.length!==right.length) return false;
  let mismatch=0;
  for (let i=0;i<left.length;i++) mismatch|=left.charCodeAt(i)^right.charCodeAt(i);
  return mismatch===0;
}
function randomToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}
function auditData({businessId,actorUid,action,entityId,now,details={}}) {
  return {businessId,actorUid,action,entityType:"invitation",entityId,details,occurredAt:now};
}
function inviteLink(id,token) {
  return APP_INVITE_URL+"#invitation="+encodeURIComponent(id)+"&token="+encodeURIComponent(token);
}
async function createInvitation(request,env,user,body) {
  const businessId=assertId(body.businessId,"business_id");
  await requireOwner(env,user,businessId);
  const email=cleanEmail(body.email);
  const role=body.role;
  if (!ROLES.has(role)) throw new HttpError(400,"invalid_role");
  const activityIds=validateActivityIds(body.activityIds);
  if (!activityIds.length) throw new HttpError(400,"activity_required");
  await verifyActivities(env,businessId,activityIds);
  const permissions=validatePermissions(body.permissions||{view:true});
  const expiresInHours=body.expiresInHours===undefined?168:body.expiresInHours;
  if (!Number.isInteger(expiresInHours)||expiresInHours<1||expiresInHours>336) throw new HttpError(400,"invalid_expiration");
  const now=new Date(), expiresAt=new Date(now.getTime()+expiresInHours*3600000);
  const id=crypto.randomUUID(), token=randomToken(), tokenHash=await digest(token);
  const invitation={
    businessId,email,role,activityIds,permissions,tokenHash,status:"pending",
    invitedByUid:user.uid,createdAt:now,expiresAt
  };
  const auditId=crypto.randomUUID();
  await commit(env,[
    writeDocument("businessInvitations/"+id,invitation,"create"),
    writeDocument("businesses/"+businessId+"/auditLogs/"+auditId,auditData({businessId,actorUid:user.uid,action:"invitation.created",entityId:id,now,details:{email,role,activityIds}}),"create")
  ]);
  return json({invitationId:id,inviteUrl:inviteLink(id,token),expiresAt:expiresAt.toISOString(),delivery:"manual_share"});
}
async function acceptInvitation(request,env,user,body) {
  const invitationId=assertId(body.invitationId,"invitation_id");
  if (typeof body.token!=="string" || body.token.length<30 || body.token.length>200) throw new HttpError(400,"invalid_invitation_token");
  const invitation=await getDoc(env,"businessInvitations/"+invitationId);
  if (!invitation || invitation.data.status!=="pending") throw new HttpError(404,"invitation_unavailable");
  const data=invitation.data, now=new Date();
  if (data.expiresAt && new Date(data.expiresAt)<=now) throw new HttpError(410,"invitation_expired");
  if (data.email!==user.email) throw new HttpError(403,"invitation_email_mismatch");
  if (!constantTimeEqual(await digest(body.token),data.tokenHash)) throw new HttpError(403,"invalid_invitation_token");
  const businessId=assertId(data.businessId,"business_id");
  if (!ROLES.has(data.role)) throw new HttpError(400,"invalid_invitation_role");
  const activityIds=validateActivityIds(data.activityIds);
  await verifyActivities(env,businessId,activityIds);
  const existing=await getDoc(env,"businesses/"+businessId+"/members/"+user.uid);
  if (existing) throw new HttpError(409,"already_a_member");
  const member={uid:user.uid,email:user.email,role:data.role,status:"active",activityIds,permissions:validatePermissions(data.permissions),invitationId,createdAt:now,acceptedAt:now};
  const auditId=crypto.randomUUID();
  await commit(env,[
    writeDocument("businesses/"+businessId+"/members/"+user.uid,member,"create"),
    writeDocument("businessInvitations/"+invitationId,{status:"accepted",acceptedByUid:user.uid,acceptedAt:now},""+invitation.updateTime,true),
    writeDocument("businesses/"+businessId+"/auditLogs/"+auditId,auditData({businessId,actorUid:user.uid,action:"invitation.accepted",entityId:invitationId,now,details:{role:data.role}}),"create")
  ]);
  return json({accepted:true,businessId,role:data.role});
}
async function listInvitations(env,user,body) {
  const businessId=assertId(body.businessId,"business_id");
  await requireOwner(env,user,businessId);
  const response=await fetch("https://firestore.googleapis.com/v1/projects/"+PROJECT_ID+"/databases/(default)/documents:runQuery",{
    method:"POST",
    headers:{authorization:"Bearer "+await googleAccessToken(env),"content-type":"application/json"},
    body:JSON.stringify({structuredQuery:{
      from:[{collectionId:"businessInvitations"}],
      where:{fieldFilter:{field:{fieldPath:"businessId"},op:"EQUAL",value:{stringValue:businessId}}},
      orderBy:[{field:{fieldPath:"createdAt"},direction:"DESCENDING"}],
      limit:100
    }})
  });
  if(!response.ok)throw new Error("firestore_query_failed");
  const rows=await response.json();
  return json({invitations:(Array.isArray(rows)?rows:[])
    .filter(row=>row.document?.name)
    .map(row=>({id:row.document.name.split("/").pop(),...decodeDocument(row.document)}))
    .filter(item=>item.businessId===businessId&&item.status==="pending")
    .map(item=>({invitationId:item.id,email:item.email,role:item.role,activityIds:item.activityIds,expiresAt:item.expiresAt,status:item.status}))});
}

async function revokeInvitation(request,env,user,body) {
  const businessId=assertId(body.businessId,"business_id");
  await requireOwner(env,user,businessId);
  const invitationId=assertId(body.invitationId,"invitation_id");
  const invitation=await getDoc(env,"businessInvitations/"+invitationId);
  if (!invitation || invitation.data.businessId!==businessId || invitation.data.status!=="pending") throw new HttpError(404,"invitation_unavailable");
  const now=new Date(),auditId=crypto.randomUUID();
  await commit(env,[
    writeDocument("businessInvitations/"+invitationId,{status:"revoked",revokedAt:now,revokedByUid:user.uid},""+invitation.updateTime,true),
    writeDocument("businesses/"+businessId+"/auditLogs/"+auditId,auditData({businessId,actorUid:user.uid,action:"invitation.revoked",entityId:invitationId,now}),"create")
  ]);
  return json({revoked:true});
}

async function updateMember(request,env,user,body) {
  const businessId=assertId(body.businessId,"business_id");
  const memberUid=assertId(body.memberUid,"member_uid");
  await requireOwner(env,user,businessId);
  const business=await getDoc(env,"businesses/"+businessId);
  if (memberUid===business.data.ownerUid) throw new HttpError(403,"owner_member_protected");
  const path="businesses/"+businessId+"/members/"+memberUid;
  const member=await getDoc(env,path);
  if (!member) throw new HttpError(404,"member_not_found");
  const role=body.role;
  const status=body.status;
  if (!ROLES.has(role)) throw new HttpError(400,"invalid_role");
  if (!["active","suspended","revoked"].includes(status)) throw new HttpError(400,"invalid_member_status");
  const activityIds=validateActivityIds(body.activityIds);
  await verifyActivities(env,businessId,activityIds);
  const permissions=validatePermissions(body.permissions);
  const now=new Date(),auditId=crypto.randomUUID();
  await commit(env,[
    writeDocument(path,{role,status,activityIds,permissions,updatedAt:now},""+member.updateTime,true),
    writeDocument("businesses/"+businessId+"/auditLogs/"+auditId,auditData({
      businessId,actorUid:user.uid,action:"member.access_updated",entityId:memberUid,now,
      details:{role,status,activityIds,permissions}
    }),"create")
  ]);
  return json({updated:true,memberUid,role,status});
}

function corsHeaders(request,env) {
  const origin=request.headers.get("origin");
  if (!origin) return {"vary":"Origin"};
  if (origin!==env.APP_ORIGIN) throw new HttpError(403,"origin_not_allowed");
  return {"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","access-control-max-age":"86400","vary":"Origin"};
}
export default {
  async fetch(request,env) {
    let cors={};
    try {
      cors=corsHeaders(request,env);
      if (request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
      const url=new URL(request.url);
      if (url.pathname==="/health" && request.method==="GET") return json({ok:true,service:"mon-business-worker"},200,cors);
      if (request.method!=="POST") return json({error:"method_not_allowed"},405,cors);
      const clientIp=request.headers.get("cf-connecting-ip")||"unknown";
      await enforceRateLimit(env.IP_RATE_LIMITER,clientIp);
      if (!(request.headers.get("content-type")||"").toLowerCase().includes("application/json")) throw new HttpError(415,"json_required");
      const declaredLength=Number(request.headers.get("content-length")||0);
      if (declaredLength>16384) throw new HttpError(413,"request_too_large");
      const rawBody=await request.text();
      if (new TextEncoder().encode(rawBody).byteLength>16384) throw new HttpError(413,"request_too_large");
      let body;
      try { body=JSON.parse(rawBody); } catch { throw new HttpError(400,"invalid_json_body"); }
      if (!body || typeof body!=="object" || Array.isArray(body)) throw new HttpError(400,"invalid_json_body");
      const user=await authenticate(request,env);
      await enforceRateLimit(env.USER_RATE_LIMITER,user.uid);
      let response;
      if (url.pathname==="/v1/invitations") response=await createInvitation(request,env,user,body);
      else if (url.pathname==="/v1/invitations/accept") response=await acceptInvitation(request,env,user,body);
      else if (url.pathname==="/v1/invitations/list") response=await listInvitations(env,user,body);
      else if (url.pathname==="/v1/invitations/revoke") response=await revokeInvitation(request,env,user,body);
      else if (url.pathname==="/v1/members/update") response=await updateMember(request,env,user,body);
      else throw new HttpError(404,"route_not_found");
      const headers=new Headers(response.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);
      return new Response(response.body,{status:response.status,headers});
    } catch(error) {
      const status=error instanceof HttpError?error.status:500;
      const code=error instanceof HttpError?error.code:"internal_error";
      if (status===500) console.error("Mon Business Worker failure",error?.message||"unknown");
      return json({error:code},status,cors);
    }
  }
};

export { cleanEmail, validatePermissions, validateActivityIds, toValue, fromValue, decodeDocument, inviteLink, enforceRateLimit, listInvitations };
