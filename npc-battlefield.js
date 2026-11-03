import OBR,{buildImage,buildText} from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

const TOKEN_KEY='com.rpgunleashed.notes/npcTokenV1';
const HUD_KEY='com.rpgunleashed.notes/npcHudV1';
const ASSETS='https://rpgunleashedchara.onrender.com/assets/';
const DEFAULT_TOKEN='https://rpgunleashednotes.onrender.com/icons/icon-192.png';
let roomId=null,ready=false,spawnSequence=0;
const asNumber=(v,defaultValue=0)=>Number.isFinite(Number(v))?Number(v):defaultValue;
function announce(){window.dispatchEvent(new CustomEvent('rpg-npc-owlbear-state',{detail:{ready,roomId}}))}
const metadata=(c,kind)=>({[HUD_KEY]:{combatantId:c.id,roomId,kind}});
function imageItem({url,pixelsWidth,pixelsHeight,dpi,worldWidth,position,tokenId,combatant,kind}){
 const item=buildImage({width:pixelsWidth,height:pixelsHeight,url,mime:url.toLowerCase().split('?')[0].endsWith('.webp')?'image/webp':url.toLowerCase().split('?')[0].match(/\.jpe?g$/)?'image/jpeg':'image/png'},
  {dpi:pixelsWidth*dpi/worldWidth,offset:{x:pixelsWidth/2,y:pixelsHeight/2}})
  .position(position).layer(tokenId?'ATTACHMENT':'CHARACTER')
  .metadata(tokenId?metadata(combatant,kind):{[TOKEN_KEY]:{combatantId:combatant.id,roomId}})
  .locked(!!tokenId);
 if(!tokenId)item.name(combatant.name);
 if(tokenId)item.attachedTo(tokenId).disableHit(true);
 return item.build();
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
 const prior=await OBR.scene.items.getItems(item=>item.metadata?.[HUD_KEY]?.combatantId===c.id&&item.metadata?.[HUD_KEY]?.roomId===roomId);
 if(prior.length)await OBR.scene.items.deleteItems(prior.map(x=>x.id));
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
async function spawn(c){
 if(!await connection())throw Error('Open Notes from an Owlbear room with an active scene to spawn tokens.');
 const center=await OBR.viewport.getPosition(),dpi=await OBR.scene.grid.getDpi();
 const index=spawnSequence++;const position={x:center.x+(index%6)*dpi*1.4,y:center.y+Math.floor(index/6)*dpi*1.4};
 const imageUrl=String(c.tokenImage||DEFAULT_TOKEN).trim();
 if(!/^https:\/\//i.test(imageUrl))throw Error('Token artwork must be an HTTPS image URL.');
 const token=imageItem({url:imageUrl,pixelsWidth:512,pixelsHeight:512,dpi,worldWidth:dpi,position,combatant:c,kind:'token'});
 await OBR.scene.items.addItems([token]);
 c.tokenLinks={...(c.tokenLinks||{}),[roomId]:token.id};
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
 return true;
}
async function status(c){if(!await connection())return false;return !!await getExistingToken(c)}
window.RPGNPCBattlefield={spawn,updateHUD,remove,status,get ready(){return ready},get roomId(){return roomId}};
if(OBR.isAvailable)OBR.onReady(async()=>{
 try{roomId=OBR.room.id;ready=(await OBR.player.getRole())==='GM';announce();
 OBR.player.onChange(p=>{ready=p.role==='GM';announce()});
 }catch(error){console.warn('NPC battlefield connection unavailable',error)}
});
else announce();
