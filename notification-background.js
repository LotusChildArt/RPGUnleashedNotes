import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const CHANNEL='com.lotuschild.rpgunleashednotes/activity-v1';
const seenIds=new Set();
const pending=[];
let flushTimer=null;
const allowedKinds=new Set([
 'quest-posted','quest-accepted','objective-revealed','objective-current','objective-completed',
 'place-discovered','people-note','place-note','quest-note','note-reply','note-deleted','session-journal'
]);

function queueNotification(message){
 pending.push(message);
 if(flushTimer!==null)return;
 flushTimer=setTimeout(async()=>{
  flushTimer=null;
  const items=pending.splice(0);
  if(!items.length)return;
  // Avoid spamming Owlbear when an edit updates multiple records at once.
  const distinct=[...new Set(items)];
  const displayed=distinct.length>4?[distinct.length+' RPG Unleashed Notes updates'] : distinct;
  for(const text of displayed){
   try{await OBR.notification.show(text,'INFO')}
   catch(error){console.warn('RPG Unleashed notification failed',error)}
  }
 },1250);
}

OBR.onReady(async()=>{
 let room,localId,role;
 try{
  room=OBR.room.id;
  localId=OBR.player.id;
  role=await OBR.player.getRole();
 }catch(error){
  console.warn('RPG Unleashed background notification setup failed',error);
  return;
 }
 OBR.player.onChange(player=>{if(player?.role)role=player.role});
 OBR.broadcast.onMessage(CHANNEL,event=>{
  const data=event?.data;
  if(!data||data.version!==1||data.roomId!==room||typeof data.eventId!=='string'||seenIds.has(data.eventId))return;
  seenIds.add(data.eventId);
  if(seenIds.size>500)seenIds.clear();
  // The GM always receives the notice, including for edits they made.
  if(role!=='GM'&&data.actorId===localId)return;
  if(!Array.isArray(data.events))return;
  for(const item of data.events.slice(0,25)){
   if(!item||!allowedKinds.has(item.kind)||typeof item.message!=='string')continue;
   if(item.message.length>0&&item.message.length<=220)queueNotification(item.message);
  }
 });
});

/*
 * Persistent NPC token deletion watcher.
 * The extension background remains mounted when the Notes popover closes.
 * Queue token deletions separately; the Notes foreground applies the changes
 * through its regular campaign save/sync path on the next visit.
 */
const NPC_STATE_KEY='RPGUnleashedNotes.v1';
const NPC_PENDING_KEY='RPGUnleashedNotes.pendingTokenDeletes.v1';
function trackedNPCs(roomId){
 try{
  const saved=JSON.parse(localStorage.getItem(NPC_STATE_KEY)||'{}');
  return (saved.campaigns||[]).flatMap(c=>c.combatants||[])
   .map(c=>({id:c.id,tokenId:c.tokenLinks?.[roomId]}))
   .filter(c=>typeof c.tokenId==='string'&&c.tokenId);
 }catch{return []}
}
function enqueueMissingNPCs(roomId,missing){
 if(!missing.length)return;
 try{
  const queue=JSON.parse(localStorage.getItem(NPC_PENDING_KEY)||'[]');
  const existing=Array.isArray(queue)?queue:[];
  const keys=new Set(existing.map(x=>x.roomId+'|'+x.tokenId));
  for(const c of missing){
   const key=roomId+'|'+c.tokenId;
   if(keys.has(key))continue;
   existing.push({roomId,tokenId:c.tokenId,combatantId:c.id});keys.add(key);
  }
  localStorage.setItem(NPC_PENDING_KEY,JSON.stringify(existing.slice(-400)));
 }catch(error){console.warn('Could not queue NPC token deletions:',error)}
}
OBR.onReady(async()=>{
 let roomId,role='UNKNOWN',unsubscribe=null,initialized=false,seen=new Set();
 try{roomId=OBR.room.id;role=await OBR.player.getRole()}catch{return}
 const stop=()=>{if(unsubscribe){unsubscribe();unsubscribe=null}initialized=false;seen=new Set()};
 const evaluate=items=>{
  if(role!=='GM'||!Array.isArray(items))return;
  const visible=new Set(items.filter(item=>item.layer==='CHARACTER').map(item=>item.id));
  const tracked=trackedNPCs(roomId);
  if(!initialized){
   seen=new Set(tracked.filter(c=>visible.has(c.tokenId)).map(c=>c.tokenId));
   initialized=true;return;
  }
  const missing=tracked.filter(c=>seen.has(c.tokenId)&&!visible.has(c.tokenId));
  if(missing.length)enqueueMissingNPCs(roomId,missing);
  for(const c of missing)seen.delete(c.tokenId);
  for(const c of tracked)if(visible.has(c.tokenId))seen.add(c.tokenId);
 };
 const start=async()=>{
  stop();
  if(role!=='GM'||!await OBR.scene.isReady())return;
  unsubscribe=OBR.scene.items.onChange(evaluate);
  try{evaluate(await OBR.scene.items.getItems())}catch(error){console.warn('Could not watch NPC tokens:',error)}
 };
 OBR.player.onChange(p=>{if(!p.role)return;role=p.role;start().catch(console.warn)});
 OBR.scene.onReadyChange(ready=>{if(ready)start().catch(console.warn);else stop()});
 await start();
});
