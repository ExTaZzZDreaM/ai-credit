/* Optional local-file verification. Expected data is supplied at invocation,
   not stored as a participant-data fixture: limit,endDate,queries30,queries90. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.argv[2]);
(async()=>{
 const [limit,endDate,q30,q90]=process.argv[4].split(',');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#file-input').setInputFiles(process.argv[3]);
  await page.locator('#workspace').waitFor({state:'visible',timeout:45000});
  const original=await page.evaluate(()=>state.data);
  assert.equal(original.report.bureau,'ПКБ');
  assert.equal(original.report.inquiries_30d,Number(q30));assert.equal(original.report.inquiries_90d,Number(q90));
  assert.match(await page.locator('#report-reading').innerText(),/Записей в журнале запросов/);
  const loan=original.loans.find(l=>l.credit_limit!==null);
  assert.ok(loan);assert.equal(loan.credit_limit,Number(limit));assert.equal(loan.end_date,endDate);
  assert.equal(original.loans.every(l=>l.end_date!==null&&l.max_overdue_days_history!==null),true);
  await page.locator('#toast').waitFor({state:'hidden'});
  await fs.mkdir('tmp/pkb-fields-review',{recursive:true});
  await page.screenshot({path:'tmp/pkb-fields-review/app-overview.png',fullPage:true});
  await page.locator('#nav-review').click();
  const card=page.locator(`[data-loan-id="${loan.id}"]`);
  assert.equal(await card.locator('[data-field="credit_limit"]').inputValue(),String(loan.credit_limit));
  assert.equal(await card.locator('[data-field="end_date"]').inputValue(),loan.end_date);
  assert.equal(await card.locator('[data-field="max_overdue_days_history"]').inputValue(),String(loan.max_overdue_days_history));
  assert.match(await card.innerText(),/Максимум просрочки в доступной истории/);
  await card.screenshot({path:'tmp/pkb-fields-review/app-review-desktop.png'});
  for(const width of [768,375,320]){
   await page.setViewportSize({width,height:1050});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Review overflow at ${width}`);
   if(width===375)await card.screenshot({path:'tmp/pkb-fields-review/app-review-mobile.png'});
  }
  await card.locator('[data-field="max_overdue_days_history"]').fill('1.5');
  await page.locator('#save-button').click();await page.locator('#review-error').waitFor({state:'visible'});
  await card.locator('[data-field="max_overdue_days_history"]').fill(String(loan.max_overdue_days_history+1));
  await card.locator('[data-field="credit_limit"]').fill(String(loan.credit_limit+123));
  const shifted=new Date(loan.end_date+'T12:00:00Z');shifted.setUTCDate(shifted.getUTCDate()+1);
  const newEnd=shifted.toISOString().slice(0,10);await card.locator('[data-field="end_date"]').fill(newEnd);
  await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});
  const edited=await page.evaluate(()=>state.data),l=edited.loans.find(l=>l.id===loan.id);
  assert.equal(l.credit_limit,loan.credit_limit+123);assert.equal(l.end_date,newEnd);
  assert.equal(l.max_overdue_days_history,loan.max_overdue_days_history+1);
  assert.equal(l.sources.credit_limit.value,loan.credit_limit);assert.equal(l.sources.end_date.value,loan.end_date);
  assert.equal(l.sources.max_overdue_days_history.value,loan.max_overdue_days_history);
  assert.equal(edited.summary.overdue_count,original.summary.overdue_count);
  assert.equal(edited.summary.currencies.KZT.balance,original.summary.currencies.KZT.balance);
  assert.equal(edited.summary.currencies.KZT.payment,original.summary.currencies.KZT.payment);
  assert.equal(edited.report.inquiries_30d,Number(q30));assert.equal(edited.report.inquiries_90d,Number(q90));
  const promise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await promise;
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const exported=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(exported.loans.find(l=>l.id===loan.id).end_date,newEnd);
  assert.equal(exported.report.inquiries_90d,Number(q90));
  assert.deepEqual(errors,[]);
  console.log('PKB enrichment browser checks passed: source fields, inquiry counts, integer validation, edits, provenance, unchanged debt/current arrears, JSON export, and 320/375/768 layouts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
