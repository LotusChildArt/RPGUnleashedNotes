import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const PROJECT_URL='https://pxrbjtrbnvzjufsmcbza.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_kN3vgNYVPJTvpfMUL0QTXg_8U1mOExU';
const ENDPOINT=PROJECT_URL+'/functions/v1/credential-campaign';
const CREDS_KEY='RPGUnleashedNotes.credentials.v1';
const db=createClient(PROJECT_URL,PUBLISHABLE_KEY);
const bridge=window.RPGNotesBridge;
const THEME_META_KEY='com.lotuschild.rpgunleashednotes/theme';
window.rpgSaveOwlPreferences=async theme=>{
 if(!OBR.isAvailable||!['light','dark'].includes(theme))return;
 try{await OBR.player.setMetadata({[THEME_META_KEY]:theme})}
 catch(e){console.warn('Owlbear appearance preference unavailable',e)}
};
async function restoreOwlAppearance(){
 try{
  const metadata=await OBR.player.getMetadata();
  const theme=metadata?.[THEME_META_KEY];
  if(theme==='dark'||theme==='light')bridge.applyOwlAppearance(theme);
 }catch(e){console.warn('Unable to restore Owlbear appearance preference',e)}
}

const el=id=>document.getElementById(id);
let roomId=null,owlRole='UNKNOWN',linkedCampaign=null,linkedVersion=null,saveTimer=null,saving=false,saveAgain=false,blocked=false,pollTimer=null,lastPlayerSnapshot='';

const ACTIVITY_CHANNEL='com.lotuschild.rpgunleashednotes/activity-v1';
let syncReference=null;
const label=(value,fallback)=>String(value||fallback).trim().slice(0,120);
function diffPublishedActivity(previous,next){
 if(!previous||!next||previous.id!==next.id)return [];
 const events=[],emit=(kind,message)=>events.push({kind,message});
 const priorPlaces=new Map((previous.places||[]).map(p=>[p.id,p]));
 const priorQuests=new Map((previous.quests||[]).map(q=>[q.id,q]));
 const nextQuests=new Map((next.quests||[]).map(q=>[q.id,q]));
 for(const place of next.places||[]){
  if(place.discovered===true && priorPlaces.get(place.id)?.discovered!==true)
   emit('place-discovered','New Place Discovered: '+label(place.name,'Unknown location'));
  const earlier=new Set((priorPlaces.get(place.id)?.questBoard||[]).filter(x=>!x.closed).map(x=>x.questId));
  for(const posting of place.questBoard||[]){
   if(posting.closed||earlier.has(posting.questId))continue;
   const quest=nextQuests.get(posting.questId);
   if(quest)emit('quest-posted','New Quest Available: '+label(quest.title,'Untitled quest'));
  }
 }
 for(const quest of next.quests||[]){
  const old=priorQuests.get(quest.id);
  if(old?.status!=='Completed'&&quest.status==='Completed')
   emit('objective-completed','Quest Completed: '+label(quest.title,'Untitled quest'));
  const priorObjectives=new Map((old?.objectives||[]).map(o=>[o.id,o]));
  for(const objective of quest.objectives||[]){
   const prev=priorObjectives.get(objective.id);
   const visible=objective.revealed===true;
   const name=label(objective.title||objective.text,'Untitled objective');
   if(visible&&prev?.revealed!==true)emit('objective-revealed','New Objective Revealed: '+name);
   if(visible&&objective.progress==='Current'&&prev?.progress!=='Current')emit('objective-current','New Objective Now Active: '+name);
   if(visible&&objective.progress==='Completed'&&prev?.progress!=='Completed')emit('objective-completed','Objective Completed: '+name);
  }
 }
 const oldEntries=new Set((previous.entries||[]).map(n=>n.id));
 const additions=(next.entries||[]).filter(n=>n.id&&!oldEntries.has(n.id));
 if(additions.length)emit('session-journal',additions.length===1?'Session Journal Updated: '+label(additions[0].title,'New entry'):'Session Journal Updated: '+additions.length+' new entries');
 return events;
}
async function broadcastActivities(events){
 if(!roomId||!OBR.isReady||!events?.length)return;
 const unique=[...new Map(events.map(e=>[e.kind+'|'+e.message,e])).values()];
 try{
  await OBR.broadcast.sendMessage(ACTIVITY_CHANNEL,{
   version:1,roomId,actorId:OBR.player.id,eventId:crypto.randomUUID(),
   events:unique.slice(0,25)
  },{destination:'ALL'});
 }catch(error){console.warn('RPG Unleashed activity announcement failed',error)}
}
function nameForTarget(kind,id){
 const campaign=bridge.getActiveCampaign();
 const array=kind==='person'?campaign?.people:kind==='place'?campaign?.places:campaign?.quests;
 const match=array?.find(item=>item.id===id);
 return label(kind==='quest'?match?.title:match?.name,kind==='person'?'Person':kind==='place'?'Location':'Quest');
}
function commentActivity(kind,id,parentId=false){
 const name=nameForTarget(kind,id);
 if(parentId)return {kind:'note-reply',message:'New Reply: '+name};
 return {kind:kind==='person'?'people-note':kind==='place'?'place-note':'quest-note',
  message:(kind==='person'?'People':kind==='place'?'Place':'Quest')+' Note Updated: '+name};
}

