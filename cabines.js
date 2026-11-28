/* Cabines téléphoniques partenaires — demandes nationales diffusées */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const CABINES_SCRIPT_URL=document.currentScript?.src||document.baseURI;
const CAB_PAYMENT_ASSETS={wave:"assets/payments/wave.svg",orange:"assets/payments/orange-money.svg",mtn:"assets/payments/mtn-momo.svg",moov:"assets/payments/moov-money.svg",djamo:"assets/payments/djamo.svg"};
const cabPaymentLogo=name=>new URL(CAB_PAYMENT_ASSETS[name],CABINES_SCRIPT_URL).href;
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
<div id="cabSubscribeChoices" class="cab-subscribe-choices" hidden><h3>Choisissez votre opérateur</h3><div class="cab-subscribe-grid"><button class="cab-sub-choice" type="button" data-cab-operator="Orange"><strong>Orange CI</strong></button><button class="cab-sub-choice" type="button" data-cab-operator="MTN"><strong>MTN CI</strong></button><button class="cab-sub-choice" type="button" data-cab-operator="Moov Africa"><strong>Moov Africa</strong></button></div><button id="cabBackToMenu" class="cab-back" type="button">← Retour aux services</button></div>
<div id="cabCategoryChoices" class="cab-subscribe-choices" hidden><h3 id="cabCategoryTitle">Choisissez une catégorie</h3><div class="cab-subscribe-grid"><button id="cabStartCalls" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">☎</span><strong>Forfait appel</strong></button><button id="cabStartInternet" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">▥</span><strong>Forfait internet</strong></button><button id="cabStartMixed" class="cab-sub-choice" type="button"><span class="cab-sub-symbol">▤</span><strong>Forfait mixte</strong><small>Selon les offres de l’opérateur</small></button></div><button id="cabBackToOperators" class="cab-back" type="button">← Retour aux opérateurs</button></div>
<div id="cabRequestForm" class="cab-item" hidden><h3 id="cabFormTitle">Nouvelle opération</h3><button id="cabBackToCategory" class="cab-back" type="button">← Retour aux catégories</button>
<div id="cabServiceWrap"><label>Type de service</label><select id="cabService"><option value="transfert_unites">Transfert d’unité</option><option value="forfait_appels">Forfait appel</option><option value="forfait_internet">Forfait internet</option><option value="forfait_mixte">Forfait mixte</option></select></div>
<label>Opérateur</label><div class="cab-choice-row" id="cabOperatorChoices">
<button type="button" class="cab-logo-choice selected" data-operator="Orange" aria-label="Orange"><img src="data:image/png;base64,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" alt="Logo Orange CI" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-operator="MTN" aria-label="MTN"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoCAMAAABNO5HnAAAASFBMVEXWtC2ojSlnURjuyS9JNQ6LcSEtHAjtzUPTs0OplEeLeUP+ywYCAAP+1Rf91ib90Qj9yRMoGAY1JQkWCALpxCsEAhKWeyj51DS6mz/LAAASUEEQVR42u2diZKjuBJFJTa7B2th//8/HUlQLiPEJoS3uhnxYt50e2x8fLnKTC2QHPGUIEAA0ACNAGiABmgEQAM0AqABGqARAA3QCIAGaIBGADRAIwAaoAEaAdAAjQBogAZoBEADNAKgARqgEQAN0AiABmiARgA0QCMAGqABGgHQAI0AaIAGaARAAzQCoAEaoBEADdAIgAZogEYANEAjABqgARoB0ACNAGiABmgEQAM0AqABGqARAA3QCIAGaIBGADRAIwAaoAEaAdAAjQBogAZoBEADNAKgARqgEQAN0AiABmiARgA0QCMAGqABGgHQAI0AaIAGaARAAzQCoAEaoBEADdAIgAZogEYANEAjABqgARoB0ACNAGiABmgEQAM0AqABGqARAA3QCIAGaIBGADRAIwAaoAEaAdAAjQBogAZoBEADNAKgARqgEQAN0AiABmiARgA0QCMAGqABGgHQAI0AaID+W/E/Ln3mO0q+M7QAAAAASUVORK5CYII=" alt="Logo MTN CI" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-operator="Moov Africa" aria-label="Moov Africa"><img src="data:image/png;base64,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" alt="Logo Moov Africa" loading="eager" decoding="async"></button></div>
<select id="cabOperateur" class="cab-hidden-select" aria-hidden="true" tabindex="-1"><option>Orange</option><option>MTN</option><option>Moov Africa</option></select>
<div id="cabNumeroWrap"><label>Numéro du bénéficiaire</label><input id="cabNumero" type="tel" maxlength="20" placeholder="Numéro du bénéficiaire"></div><div id="cabCatalogue"></div>
<div id="cabAmountWrap"><label>Montant du transfert souhaité auprès de la cabine (FCFA)</label><input id="cabMontant" type="number" min="200" max="500000" step="1" inputmode="numeric" placeholder="Ex. 1 000"></div>
<div id="cabCommuneWrap" hidden><label>Commune / ville</label><input id="cabCommuneClient" maxlength="60" placeholder="Ex. Yopougon"></div>
<div id="cabDetailsWrap" hidden><label>Précisions</label><textarea id="cabDetails" maxlength="180" placeholder="Précisions"></textarea></div>
<div id="cabSubscriptionRecap" class="cab-item" hidden><h3>Récapitulatif de la souscription</h3><p><strong>Opérateur :</strong> <span id="cabRecapOperator">—</span></p><p><strong>Numéro du bénéficiaire :</strong> <span id="cabRecapPhone">—</span></p><p><strong>Forfait :</strong> <span id="cabRecapOffer">—</span></p><p><strong>Prix du forfait :</strong> <span id="cabRecapPrice">—</span></p><p><strong>Frais de service (4 %) :</strong> <span id="cabRecapFee">—</span></p><p><strong>Total à payer :</strong> <strong id="cabRecapTotal">—</strong></p></div>
<div id="cabPaymentWrap" hidden><label>Choix du moyen de paiement Jèko</label><div class="cab-choice-row cab-payment-choices" id="cabPaymentChoices">
<button type="button" class="cab-logo-choice selected" data-payment="wave" aria-label="Wave"><img class="cab-payment-logo" src="${cabPaymentLogo('wave')}" alt="Wave" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-payment="orange" aria-label="Orange Money"><img class="cab-payment-logo" src="${cabPaymentLogo('orange')}" alt="Orange Money" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-payment="mtn" aria-label="MTN MoMo"><img class="cab-payment-logo" src="${cabPaymentLogo('mtn')}" alt="MTN MoMo" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-payment="moov" aria-label="Moov Money"><img class="cab-payment-logo" src="${cabPaymentLogo('moov')}" alt="Moov Money" loading="eager" decoding="async"></button>
<button type="button" class="cab-logo-choice" data-payment="djamo" aria-label="Djamo"><img class="cab-payment-logo" src="${cabPaymentLogo('djamo')}" alt="Djamo" loading="eager" decoding="async"></button></div>
<select id="cabPaymentMethod" class="cab-hidden-select" aria-hidden="true" tabindex="-1"><option value="wave">Wave</option><option value="orange">Orange Money</option><option value="mtn">MTN Money</option><option value="moov">Moov Money</option><option value="djamo">Djamo</option></select></div>
<p id="cabFeePreview" class="cab-muted">Frais de service : —</p><div class="cab-actions"><button id="cabEnvoyer" class="primary" type="button">Confirmer le paiement avec Jèko</button><button id="cabCancelForm" type="button">Annuler</button></div><p id="cabMessage" aria-live="polite"></p></div>
</div>
<div id="cabHistoryView" hidden><div class="cab-history-heading"><h3>Historique de mes transactions</h3><button id="cabBackFromHistory" class="cab-back" type="button">← Retour</button></div><div id="cabHistorique">Connectez-vous pour consulter vos demandes.</div><button id="cabRefreshHistory" type="button">Actualiser l’historique</button></div>
<hr><div id="cabPartner" hidden><h3>Espace cabiniste partenaire</h3><div id="cabAuth"></div><div id="cabPanel" hidden></div></div>`;
document.body.appendChild(section);
const cabForfaits=[
 {op:"Orange",type:"forfait_appels",group:"Pass spécial",name:"Pass Max It Minutes",price:1000,data:"—",minutes:"100 min",validity:"7 jours",notes:"",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix 1 à 3 jours",name:"Pass Mix",price:300,data:"100 Mo",minutes:"30 min d'appels tous réseaux",validity:"2 jours",notes:"Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix 1 à 3 jours",name:"Pass Minutes",price:200,data:"—",minutes:"17 min voix tous réseaux",validity:"1 jour",notes:"Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix 1 à 3 jours",name:"Pass Mix",price:400,data:"100 Mo",minutes:"50 min d'appels tous réseaux",validity:"3 jours",notes:"Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Semaine",name:"Pass Mix Semaine",price:1000,data:"1 Go",minutes:"100 min appels tous réseaux",validity:"7 jours",notes:"Appels illimités vers les numéros préférés · 300 SMS tous réseaux · Accès WaW Muzik · Bonus data Spotify : 150 Mo · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Semaine",name:"Pass Mix Semaine",price:500,data:"300 Mo",minutes:"55 min appels tous réseaux",validity:"5 jours",notes:"Appels illimités vers les numéros préférés · 300 SMS tous réseaux · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Semaine",name:"Pass Mix Semaine",price:1500,data:"1 500 Mo",minutes:"200 min appels tous réseaux",validity:"7 jours",notes:"Appels illimités vers les numéros préférés · 300 SMS tous réseaux (nationaux) · Accès WaW Muzik · Bonus data Spotify : 150 Mo · Délai de grâce : 10 jours",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Mois",name:"Pass Mix Mois",price:10000,data:"10 Go",minutes:"500 min appels tous réseaux",validity:"30 jours",notes:"Appels illimités vers les numéros préférés · 500 SMS tous réseaux · Accès WaW Muzik · Bonus data Spotify : 500 Mo · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Mois",name:"Pass Mix Mois",price:5000,data:"5 Go",minutes:"400 min appels tous réseaux",validity:"30 jours",notes:"Appels illimités vers les numéros préférés · 500 SMS tous réseaux · Accès WaW Muzik · Bonus data Spotify : 500 Mo · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Mois",name:"Pass Mix Mois",price:3000,data:"2,56 Go",minutes:"250 min appels tous réseaux",validity:"30 jours",notes:"Appels illimités vers les numéros préférés · 500 SMS tous réseaux · Accès WaW Muzik · Bonus data Spotify : 500 Mo · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_appels",group:"Pass Mix Mois",name:"Pass Mix Mois",price:20000,data:"20 Go",minutes:"1 200 min appels tous réseaux",validity:"30 jours",notes:"Appels illimités vers les numéros préférés · 500 SMS tous réseaux · Accès WaW Muzik · Bonus data Spotify : 500 Mo · Non cumulable",source:"https://www.orange.ci/fr/"},
 {op:"Orange",type:"forfait_internet",group:"Pass spécial",name:"Pass Max It",price:1000,data:"4 Go",minutes:"—",validity:"7 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass spécial",name:"Pass Max It",price:500,data:"1,5 Go",minutes:"—",validity:"3 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass spécial",name:"Pass Max It Minutes",price:1000,data:"—",minutes:"100 min",validity:"7 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 3 Jours",price:300,data:"400 Mo",minutes:"—",validity:"2 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 3 Jours",price:400,data:"340 Mo",minutes:"—",validity:"3 jours",notes:"Vidéos people",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 3 Jours",price:700,data:"750 Mo",minutes:"—",validity:"3 jours",notes:"Vidéos de cuisine",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 2 Jours",price:200,data:"220 Mo",minutes:"—",validity:"2 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 3 Jours",price:500,data:"750 Mo",minutes:"—",validity:"3 jours",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet 1 à 3 jours",name:"Pass 1 jour",price:300,data:"900 Mo",minutes:"—",validity:"1 jour",notes:"",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet semaine",name:"Pass Internet semaine",price:1000,data:"1,5 Go",minutes:"—",validity:"5 jours",notes:"Bonus data Spotify : 150 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet semaine",name:"Pass Internet semaine",price:1200,data:"1,5 Go",minutes:"—",validity:"7 jours",notes:"Vidéos flash foot · Bonus data Spotify : 150 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet semaine",name:"Pass Internet semaine",price:1500,data:"2,5 Go",minutes:"—",validity:"7 jours",notes:"Bonus data Spotify : 150 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet mois",name:"Pass mois",price:20000,data:"40 Go",minutes:"—",validity:"30 jours",notes:"Accès WaW Muzik · Bonus data Spotify : 500 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet mois",name:"Pass mois",price:10000,data:"18 Go",minutes:"—",validity:"30 jours",notes:"Accès WaW Muzik · Bonus data Spotify : 500 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet mois",name:"Pass mois",price:5000,data:"7,2 Go",minutes:"—",validity:"30 jours",notes:"Accès WaW Muzik · Bonus data Spotify : 500 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Internet mois",name:"Pass mois",price:2500,data:"3,5 Go",minutes:"—",validity:"30 jours",notes:"Accès WaW Muzik · Bonus data Spotify : 500 Mo",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Orange",type:"forfait_internet",group:"Pass Nuit",name:"Pass Internet Nuit",price:250,data:"2 048 Mo (2 Go)",minutes:"—",validity:"1 jour",notes:"Pass Internet tout usage · Période : 21h à 07h",source:"https://www.orange.ci/fr/les-pass-internet-new.html"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 20 min + 150 Mo",price:200,data:"150 Mo",minutes:"20 min",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 35 min + 400 Mo",price:300,data:"400 Mo",minutes:"35 min",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 60 min + 1 Go",price:500,data:"1 Go",minutes:"60 min",validity:"2 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 1 h + 1 Go",price:700,data:"1 Go",minutes:"1 h",validity:"5 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Moov Folie Appel + Internet 120 min + 2,5 Go",price:1000,data:"2,5 Go",minutes:"120 min",validity:"5 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 120 min + 2,5 Go",price:1000,data:"2,5 Go",minutes:"120 min",validity:"5 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Appel + Internet",name:"Appel + Internet 3 h + 5 Go",price:1500,data:"5 Go",minutes:"3 h",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass 1 à 3 jours",name:"Appels 17 min + 25 Mo + 50 SMS",price:200,data:"25 Mo",minutes:"17 min + 50 SMS",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass 1 à 3 jours",name:"Appels 27 min + 100 Mo + 100 SMS + illimité vers 5 numéros préférés",price:300,data:"100 Mo",minutes:"27 min + 100 SMS + illimité vers 5 numéros préférés",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass semaine",name:"Appels 50 min + 250 SMS + 250 Mo + illimité vers 5 numéros préférés",price:500,data:"250 Mo",minutes:"50 min + 250 SMS + illimité vers 5 numéros préférés",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass semaine",name:"Appels illimités vers 5 numéros préférés + 200 min + 500 SMS TR + 1 536 Mo",price:1500,data:"1 536 Mo",minutes:"200 min + illimité vers 5 numéros préférés + 500 SMS TR",validity:"15 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass 10 et 15 jours",name:"Appels 100 min + 500 SMS + 1 024 Mo + illimité vers 5 numéros préférés",price:1000,data:"1 024 Mo",minutes:"100 min + 500 SMS + illimité vers 5 numéros préférés",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass mois",name:"Appels illimités vers 5 numéros préférés + 250 min + 500 SMS TR + 2,5 Go",price:2500,data:"2,5 Go",minutes:"250 min + illimité vers 5 numéros préférés + 500 SMS TR",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass mois",name:"Appels illimités vers 5 numéros préférés + 500 min + 500 SMS TR + 5 Go",price:5000,data:"5 Go",minutes:"500 min + illimité vers 5 numéros préférés + 500 SMS TR",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass mois",name:"Appels illimités vers 5 numéros préférés + 830 min + 500 SMS TR + 10 Go",price:10000,data:"10 Go",minutes:"830 min + illimité vers 5 numéros préférés + 500 SMS TR",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass mois",name:"Appels illimités vers 5 numéros préférés + 1 660 min + 1 000 SMS TR + 20 Go",price:20000,data:"20 Go",minutes:"1 660 min + illimité vers 5 numéros préférés + 1 000 SMS TR",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Internet illimités",name:"Internet illimité 1 heure",price:300,data:"Illimité",minutes:"—",validity:"1 heure",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Internet illimités",name:"Internet illimité 2 heures",price:500,data:"Illimité",minutes:"—",validity:"2 heures",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Internet illimités",name:"Internet illimité 6 heures",price:1300,data:"Illimité",minutes:"—",validity:"6 heures",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"150 Mo",price:150,data:"150 Mo",minutes:"—",validity:"2 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 200 Mo",price:200,data:"200 Mo",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Réseaux sociaux 500 Mo",price:200,data:"500 Mo",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"220 Mo",price:200,data:"220 Mo",minutes:"—",validity:"2 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"340 Mo",price:300,data:"340 Mo",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"TikTok 1 Go",price:300,data:"1 Go",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 500 Mo",price:300,data:"500 Mo",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 1 Go",price:500,data:"1 Go",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"750 Mo",price:500,data:"750 Mo",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass semaine",name:"1 024 Mo",price:750,data:"1 024 Mo",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass semaine",name:"1,5 Go",price:1000,data:"1,5 Go",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass semaine",name:"Internet 2 Go",price:1000,data:"2 Go",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass semaine",name:"Internet 3 Go",price:1500,data:"3 Go",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 10 et 15 jours",name:"2,5 Go",price:1500,data:"2,5 Go",minutes:"—",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass 10 et 15 jours",name:"Internet 5 Go",price:2000,data:"5 Go",minutes:"—",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"3 Go",price:2000,data:"3 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"7,4 Go",price:4900,data:"7,4 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"Internet 10 Go",price:5000,data:"10 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"22 Go",price:9900,data:"22 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"Internet 20 Go",price:10000,data:"20 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"35 Go",price:14900,data:"35 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"50 Go",price:19900,data:"50 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"Internet 50 Go",price:20000,data:"50 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"150 Go",price:24000,data:"150 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"300 Go",price:29000,data:"300 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Pass mois",name:"400 Go",price:39000,data:"400 Go",minutes:"—",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Internet Moov Folie Day",price:200,data:"—",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Moov Folie 900 Mo",price:300,data:"900 Mo",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Internet Moov Folie 3 jours",price:500,data:"—",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Moov Folie 2,5 Go (5j)",price:750,data:"2,5 Go",minutes:"—",validity:"5 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Internet Moov Folie 2,5 Go 5j",price:750,data:"2,5 Go",minutes:"—",validity:"5 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Moov Folie 4 Go",price:1000,data:"4 Go",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Moov Folie 6 Go",price:1500,data:"6 Go",minutes:"—",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_internet",group:"Moov Folie",name:"Moov Folie 10 Go",price:2500,data:"10 Go",minutes:"—",validity:"15 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_mixte",group:"Pass nuit",name:"Pass nuit 30 min TRS + 2 Go",price:200,data:"2 Go",minutes:"30 min TRS",validity:"22h–7h",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie Appels Jour",price:200,data:"—",minutes:"—",validity:"1 jour",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie Appels 3 Jours",price:500,data:"—",minutes:"—",validity:"3 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie 140 min",price:1000,data:"—",minutes:"140 min",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie Appels Semaine",price:1000,data:"—",minutes:"—",validity:"7 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie 210 min",price:1500,data:"—",minutes:"210 min",validity:"10 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie 350 min",price:2500,data:"—",minutes:"350 min",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"Moov Africa",type:"forfait_appels",group:"Moov Folie",name:"Moov Folie 700 min",price:5000,data:"—",minutes:"700 min",validity:"30 jours",notes:"",source:"https://www.moov-africa.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 650Mo",price:200,data:"650 Mo",minutes:"—",validity:"1 jour",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 900Mo",price:300,data:"900 Mo",minutes:"—",validity:"1 jour",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 1,5Go",price:500,data:"1,5 Go",minutes:"—",validity:"3 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 4Go",price:1000,data:"4 Go",minutes:"—",validity:"7 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 5Go",price:1500,data:"5 Go",minutes:"—",validity:"7 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 7,5Go",price:2500,data:"7,5 Go",minutes:"—",validity:"10 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass C'Chic",name:"Pass c'chic 15Go",price:5000,data:"15 Go",minutes:"—",validity:"21 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 2 Jours",price:200,data:"—",minutes:"—",validity:"2 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 3 Jours",price:300,data:"—",minutes:"—",validity:"3 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass 1 à 3 jours",name:"Internet 3 Jours+",price:500,data:"—",minutes:"—",validity:"3 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass semaine",name:"Internet Week",price:1000,data:"—",minutes:"—",validity:"7 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass mois",name:"Internet Mois",price:2500,data:"—",minutes:"—",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_internet",group:"Pass mois",name:"Internet Mois Medium",price:5000,data:"—",minutes:"—",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 140min",price:1000,data:"—",minutes:"140 min",validity:"10 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 210min",price:1500,data:"—",minutes:"210 min",validity:"15 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 280min",price:2000,data:"—",minutes:"280 min",validity:"15 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 400min",price:3000,data:"—",minutes:"400 min",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 700min",price:5000,data:"—",minutes:"700 min",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 20min",price:200,data:"—",minutes:"20 min",validity:"2 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 35min",price:300,data:"—",minutes:"35 min",validity:"3 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass C'Chic",name:"Pass c'chic 65min",price:500,data:"—",minutes:"65 min",validity:"5 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",group:"Pass C'Chic",name:"Pass c'chic 1,5 Go + 60min",price:700,data:"1,5 Go",minutes:"60 min",validity:"7 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass semaine",name:"Appels Week",price:500,data:"—",minutes:"—",validity:"7 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass 10 et 15 jours",name:"Appels 10 Jours",price:1000,data:"—",minutes:"—",validity:"10 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass mois",name:"Appels Mois",price:2500,data:"—",minutes:"—",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass mois",name:"Appels Premium",price:10000,data:"—",minutes:"—",validity:"30 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass 1 à 3 jours",name:"Appels 15 min",price:200,data:"—",minutes:"15 min",validity:"1 jour",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass 1 à 3 jours",name:"Appels Day+",price:200,data:"—",minutes:"—",validity:"1 jour",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_mixte",group:"Pass 1 à 3 jours",name:"Appels 27 min + Internet 50 Mo",price:300,data:"50 Mo",minutes:"27 min",validity:"3 jours",source:"https://www.mtn.ci/"},
 {op:"MTN",type:"forfait_appels",group:"Pass 1 à 3 jours",name:"Appels 3 Jours",price:300,data:"—",minutes:"—",validity:"3 jours",source:"https://www.mtn.ci/"},
];

const cabTypeLabels={forfait_internet:"Internet",forfait_appels:"Appels",forfait_mixte:"Mixte"};
let cabSelectedOffer=null;
function rendreCatalogueCabine(){
 cabSelectedOffer=null;
 const root=$("cabCatalogue");if(!root)return;
 const op=$("cabOperateur").value,kind=$("cabService").value;
 const matching=cabForfaits.filter(x=>x.op===op&&x.type===kind);
 const periodeForfait=x=>{
  const validity=String(x.validity||"").toLowerCase().trim();
  const group=String(x.group||"").toLowerCase();
  if(/nuit|22h/.test(validity+" "+group))return "nuit";
  const hours=validity.match(/^(\d+)\s*heures?$/);
  if(hours)return "heures";
  const days=validity.match(/^(\d+)\s*jours?$/);
  if(days){const n=Number(days[1]);if(n<=4)return "jour";if(n<=21)return "semaine";if(n===30)return "mois";if(n>21&&n<30)return "intermediaire";}
  return "autres";
 };
 const periodes=[
  ["jour","Pass Jour"],["semaine","Pass Semaine"],["intermediaire","Autres durées"],
  ["mois","Pass Mois"],["heures","Pass Heures"],["nuit","Pass Nuit"],["autres","Autres durées"]
 ];
 const card=x=>'<button type="button" class="cab-offer-choice" data-cab-offer="'+cabForfaits.indexOf(x)+'" aria-label="'+esc(x.name)+', '+x.price.toLocaleString("fr-FR")+' FCFA, '+esc(x.validity)+'"><span class="cab-offer-choice-name">'+esc(x.name)+'</span><span class="cab-offer-choice-meta"><strong>'+x.price.toLocaleString("fr-FR")+' FCFA</strong><span>⏱ '+esc(x.validity)+'</span></span></button>';
 let html='<div class="cab-catalog-head"><h3>Forfaits — '+esc(op)+'</h3></div>';
 if(matching.length){
  for(const [key,label] of periodes){
   const offers=matching.filter(x=>periodeForfait(x)===key);
   if(!offers.length)continue;
   html+='<section class="cab-offer-period" data-cab-period="'+key+'"><h4>'+label+' <span>('+offers.length+')</span></h4><div class="cab-offer-choice-list">'+offers.map(card).join("")+'</div></section>';
  }
 }else html+='<div class="cab-item">Aucune offre répertoriée pour cet opérateur et cette catégorie. Choisissez une autre catégorie ou un autre opérateur.</div>';
 root.innerHTML=html+'<p class="cab-muted">Sélectionnez un forfait pour afficher le récapitulatif et poursuivre le paiement.</p>';
 root.querySelectorAll("[data-cab-offer]").forEach(b=>b.onclick=()=>selectionnerForfaitCabine(cabForfaits[Number(b.dataset.cabOffer)]));
 const generic=()=>{ $("cabMontant").value="";$("cabDetails").value="Forfait "+(cabTypeLabels[kind]||"")+" à préciser avec le cabiniste."; $("cabCommuneClient").focus(); document.getElementById("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});};
 $("cabMtnChoose")?.addEventListener("click",generic);$("cabOrangeChoose")?.addEventListener("click",generic);
}
function selectionnerForfaitCabine(x){
 const phone=$("cabNumero").value.trim();
 if(phone.length<8||phone.length>20){$("cabMessage").textContent="Saisissez d’abord un numéro de bénéficiaire valide."; $("cabNumero").focus();$("cabNumero").scrollIntoView({behavior:"smooth",block:"center"});return;}
 cabSelectedOffer=x;
 $("cabOperateur").value=x.op;$("cabService").value=x.type;
 $("cabAmountWrap").hidden=true;
 const fee=fraisCabine(x.price),total=x.price+fee;
 $("cabRecapOperator").textContent=x.op;
 $("cabRecapPhone").textContent=phone;
 $("cabRecapOffer").textContent=x.name+" · "+x.validity;
 $("cabRecapPrice").textContent=money(x.price);
 $("cabRecapFee").textContent=money(fee);
 $("cabRecapTotal").textContent=money(total);
 $("cabSubscriptionRecap").hidden=false;
 $("cabPaymentWrap").hidden=false;
 $("cabFeePreview").hidden=true;
 $("cabEnvoyer").hidden=false;
 $("cabMessage").textContent="Vérifiez le récapitulatif, choisissez votre moyen de paiement, puis confirmez.";
 $("cabSubscriptionRecap").scrollIntoView({behavior:"smooth",block:"center"});
}
$("cabOperateur").addEventListener("change",()=>{cabSelectedOffer=null;$("cabSubscriptionRecap").hidden=true;$("cabPaymentWrap").hidden=true;rendreCatalogueCabine();});
$("cabNumero").addEventListener("input",()=>{if(cabSelectedOffer){cabSelectedOffer=null;$("cabSubscriptionRecap").hidden=true;$("cabPaymentWrap").hidden=true;$("cabMessage").textContent="Le numéro a changé. Sélectionnez à nouveau le forfait pour actualiser le récapitulatif.";}});
$("cabService").addEventListener("change",rendreCatalogueCabine);
rendreCatalogueCabine();
const css=document.createElement("style");css.textContent=`
#cabinesTelephoniques{max-width:760px;margin:0 auto}
#cabinesTelephoniques .cab-offer-period{margin:18px 0 24px}
#cabinesTelephoniques .cab-offer-period>h4{display:flex;align-items:center;gap:8px;margin:18px 2px 12px;color:#68786e;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
#cabinesTelephoniques .cab-offer-period>h4 span{font-size:12px;font-weight:600;color:#87918a}
#cabinesTelephoniques .cab-offer-choice-list{display:grid;grid-template-columns:1fr;gap:10px}
#cabinesTelephoniques .cab-offer-choice{display:flex;flex-direction:column;align-items:flex-start;gap:9px;width:100%;box-sizing:border-box;padding:15px 17px;border:2px solid #e1e5e9;border-radius:22px;background:#fff;color:#17191d;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
#cabinesTelephoniques .cab-offer-choice:active,#cabinesTelephoniques .cab-offer-choice:focus-visible{outline:none;border-color:#16834a;background:#f1faf4}
#cabinesTelephoniques .cab-offer-choice-name{font-size:18px;font-weight:800;line-height:1.25}
#cabinesTelephoniques .cab-offer-choice-meta{display:flex;flex-wrap:wrap;align-items:center;gap:9px;color:#5e6873;font-size:15px}
#cabinesTelephoniques .cab-offer-choice-meta strong{color:#17663d;font-size:16px}
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
#cabinesTelephoniques #cabOperatorChoices .cab-logo-choice img{display:block;width:100%;max-width:128px;height:54px;object-fit:contain}
#cabinesTelephoniques .cab-logo-choice.selected{border-color:#16834a;background:#f0faf3;box-shadow:0 0 0 2px #16834a18}
#cabinesTelephoniques .cab-payment-logo{display:block;width:100%;height:48px;max-width:128px;object-fit:contain;}
#cabinesTelephoniques .cab-brand.wave{color:#0879e8;font-size:19px}
#cabinesTelephoniques .cab-brand.djamo{color:#141414;font-size:18px}
#cabinesTelephoniques .cab-hidden-select{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
#cabinesTelephoniques #cabCommuneWrap,#cabinesTelephoniques #cabDetailsWrap{display:block}

