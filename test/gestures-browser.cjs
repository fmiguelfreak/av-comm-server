const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
module.exports = async (browser, base, io) => {
  const owner = connect(base, { autoConnect:false });
  const created = new Promise(resolve => owner.once('show_created',resolve));
  owner.on('connect',()=>owner.emit('create_show',{name:'GESTURES',channels:12}));owner.connect();
  const show=await created;
  const session={version:1,showId:show.showId,pin:show.pin,name:'GESTURES',channels:12,role:'FOH'};
  const observed=[];
  const observe=socket=>socket.on('update_channel',p=>{if(p?.showId===show.showId) observed.push(p.status);});
  io.on('connection',observe);
  const desktop=await browser.newContext({viewport:{width:1440,height:900}});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    for(const c of [desktop,mobile]) await c.addInitScript(s=>localStorage.setItem('av_session',JSON.stringify(s)),session);
    const a=await desktop.newPage(), b=await mobile.newPage();
    for(const p of [a,b]) {await p.goto(base+'/grid.html');await p.waitForFunction(()=>document.getElementById('connection-label').textContent==='ONLINE');}
    const state=async(p,s)=>p.waitForFunction(s=>document.querySelector('#ch-1').dataset.status===s,s);
    await a.locator('#ch-1').click();await state(b,'READY');assert.deepEqual(observed.splice(0),['READY']);
    await a.locator('#ch-1').dblclick();await state(b,'ALERT');assert.deepEqual(observed.splice(0),['ALERT']);
    await a.locator('#ch-1').click();await state(b,'IDLE');assert.deepEqual(observed.splice(0),['IDLE']);
    const box=await a.locator('#ch-1').boundingBox();await a.mouse.move(box.x+50,box.y+50);await a.mouse.down();
    assert(await a.locator('#ch-1').evaluate(el=>el.classList.contains('is-holding')));
    await a.waitForTimeout(1650);await state(b,'EMERGENCY');await a.mouse.up();await a.waitForTimeout(400);
    assert.deepEqual(observed.splice(0),['EMERGENCY']);await state(a,'EMERGENCY');
    await b.reload();await state(b,'EMERGENCY');
    console.log('PASS GESTURES: mouse hold → EMERGENCY, no release click, second-client sync and reload snapshot');
    await b.locator('#ch-1').tap();await state(a,'IDLE');await b.waitForTimeout(400);assert.deepEqual(observed.splice(0),['IDLE']);
    await b.locator('#ch-1').tap();await state(a,'READY');await b.waitForTimeout(400);assert.deepEqual(observed.splice(0),['READY']);
    const cdp=await mobile.newCDPSession(b);const touchBox=await b.locator('#ch-1').boundingBox();const point={x:touchBox.x+40,y:touchBox.y+45};
    const down=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    const up=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await down();await up();await b.waitForTimeout(70);await down();await up();await state(a,'ALERT');await b.waitForTimeout(400);assert.deepEqual(observed.splice(0),['ALERT']);
    await down();await b.waitForTimeout(1650);await state(a,'EMERGENCY');await up();await b.waitForTimeout(500);assert.deepEqual(observed.splice(0),['EMERGENCY']);
    await b.reload();await state(b,'EMERGENCY');await b.locator('#ch-1').tap();await state(a,'IDLE');assert.deepEqual(observed.splice(0),['IDLE']);
    console.log('PASS GESTURES: native touch single/double/hold/reset, exactly one event per gesture');
  } finally {io.off('connection',observe);owner.disconnect();await desktop.close();await mobile.close();}
};
