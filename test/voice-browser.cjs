const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const mock = require('./speech-mock.cjs');
module.exports = async (browser, base, io) => {
  const owner = connect(base, { autoConnect:false });
  const created = new Promise(resolve => owner.once('show_created',resolve));
  owner.on('connect',()=>owner.emit('create_show',{name:'VOICE TEST',channels:12}));owner.connect();
  const show=await created;
  const session={version:1,showId:show.showId,pin:show.pin,name:'VOICE TEST',channels:12,role:'FOH'};
  const messages=[],errors=[],contexts=[];
  const observe=socket=>socket.on('new_message',p=>{if(p?.showId===show.showId)messages.push(p)});
  io.on('connection',observe);
  async function page(options) {
    const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});contexts.push(ctx);
    await ctx.addInitScript(mock,options);await ctx.addInitScript(s=>localStorage.setItem('av_session',JSON.stringify(s)),session);
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/grid.html');await p.waitForFunction(()=>document.getElementById('connection-label').textContent==='ONLINE');return p;
  }
  async function down(p) { const box=await p.locator('#ptt-btn').boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down(); }
  const state=(p,s)=>p.waitForFunction(s=>document.getElementById('ptt-btn').dataset.voiceState===s,s);
  try {
    const a=await page({}),b=await page({prefixed:true});
    await a.evaluate(()=>{window.__speech.deferEnd=true});await down(a);await state(a,'listening');
    assert.equal(await a.evaluate(()=>window.__speech.runs[0].lang),'pt-PT');
    await a.evaluate(()=>window.__speech.runs[0].result([['Vídeo, confirma',false]]));
    assert.equal(await a.locator('#ptt-transcript').textContent(),'Vídeo, confirma');assert.equal(messages.length,0);
    await a.mouse.up();await state(a,'stopping');assert.equal(await a.evaluate(()=>window.__speech.runs[0].stops),1);assert.equal(messages.length,0);
    await a.evaluate(()=>{const r=window.__speech.runs[0];r.result([['  Vídeo, confirma sinal no ecrã principal.  ',true]]);r.end();r.end()});
    await b.waitForFunction(()=>document.getElementById('message-text').textContent==='Vídeo, confirma sinal no ecrã principal.');
    assert.equal(messages.length,1);assert.equal(messages[0].sender,'FOH');assert(await b.locator('#message-time').textContent());
    await b.waitForFunction(()=>document.getElementById('message-overlay').classList.contains('hidden'),null,{timeout:6000});
    console.log('PASS VOICE: pointerdown/listening, interim, delayed final/onend sends once, second client and 4s auto-hide');

    await down(a);await a.mouse.up();await a.evaluate(()=>window.__speech.runs.at(-1).end());await state(a,'idle');assert.equal(messages.length,1);
    for(const error of ['not-allowed','network','audio-capture']) {
      await down(a);await a.evaluate(error=>window.__speech.runs.at(-1).error(error),error);await a.mouse.up();await state(a,'error');
      assert.equal(await a.locator('#ptt-btn').evaluate(el=>el.classList.contains('is-listening')),false);
      assert(await a.locator('#session-error').isVisible());
    }
    assert.equal(messages.length,1);
    await a.locator('#ch-1').click();await b.waitForFunction(()=>document.querySelector('#ch-1').dataset.status==='READY');
    console.log('PASS VOICE: empty input, permission/network/microphone errors, channel grid remains functional');

    async function phrase(p,text) {
      await down(p);await p.evaluate(text=>window.__speech.runs.at(-1).result([[text,true]]),text);await p.mouse.up();
      await p.evaluate(()=>window.__speech.runs.at(-1).end());await state(p,'idle');
    }
    await phrase(a,'Primeira mensagem');await b.waitForFunction(()=>document.getElementById('message-text').textContent==='Primeira mensagem');
    await b.waitForTimeout(2300);
    await phrase(a,'<img src=x onerror=alert(1)> Segunda mensagem');
    await b.waitForFunction(()=>document.getElementById('message-text').textContent.includes('Segunda mensagem'));
    assert.equal(await b.locator('#message-overlay img').count(),0);
    await b.waitForTimeout(2000);assert(await b.locator('#message-overlay').isVisible());
    await b.waitForFunction(()=>document.getElementById('message-overlay').classList.contains('hidden'),null,{timeout:4000});
    assert.equal(messages.length,3);
    console.log('PASS VOICE: consecutive messages replace safely, reset expiry, text is not HTML');

    // Native touch pipeline with prefixed recognition.
    await b.evaluate(()=>{window.__speech.deferEnd=true});const cdp=await b.context().newCDPSession(b);const box=await b.locator('#ptt-btn').boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+30,y:box.y+30}]});await state(b,'listening');
    await b.evaluate(()=>window.__speech.runs.at(-1).result([['Microfone três pronto.',true]]));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await state(b,'stopping');
    await b.evaluate(()=>window.__speech.runs.at(-1).end());await a.waitForFunction(()=>document.getElementById('message-text').textContent==='Microfone três pronto.');assert.equal(messages.length,4);
    await down(a);await a.evaluate(()=>window.__speech.runs.at(-1).result([['Cancelada',true]]));
    await a.locator('#ptt-btn').dispatchEvent('pointercancel',{pointerId:1});await a.mouse.up();await a.evaluate(()=>window.__speech.runs.at(-1).end());assert.equal(messages.length,4);
    console.log('PASS VOICE: webkit fallback, native touch without duplicate send, pointercancel discards');

    const c=await page({absent:true});await state(c,'unsupported');await c.locator('#ptt-btn').dispatchEvent('keydown',{key:'Enter'});await state(c,'unsupported');
    await c.locator('#ch-2').dblclick();await a.waitForFunction(()=>document.querySelector('#ch-2').dataset.status==='ALERT');
    assert.equal(messages.length,4);assert.deepEqual(errors,[]);
    console.log('PASS VOICE: unsupported browser has no JS errors; channel interactions still work');
  } finally {io.off('connection',observe);owner.disconnect();for(const ctx of contexts)await ctx.close();}
};
