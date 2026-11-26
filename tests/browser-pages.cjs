/* Page navigation and privacy checks. Uses the synthetic demo only. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.argv[2]);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const routes=[['/','Загрузка отчёта'],['/overview','Кредитный обзор'],['/loans','Обязательства'],['/simulator','Симулятор'],['/review','Проверка данных'],['/method','Как это считается']];
  for(const [url,title] of routes){
   const response=await page.goto('http://127.0.0.1:8765'+url);
   assert.equal(response.status(),200);assert.match(await response.text(),new RegExp(`<title>${title}`));
   await page.waitForFunction(()=>!!document.body.dataset.page);
   assert.equal(await page.title(),title+' · Forte Pilot');
   assert.equal(await page.locator('.nav-item[aria-current="page"]').count(),1);
   assert.equal(await page.locator('.nav-item[aria-current="page"]').getAttribute('href'),url);
   assert.equal(await page.locator('[role="tablist"]').count(),0);
   if(!['/','/method'].includes(url)){
    assert.equal(await page.locator('#route-empty').isVisible(),true);
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.locator('#metrics').textContent(),'');
   }
  }
  assert.equal(await page.locator('#method-panel').isVisible(),true);
  const favicon=await page.request.get('http://127.0.0.1:8765/favicon.png?v=2');assert.equal(favicon.status(),200);
  assert.match(favicon.headers()['content-type'],/image\/png/);
  assert.deepEqual(await favicon.body(),await fs.readFile('web/favicon.png'));
  const missing=await page.goto('http://127.0.0.1:8765/no-such-page');
  assert.equal(missing.status(),404);assert.match(await page.title(),/не найдена/);
  assert.equal(await page.getByRole('link',{name:'К загрузке отчёта'}).isVisible(),true);
  await page.goto('http://127.0.0.1:8765/simulator/');assert.match(page.url(),/\/simulator$/);
  // A direct empty route returns here after the user uploads a report.
  await page.locator('#route-empty a[data-page="upload"]').click();assert.match(page.url(),/8765\/$/);
  await page.locator('#demo-button').click();await page.locator('#panel-scenario').waitFor({state:'visible',timeout:45000});
  assert.match(page.url(),/\/simulator$/);
  const data=await page.evaluate(()=>JSON.stringify(state.data));
  const documents=[];page.on('request',r=>{if(r.resourceType()==='document')documents.push(r.url());});
  await page.locator('#scenario-income-input').fill('400000');await page.locator('[data-sim-loan]').first().check();
  await page.locator('#nav-loans').click();assert.match(page.url(),/\/loans$/);
  await page.goBack();await page.waitForURL('**/simulator');
  assert.equal(await page.locator('[data-sim-loan]').first().isChecked(),true);
  assert.equal(await page.locator('#scenario-income-input').inputValue(),'400000');
  await page.goForward();await page.waitForURL('**/loans');
  assert.equal(await page.evaluate(()=>JSON.stringify(state.data)),data);
  await page.locator('#nav-review').click();
  const input=page.locator('[data-loan-id="loan-2-1"] [data-field="payment"]');await input.fill('-500');
  await page.locator('#nav-method').click();assert.equal(await page.locator('#draft-notice').isVisible(),true);
  await page.locator('#draft-notice a').click();assert.equal(await input.inputValue(),'-500');
  await input.fill('15000');await page.locator('#save-button').click();await page.waitForURL('**/overview');
  assert.equal(await page.locator('#draft-notice').isVisible(),false);
  assert.equal(await page.evaluate(()=>state.data.summary.currencies.KZT.payment),104000);
  assert.deepEqual(documents,[],'Menu navigation must not reload the document or lose in-memory state');
  await page.locator('#nav-upload').click();assert.equal(await page.locator('#current-report-note').isVisible(),true);
  await page.locator('#current-report-note a').click();
  assert.equal(await page.evaluate(()=>state.data.summary.currencies.KZT.payment),104000);
  await fs.mkdir('tmp/pages-review',{recursive:true});await page.locator('#toast').waitFor({state:'hidden'});
  for(const width of [1440,768,375,320]){
   await page.setViewportSize({width,height:1000});
   for(const key of ['overview','loans','scenario','review','method']){
    await page.locator('#nav-'+key).click();
    assert.equal(await page.locator('.nav-item[aria-current="page"]').getAttribute('data-page'),key);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${key} overflow at ${width}`);
    if([1440,375].includes(width))await page.screenshot({path:`tmp/pages-review/${key}-${width}.png`,fullPage:true});
   }
  }
  // A reload or new tab has no report session to recover.
  await page.locator('#nav-scenario').click();await page.reload();
  assert.equal(await page.locator('#route-empty').isVisible(),true);
  assert.equal(await page.evaluate(()=>state.data),null);
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  const other=await browser.newPage();await other.goto('http://127.0.0.1:8765/review');
  assert.equal(await other.locator('#route-empty').isVisible(),true);await other.close();
  assert.deepEqual(errors,[]);
  console.log('Page checks passed: six direct URLs, canonical paths, HTML 404, supplied PNG icon, shared state, back/forward, invalid drafts retained, save, mobile layouts, reload/new-tab privacy.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
