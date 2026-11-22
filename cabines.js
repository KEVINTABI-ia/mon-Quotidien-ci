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
section.innerHTML=`<h2>📞 Cabine téléphonique</h2>
<div class="cab-actions"><button id="cabTabClient" type="button">Espace client</button><button id="cabTabPartner" type="button">Espace cabiniste</button></div>
<div id="cabClient"><p>Choisissez votre opération. Votre demande sera proposée aux cabinistes partenaires actuellement en ligne dans toute la Côte d’Ivoire.</p>
<div class="cab-actions" id="cabClientChoices"><button id="cabStartTransfer" class="primary" type="button">Transfert d’unité</button><button id="cabStartSubscribe" class="primary" type="button">Souscrit</button></div>
<div id="cabRequestForm" class="cab-item" hidden><h3 id="cabFormTitle">Nouvelle opération</h3>
<label>Type de service</label><select id="cabService"><option value="transfert_unites">Transfert d’unité</option><option value="forfait_appels">Forfait appel</option><option value="forfait_internet">Forfait internet</option></select>
<label>Opérateur</label><select id="cabOperateur"><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><div id="cabCatalogue"></div>
<label>Numéro bénéficiaire</label><input id="cabNumero" type="tel" maxlength="20" placeholder="Numéro à recharger">
<label>Montant de l’opération (FCFA)</label><input id="cabMontant" type="number" min="200" max="500000" step="1" inputmode="numeric" placeholder="Ex. 1 000">
<label>Commune / ville</label><input id="cabCommuneClient" maxlength="60" placeholder="Ex. Yopougon">
<label>Précisions</label><textarea id="cabDetails" maxlength="180" placeholder="Détail du transfert ou du forfait choisi"></textarea>
<label>Moyen de paiement Jèko</label><select id="cabPaymentMethod"><option value="wave">Wave</option><option value="orange">Orange Money</option><option value="mtn">MTN Money</option><option value="moov">Moov Money</option><option value="djamo">Djamo</option></select>
<p id="cabFeePreview" class="cab-muted">Frais de service : —</p><div class="cab-actions"><button id="cabEnvoyer" class="primary" type="button">Valider et payer avec Jèko</button><button id="cabCancelForm" type="button">Annuler</button></div><p id="cabMessage" aria-live="polite"></p></div>
<hr><h3>Suivi de mes demandes</h3><div id="cabHistorique">Connectez-vous pour consulter vos demandes.</div><button id="cabRefreshHistory" type="button">Actualiser</button></div>
<hr><div id="cabPartner" hidden><h3>Espace cabiniste partenaire</h3><div id="cabAuth"></div><div id="cabPanel" hidden></div></div>`;
document.body.appendChild(section);
const cabForfaits=[
 {op:"Orange",type:"forfait_mixte",name:"Mix KDO",price:500,data:"250 Mo",minutes:"50 min",validity:"3 jours",code:"#111*11#",source:"https://www.orange.ci/fr/pass-kdo.html"},
 {op:"Orange",type:"forfait_internet",name:"Data KDO",price:500,data:"1 Go",minutes:"—",validity:"3 jours",code:"#111*11#",source:"https://www.orange.ci/fr/pass-kdo.html"},
 {op:"Orange",type:"forfait_internet",name:"Data KDO",price:3000,data:"4 Go",minutes:"—",validity:"30 jours",code:"#111*11#",source:"https://www.orange.ci/fr/pass-kdo.html"},
 {op:"Moov Africa",type:"forfait_internet",name:"Moov Folie Jour",price:200,data:"650 Mo",minutes:"—",validity:"1 jour",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_internet",name:"Moov Folie Jour",price:300,data:"900 Mo",minutes:"—",validity:"1 jour",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_internet",name:"Moov Folie",price:500,data:"1,5 Go",minutes:"—",validity:"3 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_internet",name:"Moov Folie",price:1000,data:"4 Go",minutes:"—",validity:"5 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Moov Folie Nuit",price:200,data:"2 Go",minutes:"30 min tous réseaux",validity:"22h–7h",code:"*303*2*1*7#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Moov Folie Hebdo",price:700,data:"2 Go",minutes:"60 min",validity:"7 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_internet",name:"Moov Folie Hebdo",price:1500,data:"6 Go",minutes:"—",validity:"7 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/forfait-internet-moov-folie/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:150,data:"—",minutes:"12 min tous réseaux",validity:"1 jour",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:200,data:"—",minutes:"20 min tous réseaux",validity:"2 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:300,data:"—",minutes:"35 min tous réseaux + 5 favoris",validity:"2 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:500,data:"—",minutes:"70 min tous réseaux + 5 favoris",validity:"5 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:1000,data:"—",minutes:"140 min tous réseaux + 5 favoris",validity:"15 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:1500,data:"—",minutes:"210 min tous réseaux + 5 favoris",validity:"21 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:2500,data:"—",minutes:"350 min tous réseaux + 5 favoris",validity:"30 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_appels",name:"Moov Folie Appel",price:5000,data:"—",minutes:"700 min tous réseaux + 5 favoris",validity:"30 jours",code:"*303*2#",source:"https://www.moov-africa.ci/espace-particulier/folie-mix/moov-folie-appel/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Izy Mix+",price:150,data:"15 Mo",minutes:"10 min + 30 SMS",validity:"1 jour",code:"*303*1#",source:"https://www.moov-africa.ci/espace-particulier/forfaits-izy-mix/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Izy Mix+",price:200,data:"25 Mo",minutes:"17 min + 50 SMS",validity:"1 jour",code:"*303*1#",source:"https://www.moov-africa.ci/espace-particulier/forfaits-izy-mix/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Izy Mix+",price:500,data:"250 Mo",minutes:"50 min + 250 SMS",validity:"5 jours",code:"*303*1#",source:"https://www.moov-africa.ci/espace-particulier/forfaits-izy-mix/"},
 {op:"Moov Africa",type:"forfait_mixte",name:"Izy Mix+",price:1500,data:"1,5 Go",minutes:"200 min + 500 SMS",validity:"15 jours",code:"*303*1#",source:"https://www.moov-africa.ci/espace-particulier/forfaits-izy-mix/"}
];
const cabTypeLabels={forfait_internet:"Internet",forfait_appels:"Appels",forfait_mixte:"Mixte"};
function rendreCatalogueCabine(){
 const root=$("cabCatalogue");if(!root)return;
 const op=$("cabOperateur").value,kind=$("cabService").value;
 const matching=cabForfaits.filter(x=>x.op===op&&x.type===kind);
 const card=x=>'<article class="cab-item cab-offer"><div class="cab-request-head"><strong>'+esc(x.name)+'</strong><span class="cab-pill">'+esc(x.validity)+'</span></div><p class="cab-price">'+x.price.toLocaleString("fr-FR")+' FCFA</p><p>'+esc(x.data)+' · '+esc(x.minutes)+'</p><p class="cab-muted">Souscription opérateur : '+esc(x.code)+'</p><button type="button" class="primary" data-cab-offer="'+cabForfaits.indexOf(x)+'">Choisir ce forfait</button><a href="'+esc(x.source)+'" target="_blank" rel="noopener">Détails officiels</a></article>';
 let html='<div class="cab-catalog-head"><h3>Choisir rapidement un forfait</h3><p class="cab-muted">Comparez les offres publiées par les opérateurs, puis sélectionnez celle à demander à votre cabiniste.</p></div>';
 if(matching.length)html+='<div class="cab-offers">'+matching.map(card).join("")+'</div>';
 else if(op==="MTN"){
  const code=kind==="forfait_internet"?"*105*2#":kind==="forfait_appels"?"*105*1#":"*105#";
  html+='<div class="cab-item"><strong>Offres MTN '+esc(cabTypeLabels[kind]||"")+'</strong><p>MTN propose ses packs depuis le menu officiel. Les prix et avantages sont affichés dans le menu selon la ligne et les offres en cours.</p><p class="cab-muted">Code de souscription : '+esc(code)+'</p><a href="https://moninternet.mtn.ci" target="_blank" rel="noopener">Consulter les forfaits Internet MTN</a> · <a href="https://www.mtn.ci/deal/codes-ussd/" target="_blank" rel="noopener">Codes officiels MTN</a><button type="button" class="primary" id="cabMtnChoose">Faire une demande MTN</button></div>';
 }else if(op==="Orange"&&kind==="forfait_appels"){
  html+='<div class="cab-item"><strong>Pass voix Orange</strong><p>Les offres voix disponibles sont à consulter dans le menu opérateur, car les détails tarifaires ne sont pas publiés sur la page officielle consultée.</p><p class="cab-muted">Menu Orange : #111# · Pass Mix : #111*11#</p><a href="https://www.orange.ci/fr/max-it/super-app-orange-et-moi-orange-money.html" target="_blank" rel="noopener">Voir les offres sur Max it</a><button type="button" class="primary" id="cabOrangeChoose">Faire une demande Orange</button></div>';
 }else html+='<div class="cab-item">Aucune offre tarifée confirmée pour ce filtre. Vous pouvez tout de même faire une demande personnalisée auprès d’un cabiniste.</div>';
 root.innerHTML=html+'<p class="cab-muted">Offres relevées sur les pages officielles consultées le 22/11/2026. Les promotions, l’éligibilité et les tarifs peuvent évoluer ; vérifiez toujours avant validation.</p>';
 root.querySelectorAll("[data-cab-offer]").forEach(b=>b.onclick=()=>selectionnerForfaitCabine(cabForfaits[Number(b.dataset.cabOffer)]));
 const generic=()=>{ $("cabMontant").value="";$("cabDetails").value="Forfait "+(cabTypeLabels[kind]||"")+" à préciser avec le cabiniste."; $("cabCommuneClient").focus(); document.getElementById("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});};
 $("cabMtnChoose")?.addEventListener("click",generic);$("cabOrangeChoose")?.addEventListener("click",generic);
}
function selectionnerForfaitCabine(x){
 $("cabOperateur").value=x.op;$("cabService").value=x.type;$("cabMontant").value=x.price;
 $("cabDetails").value=x.name+" — "+x.data+" — "+x.minutes+" — validité "+x.validity+" (code opérateur "+x.code+").";
 rendreCatalogueCabine();
 $("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});
 $("cabNumero").focus({preventScroll:true});
}
$("cabOperateur").addEventListener("change",rendreCatalogueCabine);
$("cabService").addEventListener("change",rendreCatalogueCabine);
rendreCatalogueCabine();
const css=document.createElement("style");css.textContent=`
#cabinesTelephoniques{max-width:760px;margin:0 auto}
#cabinesTelephoniques .cab-item{border:1px solid #e1eae2;border-radius:16px;padding:14px;margin:10px 0;background:#fff;box-shadow:0 4px 14px #173b2b0b}
#cabinesTelephoniques label{display:block;margin-top:10px}
#cabinesTelephoniques input,#cabinesTelephoniques select,#cabinesTelephoniques textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #dce7de;border-radius:10px}
#cabinesTelephoniques .cab-actions{display:flex;gap:8px;flex-wrap:wrap}
#cabinesTelephoniques .cab-actions button{background:#edf6ef;color:#17663d;border:1px solid #d8e8dc}
#cabinesTelephoniques .cab-actions button.primary{background:#16834a;color:#fff}
#cabinesTelephoniques .cab-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
#cabinesTelephoniques .cab-tabs button{flex:1;min-width:130px;background:#f1f6f2;color:#31513d}
#cabinesTelephoniques .cab-tabs button.active{background:#17663d;color:#fff}
#cabinesTelephoniques .cab-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}
#cabinesTelephoniques .cab-stat{background:#f4f8f4;border:1px solid #e2ece3;border-radius:14px;padding:12px;text-align:center}
#cabinesTelephoniques .cab-stat strong{display:block;font-size:21px;color:#17663d}
#cabinesTelephoniques .cab-stat span{font-size:11px;color:#68786e}
#cabinesTelephoniques .cab-pill{display:inline-block;padding:4px 9px;border-radius:20px;background:#edf6ef;color:#17663d;font-size:12px;font-weight:700}
#cabinesTelephoniques .cab-muted{color:#68786e;font-size:12px}
#cabinesTelephoniques .cab-request-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
#cabinesTelephoniques .cab-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
#cabinesTelephoniques button:disabled{opacity:.55;cursor:not-allowed}
@media(max-width:420px){#cabinesTelephoniques .cab-stats{gap:5px}#cabinesTelephoniques .cab-stat{padding:9px 5px}#cabinesTelephoniques .cab-stat strong{font-size:18px}#cabinesTelephoniques .cab-filter{grid-template-columns:1fr}}
#cabinesTelephoniques .cab-offers{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}
#cabinesTelephoniques .cab-offer .cab-price{font-size:21px;font-weight:800;color:#17663d;margin:8px 0}
#cabinesTelephoniques .cab-offer a,#cabinesTelephoniques .cab-item a{display:inline-block;margin:9px 8px 0 0;color:#17663d;text-decoration:underline;font-size:13px}
#cabinesTelephoniques .cab-catalog-head{margin:12px 0}
#cabinesTelephoniques .cab-catalog-head h3{margin-bottom:4px}`;document.head.appendChild(css);
function ouvrirCabinesTelephoniques(){if(typeof ouvrirSectionPleinEcran==="function")ouvrirSectionPleinEcran("cabinesTelephoniques","Cabine téléphonique");else section.style.display="block";chargerHistorique();}
window.ouvrirCabinesTelephoniques=ouvrirCabinesTelephoniques;
let cabRequestMode="transfer";
function ouvrirFormulaireCabine(mode){cabRequestMode=mode;$("cabRequestForm").hidden=false;$("cabClientChoices").hidden=true;$("cabFormTitle").textContent=mode==="transfer"?"Transfert d’unité":"Souscrire un forfait";$("cabService").value=mode==="transfer"?"transfert_unites":"forfait_appels";$("cabService").disabled=mode==="transfer";$("cabCatalogue").hidden=mode==="transfer";rendreCatalogueCabine();$("cabNumero").focus();}
$("cabStartTransfer").onclick=()=>ouvrirFormulaireCabine("transfer");$("cabStartSubscribe").onclick=()=>ouvrirFormulaireCabine("subscribe");
$("cabCancelForm").onclick=()=>{$("cabRequestForm").hidden=true;$("cabClientChoices").hidden=false;$("cabMessage").textContent="";};
function fraisCabine(montant){return montant<=999?18:(montant<=3000?40:75);}
function actualiserFraisCabine(){const amount=Number($("cabMontant").value),fee=Number.isSafeInteger(amount)&&amount>=200?fraisCabine(amount):null;$("cabFeePreview").textContent=fee===null?"Frais : montant minimum 200 FCFA.":"Frais : "+money(fee)+" · Total à payer : "+money(amount+fee);}
$("cabMontant").addEventListener("input",actualiserFraisCabine);
$("cabService").addEventListener("change",()=>{rendreCatalogueCabine();$("cabCatalogue").hidden=$("cabService").value==="transfert_unites";});
$("cabEnvoyer").onclick=async()=>{
 const u=auth.currentUser,amount=Number($("cabMontant").value),phone=$("cabNumero").value.trim(),commune=$("cabCommuneClient").value.trim(),details=$("cabDetails").value.trim(),button=$("cabEnvoyer"),msg=$("cabMessage");
 const typeService=cabRequestMode==="transfer"?"transfert_unites":$("cabService").value;
 if(!u){msg.textContent="Connectez-vous à votre compte client pour payer.";return;}
 if(!Number.isSafeInteger(amount)||amount<200||amount>500000||phone.length<8||phone.length>20||commune.length<2||details.length<2){msg.textContent="Vérifiez le numéro, le montant (200 FCFA minimum), la commune et les précisions.";return;}
 button.disabled=true;msg.textContent="Préparation sécurisée du paiement Jèko…";
 try{const token=await u.getIdToken();const response=await fetch("https://mon-quotidien-jeko.tabikevin57.workers.dev/api/jeko/checkout",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({serviceId:"cabine",typeService,operateur:$("cabOperateur").value,numeroBeneficiaire:phone,amountPrestation:amount,commune,details,paymentMethod:$("cabPaymentMethod").value})});
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.checkoutUrl)throw new Error(data.diagnostic||data.error||"Jèko n’a pas pu préparer le paiement.");
 msg.textContent="Redirection vers Jèko. La demande sera transmise aux cabines après confirmation du paiement.";window.location.assign(data.checkoutUrl);
 }catch(e){console.error("Cabine Jèko:",e);msg.textContent="Paiement impossible : "+(e.message||"erreur");button.disabled=false;}
};$("cabRefreshHistory").onclick=chargerHistorique;
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
  $("cabPanel").innerHTML='<div class="cab-item"><div class="cab-request-head"><div><strong style="font-size:18px">'+esc(profilCabine.nom)+'</strong><p class="cab-muted">'+esc(profilCabine.commune)+' · '+esc(profilCabine.telephone)+'</p></div><span class="cab-pill">'+esc(profilCabine.statut==="approuve"?"Partenaire approuvé":profilCabine.statut==="refuse"?"Candidature refusée":"En attente de validation")+'</span></div><p class="cab-muted">Opérateurs : '+esc((profilCabine.operateurs||[]).join(" · "))+'<br>Horaires : '+esc(profilCabine.horaires||"Non renseignés")+'</p><button id="cabLogout" type="button">Déconnexion</button></div><div id="cabOrders"></div>';
  $("cabLogout").onclick=async()=>{await arreterPresenceCabine();await partnerAuth.signOut();partenaire=null;profilCabine=null;$("cabPanel").hidden=true;$("cabAuth").hidden=false;};
  if(profilCabine.statut!=="approuve"){$("cabOrders").innerHTML="<p class='notice'>Votre candidature est en cours de validation. Dès son approbation, vous pourrez consulter et accepter les demandes de toute la Côte d’Ivoire.</p>";return;}
  await demarrerPresenceCabine();
  await chargerDemandesCabine();
  if(cabRequestRefreshTimer)clearInterval(cabRequestRefreshTimer);
  cabRequestRefreshTimer=setInterval(()=>{if(document.visibilityState==="visible")chargerDemandesCabine();},25000);
 }catch(e){$("cabPanel").textContent="Espace cabiniste indisponible : "+(e.message||"erreur");}
}
let cabDocsCache=[],cabVue="ouvertes",cabPresenceTimer=null,cabRequestRefreshTimer=null;
async function actualiserPresenceCabine(){if(!partenaire||!profilCabine||profilCabine.statut!=="approuve")return;try{await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).update({presenceOnline:document.visibilityState==="visible",lastSeenAt:stamp(),updatedAt:stamp()});}catch(e){console.warn("Présence cabine non actualisée",e);}}
async function demarrerPresenceCabine(){await actualiserPresenceCabine();if(cabPresenceTimer)clearInterval(cabPresenceTimer);cabPresenceTimer=setInterval(actualiserPresenceCabine,45000);document.removeEventListener("visibilitychange",actualiserPresenceCabine);document.addEventListener("visibilitychange",actualiserPresenceCabine);}
async function arreterPresenceCabine(){if(cabPresenceTimer)clearInterval(cabPresenceTimer);cabPresenceTimer=null;if(cabRequestRefreshTimer)clearInterval(cabRequestRefreshTimer);cabRequestRefreshTimer=null;document.removeEventListener("visibilitychange",actualiserPresenceCabine);if(partenaire&&profilCabine?.statut==="approuve"){try{await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).update({presenceOnline:false,lastSeenAt:stamp(),updatedAt:stamp()});}catch(e){}}}
function dateCabine(v){try{return v&&v.toDate?v.toDate().toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}):"Date non disponible";}catch(_){return"Date non disponible";}}
function afficherDemandesCabine(){
 const z=$("cabOrders");if(!z)return;
 const op=$("cabFiltreOperateur")?.value||"",zone=($("cabFiltreCommune")?.value||"").trim().toLocaleLowerCase("fr");
 const docs=cabDocsCache.filter(d=>{
  const a=d.data(),mine=a.cabineUid===partenaire.uid;
  return (cabVue==="ouvertes"?!mine&&a.statut==="en_attente":mine)&&(!op||a.operateur===op)&&(!zone||String(a.commune||"").toLocaleLowerCase("fr").includes(zone));
 });
 const ouvertes=cabDocsCache.filter(d=>d.data().statut==="en_attente"&&!d.data().cabineUid).length;
 const miennes=cabDocsCache.filter(d=>d.data().cabineUid===partenaire.uid);
 const encours=miennes.filter(d=>["acceptee","en_cours"].includes(d.data().statut)).length;
 const terminees=miennes.filter(d=>d.data().statut==="terminee").length;
 z.innerHTML='<div class="cab-stats"><div class="cab-stat"><strong>'+ouvertes+'</strong><span>Demandes disponibles</span></div><div class="cab-stat"><strong>'+encours+'</strong><span>À traiter</span></div><div class="cab-stat"><strong>'+terminees+'</strong><span>Terminées</span></div></div><div class="cab-tabs"><button type="button" data-cab-vue="ouvertes" class="'+(cabVue==="ouvertes"?"active":"")+'">Demandes disponibles</button><button type="button" data-cab-vue="miennes" class="'+(cabVue==="miennes"?"active":"")+'">Mes prestations ('+miennes.length+')</button></div><div class="cab-filter"><select id="cabFiltreOperateur"><option value="">Tous les opérateurs</option><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><input id="cabFiltreCommune" type="search" placeholder="Filtrer par commune"></div><div class="cab-actions"><button id="cabReload" type="button">↻ Actualiser les demandes</button></div><p class="cab-muted">Les demandes disponibles sont diffusées à tous les cabinistes approuvés. La première acceptation attribue la demande.</p>';
 z.querySelectorAll("[data-cab-vue]").forEach(b=>b.onclick=()=>{cabVue=b.dataset.cabVue;afficherDemandesCabine();});
 $("cabFiltreOperateur").value=op;$("cabFiltreCommune").value=zone;
 $("cabFiltreOperateur").onchange=afficherDemandesCabine;$("cabFiltreCommune").onchange=afficherDemandesCabine;$("cabReload").onclick=chargerDemandesCabine;
 if(!docs.length){z.insertAdjacentHTML("beforeend",'<div class="cab-item"><strong>Aucune demande dans cette rubrique</strong><p class="cab-muted">'+(cabVue==="ouvertes"?"De nouvelles demandes apparaîtront ici dès qu’un client en publiera une.":"Les prestations que vous acceptez apparaîtront ici.")+'</p></div>');return;}
 docs.forEach(d=>{
  const a=d.data(),mine=a.cabineUid===partenaire.uid,article=document.createElement("article");article.className="cab-item";
  const titre=document.createElement("div");titre.className="cab-request-head";
  const left=document.createElement("div");left.innerHTML='<strong>'+esc(a.operateur)+' · '+esc(({transfert_unites:"Transfert d’unités",forfait_internet:"Forfait Internet",forfait_appels:"Forfait appels",forfait_mixte:"Forfait mixte"}[a.typeService]||a.typeService))+'</strong><p class="cab-muted">Demande du '+esc(dateCabine(a.createdAt))+'</p>';
  const badge=document.createElement("span");badge.className="cab-pill";badge.textContent=libelleStatut(a.statut);titre.append(left,badge);article.append(titre);
  const info=document.createElement("div");info.innerHTML='<p><strong>Numéro bénéficiaire :</strong> '+esc(a.numeroBeneficiaire)+'</p><p><strong>Montant demandé :</strong> '+money(a.montantPrestation)+'</p><p><strong>Commune :</strong> '+esc(a.commune)+'</p><p><strong>Précisions :</strong> '+esc(a.details)+'</p>'+(mine?'<p class="cab-muted">Cette demande vous est attribuée.</p>':"");article.append(info);
  const actions=document.createElement("div");actions.className="cab-actions";
  const addAction=(label,fn,primary=false)=>{const b=document.createElement("button");b.type="button";b.textContent=label;if(primary)b.className="primary";b.onclick=fn;actions.append(b);};
  if(!mine&&a.statut==="en_attente")addAction("Accepter cette demande",()=>window.cabAccepter(d.id),true);
  if(mine&&a.statut==="acceptee")addAction("Démarrer la prestation",()=>window.cabChangerStatut(d.id,"en_cours"),true);
  if(mine&&a.statut==="en_cours")addAction("Confirmer la fin de prestation",()=>{if(confirm("Confirmez-vous que la prestation a bien été réalisée ?"))window.cabChangerStatut(d.id,"terminee");},true);
  if(actions.children.length)article.append(actions);z.append(article);
 });
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
  cabDocsCache=Array.from(map.values()).sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));afficherDemandesCabine();
 }catch(e){console.error(e);z.innerHTML="<p>Impossible de charger les demandes. Vérifiez votre connexion et réessayez.</p><button id='cabReload' type='button'>Réessayer</button>";$("cabReload").onclick=chargerDemandesCabine;}
}
window.cabAccepter=async id=>{
 if(!partenaire||!profilCabine||profilCabine.statut!=="approuve")return;
 try{
  const ref=partnerDb.collection("demandes_cabines").doc(id);
  await partnerDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().statut!=="en_attente"||snap.data().cabineUid)throw new Error("Cette demande vient d’être prise en charge par un autre cabiniste.");tx.update(ref,{cabineUid:partenaire.uid,cabineNom:profilCabine.nom,statut:"acceptee",updatedAt:stamp()});});
  alert("Demande attribuée à votre cabine.");cabVue="miennes";await chargerDemandesCabine();
 }catch(e){alert(e.message||"Impossible d’accepter cette demande.");await chargerDemandesCabine();}
};
window.cabChangerStatut=async(id,statut)=>{
 if(!partenaire||!["en_cours","terminee"].includes(statut))return;
 try{await partnerDb.collection("demandes_cabines").doc(id).update({statut,updatedAt:stamp()});cabVue="miennes";await chargerDemandesCabine();}
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