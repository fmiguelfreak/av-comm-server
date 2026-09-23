const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVoicePTT } = require('../public/voice-ptt');
function setup({ deferStart = false } = {}) {
  const runs=[],sent=[],views=[];let allowed=true;
  class Recognition {
    constructor(){runs.push(this)}
    start(){if (!deferStart) this.onstart()}
    stop(){this.stopped=true}
    abort(){this.aborted=true;this.onend?.()}
    result(parts){this.onresult({results:parts.map(([transcript,isFinal])=>Object.assign([{transcript}],{isFinal}))})}
  }
  const voice=createVoicePTT({Recognition,allowed:()=>allowed,send:t=>sent.push(t),render:v=>views.push(v)});
  return {voice,runs,sent,views,disconnect:()=>{allowed=false;voice.cancel()}};
}
test('pt-PT interim is displayed; final after stop sends once only on end',()=>{
  const f=setup();assert(f.voice.press());const r=f.runs[0];assert.equal(r.lang,'pt-PT');assert(r.interimResults);
  r.result([['vídeo',false]]);assert.equal(f.views.at(-1).text,'vídeo');assert.deepEqual(f.sent,[]);
  f.voice.release();assert(r.stopped);assert.equal(f.views.at(-1).state,'stopping');assert.deepEqual(f.sent,[]);
  r.result([['  Vídeo, confirma sinal.  ',true]]);assert.deepEqual(f.sent,[]);r.onend();r.onend();f.voice.release();assert.deepEqual(f.sent,['Vídeo, confirma sinal.']);
});
test('cumulative results replace interim text; multiple final segments preserve order',()=>{
  const f=setup();f.voice.press();const r=f.runs[0];r.result([['Vídeo,',true],['confirma',false]]);r.result([['Vídeo,',true],['confirma sinal.',true]]);f.voice.release();r.onend();assert.deepEqual(f.sent,['Vídeo, confirma sinal.']);
});
test('empty or interim-only result never sends; subsequent session cannot reuse old text',()=>{
  const f=setup();for(const parts of [[],[['   ',true]],[['partial',false]]]){f.voice.press();f.runs.at(-1).result(parts);f.voice.release();f.runs.at(-1).onend()}
  assert.deepEqual(f.sent,[]);f.voice.press();const old=f.runs.at(-1);old.result([['first',true]]);f.voice.release();old.onend();f.voice.press();old.result([['STALE',true]]);old.onend();f.voice.release();f.runs.at(-1).onend();assert.deepEqual(f.sent,['first']);
});
test('permission/network errors discard recognized text and clear state',()=>{
  const f=setup();for(const error of ['not-allowed','network','audio-capture']){f.voice.press();const r=f.runs.at(-1);r.result([['discard',true]]);r.onerror({error});assert.equal(f.views.at(-1).state,'error');f.voice.release();r.onend()}
  assert.deepEqual(f.sent,[]);
});
test('spontaneous end waits for release; no overlapping recognition while finalizing',()=>{
  const f=setup();f.voice.press();let r=f.runs[0];r.result([['final',true]]);r.onend();assert.deepEqual(f.sent,[]);assert.equal(f.voice.press(),false);f.voice.release();assert.deepEqual(f.sent,['final']);
  f.voice.press();f.voice.release();assert.equal(f.voice.press(),false);f.runs[1].onend();
});
test('cancel/disconnect abort without sending and ignore late callbacks',()=>{
  const f=setup();f.voice.press();const r=f.runs[0];r.result([['do not send',true]]);f.disconnect();r.onend();f.voice.release();assert(r.aborted);assert.deepEqual(f.sent,[]);assert.equal(f.voice.press(),false);
});
test('unsupported browser is safe',()=>{
  const views=[];const voice=createVoicePTT({Recognition:undefined,render:v=>views.push(v),allowed:()=>true,send:()=>assert.fail()});assert.equal(voice.press(),false);voice.release();voice.cancel();assert.equal(views.at(-1).state,'unsupported');
});
test('release before onstart still waits for final result',()=>{
  const f=setup({deferStart:true});f.voice.press();assert.equal(f.views.at(-1).state,'starting');const r=f.runs[0];f.voice.release();assert.equal(f.views.at(-1).state,'stopping');r.onstart();r.result([['late',true]]);r.onend();assert.deepEqual(f.sent,['late']);
});
test('finalization watchdog aborts safely if browser never ends',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=setup();f.voice.press();f.runs[0].result([['discard',true]]);f.voice.release();t.mock.timers.tick(8000);assert.equal(f.views.at(-1).state,'error');assert.deepEqual(f.sent,[]);
});

test('synchronous start failure clears state and allows retry',()=>{
  const views=[],runs=[];let blocked=true;
  class Recognition { constructor(){runs.push(this)} start(){if(blocked)throw new Error('denied');this.onstart()} abort(){this.onend?.()} }
  const voice=createVoicePTT({Recognition,allowed:()=>true,send:()=>assert.fail(),render:v=>views.push(v)});
  assert.equal(voice.press(),false);assert.equal(views.at(-1).state,'error');blocked=false;assert.equal(voice.press(),true);assert.equal(views.at(-1).state,'listening');voice.cancel();
});