let credentials={};
try{const stored=JSON.parse(localStorage.getItem(CREDS_KEY)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))credentials=stored}catch{}
const msg=s=>{if(el('cloudStatus'))el('cloudStatus').textContent=s};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const cleanCampaign=c=>{if(!c||typeof c!=='object')return c;const copy=bridge.normalizeBoardCampaign(c);delete copy.acceptedQuestIds;delete copy.partyQuestNotes;delete copy.sharedNotes;return copy};
const same=(a,b)=>JSON.stringify(canonical(cleanCampaign(a)))===JSON.stringify(canonical(cleanCampaign(b)));
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
   const remote=await readCloud(id,entry.key,false);
   if(remote.roomId!==roomId)continue;
   const local=bridge.getCampaignById(id);
   if(local&&!same(local,remote.campaign)){blocked=true;msg('Local and cloud copies differ. Download a backup and select Restore Cloud Campaign or Publish / Link to choose which one to keep.')}
   else if(!local)bridge.installCloudCampaign(remote.campaign);
   linkedCampaign=id;linkedVersion=remote.updatedAt;syncReference=cleanCampaign(remote.campaign);lastBoardRevision='';
   const needsBoardMigration=(remote.campaign.places||[]).some(p=>p.type!=='Quest Board'&&Array.isArray(p.questBoard)&&p.questBoard.length);
   if(needsBoardMigration&&!blocked)scheduleSave();
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
   const created=await request('create',campaign.id,key,{roomId,payload:cleanCampaign(campaign)});
   credentials[campaign.id]={key,name:campaign.name,createdAt:new Date().toISOString()};
   linkedCampaign=campaign.id;linkedVersion=created.updatedAt;syncReference=cleanCampaign(campaign);blocked=false;lastBoardRevision='';
   let savedLocally=true,downloaded=true;
   try{saveCredentials()}catch{savedLocally=false}
   try{downloadRecovery(campaign.id)}catch{downloaded=false}
   status();
   msg(savedLocally&&downloaded?'Campaign published. Recovery file downloaded; keep it private and backed up.':'CAMPAIGN PUBLISHED. Your browser could not safely save or download the recovery key. Use Download Recovery File NOW before closing the page.');
  }catch(error){msg('Could not publish: '+error.message)}
  return;
 }
 try{
  const remote=await request('read',campaign.id,known.key);
  const priorPublished=cleanCampaign(remote.campaign);
  const different=!same(remote.campaign,campaign);
  const legacyBoard=(remote.campaign.places||[]).some(p=>p.type!=='Quest Board'&&Array.isArray(p.questBoard)&&p.questBoard.length);
  if(different||legacyBoard){
   if(different){
    if(!confirm('Your browser and cloud copies differ. Replace the CLOUD version with your current LOCAL campaign? A JSON backup will be downloaded first.'))return;
    bridge.exportBackup();
   }
   const written=await request('write',campaign.id,known.key,{payload:cleanCampaign(campaign),expectedUpdatedAt:remote.updatedAt});
   linkedVersion=written.updatedAt;
  }else linkedVersion=remote.updatedAt;
  if(remote.roomId!==roomId){
   if(!confirm('Link this campaign to the current Owlbear room? It will no longer publish to its previous room.'))return;
   const linked=await request('link',campaign.id,known.key,{roomId});
   linkedVersion=linked.updatedAt;
  }
  linkedCampaign=campaign.id;blocked=false;syncReference=cleanCampaign(campaign);lastBoardRevision='';status();await refreshBoardActivity();if(different&&remote.roomId===roomId)await broadcastActivities(diffPublishedActivity(priorPublished,syncReference));msg('Campaign linked. Future changes sync automatically.');
 }catch(error){msg('Could not link campaign: '+error.message)}
}
async function push(){
 if(saving){saveAgain=true;return}
 if(blocked||owlRole!=='GM'||!linkedCampaign||!linkedVersion)return;
 const c=bridge.getCampaignById(linkedCampaign),entry=credentials[linkedCampaign];
 if(!c||!entry)return;
 saving=true;
 try{
  const nextPayload=cleanCampaign(c);
  const result=await request('write',linkedCampaign,entry.key,{payload:nextPayload,expectedUpdatedAt:linkedVersion});
  const events=diffPublishedActivity(syncReference,nextPayload);
  linkedVersion=result.updatedAt;syncReference=nextPayload;msg('Changes saved. Players will see the published information shortly.');
  await broadcastActivities(events);
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
  syncReference=cleanCampaign(data.campaign);
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
 if(owlRole==='GM')await restoreRecoveryById(content.campaignId,remote);
}
async function restoreRecoveryById(id,remote){
 const local=bridge.getCampaignById(id);
 if(local&&!same(local,remote.campaign)){
  if(!confirm('This computer has a different local copy of "'+(local.name||'the campaign')+'". Replace it with the cloud copy? A JSON backup will be downloaded first.')){
   blocked=true;
   if(remote.roomId===roomId){linkedCampaign=id;linkedVersion=remote.updatedAt;}
   msg('Recovery key imported. Local version retained. Choose Restore Cloud Campaign to load the cloud version.');return;
  }
  bridge.exportBackup();
 }
 blocked=true;
 bridge.installCloudCampaign(remote.campaign);
 syncReference=cleanCampaign(remote.campaign);
 if(remote.roomId===roomId){linkedCampaign=id;linkedVersion=remote.updatedAt;}
 else {linkedCampaign=null;linkedVersion=null;}
 blocked=false;status();
 msg(remote.roomId===roomId?'Recovery imported; campaign connected to this room.':'Recovery imported and cloud campaign restored. Use Publish / Link to associate it with this room.');
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
  let safe=true;try{saveCredentials()}catch{safe=false}
  try{downloadRecovery(id)}catch{safe=false}
  msg(safe?'Recovery key replaced; old key revoked. Keep the new recovery file safely.':'NEW KEY IS ACTIVE, but automatic saving or download failed. Use Download Recovery File NOW before leaving this page.');
 }catch(error){msg('Key rotation failed; the previous key is unchanged: '+error.message)}
}

