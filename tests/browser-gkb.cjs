/* Optional GKB upload smoke test. Accepts a local PDF path and expected values
   as active,balance,monthly,next,declaredClosed,assumedMonthly; no report saved. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.argv[2]);
(async()=>{
 const [active,balance,payment,next,closed,assumed]=String(process.argv[4]||'2,30000,7000,7000,3,1').split(',').map(Number);
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#file-input').setInputFiles(process.argv[3]);
  await page.locator('#workspace').waitFor({state:'visible',timeout:45000});
  const data=await page.evaluate(()=>state.data),g=data.summary.currencies.KZT;
  assert.equal(data.report.bureau,'ГКБ');assert.equal(data.report.input_container,'cms_signed_data');
  assert.equal(data.summary.active_count,active);assert.equal(data.report.declared_closed,closed);
  assert.equal(g.balance,balance);assert.equal(g.payment,payment);assert.equal(g.next_payment,next);
  assert.equal(g.payment_known,active);assert.equal(g.payment_assumed_count,assumed);assert.equal(g.payment_complete,false);
  assert.equal(data.warnings.some(w=>['balance_total_mismatch','contract_count_mismatch'].includes(w.code)),false);
  assert.match(await page.locator('#report-reading').innerText(),/завершённых договоров/);
  assert.match(await page.locator('#report-reading').innerText(),/Подлинность подписи не проверялась/);
  await page.locator('#income-input').fill('400000');assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
  await page.locator('#nav-scenario').click();
  for(const loan of data.loans.filter(l=>l.payment_basis==='assumed_monthly'))await page.locator(`[data-sim-loan="${loan.id}"]`).check();
  const scenario=await page.evaluate(()=>scenarioResult());
  assert.equal(scenario.before.amount,Number(payment).toFixed(2));
  assert.equal(scenario.after.amount,(payment-data.loans.filter(l=>l.payment_basis==='assumed_monthly').reduce((sum,l)=>sum+l.payment,0)).toFixed(2));
  assert.equal(scenario.before.partial,true);assert.equal(scenario.after.assumed_count,0);
  await fs.mkdir('tmp/gkb-review',{recursive:true});
  await page.setViewportSize({width:375,height:1000});await page.locator('#panel-scenario').evaluate(el=>el.scrollIntoView({block:'start'}));
  assert.match(await page.locator('#scenario-live').innerText(),/Снижение в сценарии · предварительно/);
  await page.screenshot({path:'tmp/gkb-review/scenario-assumed-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#nav-overview').click();
  await page.locator('#toast').waitFor({state:'hidden'});
  await fs.mkdir('tmp/gkb-review',{recursive:true});
  await page.screenshot({path:'tmp/gkb-review/app-desktop.png',fullPage:true});
  for(const width of [768,375,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`GKB overview overflow at ${width}`);
   if(width===375)await page.screenshot({path:'tmp/gkb-review/app-mobile.png',fullPage:true});
  }
  await page.locator('#nav-review').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'GKB review overflow at 320');
  assert.equal(await page.locator('.review-record').count(),active);
  assert.match(await page.locator('#report-warnings').innerText(),/Краткая форма ГКБ/);
  await page.screenshot({path:'tmp/gkb-review/app-review-mobile.png',fullPage:true});
  for(const loan of data.loans.filter(l=>l.payment_basis==='assumed_monthly')){
   await page.locator(`[data-loan-id="${loan.id}"] [data-confirm-monthly]`).check();
  }
  await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});
  const edited=await page.evaluate(()=>state.data);
  assert.equal(edited.summary.currencies.KZT.payment,next);
  assert.equal(edited.summary.currencies.KZT.next_payment,next);
  assert.equal(edited.summary.currencies.KZT.payment_assumed_count,0);
  assert.equal(edited.summary.currencies.KZT.payment_complete,true);
  assert.equal(edited.loans.every((loan,i)=>loan.next_payment===data.loans[i].next_payment),true);
  assert.deepEqual(errors,[]);
  console.log('GKB browser checks passed: signed upload, count and balance reconciliation, partial monthly payments, closed-summary disclosure, original upcoming values preserved after edits, mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
