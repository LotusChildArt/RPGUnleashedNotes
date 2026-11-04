(function(){
'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const numbers=['level','bod','dex','mnd','cha','hp','hpMax','mana','manaMax','drArmor','drNatural','drMagic','nl','speed','numberAttacks'];
const defaultRecord=()=>({id:uid(),name:'',role:'',race:'',level:1,bod:0,dex:0,mnd:0,cha:0,hp:10,hpMax:10,mana:0,manaMax:0,drArmor:0,drNatural:0,drMagic:0,nl:0,speed:0,attack:'',defense:'',weapons:'',armor:'',feats:'',conditions:'',tactics:'',drive:'',inventory:'',numberAttacks:1,notes:'',tokenImage:''});
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
 // Repair flattened reference markers in legacy Outlaws DEF and missing attacks.
 if(state.npcCombatDefaultsMigration!==1&&gm()){
  const normalize=x=>{
   if(!x)return;
   if(x.numberAttacks==null)x.numberAttacks=1;
   if(typeof x.defense==='string')x.defense=x.defense.replace(/\s*\((?:111|112|121|142)\)(?=\s*(?:\/|$))/g,'');
  };
  state.bestiary.forEach(normalize);
  state.campaigns.forEach(campaign=>(campaign.combatants||[]).forEach(normalize));
  state.npcCombatDefaultsMigration=1;
  save();
 }
 // Restore conditional DEF values mistakenly removed by the previous migration.
 // Only touch original Outlaws templates and their copies if DEF still matches
 // the exact unmodified value; customized combatant DEF is left alone.
 if(state.npcConditionalDefenseRestore!==1&&gm()){
  const original={
   'rpg-outlaws-thief-1':['BOD 7 / DEX 9','BOD 7 / DEX 9 (11¹)'],
   'rpg-outlaws-thug-1':['BOD 9 / DEX 9','BOD 9 (11²) / DEX 9'],
   'rpg-outlaws-bandit-3':['BOD 9 / DEX 10','BOD 9 / DEX 10 (12¹)'],
   'rpg-outlaws-gang-member-3':['BOD 12 / DEX 10','BOD 12 (14²) / DEX 10'],
   'rpg-outlaws-arcane-trickster-3':['BOD 8 / DEX 8','BOD 8 / DEX 8 (12¹)']
  };
  const restore=x=>{
   const record=original[x.templateId||x.id];
   if(record&&x.defense===record[0])x.defense=record[1];
  };
  state.bestiary.forEach(restore);
  state.campaigns.forEach(campaign=>(campaign.combatants||[]).forEach(restore));
  state.npcConditionalDefenseRestore=1;
  save();
 }
 // Restore feat cross-reference superscripts in previously imported Outlaws records.
 if(state.npcSuperscriptReferenceRestore!==1&&gm()){
  const starterIds=new Set(['rpg-outlaws-thief-1','rpg-outlaws-thug-1','rpg-outlaws-bandit-3','rpg-outlaws-gang-member-3','rpg-outlaws-arcane-trickster-3']);
  const aliases=[
   ['Squirrelly1','Squirrelly¹'],['Bully1','Bully¹'],['Unbreakable2','Unbreakable²'],
   ['Improved Unarmed3','Improved Unarmed³'],['Sneak Attack2','Sneak Attack²'],['Bullseye3','Bullseye³'],
   ['Light Melee Prof4','Light Melee Prof⁴'],['Light Melee4','Light Melee⁴'],
   ['Bonus Attack5','Bonus Attack⁵'],['Med. Melee4','Med. Melee⁴'],['Combo Breaker6','Combo Breaker⁶'],
   ['Light Melee Prof2','Light Melee Prof²'],['Ranged Prof3','Ranged Prof³'],
   ['Bonus Attack4','Bonus Attack⁴'],['Melee2','Melee²'],['Ranged3','Ranged³'],
   ['Rock Skin5','Rock Skin⁵'],['Healing Touch6','Healing Touch⁶']
  ];
  const fix=x=>{
   const id=x.templateId||x.id;if(!starterIds.has(id))return;
   for(const field of ['tactics','feats','notes']){
    if(typeof x[field]!=='string')continue;
    for(const [flat,sup] of aliases)x[field]=x[field].replaceAll(flat,sup);
   }
   if(id==='rpg-outlaws-gang-member-3'&&typeof x.feats==='string'){
    x.feats=x.feats.replace('Med. Melee Proficiency R1','Med. Melee Proficiency⁴ R1')
     .replace('Combo Breaker R0','Combo Breaker⁶ R0').replace('Bonus Attack 1','Bonus Attack⁵ 1');
   }
  };
  state.bestiary.forEach(fix);
  state.campaigns.forEach(campaign=>(campaign.combatants||[]).forEach(fix));
  state.npcSuperscriptReferenceRestore=1;
  save();
 }
 const c=current();if(c)c.combatants ||= [];
 return c;
}
function parsedDrive(item){
 if(item.drive)return String(item.drive);
 return String(item.tactics||'').match(/^Drive:\s*([^\n]*)/)?.[1]?.trim()||'';
}
function parsedTactics(item){
 const tactics=String(item.tactics||'');
 return tactics.replace(/^Drive:\s*[^\n]*(?:\n|$)/,'').trim();
}

function weaponEntries(record){
 if(Array.isArray(record.weaponEntries))return record.weaponEntries;
 const raw=String(record.weapons||'').trim();
 if(!raw)return [];
 return raw.replace(/^Weapon\s*\(\d+\):\s*/i,'').split(/\s*\|\s*|\n+/).map(part=>{
  const source=part.trim();if(!source)return null;
  const dmg=source.match(/\b\d+d\d+(?:[+-]\d+)?(?:\/[+-]?\d+)?\b/i);
  const name=dmg?source.slice(0,dmg.index).trim():source.replace(/\s*\([^)]*\)\s*$/,'').trim();
  let properties=dmg?source.slice(dmg.index+dmg[0].length).trim():'';
  const match=properties.match(/\((\d+)\s+([^)]*)\)/i);
  if(match)properties=properties.replace(match[0],'').trim();
  return {id:uid(),name:name||'Weapon',damage:dmg?.[0]||'',properties,ammo:match?Number(match[1]):null,ammoType:match?.[2]?.trim()||''};
 }).filter(Boolean);
}
function weaponRowMarkup(w={}){
 const field=(label,key,type='text',extra='')=>'<label><span>'+label+'</span><input data-weapon-field="'+key+'" type="'+type+'" '+extra+' value="'+escapeHTML(w[key]??'')+'"></label>';
 return '<div class="npc-weapon-edit-row" data-weapon-row="'+escapeHTML(w.id||uid())+'">'+
  field('Weapon','name')+field('Damage','damage')+field('Properties','properties')+
  field('Ammo','ammo','number','min="0" step="1" placeholder="—"')+field('Ammo type','ammoType','text','placeholder="bolts"')+
  '<button type="button" class="small" data-weapon-remove aria-label="Remove weapon">×</button></div>';
}
function attachWeaponEditor(root){
 root.querySelector('[data-add-weapon]')?.addEventListener('click',()=>root.querySelector('[data-weapon-editor]').insertAdjacentHTML('beforeend',weaponRowMarkup()));
 root.querySelector('[data-weapon-editor]')?.addEventListener('click',event=>{
  if(event.target.closest('[data-weapon-remove]'))event.target.closest('[data-weapon-row]')?.remove();
 });
}
function readWeaponEntries(root){
 return [...root.querySelectorAll('[data-weapon-row]')].map(row=>{
  const get=k=>row.querySelector('[data-weapon-field="'+k+'"]')?.value.trim()||'';
  const name=get('name'),damage=get('damage'),properties=get('properties'),ammoRaw=get('ammo'),ammoType=get('ammoType');
  if(!name&&!damage&&!properties&&!ammoRaw&&!ammoType)return null;
  if(!name)throw Error('Every weapon needs a name.');
  if(ammoRaw&&!/^\d+$/.test(ammoRaw))throw Error('Ammo must be a nonnegative whole number.');
  const ammo=ammoRaw===''?null:Number(ammoRaw);
  if(ammo!==null&&!Number.isSafeInteger(ammo))throw Error('Ammo must be a safe whole number.');
  return {id:row.dataset.weaponRow||uid(),name,damage,properties,ammo,ammoType};
 }).filter(Boolean);
}
function weaponSummary(w){
 const tail=[w.properties];
 if(w.ammo!=null)tail.push('('+w.ammo+' '+(w.ammoType||'ammo')+')');
 return w.name+': '+(w.damage||'—')+(tail.filter(Boolean).length?' | '+tail.filter(Boolean).join(' · '):'');
}

