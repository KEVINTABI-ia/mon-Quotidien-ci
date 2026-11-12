const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { ref, uploadBytes, getBytes, deleteObject } = require("firebase/storage");
const PROJECT_ID="mon-transport-ci-storage-rules-test", ADMIN_UID="3LpoTLyQdtVcdtnSMAJFc7Cvnpz2", OWNER_UID="storage-owner-test", OTHER_UID="storage-other-test";
let testEnv;
const jpeg=new Uint8Array([0xff,0xd8,0xff,0xd9]), metadata={contentType:"image/jpeg"};
describe("Mon Quotidien CI — règles Firebase Storage",function(){
 this.timeout(30000);
 before(async()=>{testEnv=await initializeTestEnvironment({projectId:PROJECT_ID,storage:{rules:readFileSync(resolve(__dirname,"..",process.env.STORAGE_RULES_FILE||"storage.rules"),"utf8")}});});
 after(async()=>{if(testEnv)await testEnv.cleanup();});
 it("autorise le propriétaire à déposer une photo privée mais lui interdit de la lire",async()=>{
  const photo=ref(testEnv.authenticatedContext(OWNER_UID).storage(),"declarations_enfants_privees/storage-owner-test/dossier-1/photo.jpg");
  await assertSucceeds(uploadBytes(photo,jpeg,metadata)); await assertFails(getBytes(photo));
 });
 it("interdit aux autres utilisateurs et visiteurs de lire une photo privée",async()=>{
  await testEnv.withSecurityRulesDisabled(async context=>{await uploadBytes(ref(context.storage(),"declarations_enfants_privees/storage-owner-test/dossier-2/photo.jpg"),jpeg,metadata);});
  const path="declarations_enfants_privees/storage-owner-test/dossier-2/photo.jpg";
  await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(),path)));
  await assertFails(getBytes(ref(testEnv.authenticatedContext(OTHER_UID).storage(),path)));
  await assertSucceeds(getBytes(ref(testEnv.authenticatedContext(ADMIN_UID).storage(),path)));
 });
 it("interdit à un utilisateur ordinaire de déposer une photo dans le dossier public",async()=>{
  await assertFails(uploadBytes(ref(testEnv.authenticatedContext(OWNER_UID).storage(),"declarations_enfants_publics/dossier-3/photo.jpg"),jpeg,metadata));
 });
 it("autorise l’administrateur à publier une photo et rend sa lecture publique",async()=>{
  const path="declarations_enfants_publics/dossier-4/photo.jpg";
  await assertSucceeds(uploadBytes(ref(testEnv.authenticatedContext(ADMIN_UID).storage(),path),jpeg,metadata));
  await assertSucceeds(getBytes(ref(testEnv.unauthenticatedContext().storage(),path)));
 });
 it("refuse les fichiers non image et les fichiers trop volumineux dans les zones privées",async()=>{
  const storage=testEnv.authenticatedContext(OWNER_UID).storage();
  await assertFails(uploadBytes(ref(storage,"declarations_enfants_privees/storage-owner-test/not-image/file.txt"),new Uint8Array([1,2,3]),{contentType:"text/plain"}));
  await assertFails(uploadBytes(ref(storage,"declarations_enfants_privees/storage-owner-test/too-large/photo.jpg"),new Uint8Array(8*1024*1024+1),metadata));
 });
 it("interdit définitivement la suppression des photos privées et publiques, même à l’administrateur",async()=>{
  const privatePath="declarations_enfants_privees/storage-owner-test/dossier-never-delete/never-delete-private.jpg";
  const publicPath="declarations_enfants_publics/dossier-never-delete/never-delete-public.jpg";
  await testEnv.withSecurityRulesDisabled(async context=>{
   await uploadBytes(ref(context.storage(),privatePath),jpeg,metadata);
   await uploadBytes(ref(context.storage(),publicPath),jpeg,metadata);
  });
  const actors=[
   testEnv.unauthenticatedContext().storage(),
   testEnv.authenticatedContext(OWNER_UID).storage(),
   testEnv.authenticatedContext(OTHER_UID).storage(),
   testEnv.authenticatedContext(ADMIN_UID).storage()
  ];
  for(const storage of actors){
   await assertFails(deleteObject(ref(storage,privatePath)));
   await assertFails(deleteObject(ref(storage,publicPath)));
  }
  await assertSucceeds(getBytes(ref(testEnv.authenticatedContext(ADMIN_UID).storage(),privatePath)));
  await assertSucceeds(getBytes(ref(testEnv.unauthenticatedContext().storage(),publicPath)));
 });
});
