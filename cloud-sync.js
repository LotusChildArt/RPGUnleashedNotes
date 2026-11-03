import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const PROJECT_URL='https://pxrbjtrbnvzjufsmcbza.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_kN3vgNYVPJTvpfMUL0QTXg_8U1mOExU';
const ENDPOINT=PROJECT_URL+'/functions/v1/credential-campaign';
const CREDS_KEY='RPGUnleashedNotes.credentials.v1';
const db=createClient(PROJECT_URL,PUBLISHABLE_KEY);
const bridge=window.RPGNotesBridge;
const el=id=>document.getElementById(id);
let roomId=null,owlRole='UNKNOWN',linkedCampaign=null,linkedVersion=null,saveTimer=null,saving=false,saveAgain=false,blocked=false,pollTimer=null,lastPlayerSnapshot='';
let credentials={};
try{const stored=JSON.parse(localStorage.getItem(CREDS_KEY)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))credentials=stored}catch{}
const msg=s=>{if(el('cloudStatus'))el('cloudStatus').textContent=s};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const validKey=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{43}$/.test(k);
const saveCredentials=()=>localStorage.setItem(CREDS_KEY,JSON.stringify(credentials));
const generateKey=()=>{
 const random=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...random)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
};
function download(name,value){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function recoveryFile(campaignId){
 const campaign=bridge.getCampaignById(campaignId);
 const entry=credentials[campaignId];
 if(!entry||!validKey(entry.key))throw Error('No recovery key for this campaign');
 return {app:'RPGUnleashedNotes',type:'campaign-recovery',version:1,campaign:campaign?.name||entry.name||'',campaignId,recoveryKey:entry.key,createdAt:entry.createdAt||new Date().toISOString()};
}
function downloadRecovery(id){const doc=recoveryFile(id);download((doc.campaign||'Campaign').replace(/[^a-z0-9_-]/gi,'_')+'-RECOVERY.json',doc)}
async function request(action,campaignId,key,fields={}){
 let response;
 try{
  response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY},body:JSON.stringify({action,campaignId,key,...fields}),cache:'no-store'});
 }catch{throw Error('Cannot reach Supabase right now. Your local data is intact.')}
 let body={};try{body=await response.json()}catch{}
 if(!response.ok)throw Error(body.error||'Cloud request failed ('+response.status+')');
 return body;
}
function status(){
 if(el('cloudRoom'))el('cloudRoom').textContent=roomId||'Not inside an Owlbear room';
 const active=bridge.getActiveCampaign();
 const id=active?.id||linkedCampaign;
 if(el('cloudLinked'))el('cloudLinked').textContent=id&&credentials[id]?
  'Recovery credential stored for '+(active?.name||credentials[id].name||'this campaign')+(linkedCampaign===id?' · connected to room':'') :
  'No recovery credential for this campaign yet';
 el('cloudRecoveryDownload')?.classList.toggle('hidden',!id||!credentials[id]);
 el('cloudRotate')?.classList.toggle('hidden',!id||!credentials[id]);
}
const activeCredential=()=>{
 const active=bridge.getActiveCampaign();
 const id=active?.id||linkedCampaign;
 return id&&credentials[id]?{id,key:credentials[id].key}:null;
};
async function readCloud(id,key,shouldInstall=true){
 const remote=await request('read',id,key);
 if(shouldInstall){
  const local=bridge.getCampaignById(id);
  if(local&&!same(local,remote.campaign)){
   blocked=true;
   msg('This browser has a different campaign copy. Download a campaign backup, then choose Restore Cloud Campaign or republish intentionally.');
  }else if(!local){bridge.installCloudCampaign(remote.campaign)}
 }
 return remote;
}
async function recognizeRoom(){
 if(owlRole!=='GM'||!roomId)return;
 for(const [id,entry] of Object.entries(credentials)){
  if(!validKey(entry?.key))continue;
  try{
   const remote=await readCloud(id,entry.key,true);
   if(remote.roomId!==roomId)continue;
   linkedCampaign=id;linkedVersion=remote.updatedAt;
   status();
   if(!blocked)msg('Campaign connected. Changes sync to your room.');
   return;
  }catch{}
 }
 status();msg('No campaign linked in this browser. Open a campaign and choose Publish / Link This Campaign, or import a recovery file.');
}
async function publish(){
 if(owlRole!=='GM'||!roomId)return msg('Open this extension as the GM inside an Owlbear room.');
 const campaign=bridge.getActiveCampaign();
 if(!campaign)return msg('Open a campaign first.');
 const known=credentials[campaign.id];
 if(!known){
  if(!confirm('Publish "'+campaign.name+'" to this room? A secret recovery file will download. SAVE IT: losing your browser data and this file can permanently lose access to the cloud campaign.'))return;
  bridge.exportBackup();
  const key=generateKey();
  try{
   const created=await request('create',campaign.id,key,{roomId,payload:campaign});
   credentials[campaign.id]={key,name:campaign.name,createdAt:new Date().toISOString()};
   saveCredentials();
   linkedCampaign=campaign.id;linkedVersion=created.updatedAt;blocked=false;
   downloadRecovery(campaign.id);
   status();msg('Campaign published. Recovery file downloaded; keep it private and backed up.');
  }catch(error){msg('Could not publish: '+error.message)}
  return;
 }
 try{
  const remote=await request('read',campaign.id,known.key);
  if(!same(remote.campaign,campaign)){
   if(!confirm('Your browser and cloud copies differ. Replace the CLOUD version with your current LOCAL campaign? A JSON backup will be downloaded first.'))return;
   bridge.exportBackup();
   const written=await request('write',campaign.id,known.key,{payload:campaign,expectedUpdatedAt:remote.updatedAt});
   linkedVersion=written.updatedAt;
  }else linkedVersion=remote.updatedAt;
  if(remote.roomId!==roomId){
   if(!confirm('Link this campaign to the current Owlbear room? It will no longer publish to its previous room.'))return;
   const linked=await request('link',campaign.id,known.key,{roomId});
   linkedVersion=linked.updatedAt;
  }
  linkedCampaign=campaign.id;blocked=false;status();msg('Campaign linked. Future changes sync automatically.');
 }catch(error){msg('Could not link campaign: '+error.message)}
}
async function push(){
 if(saving){saveAgain=true;return}
 if(blocked||owlRole!=='GM'||!linkedCampaign||!linkedVersion)return;
 const c=bridge.getCampaignById(linkedCampaign),entry=credentials[linkedCampaign];
 if(!c||!entry)return;
 saving=true;
 try{
  const result=await request('write',linkedCampaign,entry.key,{payload:c,expectedUpdatedAt:linkedVersion});
  linkedVersion=result.updatedAt;msg('Changes saved. Players will see the published information shortly.');
 }catch(error){blocked=true;msg('Sync paused: '+error.message+' Local campaign was not deleted.')}
 finally{saving=false;}
 if(saveAgain){saveAgain=false;if(!blocked)scheduleSave()}
}
function scheduleSave(){
 if(owlRole!=='GM'||!linkedCampaign||blocked)return;
 clearTimeout(saveTimer);saveTimer=setTimeout(push,1000);
}
window.rpgScheduleCloudSave=scheduleSave;
async function restoreRecovery(){
 const credential=activeCredential();
 if(!credential)return msg('Import a recovery file first, or open a campaign with a saved credential.');
 try{
  const data=await readCloud(credential.id,credential.key,false);
  const local=bridge.getCampaignById(credential.id);
  if(local&&!same(local,data.campaign)){
   if(!confirm('Replace your LOCAL copy of "'+(local.name||data.campaign.name)+'" with the cloud version? A JSON backup will be downloaded first.'))return;
   bridge.exportBackup();
  }
  blocked=true; // prevent saving until fully imported
  bridge.installCloudCampaign(data.campaign);
  if(data.roomId===roomId){linkedCampaign=credential.id;linkedVersion=data.updatedAt;}
  else if(linkedCampaign===credential.id){linkedCampaign=null;linkedVersion=null;}
  blocked=false;status();msg('Cloud campaign restored. A backup of the previous local data was downloaded if needed.');
 }catch(error){msg('Cannot restore cloud campaign: '+error.message)}
}
async function importRecovery(file){
 const content=JSON.parse(await file.text());
 if(content?.app!=='RPGUnleashedNotes'||content?.type!=='campaign-recovery'||content?.version!==1||typeof content.campaignId!=='string'||!validKey(content.recoveryKey))throw Error('Not a valid RPGUnleashedNotes recovery file');
 const remote=await request('read',content.campaignId,content.recoveryKey);
 if(credentials[content.campaignId]&&!confirm('Replace the recovery credential already stored for this campaign?'))return;
 credentials[content.campaignId]={key:content.recoveryKey,name:remote.campaign?.name||content.campaign,createdAt:content.createdAt};
 saveCredentials();
 status();msg('Recovery key accepted. Choose Restore Cloud Campaign to retrieve the campaign.');
 if(owlRole==='GM'&&remote.roomId===roomId)await restoreRecoveryById(content.campaignId,remote);
}
async function restoreRecoveryById(id,remote){
 const local=bridge.getCampaignById(id);
 if(local&&!same(local,remote.campaign)){
  blocked=true;msg('Recovery key imported, but your local campaign differs. Select Restore Cloud Campaign to choose a version.');return;
 }
 if(!local)bridge.installCloudCampaign(remote.campaign);
 linkedCampaign=id;linkedVersion=remote.updatedAt;blocked=false;status();
 msg('Recovery file imported. Campaign connected to this room.');
}
async function rotate(){
 if(owlRole!=='GM')return msg('Only Owlbear GMs can rotate campaign recovery credentials in the app.');
 const id=activeCredential()?.id;
 if(!id)return msg('Open a campaign that has a recovery credential.');
 if(!confirm('Replace this campaign’s recovery key? The OLD recovery JSON will stop working immediately. Download and safeguard the NEW recovery file.'))return;
 const oldKey=credentials[id].key,newKey=generateKey();
 try{
  await request('rotate',id,oldKey,{newKey});
  credentials[id].key=newKey;credentials[id].createdAt=new Date().toISOString();
  saveCredentials();downloadRecovery(id);msg('Recovery key replaced; the old key is revoked. Store the new recovery file safely.');
 }catch(error){msg('Key rotation failed; the previous key is unchanged: '+error.message)}
}
async function refreshPlayer(){
 if(owlRole!=='PLAYER'||!roomId)return;
 const {data,error}=await db.rpc('get_player_snapshot',{requested_room_id:roomId});
 if(error)return bridge.showPlayerMessage('Unable to load campaign right now.');
 if(!data)return bridge.showPlayerMessage('Waiting for the GM to publish a campaign.');
 const revision=JSON.stringify(data);
 if(revision!==lastPlayerSnapshot){lastPlayerSnapshot=revision;bridge.installPlayerSnapshot(data)}
}
async function roleChanged(role){
 const next=role==='GM'?'GM':'PLAYER';
 if(owlRole===next)return;
 owlRole=next;
 clearTimeout(saveTimer);if(pollTimer)clearInterval(pollTimer);
 pollTimer=null;linkedCampaign=null;linkedVersion=null;blocked=false;lastPlayerSnapshot='';
 bridge.applyOwlRole(next);status();
 if(next==='PLAYER'){
  await refreshPlayer();pollTimer=setInterval(refreshPlayer,6000);
 }else await recognizeRoom();
}
function wire(){
 el('cloudPublish')?.addEventListener('click',publish);
 el('cloudRecoveryDownload')?.addEventListener('click',()=>{
  try{const credential=activeCredential();if(!credential)throw Error('Open a campaign with a recovery key');downloadRecovery(credential.id)}
  catch(error){msg(error.message)}
 });
 el('cloudRestore')?.addEventListener('click',restoreRecovery);
 el('cloudRotate')?.addEventListener('click',rotate);
 el('cloudExport')?.addEventListener('click',()=>bridge.exportBackup());
 el('cloudImport')?.addEventListener('click',()=>el('cloudImportFile')?.click());
 el('cloudImportFile')?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   const backup=JSON.parse(await file.text());
   if(!confirm('Import campaigns from '+file.name+'? Local duplicates will ask before replacement.'))return;
   bridge.exportBackup();const count=bridge.importBackup(backup);
   msg(count+' campaign(s) imported locally. Publish or link the desired campaign when ready.');
  }catch(error){msg('Campaign backup import failed: '+error.message)}
  finally{event.target.value=''}
 });
 // "Restore Cloud Campaign" also allows selecting a JSON recovery file
 el('cloudRestore')?.addEventListener('contextmenu',event=>{event.preventDefault();el('cloudRecoveryFile')?.click()});
 const uploadButton=document.createElement('button');
 uploadButton.textContent='Import Recovery File';
 uploadButton.id='cloudRecoveryImportButton';
 uploadButton.addEventListener('click',()=>el('cloudRecoveryFile')?.click());
 el('cloudRestore')?.insertAdjacentElement('afterend',uploadButton);
 el('cloudRecoveryFile')?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{await importRecovery(file)}catch(error){msg('Recovery import failed: '+error.message)}
  finally{event.target.value=''}
 });
 document.querySelectorAll('[data-open]').forEach(()=>{});
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-open]'))setTimeout(status,40);
 });
}
async function init(){
 wire();status();
 if(!OBR.isAvailable){owlRole='LOCAL';status();msg('Standalone mode: local campaigns work without an account. Open Owlbear to publish and sync.');return}
 OBR.onReady(async()=>{
  try{
   roomId=OBR.room.id;
   await roleChanged(await OBR.player.getRole());
   OBR.player.onChange(player=>{if(player?.role)roleChanged(player.role).catch(e=>msg(e.message))});
  }catch(error){bridge.applyOwlRole('PLAYER');msg('Owlbear connection failed: '+error.message)}
 });
}
init().catch(error=>msg('Cannot initialize cloud storage: '+error.message));