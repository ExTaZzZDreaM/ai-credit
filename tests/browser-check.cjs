/* Development-only browser verification. Pass the Playwright module directory
   and Chrome executable as arguments; production has no Node dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');

(async () => {
 const root=process.cwd(), out=path.join(root,'tmp','qa');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const checks=[];
 try {
  await page.goto('http://127.0.0.1:8765');
  await page.locator('#empty-state').waitFor({state:'visible'});
  assert.match(await page.title(),/Загрузка отчёта/);
  await page.screenshot({path:path.join(out,'desktop-empty.png'),fullPage:true});
  checks.push('Upload screen renders');
  await page.locator('#demo-button').click();
  await page.locator('#workspace').waitFor({state:'visible',timeout:45000});
  assert.equal(await page.locator('#demo-notice').isVisible(),true);
  const text=(await page.locator('#metrics').innerText()).replace(/\s+/g,' ');
  assert.match(text,/1 750 000/);assert.match(text,/89 000/);
  assert.equal(await page.locator('#preview-table tbody tr').count(),3);
  checks.push('Synthetic PDF travels through actual upload and parsing');
  await page.locator('#income-input').fill('400 000');
  assert.match(await page.locator('#income-result').innerText(),/22,3%/);
  assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
  assert.equal(await page.locator('.gauge-sub').innerText(),'Доля известных платежей · данные неполные');
  assert.match(await page.locator('.gauge-svg').getAttribute('aria-label'),/данные неполные/);
  assert.equal(await page.locator('.gauge-sub').getAttribute('class'),'gauge-sub');
  await page.screenshot({path:path.join(out,'desktop-overview.png'),fullPage:true});
  checks.push('Missing payment produces a partial 22.3% income share');
  await page.locator('#review-button').click();
  const payment=page.locator('[data-loan-id="loan-2-1"] [data-field="payment"]');
  await payment.fill('-500');await page.locator('#save-button').click();
  await page.locator('#review-error').waitFor({state:'visible'});
  assert.match(await page.locator('#review-error').innerText(),/неотрицательная/);
  await payment.fill('15 000');
  await page.locator('#confirm-checkbox').check();
  await page.locator('#save-button').click();
  await page.locator('#panel-overview').waitFor({state:'visible'});
  assert.match((await page.locator('#metrics').innerText()).replace(/\s+/g,' '),/104 000/);
  assert.match(await page.locator('#income-result').innerText(),/26%/);
  assert.doesNotMatch(await page.locator('#income-result').innerText(),/данные неполные/);
  for(const income of ['1040000','300000','208000','130000','80000']){
   await page.locator('#income-input').fill(income);
   assert.equal(await page.locator('.gauge-sub').innerText(),'Доля известных платежей');
   assert.equal(await page.locator('.gauge-sub').getAttribute('class'),'gauge-sub');
   assert.doesNotMatch(await page.locator('#income-result').innerText(),/Комфортн|Умеренн|Высокая/);
  }
  await page.locator('#income-input').fill('400 000');
  assert.match(await page.locator('#review-title').innerText(),/Сведения сверены/);
  checks.push('Negative edits rejected; corrected payment recalculates to 104,000 and 26%');
  await page.screenshot({path:path.join(out,'desktop-reviewed.png'),fullPage:true});
  await page.locator('#nav-loans').click();await page.locator('#status-filter').selectOption('closed');
  assert.equal(await page.locator('#loans-table tbody tr').count(),1);
  checks.push('Closed contract filter works');
  await page.locator('#nav-review').click();await page.locator('#add-loan-button').click();
  const manual=page.locator('[data-loan-id^="manual-"]');
  await manual.locator('[data-field="creditor"]').fill('Тест <script>alert(1)</script>');
  await manual.locator('[data-field="status"]').selectOption('active');
  await manual.locator('[data-field="role"]').selectOption('borrower');
  await manual.locator('[data-field="currency"]').selectOption('USD');
  await manual.locator('[data-field="balance"]').fill('500');
  await manual.locator('[data-field="payment"]').fill('30');
  await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});
  assert.equal(await page.locator('#currency-wrap').isVisible(),true);
  assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
  await page.locator('#currency-select').selectOption('USD');
  assert.match(await page.locator('#metrics').innerText(),/500 \$/);
  assert.equal(await page.locator('script:not([src])').count(),0);
  checks.push('Manual entry and separate currencies work; lender text is escaped');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();
  const download=await downloadPromise;const exported=path.join(out,'export.json');await download.saveAs(exported);
  const exportedData=JSON.parse(await fs.readFile(exported,'utf8'));assert.equal(exportedData.summary.currencies.USD.balance,500);
  checks.push('JSON export contains actual recalculated values');
  await page.locator('#reset-button').click();await page.locator('#empty-state').waitFor({state:'visible'});
  assert.equal(await page.locator('#review-records').textContent(),'');
  checks.push('Clearing removes report content from page');
  await page.locator('#file-input').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});
  await page.locator('#error-message').waitFor({state:'visible'});
  assert.match(await page.locator('#error-message').innerText(),/не PDF/);
  checks.push('Invalid PDF produces recoverable inline error');
  const official=path.join(root,'tmp','reference','pko-full.pdf');
  try{
   await fs.access(official);await page.locator('#file-input').setInputFiles(official);
   await page.locator('#workspace').waitFor({state:'visible',timeout:45000});
   assert.equal(await page.locator('#demo-notice').isVisible(),false);
   assert.match(await page.locator('#review-title').innerText(),/неполным/);
   assert.match(await page.locator('#report-meta').innerText(),/04\.04\.2024/);
   await page.locator('#income-input').fill('400000');assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
   await page.screenshot({path:path.join(out,'desktop-official-sample.png'),fullPage:true});
   checks.push('Official PKB specimen parsed, date preserved, summary mismatch exposed');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await page.locator('#reset-button').click();
  for(const width of [768,375,320]){
   await page.setViewportSize({width,height:960});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Empty-screen horizontal overflow at ${width}`);
   if(width===375)await page.screenshot({path:path.join(out,'mobile-empty.png'),fullPage:true});
  }
  await page.locator('#demo-button').click();await page.locator('#workspace').waitFor({state:'visible',timeout:45000});
  for(const width of [768,375,320]){
   await page.setViewportSize({width,height:960});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){await page.screenshot({path:path.join(out,'overflow.png'),fullPage:true});console.log(await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(el=>({id:el.id,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,overflow:getComputedStyle(el).overflowX})).slice(0,14)})));}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overview horizontal overflow at ${width}`);
   if(width===375)await page.screenshot({path:path.join(out,'mobile-overview.png'),fullPage:true});
  }
  await page.locator('#nav-review').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Review horizontal overflow at 320');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'desktop-review.png'),fullPage:true});
  checks.push('Upload, overview and review fit mobile and tablet viewports');
  await page.locator('#nav-method').click();assert.equal(await page.locator('#method-panel').isVisible(),true);
  checks.push('Methodology and data-handling explanation available');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:checks.length,checks,browserErrors:errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
