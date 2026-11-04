(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const numbers=['level','bod','dex','mnd','cha','hp','hpMax','mana','manaMax','drArmor','drNatural','drMagic','nl','speed'];
const defs=[
 ['name','Name','text'],['role','Role / Category','text'],['race','Race / Species','text'],['level','Level','number'],
 ['bod','BOD','number'],['dex','DEX','number'],['mnd','MND','number'],['cha','CHA','number'],
 ['hp','Current HP','number'],['hpMax','Maximum HP','number'],['mana','Current Mana','number'],['manaMax','Maximum Mana','number'],
 ['drArmor','Armor DR','number'],['drNatural','Natural DR','number'],['drMagic','Magic DR','number'],
 ['nl','NL','number'],['speed','Speed (ft)','number'],['attack','Attacks (BOD / DEX)','text'],
 ['defense','Defenses (BOD / DEX)','text'],['weapons','Weapons / Damage','textarea'],
 ['armor','Armor / Equipment','textarea'],['feats','Feats / Abilities','textarea'],
 ['conditions','Conditions (comma-separated)','text'],['tactics','Tactics / Drive','textarea'],
 ['notes','Notes','textarea'],['tokenImage','Token artwork (HTTPS image URL, optional)','url']
];
const defaultRecord=()=>({id:uid(),name:'',role:'',race:'',level:1,bod:0,dex:0,mnd:0,cha:0,hp:10,hpMax:10,mana:0,manaMax:0,drArmor:0,drNatural:0,drMagic:0,nl:0,speed:0,attack:'',defense:'',weapons:'',armor:'',feats:'',conditions:'',tactics:'',notes:'',tokenImage:''});
const gm=()=>state.role==='gm'&&owlAccessRole!=='PLAYER'&&owlAccessRole!=='UNKNOWN';
let pane='bestiary',editMasterId=null,editCombatId=null;
let npcPullRunning=false,lastNPCPull=0;
const NPC_PENDING_KEY='RPGUnleashedNotes.pendingTokenDeletes.v1';
function consumePendingNPCDeletions(){
 const engine=window.RPGNPCBattlefield;
 if(!gm()||!engine?.roomId)return;
 let queue=[];
 try{queue=JSON.parse(localStorage.getItem(NPC_PENDING_KEY)||'[]')}catch{return}
 if(!Array.isArray(queue)||!queue.length)return;
 const matching=queue.filter(x=>x.roomId===engine.roomId);
 if(!matching.length)return;
 const deleted=new Set(matching.map(x=>x.tokenId));
 let changed=false;
 for(const campaign of state.campaigns){
  const list=campaign.combatants||[];
  const kept=list.filter(c=>!deleted.has(c.tokenLinks?.[engine.roomId]));
  if(kept.length!==list.length){campaign.combatants=kept;changed=true}
 }
 try{localStorage.setItem(NPC_PENDING_KEY,JSON.stringify(queue.filter(x=>x.roomId!==engine.roomId)))}catch{}
 if(changed){
  if(editCombatId&&!(current()?.combatants||[]).some(c=>c.id===editCombatId))hideEditors();
  save();renderBestiary();
 }
}
function startNPCDeletionWatch(){
 const engine=window.RPGNPCBattlefield;
 if(!gm()||!engine?.ready||!engine.watchNPCTokens)return;
 const records=state.campaigns.flatMap(c=>c.combatants||[]);
 engine.watchNPCTokens(records,removed=>{
  if(!gm())return;
  const removedIds=new Set(removed.map(x=>x.tokenId));
  let changed=false;
  for(const campaign of state.campaigns){
   const combatants=campaign.combatants||[];
   const remaining=combatants.filter(c=>!removedIds.has(c.tokenLinks?.[engine.roomId]));
   if(remaining.length!==combatants.length){campaign.combatants=remaining;changed=true}
  }
  if(changed){
   // Keep reusable Bestiary templates intact; only deployed combatants disappear.
   if(editCombatId&&!(current()?.combatants||[]).some(c=>c.id===editCombatId))hideEditors();
   save();renderBestiary();
  }
 });
}
async function syncNPCsFromScene(force=false){
 const engine=window.RPGNPCBattlefield;
 if(!gm()||!engine?.ready||npcPullRunning||(!force&&Date.now()-lastNPCPull<2500))return;
 const c=current();if(!c||!Array.isArray(c.combatants))return;
 npcPullRunning=true;lastNPCPull=Date.now();
 try{
  let changed=false;
  for(const item of c.combatants)if(item.tokenLinks?.[engine.roomId]){
   try{if(await engine.pull(item))changed=true}catch(error){console.warn('Could not read NPC token:',error)}
  }
  if(changed){save();renderBestiary()}
 }finally{npcPullRunning=false}
}

function ensure(){
 state.bestiary ||= [];
 if(gm()&&state.bestiaryStarterImportVersion!==1&&Array.isArray(window.RPGStarterBestiary)){
  const existing=new Set(state.bestiary.map(x=>(x.name||'').trim().toLowerCase()+'|'+x.level+'|'+(x.role||'').toLowerCase()));
  for(const record of window.RPGStarterBestiary){
   const key=record.name.trim().toLowerCase()+'|'+record.level+'|'+record.role.toLowerCase();
   if(!existing.has(key)&&!state.bestiary.some(x=>x.id===record.id)){
    state.bestiary.push(structuredClone(record));existing.add(key);
   }
  }
  state.bestiaryStarterImportVersion=1;save();
 }
 const c=current();if(c)c.combatants ||= [];
 return c;
}
function fieldMarkup(item){
 return defs.map(([key,label,type])=>{
  const value=item[key]??'',id='npcField_'+key;
  return '<div class="field"><label for="'+id+'">'+escapeHTML(label)+'</label>'+
   (type==='textarea'?'<textarea data-npc-field="'+key+'" id="'+id+'" rows="3">'+escapeHTML(value)+'</textarea>':
    '<input data-npc-field="'+key+'" id="'+id+'" type="'+type+'" '+(type==='number'?'step="1"':'')+' value="'+escapeHTML(value)+'">')+'</div>';
 }).join('');
}
function formData(root,previous){
 const data={...previous};
 for(const input of root.querySelectorAll('[data-npc-field]')){
  const k=input.dataset.npcField;
  data[k]=numbers.includes(k)?Number(input.value):input.value.trim();
  if(numbers.includes(k)&&(!Number.isFinite(data[k])||!Number.isInteger(data[k])))throw Error('All numeric fields must contain whole numbers.');
 }
 if(!data.name)throw Error('Enter a name.');
 if(data.hpMax<0||data.manaMax<0)throw Error('Maximum HP and Mana cannot be negative.');
 if(data.hpMax>1000000||data.manaMax>1000000)throw Error('HP and Mana maximums must be under one million.');
 if(data.tokenImage&&!/^https:\/\//i.test(data.tokenImage))throw Error('Token artwork must use HTTPS.');
 return data;
}
function setPane(to){
 pane=to;
 $('gmBestiaryPane').classList.toggle('hidden',to!=='bestiary');
 $('gmCombatPane').classList.toggle('hidden',to!=='combat');
 $('gmToolsBestiary').classList.toggle('active',to==='bestiary');
 $('gmToolsCombat').classList.toggle('active',to==='combat');
}
function hideEditors(){
 $('npcBestiaryEditor').classList.add('hidden');$('npcCombatEditor').classList.add('hidden');
 $('npcBestiaryList').parentElement.classList.remove('hidden');
 $('npcCombatantList').parentElement.classList.remove('hidden');
 editMasterId=null;editCombatId=null;
}
function editMaster(id){
 if(!gm())return;
 const master=state.bestiary.find(x=>x.id===id);
 if(id&&!master)return;
 hideEditors();editMasterId=id||null;
 $('npcBestiaryEditTitle').textContent=master?'Edit Bestiary Entry':'Create Bestiary Entry';
 $('npcBestiaryFields').innerHTML=fieldMarkup(master||defaultRecord());
 $('npcBestiaryList').parentElement.classList.add('hidden');
 $('npcBestiaryEditor').classList.remove('hidden');
 setPane('bestiary');
}
async function editCombat(id){
 if(!gm())return;
 await syncNPCsFromScene(true);
 const c=ensure(),instance=c?.combatants.find(x=>x.id===id);
 if(!instance)return;
 hideEditors();editCombatId=id;
 $('npcCombatFields').innerHTML=fieldMarkup(instance);
 $('npcCombatFeedback').textContent='';
 $('npcCombatantList').parentElement.classList.add('hidden');
 $('npcCombatEditor').classList.remove('hidden');
 setPane('combat');
}
const statStrip=x=>'<div class="npc-stat-strip">'+[
 'HP '+x.hp+'/'+x.hpMax,'DR '+(Number(x.drArmor||0)+Number(x.drNatural||0)+Number(x.drMagic||0)),
 'BOD '+x.bod,'DEX '+x.dex,'MND '+x.mnd,'CHA '+x.cha
 ].map(s=>'<span>'+escapeHTML(s)+'</span>').join('')+'</div>';
function masterHTML(x){
 return '<div class="entry npc-entry"><h3>'+escapeHTML(x.name)+'</h3><p class="subtle-info">'+escapeHTML([x.role,x.race,x.level?'Level '+x.level:''].filter(Boolean).join(' · '))+'</p>'+statStrip(x)+
 '<div class="npc-actions"><button data-master-edit="'+escapeHTML(x.id)+'">Edit</button><button data-master-duplicate="'+escapeHTML(x.id)+'">Duplicate</button><button data-master-spawn="'+escapeHTML(x.id)+'">Spawn Token(s)</button><button data-master-prepare="'+escapeHTML(x.id)+'">Add to Combatants</button><button data-master-delete="'+escapeHTML(x.id)+'">Delete</button></div></div>';
}
function combatHTML(x){
 const hasToken=!!Object.keys(x.tokenLinks||{}).length;
 return '<div class="entry npc-entry"><h3>'+escapeHTML(x.name)+'</h3><p class="subtle-info">'+escapeHTML(x.role||'Combatant')+' · '+(hasToken?'Token linked':'No linked token')+'</p>'+statStrip(x)+
 (x.conditions?'<p class="subtle-info">Conditions: '+escapeHTML(x.conditions)+'</p>':'')+
 '<div class="npc-actions"><button data-combat-edit="'+escapeHTML(x.id)+'">Restat / Edit</button><button data-combat-hp="'+escapeHTML(x.id)+'">Adjust HP</button><button data-combat-spawn="'+escapeHTML(x.id)+'">Spawn Token</button><button data-combat-sync="'+escapeHTML(x.id)+'">Refresh HUD</button><button data-combat-promote="'+escapeHTML(x.id)+'">Save to Bestiary</button><button data-combat-remove="'+escapeHTML(x.id)+'">Remove Token</button><button data-combat-delete="'+escapeHTML(x.id)+'">Delete Combatant</button></div></div>';
}
function createInstance(master,existing){
 const c=ensure();if(!c)return null;
 const n=c.combatants.filter(x=>x.templateId===master.id).length+1;
 const item=structuredClone(master);
 item.id=uid();item.templateId=master.id;item.name=existing?master.name:master.name+' #'+n;item.tokenLinks={};item.createdAt=Date.now();
 c.combatants.push(item);save();return item;
}
async function spawnInstance(item){
 const engine=window.RPGNPCBattlefield;
 if(!engine?.ready)throw Error('Token spawning requires Notes opened in Owlbear as the GM with an active scene.');
 await engine.spawn(item);save();renderBestiary();
}
function showError(error){alert(error?.message||String(error))}
function renderBestiary(){
 const c=ensure();if(!c)return;
 if(!$('gmTools').classList.contains('hidden'))syncNPCsFromScene();
 if(!gm())return;
 const term=$('npcBestiarySearch').value.trim().toLowerCase();
 const matches=state.bestiary.filter(x=>[x.name,x.role,x.race,x.notes].some(s=>String(s||'').toLowerCase().includes(term)));
 $('npcBestiaryList').innerHTML=matches.map(masterHTML).join('')||'<p class="muted">'+(state.bestiary.length?'No matching creatures.':'No entries yet. Use + Creature / NPC to begin.')+'</p>';
 $('npcCombatantList').innerHTML=c.combatants.map(combatHTML).join('')||'<p class="muted">No active combatants. Add one from the Bestiary.</p>';
 $('npcAddBestiary').disabled=false;setPane(pane);
 const container=$('gmTools');
 container.querySelectorAll('[data-master-edit]').forEach(b=>b.onclick=()=>editMaster(b.dataset.masterEdit));
 container.querySelectorAll('[data-master-duplicate]').forEach(b=>b.onclick=()=>{
  const x=state.bestiary.find(t=>t.id===b.dataset.masterDuplicate);if(!x)return;
  const copy=structuredClone(x);copy.id=uid();copy.name+=' (Variant)';state.bestiary.push(copy);save();renderBestiary();
 });
 container.querySelectorAll('[data-master-delete]').forEach(b=>b.onclick=()=>{
  if(!confirm('Delete this Bestiary entry? Existing combatants will remain.'))return;
  state.bestiary=state.bestiary.filter(x=>x.id!==b.dataset.masterDelete);save();renderBestiary();
 });
 container.querySelectorAll('[data-master-prepare]').forEach(b=>b.onclick=()=>{
  const x=state.bestiary.find(t=>t.id===b.dataset.masterPrepare);if(!x)return;
  const count=prompt('How many combatants?', '1');if(count===null)return;const n=Number(count);
  if(!Number.isInteger(n)||n<1||n>30)return alert('Enter a quantity from 1 to 30.');
  for(let i=0;i<n;i++)createInstance(x);hideEditors();setPane('combat');renderBestiary();
 });
 container.querySelectorAll('[data-master-spawn]').forEach(b=>b.onclick=async()=>{
  const x=state.bestiary.find(t=>t.id===b.dataset.masterSpawn);if(!x)return;
  if(!window.RPGNPCBattlefield?.ready)return alert('Open Notes in Owlbear as the GM to spawn tokens.');
  const count=prompt('How many tokens?', '1');if(count===null)return;const n=Number(count);
  if(!Number.isInteger(n)||n<1||n>30)return alert('Enter a quantity from 1 to 30.');
  b.disabled=true;
  try{
   for(let i=0;i<n;i++){
    const item=createInstance(x);try{await spawnInstance(item)}catch(e){c.combatants=c.combatants.filter(t=>t.id!==item.id);save();throw e}
   }
   hideEditors();setPane('combat');renderBestiary();
  }catch(error){showError(error)}finally{b.disabled=false}
 });
 container.querySelectorAll('[data-combat-edit]').forEach(b=>b.onclick=()=>editCombat(b.dataset.combatEdit));
 container.querySelectorAll('[data-combat-hp]').forEach(b=>b.onclick=async()=>{
  await syncNPCsFromScene(true);const x=c.combatants.find(t=>t.id===b.dataset.combatHp);if(!x)return;
  const response=prompt('New current HP for '+x.name+':',String(x.hp));if(response===null)return;
  const hp=Number(response);if(!Number.isInteger(hp))return alert('Enter a whole number for HP.');
  x.hp=hp;x.npcUpdatedAt=Math.max(Date.now(),Number(x.npcUpdatedAt||0)+1);save();renderBestiary();
  try{if(window.RPGNPCBattlefield?.ready&&x.tokenLinks?.[window.RPGNPCBattlefield.roomId])await window.RPGNPCBattlefield.updateHUD(x)}catch(error){showError(error)}
 });
 container.querySelectorAll('[data-combat-spawn]').forEach(b=>b.onclick=async()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatSpawn);if(!x)return;
  b.disabled=true;
  try{
   if(window.RPGNPCBattlefield?.ready&&await window.RPGNPCBattlefield.status(x))throw Error('This combatant already has a token in the current scene. Refresh its HUD instead.');
   await spawnInstance(x);
  }catch(error){showError(error)}finally{b.disabled=false}
 });
 container.querySelectorAll('[data-combat-sync]').forEach(b=>b.onclick=async()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatSync);if(!x)return;
  try{await window.RPGNPCBattlefield.updateHUD(x)}catch(error){showError(error)}
 });
 container.querySelectorAll('[data-combat-promote]').forEach(b=>b.onclick=()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatPromote);if(!x)return;
  const name=prompt('Name for the new Bestiary entry:',x.name+' (Variant)');if(!name?.trim())return;
  const copy=structuredClone(x);copy.id=uid();copy.name=name.trim();delete copy.templateId;delete copy.tokenLinks;delete copy.createdAt;
  state.bestiary.push(copy);save();hideEditors();setPane('bestiary');renderBestiary();
 });
 container.querySelectorAll('[data-combat-remove]').forEach(b=>b.onclick=async()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatRemove);if(!x)return;
  if(!confirm('Remove this combatant’s token, HUD, and active combatant? The Bestiary entry will remain.'))return;
  try{if(!await window.RPGNPCBattlefield.remove(x))throw Error('No linked token was found in the current scene.');c.combatants=c.combatants.filter(t=>t.id!==x.id);save();renderBestiary()}catch(error){showError(error)}
 });
 container.querySelectorAll('[data-combat-delete]').forEach(b=>b.onclick=async()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatDelete);if(!x)return;
  if(!confirm('Delete '+x.name+' from the active combatants? This does not change the Bestiary.'))return;
  if(x.tokenLinks&&Object.keys(x.tokenLinks).length&&window.RPGNPCBattlefield?.ready){
   try{await window.RPGNPCBattlefield.remove(x)}catch(error){showError(error);return}
  }
  c.combatants=c.combatants.filter(t=>t.id!==x.id);save();renderBestiary();
 });
}
$('gmToolsBestiary').onclick=()=>setPane('bestiary');
$('gmToolsCombat').onclick=()=>setPane('combat');
$('npcGoBestiary').onclick=()=>setPane('bestiary');
$('npcBestiarySearch').oninput=renderBestiary;
$('npcAddBestiary').onclick=()=>editMaster(null);
$('npcBestiaryCancel').onclick=$('npcBestiaryDiscard').onclick=()=>{hideEditors();renderBestiary()};
$('npcCombatCancel').onclick=$('npcCombatDiscard').onclick=()=>{hideEditors();renderBestiary()};
$('npcBestiarySave').onclick=()=>{
 if(!gm())return;try{
  const prev=state.bestiary.find(x=>x.id===editMasterId)||defaultRecord();
  const next=formData($('npcBestiaryFields'),prev);
  const i=state.bestiary.findIndex(x=>x.id===editMasterId);
  if(i>=0)state.bestiary[i]=next;else state.bestiary.push(next);
  hideEditors();save();renderBestiary();
 }catch(error){showError(error)}
};
$('npcCombatSave').onclick=async()=>{
 if(!gm())return;const c=ensure(),item=c?.combatants.find(x=>x.id===editCombatId);if(!item)return;
 try{
  const next=formData($('npcCombatFields'),item);
  Object.assign(item,next);item.npcUpdatedAt=Math.max(Date.now(),Number(item.npcUpdatedAt||0)+1);save();hideEditors();renderBestiary();
  if(window.RPGNPCBattlefield?.ready&&item.tokenLinks?.[window.RPGNPCBattlefield.roomId]){
   try{await window.RPGNPCBattlefield.updateHUD(item)}catch(error){showError(error)}
  }
 }catch(error){showError(error)}
};
window.rpgBestiaryRender=renderBestiary;
window.addEventListener('rpg-npc-owlbear-state',()=>{consumePendingNPCDeletions();startNPCDeletionWatch();renderBestiary();syncNPCsFromScene(true)});
window.addEventListener('storage',e=>{if(e.key===NPC_PENDING_KEY)consumePendingNPCDeletions()});
setInterval(()=>{if(!$('gmTools').classList.contains('hidden')&&pane==='combat')syncNPCsFromScene()},5000);
renderBestiary();
if(window.RPGNPCBattlefield?.ready){consumePendingNPCDeletions();startNPCDeletionWatch()}
})();