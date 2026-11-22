/* Préinscription terrain des livreurs — MON QUOTIDIEN CI */
(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const main=document.querySelector("main");
if(!main||document.getElementById("recrutementLivreurs"))return;
const section=document.createElement("section");
section.id="recrutementLivreurs";section.className="card";section.style.display="none";
section.innerHTML=`
 <div class="rl-head"><div class="rl-kicker">MON QUOTIDIEN CI · PARTENAIRES</div><h2>🚴 Rejoindre notre réseau de livreurs</h2><p>Vous êtes livreur, coursier ou souhaitez commencer une activité de livraison ? Répondez à ce court questionnaire pour nous aider à développer le service dans votre commune.</p><div class="rl-time">⏱ 5 à 7 minutes · Préinscription gratuite</div></div>
 <form id="rlForm">
  <h3>1. Vos coordonnées</h3>
  <label for="rlNom">Nom et prénom *</label><input id="rlNom" name="nom" required maxlength="100" autocomplete="name" placeholder="Votre nom complet">
  <label for="rlTelephone">Téléphone / WhatsApp *</label><input id="rlTelephone" name="telephone" required type="tel" maxlength="20" inputmode="tel" placeholder="Ex. 07 00 00 00 00">
  <label for="rlCommune">Commune ou ville *</label><input id="rlCommune" name="commune" required maxlength="70" placeholder="Ex. Yopougon, Abobo, Bouaké">
  <label for="rlQuartier">Quartier principal</label><input id="rlQuartier" name="quartier" maxlength="100" placeholder="Ex. Niangon, Angré, Cocody">
  <h3>2. Votre activité</h3>
  <label for="rlProfil">Votre situation *</label><select id="rlProfil" name="profil" required><option value="">Sélectionner</option><option>Livreur indépendant déjà en activité</option><option>Coursier salarié</option><option>Débutant souhaitant devenir livreur</option><option>Autre activité avec disponibilité pour livrer</option></select>
  <label for="rlTransport">Votre moyen de déplacement *</label><select id="rlTransport" name="transport" required><option value="">Sélectionner</option><option>Moto personnelle</option><option>Moto louée</option><option>Vélo</option><option>Voiture personnelle</option><option>Voiture louée</option><option>À pied / transports en commun</option><option>Autre</option></select>
  <label for="rlPermis">Avez-vous un permis de conduire ?</label><select id="rlPermis" name="permis"><option value="">Sélectionner</option><option>Oui</option><option>Non</option><option>Non applicable à mon moyen de déplacement</option></select>
  <label for="rlExperience">Expérience en livraison</label><select id="rlExperience" name="experience"><option value="">Sélectionner</option><option>Débutant</option><option>Moins de 6 mois</option><option>6 mois à 1 an</option><option>1 à 3 ans</option><option>Plus de 3 ans</option></select>
  <label for="rlZones">Zones que vous pouvez couvrir *</label><textarea id="rlZones" name="zones" required maxlength="500" rows="2" placeholder="Indiquez vos communes et quartiers habituels"></textarea>
  <label for="rlTypes">Que pouvez-vous livrer ?</label><select id="rlTypes" name="types"><option value="">Sélectionner</option><option>Repas et courses</option><option>Colis et documents</option><option>Achats de boutiques et commerces</option><option>Tous types de livraisons</option></select>
  <h3>3. Disponibilité et tarifs</h3>
  <label for="rlDisponibilite">Vos disponibilités *</label><select id="rlDisponibilite" name="disponibilite" required><option value="">Sélectionner</option><option>Temps plein</option><option>Matinées</option><option>Après-midis</option><option>Soirs</option><option>Week-ends</option><option>Selon les commandes</option></select>
  <label for="rlVolume">Combien de livraisons pouvez-vous effectuer par jour ?</label><select id="rlVolume" name="volume"><option value="">Sélectionner</option><option>1 à 3</option><option>4 à 6</option><option>7 à 10</option><option>Plus de 10</option><option>Je ne sais pas encore</option></select>
  <label for="rlTarif">Votre tarif moyen pour une livraison (FCFA)</label><input id="rlTarif" name="tarif" type="number" min="0" max="500000" step="50" inputmode="numeric" placeholder="Ex. 1 000">
  <label for="rlMinimum">Quel revenu journalier minimum souhaitez-vous atteindre ? (FCFA)</label><input id="rlMinimum" name="revenuMinimum" type="number" min="0" max="2000000" step="100" inputmode="numeric" placeholder="Facultatif">
  <h3>4. Vos besoins et votre intérêt</h3>
  <label for="rlDifficultes">Quelles sont vos principales difficultés ?</label><textarea id="rlDifficultes" name="difficultes" maxlength="700" rows="3" placeholder="Ex. manque de clients, carburant, entretien, retards de paiement, adresses difficiles…"></textarea>
  <label for="rlAttentes">Qu’attendez-vous de MON QUOTIDIEN CI ?</label><textarea id="rlAttentes" name="attentes" maxlength="700" rows="3" placeholder="Vos attentes ou suggestions"></textarea>
  <label for="rlCollaboration">Souhaitez-vous devenir livreur partenaire ? *</label><select id="rlCollaboration" name="collaboration" required><option value="">Sélectionner</option><option>Oui, je souhaite être recontacté</option><option>Je souhaite d’abord en savoir plus</option><option>Je participe seulement au sondage</option></select>
  <label class="rl-consent"><input id="rlConsent" type="checkbox" required> J’accepte que MON QUOTIDIEN CI utilise ces informations pour étudier ma candidature et me recontacter au sujet du réseau de livraison. *</label>
  <p class="rl-privacy">Vos coordonnées sont destinées à l’équipe MON QUOTIDIEN CI pour le recrutement et le suivi de cette préinscription. Ne communiquez pas de mot de passe ni de pièce d’identité dans ce formulaire.</p>
  <button class="primary" id="rlSubmit" type="submit">Envoyer ma préinscription</button><p id="rlStatus" role="status" aria-live="polite"></p>
 </form>
 <section id="rlAdmin" hidden><hr><h3>📋 Candidatures reçues</h3><p class="notice">Vue réservée à l’administrateur du projet.</p><button type="button" id="rlRefresh">Actualiser les candidatures</button><div id="rlList"></div></section>`;
const style=document.createElement("style");style.textContent=`
#recrutementLivreurs{max-width:720px;margin:16px auto;padding:clamp(16px,4vw,26px)}
#recrutementLivreurs .rl-head{background:linear-gradient(135deg,#fff7ed,#eef8f0);border:1px solid #e5eee6;border-radius:17px;padding:18px;margin-bottom:18px}
#recrutementLivreurs .rl-kicker{font-size:10px;letter-spacing:1px;font-weight:850;color:#16834a}
#recrutementLivreurs .rl-head h2{margin:8px 0;color:#18352a}
#recrutementLivreurs .rl-head p{font-size:14px;line-height:1.55}
#recrutementLivreurs .rl-time{font-size:12px;font-weight:750;color:#17663d}
#recrutementLivreurs h3{margin:22px 0 10px;color:#17663d}
#recrutementLivreurs label{display:block;margin:13px 0 6px;font-size:13px;font-weight:700}
#recrutementLivreurs input:not([type=checkbox]),#recrutementLivreurs select,#recrutementLivreurs textarea{width:100%;min-height:46px;padding:12px;border:1px solid #dce7de;border-radius:12px;background:#fff;font:inherit;box-sizing:border-box}
#recrutementLivreurs textarea{resize:vertical}
#recrutementLivreurs .rl-consent{display:flex;gap:10px;align-items:flex-start;line-height:1.5;font-weight:600}
#recrutementLivreurs .rl-consent input{margin-top:3px;flex:0 0 auto}
#recrutementLivreurs .rl-privacy{font-size:11px;color:#68786e;line-height:1.5}
#recrutementLivreurs #rlStatus{font-size:13px;font-weight:700}
#recrutementLivreurs .rl-candidate{border:1px solid #e3eae4;border-radius:12px;padding:12px;margin:10px 0;background:#fff;font-size:13px}
`;document.head.appendChild(style);main.appendChild(section);
const popular=document.querySelector("#homePopular .family-shortcuts");
if(popular&&!document.getElementById("rlHomeButton")){const b=document.createElement("button");b.id="rlHomeButton";b.type="button";b.className="family-shortcut";b.innerHTML="<span>🛵</span>Devenir livreur partenaire";b.addEventListener("click",()=>ouvrirSectionPleinEcran("recrutementLivreurs","Recrutement des livreurs"));popular.appendChild(b);}
function status(message,error=false){const el=document.getElementById("rlStatus");if(el){el.textContent=message;el.style.color=error?"#b42318":"#17663d";}}
document.getElementById("rlForm").addEventListener("submit",async e=>{
 e.preventDefault();const form=e.currentTarget,button=document.getElementById("rlSubmit");
 if(!document.getElementById("rlConsent").checked){status("Veuillez accepter l’utilisation de vos informations pour envoyer la préinscription.",true);return;}
 if(!window.db||!firebase.firestore){status("Le service d’enregistrement est indisponible. Réessayez plus tard.",true);return;}
 const v=id=>document.getElementById(id).value.trim();
 const data={nom:v("rlNom"),telephone:v("rlTelephone"),commune:v("rlCommune"),quartier:v("rlQuartier"),profil:v("rlProfil"),transport:v("rlTransport"),permis:v("rlPermis"),experience:v("rlExperience"),zones:v("rlZones"),types:v("rlTypes"),disponibilite:v("rlDisponibilite"),volume:v("rlVolume"),tarif:v("rlTarif")?Number(v("rlTarif")):null,revenuMinimum:v("rlMinimum")?Number(v("rlMinimum")):null,difficultes:v("rlDifficultes"),attentes:v("rlAttentes"),collaboration:v("rlCollaboration"),consentement:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),source:"formulaire_recrutement_site"};
 button.disabled=true;button.textContent="Envoi en cours…";status("");
 try{await db.collection("candidatures_livreurs").add(data);form.reset();status("Merci ! Votre préinscription a bien été enregistrée. L’équipe MON QUOTIDIEN CI pourra vous recontacter.");}
 catch(err){console.error("Préinscription livreur:",err);status("Impossible d’enregistrer votre réponse pour le moment. Vérifiez votre connexion puis réessayez.",true);}
 finally{button.disabled=false;button.textContent="Envoyer ma préinscription";}
});
async function chargerCandidatures(){
 const zone=document.getElementById("rlList");if(!zone)return;zone.textContent="Chargement…";
 try{const snap=await db.collection("candidatures_livreurs").limit(150).get();const docs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const ta=a.createdAt?.toMillis?.()||0,tb=b.createdAt?.toMillis?.()||0;return tb-ta;});
 if(!docs.length){zone.textContent="Aucune candidature pour le moment.";return;}
 zone.innerHTML=docs.map(d=>'<article class="rl-candidate"><strong>'+esc(d.nom)+'</strong> · '+esc(d.telephone)+'<br>📍 '+esc(d.commune)+' / '+esc(d.quartier||"—")+'<br>🛵 '+esc(d.transport)+' · '+esc(d.disponibilite)+'<br>Zones : '+esc(d.zones)+'<br>Expérience : '+esc(d.experience||"Non précisée")+'<br>Tarif : '+(d.tarif?esc(d.tarif.toLocaleString("fr-FR"))+" FCFA":"Non précisé")+'<br><strong>'+esc(d.collaboration)+'</strong></article>').join("");
 }catch(err){console.error(err);zone.textContent="Lecture des candidatures impossible : "+(err.message||"erreur");}
}
document.getElementById("rlRefresh").addEventListener("click",chargerCandidatures);
if(window.auth&&typeof ADMIN_UID!=="undefined"&&auth.currentUser?.uid===ADMIN_UID){document.getElementById("rlAdmin").hidden=false;chargerCandidatures();}
if(window.auth){auth.onAuthStateChanged(user=>{const admin=typeof ADMIN_UID!=="undefined"&&user?.uid===ADMIN_UID;document.getElementById("rlAdmin").hidden=!admin;if(admin)chargerCandidatures();});}
})();