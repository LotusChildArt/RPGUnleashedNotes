import OBR,{buildImage,buildText,buildLabel} from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const TOKEN_KEY='com.rpgunleashed.notes/npcTokenV1';
const HUD_KEY='com.rpgunleashed.notes/npcHudV1';
const ASSETS='https://rpgunleashedchara.onrender.com/assets/';
const DEFAULT_TOKEN='https://rpgunleashednotes.onrender.com/assets/npc-placeholder.webp';
let roomId=null,ready=false,spawnSequence=0;
let tokenWatch=null,watchedTokens=new Map(),seenTokenIds=new Set(),watchHasBaseline=false;
const asNumber=(v,defaultValue=0)=>Number.isFinite(Number(v))?Number(v):defaultValue;
function announce(){window.dispatchEvent(new CustomEvent('rpg-npc-owlbear-state',{detail:{ready,roomId}}))}
const metadata=(c,kind)=>({[HUD_KEY]:{combatantId:c.id,roomId,kind}});
const snapshot=c=>({
 name:String(c.name||'NPC'),hp:Number(c.hp)||0,hpMax:Number(c.hpMax)||0,
 mana:Number(c.mana)||0,manaMax:Number(c.manaMax)||0,
 drArmor:Number(c.drArmor)||0,drNatural:Number(c.drNatural)||0,
 drMagic:Number(c.drMagic)||0,nl:Number(c.nl)||0,
 conditions:String(c.conditions||''),
 conditionDetails:Array.isArray(c.conditionDetails)?c.conditionDetails:[],
 updatedAt:Number(c.npcUpdatedAt)||Date.now()
});
const tokenTag=c=>({combatantId:c.id,roomId,stats:snapshot(c)});
async function writeTokenState(c,tokenId){
 await OBR.scene.items.updateItems([tokenId],items=>{for(const item of items){
  item.metadata||={};item.metadata[TOKEN_KEY]=tokenTag(c);
 }});
}
function imageItem({url,pixelsWidth,pixelsHeight,dpi,worldWidth,position,tokenId,combatant,kind}){
 const item=buildImage({width:pixelsWidth,height:pixelsHeight,url,mime:url.toLowerCase().split('?')[0].endsWith('.webp')?'image/webp':url.toLowerCase().split('?')[0].match(/\.jpe?g$/)?'image/jpeg':'image/png'},
  {dpi:pixelsWidth*dpi/worldWidth,offset:{x:pixelsWidth/2,y:pixelsHeight/2}})
  .position(position).layer(tokenId?'ATTACHMENT':'CHARACTER')
  .metadata(tokenId?metadata(combatant,kind):{[TOKEN_KEY]:tokenTag(combatant)})
  .locked(!!tokenId);
 if(!tokenId){
  item.name(combatant.name).textItemType('LABEL')
   .plainText(npcName(combatant)).fontSize(26).fontWeight(700)
   .textHeight(52).textAlign('CENTER').textAlignVertical('TOP').textFillColor('#ffffff')
   .textStrokeColor('#000000').textStrokeOpacity(1).textStrokeWidth(2).textPadding(2);
 }
 if(tokenId)item.attachedTo(tokenId).disableHit(true);
 return item.build();
}
function npcName(combatant){
 return String(combatant.name||'NPC').replace(/ #[0-9]+$/,'').trim()||'NPC';
}
function npcNameText(combatant){
 // Image-native labels are rendered in screen space, not scene-scaled attachments.
 return buildLabel().plainText(npcName(combatant)).fontSize(26).fontWeight(700)
  .height(52).textAlign('CENTER').textAlignVertical('TOP').fillColor('#ffffff')
  .strokeColor('#000000').strokeOpacity(1).strokeWidth(2)
  .backgroundColor('#151515').backgroundOpacity(0).padding(0).build().text;
}
function numberItem({combatant,tokenId,kind,value,position,width}){
 return buildText().plainText(String(value)).textType('PLAIN').width(Math.max(34,width*1.4)).height(Math.max(28,width)).padding(0)
  .fontSize(30).fontWeight(900).textAlign('CENTER').textAlignVertical('MIDDLE')
  .fillColor('#ffffff').fillOpacity(1).strokeColor('#000000').strokeOpacity(1).strokeWidth(6)
  .position(position).layer('ATTACHMENT').attachedTo(tokenId).locked(true).disableHit(true)
  .metadata(metadata(combatant,kind)).build();
}
async function connection(){
 if(!OBR.isAvailable)return false;
 if(!ready)return false;
 return OBR.scene.isReady();
}
async function getExistingToken(c){
 const tokenId=c.tokenLinks?.[roomId];
 if(!tokenId)return null;
 const items=await OBR.scene.items.getItems([tokenId]);
 return items.find(x=>x.id===tokenId&&x.layer==='CHARACTER'&&x.metadata?.[TOKEN_KEY]?.combatantId===c.id)||null;
}
async function updateHUD(c){
 if(!await connection())throw Error('Open Notes as an Owlbear extension with an active scene.');
 const token=await getExistingToken(c);
 if(!token)throw Error('Token is not on the current Owlbear scene. Spawn a new one.');
 await writeTokenState(c,token.id);
 // Refresh also migrates old floating name attachments to the token's native label.
 await OBR.scene.items.updateItems([token.id],items=>{
  for(const item of items){
   item.text=npcNameText(c);
   item.textItemType='LABEL';
  }
 });
 const prior=await OBR.scene.items.getItems(item=>item.metadata?.[HUD_KEY]?.combatantId===c.id&&item.metadata?.[HUD_KEY]?.roomId===roomId);
 if(prior.length)await OBR.scene.items.deleteItems(prior.filter(x=>x.metadata?.[HUD_KEY]?.kind!=='turn-marker').map(x=>x.id));
 const bounds=await OBR.scene.items.getItemBounds([token.id]),dpi=await OBR.scene.grid.getDpi();
 const width=Math.max(115,bounds.width*1.12),height=width*40/300,gap=Math.max(3,bounds.height*.025);
 const iconWidth=Math.max(26,bounds.width*.28),iconHeight=iconWidth*63/72;
 const items=[];let y=bounds.max.y+gap;
 const addBar=(type,current,max)=>{
  if(max<=0&&current<=0)return;
  const fraction=max>0?Math.max(0,Math.min(1,current/max)):0;
  const percent=String(Math.round(fraction*100)).padStart(3,'0');
  items.push(imageItem({url:ASSETS+'tokenhud/'+type+'/'+type+'-'+percent+'.png',pixelsWidth:300,pixelsHeight:40,dpi,worldWidth:width,position:{x:bounds.center.x,y:y+height/2},tokenId:token.id,combatant:c,kind:type+'-bar'}));
  y+=height+gap;
 };
 addBar('hp',asNumber(c.hp),asNumber(c.hpMax));
 addBar('mana',asNumber(c.mana),asNumber(c.manaMax));
 const dr=asNumber(c.drArmor)+asNumber(c.drNatural)+asNumber(c.drMagic);
 const indicators=[];
 if(dr>0)indicators.push({kind:'dr',value:dr,url:ASSETS+'tokenhud/dr-icon.png'});
 if(asNumber(c.nl)>0)indicators.push({kind:'nl',value:asNumber(c.nl),url:ASSETS+'tokenhud/nl-icon.png'});
 const startX=bounds.center.x-(indicators.length*iconWidth+(indicators.length-1)*iconWidth*.18)/2+iconWidth/2;
 for(let i=0;i<indicators.length;i++){
  const v=indicators[i],pos={x:startX+i*iconWidth*1.18,y:y+iconHeight/2};
  items.push(imageItem({url:v.url,pixelsWidth:72,pixelsHeight:63,dpi,worldWidth:iconWidth,position:pos,tokenId:token.id,combatant:c,kind:v.kind+'-icon'}));
  items.push(numberItem({combatant:c,tokenId:token.id,kind:v.kind+'-number',value:v.value,position:pos,width:iconWidth}));
 }
 const conditions=String(c.conditions||'').split(',').map(x=>x.trim().toLowerCase().replace(/\s+/g,'-')).filter(Boolean);
 const valid=new Set(['fear','wounded','arrowed','bleeding','broken-bone','burning','charmed','poisoned','drunk','confused','frozen','unconscious','taunted','stunned']);
 conditions.filter(x=>valid.has(x)).slice(0,8).forEach((x,i)=>{
  const overlayWidth=Math.max(30,bounds.width*.45);
  items.push(imageItem({url:ASSETS+'conditions/'+x+'.png',pixelsWidth:1516,pixelsHeight:1536,dpi,worldWidth:overlayWidth,position:{x:bounds.min.x+overlayWidth/2+i*overlayWidth*.35,y:bounds.min.y-overlayWidth*.12},tokenId:token.id,combatant:c,kind:'condition-'+x}));
 });
 if(items.length)await OBR.scene.items.addItems(items);
 return true;
}
async function loadTokenImageDimensions(url){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  let completed=false;
  const timer=setTimeout(()=>finish(new Error('Token image did not load. Check the image URL.')),10000);
  function finish(error){
   if(completed)return;completed=true;clearTimeout(timer);
   img.onload=null;img.onerror=null;
   if(error){reject(error);return}
   const width=img.naturalWidth,height=img.naturalHeight;
   if(!width||!height){reject(new Error('Could not read token image dimensions.'));return}
   resolve({width,height});
  }
  img.onload=()=>finish();
  img.onerror=()=>finish(new Error('Token image could not be loaded from its URL.'));
  img.src=url;
 });
}
async function spawn(c){
 if(!await connection())throw Error('Open Notes from an Owlbear room with an active scene to spawn tokens.');
 const dpi=await OBR.scene.grid.getDpi();
 // Viewport position is a camera transform, not the visible scene's center.
 const [screenWidth,screenHeight]=await Promise.all([OBR.viewport.getWidth(),OBR.viewport.getHeight()]);
 const center=await OBR.viewport.inverseTransformPoint({x:screenWidth/2,y:screenHeight/2});
 const index=spawnSequence++;
 const unsnapped={x:center.x+(index%6)*dpi,y:center.y+Math.floor(index/6)*dpi};
 // Snap to cell centers, not corners, so a one-cell token sits within the square.
 const position=await OBR.scene.grid.snapPosition(unsnapped,1,false);
 const imageUrl=String(c.tokenImage||DEFAULT_TOKEN).trim();
 if(!/^https:\/\//i.test(imageUrl))throw Error('Token artwork must be an HTTPS image URL.');
 const {width:sourceWidth,height:sourceHeight}=await loadTokenImageDimensions(imageUrl);
 // Owlbear uses the declared image dimensions to calculate its world size.
 // Preserve aspect ratio while fitting the longest edge inside one grid cell.
 const worldWidth=dpi*sourceWidth/Math.max(sourceWidth,sourceHeight);
 const token=imageItem({url:imageUrl,pixelsWidth:sourceWidth,pixelsHeight:sourceHeight,dpi,worldWidth,position,combatant:c,kind:'token'});
 await OBR.scene.items.addItems([token]);
 c.tokenLinks={...(c.tokenLinks||{}),[roomId]:token.id};
 watchedTokens.set(token.id,c.id);seenTokenIds.add(token.id);
 try{await updateHUD(c)}
 catch(error){await OBR.scene.items.deleteItems([token.id]);delete c.tokenLinks[roomId];throw error}
 return token.id;
}
async function remove(c){
 if(!await connection())return false;
 const token=await getExistingToken(c);
 if(!token)return false;
 const attached=await OBR.scene.items.getItems(x=>x.metadata?.[HUD_KEY]?.combatantId===c.id&&x.metadata?.[HUD_KEY]?.roomId===roomId);
 await OBR.scene.items.deleteItems([...attached.map(x=>x.id),token.id]);
 delete c.tokenLinks[roomId];
 watchedTokens.delete(token.id);seenTokenIds.delete(token.id);
 return true;
}

async function setTurnMarker(combatant){
 if(!await connection())return false;
 const previous=await OBR.scene.items.getItems(item=>
  item.metadata?.[HUD_KEY]?.roomId===roomId&&item.metadata?.[HUD_KEY]?.kind==='turn-marker');
 if(previous.length)await OBR.scene.items.deleteItems(previous.map(x=>x.id));
 if(!combatant)return true;
 const token=await getExistingToken(combatant);
 if(!token)return false;
 const bounds=await OBR.scene.items.getItemBounds([token.id]);
 const size=Math.max(46,Math.min(90,bounds.width*.38));
 const marker=buildText().plainText('▼').textType('PLAIN')
  .width(size*1.5).height(size).padding(0).fontSize(46).fontWeight(900)
  .textAlign('CENTER').textAlignVertical('MIDDLE')
  .fillColor('#ffda43').fillOpacity(1).strokeColor('#171717')
  .strokeOpacity(1).strokeWidth(5)
  .position({x:bounds.center.x,y:bounds.min.y-size*.70})
  .layer('ATTACHMENT').attachedTo(token.id).locked(true).disableHit(true)
  .metadata(metadata(combatant,'turn-marker')).build();
 await OBR.scene.items.addItems([marker]);
 return true;
}
async function status(c){if(!await connection())return false;return !!await getExistingToken(c)}
// Only Character-layer token disappearance counts, not attachment HUD changes.
function watchNPCTokens(records,onDeleted){
 if(tokenWatch){tokenWatch();tokenWatch=null}
 watchedTokens=new Map(records.filter(c=>c.tokenLinks?.[roomId]).map(c=>[c.tokenLinks[roomId],c.id]));
 watchHasBaseline=false;seenTokenIds=new Set();
 if(!ready||!roomId||typeof onDeleted!=='function')return;
 const handle=items=>{
  if(!ready||!Array.isArray(items))return;
  const inScene=new Set(items.filter(i=>i.layer==='CHARACTER').map(i=>i.id));
  if(!watchHasBaseline){
   seenTokenIds=new Set([...watchedTokens.keys()].filter(id=>inScene.has(id)));
   watchHasBaseline=true;return;
  }
  const removed=[];
  for(const [tokenId,combatantId] of watchedTokens){
   if(seenTokenIds.has(tokenId)&&!inScene.has(tokenId)){
    removed.push({tokenId,combatantId});watchedTokens.delete(tokenId);seenTokenIds.delete(tokenId);
   }else if(inScene.has(tokenId))seenTokenIds.add(tokenId);
  }
  if(removed.length)onDeleted(removed);
 };
 tokenWatch=OBR.scene.items.onChange(handle);
 OBR.scene.items.getItems().then(handle).catch(error=>console.warn('NPC token watch unavailable',error));
}
async function pull(c){
 if(!await connection())return false;
 const token=await getExistingToken(c);if(!token)return false;
 const tag=token.metadata?.[TOKEN_KEY];if(!tag?.stats){await writeTokenState(c,token.id);return false;}
 const remote=tag.stats,remoteTime=Number(remote.updatedAt)||0,localTime=Number(c.npcUpdatedAt)||0;
 if(remoteTime<=localTime)return false;
 const fields=['hp','hpMax','mana','manaMax','drArmor','drNatural','drMagic','nl','conditions','conditionDetails'];
 for(const field of fields)if(Object.prototype.hasOwnProperty.call(remote,field))c[field]=remote[field];
 c.npcUpdatedAt=remoteTime;
 return true;
}
window.RPGNPCBattlefield={spawn,updateHUD,setTurnMarker,remove,status,pull,watchNPCTokens,get ready(){return ready},get roomId(){return roomId}};
if(OBR.isAvailable)OBR.onReady(async()=>{
 try{roomId=OBR.room.id;ready=(await OBR.player.getRole())==='GM';announce();
 OBR.player.onChange(p=>{ready=p.role==='GM';if(!ready&&tokenWatch){tokenWatch();tokenWatch=null}announce()});
 OBR.scene.onReadyChange(sceneReady=>{if(!sceneReady&&tokenWatch){tokenWatch();tokenWatch=null;watchHasBaseline=false}announce()});
 }catch(error){console.warn('NPC battlefield connection unavailable',error)}
});
else announce();
