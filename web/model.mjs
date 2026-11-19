const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const stateNames = new Set(['HOME','ROAMING','REGISTERED','REGISTERED_HOME','REGISTERED_ROAMING','DENIED','SEARCHING','NOT_REGISTERED','NOT_REGISTERED_OR_SEARCHING','NOT_REGISTERED_SEARCHING','NOT_REG_SEARCHING','NOT_REG_NOT_SEARCHING','REG_DENIED','IN_SERVICE','OUT_OF_SERVICE','EMERGENCY_ONLY','POWER_OFF','UNKNOWN','EMERGENCY']);
const sims = new Set(['UNKNOWN','ABSENT','PIN_REQUIRED','PUK_REQUIRED','NETWORK_LOCKED','READY','NOT_READY','PERM_DISABLED','CARD_IO_ERROR','CARD_RESTRICTED','LOADED','PRESENT']);
const techs = new Set('GPRS EDGE UMTS CDMA EVDO_0 EVDO_A ONE_X_RTT RTT_1X HSDPA HSUPA HSPA IDEN EVDO_B LTE EHRPD HSPAP GSM TD_SCDMA IWLAN LTE_CA NR UNKNOWN'.split(' '));
const domains = new Set(['CS','PS','CS_PS','BOTH','UNKNOWN']);
function enumName(value, allowed, prefix='') {
  const text = String(value ?? '').trim().toUpperCase().replace(/[ -]/g,'_').replace(prefix,'');
  return allowed.has(text) ? text : '';
}
function number(value, min, max) {
  if (value == null || String(value).trim()==='') return null;
  const n = Number(value); return Number.isFinite(n) && n>=min && n<=max ? n : null;
}
export function csvRows(text) {
  text = text.replace(/^\uFEFF/,'').replace(/^(?:\s*#[^\r\n]*(?:\r\n|\n|\r))+/, '');
  const rows=[]; let row=[], field='', quoted=false;
  for (let i=0;i<text.length;i++){
    const c=text[i];
    if (c==='"') {
      if (quoted && text[i+1]==='"') {field+='"';i++;}
      else if (quoted || field==='') quoted=!quoted;
      else field+=c;
    } else if (c===',' && !quoted) {row.push(field);field='';}
    else if ((c==='\r' || c==='\n') && !quoted) {
      if(c==='\r' && text[i+1]==='\n') i++;
      row.push(field);if(row.some(v=>v.trim())) rows.push(row);row=[];field='';
    } else field+=c;
  }
  if (quoted) throw Error('A quoted CSV field is incomplete.');
  row.push(field); if(row.some(v=>v.trim())) rows.push(row);
  return rows;
}
function phoneDetails(raw, direct, sim) {
  let info=[];
  if(raw) {try {const parsed=JSON.parse(raw);info=Array.isArray(parsed)?parsed:[parsed];} catch { /* Unknown formats stay unreported. */ }}
  const entries=[];
  for (const item of info) {
    if (!item || typeof item!=='object') continue;
    const domain=enumName(item.domain,domains,'DOMAIN_');
    const tech=enumName(item.accessNetworkTechnology ?? item.access_network_technology,techs,'NETWORK_TYPE_');
    const state=enumName(item.registrationState ?? item.registration_state ?? item.networkRegistrationState,stateNames,'REGISTRATION_STATE_');
    const reject=number(item.rejectCause ?? item.reject_cause,0,65535);
    const roaming = item.roaming === true ? 'roaming reported' : '';
    entries.push([domain,tech,state && state.replaceAll('_',' '),reject && 'reject cause '+reject,roaming].filter(Boolean).join(' · '));
  }
  const directState=enumName(direct,stateNames,'REGISTRATION_STATE_');
  const simState=enumName(sim,sims,'SIM_STATE_');
  const hasState=Boolean(directState) || info.some(item=>item && enumName(item.registrationState ?? item.registration_state ?? item.networkRegistrationState,stateNames,'REGISTRATION_STATE_'));
  return [directState && directState.replaceAll('_',' '),...new Set(entries),!hasState && 'Registration state unreported',simState && 'SIM '+simState].filter(Boolean).join(' / ');
}
export function parseLog(text) {
  const [header,...rows]=csvRows(text);
  if (!header) throw Error('Empty CSV.');
  const keys=header.map(normalize);
  const index=(...aliases)=> aliases.map(a=>keys.indexOf(a)).find(i=>i>=0) ?? -1;
  const time=index('devicetime','timestamp','datetime');
  if(time<0) throw Error('Missing deviceTime column.');
  const registered=index('registrationstate','networkregistrationstate','servicestate');
  const type=keys.includes('networkregistrationinfo') || keys.includes('simstate') || registered>=0 ? 'Phone' : keys.some(k=>['ssrsrp','csirsrp','nci','narfcn'].includes(k)) ? 'NR' : keys.some(k=>['rsrp','eci','earfcn'].includes(k)) ? 'LTE' : '';
  if(!type) throw Error('Expected LTE, NR or phone-state CSV columns.');
  const fields=Object.fromEntries(['rsrp','ssrsrp','csirsrp','nci','eci','simstate','networkregistrationinfo','servingcell','connectionstatus','slot','plmn','mcc','mnc'].map(k=>[k,index(k)]));
  let rejected=0;
  const events=[];
  for(const row of rows) {
    const get=k=>row[fields[k]]?.trim() || '';
    const timestamp=row[time]?.trim();
    const t=Date.parse(timestamp);
    if(!Number.isFinite(t)){rejected++;continue;}
    const base={t,timestamp,type,slot:get('slot')};
    if(type==='Phone'){
      events.push({...base,details:phoneDetails(get('networkregistrationinfo'),row[registered],get('simstate'))});continue;
    }
    let role = get('connectionstatus').toUpperCase();
    if(!['PRIMARY_SERVING','SECONDARY_SERVING','NEIGHBOR'].includes(role)) {
      const flag=get('servingcell').toLowerCase();
      role=['true','1'].includes(flag)?'PRIMARY_SERVING':['false','0'].includes(flag)?'NEIGHBOR':'UNKNOWN';
    }
    const id = get(type==='LTE'?'eci':'nci');
    const plmn = get('plmn') || [get('mcc'),get('mnc')].join('-');
    const cell=/^\d+$/.test(id) && Number(id)<(type==='LTE'?2**28:2**36) ? plmn+'/'+id : '';
    events.push({...base, role,cell, changed:false, power:type==='NR'?number(get('ssrsrp'),-156,-31):number(get('rsrp'),-140,-44),
                 csi:type==='NR'?number(get('csirsrp'),-140,-44):null});
  }
  return {events,rejected,type};
}
export function prepare(logs) {
  const events=logs.flatMap(log=>log.events).sort((a,b)=>a.t-b.t);
  const prev=new Map();
  for(const e of events) {
    if(!['PRIMARY_SERVING','SECONDARY_SERVING'].includes(e.role)) continue;
    const channel=e.type+'|'+e.slot+'|'+e.role;
    e.changed=Boolean(e.cell && prev.get(channel) && e.cell!==prev.get(channel));
    prev.set(channel,e.cell);
  }
  return events;
}
export const seconds=(ms)=>Math.round(ms)/1000;
export function report(walks,checkpoints,active) {
  return {format:'Signal Walk 1', timing:'Seconds relative to the selected checkpoint, or to each recording start.',
    checkpoints:checkpoints.map((p,i)=>({checkpoint:i+1,walkA:p.times[0],walkB:p.times[1]})),
    alignedTo:active<0?'Recording starts':'Checkpoint '+(active+1),walks:walks.map((events,walk)=>{
      if(!events.length) return [];
      const start=events[0].t+(active<0?0:checkpoints[active].times[walk]*1000);
      return events.map(e=>e.type==='Phone'?{seconds:seconds(e.t-start),record:e.type,observation:e.details}:
        {seconds:seconds(e.t-start),record:e.type,role:e.role,rsrpDbm:e.power,csiRsrpDbm:e.csi,servingCellChange:e.changed});
    })};
}
