/* Evidence-limit regression checks using synthetic report records only. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.argv[2]);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#demo-button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.evaluate(()=>{window.claimsBase=structuredClone(state.data);});
  // Reproduce a PKB periodic field with no monthly frequency; no private PDF.
  await page.evaluate(async()=>{
   const loan=state.data.loans[0];loan.payment_basis='assumed_monthly';
   loan.sources.payment.label='Сумма периодического платежа';
   const result=await api('/api/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loans:state.data.loans})});
   state.data.loans=result.loans;state.data.summary=result.summary;state.draft=null;render();
  });
  await page.locator('#income-input').fill('400000');
  assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
  assert.match(await page.locator('#preview-table tbody tr').first().innerText(),/Месячный · предположение/);
  await page.locator('#nav-review').click();
  const record=page.locator('[data-loan-id="loan-1-1"]');
  assert.match(await record.innerText(),/исходное значение: 65000/);
  await record.locator('[data-confirm-monthly]').check();
  await page.locator('#save-button').click();await page.locator('#panel-overview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>state.data.loans[0].payment_basis),'user_confirmed_monthly');
  assert.match(await page.locator('#preview-table tbody tr').first().innerText(),/Изменено пользователем/);
  assert.match(await page.locator('#report-reading').innerText(),/ручные изменения/);
  // Empty overdue fields cannot produce a claim that arrears are absent.
  await page.evaluate(async()=>{
   state.data=structuredClone(window.claimsBase);
   for(const l of state.data.loans){l.overdue_amount=null;l.overdue_days=null;}
   const result=await api('/api/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loans:state.data.loans})});
   state.data.loans=result.loans;state.data.summary=result.summary;state.draft=null;render();
  });
  assert.match(await page.locator('#metrics').innerText(),/С признаками просрочки/);
  assert.match(await page.locator('#report-reading').innerText(),/не подтверждает отсутствие просрочек/);
  assert.match(await page.locator('#report-reading').innerText(),/оба текущих поля не заполнены/);
  await page.locator('#income-input').fill('40000');
  assert.match(await page.locator('#income-result').innerText(),/Доход минус учтённые платежи/);
  assert.match((await page.locator('#income-result').innerText()).replace(/\s/g,''),/[-−]49000/);
  assert.doesNotMatch(await page.locator('#income-result').innerText(),/Остаток до расходов|комфорт|свободн/i);
  // Reconciliation warning survives a select-all scenario and user verification.
  await page.evaluate(()=>{
   state.data.warnings.push({level:'warning',code:'balance_total_mismatch',text:'Синтетическое расхождение со сводкой'});
   state.verified=true;render();
  });
  assert.match(await page.locator('#review-description').innerText(),/обнаружены расхождения/);
  assert.match(await page.locator('#income-result').innerText(),/данные неполные/);
  await page.locator('#nav-scenario').click();await page.locator('#scenario-select-all').click();
  assert.equal(await page.evaluate(()=>scenarioResult().after.partial),true);
  assert.match(await page.locator('#scenario-results').innerText(),/В сценарии закрытия/);
  assert.match(await page.locator('#scenario-results').innerText(),/расхождения/);
  // Unspecified currencies cannot be added or presented as a zero-debt result.
  await page.evaluate(async()=>{
   state.data=structuredClone(window.claimsBase);state.verified=false;
   for(const l of state.data.loans)l.currency='UNK';
   const result=await api('/api/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loans:state.data.loans})});
   state.data.loans=result.loans;state.data.summary=result.summary;state.currency='UNK';state.draft=null;render();
  });
  assert.equal(await page.evaluate(()=>state.data.summary.currencies.UNK.payment),null);
  assert.equal(await page.evaluate(()=>scenarioResult().after.amount),null);
  assert.match(await page.locator('#scenario-results').innerText(),/Суммы этих договоров не складываются/);
  assert.match(await page.locator('#scenario-live').innerText(),/Доля доступна только для KZT/);
  // Capture the longer uncertainty messages on mobile and desktop.
  await fs.mkdir('tmp/claims-review',{recursive:true});
  await page.evaluate(()=>{state.data=structuredClone(window.claimsBase);state.currency='KZT';state.draft=null;render();});
  await page.locator('#nav-overview').click();await page.locator('#toast').waitFor({state:'hidden'});
  for(const width of [1440,375,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width!==320)await page.screenshot({path:`tmp/claims-review/overview-${width}.png`,fullPage:true});
   await page.locator('#nav-scenario').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#nav-review').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#nav-overview').click();
  }
  assert.deepEqual(errors,[]);
  console.log('Evidence-limit browser checks passed: monthly assumptions, manual provenance, missing arrears, signed budget difference, unreconciled select-all, unknown currency, and mobile widths.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
