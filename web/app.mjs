import {parseLog,prepare,report,seconds} from './model.mjs';
const $=id=>document.getElementById(id);
const node=(name,content,cls)=>{const e=document.createElement(name);if(content!=null)e.textContent=content;if(cls)e.className=cls;return e;};
const name=i=>i===0?'Walk A':'Walk B';
const walks=[[],[]], checkpoints=[], loads=[0,0];
const signed=n=>(n>0?'+':'')+String(n)+' s';
let active=-1,page=0;
function start(i) {return walks[i][0]?.t ?? 0;}
function zero(i) {return start(i)+(active<0?0:checkpoints[active].times[i]*1000);}
function elapsed(e,i) {return seconds(e.t-zero(i));}
function describe(e){
  if(e.type==='Phone') return e.details;
  const metric=e.type==='LTE'?'RSRP':'SS-RSRP';
  return [e.role.replaceAll('_',' ').toLowerCase(),metric+' '+(e.power==null?'unreported':e.power+' dBm'),
    e.type==='NR'&&e.csi!=null&&'CSI-RSRP '+e.csi+' dBm',e.changed&&'serving cell changed'].filter(Boolean).join(' · ');
}
function fillAnchors() {
  const select=$('anchor');
  select.replaceChildren(new Option('Recording starts','-1'),...checkpoints.map((p,i)=>new Option(p.label,String(i))));
  select.value=active;
}
async function importWalk(i) {
  const mine=++loads[i];
  const files=[...$('walk'+i).files],logs=[],messages=[];
  $('info'+i).textContent='Reading selected files…';
  for(const file of files) {
    try{
      const log=parseLog(await file.text());logs.push(log);
      messages.push(log.type+' '+log.events.length.toLocaleString()+' records'+(log.rejected?' ('+log.rejected+' invalid timestamps skipped)':''));
    } catch(error) {messages.push(file.name+' — '+error.message);}
  }
  if(mine!==loads[i]) return;
  walks[i]=prepare(logs);
  const w=walks[i], duration=w.length?seconds(w.at(-1).t-start(i)):0;
  $('info'+i).textContent=[...messages,w.length?'Start '+w[0].timestamp+' · '+duration+' s elapsed':''].filter(Boolean).join(' / ') || 'No files selected.';
  $(i===0?'aTime':'bTime').max=String(duration);
  if(checkpoints.length) $('markerStatus').textContent='Checkpoints cleared because a recording changed.';
  checkpoints.length=0; active=-1;page=0;fillAnchors();
  if(w.length && !walks[1-i].length) $('recordsWalk').value=String(i);
  draw();
}
[0,1].forEach(i=>$('walk'+i).addEventListener('change',()=>importWalk(i)));
$('marker').onsubmit=e=>{
  e.preventDefault();
  const label=$('name').value.trim(), times=[$('aTime').valueAsNumber,$('bTime').valueAsNumber];
  if(!label || !times.every((t,i)=>Number.isFinite(t) && t>=0 && walks[i].length && t<=seconds(walks[i].at(-1).t-start(i)))) {
    $('markerStatus').textContent='Enter a name and a time within each recording.';return;
  }
  checkpoints.push({label,times});active=checkpoints.length-1;fillAnchors();page=0;
  $('markerStatus').textContent='Aligned to '+label+'.';$('marker').reset();draw();
};
$('anchor').onchange=()=>{active=Number($('anchor').value);page=0;$('markerStatus').textContent='';draw();};
$('remove').onclick=()=>{checkpoints.splice(active,1);active=-1;fillAnchors();page=0;draw();};
$('export').onclick=()=>{
  const data=report(walks,checkpoints,active);
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=node('a');a.href=url;a.download='signal-walk-report.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function table(){
  const i=Number($('recordsWalk').value),w=walks[i],size=35;
  $('records').replaceChildren(...w.slice(page*size,(page+1)*size).map(e=>{
    const tr=node('tr');[signed(elapsed(e,i)),e.timestamp,e.type,describe(e)].forEach(v=>tr.append(node('td',v)));return tr;
  }));
  $('prev').disabled=page===0;$('next').disabled=(page+1)*size>=w.length;
  $('page').textContent=w.length?`${page*size+1}–${Math.min(w.length,(page+1)*size)} of ${w.length.toLocaleString()}`:'No observations in this walk.';
}
$('recordsWalk').onchange=()=>{page=0;table();};$('prev').onclick=()=>{page--;table();};$('next').onclick=()=>{page++;table();};
function nearby(i) {
  const out=node('div',null,'readings');out.append(node('h4',name(i)));
  let available=0;
  for(const type of ['LTE','NR','Phone']){
    let nearest=null;let distance=Infinity;
    for (const e of walks[i]) {
      if(e.type!==type || (type!=='Phone' && !['PRIMARY_SERVING','SECONDARY_SERVING'].includes(e.role))) continue;
      const d=Math.abs(e.t-zero(i));
      if(d<distance && d<=15000){nearest=e;distance=d;}
    }
    if(nearest){available++;out.append(node('p',type+' ('+signed(elapsed(nearest,i))+') — '+describe(nearest)));}
  }
  if(!available)out.append(node('p','No observations within 15 s.'));
  return out;
}
function plot(i,min,max) {
  const box=node('div',null,'plot'),can=node('canvas');
  can.width=650;can.height=205;can.setAttribute('role','img');can.setAttribute('aria-label',name(i)+' serving signal by aligned time; exact observations follow.');
  box.append(node('h3',name(i)),can);
  const ctx=can.getContext('2d'),left=58,right=635,top=13,bottom=174;
  const x=t=>left+(right-left)*(t-min)/(max-min),y=power=>top+(-30-power)/130*(bottom-top);
  ctx.font='15px Arial';ctx.fillStyle='#415864';ctx.strokeStyle='#c9d6d9';
  for(const power of [-40,-80,-120,-160]){
    ctx.fillText(String(power),9,y(power)+4);ctx.beginPath();ctx.moveTo(left,y(power));ctx.lineTo(right,y(power));ctx.stroke();
  }
  ctx.fillText(signed(min),left,bottom+22);ctx.textAlign='right';ctx.fillText(signed(max),right,bottom+22);
  ctx.strokeStyle='#7e9195';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x(0),top);ctx.lineTo(x(0),bottom);ctx.stroke();ctx.setLineDash([]);
  let count=0;
  for(const e of walks[i]){
    if(e.power==null || !['PRIMARY_SERVING','SECONDARY_SERVING'].includes(e.role)) continue;
    count++;ctx.fillStyle=e.type==='LTE'?'#08746c':'#a45025';ctx.beginPath();ctx.arc(x(elapsed(e,i)),y(e.power),2.9,0,2*Math.PI);ctx.fill();
  }
  box.append(node('small',count?count.toLocaleString()+' points · LTE teal / NR rust · dBm':'No serving-cell power observations.'));
  return box;
}
function draw() {
  const used=walks.some(w=>w.length);
  $('analysis').hidden=!used;$('empty').hidden=used;$('export').disabled=!used;
  $('add').disabled=!walks.every(w=>w.length);$('remove').disabled=active<0;
  if(!used)return;
  const starts=walks.map((w,i)=>w.length?elapsed(w[0],i):0),ends=walks.map((w,i)=>w.length?elapsed(w.at(-1),i):0);
  const min=Math.min(0,...starts), max=Math.max(min+1,...ends);
  $('axisHelp').textContent=active<0?'Zero is the first record of each walk.':`Zero is ${checkpoints[active].label} at ${checkpoints[active].times[0]} s in A and ${checkpoints[active].times[1]} s in B.`;
  $('plots').replaceChildren(...[0,1].map(i=>plot(i,min,max)));
  $('near').replaceChildren(...[0,1].map(nearby));table();
}
