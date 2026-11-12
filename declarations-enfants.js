/* Déclarations d’enfants perdus ou retrouvés — Mon Quotidien CI */
(function(){
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const el=id=>document.getElementById(id);
 const admin=()=>auth.currentUser&&auth.currentUser.uid===ADMIN_UID;
 const style="width:100%;padding:10px;margin:6px 0 12px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box";
 const workerBase=()=>{let base=String(window.MQCI_ENFANTS_MEDIA_WORKER_URL||"https://mon-quotidien-ci-enfants.tabikevin57.workers.dev");while(base.endsWith("/"))base=base.slice(0,-1);return base;};
 async function workerFetch(path,options={}){
  const base=workerBase();if(!base)throw new Error("Le service sécurisé des photos n’est pas encore configuré.");
  if(!auth.currentUser)throw new Error("Connectez-vous à votre compte.");
  const headers=new Headers(options.headers||{});headers.set("Authorization","Bearer "+await auth.currentUser.getIdToken());
  return fetch(base+path,{...options,headers});
 }
 async function workerJson(path,options={}){
  const response=await workerFetch(path,options);let data={};try{data=await response.json();}catch(_){}
  if(!response.ok)throw new Error(data.error||("Service photo indisponible (HTTP "+response.status+")."));
  return data;
 }
 function modal(){
  let m=el("mqciDeclarationsEnfantsModal");if(m)return m;
  m=document.createElement("div");m.id="mqciDeclarationsEnfantsModal";
  m.style.cssText="position:fixed;inset:0;z-index:99999;background:#0009;overflow:auto;padding:18px";
  m.innerHTML='<div style="max-width:620px;margin:24px auto;background:var(--card-bg,#fff);color:var(--text-color,inherit);padding:20px;border-radius:14px"><button type="button" onclick="fermerDeclarationsEnfants()" style="float:right">✕ Fermer</button><h2>Déclaration d’enfant perdu ou retrouvé</h2><p style="padding:10px;background:#fff3cd;color:#664d03;border-radius:8px">En cas de disparition ou de danger, contactez immédiatement la police ou la gendarmerie. Cette déclaration ne remplace pas un signalement officiel.</p><label>Type de déclaration</label><select id="mqciEnfantType" style="'+style+'" onchange="changerTypeDeclarationEnfant()"><option value="perdu">Enfant perdu</option><option value="retrouve">Enfant retrouvé</option></select><form id="mqciEnfantForm" onsubmit="envoyerDeclarationEnfant(event)"><div id="mqciEnfantChamps"></div><p id="mqciEnfantStatut" role="status"></p><button class="primary" type="submit">Envoyer à l’administration</button></form><p style="font-size:12px">Toutes les déclarations sont vérifiées par l’administration avant publication. Les informations privées ne sont pas affichées au public.</p></div>';
  document.body.appendChild(m);return m;
 }
 window.ouvrirDeclarationsEnfants=function(){modal();changerTypeDeclarationEnfant();};
 window.fermerDeclarationsEnfants=function(){el("mqciDeclarationsEnfantsModal")?.remove();};
 window.changerTypeDeclarationEnfant=function(){
  const t=el("mqciEnfantType")?.value||"perdu",z=el("mqciEnfantChamps");if(!z)return;
  const field=(id,label,type="text",required=true,extra="")=>'<label for="'+id+'">'+label+(required?' *':'')+'</label><input id="'+id+'" type="'+type+'" '+(required?'required':'')+' '+extra+' style="'+style+'">';
  const area=(id,label,required=true)=>'<label for="'+id+'">'+label+(required?' *':'')+'</label><textarea id="'+id+'" '+(required?'required':'')+' rows="3" style="'+style+'"></textarea>';
  const photo=field("mqciEnfantPhoto","Photo de l’enfant","file",true,'accept="image/jpeg,image/png,image/webp"');
  if(t==="perdu") z.innerHTML=field("mqciEnfantNom","Nom complet de l’enfant")+photo+field("mqciEnfantAge","Âge de l’enfant","number",true,'min="0" max="17"')+field("mqciEnfantCommune","Commune / quartier (information privée)")+field("mqciEnfantAdresse","Lieu d’habitation exact (privé)")+field("mqciEnfantTel","Téléphone des parents","tel")+area("mqciEnfantDescription","Description / circonstances de la disparition");
  else z.innerHTML=photo+field("mqciEnfantNom","Nom de l’enfant (si connu)","text",false)+field("mqciEnfantTrouvePar","Nom de la personne qui a trouvé l’enfant")+field("mqciEnfantTel","Contact de la personne qui a trouvé l’enfant","tel")+field("mqciEnfantCommune","Commune / quartier où l’enfant a été retrouvé (privé)")+field("mqciEnfantLieuPrecise","Lieu précis où l’enfant a été retrouvé (privé)")+ '<label>Situation actuelle de l’enfant *</label><select id="mqciEnfantPresence" required style="'+style+'" onchange="changerPresenceEnfant()"><option value="">Choisir</option><option value="avec_moi">Avec moi</option><option value="avec_autorites">Avec les autorités</option></select><div id="mqciEnfantPresenceDetails"></div>'+area("mqciEnfantDescription","Description utile (sans donnée sensible publique)",false);
 };
 window.changerPresenceEnfant=function(){
  const z=el("mqciEnfantPresenceDetails"),v=el("mqciEnfantPresence")?.value;
  z.innerHTML=v==="avec_moi"?'<label>Lieu d’habitation de celui qui a trouvé l’enfant (privé) *</label><input id="mqciEnfantAdresse" required style="'+style+'">':v==="avec_autorites"?'<label>Nom du commissariat / de la gendarmerie (privé) *</label><input id="mqciEnfantCommissariat" required style="'+style+'">':"";
 };
 window.envoyerDeclarationEnfant=async function(e){
  e.preventDefault();const status=el("mqciEnfantStatut");const v=id=>(el(id)?.value||"").trim();const type=v("mqciEnfantType");const file=el("mqciEnfantPhoto")?.files?.[0];
  if(!auth.currentUser){status.textContent="Connectez-vous à votre compte pour envoyer une déclaration.";return;}
  if(!file||file.size>8*1024*1024||!/^image\/(jpeg|png|webp)$/.test(file.type)){status.textContent="Ajoutez une photo JPG, PNG ou WEBP de 8 Mo maximum.";return;}
  if(type==="retrouve"&&!v("mqciEnfantPresence")){status.textContent="Indiquez où se trouve actuellement l’enfant.";return;}
  status.textContent="Envoi sécurisé en cours…";
  const form=el("mqciEnfantForm");
  try{
   const uid=auth.currentUser.uid;
   const id=form.dataset.declarationDraftId||(form.dataset.declarationDraftId=db.collection("declarations_enfants").doc().id);
   const photoKey="private/"+uid+"/"+id+"/photo";
   const publicData={type:type,nom:v("mqciEnfantNom"),age:type==="perdu"?v("mqciEnfantAge"):"",photoUrl:"",telephonePublic:"",presencePublic:"",statut:"en_attente",createdAt:firebase.firestore.FieldValue.serverTimestamp()};
   const prive={uid:uid,photoKey:photoKey,telephone:type==="perdu"?v("mqciEnfantTel"):"",adresseExacte:v("mqciEnfantAdresse"),nomDeclarant:v("mqciEnfantTrouvePar"),telephoneDeclarant:type==="retrouve"?v("mqciEnfantTel"):"",presence:type==="retrouve"?v("mqciEnfantPresence"):"",commissariat:v("mqciEnfantCommissariat"),lieuTrouve:v("mqciEnfantLieuPrecise"),commune:v("mqciEnfantCommune"),description:v("mqciEnfantDescription"),ageSaisi:type==="retrouve"?v("mqciEnfantAge"):"",createdAt:firebase.firestore.FieldValue.serverTimestamp()};
   if(form.dataset.declarationDraftCreated!=="true"){
    const ref=db.collection("declarations_enfants").doc(id);
    const batch=db.batch();batch.set(ref,publicData);batch.set(ref.collection("informations_privees").doc("contact"),prive);await batch.commit();
    form.dataset.declarationDraftCreated="true";
   }
   await workerJson("/upload/"+encodeURIComponent(id),{method:"POST",headers:{"Content-Type":file.type},body:file});
   status.textContent="Déclaration envoyée. Elle sera publiée uniquement après validation de l’administration.";
   form.reset();delete form.dataset.declarationDraftId;delete form.dataset.declarationDraftCreated;
  }catch(err){console.error(err);status.textContent="Envoi impossible : "+(err.message||"erreur inconnue");}
 };
 window.chargerDeclarationsEnfantsAdmin=async function(){
  const z=el("declarationsEnfantsAdminListe");if(!z||!admin())return;
  z.textContent="Chargement…";
  try{const snap=await db.collection("declarations_enfants").where("statut","==","en_attente").get();if(!snap.size){z.textContent="Aucune déclaration en attente.";return;}
   let out="";for(const d of snap.docs){const a=d.data();let p={};try{const ps=await d.ref.collection("informations_privees").doc("contact").get();if(ps.exists)p=ps.data();}catch(_){}
    let photo="";try{const response=await workerFetch("/admin/photo/"+encodeURIComponent(d.id)+"?ownerUid="+encodeURIComponent(p.uid),{method:"GET"});if(response.ok)photo=URL.createObjectURL(await response.blob());}catch(_){}
    out+='<article class="stop" style="margin:12px 0;padding:12px;border:1px solid #ccc;border-radius:10px"><strong>'+esc(a.type==="perdu"?"Enfant perdu":"Enfant retrouvé")+' — '+esc(a.nom||"Nom non renseigné")+'</strong>'+(photo?'<img src="'+esc(photo)+'" alt="Photo de l’enfant" style="display:block;width:100%;max-height:240px;object-fit:contain;margin:10px 0">':'<p>Photo non accessible</p>')+'<p>Âge : '+esc(a.age||p.ageSaisi||"Non précisé")+' · Commune (privée) : '+esc(p.commune||"Non précisée")+'</p><p>Description (privée) : '+esc(p.description||"")+'</p><p>Contact parent/déclarant (privé) : '+esc(p.telephone||p.telephoneDeclarant||"")+'</p><p>Adresse exacte (privée) : '+esc(p.adresseExacte||"")+'</p><p>Situation : '+esc(p.presence||"")+' · Commissariat : '+esc(p.commissariat||"")+'</p><button class="primary" onclick="moderationDeclarationEnfant(\''+d.id+'\',true)">Valider et publier la photo</button> <button onclick="moderationDeclarationEnfant(\''+d.id+'\',false)">Refuser</button></article>';
   }z.innerHTML=out;
  }catch(err){z.textContent="Erreur de chargement : "+err.message;}
 };
 window.moderationDeclarationEnfant=async function(id,approve){
  if(!admin())return alert("Accès administrateur requis.");
  try{const ref=db.collection("declarations_enfants").doc(id),snap=await ref.get();if(!snap.exists)return;const a=snap.data();
   if(approve){
    const privateSnap=await ref.collection("informations_privees").doc("contact").get();const p=privateSnap.exists?privateSnap.data():{};
    const isLost=a.type==="perdu";const phone=isLost?p.telephone:(p.presence==="avec_moi"?p.telephoneDeclarant:"");
    const publication=await workerJson("/admin/approve/"+encodeURIComponent(id),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ownerUid:p.uid})});
    const photoUrl=publication.photoUrl;
    const update={statut:"approuve",photoUrl:photoUrl,modereLe:firebase.firestore.FieldValue.serverTimestamp(),telephonePublic:phone||"",presencePublic:isLost?"":(p.presence||"")};
    await ref.update(update);
   }else await ref.update({statut:"refusee",modereLe:firebase.firestore.FieldValue.serverTimestamp()});
   await chargerDeclarationsEnfantsAdmin();
  }catch(err){alert("Modération impossible : "+err.message);}
 };
 async function afficherDeclarationsEnfantsPubliques(){
  const target=el("mqciDeclarationsEnfantsPubliques");if(!target)return;
  try{const snap=await db.collection("declarations_enfants").where("statut","==","approuve").limit(30).get();
   target.innerHTML=snap.docs.map(d=>{const a=d.data();return '<article class="stop" style="margin:12px 0;padding:12px;border:1px solid #ddd;border-radius:10px"><h3>'+esc(a.type==="perdu"?"Enfant recherché":"Enfant retrouvé")+' — '+esc(a.nom||"Nom non renseigné")+'</h3><img src="'+esc(a.photoUrl||"")+'" alt="Photo de l’enfant" style="width:100%;max-height:300px;object-fit:contain">'+(a.type==="perdu"?'<p>Âge : '+esc(a.age||"Non précisé")+'</p>':'<p>Situation actuelle : '+(a.presencePublic==="avec_moi"?"Avec moi":a.presencePublic==="avec_autorites"?"Avec les autorités":"Non précisée")+'</p>')+(a.telephonePublic?'<p>Contact : <a href="tel:'+esc(a.telephonePublic)+'">'+esc(a.telephonePublic)+'</a></p>':"")+'</article>';}).join("")||"Aucune déclaration publiée pour le moment.";
  }catch(err){target.textContent="Impossible de charger les déclarations publiées.";}
 }
 const oldOpen=window.ouvrirDeclarationsEnfants;
 window.ouvrirDeclarationsEnfants=function(){oldOpen();const form=el("mqciEnfantForm");if(!el("mqciDeclarationsEnfantsPubliques")){const pub=document.createElement("div");pub.innerHTML='<h3>Déclarations validées</h3><div id="mqciDeclarationsEnfantsPubliques">Chargement…</div>';form.parentNode.insertBefore(pub,form);}afficherDeclarationsEnfantsPubliques();};
 document.addEventListener("DOMContentLoaded",()=>{if(admin())chargerDeclarationsEnfantsAdmin();});
})();