let lastBoardRevision='';
async function refreshBoardActivity(force=false){
 if(!roomId||owlRole!=='GM'||!linkedCampaign)return;
 const {data,error}=await db.rpc('get_player_snapshot',{requested_room_id:roomId});
 if(error||!data||data.id!==linkedCampaign)return;
 const revision=JSON.stringify([data.acceptedQuestIds||[],data.sharedNotes||[]]);
 if(force||revision!==lastBoardRevision){lastBoardRevision=revision;bridge.applyBoardUpdates(data)}
}
window.rpgRefreshSharedActivity=()=>refreshBoardActivity(true);

window.rpgDeleteSharedNote=async noteId=>{
 if(!roomId||!(owlRole==='PLAYER'||owlRole==='GM'))throw Error('Open inside an Owlbear room to delete shared notes.');
 const {data,error}=await db.rpc('delete_room_shared_note',{requested_room_id:roomId,requested_note_id:noteId});
 if(error)throw Error(error.message);
 if(data!==true)throw Error('Note could not be deleted or was already removed.');
 await broadcastActivities([{kind:'note-deleted',message:'Shared Notes Updated'}]);
 if(owlRole==='PLAYER')await refreshPlayer();else await refreshBoardActivity(true);
};
window.rpgPostSharedNote=async (kind,type,targetId,title,author,body,parentId=null,mentions=[])=>{
 if(!roomId||!(owlRole==='PLAYER'||owlRole==='GM'))throw Error('Open RPGUnleashedNotes inside an Owlbear room.');
 if(kind!=='comment'&&kind!=='journal')throw Error('Invalid note type.');
 if(typeof body!=='string'||!body.trim()||body.length>2000)throw Error('Note must be between 1 and 2000 characters.');
 const {data,error}=await db.rpc('post_room_shared_note_v2',{
  requested_room_id:roomId,
  requested_kind:kind,
  requested_target_type:kind==='comment'?type:null,
  requested_target_id:kind==='comment'?targetId:null,
  note_title:typeof title==='string'?title:'',
  note_author:(typeof author==='string'&&author.trim()?author.trim():'Player').slice(0,60),
  note_body:body.trim(),
  note_parent_id:parentId||null,
  note_mentions:Array.isArray(mentions)?mentions.slice(0,30).map(m=>({type:m.type,id:m.id,start:m.start,end:m.end})):[]
 });
 if(error)throw Error(error.message);
 if(data!==true)throw Error('This note could not be posted. Verify that the campaign is published, then try again.');
 await broadcastActivities([kind==='journal'?{kind:'session-journal',message:'Session Journal Updated: '+label(title,'New entry')}:commentActivity(type,targetId,!!parentId)]);
 if(owlRole==='PLAYER')await refreshPlayer();else await refreshBoardActivity();
};

