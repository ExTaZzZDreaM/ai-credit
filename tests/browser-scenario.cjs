const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.argv[2]);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  await fs.mkdir('.impeccable/review',{recursive:true});
  await page.goto('http://127.0.0.1:8765/');await page.locator('#demo-button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('#open-scenario-button').click();await page.locator('#panel-scenario').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-sim-loan]').count(),3);
  const snapshot=await page.evaluate(()=>JSON.stringify(state.data.loans));
  await page.locator('#scenario-income-input').fill('400000');
  await page.locator('[data-sim-loan="loan-1-2"]').check();
  let r=await page.evaluate(()=>scenarioResult());
  assert.equal(r.before.amount,'89000.00');assert.equal(r.after.amount,'65000.00');assert.equal(r.reduction.amount,'24000.00');assert.equal(r.after.partial,true);
  assert.equal(await page.locator('#income-input').inputValue(),'400000');assert.equal(await page.evaluate(()=>JSON.stringify(state.data.loans)),snapshot);
  assert.equal(posts.length,1,'Checkboxes and income use local arithmetic');
  await page.locator('#toast').waitFor({state:'hidden'});
  await page.screenshot({path:'.impeccable/review/scenario-partial-desktop.png',fullPage:true});
  await page.locator('[data-sim-loan="loan-2-1"]').check();r=await page.evaluate(()=>scenarioResult());
  assert.equal(r.after.partial,false);assert.equal(r.reduction.complete,false);
  await page.setViewportSize({width:375,height:1000});await page.locator('#panel-scenario').evaluate(el=>el.scrollIntoView({block:'start'}));
  assert.match(await page.locator('#scenario-live').innerText(),/Снижение в сценарии · предварительно/);
  await page.screenshot({path:'.impeccable/review/scenario-reduction-partial-375.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-sim-loan="loan-2-1"]').uncheck();
  await page.locator('#nav-review').click();await page.locator('[data-loan-id="loan-2-1"] [data-field="payment"]').fill('15000');
  await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});await page.locator('#nav-scenario').click();
  assert.equal(await page.locator('[data-sim-loan="loan-1-2"]').isChecked(),true);
  r=await page.evaluate(()=>scenarioResult());assert.equal(r.before.amount,'104000.00');assert.equal(r.after.amount,'80000.00');assert.equal(r.before.ratio,26);assert.equal(r.after.ratio,20);
  const originalAfterEdit=await page.evaluate(()=>JSON.stringify(state.data.loans));
  await page.locator('#scenario-income-input').fill('800000');r=await page.evaluate(()=>scenarioResult());assert.equal(r.after.ratio,10);
  await page.locator('#scenario-income-input').fill('400000');
  await page.locator('#toast').waitFor({state:'hidden'});
  for(const width of [1440,768,375,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Scenario overflow at ${width}`);
   if(width===1440)await page.evaluate(()=>scrollTo(0,0));else await page.locator('#panel-scenario').evaluate(el=>el.scrollIntoView({block:'start'}));
   await page.screenshot({path:`.impeccable/review/scenario-${width}.png`,fullPage:width===1440});
   if(width<1050){
    await page.locator('[data-sim-loan]').last().scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#scenario-live').isVisible(),true);
    await page.screenshot({path:`.impeccable/review/scenario-list-${width}.png`});
   }
  }
  await page.locator('#scenario-select-all').click();r=await page.evaluate(()=>scenarioResult());
  assert.equal(r.after.amount,'0.00');assert.equal(r.after.ratio,0);assert.equal(r.closing_balance.amount,'1750000.00');
  assert.equal(await page.evaluate(()=>JSON.stringify(state.data.loans)),originalAfterEdit);
  const postCount=posts.length;await page.locator('[data-sim-loan]').first().focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-sim-loan]').first().isChecked(),false);assert.equal(posts.length,postCount);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert.equal(exported.simulation.after.amount,'65000.00');assert.equal(exported.loans.filter(l=>l.status==='active').length,3);
  await page.locator('#nav-review').click();await page.locator('[data-loan-id="loan-1-2"] [data-field="status"]').selectOption('closed');await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});await page.locator('#nav-scenario').click();
  assert.equal(await page.locator('[data-sim-loan="loan-1-2"]').count(),0);assert.equal(await page.evaluate(()=>state.scenarioSelected.has('loan-1-2')),false);
  await page.locator('#scenario-reset').click();assert.equal(await page.evaluate(()=>state.scenarioSelected.size),0);
  await page.locator('#reset-button').click();assert.equal(await page.locator('#scenario-loans').textContent(),'');
  assert.equal(await page.locator('#scenario-live').textContent(),'');assert.deepEqual(errors,[]);
  console.log('Scenario browser checks passed: instant local selection, unknowns, synchronized income, saved edits, no source mutation, all/clear, keyboard, JSON export, eligibility pruning, reset privacy, responsive live totals.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
