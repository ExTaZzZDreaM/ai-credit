'use strict';
const $ = (id) => document.getElementById(id);
const icons = {
 'chart':'<path d="M4 4v16h16M8 16v-5m5 5V7m5 9v-8"/>',
 'book':'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
 'file':'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8m-8 4h5"/>',
 'shield':'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>',
 'upload':'<path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
 'download':'<path d="M12 3v13m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
 'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 'arrow-left':'<path d="M20 12H4m6-6-6 6 6 6"/>',
 'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
 'lock':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 'info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
 'flask':'<path d="M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/>',
 'scan':'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M7 8h10M7 12h10M7 16h6"/>',
 'wallet':'<path d="M20 8V5a2 2 0 0 0-2-2L5 6a3 3 0 0 0-2 3v10a2 2 0 0 0 2 2h15V8H6m14 4h-5v5h5m-3-2h.01"/>',
 'list':'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 'plus':'<path d="M12 4v16M4 12h16"/>',
 'trash':'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 'bank':'<path d="m3 8 9-5 9 5v2H3Zm2 2v8m5-8v8m4-8v8m5-8v8M3 21h18M3 18h18"/>',
 'coins':'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 4 16 4 16 0V6M4 12v6c0 4 16 4 16 0v-6"/>',
 'calendar':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
 'alert':'<path d="m12 3 10 18H2ZM12 9v5m0 3v1"/>',
 'check':'<path d="m5 12 4 4L19 6"/>'
};
function icon(name){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.file}</svg>`;}
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0) => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d}).format(n);
const symbols = {KZT:'₸',USD:'$',EUR:'€',RUB:'₽',UNK:'валюта не указана'};
const money = (n,c='KZT') => n === null || n === undefined ? 'Нет данных' : `${fmt(n,2)} ${symbols[c]||c}`;
const dateFmt = d => {if(!d)return 'не указана';const parsed=new Date(d+'T12:00:00');return Number.isNaN(parsed.getTime())?'не указана':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(parsed);};
const statusLabels={active:'Действующий',closed:'Закрыт',revoked:'Отозван',unknown:'Уточните статус'};
const roleLabels={borrower:'Заёмщик',co_borrower:'Созаёмщик',guarantor:'Гарант / поручитель',unknown:'Роль не определена'};
const pages={
 upload:{path:'/',title:'Загрузка отчёта',heading:'Загрузите кредитный отчёт',description:'Начните с PDF ПКБ или ГКБ, затем проверьте распознанные сведения.'},
 overview:{path:'/overview',title:'Кредитный обзор',heading:'Кредитный обзор',description:'Обязательства, платежи и сведения текущего разбора.',empty:'После загрузки здесь появятся известные остатки, платежи и доля платежей в указанном вами доходе.'},
 loans:{path:'/loans',title:'Обязательства',heading:'Обязательства',description:'Договоры, роли и известные суммы с доступными ссылками на PDF.',empty:'Загрузите PDF, чтобы увидеть распознанные договоры и отфильтровать действующие, закрытые и требующие проверки.'},
 scenario:{path:'/simulator',title:'Симулятор',heading:'Сценарий закрытия',description:'Сравните известные платежи при полном закрытии выбранных договоров.',empty:'Для сценария нужны договоры из отчёта. После загрузки вы сможете выбрать обязательства для модельного закрытия.'},
 review:{path:'/review',title:'Проверка данных',heading:'Проверка данных',description:'Сверьте распознанные сведения с PDF и сохраните исправления.',empty:'Загрузите PDF, чтобы проверить значения, увидеть доступные ссылки на источник и внести исправления.'},
 method:{path:'/method',title:'Как это считается',heading:'Как это считается',description:'Правила расчёта, допущения и границы этого пилота.'}
};
function pageFromLocation(){const path=location.pathname.replace(/\/$/,'')||'/';return Object.keys(pages).find(key=>pages[key].path===path)||'upload';}
const state={data:null,draft:null,dirty:false,token:null,busy:false,verified:false,currency:'KZT',page:pageFromLocation(),returnPage:null,fileUrl:null,toastTimer:null,scenarioSelected:new Set()};

function updateDraftNotice(){$('draft-notice').hidden=!state.dirty||!state.data;}
function applyPage({focus=false}={}){
 const page=pages[state.page],reportPage=!!page.empty;
 document.title=`${page.title} · Forte Pilot`;document.body.dataset.page=state.page;
 $('page-title').textContent=page.heading;$('page-subtitle').textContent=page.description;$('breadcrumb-page').textContent=page.title;
 $('loading-state').hidden=!state.busy;
 $('empty-state').hidden=state.busy||state.page!=='upload';
 $('workspace').hidden=state.busy||!state.data||!reportPage;
 $('method-panel').hidden=state.busy||state.page!=='method';
 $('route-empty').hidden=state.busy||!!state.data||!reportPage;
 $('route-empty-description').textContent=page.empty||'';
 $('current-report-note').hidden=state.busy||!state.data||state.page!=='upload';
 $('reset-button').hidden=!state.data||state.busy;
 $('reset-button').querySelector('.pill-text').textContent=state.page==='upload'?'Очистить разбор':'Другой отчёт';
 $('loans-count').hidden=!state.data;
 document.querySelectorAll('.report-page').forEach(panel=>panel.hidden=panel.id!==`panel-${state.page}`);
 document.querySelectorAll('.nav-item[data-page]').forEach(link=>{const active=link.dataset.page===state.page;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 $('back-button').href=state.data?pages.overview.path:pages.upload.path;$('back-button').dataset.page=state.data?'overview':'upload';
 $('back-button').lastChild.textContent=state.data?'К обзору':'К загрузке отчёта';
 updateDraftNotice();
 if(focus){window.scrollTo({top:0});$('page-title').focus({preventScroll:true});}
}
function navigate(name,{replace=false,focus=true}={}){
 if(!pages[name])return;
 if(state.busy){toast('Дождитесь завершения обработки отчёта.');return;}
 if(name==='upload'&&!state.data&&pages[state.page].empty)state.returnPage=state.page;
 const next=pages[name].path;
 if(location.pathname!==next)history[replace?'replaceState':'pushState']({page:name},'',next);
 state.page=name;applyPage({focus});
}

async function api(path,options={}){
 if(!state.token){const response=await fetch('/api/config');if(!response.ok)throw new Error('Локальный сервер недоступен. Перезапустите приложение.');state.token=(await response.json()).token;}
 const response=await fetch(path,{...options,headers:{...options.headers,'X-Pilot-Token':state.token}});
 const data=await response.json().catch(()=>({error:'Не удалось прочитать ответ сервера.'}));
 if(!response.ok)throw new Error(data.error||'Не удалось обработать запрос.');return data;
}
function toast(message){clearTimeout(state.toastTimer);$('toast').textContent=message;$('toast').hidden=false;state.toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function showError(message){$('error-message').textContent=message;$('error-message').hidden=!message;}
function setBusy(value){state.busy=value;$('demo-button').disabled=value;$('file-input').disabled=value;applyPage();}
function eligible(loan){return loan.status==='active'&&['borrower','co_borrower'].includes(loan.role);}
function currentGroup(){return state.data?.summary.currencies[state.currency]||{count:0,balance:null,payment:null,overdue_amount:null,balance_known:0,payment_known:0,balance_complete:false,payment_complete:false};}
function hasIssue(loan){return loan.issues?.length||loan.payment_basis==='assumed_monthly'||loan.status==='unknown'||loan.role==='unknown'||(eligible(loan)&&(loan.balance===null||loan.payment===null));}
function coverageMismatch(){const declared=state.data?.report.declared_active;return declared!==null&&declared!==undefined&&declared!==state.data.loans.filter(l=>l.status==='active').length;}
function sourceUncertain(){return state.data.warnings.some(w=>['balance_total_mismatch','incomplete_contract_row','duplicate_contract_row'].includes(w.code));}

async function processFile(file){
 if(state.busy)return;
 if(!file||!file.name.toLowerCase().endsWith('.pdf'))return showError('Выберите кредитный отчёт в формате PDF.');
 if(file.size>20*1024*1024)return showError('PDF превышает 20 МБ. Загрузите исходный файл меньшего размера.');
 if(!file.size)return showError('Файл пуст. Выберите другой PDF.');
 showError('');setBusy(true);
 try{
  const result=await api('/api/analyze',{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':encodeURIComponent(file.name)},body:file});
  if(state.fileUrl)URL.revokeObjectURL(state.fileUrl);state.fileUrl=URL.createObjectURL(file);
  state.data=result;state.draft=null;state.dirty=false;state.verified=false;state.scenarioSelected.clear();state.currency=result.summary.currencies.KZT?'KZT':Object.keys(result.summary.currencies)[0]||'KZT';
  $('income-input').value='';$('status-filter').value='all';$('confirm-checkbox').checked=false;
  const destination=state.returnPage||'overview';state.returnPage=null;render();state.busy=false;navigate(destination);toast('Отчёт разобран. Проверьте сведения перед использованием расчётов.');
 }catch(error){showError(error.message||'Ошибка обработки файла.');}
 finally{setBusy(false);$('file-input').value='';}
}
function render(){
 if(!state.data)return;
 const {report,loans,summary}=state.data;
 $('demo-notice').hidden=!report.demo;
 $('report-filename').textContent=report.filename;
 $('report-meta').textContent=`${report.bureau} · ${report.pages} стр. · Дата отчёта: ${dateFmt(report.report_date)}`;
 $('loans-count').textContent=loans.length;
 const currencies=Object.keys(summary.currencies);
 $('currency-wrap').hidden=currencies.length<2;
 $('currency-select').innerHTML=currencies.map(c=>`<option value="${c}" ${c===state.currency?'selected':''}>${c==='UNK'?'Не указана':c}</option>`).join('');
 renderBanner();renderMetrics();renderDebt();renderIncome();renderReading();renderTables();renderReview();renderScenario();hydrateIcons();applyPage();
}
function renderBanner(){
 const unresolved=state.data.loans.filter(hasIssue).length;
 const banner=$('review-banner');banner.classList.toggle('verified',state.verified);
 banner.querySelector(':scope > [data-icon]').dataset.icon=state.verified?'check':'scan';
 $('review-title').textContent=state.verified?'Сведения сверены вами':coverageMismatch()?'Список договоров может быть неполным':unresolved?`Требуют внимания: ${unresolved} ${plural(unresolved,'договор','договора','договоров')}`:'Проверьте распознанные сведения';
  $('review-description').textContent=coverageMismatch()?`В сводке отчёта: ${state.data.report.declared_active} действующих договоров. В списке: ${state.data.loans.filter(l=>l.status==='active').length}. Проверьте полноту; суммы отражают учтённую часть.`:sourceUncertain()?'При разборе обнаружены расхождения или неполные строки. Сверьте данные с PDF: после ручных правок исходная сводка автоматически не перепроверяется.':state.verified?'Отметка подтверждает вашу сверку. Подлинность и актуальность файла сервис не устанавливает.':'Итоги предварительные. Пропущенные суммы не заменяются нулями.';
 $('review-button').innerHTML=(state.verified?'Открыть проверку':'Проверить данные')+icon('arrow-right');
}
function plural(n,one,few,many){const v=n%100;return v>=11&&v<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;}
function renderMetrics(){
 const s=state.data.summary,g=currentGroup();
 const hasCurrency=s.active_count>0;
 const items=[
   ['Учтённая задолженность',money(g.balance,state.currency),state.currency==='UNK'?'Уточните валюту: суммы не складываются':coverageMismatch()||sourceUncertain()||s.unclassified_count?'Есть неуточнённые данные':g.balance_complete?`${g.balance_known} ${plural(g.balance_known,'остаток','остатка','остатков')} учтено`:`Известно ${g.balance_known} из ${g.count} остатков`,!g.balance_complete||coverageMismatch()||sourceUncertain()||s.unclassified_count>0,'coins',g.balance===null],
  ['Платежи в месяц',money(g.payment,state.currency),state.currency==='UNK'?'Уточните валюту: суммы не складываются':coverageMismatch()||sourceUncertain()||s.unclassified_count?'Есть неуточнённые данные':g.payment_assumed_count?`Включено предположений: ${g.payment_assumed_count}`:g.payment_complete?'По учтённым договорам':`Частично: ${g.payment_known} из ${g.count} платежей`,!g.payment_complete||coverageMismatch()||sourceUncertain()||s.unclassified_count>0,'calendar',g.payment===null],
  ['Действующих договоров',String(s.active_count),'Заёмщик и созаёмщик',false,'file',false],
   ['С признаками просрочки',String(s.overdue_count),s.overdue_unknown?`По ${s.overdue_unknown} учтённым нет данных`:'По текущим полям учтённых договоров',s.overdue_unknown>0,'alert',false]
 ];
 if(!hasCurrency){items[0][2]='Нет учтённых действующих договоров';items[1][2]='Нет учтённых действующих договоров';}
 $('metrics').innerHTML=items.map(([label,value,note,warning,ic,empty])=>`<article class="metric"><div class="metric-head"><span>${label}</span><span data-icon="${ic}"></span></div><p class="metric-value ${empty?'is-empty':''}">${escapeHtml(value)}</p><p class="metric-foot ${warning?'attention':''}">${escapeHtml(note)}</p></article>`).join('');
}
function renderDebt(){
  const rows=state.data.loans.filter(l=>eligible(l)&&l.currency===state.currency&&l.currency!=='UNK'&&l.balance!==null&&l.balance>0).sort((a,b)=>b.balance-a.balance);
 const total=currentGroup().balance||0;
 $('debt-chart').innerHTML=rows.length?rows.slice(0,6).map(l=>`<div class="debt-item"><div class="debt-item-head"><span class="debt-item-name" title="${escapeHtml(l.creditor)}">${escapeHtml(l.creditor)}</span><strong>${escapeHtml(money(l.balance,l.currency))}</strong></div><div class="debt-track" role="img" aria-label="${escapeHtml(l.creditor)}: ${escapeHtml(money(l.balance,l.currency))}, ${fmt(l.balance/total*100,1)}% известных остатков"><div class="debt-fill" style="width:${Math.min(100,l.balance/total*100)}%"></div></div></div>`).join(''):'<p class="empty-chart">Для структуры долга нужны распознанные остатки действующих договоров. Проверьте статус, роль и суммы.</p>';
 const g=currentGroup();$('debt-footnote').textContent=`${rows.length>6?'Показаны 6 крупнейших обязательств. ':''}${state.currency==='UNK'?'Уточните валюту: структура по суммам не строится.':g.balance_complete?'Структура по известным остаткам учтённых договоров.':'Структура отражает только известные остатки.'} Валюта: ${state.currency==='UNK'?'не определена':state.currency}.`;
}
function parseInput(raw){const v=String(raw).replace(/[\s\u00a0\u202f]/g,'').replace(',','.');if(!v)return null;if(!/^\d+(?:\.\d{0,2})?$/.test(v))return NaN;const n=Number(v);return Number.isFinite(n)&&n<=1e12?n:NaN;}
function gaugeSvg(ratio,partial=false){
 const pct=ratio===null?0:Math.max(0,Math.min(100,ratio));
 const r=82,cx=112,cy=102,arcLen=Math.PI*r;
 const dashOffset=arcLen*(1-pct/100);
 const angle=Math.PI*(1-pct/100);
 const kx=cx+r*Math.cos(angle),ky=cy-r*Math.sin(angle);
 const valueText=ratio===null?'—':`${fmt(ratio,1)}%`;
 return `<div class="gauge-wrap"><svg class="gauge-svg" viewBox="0 0 224 126" role="img" aria-label="${ratio===null?'Укажите доход для расчёта доли известных платежей':'Доля известных платежей '+fmt(ratio,1)+' процента дохода'+(partial?', данные неполные':'')}"><defs><linearGradient id="forteArcGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#9c144b"/><stop offset="100%" stop-color="#e03358"/></linearGradient></defs><path d="M 30 102 A 82 82 0 0 1 194 102" fill="none" stroke="#eceef6" stroke-width="12" stroke-linecap="round"/><path d="M 30 102 A 82 82 0 0 1 194 102" fill="none" stroke="url(#forteArcGrad)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${arcLen.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"/>${ratio!==null?`<circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="7.5" fill="#161448" stroke="#ffffff" stroke-width="3"/>`:''}<text x="112" y="72" text-anchor="middle" class="gauge-caption">Доля известных</text><text x="112" y="102" text-anchor="middle" class="gauge-value">${escapeHtml(valueText)}</text><text x="26" y="121" text-anchor="middle" class="gauge-limit">0%</text><text x="196" y="121" text-anchor="middle" class="gauge-limit">100%</text></svg></div>`;
}
function renderIncome(){
 if(!state.data)return;
 const raw=$('income-input').value,n=parseInput(raw),g=state.data.summary.currencies.KZT;
 $('income-input').classList.toggle('invalid',Number.isNaN(n)||(n!==null&&n<=0));
  if(n===null){$('income-result').innerHTML=gaugeSvg(null)+'<p class="income-empty">Укажите доход ниже, чтобы увидеть долю известных платежей. Доход вводите вы; бюро его здесь не подтверждает.</p>';return;}
 if(Number.isNaN(n)||n<=0){$('income-result').innerHTML=gaugeSvg(null)+'<p class="inline-error">Введите положительный доход, например 400 000. Допустимы две цифры после запятой.</p>';return;}
 if(!g||g.payment===null){$('income-result').innerHTML=gaugeSvg(null)+'<p class="income-empty">Нет известных платежей в тенге. Добавьте их на вкладке проверки данных.</p>';return;}
  const ratio=g.payment/n*100,other=Object.keys(state.data.summary.currencies).some(c=>c!=='KZT'),partial=!g.payment_complete||other||state.data.summary.unclassified_count>0||coverageMismatch()||sourceUncertain();
 $('income-result').innerHTML=`${gaugeSvg(ratio,partial)}<p class="gauge-sub">Доля известных платежей${partial?' · данные неполные':''}</p><div class="budget-legend"><span>Платежи<br><b>${escapeHtml(money(g.payment))}</b></span><span>Доход минус учтённые платежи<br><b>${escapeHtml(money(n-g.payment))}</b></span></div>${partial?'<p class="partial-note">В расчёте есть пропуски или предположения либо учтена только часть обязательств. Фактическая доля может отличаться.</p>':''}`;
}
function renderReading(){
 const {summary:s,loans,report}=state.data;const g=currentGroup();const lines=[];
 lines.push(`<p>В расчётах учтено <b>${s.active_count} ${plural(s.active_count,'действующее обязательство','действующих обязательства','действующих обязательств')}</b>, где ваша роль указана как заёмщик или созаёмщик.${s.closed_count?` Закрытых договоров: <b>${s.closed_count}</b>.`:''}</p>`);
 if(report.closed_details_available===false)lines.push(`<p>${Number.isInteger(report.declared_closed)?`В сводке ГКБ завершённых договоров: <b>${report.declared_closed}</b>. `:''}Подробные строки завершённых договоров в этой краткой форме не представлены.</p>`);
 if(g.next_payment!==undefined&&g.next_payment!==null)lines.push(`<p>Исходные предстоящие платежи ГКБ по учтённым договорам: <b>${escapeHtml(money(g.next_payment,state.currency))}</b>. Это суммы на ближайшие даты платежа. Их месячная периодичность учитывается отдельно и может требовать подтверждения.</p>`);
 if(g.payment!==null)lines.push(`<p>Учтённые платежи в месяц · ${state.currency}: <b>${escapeHtml(money(g.payment,state.currency))}</b>.${g.count>g.payment_known?` Не хватает ${g.count-g.payment_known} ${plural(g.count-g.payment_known,'платежа','платежей','платежей')} — сумма пока неполная.`:''}${g.payment_assumed_count?` Месячная периодичность предположена у ${g.payment_assumed_count} ${plural(g.payment_assumed_count,'платежа','платежей','платежей')}.`:''}</p>`);
 if(s.overdue_count)lines.push(`<p>В текущих полях ${s.overdue_count} ${plural(s.overdue_count,'договора','договоров','договоров')} указана просрочка. Исторические максимумы в этот счётчик не входят.</p>`);
  else lines.push(`<p>В учтённых текущих полях нет положительных сумм или дней просрочки. Это не подтверждает отсутствие просрочек по всем договорам.${s.overdue_unknown?` По ${s.overdue_unknown} учтённым договорам оба текущих поля не заполнены.`:''}</p>`);
 if(s.unclassified_count)lines.push(`<p>Статус или роль требуют уточнения у <b>${s.unclassified_count}</b> ${plural(s.unclassified_count,'договора','договоров','договоров')}. Такие строки пока исключены из итогов.</p>`);
 if(s.guarantor_count)lines.push(`<p>Договоров с ролью гаранта или поручителя: <b>${s.guarantor_count}</b>. Они показаны в списке и исключены из текущей арифметики платежей заёмщика.</p>`);
 const dates=loans.map(l=>l.as_of).filter(Boolean).sort();
 if(dates.length)lines.push(`<p>Даты сведений, указанные в разборе: <b>${dateFmt(dates[0])}${dates[0]!==dates[dates.length-1]?' — '+dateFmt(dates[dates.length-1]):''}</b>. Недавние изменения могут ещё не отражаться в файле.</p>`);
 if(report.input_container==='cms_signed_data')lines.push('<p>PDF прочитан из контейнера электронной подписи. Подлинность подписи не проверялась.</p>');
  if(loans.some(l=>l.edited))lines.push('<p>Разбор содержит ручные изменения. Текущие итоги могут отличаться от исходного PDF; исправления не обновляют сведения бюро.</p>');
  if(coverageMismatch()||sourceUncertain())lines.push('<p>При разборе обнаружены расхождения или неполные строки. Итоги описывают учтённый список; проверьте предупреждения на вкладке данных.</p>');
  if(report.inquiries_30d!==undefined){
  const known=Number.isInteger(report.inquiries_30d)&&Number.isInteger(report.inquiries_90d);
  if(known){const pages=[...new Set([...(report.sources?.inquiries_30d?.pages||[]),...(report.sources?.inquiries_90d?.pages||[])])].sort((a,b)=>a-b);lines.push(`<p>Записей в журнале запросов: <b>${report.inquiries_30d} за 30 дней</b> и <b>${report.inquiries_90d} за 90 дней</b>. Отсчёт от ${dateFmt(report.inquiries_reference_date)}, включая дату отчёта.${pages.length?' Источник: стр. '+pages.map(escapeHtml).join(', ')+'.':''} Это число записей доступного журнала, а не число заявок на кредит. Причины отказов по нему не определяются.</p>`);}
  else lines.push('<p>Количество запросов за 30 и 90 дней по загруженному файлу не определено. Пропуск не означает отсутствие запросов.</p>');
 }
 $('report-reading').innerHTML=lines.join('');
}
function scenarioResult(){return CreditScenario.calculate(state.data.loans,state.scenarioSelected,{currency:state.currency,income:parseInput($('income-input').value),declaredActive:state.data.report.declared_active,sourceUncertain:sourceUncertain()});}
function renderScenario(){
 if(!state.data)return;
 const active=state.data.loans.filter(eligible),allowed=new Set(active.map(l=>l.id));
 state.scenarioSelected=new Set([...state.scenarioSelected].filter(id=>allowed.has(id)));
 const rows=active.filter(l=>l.currency===state.currency);
 $('scenario-income-input').value=$('income-input').value;
 $('scenario-currency-label').textContent=`Валюта сравнения: ${state.currency==='UNK'?'не указана':state.currency}`;
 $('scenario-loans').innerHTML=rows.map(l=>`<label class="scenario-choice ${state.scenarioSelected.has(l.id)?'is-selected':''}"><input type="checkbox" data-sim-loan="${escapeHtml(l.id)}" ${state.scenarioSelected.has(l.id)?'checked':''}><span class="scenario-loan-copy"><strong>${escapeHtml(l.creditor)}</strong><small>Договор ${state.data.loans.findIndex(x=>x.id===l.id)+1} · ${escapeHtml(l.title)} · ${escapeHtml(roleLabels[l.role])}</small><span class="scenario-loan-amounts"><span>Остаток <b>${escapeHtml(money(l.balance,l.currency))}</b></span><span>В месяц <b>${escapeHtml(money(l.payment,l.currency))}</b></span></span>${l.payment_basis==='assumed_monthly'?'<span class="scenario-row-note">Месячный платёж предположен</span>':l.payment===null?'<span class="scenario-row-note">Месячный платёж нужно уточнить</span>':''}${l.balance===null?'<span class="scenario-row-note">Остаток неизвестен</span>':''}</span></label>`).join('')||'<p class="empty-chart">В этой валюте нет учтённых действующих обязательств. Проверьте список договоров и выбранную валюту.</p>';
 renderScenarioResults();
}
function renderScenarioResults(){
 if(!state.data)return;
 const r=scenarioResult(),currency=state.currency;
 $('scenario-selection-count').textContent=`Выбрано ${r.selected_count} из ${r.eligible_count} в этой валюте${r.selected_total_count>r.selected_count?`; всего выбрано: ${r.selected_total_count}`:''}`;
 $('scenario-reset').disabled=r.selected_total_count===0;
 $('scenario-select-all').disabled=r.eligible_count===0||r.selected_count===r.eligible_count;
 document.querySelectorAll('[data-sim-loan]').forEach(input=>{input.checked=state.scenarioSelected.has(input.dataset.simLoan);input.closest('.scenario-choice').classList.toggle('is-selected',input.checked);});
 const detail=group=>group.count===0?'В этой группе нет обязательств':group.known<group.count?`Известно ${group.known} из ${group.count} сумм`:group.assumed_count?`Предположений в сумме: ${group.assumed_count}`:'По учтённым обязательствам';
 const items=[['Учтённые платежи',r.before,r.before.partial?'Предварительная сумма':detail(r.before)],['В сценарии закрытия',r.after,r.after.partial?'Предварительная сумма':r.after.count?'По оставшимся обязательствам':'Учтённые обязательства закрыты в сценарии'],['Снижение в сценарии',r.reduction,detail(r.reduction)],['Остатки выбранных',r.closing_balance,detail(r.closing_balance)]];
 let html=`<dl class="scenario-metrics">${items.map(([label,g,note],i)=>`<div class="${i===1?'scenario-after':''}"><dt>${label}</dt><dd>${g.amount===null?'Не определено':escapeHtml(money(g.amount,currency))}</dd><small>${escapeHtml(note)}</small></div>`).join('')}</dl>`;
 const n=parseInput($('income-input').value),invalid=Number.isNaN(n)||n!==null&&n<=0;
 $('scenario-income-input').classList.toggle('invalid',invalid);
 if(currency!=='KZT')html+='<p class="income-empty">Доход указан в тенге. Для сравнения долей переключите валюту аналитики на KZT. Обязательства других валют считаются отдельно.</p>';
 else if(n===null)html+='<p class="income-empty">Укажите доход, чтобы сравнить долю платежей сейчас и после закрытия.</p>';
 else if(invalid)html+='<p class="inline-error">Введите положительный месячный доход.</p>';
 else{
  html+='<div class="scenario-ratios"><h4>Доля известных платежей в доходе</h4>';
  for(const [label,g]of [['В разборе',r.before],['В сценарии',r.after]])html+=`<div class="scenario-ratio"><span>${label}</span><div class="budget-track" aria-hidden="true"><div class="budget-paid" style="width:${g.ratio===null?0:Math.min(100,g.ratio)}%"></div></div><strong>${g.ratio===null?'Нет данных':fmt(g.ratio,1)+'%'}</strong></div>${g.partial?`<p class="scenario-ratio-note">${label}: расчёт по предварительным или неполным сведениям.</p>`:''}`;
  html+='</div>';
 }
 const notes=[];
 if(r.before.assumed_count)notes.push('В расчёт включены предполагаемые месячные платежи. Подтвердите их в проверке данных.');
 if(r.before.known<r.before.count)notes.push('Часть месячных платежей неизвестна. Показаны известные суммы; снижение может отличаться.');
  if(currency!=='UNK'&&r.selected_count&&!r.closing_balance.complete)notes.push('Остатки части выбранных договоров неизвестны. Сумма остатков неполная.');
 if(r.foreign_before)notes.push('Обязательства других валют учитываются отдельно; доля дохода отражает только тенговую часть.');
  if(r.coverage_mismatch||r.unclassified_count||r.source_uncertain)notes.push('Есть расхождения или неуточнённые договоры. Сценарий охватывает только учтённый список.');
  if(currency==='UNK')notes.push('Валюта не определена. Суммы этих договоров не складываются; укажите валюту в проверке данных.');
 if(!r.selected_total_count)notes.unshift('Отметьте кредиты в списке, чтобы увидеть эффект полного закрытия.');
 html+=notes.map(note=>`<p class="partial-note">${escapeHtml(note)}</p>`).join('');
 $('scenario-results').innerHTML=html;
 $('scenario-live').innerHTML=`<div><span>В сценарии${r.after.partial?' · предварительно':''}</span><strong>${r.after.amount===null?'Нет данных':escapeHtml(money(r.after.amount,currency))}</strong><small>${r.after.ratio===null?(currency!=='KZT'?'Доля доступна только для KZT':'Доля не определена'):fmt(r.after.ratio,1)+'% дохода'}</small></div><div><span>Снижение в сценарии${r.reduction.complete?'':' · предварительно'}</span><strong>${r.reduction.amount===null?'Нет данных':escapeHtml(money(r.reduction.amount,currency))}</strong>${r.before.ratio===null?'':`<small>Сейчас: ${fmt(r.before.ratio,1)}% дохода</small>`}</div>`;
}
function lenderBadge(name){
 const s=String(name||'').toLowerCase();
 if(s.includes('forte'))return ['FB','tone-forte'];
 if(s.includes('kaspi'))return ['KB','tone-kaspi'];
 if(s.includes('bcc')||s.includes('центркредит'))return ['BC','tone-gold'];
 if(s.includes('halyk')||s.includes('народный'))return ['HB','tone-green'];
 const cleaned=String(name||'').replace(/^(?:ао|тоо|мфо|дочерняя компания)\s*/i,'').replace(/["«»']/g,'').trim();
 const words=cleaned.split(/\s+/).filter(Boolean);
 const letters=(words.length>=2?words[0][0]+words[1][0]:cleaned.slice(0,2)||'КР').toUpperCase();
 return [letters,'tone-navy'];
}
function tableHtml(rows,emptyText){
 if(!rows.length)return `<div class="data-table-wrap"><p class="table-empty">${escapeHtml(emptyText)}</p></div>`;
 return `<p class="table-scroll-hint">Прокрутите таблицу вправо, чтобы увидеть суммы.</p><div class="data-table-wrap" tabindex="0" role="region" aria-label="Таблица обязательств с горизонтальной прокруткой"><table class="data-table"><thead><tr><th scope="col">Кредитор / договор</th><th scope="col">Статус</th><th scope="col" class="numeric">Задолженность</th><th scope="col" class="numeric">Платёж / мес.</th><th scope="col" class="numeric">Просрочка</th><th scope="col"><span class="visually-hidden">Проверка</span></th></tr></thead><tbody>${rows.map(l=>{const [abbr,tone]=lenderBadge(l.creditor);return `<tr><td><div class="lender-cell"><span class="lender-avatar ${tone}" aria-hidden="true">${escapeHtml(abbr)}</span><div><strong>${escapeHtml(l.creditor)}</strong><small>${escapeHtml(l.title)} · ${escapeHtml(roleLabels[l.role])}</small>${l.edited?'<small>Изменено пользователем</small>':''}</div></div></td><td><span class="badge ${l.status==='closed'?'closed-badge':l.status==='unknown'?'warning-badge':'active-badge'}">${statusLabels[l.status]}</span></td><td class="numeric">${l.balance===null?'<span class="missing">Не указан</span>':escapeHtml(money(l.balance,l.currency))}</td><td class="numeric">${l.payment===null?'<span class="missing">Нет данных</span>':escapeHtml(money(l.payment,l.currency))}${l.payment_basis==='assumed_monthly'?'<small class="missing">Месячный · предположение</small>':''}</td><td class="numeric">${l.overdue_amount===null?'<span class="missing">Нет данных</span>':escapeHtml(money(l.overdue_amount,l.currency))}</td><td><button class="table-link" type="button" data-review-loan="${escapeHtml(l.id)}" aria-label="Проверить договор ${escapeHtml(l.creditor)}">${icon('arrow-up-right')}</button></td></tr>`;}).join('')}</tbody></table></div>`;
}
function renderTables(){
 const loans=state.data.loans,filter=$('status-filter').value;
 $('preview-table').innerHTML=tableHtml(loans.filter(eligible).slice(0,5),'Действующие договоры заёмщика не определены. Проверьте распознанные сведения.');
 const filtered=loans.filter(l=>filter==='all'||filter==='review'&&hasIssue(l)||l.status===filter);
 $('loans-table').innerHTML=tableHtml(filtered,'Нет договоров, соответствующих выбранному фильтру.');
}
function sourceText(loan,field){const source=loan.sources?.[field];if(!source)return '<small class="source-missing">Нет ссылки на поле PDF · можно указать вручную</small>';return `<small>Стр. ${escapeHtml(source.page)} · ${escapeHtml(source.label)} · исходное значение: ${escapeHtml(source.value)}${loan.edited?' · проверьте исправление':''}</small>`;}
function inputField(loan,field,label,type='text',options=null){
 const id=`${loan.id}-${field}`,value=loan[field]??'';
 if(options)return `<div class="field"><label for="${escapeHtml(id)}">${label}</label><select id="${escapeHtml(id)}" data-field="${field}">${Object.entries(options).map(([k,v])=>`<option value="${escapeHtml(k)}" ${value===k?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></div>`;
 const numeric=['balance','payment','overdue_amount','overdue_days','credit_limit','max_overdue_days_history'].includes(field);
 return `<div class="field"><label for="${escapeHtml(id)}">${label}</label><input id="${escapeHtml(id)}" data-field="${field}" type="${type}" value="${escapeHtml(value)}" ${numeric?'inputmode="decimal" placeholder="Нет данных"':field==='creditor'?'maxlength="120"':''}>${numeric&&field!=='overdue_days'||['start_date','end_date'].includes(field)?sourceText(loan,field):''}${field==='payment'&&loan.payment_basis==='assumed_monthly'?'<label class="payment-confirm"><input type="checkbox" data-confirm-monthly><span>Подтверждаю, что это месячный платёж</span></label>':''}</div>`;
}
function pkbFields(loan){
 if(state.data.report.bureau!=='ПКБ')return '';
 const limit=loan.title==='Кредитная карта'||loan.credit_limit!==null&&loan.credit_limit!==undefined?inputField(loan,'credit_limit',`Кредитный лимит${loan.credit_limit_currency?' · '+escapeHtml(loan.credit_limit_currency):''}`):'';
 return limit+inputField(loan,'start_date','Дата начала договора','date')+inputField(loan,'end_date','Дата окончания по договору','date')+inputField(loan,'max_overdue_days_history','Максимум просрочки в доступной истории, дней');
}
function renderReview(){
 if(!state.draft)state.draft=structuredClone(state.data.loans);
 const warnings=state.data.warnings.filter(w=>w.level==='warning'&&w.code!=='contract_count_mismatch');
 if(coverageMismatch())warnings.unshift({text:`В сводке отчёта ${state.data.report.declared_active} действующих договоров. В списке ${state.data.loans.filter(l=>l.status==='active').length}. Добавьте пропущенные записи или проверьте их статусы.`});
 $('report-warnings').innerHTML=warnings.map(w=>`<div class="notice"><span>${icon('info')}</span><span>${escapeHtml(w.text)}</span></div>`).join('');
 $('review-records').innerHTML=state.draft.map((l,i)=>`<article class="review-record" data-loan-id="${escapeHtml(l.id)}" id="record-${escapeHtml(l.id)}"><div class="review-record-head"><div><h3>Договор ${i+1} · ${escapeHtml(l.creditor)}</h3><p>${l.page?'Источник: страница '+l.page:'Добавлено вручную'}${l.edited?' · есть исправления':''}</p></div><button type="button" class="remove-button" data-remove="${escapeHtml(l.id)}">${icon('trash')}Убрать из разбора</button></div><div class="review-record-body">${inputField(l,'creditor','Кредитор')}${inputField(l,'status','Статус','text',statusLabels)}${inputField(l,'role','Ваша роль','text',roleLabels)}${inputField(l,'balance','Текущая задолженность')}${inputField(l,'payment','Платёж в месяц · проверьте периодичность')}${inputField(l,'currency','Валюта','text',{KZT:'KZT · тенге',USD:'USD · доллар',EUR:'EUR · евро',RUB:'RUB · рубль',UNK:'Не указана'})}${inputField(l,'overdue_amount','Текущая сумма просрочки')}${inputField(l,'overdue_days','Текущие дни просрочки')}${inputField(l,'as_of','Дата сведений','date')}${pkbFields(l)}</div>${l.issues?.length?`<p class="review-issues">${l.issues.map(escapeHtml).join(' ')}</p>`:''}</article>`).join('')||'<p class="table-empty">Нет распознанных договоров. При необходимости добавьте сведения вручную.</p>';
 $('confirm-checkbox').checked=state.verified;updateDraftNotice();
}
function collectEdits(){
 return [...document.querySelectorAll('[data-loan-id]')].map(row=>{
  const original=state.draft.find(l=>l.id===row.dataset.loanId),loan={...original};
  row.querySelectorAll('[data-field]').forEach(input=>{
   const field=input.dataset.field;input.classList.remove('invalid');
   if(['balance','payment','overdue_amount','overdue_days','credit_limit','max_overdue_days_history'].includes(field)){
    const value=parseInput(input.value);
    const daysField=['overdue_days','max_overdue_days_history'].includes(field);
    if(Number.isNaN(value)||(daysField&&value!==null&&(!Number.isInteger(value)||value>99999))){input.classList.add('invalid');throw new Error(`Проверьте поле «${input.labels[0].textContent}». ${daysField?'Нужно целое неотрицательное число дней':'Нужна неотрицательная сумма'}.`);}
    loan[field]=value;
   }else loan[field]=input.value.trim()||null;
  });
  if('payment_basis' in original){
   if(loan.payment===null)loan.payment_basis=null;
   else if(row.querySelector('[data-confirm-monthly]')?.checked)loan.payment_basis='user_confirmed_monthly';
   else if(loan.payment!==original.payment)loan.payment_basis='user_entered_monthly';
  }
  loan.edited=original.edited||['creditor','status','role','balance','payment','payment_basis','currency','overdue_amount','overdue_days','as_of','credit_limit','start_date','end_date','max_overdue_days_history'].some(k=>(loan[k]??null)!==(original[k]??null));
  return loan;
 });
}
async function saveReview(event){
 event.preventDefault();$('review-error').hidden=true;
 try{
  const loans=collectEdits();$('save-button').disabled=true;
  const result=await api('/api/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loans})});
  state.data.loans=result.loans;state.data.summary=result.summary;state.verified=$('confirm-checkbox').checked;state.draft=null;state.dirty=false;
  if(!result.summary.currencies[state.currency])state.currency=Object.keys(result.summary.currencies)[0]||'KZT';
  render();navigate('overview');window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});toast('Сведения сохранены, расчёты обновлены.');
 }catch(error){$('review-error').textContent=error.message;$('review-error').hidden=false;}
 finally{$('save-button').disabled=false;}
}
function reset(){
 if(state.fileUrl)URL.revokeObjectURL(state.fileUrl);
 state.data=null;state.draft=null;state.dirty=false;state.fileUrl=null;state.verified=false;state.currency='KZT';state.returnPage=null;
 state.scenarioSelected.clear();$('scenario-income-input').value='';$('income-input').value='';
 ['scenario-loans','scenario-results','scenario-live','scenario-selection-count','scenario-currency-label','review-records','report-reading','preview-table','loans-table','metrics','report-filename','report-meta','debt-chart','income-result','report-warnings','review-error'].forEach(id=>$(id).replaceChildren());
 showError('');navigate('upload');
}
function exportData(){
 const payload={...state.data,reviewed_by_user:state.verified,income_entered:$('income-input').value||null,simulation:state.scenarioSelected.size?{...scenarioResult(),assumption:'Полное закрытие выбранных обязательств; суммы по известным остаткам, без изменения исходных договоров.'}:null,scope:'Справочный разбор загруженных сведений. Без прогноза одобрения.'};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='credit-report-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Разбор сохранён в JSON на вашем компьютере.');
}
hydrateIcons();
$('file-input').addEventListener('change',e=>processFile(e.target.files[0]));
const drop=$('drop-zone');['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag-over');}));['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('drag-over');}));drop.addEventListener('drop',e=>processFile(e.dataTransfer.files[0]));
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
$('demo-button').addEventListener('click',async()=>{try{$('demo-button').disabled=true;const response=await fetch('/demo.pdf');if(!response.ok)throw new Error('Не удалось создать пример. Проверьте reportlab.');await processFile(new File([await response.blob()],'Демонстрационный_отчёт_ПКБ.pdf',{type:'application/pdf'}));}catch(error){showError(error.message);}finally{$('demo-button').disabled=false;}});
$('reset-button').addEventListener('click',reset);
$('income-input').addEventListener('input',()=>{$('scenario-income-input').value=$('income-input').value;renderIncome();renderScenarioResults();});$('scenario-income-input').addEventListener('input',()=>{$('income-input').value=$('scenario-income-input').value;renderIncome();renderScenarioResults();});$('currency-select').addEventListener('change',e=>{state.currency=e.target.value;renderMetrics();renderDebt();renderReading();renderScenario();hydrateIcons();});$('status-filter').addEventListener('change',renderTables);
$('scenario-loans').addEventListener('change',e=>{const input=e.target.closest('[data-sim-loan]');if(!input)return;if(input.checked)state.scenarioSelected.add(input.dataset.simLoan);else state.scenarioSelected.delete(input.dataset.simLoan);renderScenarioResults();});
$('scenario-select-all').addEventListener('click',()=>{state.data.loans.filter(l=>eligible(l)&&l.currency===state.currency).forEach(l=>state.scenarioSelected.add(l.id));renderScenarioResults();});
$('scenario-reset').addEventListener('click',()=>{state.scenarioSelected.clear();renderScenarioResults();});
$('source-button').addEventListener('click',()=>{if(state.fileUrl)window.open(state.fileUrl,'_blank','noopener,noreferrer');});$('export-button').addEventListener('click',exportData);
$('review-form').addEventListener('submit',saveReview);$('review-form').addEventListener('input',e=>{state.dirty=true;if(e.target.id!=='confirm-checkbox'){$('confirm-checkbox').checked=false;}updateDraftNotice();});
$('add-loan-button').addEventListener('click',()=>{try{state.draft=collectEdits();}catch(error){$('review-error').textContent=error.message;$('review-error').hidden=false;return;}const id='manual-'+Date.now();state.draft.push({id,creditor:'Новый договор',title:'Займ',status:'unknown',role:'unknown',currency:'KZT',balance:null,payment:null,overdue_amount:null,overdue_days:null,as_of:null,page:null,sources:{},issues:[],edited:true});state.dirty=true;renderReview();$('confirm-checkbox').checked=false;hydrateIcons();$('record-'+id).scrollIntoView({block:'center'});});
document.addEventListener('click',e=>{const review=e.target.closest('[data-review-loan]');if(review){navigate('review');const row=$('record-'+review.dataset.reviewLoan);row?.scrollIntoView({block:'center'});row?.querySelector('input')?.focus({preventScroll:true});}const remove=e.target.closest('[data-remove]');if(remove){try{state.draft=collectEdits().filter(l=>l.id!==remove.dataset.remove);state.dirty=true;renderReview();$('confirm-checkbox').checked=false;hydrateIcons();toast('Строка убрана. Нажмите «Сохранить и пересчитать».');}catch(error){$('review-error').textContent=error.message;$('review-error').hidden=false;}}});
window.addEventListener('beforeunload',()=>{if(state.fileUrl)URL.revokeObjectURL(state.fileUrl);});
fetch('/api/health').catch(()=>showError('Локальный сервер недоступен. Запустите приложение и обновите страницу.'));

document.addEventListener('click',event=>{
 const link=event.target.closest('a[data-page]');
 if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
 event.preventDefault();navigate(link.dataset.page);
});
window.addEventListener('popstate',()=>{state.page=pageFromLocation();applyPage({focus:true});});
history.replaceState({page:state.page},'',location.href);
applyPage();
