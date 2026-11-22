/* Cabines téléphoniques partenaires — demandes nationales diffusées */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const money=n=>Number(n||0).toLocaleString("fr-FR")+" FCFA";
const libelleStatut=s=>({en_attente:"En attente d’un cabiniste",acceptee:"Acceptée par un cabiniste",en_cours:"En cours de traitement",terminee:"Terminée"}[s]||s||"—");
let partenaire=null,profilCabine=null;
const section=document.createElement("section");
section.id="cabinesTelephoniques";section.className="card";section.style.display="none";
section.innerHTML='<h2>📞 Cabine téléphonique</h2><div class="cab-actions"><button id="cabTabClient" type="button">Faire une demande</button><button id="cabTabPartner" type="button">Espace cabiniste</button></div><p>Transfert d’unités et souscription de forfaits Internet ou appels. Votre demande est transmise à tous les cabinistes partenaires approuvés.</p><div id="cabClient"><h3>Faire une demande</h3><label>Opérateur</label><select id="cabOperateur"><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><label>Service souhaité</label><select id="cabService"><option value="transfert_unites">Transfert d’unités</option><option value="forfait_internet">Forfait Internet</option><option value="forfait_appels">Forfait appels</option><option value="forfait_mixte">Forfait mixte</option></select><label>Numéro bénéficiaire</label><input id="cabNumero" type="tel" maxlength="20" placeholder="Numéro à recharger"><label>Montant souhaité (FCFA)</label><input id="cabMontant" type="number" min="1" max="500000" step="1" inputmode="numeric" placeholder="Ex. 1 000"><label>Commune / ville</label><input id="cabCommuneClient" maxlength="60" placeholder="Ex. Yopougon"><label>Précisions sur le forfait ou la demande</label><textarea id="cabDetails" maxlength="180" placeholder="Ex. Forfait Internet 2 Go, si applicable"></textarea><button id="cabEnvoyer" class="primary">Envoyer ma demande</button><p id="cabMessage" aria-live="polite"></p><hr><h3>Suivi de mes demandes</h3><div id="cabHistorique">Connectez-vous pour consulter vos demandes.</div><button id="cabRefreshHistory" type="button">Actualiser</button></div><hr><div id="cabPartner" hidden><h3>Espace cabiniste partenaire</h3><div id="cabAuth"></div><div id="cabPanel" hidden></div></div>';
document.body.appendChild(section);
const css=document.createElement("style");css.textContent="#cabinesTelephoniques .cab-item{border:1px solid #e1eae2;border-radius:14px;padding:12px;margin:10px 0;background:#fff}#cabinesTelephoniques label{display:block;margin-top:10px}#cabinesTelephoniques input,#cabinesTelephoniques select,#cabinesTelephoniques textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #dce7de;border-radius:10px}#cabinesTelephoniques .cab-actions{display:flex;gap:8px;flex-wrap:wrap}";document.head.appendChild(css);
function ouvrirCabinesTelephoniques(){if(typeof ouvrirSectionPleinEcran==="function")ouvrirSectionPleinEcran("cabinesTelephoniques","Cabine téléphonique");else section.style.display="block";chargerHistorique();}
window.ouvrirCabinesTelephoniques=ouvrirCabinesTelephoniques;
$("cabEnvoyer").onclick=async()=>{
 const u=auth.currentUser,amount=Number($("cabMontant").value),phone=$("cabNumero").value.trim(),commune=$("cabCommuneClient").value.trim(),details=$("cabDetails").value.trim(),button=$("cabEnvoyer"),msg=$("cabMessage");
 if(!u){msg.textContent="Connectez-vous à votre compte client pour envoyer une demande.";return;}
 if(!Number.isSafeInteger(amount)||amount<1||amount>500000||phone.length<8||phone.length>20||commune.length<2||details.length<2){msg.textContent="Vérifiez le numéro, le montant, la commune et les précisions.";return;}
 button.disabled=true;msg.textContent="Envoi de votre demande à tous les cabinistes partenaires…";
 try{
  await db.collection("demandes_cabines").add({clientUid:u.uid,operateur:$("cabOperateur").value,typeService:$("cabService").value,numeroBeneficiaire:phone,montantPrestation:amount,commune:commune,details:details,cabineUid:null,statut:"en_attente",createdAt:stamp(),updatedAt:stamp()});
  msg.textContent="Demande envoyée. Tous les cabinistes partenaires approuvés peuvent maintenant la voir. Vous serez informé lorsqu’un cabiniste l’acceptera.";
  $("cabNumero").value="";$("cabMontant").value="";$("cabDetails").value="";
  await chargerHistorique();
 }catch(e){console.error(e);msg.textContent="Envoi impossible : "+(e.message||"réessayez.");}
 finally{button.disabled=false;}
};
$("cabRefreshHistory").onclick=chargerHistorique;
$("cabTabClient").onclick=()=>{$("cabClient").hidden=false;$("cabPartner").hidden=true;chargerHistorique();};
$("cabTabPartner").onclick=()=>{$("cabClient").hidden=true;$("cabPartner").hidden=false;if(!partenaire)authPartenaire();else espaceCabine();};
async function chargerHistorique(){
 const z=$("cabHistorique"),u=auth.currentUser;if(!z)return;
 if(!u){z.textContent="Connectez-vous pour consulter vos demandes.";return;}
 try{
  const q=await db.collection("demandes_cabines").where("clientUid","==",u.uid).limit(40).get();
  if(q.empty){z.innerHTML="<p>Aucune demande pour le moment.</p>";return;}
  const docs=q.docs.slice().sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
  z.innerHTML=docs.map(d=>{const x=d.data();return '<article class="cab-item"><strong>'+esc(x.operateur)+' · '+esc(x.typeService)+'</strong><p>Numéro : '+esc(x.numeroBeneficiaire)+' · '+money(x.montantPrestation)+'</p><p>'+esc(x.commune)+' — '+esc(x.details)+'</p><strong>'+esc(libelleStatut(x.statut))+'</strong>'+(x.cabineNom?'<p>Cabiniste : '+esc(x.cabineNom)+'</p>':"")+'</article>';}).join("");
 }catch(e){console.error(e);z.textContent="Historique indisponible pour le moment.";}
}
function authPartenaire(){
 const z=$("cabAuth");if(!z)return;
 z.hidden=false;
 z.innerHTML='<div class="cab-item"><h4>Connexion cabiniste</h4><label>E-mail</label><input id="cabEmail" type="email" autocomplete="username"><label>Mot de passe</label><input id="cabPass" type="password" autocomplete="current-password"><button id="cabLogin" type="button">Connexion</button><hr><h4>Devenir cabiniste partenaire</h4><label>Nom commercial de la cabine</label><input id="cabNomNew" maxlength="100"><label>Nom du responsable</label><input id="cabResp" maxlength="100"><label>E-mail</label><input id="cabEmailNew" type="email"><label>Mot de passe (6 caractères minimum)</label><input id="cabPassNew" type="password" minlength="6"><label>Téléphone</label><input id="cabTel" type="tel" maxlength="24"><label>Commune</label><input id="cabCommune" maxlength="60"><label>Adresse / repère</label><input id="cabAdresse" maxlength="200"><label>Horaires</label><input id="cabHoraires" maxlength="100" placeholder="Ex. 8h–20h"><label>Opérateurs servis</label><select id="cabOps" multiple><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><small>Maintenez la sélection pour choisir plusieurs opérateurs.</small><button id="cabInscrire" class="primary" type="button">Envoyer ma candidature</button><p id="cabAuthMsg" aria-live="polite"></p></div>';
 $("cabLogin").onclick=async()=>{const b=$("cabLogin"),m=$("cabAuthMsg");b.disabled=true;try{partenaire=(await partnerAuth.signInWithEmailAndPassword($("cabEmail").value.trim(),$("cabPass").value)).user;await espaceCabine();}catch(e){m.textContent="Connexion impossible : "+(e.message||"vérifiez vos identifiants.");}finally{b.disabled=false;}};
 $("cabInscrire").onclick=async()=>{const b=$("cabInscrire"),m=$("cabAuthMsg");b.disabled=true;try{
  const nom=$("cabNomNew").value.trim(),responsable=$("cabResp").value.trim(),email=$("cabEmailNew").value.trim(),pass=$("cabPassNew").value,tel=$("cabTel").value.trim(),commune=$("cabCommune").value.trim(),adresse=$("cabAdresse").value.trim(),ops=Array.from($("cabOps").selectedOptions).map(o=>o.value);
  if(nom.length<2||responsable.length<2||!email||pass.length<6||tel.length<8||commune.length<2||adresse.length<5||!ops.length)throw Error("Complétez tous les champs obligatoires.");
  partenaire=(await partnerAuth.createUserWithEmailAndPassword(email,pass)).user;
  await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).set({uid:partenaire.uid,nom,responsable,email,telephone:tel,commune,adresse,horaires:$("cabHoraires").value.trim(),operateurs:ops,statut:"en_attente",createdAt:stamp(),updatedAt:stamp()});
  m.textContent="Candidature envoyée. Votre espace sera activé après validation par l’administration.";await espaceCabine();
 }catch(e){m.textContent="Candidature impossible : "+(e.message||"réessayez.");}finally{b.disabled=false;}};
}
async function espaceCabine(){
 $("cabAuth").hidden=true;$("cabPanel").hidden=false;
 try{
  const p=await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).get();
  if(!p.exists){$("cabPanel").textContent="Aucune candidature cabiniste trouvée pour ce compte.";return;}
  profilCabine=p.data();
  $("cabPanel").innerHTML='<div class="cab-item"><strong>'+esc(profilCabine.nom)+'</strong><p>Statut : '+esc(profilCabine.statut)+'</p><button id="cabLogout" type="button">Déconnexion</button></div><div id="cabOrders"><p>Chargement des demandes…</p></div>';
  $("cabLogout").onclick=async()=>{await partnerAuth.signOut();partenaire=null;profilCabine=null;$("cabPanel").hidden=true;$("cabAuth").hidden=false;};
  if(profilCabine.statut!=="approuve"){$("cabOrders").innerHTML="<p class='notice'>Votre compte est en attente de validation. Vous pourrez recevoir des demandes dès son approbation.</p>";return;}
  await chargerDemandesCabine();
 }catch(e){$("cabPanel").textContent="Espace cabiniste indisponible : "+(e.message||"erreur");}
}
async function chargerDemandesCabine(){
 const z=$("cabOrders");if(!z||!partenaire||!profilCabine||profilCabine.statut!=="approuve")return;
 z.innerHTML="<p>Actualisation des demandes nationales…</p>";
 try{
  const [open,assigned]=await Promise.all([
   partnerDb.collection("demandes_cabines").where("statut","==","en_attente").where("cabineUid","==",null).limit(100).get(),
   partnerDb.collection("demandes_cabines").where("cabineUid","==",partenaire.uid).limit(100).get()
  ]);
  const map=new Map();open.docs.forEach(d=>map.set(d.id,d));assigned.docs.forEach(d=>map.set(d.id,d));
  const docs=Array.from(map.values()).sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
  if(!docs.length){z.innerHTML="<p>Aucune demande disponible pour le moment. Actualisez régulièrement.</p><button id='cabReload'>Actualiser</button>";$("cabReload").onclick=chargerDemandesCabine;return;}
  z.innerHTML='<h4>Demandes reçues ('+docs.length+')</h4><button id="cabReload" type="button">Actualiser les demandes</button>'+docs.map(d=>{
   const a=d.data(),mine=a.cabineUid===partenaire.uid,openRequest=a.statut==="en_attente"&&!a.cabineUid;
   return '<article class="cab-item"><strong>'+esc(a.operateur)+' · '+esc(a.typeService)+'</strong><p>Numéro bénéficiaire : '+esc(a.numeroBeneficiaire)+'</p><p>Montant souhaité : '+money(a.montantPrestation)+'</p><p>Commune : '+esc(a.commune)+' · '+esc(a.details)+'</p><strong>'+esc(libelleStatut(a.statut))+'</strong>'+(mine?'<p>Demande attribuée à votre cabine.</p>':"")+(openRequest?'<div class="cab-actions"><button type="button" onclick="window.cabAccepter(\''+d.id+'\')">Accepter la demande</button></div>':"")+(mine&&a.statut==="acceptee"?'<div class="cab-actions"><button type="button" onclick="window.cabChangerStatut(\''+d.id+'\',\'en_cours\')">Démarrer le traitement</button></div>':"")+(mine&&a.statut==="en_cours"?'<div class="cab-actions"><button type="button" onclick="window.cabChangerStatut(\''+d.id+'\',\'terminee\')">Confirmer la prestation terminée</button></div>':"")+'</article>';
  }).join("");
  $("cabReload").onclick=chargerDemandesCabine;
 }catch(e){console.error(e);z.innerHTML="<p>Impossible de charger les demandes. Vérifiez les règles Firestore et les index.</p>";}
}
window.cabAccepter=async id=>{
 if(!partenaire||!profilCabine||profilCabine.statut!=="approuve")return;
 try{
  const ref=partnerDb.collection("demandes_cabines").doc(id);
  await partnerDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().statut!=="en_attente"||snap.data().cabineUid)throw new Error("Cette demande vient d’être prise en charge par un autre cabiniste.");tx.update(ref,{cabineUid:partenaire.uid,cabineNom:profilCabine.nom,statut:"acceptee",updatedAt:stamp()});});
  alert("Demande attribuée à votre cabine.");await chargerDemandesCabine();
 }catch(e){alert(e.message||"Impossible d’accepter cette demande.");await chargerDemandesCabine();}
};
window.cabChangerStatut=async(id,statut)=>{
 if(!partenaire||!["en_cours","terminee"].includes(statut))return;
 try{await partnerDb.collection("demandes_cabines").doc(id).update({statut,updatedAt:stamp()});await chargerDemandesCabine();}
 catch(e){alert("Mise à jour impossible : "+(e.message||"erreur"));}
};
function panneauAdmin(){
 if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert("Accès administrateur requis.");return;}
 let z=document.getElementById("cabAdminPanel");
 if(!z){z=document.createElement("section");z.id="cabAdminPanel";z.className="card";document.getElementById("espaceAdmin").appendChild(z);}
 z.style.display="block";z.innerHTML="<h3>Cabines téléphoniques — administration</h3><h4>Candidatures partenaires</h4><div id='cabAdminCabines'>Chargement…</div><h4>Demandes des clients</h4><div id='cabAdminDemandes'>Chargement…</div>";
 db.collection("cabines_telephoniques").limit(200).get().then(q=>{$("cabAdminCabines").innerHTML=q.empty?"Aucune candidature.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.nom)+"</strong> · "+esc(x.commune)+" · "+esc(x.telephone)+"<p>"+esc(x.adresse)+" · "+esc((x.operateurs||[]).join(", "))+"</p><p>Statut : "+esc(x.statut)+"</p>"+(x.statut==="en_attente"?"<button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','approuve')\">Approuver</button><button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','refuse')\">Refuser</button>":"")+"</article>";}).join("");}).catch(e=>$("cabAdminCabines").textContent="Chargement impossible : "+e.message);
 db.collection("demandes_cabines").limit(200).get().then(q=>{$("cabAdminDemandes").innerHTML=q.empty?"Aucune demande.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.operateur)+" · "+esc(x.typeService)+"</strong><p>"+esc(x.commune)+" · "+esc(x.numeroBeneficiaire)+" · "+money(x.montantPrestation)+"</p><p>"+esc(libelleStatut(x.statut))+" · Cabiniste : "+esc(x.cabineNom||"Non attribuée")+"</p></article>";}).join("");}).catch(e=>$("cabAdminDemandes").textContent="Chargement impossible : "+e.message);
}
window.cabAdminCabine=async(id,s)=>{if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID||!["approuve","refuse"].includes(s))return;try{await db.collection("cabines_telephoniques").doc(id).update({statut:s,updatedAt:stamp(),validePar:auth.currentUser.uid});panneauAdmin();}catch(e){alert(e.message);}};
if(typeof RUBRIQUES_ADMIN!=="undefined"&&!RUBRIQUES_ADMIN.some(r=>r.id==="gestionCabinesAdmin"))RUBRIQUES_ADMIN.push({id:"gestionCabinesAdmin",groupe:"Professionnels",icone:"📞",titre:"Cabines téléphoniques",description:"Valider les cabinistes et suivre les demandes."});
if(typeof ouvrirRubriqueAdmin==="function"){const ancien=window.ouvrirRubriqueAdmin;window.ouvrirRubriqueAdmin=function(id){if(id==="gestionCabinesAdmin"){const menu=document.getElementById("adminMenuRubriques");if(menu)menu.style.display="none";RUBRIQUES_ADMIN.forEach(r=>{const e=document.getElementById(r.id);if(e)e.style.display="none";});panneauAdmin();return;}return ancien.apply(this,arguments);};}
if(typeof auth!=="undefined"&&auth.onAuthStateChanged)auth.onAuthStateChanged(chargerHistorique);
})();