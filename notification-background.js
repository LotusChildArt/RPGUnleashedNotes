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
