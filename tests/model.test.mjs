import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,parseLog,prepare,report} from '../web/model.mjs';
const t='2026-10-01T11:42:00.123456-04:00';
const q=s=>'"'+s.replaceAll('"','""')+'"';
test('quoted decimal commas, escaped JSON, optional roles, missing readings and no identifier export',()=>{
  const lte=parseLog('# version=x\r\n# CSV Version=y\r\ndeviceTime,latitude,missionId,eci,rsrp,servingCell,slot\r\n'+
    [t,'"12,12345"','secretmission','12345678',-101,true,17].join(',')+'\n'+
    [t,'','secretmission','12345677','',true,17].join(','));
  const nr=parseLog('deviceTime,nci,ssRsrp,csiRsrp,connectionStatus,servingCell\n'+[t,'43214876',-90,-95,'SECONDARY_SERVING',false].join(','));
  const ph=parseLog('deviceTime,networkRegistrationInfo,simState\n'+[t,q(JSON.stringify([{domain:'PS',accessNetworkTechnology:'LTE',cell_identity_lte:{eci:12345678},rejectCause:8}])), 'READY'].join(','));
  const events=prepare([lte,nr,ph]);
  assert.equal(events[0].changed,false);assert.equal(events[1].changed,true);assert.equal(events[1].power,null);
  assert.equal(events[2].role,'SECONDARY_SERVING');assert.equal(events[2].csi,-95);
  assert.match(events[3].details,/PS · LTE · reject cause 8/);assert.match(events[3].details,/state unreported/);
  const output=JSON.stringify(report([events,events],[{label:'Private Home',times:[0,0]}],0));
  for(const secret of ['12,12345','secretmission','12345678','12345677','43214876',t,'Private Home','slot']) assert(!output.includes(secret));
});
test('malformed files, gaps, missing state and time zones',()=>{
  assert.deepEqual(csvRows('x,y\n"a\nb","q""q"'),[['x','y'],['a\nb','q"q']]);
  assert.throws(()=>csvRows('"broken'),/incomplete/);
  assert.throws(()=>parseLog('time,foo'),/deviceTime/);
  const log=parseLog('deviceTime,rsrp,eci\n'+t+',-99,1254\ninvalid,-90,1256\n2026-10-01T16:42:00.123Z,,1256');
  assert.equal(log.rejected,1);assert.equal(log.events[0].role,'UNKNOWN');
  const r=report([prepare([log]),[]],[],-1);assert.equal(r.walks[0][1].seconds,3600);assert.equal(r.walks[0][1].rsrpDbm,null);
  const state=parseLog('timestamp,registrationState\n'+t+',OUT_OF_SERVICE').events[0];
  assert.equal(state.details,'OUT OF SERVICE');
});
