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
<div id="cabClient">
<div class="cab-main-menu" id="cabClientChoices">
<button id="cabStartTransfer" class="cab-menu-card" type="button"><span class="cab-menu-icon cab-transfer-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 22h34l-8-8m8 8-8 8" fill="none" stroke="#1478e8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M52 42H18l8 8m-8-8 8-8" fill="none" stroke="#ef4444" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>Transférer</strong><small>Envoyer des unités</small></button>
<button id="cabStartSubscribe" class="cab-menu-card" type="button"><span class="cab-menu-icon cab-phone-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="7" width="28" height="50" rx="6" fill="none" stroke="#12a9d6" stroke-width="5"/><path d="M27 14h10M29 49h6" stroke="#12a9d6" stroke-width="3" stroke-linecap="round"/></svg></span><strong>Souscrire</strong><small>Forfait appel ou internet</small></button>
<button id="cabStartHistory" class="cab-menu-card" type="button"><span class="cab-menu-icon cab-wallet-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="17" width="46" height="35" rx="7" fill="#ec4899"/><path d="M9 23V16a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v2" fill="none" stroke="#be185d" stroke-width="4"/><path d="M39 29h16v13H39a6 6 0 0 1 0-13Z" fill="#f9a8d4"/><circle cx="43" cy="35.5" r="2.5" fill="#9d174d"/><circle cx="19" cy="49" r="7" fill="#fbbf24"/></svg></span><strong>Historique</strong><small>Mes transactions</small></button>
</div>
<div id="cabSubscribeChoices" class="cab-subscribe-choices" hidden><h3>Que souhaitez-vous souscrire ?</h3><div class="cab-subscribe-grid"><button id="cabStartCalls" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">☎</span><strong>Forfait appel</strong></button><button id="cabStartInternet" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">▥</span><strong>Forfait internet</strong></button><button id="cabStartMixed" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">▤</span><strong>Forfait mixte</strong><small>Appels + SMS + Internet</small></button></div><button id="cabBackToMenu" class="cab-back" type="button">← Retour aux services</button></div>
<div id="cabRequestForm" class="cab-item" hidden><h3 id="cabFormTitle">Nouvelle opération</h3>
<div id="cabServiceWrap"><label>Type de service</label><select id="cabService"><option value="transfert_unites">Transfert d’unité</option><option value="forfait_appels">Forfait appel</option><option value="forfait_internet">Forfait internet</option><option value="forfait_mixte">Forfait mixte</option></select></div>
<label>Opérateur</label><div class="cab-choice-row" id="cabOperatorChoices">
<button type="button" class="cab-logo-choice selected" data-operator="Orange" aria-label="Orange"><svg viewBox="0 0 120 58" role="img" aria-label="Logo Orange"><rect x="3" y="3" width="42" height="52" rx="9" fill="#ff7900"/><path d="M13 18h22M13 27h22M13 36h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/><text x="52" y="36" font-size="19" font-weight="700" fill="#f07800">orange</text></svg></button>
<button type="button" class="cab-logo-choice" data-operator="MTN" aria-label="MTN"><svg viewBox="0 0 120 58" role="img" aria-label="Logo MTN"><path d="M5 7h110v44H5z" rx="8" fill="#ffcc00"/><text x="60" y="36" text-anchor="middle" font-size="25" font-weight="900" fill="#171717">MTN</text></svg></button>
<button type="button" class="cab-logo-choice" data-operator="Moov Africa" aria-label="Moov Africa"><svg viewBox="0 0 130 58" role="img" aria-label="Logo Moov Africa"><circle cx="25" cy="29" r="21" fill="#0876c9"/><path d="M15 30l8 8 14-18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="51" y="25" font-size="16" font-weight="800" fill="#0876c9">moov</text><text x="51" y="41" font-size="9" font-weight="700" fill="#0876c9">AFRICA</text></svg></button></div>
<select id="cabOperateur" class="cab-hidden-select" aria-hidden="true" tabindex="-1"><option>Orange</option><option>MTN</option><option>Moov Africa</option></select>
<div id="cabNumeroWrap"><label>Numéro du bénéficiaire</label><input id="cabNumero" type="tel" maxlength="20" placeholder="Numéro du bénéficiaire"></div><div id="cabCatalogue"></div>
<div id="cabAmountWrap"><label>Montant du transfert souhaité auprès de la cabine (FCFA)</label><input id="cabMontant" type="number" min="200" max="500000" step="1" inputmode="numeric" placeholder="Ex. 1 000"></div>
<div id="cabCommuneWrap" hidden><label>Commune / ville</label><input id="cabCommuneClient" maxlength="60" placeholder="Ex. Yopougon"></div>
<div id="cabDetailsWrap" hidden><label>Précisions</label><textarea id="cabDetails" maxlength="180" placeholder="Précisions"></textarea></div>
<div id="cabPaymentWrap"><label>Moyen de paiement Jèko</label><div class="cab-choice-row cab-payment-choices" id="cabPaymentChoices">
<button type="button" class="cab-logo-choice selected" data-payment="wave" aria-label="Wave"><svg viewBox="0 0 110 58" role="img" aria-label="Logo Wave"><circle cx="27" cy="29" r="23" fill="#0879e8"/><path d="M12 30q7-15 14 0t14 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><text x="57" y="36" font-size="20" font-weight="800" fill="#0879e8">wave</text></svg></button>
<button type="button" class="cab-logo-choice" data-payment="orange" aria-label="Orange Money"><svg viewBox="0 0 130 58" role="img" aria-label="Logo Orange Money"><rect x="4" y="6" width="45" height="45" rx="8" fill="#ff7900"/><path d="M14 20h25M14 29h25M14 38h18" stroke="#fff" stroke-width="3" stroke-linecap="round"/><text x="55" y="25" font-size="13" font-weight="800" fill="#f07800">orange</text><text x="55" y="40" font-size="11" font-weight="700" fill="#f07800">money</text></svg></button>
<button type="button" class="cab-logo-choice" data-payment="mtn" aria-label="MTN MoMo"><svg viewBox="0 0 110 58" role="img" aria-label="Logo MTN MoMo"><path d="M4 8h102v42H4z" fill="#ffcc00"/><text x="55" y="27" text-anchor="middle" font-size="18" font-weight="900" fill="#171717">MTN</text><text x="55" y="42" text-anchor="middle" font-size="12" font-weight="800" fill="#171717">MoMo</text></svg></button>
<button type="button" class="cab-logo-choice" data-payment="moov" aria-label="Moov Money"><svg viewBox="0 0 120 58" role="img" aria-label="Logo Moov Money"><circle cx="22" cy="29" r="18" fill="#0876c9"/><path d="M13 29l7 7 12-15" fill="none" stroke="#fff" stroke-width="4"/><text x="47" y="25" font-size="15" font-weight="800" fill="#0876c9">Moov</text><text x="47" y="40" font-size="12" font-weight="700" fill="#0876c9">Money</text></svg></button>
<button type="button" class="cab-logo-choice" data-payment="djamo" aria-label="Djamo"><svg viewBox="0 0 110 58" role="img" aria-label="Logo Djamo"><rect x="4" y="6" width="42" height="45" rx="12" fill="#171717"/><path d="M16 20h18M16 29h18M16 38h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/><text x="53" y="36" font-size="19" font-weight="900" fill="#171717">djamo</text></svg></button></div>
<select id="cabPaymentMethod" class="cab-hidden-select" aria-hidden="true" tabindex="-1"><option value="wave">Wave</option><option value="orange">Orange Money</option><option value="mtn">MTN Money</option><option value="moov">Moov Money</option><option value="djamo">Djamo</option></select></div>
<p id="cabFeePreview" class="cab-muted">Frais de service : —</p><div class="cab-actions"><button id="cabEnvoyer" class="primary" type="button">Valider et payer avec Jèko</button><button id="cabCancelForm" type="button">Annuler</button></div><p id="cabMessage" aria-live="polite"></p></div>
</div>
<div id="cabHistoryView" hidden><div class="cab-history-heading"><h3>Historique de mes transactions</h3><button id="cabBackFromHistory" class="cab-back" type="button">← Retour</button></div><div id="cabHistorique">Connectez-vous pour consulter vos demandes.</div><button id="cabRefreshHistory" type="button">Actualiser l’historique</button></div>
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
 {op:"Moov Africa",type:"forfait_mixte",name:"Izy Mix+",price:1500,data:"1,5 Go",minutes:"200 min + 500 SMS",validity:"15 jours",code:"*303*1#",source:"https://www.moov-africa.ci/espace-particulier/forfaits-izy-mix/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 180",price:180,data:"15 Mo",minutes:"10 min + 15 SMS",validity:"1 jour",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 240",price:240,data:"50 Mo",minutes:"25 min + 25 SMS",validity:"2 jours (22h–5h)",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 350",price:350,data:"50 Mo",minutes:"30 min + 30 SMS",validity:"24 heures",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 575",price:575,data:"200 Mo",minutes:"40 min + 50 SMS",validity:"24 heures",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 680",price:680,data:"300 Mo",minutes:"40 min + 50 SMS",validity:"2 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 1 100",price:1100,data:"400 Mo",minutes:"100 min + 100 SMS",validity:"24 heures",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Jour 1 650",price:1650,data:"1 300 Mo",minutes:"40 min + 100 SMS",validity:"24 heures",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Semaine 2 400",price:2400,data:"750 Mo",minutes:"200 min + 50 SMS",validity:"7 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Semaine 3 350",price:3350,data:"2 560 Mo",minutes:"200 min + 200 SMS",validity:"7 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Semaine 3 850",price:3850,data:"3 584 Mo",minutes:"300 min + 350 SMS",validity:"7 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Semaine 5 000",price:5000,data:"4 096 Mo",minutes:"350 min + 500 SMS",validity:"7 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Mois 8 750",price:8750,data:"3 584 Mo",minutes:"300 min + 150 SMS + illimité numéros préférés",validity:"30 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Mois 11 000",price:11000,data:"5 120 Mo",minutes:"350 min + 350 SMS + illimité numéros préférés",validity:"30 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"Orange",type:"forfait_mixte",name:"LOTOPASS MIX Mois 22 000",price:22000,data:"20 480 Mo",minutes:"1 000 min + 1 000 SMS + illimité numéros préférés",validity:"30 jours",code:"#111#",source:"https://www.orange.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 200",price:200,data:"25 Mo",minutes:"17 min + 25 SMS",validity:"1 jour",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 300",price:300,data:"100 Mo",minutes:"30 min + 100 SMS",validity:"2 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 500",price:500,data:"300 Mo",minutes:"55 min + 100 SMS + 5 numéros complices illimités",validity:"5 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 700",price:700,data:"700 Mo",minutes:"70 min + 100 SMS + 5 numéros complices illimités",validity:"5 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 1 000",price:1000,data:"1 Go",minutes:"100 min + 100 SMS + 5 numéros complices illimités",validity:"10 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 1 500",price:1500,data:"1,5 Go",minutes:"200 min + 150 SMS",validity:"15 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 2 500",price:2500,data:"2,5 Go",minutes:"250 min + 250 SMS",validity:"30 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 5 000",price:5000,data:"5 Go",minutes:"500 min + 500 SMS",validity:"30 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 10 000",price:10000,data:"10 Go",minutes:"830 min + 500 SMS",validity:"30 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",name:"Free Plus 20 000",price:20000,data:"20 Go",minutes:"1 665 min + 1 000 SMS",validity:"30 jours",code:"*105*1#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 150 Mo",price:150,data:"150 Mo",minutes:"—",validity:"1 jour",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 220 Mo",price:200,data:"220 Mo",minutes:"—",validity:"2 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 340 Mo",price:300,data:"340 Mo",minutes:"—",validity:"3 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 450 Mo",price:400,data:"450 Mo",minutes:"—",validity:"3 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 750 Mo",price:500,data:"750 Mo",minutes:"—",validity:"3 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 1,2 Go",price:1000,data:"1,2 Go",minutes:"—",validity:"7 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 2 Go",price:1800,data:"2 Go",minutes:"—",validity:"30 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 3,5 Go",price:2500,data:"3,5 Go",minutes:"—",validity:"30 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 7,2 Go",price:5000,data:"7,2 Go",minutes:"—",validity:"30 jours",code:"*105#",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",name:"Internet 15 Go",price:10000,data:"15 Go",minutes:"—",validity:"30 jours",code:"*105#",source:"https://www.mtn.ci/"}
];
const cabTypeLabels={forfait_internet:"Internet",forfait_appels:"Appels",forfait_mixte:"Mixte"};
let cabSelectedOffer=null;
function rendreCatalogueCabine(){
 cabSelectedOffer=null;
 const root=$("cabCatalogue");if(!root)return;
 const op=$("cabOperateur").value,kind=$("cabService").value;
 const matching=cabForfaits.filter(x=>x.op===op&&x.type===kind);
 const card=x=>'<article class="cab-item cab-offer"><div class="cab-request-head"><strong>'+esc(x.name)+'</strong><span class="cab-pill">'+esc(x.validity)+'</span></div><p class="cab-price">'+x.price.toLocaleString("fr-FR")+' FCFA</p><p><strong>Internet :</strong> '+esc(x.data)+'</p><p><strong>Appels / SMS :</strong> '+esc(x.minutes)+'</p><button type="button" class="primary" data-cab-offer="'+cabForfaits.indexOf(x)+'">Sélectionner ce forfait</button><a href="'+esc(x.source)+'" target="_blank" rel="noopener noreferrer">Voir les informations opérateur</a></article>';
 let html='<div class="cab-catalog-head"><h3>Annuaire des offres — '+esc(op)+'</h3></div>';
 if(matching.length)html+='<div class="cab-offers">'+matching.map(card).join("")+'</div>';
 else html+='<div class="cab-item">Aucune offre répertoriée pour cet opérateur et cette catégorie. Choisissez une autre catégorie ou un autre opérateur.</div>';
 root.innerHTML=html+'<p class="cab-muted">Le prix affiché est le prix de la prestation, hors frais de service MON QUOTIDIEN CI. Le paiement est confirmé par Jèko avant transmission à une cabine.</p>';
 root.querySelectorAll("[data-cab-offer]").forEach(b=>b.onclick=()=>selectionnerForfaitCabine(cabForfaits[Number(b.dataset.cabOffer)]));
 const generic=()=>{ $("cabMontant").value="";$("cabDetails").value="Forfait "+(cabTypeLabels[kind]||"")+" à préciser avec le cabiniste."; $("cabCommuneClient").focus(); document.getElementById("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});};
 $("cabMtnChoose")?.addEventListener("click",generic);$("cabOrangeChoose")?.addEventListener("click",generic);
}
function selectionnerForfaitCabine(x){
 cabSelectedOffer=x;
 $("cabOperateur").value=x.op;$("cabService").value=x.type;
 $("cabFeePreview").hidden=true;$("cabAmountWrap").hidden=true;
 const phone=$("cabNumero").value.trim();
 if(phone.length<8||phone.length>20){$("cabMessage").textContent="Saisissez d’abord le numéro du bénéficiaire, puis appuyez sur Souscrire."; $("cabNumero").focus();$("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});return;}
 $("cabMessage").textContent="Offre sélectionnée. Préparation du paiement…";$("cabEnvoyer").click();
}
$("cabOperateur").addEventListener("change",()=>{cabSelectedOffer=null;rendreCatalogueCabine();});
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
#cabinesTelephoniques .cab-catalog-head h3{margin-bottom:4px}
#cabinesTelephoniques .cab-main-menu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0}
#cabinesTelephoniques .cab-menu-card{min-width:0;min-height:148px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#fff;border:1px solid #e8e9ef;border-radius:20px;box-shadow:0 5px 16px #18243b12;color:#263238}
#cabinesTelephoniques .cab-menu-card strong{font-size:15px}
#cabinesTelephoniques .cab-menu-card small{font-size:11px;color:#74808b;text-align:center}
#cabinesTelephoniques .cab-menu-icon{width:66px;height:66px;border-radius:50%;display:grid;place-items:center}
#cabinesTelephoniques .cab-menu-icon svg{width:42px;height:42px}
#cabinesTelephoniques .cab-transfer-icon{background:#e1efff}
#cabinesTelephoniques .cab-phone-icon{background:#dff7fc}
#cabinesTelephoniques .cab-wallet-icon{background:#fce3f1}
#cabinesTelephoniques .cab-subscribe-choices{padding:12px 0}
#cabinesTelephoniques .cab-subscribe-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#cabinesTelephoniques .cab-sub-choice{min-height:112px;background:#f3f8fc;border:1px solid #dceaf5;color:#174b68;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
#cabinesTelephoniques .cab-sub-symbol{font-size:30px;color:#159ac3}
#cabinesTelephoniques .cab-sub-choice small{font-size:11px;text-align:center;color:#68786e}
@media(max-width:520px){#cabinesTelephoniques .cab-subscribe-grid{grid-template-columns:1fr}}
#cabinesTelephoniques .cab-back{background:#f1f5f2;color:#31513d;border:1px solid #dce8df;margin:12px 0}
#cabinesTelephoniques .cab-choice-row{display:flex;flex-direction:row;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:8px 2px 12px}
#cabinesTelephoniques .cab-logo-choice{flex:1 0 0;min-width:0;min-height:66px;display:flex;align-items:center;justify-content:center;background:#fff;border:2px solid #e2e8ef;border-radius:13px;padding:5px}
#cabinesTelephoniques .cab-logo-choice svg{display:block;width:100%;max-width:128px;height:48px}
#cabinesTelephoniques .cab-logo-choice.selected{border-color:#16834a;background:#f0faf3;box-shadow:0 0 0 2px #16834a18}
#cabinesTelephoniques .cab-hidden-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
#cabinesTelephoniques [hidden]{display:none!important}
#cabinesTelephoniques .cab-history-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
#cabinesTelephoniques .cab-choice-row{display:flex;flex-direction:row;align-items:stretch;gap:9px;overflow-x:auto;padding:7px 2px 12px}
#cabinesTelephoniques .cab-logo-choice{flex:1 0 0;min-width:72px;min-height:62px;display:flex;align-items:center;justify-content:center;background:#fff;border:2px solid #e4e9ef;border-radius:13px;padding:8px}
#cabinesTelephoniques .cab-logo-choice.selected{border-color:#16834a;background:#f0faf3;box-shadow:0 0 0 2px #16834a18}
#cabinesTelephoniques .cab-brand{font-weight:900;font-size:15px;letter-spacing:-.5px}
#cabinesTelephoniques .cab-brand.orange{color:#f07800}
#cabinesTelephoniques .cab-brand.mtn{background:#ffcc00;color:#171717;padding:7px 10px;border-radius:5px}
#cabinesTelephoniques .cab-brand.moov{color:#1875ce}
#cabinesTelephoniques .cab-brand.wave{color:#0879e8;font-size:19px}
#cabinesTelephoniques .cab-brand.djamo{color:#141414;font-size:18px}
#cabinesTelephoniques .cab-hidden-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
#cabinesTelephoniques #cabCommuneWrap,#cabinesTelephoniques #cabDetailsWrap{display:block}

@media(max-width:380px){#cabinesTelephoniques .cab-menu-card{min-height:132px;padding:10px 4px}#cabinesTelephoniques .cab-menu-card strong{font-size:13px}#cabinesTelephoniques .cab-menu-icon{width:56px;height:56px}}
`;document.head.appendChild(css);
function ouvrirCabinesTelephoniques(){if(typeof ouvrirSectionPleinEcran==="function")ouvrirSectionPleinEcran("cabinesTelephoniques","Cabine téléphonique");else section.style.display="block";chargerHistorique();}
window.ouvrirCabinesTelephoniques=ouvrirCabinesTelephoniques;
let cabRequestMode="transfer";
function ouvrirFormulaireCabine(mode,serviceType){cabRequestMode=mode;cabSelectedOffer=null;$("cabRequestForm").hidden=false;$("cabClientChoices").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabHistoryView").hidden=true;$("cabFormTitle").textContent=mode==="transfer"?"Transfert d’unité":serviceType==="forfait_internet"?"Souscrire un forfait internet":serviceType==="forfait_mixte"?"Souscrire un forfait mixte":"Souscrire un forfait appel";$("cabService").value=mode==="transfer"?"transfert_unites":serviceType;$("cabService").disabled=mode==="transfer";$("cabServiceWrap").hidden=mode!=="transfer";$("cabCatalogue").hidden=mode==="transfer";$("cabAmountWrap").hidden=mode!=="transfer";$("cabFeePreview").hidden=mode!=="transfer";$("cabCommuneWrap").hidden=true;$("cabDetailsWrap").hidden=true;$("cabNumeroWrap").hidden=false;rendreCatalogueCabine();$("cabNumero").focus();}
function retourMenuCabine(){ $("cabRequestForm").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabHistoryView").hidden=true;$("cabClientChoices").hidden=false;$("cabMessage").textContent="";$("cabEnvoyer").disabled=false;}
$("cabStartTransfer").onclick=()=>ouvrirFormulaireCabine("transfer","transfert_unites");
$("cabStartSubscribe").onclick=()=>{$("cabClientChoices").hidden=true;$("cabSubscribeChoices").hidden=false;};
$("cabStartCalls").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_appels");
$("cabStartInternet").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_internet");
$("cabStartMixed").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_mixte");
$("cabBackToMenu").onclick=retourMenuCabine;
$("cabStartHistory").onclick=()=>{$("cabClientChoices").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabRequestForm").hidden=true;$("cabHistoryView").hidden=false;chargerHistorique();};
$("cabBackFromHistory").onclick=retourMenuCabine;
$("cabCancelForm").onclick=retourMenuCabine;
function cabSelectLogo(container,attribute,selectId,value){const select=$(selectId);select.value=value;$(container).querySelectorAll("[data-"+attribute+"]").forEach(b=>{const active=b.getAttribute("data-"+attribute)===value;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",active?"true":"false");});}
$("cabOperatorChoices").querySelectorAll("[data-operator]").forEach(b=>b.onclick=()=>cabSelectLogo("cabOperatorChoices","operator","cabOperateur",b.dataset.operator));
$("cabPaymentChoices").querySelectorAll("[data-payment]").forEach(b=>b.onclick=()=>cabSelectLogo("cabPaymentChoices","payment","cabPaymentMethod",b.dataset.payment));
function fraisCabine(montant){return montant<=999?18:(montant<=3000?40:75);}
function actualiserFraisCabine(){const amount=Number($("cabMontant").value),fee=Number.isSafeInteger(amount)&&amount>=200?fraisCabine(amount):null;$("cabFeePreview").textContent=fee===null?"Frais : montant minimum 200 FCFA.":"Frais : "+money(fee)+" · Total à payer : "+money(amount+fee);}
$("cabMontant").addEventListener("input",actualiserFraisCabine);
$("cabService").addEventListener("change",()=>{rendreCatalogueCabine();$("cabCatalogue").hidden=$("cabService").value==="transfert_unites";});
$("cabEnvoyer").onclick=async()=>{
 const u=auth.currentUser,amount=cabRequestMode==="transfer"?Number($("cabMontant").value):Number(cabSelectedOffer?.price),phone=$("cabNumero").value.trim(),commune="",details=cabRequestMode==="transfer"?"":(cabSelectedOffer?cabSelectedOffer.name+" — "+cabSelectedOffer.data+" — "+cabSelectedOffer.minutes+" — validité "+cabSelectedOffer.validity+" (code "+cabSelectedOffer.code+").":""),button=$("cabEnvoyer"),msg=$("cabMessage");
 const typeService=cabRequestMode==="transfer"?"transfert_unites":$("cabService").value;
 if(!u){msg.textContent="Connectez-vous à votre compte client pour payer.";return;}
 if(!Number.isSafeInteger(amount)||amount<200||amount>500000||phone.length<8||phone.length>20||(cabRequestMode!=="transfer"&&details.length<2)){msg.textContent="Vérifiez le numéro et le montant (200 FCFA minimum).";return;}
 button.disabled=true;msg.textContent="Préparation sécurisée du paiement Jèko…";
 try{const token=await u.getIdToken();const response=await fetch("https://mon-quotidien-jeko.tabikevin57.workers.dev/api/jeko/checkout",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({serviceId:"cabine",typeService,operateur:$("cabOperateur").value,numeroBeneficiaire:phone,amountPrestation:amount,...(cabRequestMode!=="transfer"?{commune,details}:{}),paymentMethod:$("cabPaymentMethod").value})});
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.checkoutUrl)throw new Error(data.diagnostic||data.error||"Jèko n’a pas pu préparer le paiement.");
 msg.textContent="Redirection vers Jèko. La demande sera transmise aux cabines après confirmation du paiement.";window.location.assign(data.checkoutUrl);
 }catch(e){console.error("Cabine Jèko:",e);msg.textContent="Paiement impossible : "+(e.message||"erreur");button.disabled=false;}
};$("cabRefreshHistory").onclick=chargerHistorique;
$("cabTabClient").onclick=()=>{$("cabClient").hidden=false;$("cabPartner").hidden=true;retourMenuCabine();};

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
 z.innerHTML='<div class="cab-item"><h4>Connexion cabiniste</h4><label>E-mail</label><input id="cabEmail" type="email" autocomplete="username"><label>Mot de passe</label><input id="cabPass" type="password" autocomplete="current-password"><button id="cabLogin" type="button">Connexion</button><button id="cabShowRegister" type="button" style="width:100%;margin-top:10px;">Je m’inscris</button><div id="cabRegisterForm" hidden style="margin-top:14px;"><hr><h4>Inscription de ma cabine</h4><label>Nom commercial de la cabine</label><input id="cabNomNew" maxlength="100"><label>Nom du responsable</label><input id="cabResp" maxlength="100"><label>E-mail</label><input id="cabEmailNew" type="email"><label>Mot de passe (6 caractères minimum)</label><input id="cabPassNew" type="password" minlength="6"><label>Téléphone</label><input id="cabTel" type="tel" maxlength="24"><label>Commune</label><input id="cabCommune" maxlength="60"><label>Adresse / repère</label><input id="cabAdresse" maxlength="200"><label>Horaires</label><input id="cabHoraires" maxlength="100" placeholder="Ex. 8h–20h"><label>Opérateurs servis</label><select id="cabOps" multiple><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><small>Maintenez la sélection pour choisir plusieurs opérateurs.</small><button id="cabInscrire" class="primary" type="button">Envoyer ma candidature</button></div><p id="cabAuthMsg" aria-live="polite"></p></div>';
 $("cabShowRegister").onclick=()=>{const form=$("cabRegisterForm"),open=form.hidden;form.hidden=!open;$("cabShowRegister").textContent=open?"Fermer l’inscription":"Je m’inscris";};
 $("cabLogin").onclick=async()=>{const b=$("cabLogin"),m=$("cabAuthMsg");b.disabled=true;try{partenaire=(await partnerAuth.signInWithEmailAndPassword($("cabEmail").value.trim(),$("cabPass").value)).user;await espaceCabine();}catch(e){m.textContent="Connexion impossible : "+(e.message||"vérifiez vos identifiants.");}finally{b.disabled=false;}};
 $("cabInscrire").onclick=async()=>{const b=$("cabInscrire"),m=$("cabAuthMsg");b.disabled=true;try{
  const nom=$("cabNomNew").value.trim(),responsable=$("cabResp").value.trim(),email=$("cabEmailNew").value.trim(),pass=$("cabPassNew").value,tel=$("cabTel").value.trim(),commune=$("cabCommune").value.trim(),adresse=$("cabAdresse").value.trim(),ops=Array.from($("cabOps").selectedOptions).map(o=>o.value);
  if(nom.length<2||responsable.length<2||!email||pass.length<6||tel.length<8||commune.length<2||adresse.length<5||!ops.length)throw Error("Complétez tous les champs obligatoires.");
  partenaire=(await partnerAuth.createUserWithEmailAndPassword(email,pass)).user;
  await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).set({uid:partenaire.uid,nom,responsable,email,telephone:tel,commune,adresse,horaires:$("cabHoraires").value.trim(),operateurs:ops,statut:"en_attente",createdAt:stamp(),updatedAt:stamp()});
  $("cabRegisterForm").hidden=true;
  $("cabShowRegister").textContent="Je m’inscris";
  m.textContent="Candidature envoyée. Votre espace sera activé après validation par l’administration.";
  await espaceCabine();
 }catch(e){m.textContent="Candidature impossible : "+(e.message||"réessayez.");}finally{b.disabled=false;}};
}
async function espaceCabine(){
 $("cabAuth").hidden=true;$("cabPanel").hidden=false;
 try{
  const p=await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).get();
  if(!p.exists){$("cabPanel").textContent="Aucune candidature cabiniste trouvée pour ce compte.";return;}
  profilCabine=p.data();
  $("cabPanel").innerHTML='<div class="cab-item"><div class="cab-request-head"><div><strong style="font-size:18px">'+esc(profilCabine.nom)+'</strong><p class="cab-muted">'+esc(profilCabine.commune)+' · '+esc(profilCabine.telephone)+'</p></div><span class="cab-pill">'+esc(profilCabine.statut==="approuve"?"Partenaire approuvé":profilCabine.statut==="refuse"?"Candidature refusée":"En attente de validation")+'</span></div><p class="cab-muted">Opérateurs : '+esc((profilCabine.operateurs||[]).join(" · "))+'<br>Horaires : '+esc(profilCabine.horaires||"Non renseignés")+'</p><button id="cabLogout" type="button">Déconnexion</button></div><div id="cabOrders"></div><div id="cabPartnerAccounting"></div>';
  $("cabLogout").onclick=async()=>{await arreterPresenceCabine();await partnerAuth.signOut();partenaire=null;profilCabine=null;$("cabPanel").hidden=true;$("cabAuth").hidden=false;};
  if(profilCabine.statut!=="approuve"){$("cabOrders").innerHTML="<p class='notice'>Votre candidature est en cours de validation. Dès son approbation, vous pourrez consulter et accepter les demandes de toute la Côte d’Ivoire.</p>";return;}
  await demarrerPresenceCabine();
  await chargerDemandesCabine();
  await chargerComptabilitePartenaire();
  if(cabRequestRefreshTimer)clearInterval(cabRequestRefreshTimer);
  cabRequestRefreshTimer=setInterval(()=>{if(document.visibilityState==="visible"){chargerDemandesCabine();chargerComptabilitePartenaire();}},25000);
 }catch(e){$("cabPanel").textContent="Espace cabiniste indisponible : "+(e.message||"erreur");}
}
let cabDocsCache=[],cabVue="ouvertes",cabPresenceTimer=null,cabRequestRefreshTimer=null;
async function actualiserPresenceCabine(){if(!partenaire||!profilCabine||profilCabine.statut!=="approuve")return false;try{const online=document.visibilityState==="visible";await partnerDb.collection("cabines_telephoniques").doc(partenaire.uid).update({presenceOnline:online,lastSeenAt:stamp(),updatedAt:stamp()});profilCabine.presenceOnline=online;profilCabine.lastSeenAt=new Date();return online;}catch(e){console.warn("Présence cabine non actualisée",e);profilCabine.presenceOnline=false;return false;}}
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
 z.innerHTML='<div class="cab-stats"><div class="cab-stat"><strong>'+ouvertes+'</strong><span>Demandes disponibles</span></div><div class="cab-stat"><strong>'+encours+'</strong><span>À traiter</span></div><div class="cab-stat"><strong>'+terminees+'</strong><span>Terminées</span></div></div><div class="cab-tabs"><button type="button" data-cab-vue="ouvertes" class="'+(cabVue==="ouvertes"?"active":"")+'">Demandes disponibles</button><button type="button" data-cab-vue="miennes" class="'+(cabVue==="miennes"?"active":"")+'">Mes prestations ('+miennes.length+')</button></div><div class="cab-filter"><select id="cabFiltreOperateur"><option value="">Tous les opérateurs</option><option>Orange</option><option>MTN</option><option>Moov Africa</option></select><input id="cabFiltreCommune" type="search" placeholder="Filtrer par commune"></div><div class="cab-actions"><button id="cabReload" type="button">↻ Actualiser les demandes</button></div><p class="cab-muted">Les demandes disponibles sont visibles uniquement lorsque votre cabine est en ligne. La première acceptation attribue la demande.</p>';
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
  const presenceOk=document.visibilityState==="visible"&&await actualiserPresenceCabine();
  const assignedPromise=partnerDb.collection("demandes_cabines").where("cabineUid","==",partenaire.uid).limit(100).get();
  const openPromise=presenceOk?partnerDb.collection("demandes_cabines").where("statut","==","en_attente").where("cabineUid","==",null).limit(100).get():Promise.resolve({docs:[]});
  const [open,assigned]=await Promise.all([openPromise,assignedPromise]);
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

async function chargerComptabilitePartenaire(){
 const root=$("cabPartnerAccounting");if(!root||!partenaire||!profilCabine||profilCabine.statut!=="approuve")return;
 root.innerHTML="<h3>Mes gains et reversements</h3><p class='cab-muted'>Calcul établi uniquement à partir des prestations terminées et des reversements enregistrés par MON QUOTIDIEN CI.</p><p>Chargement…</p>";
 try{
  const q=await partnerDb.collection("demandes_cabines").where("cabineUid","==",partenaire.uid).where("statut","==","terminee").limit(300).get();
  const rows=await Promise.all(q.docs.map(async doc=>{
   const snap=await doc.ref.collection("reversements").get(),payouts=snap.docs.map(x=>x.data());
   const earned=Number(doc.data().montantAReverser??doc.data().montantPrestation??0);
   const paid=payouts.reduce((sum,p)=>sum+Number(p.montantXof||0),0);
   return {data:doc.data(),earned,paid,balance:Math.max(0,earned-paid),payouts};
  }));
  const earned=rows.reduce((sum,r)=>sum+r.earned,0),paid=rows.reduce((sum,r)=>sum+r.paid,0),balance=rows.reduce((sum,r)=>sum+r.balance,0);
  root.innerHTML="<h3>Mes gains et reversements</h3><div class='cab-stats'><div class='cab-stat'><strong>"+money(earned)+"</strong><span>Prestations terminées</span></div><div class='cab-stat'><strong>"+money(paid)+"</strong><span>Déjà reversé</span></div><div class='cab-stat'><strong>"+money(balance)+"</strong><span>Reste à recevoir</span></div></div>"+(rows.length?rows.map(r=>{
   const d=r.data,history=r.payouts.length?r.payouts.map(p=>"<li>"+money(p.montantXof)+" · "+esc(p.dateReversement||"Date inconnue")+" · Réf. "+esc(p.reference)+" · "+esc(p.moyenPaiement||"—")+"</li>").join(""):"<li>Aucun reversement enregistré</li>";
   return "<article class='cab-item'><strong>"+esc(d.operateur)+" · "+esc(d.typeService)+"</strong><p>Prestation : "+money(r.earned)+" · Reçu : "+money(r.paid)+" · Solde : <strong>"+money(r.balance)+"</strong></p><details><summary>Historique des reversements</summary><ul>"+history+"</ul></details></article>";
  }).join(""):"<p class='cab-muted'>Aucune prestation terminée pour le moment. Une prestation en attente, acceptée ou en cours n’est pas encore comptabilisée.</p>");
 }catch(error){console.error(error);root.innerHTML="<h3>Mes gains et reversements</h3><p>Impossible de charger la comptabilité : "+esc(error.message||"erreur")+"</p>";}
}
function panneauAdmin(){
 if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert("Accès administrateur requis.");return;}
 let z=document.getElementById("cabAdminPanel");
 if(!z){z=document.createElement("section");z.id="cabAdminPanel";z.className="card";document.getElementById("espaceAdmin").appendChild(z);}
 z.style.display="block";z.innerHTML="<h3>Cabines téléphoniques — administration</h3><h4>Candidatures partenaires</h4><div id='cabAdminCabines'>Chargement…</div><h4>Comptabilité et reversements manuels</h4><p class='cab-muted'>Seules les prestations terminées sont comptabilisées. Les reversements sont saisis manuellement après paiement effectif par MON QUOTIDIEN CI.</p><div id='cabAdminComptabilite'>Chargement…</div><h4>Demandes des clients</h4><div id='cabAdminDemandes'>Chargement…</div>";
 db.collection("cabines_telephoniques").limit(200).get().then(q=>{$("cabAdminCabines").innerHTML=q.empty?"Aucune candidature.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.nom)+"</strong> · "+esc(x.commune)+" · "+esc(x.telephone)+"<p>"+esc(x.adresse)+" · "+esc((x.operateurs||[]).join(", "))+"</p><p>Statut : "+esc(x.statut)+"</p>"+(x.statut==="en_attente"?"<button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','approuve')\">Approuver</button><button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','refuse')\">Refuser</button>":"")+"</article>";}).join("");}).catch(e=>$("cabAdminCabines").textContent="Chargement impossible : "+e.message);
 db.collection("demandes_cabines").limit(200).get().then(q=>{$("cabAdminDemandes").innerHTML=q.empty?"Aucune demande.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.operateur)+" · "+esc(x.typeService)+"</strong><p>"+esc(x.commune)+" · "+esc(x.numeroBeneficiaire)+" · "+money(x.montantPrestation)+"</p><p>"+esc(libelleStatut(x.statut))+" · Cabiniste : "+esc(x.cabineNom||"Non attribuée")+"</p></article>";}).join("");}).catch(e=>$("cabAdminDemandes").textContent="Chargement impossible : "+e.message);
 chargerComptabiliteCabines();
}

async function chargerComptabiliteCabines(){
 const root=$("cabAdminComptabilite");if(!root)return;
 try{
  const [cabines,demandes]=await Promise.all([
   db.collection("cabines_telephoniques").limit(300).get(),
   db.collection("demandes_cabines").where("statut","==","terminee").limit(500).get()
  ]);
  const grouped=new Map();
  demandes.docs.forEach(doc=>{const d=doc.data();if(d.cabineUid){if(!grouped.has(d.cabineUid))grouped.set(d.cabineUid,[]);grouped.get(d.cabineUid).push(doc);}});
  const sections=await Promise.all(cabines.docs.map(async cabine=>{
   const profile=cabine.data(),docs=grouped.get(cabine.id)||[];
   const rows=await Promise.all(docs.map(async doc=>{
    const snap=await doc.ref.collection("reversements").get();
    const payouts=snap.docs.map(p=>p.data());
    const paid=payouts.reduce((sum,p)=>sum+Number(p.montantXof||0),0);
    const earned=Number(doc.data().montantAReverser??doc.data().montantPrestation??0);
    return {doc,data:doc.data(),payouts,paid,earned,balance:Math.max(0,earned-paid)};
   }));
   const earned=rows.reduce((sum,r)=>sum+r.earned,0),paid=rows.reduce((sum,r)=>sum+r.paid,0),balance=rows.reduce((sum,r)=>sum+r.balance,0);
   const detail=rows.map(r=>{
    const id=r.doc.id,d=r.data;
    const history=r.payouts.length?r.payouts.map(p=>"<li>"+money(p.montantXof)+" · "+esc(p.dateReversement||"Date inconnue")+" · Réf. "+esc(p.reference)+" · "+esc(p.moyenPaiement||"—")+"</li>").join(""):"<li>Aucun reversement enregistré</li>";
    const form=r.balance>0?"<div class='cab-filter'><input id='cabRevAmount_"+esc(id)+"' type='number' min='1' max='"+r.balance+"' step='1' placeholder='Montant à reverser (max "+r.balance+")'><input id='cabRevDate_"+esc(id)+"' type='date'><input id='cabRevRef_"+esc(id)+"' maxlength='80' placeholder='Référence du paiement'><select id='cabRevMethod_"+esc(id)+"'><option>Wave</option><option>Orange Money</option><option>MTN Money</option><option>Virement bancaire</option><option>Espèces</option><option>Autre</option></select></div><button type='button' class='primary' data-cab-reverse='"+esc(id)+"'>Enregistrer le reversement manuel</button>":"<p class='cab-muted'>Solde de cette prestation réglé.</p>";
    return "<article class='cab-item'><strong>"+esc(d.operateur)+" · "+esc(d.typeService)+" · "+esc(d.numeroBeneficiaire)+"</strong><p>Prestation : "+money(r.earned)+" · Déjà reversé : "+money(r.paid)+" · Solde : <strong>"+money(r.balance)+"</strong></p><p class='cab-muted'>Demande "+esc(id)+" · Terminée le "+esc(dateCabine(d.updatedAt||d.createdAt))+"</p><details><summary>Historique des reversements ("+r.payouts.length+")</summary><ul>"+history+"</ul></details>"+form+"</article>";
   }).join("");
   return "<section class='cab-item'><div class='cab-request-head'><strong>"+esc(profile.nom||"Cabine sans nom")+"</strong><span class='cab-pill'>"+esc(profile.commune||"")+"</span></div><p>"+esc(profile.telephone||"")+" · "+rows.length+" prestation(s) terminée(s)</p><div class='cab-stats'><div class='cab-stat'><strong>"+money(earned)+"</strong><span>Montant gagné</span></div><div class='cab-stat'><strong>"+money(paid)+"</strong><span>Déjà reversé</span></div><div class='cab-stat'><strong>"+money(balance)+"</strong><span>Solde à payer</span></div></div>"+(detail||"<p class='cab-muted'>Aucune prestation terminée et vérifiée.</p>")+"</section>";
  }));
  root.innerHTML=sections.join("")||"Aucune cabine partenaire.";
  root.querySelectorAll("[data-cab-reverse]").forEach(button=>button.onclick=()=>window.cabAdminEnregistrerReversement(button.dataset.cabReverse));
 }catch(error){console.error(error);root.textContent="Comptabilité indisponible : "+(error.message||"erreur de chargement");}
}
window.cabAdminEnregistrerReversement=async demandeId=>{
 if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert("Accès administrateur requis.");return;}
 const amount=Number($("cabRevAmount_"+demandeId)?.value),date=$("cabRevDate_"+demandeId)?.value,reference=$("cabRevRef_"+demandeId)?.value.trim(),method=$("cabRevMethod_"+demandeId)?.value;
 if(!Number.isSafeInteger(amount)||amount<=0||!date||! /^\d{4}-\d{2}-\d{2}$/.test(date)||!reference||reference.length>80||!method){alert("Renseignez un montant valide, la date, la référence et le moyen de paiement.");return;}
 const safeRef=reference.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
 if(!safeRef){alert("La référence doit contenir des caractères exploitables.");return;}
 const demandRef=db.collection("demandes_cabines").doc(demandeId),entryRef=demandRef.collection("reversements").doc(safeRef);
 try{
  await db.runTransaction(async tx=>{
   const snap=await tx.get(demandRef);
   if(!snap.exists)throw new Error("Prestation introuvable.");
   const d=snap.data();
   if(d.statut!=="terminee"||!d.cabineUid)throw new Error("Seule une prestation terminée et attribuée peut être réglée.");
   const existing=await tx.get(entryRef);
   if(existing.exists)throw new Error("Cette référence de reversement existe déjà pour cette prestation.");
   const reversements=await tx.get(demandRef.collection("reversements"));
   const paid=reversements.docs.reduce((sum,p)=>sum+Number(p.data().montantXof||0),0);
   const earned=Number(d.montantAReverser??d.montantPrestation??0),balance=earned-paid;
   if(!Number.isSafeInteger(earned)||earned<=0||!Number.isSafeInteger(paid)||amount>balance)throw new Error("Montant supérieur au solde restant ("+Math.max(0,balance)+" FCFA).");
   tx.set(entryRef,{demandeId,cabineUid:d.cabineUid,cabineNom:d.cabineNom||"",montantXof:amount,dateReversement:date,reference,moyenPaiement:method,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:auth.currentUser.uid});
  });
  alert("Reversement manuel enregistré. Aucun transfert d’argent n’a été déclenché par l’application.");
  await chargerComptabiliteCabines();
 }catch(error){alert("Reversement non enregistré : "+(error.message||"erreur"));}
};
window.cabAdminCabine=async(id,s)=>{if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID||!["approuve","refuse"].includes(s))return;try{await db.collection("cabines_telephoniques").doc(id).update({statut:s,updatedAt:stamp(),validePar:auth.currentUser.uid});panneauAdmin();}catch(e){alert(e.message);}};
window.cabOuvrirAdmin=panneauAdmin;
if(typeof RUBRIQUES_ADMIN!=="undefined"&&!RUBRIQUES_ADMIN.some(r=>r.id==="gestionCabinesAdmin"))RUBRIQUES_ADMIN.push({id:"gestionCabinesAdmin",groupe:"Professionnels",icone:"📞",titre:"Cabines téléphoniques",description:"Valider les cabinistes et suivre les demandes."});
if(typeof ouvrirRubriqueAdmin==="function"){const ancien=window.ouvrirRubriqueAdmin;window.ouvrirRubriqueAdmin=function(id){if(id==="gestionCabinesAdmin"){const menu=document.getElementById("adminMenuRubriques");if(menu)menu.style.display="none";RUBRIQUES_ADMIN.forEach(r=>{const e=document.getElementById(r.id);if(e)e.style.display="none";});panneauAdmin();return;}return ancien.apply(this,arguments);};}
if(typeof auth!=="undefined"&&auth.onAuthStateChanged)auth.onAuthStateChanged(chargerHistorique);
})();