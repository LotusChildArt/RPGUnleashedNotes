import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const PROJECT_URL='https://pxrbjtrbnvzjufsmcbza.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_kN3vgNYVPJTvpfMUL0QTXg_8U1mOExU';
const db=createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const bridge=window.RPGNotesBridge;
let roomId=null,owlRole='UNKNOWN',loggedInUser=null,linkedCampaign=null,lastSnapshot='',lastRevision='',saving=false,saveAgain=false,syncBlocked=false,cloudTimer=null,pollTimer=null;
const el=id=>document.getElementById(id);
const message=(text)=>{if(el('cloudStatus'))el('cloudStatus').textContent=text};
const remoteOnly=()=>owlRole==='PLAYER';
function setAuthUI(){
 const authorized=!!loggedInUser;
 el('cloudAuthForm')?.classList.toggle('hidden',authorized);
 el('cloudSignedIn')?.classList.toggle('hidden',!authorized);
 if(el('cloudAccount'))el('cloudAccount').textContent=loggedInUser?.email||'';
 if(el('cloudRoom'))el('cloudRoom').textContent=roomId||'Not inside Owlbear';
 if(el('cloudLinked'))el('cloudLinked').textContent=linkedCampaign?'Publishing campaign '+linkedCampaign:'No campaign linked in this browser';
}
async function refreshAuth(){
 const {data,error}=await db.auth.getUser();
 loggedInUser=error?null:data.user;
 setAuthUI();
 if(loggedInUser&&owlRole==='GM')await findRoomCampaign();
}
async function findRoomCampaign(){
 if(!loggedInUser||!roomId)return;
 const {data,error}=await db.from('campaign_documents').select('id,payload').eq('room_id',roomId).maybeSingle();
 if(error){message('Cloud read error: '+error.message);return}
 if(!data){linkedCampaign=null;syncBlocked=false;setAuthUI();return}
 linkedCampaign=data.id;syncBlocked=false;setAuthUI();
 const local=bridge.getCampaignById(data.id);
 if(!local){bridge.installCloudCampaign(data.payload);message('Loaded the campaign linked to this Owlbear room.');}
 else if(JSON.stringify(local)!==JSON.stringify(data.payload)){syncBlocked=true;message('Cloud updates paused: your local and cloud copies differ. Use Load Cloud Campaigns to choose a copy, or Publish Current Campaign to intentionally replace the cloud copy.');}
 else message('Campaign connected to this Owlbear room.');
}
async function push(){
 if(saving){saveAgain=true;return}
 if(!loggedInUser||owlRole!=='GM'||!linkedCampaign||syncBlocked)return;
 const campaign=bridge.getCampaignById(linkedCampaign);
 if(!campaign)return;
 saving=true;
 const {error}=await db.from('campaign_documents').update({payload:campaign}).eq('id',linkedCampaign);
 saving=false;
 if(error)message('Sync failed; local backup retained: '+error.message);
 else message('Saved to Supabase. Players receive published updates automatically.');
 if(saveAgain){saveAgain=false;schedulePush()}
}
function schedulePush(){
 if(remoteOnly()||!linkedCampaign||!loggedInUser||syncBlocked)return;
 clearTimeout(cloudTimer);cloudTimer=setTimeout(push,950);
}
window.rpgScheduleCloudSave=schedulePush;
async function publish(){
 if(owlRole!=='GM'||!roomId)return message('Open RPGUnleashedNotes as the GM inside an Owlbear room.');
 if(!loggedInUser)return message('Sign in to your GM account first.');
 const campaign=bridge.getActiveCampaign();
 if(!campaign)return message('Open a campaign before publishing.');
 if(!confirm('Publish "'+campaign.name+'" to this Owlbear room? This replaces the room’s published player information with a sanitized version of this campaign. A local JSON backup will be downloaded first.'))return;
 bridge.exportBackup();
 const {data:existing,error:lookupError}=await db.from('campaign_documents').select('id').eq('room_id',roomId).maybeSingle();
 if(lookupError)return message('Could not verify room ownership: '+lookupError.message);
 if(existing&&existing.id!==campaign.id){
  if(!confirm('Another campaign you own is linked to this room. Switch the room to "'+campaign.name+'"?'))return;
  const {error:unlinkError}=await db.from('campaign_documents').update({room_id:null}).eq('id',existing.id);
  if(unlinkError)return message('Could not unlink the old campaign: '+unlinkError.message);
 }
 const {error}=await db.from('campaign_documents').upsert({id:campaign.id,owner_id:loggedInUser.id,room_id:roomId,payload:campaign},{onConflict:'id'});
 if(error)return message('Could not link campaign: '+error.message);
 linkedCampaign=campaign.id;syncBlocked=false;setAuthUI();message('Published! Later edits will automatically sync to Supabase.');
}
async function loadOwned(){
 if(!loggedInUser)return message('Sign in before loading campaigns.');
 const {data,error}=await db.from('campaign_documents').select('id,payload,updated_at').order('updated_at',{ascending:false});
 if(error)return message('Could not load campaigns: '+error.message);
 if(!data?.length)return message('No campaigns are saved in this Supabase account yet.');
 bridge.exportBackup();
 let imported=0;
 for(const entry of data){
  const local=bridge.getCampaignById(entry.id);
  if(local&&JSON.stringify(local)!==JSON.stringify(entry.payload)&&!confirm('Replace the local copy of "'+(local.name||entry.payload.name)+'" with its cloud copy? A local JSON backup has just been downloaded.'))continue;
  bridge.installCloudCampaign(entry.payload);if(entry.id===linkedCampaign)syncBlocked=false;imported++;
 }
 message(imported+' campaign(s) loaded from Supabase. Your local backup was downloaded first.');
 if(roomId)await findRoomCampaign();
}
async function refreshPlayer(){
 if(!roomId||owlRole!=='PLAYER')return;
 const {data,error}=await db.rpc('get_player_snapshot',{requested_room_id:roomId});
 if(error){message('Unable to load shared campaign: '+error.message);bridge.showPlayerMessage('Cannot load shared campaign.');return}
 if(!data){bridge.showPlayerMessage('Waiting for the GM to publish a campaign to this room.');return}
 const revision=JSON.stringify(data);
 if(revision!==lastSnapshot){lastSnapshot=revision;bridge.installPlayerSnapshot(data)}
}
async function roleChanged(nextRole){
 const role=nextRole==='GM'?'GM':'PLAYER';
 if(role===owlRole)return;
 owlRole=role;
 if(pollTimer){clearInterval(pollTimer);pollTimer=null}
 linkedCampaign=null;syncBlocked=false;
 bridge.applyOwlRole(role);
 setAuthUI();
 if(role==='PLAYER'){
  await refreshPlayer();
  pollTimer=setInterval(refreshPlayer,6000);
 }else{
  await refreshAuth();
 }
}
function wireAuth(){
 el('cloudSignIn')?.addEventListener('click',async()=>{
  const email=el('cloudEmail').value.trim(),password=el('cloudPassword').value;
  if(!email||!password)return message('Enter your email and password.');
  message('Signing in...');
  const {error}=await db.auth.signInWithPassword({email,password});
  el('cloudPassword').value='';
  if(error)return message(error.message);
  await refreshAuth();message('Signed in. You can link the active campaign to Owlbear.');
 });
 el('cloudSignUp')?.addEventListener('click',async()=>{
  const email=el('cloudEmail').value.trim(),password=el('cloudPassword').value;
  if(!email||password.length<6)return message('Enter an email and password of at least six characters.');
  const {error,data}=await db.auth.signUp({email,password});
  el('cloudPassword').value='';
  if(error)return message(error.message);
  await refreshAuth();
  message(data.session?'Account created and signed in.':'Account created. Confirm your email through Supabase before signing in.');
 });
 el('cloudSignOut')?.addEventListener('click',async()=>{
  await db.auth.signOut();loggedInUser=null;linkedCampaign=null;syncBlocked=false;setAuthUI();message('Signed out of Supabase. Local campaigns are still in this browser.');
 });
 el('cloudPublish')?.addEventListener('click',publish);
 el('cloudLoad')?.addEventListener('click',loadOwned);
 el('cloudExport')?.addEventListener('click',()=>bridge.exportBackup());
 el('cloudImport')?.addEventListener('click',()=>{if(owlRole==='PLAYER'||owlRole==='UNKNOWN')return;el('cloudImportFile')?.click()});
 el('cloudImportFile')?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   const backup=JSON.parse(await file.text());
   if(!confirm('Import campaigns from '+file.name+'? Existing campaigns with matching IDs will ask before replacement.'))return;
   bridge.exportBackup();
   const count=bridge.importBackup(backup);
   message(count+' campaign(s) imported locally. Use Publish Current Campaign to Room when ready.');
  }catch(error){message('Backup import failed: '+error.message)}
  finally{event.target.value=''}
 });
 db.auth.onAuthStateChange((event,session)=>{
  loggedInUser=session?.user||null;setAuthUI();
 });
}
async function initialize(){
 wireAuth();
 if(!OBR.isAvailable){
  owlRole='LOCAL';setAuthUI();await refreshAuth();
  message('Standalone mode: local campaigns are available. Open inside Owlbear as GM to link a room.');
  return;
 }
 OBR.onReady(async()=>{
  try{
   roomId=OBR.room.id;setAuthUI();
   await roleChanged(await OBR.player.getRole());
   OBR.player.onChange(async player=>{if(player?.role)await roleChanged(player.role)});
  }catch(error){message('Owlbear integration failed: '+error.message);bridge.applyOwlRole('PLAYER');}
 });
}
initialize().catch(error=>message('Cloud initialization error: '+error.message));