function npcInput(key,label,item,type='text',extra=''){
 const value=item[key]??'',id='npcField_'+key;
 return '<div class="field"><label for="'+id+'">'+escapeHTML(label)+'</label>'+
  '<input id="'+id+'" data-npc-field="'+key+'" type="'+type+'" '+extra+' value="'+escapeHTML(value)+'"></div>';
}
function npcTextarea(key,label,value,rows=2){
 return '<div class="field"><label for="npcField_'+key+'">'+escapeHTML(label)+'</label><textarea id="npcField_'+key+'" data-npc-field="'+key+'" rows="'+rows+'">'+escapeHTML(value??'')+'</textarea></div>';
}
function fieldMarkup(item){
 const x={...item,numberAttacks:item.numberAttacks??1,drive:parsedDrive(item),tactics:parsedTactics(item)};
 return '<div class="npc-creator">'+
  '<div class="npc-editor-row npc-editor-three">'+npcInput('name','Name',x)+npcInput('role','Role',x)+npcInput('level','Level',x,'number','min="0" step="1"')+'</div>'+
  '<div class="npc-editor-row npc-editor-four">'+['bod','dex','mnd','cha'].map(k=>npcInput(k,k.toUpperCase(),x,'number','step="1"')).join('')+'</div>'+
  '<div class="npc-editor-row npc-editor-three">'+npcInput('hp','HP',x,'number','step="1"')+npcInput('hpMax','Max HP',x,'number','min="0" step="1"')+npcInput('mana','Mana',x,'number','step="1"')+'</div>'+
  '<div class="npc-editor-row npc-editor-three">'+npcInput('manaMax','Max Mana',x,'number','min="0" step="1"')+npcInput('drArmor','Armor DR',x,'number','step="1"')+npcInput('drNatural','Natural DR',x,'number','step="1"')+'</div>'+
  '<div class="npc-editor-row npc-editor-three">'+npcInput('drMagic','Magic DR',x,'number','step="1"')+npcInput('attack','ATK',x)+npcInput('defense','DEF',x)+'</div>'+
  '<div class="npc-editor-row npc-editor-two">'+npcInput('numberAttacks','Number of Attacks',x,'number','min="1" step="1"')+npcInput('tokenImage','Token image URL (optional)',x,'url')+'</div>'+
  '<div class="npc-weapon-editor-wrap"><div class="npc-weapon-heading"><strong>Weapons</strong><button type="button" class="small" data-add-weapon>+ Weapon</button></div><div data-weapon-editor>'+weaponEntries(x).map(weaponRowMarkup).join('')+'</div></div>'+npcTextarea('armor','Armor',x.armor)+npcTextarea('inventory','Inventory',x.inventory)+
  npcTextarea('tactics','Tactics',x.tactics,3)+npcTextarea('drive','Drive',x.drive,2)+
  '</div>';
}
function formData(root,previous){
 const data={...previous};
 for(const input of root.querySelectorAll('[data-npc-field]')){
  const k=input.dataset.npcField;
  data[k]=numbers.includes(k)?Number(input.value):input.value.trim();
  if(numbers.includes(k)&&(!Number.isFinite(data[k])||!Number.isInteger(data[k])))throw Error('All numeric fields must contain whole numbers.');
 }
 if(!data.name)throw Error('Enter a name.');
 if(data.numberAttacks!==undefined&&(!Number.isInteger(data.numberAttacks)||data.numberAttacks<1))throw Error('Number of attacks must be at least 1.');
 if(data.hpMax<0||data.manaMax<0)throw Error('Maximum HP and Mana cannot be negative.');
 if(data.hpMax>1000000||data.manaMax>1000000)throw Error('HP and Mana maximums must be under one million.');
 if(data.tokenImage&&!/^https:\/\//i.test(data.tokenImage))throw Error('Token artwork must use HTTPS.');
 // Keep the legacy Drive header out of tactics when the compact editor saves.
 if(typeof data.tactics==='string')data.tactics=data.tactics.trim();
 if(typeof data.drive==='string')data.drive=data.drive.trim();
 data.weaponEntries=readWeaponEntries(root);
 data.weapons=data.weaponEntries.map(weaponSummary).join('\n');
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
 $('npcBestiaryFields').innerHTML=fieldMarkup(master||defaultRecord());attachWeaponEditor($('npcBestiaryFields'));
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
 $('npcCombatFields').innerHTML=fieldMarkup(instance);attachWeaponEditor($('npcCombatFields'));
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
 const id=escapeHTML(x.id);
 const info=(label,value)=>'<div class="npc-combat-detail"><span>'+label+'</span><strong>'+escapeHTML(value||'—')+'</strong></div>';
 const numberAttacks=String(x.numberAttacks??1);

 const weaponBlocks=weaponEntries(x).map((w,index)=>{
  const ammo=w.ammo!==null&&w.ammo!==undefined;
  return '<div class="npc-weapon-display"><div class="npc-weapon-stats"><strong>'+escapeHTML(w.name||'Weapon')+':</strong> <span>'+escapeHTML(w.damage||'—')+'</span>'+
    (w.properties?' <span class="npc-weapon-props">| '+escapeHTML(w.properties)+'</span>':'')+
    (ammo?' <span class="npc-weapon-sep">|</span>':'')+'</div>'+
    (ammo?'<label class="npc-ammo-counter"><span>'+escapeHTML(w.ammoType||'Ammo')+'</span>'+
     '<button type="button" data-ammo-dec="'+id+'" data-weapon-index="'+index+'" title="Use one '+escapeHTML(w.ammoType||'ammo')+'">−</button>'+
     '<input type="number" min="0" step="1" data-ammo-input="'+id+'" data-weapon-index="'+index+'" value="'+escapeHTML(w.ammo)+'" aria-label="Ammo for '+escapeHTML(w.name)+'"></label>':'')+'</div>';
 }).join('');
 return '<article class="entry npc-entry npc-combat-card">'+
  '<div class="npc-combat-head"><div><h3>'+escapeHTML(x.name)+'</h3><p class="subtle-info">'+escapeHTML([x.role,x.level!=null?'Level '+x.level:''].filter(Boolean).join(' · '))+' · '+(hasToken?'Token linked':'Prepared')+'</p></div>'+
  '<details class="npc-more"><summary title="Combatant options" aria-label="Combatant options">…</summary><div class="npc-more-list">'+
  '<button data-combat-edit="'+id+'">Edit / Restat</button>'+
  '<button data-combat-promote="'+id+'">Save as Bestiary Entry</button>'+
  (hasToken?'<button data-combat-sync="'+id+'">Refresh HUD</button>':'<button data-combat-spawn="'+id+'">Spawn Token</button>')+
  '</div></details></div>'+
  '<div class="npc-combat-attributes">'+['BOD','DEX','MND','CHA'].map(k=>'<span>'+k+' '+escapeHTML(x[k.toLowerCase()]??'—')+'</span>').join('')+'</div>'+
  '<div class="npc-combat-vitals">'+
  '<label class="npc-hp-edit">HP <input data-combat-hp="'+id+'" type="number" step="1" aria-label="Current HP for '+escapeHTML(x.name)+'" value="'+escapeHTML(x.hp)+'"></label>'+
  '<span class="npc-max-hp">/ '+escapeHTML(x.hpMax)+' max</span>'+
  '<span>DR '+escapeHTML(Number(x.drArmor||0)+Number(x.drNatural||0)+Number(x.drMagic||0))+'</span>'+
  '<span>Mana '+escapeHTML(x.mana??0)+' / '+escapeHTML(x.manaMax??0)+'</span>'+ '<span>Attacks '+escapeHTML(numberAttacks)+'</span>'+
  '</div>'+
  '<div class="npc-combat-grid">'+info('ATK',x.attack)+info('DEF',x.defense)+info('Armor',x.armor)+info('Inventory',x.inventory)+'</div>'+
  '<div class="npc-weapon-list"><strong class="npc-weapon-list-title">Weapons</strong>'+(weaponBlocks||'<span class="muted">None</span>')+'</div>'+
  '<div class="npc-combat-bottom"><div class="npc-popup-actions">'+
  '<button data-combat-popup="tactics" data-combat-id="'+id+'">Tactics</button>'+
  '<button data-combat-popup="drive" data-combat-id="'+id+'">Drive</button></div>'+
  '<button class="npc-remove" data-combat-delete="'+id+'" title="Remove combatant and token" aria-label="Remove '+escapeHTML(x.name)+'">−</button></div>'+
  '</article>';
}
function showCombatPopup(combatant,kind){
 const dialog=$('npcInfoDialog');
 const heading=$('npcInfoTitle'),content=$('npcInfoText');
 if(!dialog)return;
 const isDrive=kind==='drive';
 heading.textContent=(isDrive?'Drive':'Tactics')+' — '+combatant.name;
 content.textContent=(isDrive?parsedDrive(combatant):parsedTactics(combatant))||'Not specified.';
 if(dialog.open)dialog.close();
 dialog.showModal();
}
function createInstance(master,existing){
 const c=ensure();if(!c)return null;
 const n=c.combatants.filter(x=>x.templateId===master.id).length+1;
 const item=structuredClone(master);
 item.id=uid();item.templateId=master.id;item.name=existing?master.name:master.name+' #'+n;item.tokenLinks={};item.createdAt=Date.now();item.weaponEntries=weaponEntries(master).map(w=>({...w,id:uid()}));
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
 container.querySelectorAll('[data-combat-hp]').forEach(input=>input.onchange=async()=>{
  const x=c.combatants.find(t=>t.id===input.dataset.combatHp);if(!x)return;
  const value=input.value.trim(),hp=Number(value);
  if(!value||!Number.isInteger(hp)){input.value=String(x.hp);return alert('Enter a whole number for HP.')}
  input.disabled=true;
  try{
   // Read any newer token controls before applying this direct change.
   await syncNPCsFromScene(true);
   x.hp=hp;x.npcUpdatedAt=Math.max(Date.now(),Number(x.npcUpdatedAt||0)+1);
   save();
   if(window.RPGNPCBattlefield?.ready&&x.tokenLinks?.[window.RPGNPCBattlefield.roomId])await window.RPGNPCBattlefield.updateHUD(x);
   renderBestiary();
  }catch(error){showError(error);renderBestiary()}
  finally{input.disabled=false}
 });

 function setAmmo(combatant,index,value){
  if(!gm())return;
  if(!Array.isArray(combatant.weaponEntries))combatant.weaponEntries=weaponEntries(combatant);
  const weapon=combatant.weaponEntries[index];if(!weapon)return;
  if(value===''||! /^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value)))return alert('Ammo must be a nonnegative whole number.');
  weapon.ammo=Number(value);save();renderBestiary();
 }
 container.querySelectorAll('[data-ammo-input]').forEach(input=>input.onchange=()=>{
  const combatant=c.combatants.find(x=>x.id===input.dataset.ammoInput);
  if(combatant)setAmmo(combatant,Number(input.dataset.weaponIndex),input.value.trim());
 });
 container.querySelectorAll('[data-ammo-dec]').forEach(button=>button.onclick=()=>{
  const combatant=c.combatants.find(x=>x.id===button.dataset.ammoDec);if(!combatant)return;
  const weapon=weaponEntries(combatant)[Number(button.dataset.weaponIndex)];
  if(weapon?.ammo===null||weapon?.ammo===undefined||Number(weapon.ammo)<=0)return;
  setAmmo(combatant,Number(button.dataset.weaponIndex),Number(weapon.ammo)-1);
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
 container.querySelectorAll('[data-combat-delete]').forEach(b=>b.onclick=async()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatDelete);if(!x)return;
  if(!confirm('Remove '+x.name+' and its battlefield token? The Bestiary entry stays.'))return;
  const engine=window.RPGNPCBattlefield;
  if(Object.keys(x.tokenLinks||{}).length){
   if(!engine?.ready)return alert('Open the linked Owlbear room as GM to remove this token and its combatant.');
   if(x.tokenLinks[engine.roomId]){
    try{await engine.remove(x)}catch(error){showError(error);return}
   }else return alert('This combatant has a token in another Owlbear room. Remove it from that room first.');
  }
  c.combatants=c.combatants.filter(t=>t.id!==x.id);save();renderBestiary();
 });
 container.querySelectorAll('[data-combat-popup]').forEach(b=>b.onclick=()=>{
  const x=c.combatants.find(t=>t.id===b.dataset.combatId);
  if(x)showCombatPopup(x,b.dataset.combatPopup);
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