window.rpgAcceptBoardQuest=async questId=>{
 if(owlRole!=='PLAYER'||!roomId)throw Error('Only players in an Owlbear room can accept a party quest.');
 const {data,error}=await db.rpc('accept_board_quest',{requested_room_id:roomId,requested_quest_id:questId});
 if(error)throw Error(error.message);
 if(data!==true)throw Error('This posting is no longer available.');
 await broadcastActivities([{kind:'quest-accepted',message:'Quest Accepted: '+nameForTarget('quest',questId)}]);
 await refreshPlayer();
};

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
 pollTimer=null;linkedCampaign=null;linkedVersion=null;syncReference=null;blocked=false;lastPlayerSnapshot='';
 bridge.applyOwlRole(next);status();
 if(next==='PLAYER'){
  await refreshPlayer();pollTimer=setInterval(refreshPlayer,6000);
 }else {await recognizeRoom();await refreshBoardActivity();pollTimer=setInterval(refreshBoardActivity,6000)}
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
   bridge.exportBackup();if(linkedCampaign)blocked=true;
   const count=bridge.importBackup(backup);
   msg(count+' campaign(s) imported locally. Automatic cloud writes are paused until you intentionally Publish / Link the campaign again.');
  }catch(error){msg('Campaign backup import failed: '+error.message)}
  finally{event.target.value=''}
 });
 // "Restore Cloud Campaign" also allows selecting a JSON recovery file
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
   await restoreOwlAppearance();
   await roleChanged(await OBR.player.getRole());
   OBR.player.onChange(player=>{if(player?.role)roleChanged(player.role).catch(e=>msg(e.message))});
  }catch(error){bridge.applyOwlRole('PLAYER');msg('Owlbear connection failed: '+error.message)}
 });
}
init().catch(error=>msg('Cannot initialize cloud storage: '+error.message));