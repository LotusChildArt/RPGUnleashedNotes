(function(){
'use strict';
const $=id=>document.getElementById(id);
const monthsDefault=[['January',31],['February',28],['March',31],['April',30],['May',31],['June',30],['July',31],['August',31],['September',30],['October',31],['November',30],['December',31]];
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const uid=()=>crypto.randomUUID();
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const integer=(v,min,max)=>Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
const gm=()=>state.role==='gm'&&owlAccessRole!=='PLAYER'&&owlAccessRole!=='UNKNOWN';
const defaultClock=()=>({id:uid(),name:'Traditional Clock',hours:24,minutes:60,format:'24',periods:[{start:0,name:'Night'},{start:5,name:'Dawn'},{start:7,name:'Day'},{start:12,name:'Noon'},{start:13,name:'Day'},{start:18,name:'Dusk'},{start:20,name:'Night'}]});
const defaultCalendar=()=>({id:uid(),name:'Traditional Calendar',months:monthsDefault.map(([name,days])=>({name,days})),leap:true,weekLength:7,weekMode:'continuous',groupName:'Week',dayNames:weekdays.slice(),offset:1});
function legacyDay(c){
 const value=c.campaignTime||'0001-01-01T08:00';
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
 if(!match)return {day:0,phase:1/3};
 const [y,m,d,h,min]=match.slice(1).map(Number);
 const dt=new Date(0);dt.setUTCHours(0,0,0,0);dt.setUTCFullYear(y,m-1,d);
 const base=new Date(0);base.setUTCHours(0,0,0,0);base.setUTCFullYear(1,0,1);
 return {day:Math.max(0,Math.round((dt-base)/86400000)),phase:Math.min(.999999,Math.max(0,(h*60+min)/1440))};
}
function data(){
 const c=current();if(!c)return null;
 if(!c.timekeeping||!Array.isArray(c.timekeeping.clocks)||!Array.isArray(c.timekeeping.calendars)){
  const legacy=legacyDay(c);
  c.timekeeping={day:legacy.day,phase:legacy.phase,clocks:[defaultClock()],calendars:[defaultCalendar()]};
 }
 c.timekeeping.day=Math.max(0,Math.floor(Number(c.timekeeping.day)||0));
 c.timekeeping.phase=Math.min(.999999999,Math.max(0,Number(c.timekeeping.phase)||0));
 return c.timekeeping;
}
let subtab='clock',openedClock=null,openedCalendar=null,editingClock=null,editingCalendar=null;
const monthViews={};
function setTab(next){
 subtab=next;
 for(const key of ['clock','calendar']){
  $('time'+key[0].toUpperCase()+key.slice(1)+'Pane').classList.toggle('hidden',key!==next);
  const button=$('timeTab'+key[0].toUpperCase()+key.slice(1));
  button.classList.toggle('active',key===next);
  button.setAttribute('aria-selected',String(key===next));
 }
}
function niceClock(t,k){
 const total=k.hours*k.minutes;
 const pos=Math.min(total-1,Math.floor(t.phase*total+1e-8));
 let h=Math.floor(pos/k.minutes),m=pos%k.minutes,marker='';
 if(k.format==='12'&&k.hours%2===0){
  const half=k.hours/2;marker=h<half?' AM':' PM';h=h%half||half;
 }
 const p=[...(k.periods||[])].sort((a,b)=>a.start-b.start);
 const hh=Math.floor(pos/k.minutes);
 const chosen=[...p].reverse().find(x=>x.start<=hh)||p[p.length-1];
 return {time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+marker,period:chosen?.name||''};
}
function drawClocks(t){
 const host=$('clockCards');host.replaceChildren();
 for(const k of t.clocks){
  const item=document.createElement('div');item.className='entry';
  const display=niceClock(t,k),open=openedClock===k.id;
  item.innerHTML='<button type="button" class="place-add-toggle" data-expand="'+escapeHTML(k.id)+'" aria-expanded="'+open+'">'+(open?'▾':'▸')+' '+escapeHTML(k.name)+'</button>'+
  (open?'<div class="time-expanded"><div class="time-clock">'+escapeHTML(display.time)+'</div><p class="muted">'+escapeHTML(display.period)+' · '+k.hours+' hours/day · '+k.minutes+' minutes/hour</p>'+
  (gm()?'<div class="field-row"><div class="field"><label>Hour (0–'+(k.hours-1)+')</label><input type="number" data-clock-hour min="0" max="'+(k.hours-1)+'" value="'+Math.floor(t.phase*k.hours)+'"></div><div class="field"><label>Minute (0–'+(k.minutes-1)+')</label><input type="number" data-clock-minute min="0" max="'+(k.minutes-1)+'" value="'+Math.floor((t.phase*k.hours%1)*k.minutes)+'"></div></div><div class="actions"><button class="small primary" data-clock-set>Set time</button><button class="small" data-clock-advance="15">+15 min</button><button class="small" data-clock-advance="60">+1 hour</button><button class="small" data-clock-advance="day">+1 day</button></div><div class="actions"><button class="small" data-clock-edit>Edit</button><button class="small" data-clock-copy>Duplicate</button><button class="small" data-clock-delete>Delete</button></div>':'')+'</div>':'');
  item.querySelector('[data-expand]').onclick=()=>{openedClock=open?null:k.id;render()};
  if(open&&gm()){
   item.querySelector('[data-clock-set]').onclick=()=>{
    const h=Number(item.querySelector('[data-clock-hour]').value),m=Number(item.querySelector('[data-clock-minute]').value);
    if(!integer(h,0,k.hours-1)||!integer(m,0,k.minutes-1))return alert('Enter a valid hour and minute.');
    t.phase=(h*k.minutes+m)/(k.hours*k.minutes);persist();
   };
   item.querySelectorAll('[data-clock-advance]').forEach(b=>b.onclick=()=>{
    const v=b.dataset.clockAdvance;
    if(v==='day'){t.day+=1;persist();return}
    const delta=Number(v)/(k.hours*k.minutes);
    const sum=t.phase+delta;t.day+=Math.floor(sum);t.phase=sum-Math.floor(sum);persist();
   });
   item.querySelector('[data-clock-edit]').onclick=()=>openClockForm(k);
   item.querySelector('[data-clock-copy]').onclick=()=>{const x=structuredClone(k);x.id=uid();x.name+=' (Copy)';t.clocks.push(x);openedClock=x.id;persist()};
   item.querySelector('[data-clock-delete]').onclick=()=>{if(!confirm('Delete this clock?'))return;t.clocks=t.clocks.filter(x=>x.id!==k.id);openedClock=null;persist()};
  }
  host.append(item);
 }
 if(!t.clocks.length)host.innerHTML='<p class="muted">No clocks yet. Add a clock to begin.</p>';
}
function leapYear(y){return y%4===0&&(y%100!==0||y%400===0)}
function lengthOf(c,y,m){return c.months[m].days+(c.leap&&m===1&&leapYear(y)?1:0)}
function daysInYear(c,y){return c.months.reduce((s,x,m)=>s+lengthOf(c,y,m),0)}
function toDate(c,index){
 let year=1,rest=Math.max(0,Math.floor(index));
 if(c.leap){
  const fourHundred=146097,centuries=Math.floor(rest/fourHundred);
  year+=centuries*400;rest-=centuries*fourHundred;
 }
 const common=c.months.reduce((a,m)=>a+m.days,0);
 if(!c.leap&&common>0){year+=Math.floor(rest/common);rest%=common}
 else{while(rest>=daysInYear(c,year)&&year<99999){rest-=daysInYear(c,year);year++}}
 let month=0;while(month<c.months.length-1&&rest>=lengthOf(c,year,month)){rest-=lengthOf(c,year,month);month++}
 return {year,month,day:rest+1};
}
function toIndex(c,year,month,day){
 let index=0;
 const common=c.months.reduce((a,m)=>a+m.days,0);
 if(c.leap){
  const n=year-1;index=n*common+Math.floor(n/4)-Math.floor(n/100)+Math.floor(n/400);
 }else index=(year-1)*common;
 for(let i=0;i<month;i++)index+=lengthOf(c,year,i);
 return index+day-1;
}
function calendarGrid(c,year,month,currentIndex){
 const days=lengthOf(c,year,month),start=toIndex(c,year,month,1);
 const cols=c.weekMode==='none'?7:c.weekLength;
 const names=c.weekMode==='none'?[]:Array.from({length:cols},(_,i)=>c.dayNames?.[i]||('Day '+(i+1)));
 const offset=c.weekMode==='reset'?0:((start+(c.offset||0))%cols+cols)%cols;
 const cells=[];
 if(names.length)for(const n of names)cells.push('<span class="weekday">'+escapeHTML(n)+'</span>');
 for(let i=0;i<offset;i++)cells.push('<span class="empty-day"></span>');
 for(let i=1;i<=days;i++){
  const index=start+i-1,active=index===currentIndex;
  cells.push('<span class="time-day '+(active?'current-day':'')+'" '+(active?'aria-current="date"':'')+'>'+i+'</span>');
 }
 return '<div class="time-calendar" style="grid-template-columns:repeat('+cols+',minmax(0,1fr))">'+cells.join('')+'</div>';
}
function drawCalendars(t){
 const host=$('calendarCards');host.replaceChildren();
 for(const cal of t.calendars){
  const currentDate=toDate(cal,t.day),open=openedCalendar===cal.id;
  const item=document.createElement('div');item.className='entry';
  item.innerHTML='<button type="button" class="place-add-toggle" data-expand aria-expanded="'+open+'">'+(open?'▾':'▸')+' '+escapeHTML(cal.name)+'</button>'+
   (open?'<div class="time-expanded"><p class="muted">Current: '+escapeHTML(cal.months[currentDate.month].name)+' '+currentDate.day+', Year '+currentDate.year+'</p><div class="line"><h3 data-cal-label></h3><div class="actions"><button class="small" data-month-prev>←</button><button class="small" data-month-now>Current</button><button class="small" data-month-next>→</button></div></div><div data-cal-grid></div>'+
   (gm()?'<div class="field-row"><div class="field"><label>Year</label><input type="number" min="1" max="99999" data-set-year value="'+currentDate.year+'"></div><div class="field"><label>Month</label><select data-set-month>'+cal.months.map((m,i)=>'<option value="'+i+'" '+(i===currentDate.month?'selected':'')+'>'+escapeHTML(m.name)+'</option>').join('')+'</select></div></div><div class="field"><label>Day</label><input type="number" min="1" data-set-day value="'+currentDate.day+'"></div><div class="actions"><button class="small primary" data-set-date>Set date</button><button class="small" data-day-advance>+1 day</button></div><div class="actions"><button class="small" data-cal-edit>Edit</button><button class="small" data-cal-copy>Duplicate</button><button class="small" data-cal-delete>Delete</button></div>':'')+'</div>':'');
  item.querySelector('[data-expand]').onclick=()=>{openedCalendar=open?null:cal.id;render()};
  if(open){
   let offset=monthViews[cal.id]||0;
   function updateView(){
    const cursor=toDate(cal,t.day),total=cursor.year*cal.months.length+cursor.month+offset,base=cursor.year*cal.months.length;
    const year=Math.max(1,Math.floor((total-1)/cal.months.length));
    const month=Math.max(0,Math.min(cal.months.length-1,total-year*cal.months.length));
    item.querySelector('[data-cal-label]').textContent=cal.months[month].name+' · Year '+year;
    item.querySelector('[data-cal-grid]').innerHTML=calendarGrid(cal,year,month,t.day);
   }
   // Month offset is relative to the currently displayed campaign month.
   item.querySelector('[data-month-prev]').onclick=()=>{monthViews[cal.id]=(monthViews[cal.id]||0)-1;updateView()};
   item.querySelector('[data-month-next]').onclick=()=>{monthViews[cal.id]=(monthViews[cal.id]||0)+1;updateView()};
   item.querySelector('[data-month-now]').onclick=()=>{monthViews[cal.id]=0;updateView()};
   updateView();
   if(gm()){
    item.querySelector('[data-set-date]').onclick=()=>{
     const y=Number(item.querySelector('[data-set-year]').value),m=Number(item.querySelector('[data-set-month]').value),d=Number(item.querySelector('[data-set-day]').value);
     if(!integer(y,1,99999)||!integer(m,0,cal.months.length-1)||!integer(d,1,lengthOf(cal,y,m)))return alert('Enter a valid year, month and day.');
     t.day=toIndex(cal,y,m,d);monthViews[cal.id]=0;persist();
    };
    item.querySelector('[data-day-advance]').onclick=()=>{t.day++;persist()};
    item.querySelector('[data-cal-edit]').onclick=()=>openCalendarForm(cal);
    item.querySelector('[data-cal-copy]').onclick=()=>{const x=structuredClone(cal);x.id=uid();x.name+=' (Copy)';t.calendars.push(x);openedCalendar=x.id;persist()};
    item.querySelector('[data-cal-delete]').onclick=()=>{if(!confirm('Delete this calendar?'))return;t.calendars=t.calendars.filter(x=>x.id!==cal.id);openedCalendar=null;persist()};
   }
  }
  host.append(item);
 }
 if(!t.calendars.length)host.innerHTML='<p class="muted">No calendars yet. Add a calendar to begin.</p>';
}
function persist(){if(!gm())return;save();render()}
function render(){
 if(!$('timeClockPane'))return;
 const t=data();if(!t)return;
 setTab(subtab);
 $('addClockButton').classList.toggle('hidden',!gm());
 $('addCalendarButton').classList.toggle('hidden',!gm());
 if(!gm()){$('clockCreateCard').classList.add('hidden');$('calendarCreateCard').classList.add('hidden')}
 drawClocks(t);drawCalendars(t);
}
function openClockForm(clock){
 if(!gm())return;
 editingClock=clock?.id||null;
 const k=clock||defaultClock();
 $('clockCreateCard').classList.remove('hidden');
 $('clockFormHeading').textContent=clock?'Edit Clock':'Create Clock';
 $('clockPreset').value=clock?'custom':'traditional';
 $('clockName').value=clock?.name||'Traditional Clock';
 $('clockHours').value=k.hours;$('clockMinutes').value=k.minutes;$('clockFormat').value=k.format;
 $('clockPeriodPreset').value='custom';
 $('clockPeriods').value=(k.periods||[]).map(x=>x.start+'|'+x.name).join('\n');
 applyClockPresetFields();
 $('clockCreateCard').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function applyClockPresetFields(){
 const traditional=$('clockPreset').value==='traditional'&&!editingClock;
 $('clockCustomFields').classList.toggle('hidden',traditional);
 if(traditional)$('clockName').value='Traditional Clock';
}
function periodPreset(kind,hours){
 if(kind==='simple')return [{start:0,name:'Night'},{start:Math.floor(hours/4),name:'Day'},{start:Math.floor(hours*3/4),name:'Night'}];
 if(kind==='detailed')return [{start:0,name:'Night'},{start:Math.floor(hours*.20),name:'Dawn'},{start:Math.floor(hours*.30),name:'Day'},{start:Math.floor(hours*.50),name:'Noon'},{start:Math.floor(hours*.55),name:'Day'},{start:Math.floor(hours*.75),name:'Dusk'},{start:Math.floor(hours*.85),name:'Night'}];
 return [];
}
$('clockPreset').onchange=applyClockPresetFields;
$('clockPeriodPreset').onchange=()=>{
 const type=$('clockPeriodPreset').value;
 if(type!=='custom')$('clockPeriods').value=periodPreset(type,Number($('clockHours').value)||24).map(x=>x.start+'|'+x.name).join('\n');
};
$('clockCancel').onclick=()=>{$('clockCreateCard').classList.add('hidden');editingClock=null};
$('addClockButton').onclick=()=>openClockForm(null);
$('clockFormSave').onclick=()=>{
 if(!gm())return;
 const t=data(),traditional=$('clockPreset').value==='traditional'&&!editingClock;
 let k=traditional?defaultClock():null;
 if(!traditional){
  const hours=Number($('clockHours').value),minutes=Number($('clockMinutes').value),format=$('clockFormat').value;
  if(!integer(hours,2,1000)||!integer(minutes,1,1000))return alert('Hours must be 2–1000, and minutes must be 1–1000.');
  if(format==='12'&&hours%2!==0)return alert('AM/PM clocks need an even number of hours per day.');
  let periods=[];
  const lines=$('clockPeriods').value.split(/\n/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines){
   const m=line.match(/^(\d+)\s*\|\s*(.+)$/);
   if(!m||!integer(m[1],0,hours-1))return alert('Enter each period as START HOUR|NAME, within the hours per day.');
   periods.push({start:Number(m[1]),name:m[2].trim()});
  }
  if(periods.length===0)return alert('Enter at least one day period.');
  periods.sort((a,b)=>a.start-b.start);
  if(periods[0].start!==0||periods.some((p,i)=>i>0&&p.start===periods[i-1].start))return alert('Periods must start at hour 0 and have unique start hours.');
  k={id:editingClock||uid(),name:$('clockName').value.trim(),hours,minutes,format,periods};
 }
 if(!k.name)return alert('Enter a clock name.');
 const i=t.clocks.findIndex(x=>x.id===editingClock);
 if(i>=0)t.clocks[i]=k;else t.clocks.push(k);
 openedClock=k.id;editingClock=null;$('clockCreateCard').classList.add('hidden');persist();
};
function openCalendarForm(cal){
 if(!gm())return;
 editingCalendar=cal?.id||null;const c=cal||defaultCalendar();
 $('calendarCreateCard').classList.remove('hidden');
 $('calendarFormHeading').textContent=cal?'Edit Calendar':'Create Calendar';
 $('calendarPreset').value=cal?'custom':'traditional';
 $('calendarName').value=cal?.name||'Traditional Calendar';
 $('calendarMonths').value=c.months.map(m=>m.name+'|'+m.days).join('\n');
 $('calendarWeekMode').value=c.weekMode;
 $('calendarWeekLength').value=c.weekLength;
 $('calendarGroupName').value=c.groupName||'Week';
 $('calendarDayNames').value=(c.dayNames||[]).join(', ');
 $('calendarWeekOffset').value=c.offset||0;
 $('calendarLeap').checked=!!c.leap;
 applyCalendarPresetFields();
 $('calendarCreateCard').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function applyCalendarPresetFields(){
 const traditional=$('calendarPreset').value==='traditional'&&!editingCalendar;
 $('calendarCustomFields').classList.toggle('hidden',traditional);
 if(traditional)$('calendarName').value='Traditional Calendar';
}
$('calendarPreset').onchange=applyCalendarPresetFields;
$('calendarCancel').onclick=()=>{$('calendarCreateCard').classList.add('hidden');editingCalendar=null};
$('addCalendarButton').onclick=()=>openCalendarForm(null);
$('calendarFormSave').onclick=()=>{
 if(!gm())return;
 const t=data(),traditional=$('calendarPreset').value==='traditional'&&!editingCalendar;
 let c=traditional?defaultCalendar():null;
 if(!traditional){
  const lines=$('calendarMonths').value.split(/\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length||lines.length>120)return alert('Enter between 1 and 120 months.');
  const months=[];
  for(const line of lines){
   const match=line.match(/^(.+?)\s*\|\s*(\d+)$/);
   if(!match||!integer(match[2],1,1000))return alert('Enter each month as NAME|DAYS (1–1000).');
   months.push({name:match[1].trim(),days:Number(match[2])});
  }
  const weekMode=$('calendarWeekMode').value;
  const weekLength=Number($('calendarWeekLength').value);
  if(weekMode!=='none'&&!integer(weekLength,1,30))return alert('A grouping must contain 1–30 days.');
  const names=$('calendarDayNames').value.split(',').map(x=>x.trim()).filter(Boolean);
  if(weekMode!=='none'&&names.length&&names.length!==weekLength)return alert('Provide one comma-separated day name per grouping day, or leave names blank.');
  const offset=Number($('calendarWeekOffset').value);
  if(!integer(offset,0,Math.max(0,weekLength-1)))return alert('Choose a valid grouping offset.');
  const leap=$('calendarLeap').checked;
  if(leap&&(months.length<2||months[1].days!==28))return alert('Gregorian leap years require a second month of 28 days.');
  c={id:editingCalendar||uid(),name:$('calendarName').value.trim(),months,leap,weekMode,weekLength:weekMode==='none'?7:weekLength,groupName:$('calendarGroupName').value.trim()||'Group',dayNames:names,offset};
 }
 if(!c.name)return alert('Enter a calendar name.');
 const i=t.calendars.findIndex(x=>x.id===editingCalendar);
 if(i>=0)t.calendars[i]=c;else t.calendars.push(c);
 openedCalendar=c.id;editingCalendar=null;$('calendarCreateCard').classList.add('hidden');persist();
};
$('timeTabClock').onclick=()=>setTab('clock');
$('timeTabCalendar').onclick=()=>setTab('calendar');
window.rpgTimeRender=render;
render();
})();