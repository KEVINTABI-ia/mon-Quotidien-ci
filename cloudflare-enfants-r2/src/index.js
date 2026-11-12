const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function response(body, status = 200, origin = "") {
  return new Response(body, { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type",
    "vary": "Origin"
  }});
}
function json(data, status, origin) { return response(JSON.stringify(data), status, origin); }
function b64url(s) { return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0)); }

async function verifyFirebaseToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid_token");
  const jwks = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com").then(r => {
    if (!r.ok) throw new Error("key_service_unavailable"); return r.json();
  });
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("unknown_signing_key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0]+"."+parts[1]));
  const now = Math.floor(Date.now()/1000);
  if (!valid || claims.iss !== "https://securetoken.google.com/"+env.FIREBASE_PROJECT_ID ||
      claims.aud !== env.FIREBASE_PROJECT_ID || !claims.sub || claims.sub.length > 128 ||
      claims.exp <= now || claims.iat > now + 60 || !claims.auth_time) throw new Error("invalid_token");
  return { uid: claims.sub };
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}
async function requireUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("unauthorized");
  return verifyFirebaseToken(auth.slice(7), env);
}
function validId(id) { return /^[A-Za-z0-9_-]{10,80}$/.test(id); }
async function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  return "";
}
async function createOnly(bucket, key, body, httpMetadata) {
  const result = await bucket.put(key, body, { httpMetadata, onlyIf: { etagDoesNotMatch: "*" } });
  if (!result) throw new Error("already_exists");
  return result;
}
export default {
 async fetch(request, env) {
  const origin = allowedOrigin(request, env);
  if (request.method === "OPTIONS") {
    if (!origin) return new Response(null,{status:403});
    return new Response(null,{status:204,headers:{
      "access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS",
      "access-control-allow-headers":"Authorization,Content-Type","access-control-max-age":"86400","vary":"Origin"
    }});
  }
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  try {
    if (!origin && request.headers.has("Origin")) return json({error:"origin_forbidden"},403,"");
    if (parts[0] === "public" && parts.length===2 && request.method==="GET" && validId(parts[1])) {
      const object = await env.ENFANTS_BUCKET.get("public/"+parts[1]+"/photo");
      if (!object) return new Response("Not found",{status:404});
      const h = new Headers(); object.writeHttpMetadata(h); h.set("etag",object.httpEtag);
      h.set("cache-control","public, max-age=300");
      return new Response(object.body,{headers:h});
    }
    const user = await requireUser(request, env);
    if (parts[0] === "private" && parts.length===2 && request.method==="POST" && validId(parts[1])) {
      const id=parts[1];
      const contentType=request.headers.get("Content-Type") || "";
      const declaredSize=Number(request.headers.get("X-File-Size") || 0);
      if (!Number.isInteger(declaredSize) || declaredSize<1 || declaredSize>MAX_BYTES || !ALLOWED.has(contentType))
        return json({error:"invalid_image_metadata"},400,origin);
      const object = await request.arrayBuffer();
      if (object.byteLength !== declaredSize || object.byteLength>MAX_BYTES) return json({error:"invalid_size"},400,origin);
      const bytes = new Uint8Array(object);
      if (await imageType(bytes) !== contentType) return json({error:"invalid_image"},415,origin);
      await createOnly(env.ENFANTS_BUCKET,"private/"+id+"/photo",bytes,{contentType});
      return json({ok:true,photoKey:"private/"+id+"/photo"},201,origin);
    }
    if (parts[0] === "admin" && parts[1] === "private" && parts.length===3 && request.method==="GET" && validId(parts[2])) {
      if (user.uid !== env.ADMIN_UID) return json({error:"forbidden"},403,origin);
      const object=await env.ENFANTS_BUCKET.get("private/"+parts[2]+"/photo");
      if (!object) return json({error:"not_found"},404,origin);
      const h=new Headers();object.writeHttpMetadata(h);h.set("cache-control","private, no-store");
      return new Response(object.body,{headers:h});
    }
    if (parts[0] === "admin" && parts[1] === "publish" && parts.length===3 && request.method==="POST" && validId(parts[2])) {
      if (user.uid !== env.ADMIN_UID) return json({error:"forbidden"},403,origin);
      const id=parts[2], source=await env.ENFANTS_BUCKET.get("private/"+id+"/photo");
      if (!source) return json({error:"private_photo_missing"},404,origin);
      await createOnly(env.ENFANTS_BUCKET,"public/"+id+"/photo",source.body,{contentType:source.httpMetadata?.contentType||"application/octet-stream"});
      return json({ok:true,photoUrl:new URL("/public/"+id,request.url).toString()},201,origin);
    }
    return json({error:"not_found"},404,origin);
  } catch (e) {
    const status = e.message==="unauthorized" || e.message==="invalid_token" || e.message==="unknown_signing_key" ? 401 :
      e.message==="already_exists" ? 409 : 500;
    return json({error:status===500?"internal_error":e.message},status,origin);
  }
 }
};
