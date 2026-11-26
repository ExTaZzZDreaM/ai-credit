'use strict';
// Shared browser/Node arithmetic. Money is added in integer kopecks/tiyn.
// Decimal strings in results retain cents when exporting large totals.
const CreditScenario=(()=>{
 const eligible=l=>l.status==='active'&&['borrower','co_borrower'].includes(l.role);
 function cents(value){
  if(!['number','string'].includes(typeof value))return null;
  const s=String(value).replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
  const [whole,fraction='']=s.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 }
 const decimal=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
 function total(loans,field){
  const values=loans.map(l=>cents(l[field])),known=values.filter(v=>v!==null);
  const assumed=field==='payment'?loans.filter(l=>l.payment_basis==='assumed_monthly'&&cents(l.payment)!==null).length:0;
  return {amount:!loans.length?'0.00':known.length?decimal(known.reduce((a,b)=>a+b,0n)):null,known:known.length,count:loans.length,assumed_count:assumed,complete:known.length===loans.length&&assumed===0};
 }
 function calculate(loans,selectedIds,{currency='KZT',income=null,declaredActive=null,sourceUncertain=false}={}){
  const active=loans.filter(eligible),allowed=new Set(active.map(l=>l.id));
  const selected=new Set([...selectedIds].filter(id=>allowed.has(id)));
  const visible=active.filter(l=>l.currency===currency),closing=visible.filter(l=>selected.has(l.id)),remaining=visible.filter(l=>!selected.has(l.id));
  const subtotal=(rows,field)=>{const g=total(rows,field);return currency==='UNK'?{...g,amount:null,complete:false}:g;};
  const before=subtotal(visible,'payment'),after=subtotal(remaining,'payment');
  const coverage=declaredActive!==null&&declaredActive!==undefined&&declaredActive!==loans.filter(l=>l.status==='active').length;
  const unclassified=loans.filter(l=>l.status==='unknown'||l.status==='active'&&l.role==='unknown').length;
  const foreignBefore=active.filter(l=>l.currency!==currency).length,foreignAfter=active.filter(l=>l.currency!==currency&&!selected.has(l.id)).length;
  const inc=cents(income),validIncome=inc!==null&&inc>0n;
  const ratio=payment=>currency==='KZT'&&validIncome&&payment.amount!==null?Number(cents(payment.amount))*100/Number(inc):null;
  return {currency,selected_ids:[...selected],selected_count:closing.length,selected_total_count:selected.size,eligible_count:visible.length,
   before:{...before,ratio:ratio(before),partial:!before.complete||coverage||unclassified>0||foreignBefore>0||sourceUncertain},
   after:{...after,ratio:ratio(after),partial:!after.complete||coverage||unclassified>0||foreignAfter>0||sourceUncertain},
   reduction:subtotal(closing,'payment'),closing_balance:subtotal(closing,'balance'),income_valid:validIncome,source_uncertain:sourceUncertain,
   coverage_mismatch:coverage,unclassified_count:unclassified,foreign_before:foreignBefore,foreign_after:foreignAfter};
 }
 return {calculate,eligible};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CreditScenario;