@media(max-width:380px){#cabinesTelephoniques .cab-menu-card{min-height:132px;padding:10px 4px}#cabinesTelephoniques .cab-menu-card strong{font-size:13px}#cabinesTelephoniques .cab-menu-icon{width:56px;height:56px}}
`;document.head.appendChild(css);
function ouvrirCabinesTelephoniques(){if(typeof ouvrirSectionPleinEcran==="function")ouvrirSectionPleinEcran("cabinesTelephoniques","Cabine téléphonique");else section.style.display="block";chargerHistorique();}
window.ouvrirCabinesTelephoniques=ouvrirCabinesTelephoniques;
let cabRequestMode="transfer";
function ouvrirFormulaireCabine(mode,serviceType){cabRequestMode=mode;cabSelectedOffer=null;$("cabRequestForm").hidden=false;$("cabClientChoices").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabCategoryChoices").hidden=true;$("cabHistoryView").hidden=true;$("cabFormTitle").textContent=mode==="transfer"?"Transfert d’unité":serviceType==="forfait_internet"?"Souscrire un forfait internet":serviceType==="forfait_mixte"?"Souscrire un forfait mixte":"Souscrire un forfait appel";$("cabService").value=mode==="transfer"?"transfert_unites":serviceType;if(mode==="subscribe"&&cabChosenOperator){$("cabOperateur").value=cabChosenOperator;}$("cabService").disabled=mode==="transfer";$("cabServiceWrap").hidden=true;$("cabOperatorChoices").hidden=mode!=="transfer";$("cabCatalogue").hidden=mode==="transfer";$("cabAmountWrap").hidden=mode!=="transfer";$("cabFeePreview").hidden=mode!=="transfer";$("cabCommuneWrap").hidden=true;$("cabDetailsWrap").hidden=true;$("cabNumeroWrap").hidden=false;rendreCatalogueCabine();$("cabNumero").focus();}
function retourMenuCabine(){ $("cabRequestForm").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabCategoryChoices").hidden=true;$("cabHistoryView").hidden=true;$("cabClientChoices").hidden=false;$("cabMessage").textContent="";$("cabEnvoyer").disabled=false;}
$("cabStartTransfer").onclick=()=>ouvrirFormulaireCabine("transfer","transfert_unites");
$("cabStartSubscribe").onclick=()=>{$("cabClientChoices").hidden=true;$("cabCategoryChoices").hidden=true;$("cabSubscribeChoices").hidden=false;};
let cabChosenOperator="";
$("cabSubscribeChoices").querySelectorAll("[data-cab-operator]").forEach(b=>b.onclick=()=>{cabChosenOperator=b.dataset.cabOperator;$("cabOperateur").value=cabChosenOperator;cabSelectLogo("cabOperatorChoices","operator","cabOperateur",cabChosenOperator);$("cabSubscribeChoices").hidden=true;$("cabCategoryChoices").hidden=false;$("cabCategoryTitle").textContent="Opérateur : "+cabChosenOperator+" — choisissez une catégorie";$("cabStartMixed").hidden=cabChosenOperator==="Orange";});
$("cabStartCalls").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_appels");
$("cabStartInternet").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_internet");
$("cabStartMixed").onclick=()=>ouvrirFormulaireCabine("subscribe","forfait_mixte");
$("cabBackToMenu").onclick=retourMenuCabine;
$("cabBackToOperators").onclick=()=>{$("cabCategoryChoices").hidden=true;$("cabSubscribeChoices").hidden=false;};
$("cabBackToCategory").onclick=()=>{if(cabRequestMode==="subscribe"){$("cabRequestForm").hidden=true;$("cabCategoryChoices").hidden=false;$("cabMessage").textContent="";$("cabEnvoyer").disabled=false;}};
$("cabStartHistory").onclick=()=>{$("cabClientChoices").hidden=true;$("cabSubscribeChoices").hidden=true;$("cabRequestForm").hidden=true;$("cabHistoryView").hidden=false;chargerHistorique();};
$("cabBackFromHistory").onclick=retourMenuCabine;
$("cabCancelForm").onclick=retourMenuCabine;
function cabSelectLogo(container,attribute,selectId,value){const select=$(selectId);select.value=value;$(container).querySelectorAll("[data-"+attribute+"]").forEach(b=>{const active=b.getAttribute("data-"+attribute)===value;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",active?"true":"false");});}
$("cabOperatorChoices").querySelectorAll("[data-operator]").forEach(b=>b.onclick=()=>cabSelectLogo("cabOperatorChoices","operator","cabOperateur",b.dataset.operator));
$("cabPaymentChoices").querySelectorAll("[data-payment]").forEach(b=>b.onclick=()=>cabSelectLogo("cabPaymentChoices","payment","cabPaymentMethod",b.dataset.payment));
function fraisCabine(montant){return Math.round(montant*0.04);}
function afficherRecapitulatifFraisCabine(amount){const fee=Number.isSafeInteger(amount)&&amount>=200?fraisCabine(amount):null;$("cabFeePreview").textContent=fee===null?"Frais de service : montant minimum 200 FCFA.":"Prix du service : "+money(amount)+" · Frais de service (4 %) : "+money(fee)+" · Total à payer : "+money(amount+fee);}
function actualiserFraisCabine(){afficherRecapitulatifFraisCabine(Number($("cabMontant").value));}
$("cabMontant").addEventListener("input",actualiserFraisCabine);
$("cabService").addEventListener("change",()=>{rendreCatalogueCabine();$("cabCatalogue").hidden=$("cabService").value==="transfert_unites";});
$("cabEnvoyer").onclick=async()=>{
 const u=auth.currentUser,amount=cabRequestMode==="transfer"?Number($("cabMontant").value):Number(cabSelectedOffer?.price),phone=$("cabNumero").value.trim(),commune="",details=cabRequestMode==="transfer"?"":(cabSelectedOffer?[cabSelectedOffer.group,cabSelectedOffer.name,"Internet : "+cabSelectedOffer.data,"Appels / SMS : "+cabSelectedOffer.minutes,"Validité : "+cabSelectedOffer.validity,cabSelectedOffer.notes,cabSelectedOffer.code?"Code USSD : "+cabSelectedOffer.code:""].filter(Boolean).join(" — "):""),button=$("cabEnvoyer"),msg=$("cabMessage");
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
 z.style.display="block";z.innerHTML="<h3>Cabines téléphoniques — administration</h3><h4>Candidatures partenaires</h4><div id='cabAdminCabines'>Chargement…</div><h4>Opérations et soldes des cabines</h4><p class='cab-muted'>Chaque opération terminée peut être réglée individuellement. Le bouton « Payer » marque le montant restant comme payé et le déduit du solde de la cabine. Aucun transfert Wave, Jèko ou bancaire n’est déclenché automatiquement.</p><div id='cabAdminComptabilite'>Chargement…</div><h4>Demandes des clients</h4><div id='cabAdminDemandes'>Chargement…</div>";
 db.collection("cabines_telephoniques").limit(200).get().then(q=>{$("cabAdminCabines").innerHTML=q.empty?"Aucune candidature.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.nom)+"</strong> · "+esc(x.commune)+" · "+esc(x.telephone)+"<p>"+esc(x.adresse)+" · "+esc((x.operateurs||[]).join(", "))+"</p><p>Statut : "+esc(x.statut)+"</p>"+(x.statut==="en_attente"?"<button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','approuve')\">Approuver</button><button type='button' onclick=\"window.cabAdminCabine('"+d.id+"','refuse')\">Refuser</button>":"")+"</article>";}).join("");}).catch(e=>$("cabAdminCabines").textContent="Chargement impossible : "+e.message);
 db.collection("demandes_cabines").limit(200).get().then(q=>{$("cabAdminDemandes").innerHTML=q.empty?"Aucune demande.":q.docs.map(d=>{const x=d.data();return "<article class='cab-item'><strong>"+esc(x.operateur)+" · "+esc(x.typeService)+"</strong><p>"+esc(x.commune)+" · "+esc(x.numeroBeneficiaire)+" · "+money(x.montantPrestation)+"</p><p>"+esc(libelleStatut(x.statut))+" · Cabiniste : "+esc(x.cabineNom||"Non attribuée")+"</p></article>";}).join("");}).catch(e=>$("cabAdminDemandes").textContent="Chargement impossible : "+e.message);
 chargerComptabiliteCabines();
}

async function chargerComptabiliteCabines(){
 const root=$("cabAdminComptabilite");if(!root)return;
 try{
  const [cabines,demandes]=await Promise.all([
   db.collection("cabines_telephoniques").limit(300).get(),
   db.collection("demandes_cabines").limit(500).get()
  ]);
  const grouped=new Map();
  demandes.docs.forEach(doc=>{const d=doc.data();if(d.cabineUid){if(!grouped.has(d.cabineUid))grouped.set(d.cabineUid,[]);grouped.get(d.cabineUid).push(doc);}});
  const sections=await Promise.all(cabines.docs.map(async cabine=>{
   const profile=cabine.data(),docs=(grouped.get(cabine.id)||[]).sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
   const rows=await Promise.all(docs.map(async doc=>{
    const snap=await doc.ref.collection("reversements").get(),payouts=snap.docs.map(p=>p.data());
    const paid=payouts.reduce((sum,p)=>sum+Number(p.montantXof||0),0);
    const earned=Number(doc.data().montantAReverser??doc.data().montantPrestation??0);
    const balance=Math.max(0,earned-paid);
    return {doc,data:doc.data(),payouts,paid,earned,balance};
   }));
   const eligible=rows.filter(r=>r.data.statut==="terminee");
   const earned=eligible.reduce((sum,r)=>sum+r.earned,0),paid=eligible.reduce((sum,r)=>sum+r.paid,0),balance=eligible.reduce((sum,r)=>sum+r.balance,0);
   const detail=rows.map(r=>{
    const id=r.doc.id,d=r.data;
    const settled=r.balance<=0;
    const action=d.statut!=="terminee"
      ? "<p class='cab-muted'>Paiement disponible après confirmation de la prestation.</p>"
      : settled
        ? "<p class='cab-muted'>Transaction déjà payée.</p>"
        : "<button type='button' class='primary' data-cab-payer='"+esc(id)+"'>Payer "+money(r.balance)+"</button>";
    const history=r.payouts.length?r.payouts.map(p=>"<li>"+money(p.montantXof)+" · "+esc(p.dateReversement||"Date inconnue")+" · "+esc(p.reference||"Paiement enregistré")+" · "+esc(p.moyenPaiement||"—")+"</li>").join(""):"<li>Aucun paiement enregistré</li>";
    return "<article class='cab-item'><strong>"+esc(d.operateur)+" · "+esc(d.typeService)+" · "+esc(d.numeroBeneficiaire)+"</strong><p>Montant de l’opération : "+money(r.earned)+" · Déjà payé : "+money(r.paid)+" · Reste : <strong>"+money(r.balance)+"</strong></p><p>"+esc(libelleStatut(d.statut))+" · Demande "+esc(id)+" · "+esc(dateCabine(d.updatedAt||d.createdAt))+"</p>"+action+"<details><summary>Historique des paiements ("+r.payouts.length+")</summary><ul>"+history+"</ul></details></article>";
   }).join("");
   return "<section class='cab-item'><div class='cab-request-head'><strong>"+esc(profile.nom||"Cabine sans nom")+"</strong><span class='cab-pill'>"+esc(profile.commune||"")+"</span></div><p>"+esc(profile.telephone||"")+" · "+rows.length+" opération(s)</p><div class='cab-stats'><div class='cab-stat'><strong>"+money(earned)+"</strong><span>Montant des opérations terminées</span></div><div class='cab-stat'><strong>"+money(paid)+"</strong><span>Déjà payé</span></div><div class='cab-stat'><strong>"+money(balance)+"</strong><span>Solde restant</span></div></div>"+(detail||"<p class='cab-muted'>Aucune opération attribuée à cette cabine.</p>")+"</section>";
  }));
  root.innerHTML=sections.join("")||"Aucune cabine partenaire.";
  root.querySelectorAll("[data-cab-payer]").forEach(button=>button.onclick=()=>window.cabAdminPayerTransaction(button.dataset.cabPayer));
 }catch(error){console.error(error);root.textContent="Suivi des opérations indisponible : "+(error.message||"erreur de chargement");}
}
window.cabAdminPayerTransaction=async demandeId=>{
 if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert("Accès administrateur requis.");return;}
 if(!confirm("Confirmer le paiement de cette transaction ? Le montant restant sera déduit du solde de la cabine."))return;
 const payDb=db;
 const demandRef=payDb.collection("demandes_cabines").doc(demandeId);
 const paymentRef=demandRef.collection("reversements").doc("paiement-administrateur");
 try{
  const history=await demandRef.collection("reversements").get();
  const paidHistorique=history.docs.reduce((sum,p)=>sum+Number(p.data().montantXof||0),0);
  if(!Number.isSafeInteger(paidHistorique)||paidHistorique<0)throw new Error("Historique des paiements invalide.");
  await payDb.runTransaction(async tx=>{
   const [snap,existing]=await Promise.all([tx.get(demandRef),tx.get(paymentRef)]);
   if(!snap.exists)throw new Error("Transaction introuvable.");
   const d=snap.data();
   if(d.statut!=="terminee"||!d.cabineUid)throw new Error("Seule une opération terminée et attribuée peut être payée.");
   if(existing.exists)throw new Error("Cette transaction a déjà été payée.");
   const paid=Number.isSafeInteger(d.reversementsTotalXof)?d.reversementsTotalXof:paidHistorique;
   const earned=Number(d.montantAReverser??d.montantPrestation??0),amount=earned-paid;
   if(!Number.isSafeInteger(earned)||earned<=0||!Number.isSafeInteger(paid)||paid<0||!Number.isSafeInteger(amount)||amount<=0||paid>earned)throw new Error("Aucun solde valide ne reste à payer.");
   tx.update(demandRef,{reversementsTotalXof:earned});
   tx.set(paymentRef,{demandeId,cabineUid:d.cabineUid,cabineNom:d.cabineNom||"",montantXof:amount,dateReversement:new Date().toISOString().slice(0,10),reference:"Paiement administrateur "+demandeId,moyenPaiement:"Paiement marqué par l’administrateur",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:auth.currentUser.uid,type:"paiement_transaction"});
  });
  alert("Paiement enregistré. Le solde restant de cette transaction est maintenant à zéro.");
  await chargerComptabiliteCabines();
 }catch(error){alert("Paiement non enregistré : "+(error.message||"erreur"));}
};
window.cabAdminCabine=async(id,s)=>{if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID||!["approuve","refuse"].includes(s))return;try{await db.collection("cabines_telephoniques").doc(id).update({statut:s,updatedAt:stamp(),validePar:auth.currentUser.uid});panneauAdmin();}catch(e){alert(e.message);}};
window.cabOuvrirAdmin=panneauAdmin;
if(typeof RUBRIQUES_ADMIN!=="undefined"&&!RUBRIQUES_ADMIN.some(r=>r.id==="gestionCabinesAdmin"))RUBRIQUES_ADMIN.push({id:"gestionCabinesAdmin",groupe:"Professionnels",icone:"📞",titre:"Cabines téléphoniques",description:"Valider les cabinistes et suivre les demandes."});
if(typeof ouvrirRubriqueAdmin==="function"){const ancien=window.ouvrirRubriqueAdmin;window.ouvrirRubriqueAdmin=function(id){if(id==="gestionCabinesAdmin"){const menu=document.getElementById("adminMenuRubriques");if(menu)menu.style.display="none";RUBRIQUES_ADMIN.forEach(r=>{const e=document.getElementById(r.id);if(e)e.style.display="none";});panneauAdmin();return;}return ancien.apply(this,arguments);};}
if(typeof auth!=="undefined"&&auth.onAuthStateChanged)auth.onAuthStateChanged(chargerHistorique);
})();