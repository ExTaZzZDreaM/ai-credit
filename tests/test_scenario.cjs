const assert=require('node:assert/strict');
const {calculate}=require('../web/scenario.js');
let passed=0;
const test=(name,fn)=>{fn();passed++;};
const loan=(id,balance,payment,extra={})=>({id,balance,payment,currency:'KZT',status:'active',role:'borrower',...extra});
const base=()=>[loan('a',1250000,65000),loan('b',320000,24000),loan('c',180000,15000),loan('closed',0,18000,{status:'closed'}),loan('guar',900000,90000,{role:'guarantor'})];
const options={income:400000,declaredActive:4}; // Three personal contracts plus a guarantee.
test('Known payment and income reduction excludes closed loans and guarantees',()=>{
 const r=calculate(base(),new Set(['b']),options);
 assert.equal(r.before.amount,'104000.00');assert.equal(r.after.amount,'80000.00');
 assert.equal(r.reduction.amount,'24000.00');assert.equal(r.closing_balance.amount,'320000.00');
 assert.equal(r.before.ratio,26);assert.equal(r.after.ratio,20);assert.equal(r.after.partial,false);
});
test('No selection preserves payments and shows zero reduction',()=>{
 const r=calculate(base(),[],options);assert.equal(r.after.amount,'104000.00');assert.equal(r.reduction.amount,'0.00');assert.equal(r.closing_balance.amount,'0.00');
});
test('Closing every recognized obligation yields zero remaining payment',()=>{
 const r=calculate(base(),['a','b','c'],options);assert.equal(r.after.amount,'0.00');assert.equal(r.after.ratio,0);assert.equal(r.closing_balance.amount,'1750000.00');assert.equal(r.after.complete,true);
});
test('Closing an unknown payment does not invent the reduction',()=>{
 const loans=base();loans[2].payment=null;const r=calculate(loans,['c'],options);
 assert.equal(r.before.partial,true);assert.equal(r.after.amount,'89000.00');assert.equal(r.after.partial,false);assert.equal(r.reduction.amount,null);
});
test('An unknown remaining payment keeps the after estimate partial',()=>{
 const loans=base();loans[2].payment=null;const r=calculate(loans,['b'],options);
 assert.equal(r.after.amount,'65000.00');assert.equal(r.after.partial,true);assert.equal(r.reduction.amount,'24000.00');
});
test('All selected can remove missing remaining payments while relief stays partial',()=>{
 const loans=base();loans[2].payment=null;const r=calculate(loans,['a','b','c'],options);
 assert.equal(r.after.amount,'0.00');assert.equal(r.after.partial,false);assert.equal(r.reduction.complete,false);
});
test('Unknown closing balance stays unknown',()=>{
 const loans=base();loans[1].balance=null;const r=calculate(loans,['b'],options);
 assert.equal(r.closing_balance.amount,null);assert.equal(r.closing_balance.complete,false);assert.equal(r.after.amount,'80000.00');
});
test('Assumed monthly payments are included and flagged',()=>{
 const loans=base();loans[2].payment_basis='assumed_monthly';const r=calculate(loans,['c'],options);
 assert.equal(r.before.amount,'104000.00');assert.equal(r.before.assumed_count,1);assert.equal(r.before.partial,true);
 assert.equal(r.after.partial,false);assert.equal(r.reduction.assumed_count,1);assert.equal(r.reduction.complete,false);
});
test('Foreign currencies stay separate and keep before income partial',()=>{
 const loans=base().concat(loan('usd',500,30,{currency:'USD'}));const r=calculate(loans,['c','usd'],{...options,declaredActive:5});
 assert.equal(r.before.amount,'104000.00');assert.equal(r.after.amount,'89000.00');assert.equal(r.closing_balance.amount,'180000.00');
 assert.equal(r.before.partial,true);assert.equal(r.after.partial,false);assert.equal(r.selected_total_count,2);
});
test('Non-KZT scenarios do not divide a foreign payment by KZT income',()=>{
 const loans=base().concat(loan('usd',500,30,{currency:'USD'}));const r=calculate(loans,['usd'],{income:400000,currency:'USD',declaredActive:5});
 assert.equal(r.before.amount,'30.00');assert.equal(r.after.amount,'0.00');assert.equal(r.before.ratio,null);assert.equal(r.closing_balance.amount,'500.00');
});
test('Ineligible, duplicate and stale IDs cannot reduce payments',()=>{
 const r=calculate(base(),['closed','guar','missing','b','b'],options);assert.deepEqual(r.selected_ids,['b']);assert.equal(r.after.amount,'80000.00');
});
test('An incomplete source does not become a debt-free claim after select-all',()=>{
 const r=calculate(base(),['a','b','c'],{...options,declaredActive:8});assert.equal(r.after.amount,'0.00');assert.equal(r.after.partial,true);assert.equal(r.coverage_mismatch,true);
});
test('An unknown active role keeps totals provisional',()=>{
 const r=calculate(base().concat(loan('unknown',5000,2000,{role:'unknown'})),['a','b','c'],{income:400000});assert.equal(r.after.partial,true);assert.equal(r.unclassified_count,1);
});
test('Cents are summed without floating point drift',()=>{
 const r=calculate([loan('a',.1,.1),loan('b',.2,.2)],['a','b']);assert.equal(r.before.amount,'0.30');assert.equal(r.closing_balance.amount,'0.30');
});
test('Large sums retain exact cents beyond Number safe integer range',()=>{
 const loans=Array.from({length:150},(_,i)=>loan(String(i),'999999999999.99','0.01'));
 const r=calculate(loans,loans.map(l=>l.id));assert.equal(r.closing_balance.amount,'149999999999998.50');assert.equal(r.reduction.amount,'1.50');assert.doesNotThrow(()=>JSON.stringify(r));
});
test('Missing or invalid income does not produce a ratio',()=>{
 for(const income of [null,'',0,-1,NaN,Infinity,true])assert.equal(calculate(base(),['b'],{income}).before.ratio,null);
});
test('Saved edits immediately change the scenario and remove closed IDs',()=>{
 const loans=base();loans[1].status='closed';loans[0].payment=60000;const r=calculate(loans,['b'],{income:400000});
 assert.equal(r.selected_count,0);assert.equal(r.after.amount,'75000.00');assert.equal(r.before.ratio,18.75);
});
test('Scenario evaluation never changes report records',()=>{
 const loans=base(),before=JSON.stringify(loans);calculate(loans,['a','b'],options);assert.equal(JSON.stringify(loans),before);
});
test('Empty eligible list is a zero sum within the represented scope',()=>{
 const r=calculate([loan('a',0,99,{status:'closed'})],[],{income:400000});assert.equal(r.eligible_count,0);assert.equal(r.after.amount,'0.00');assert.equal(r.after.ratio,0);
});
test('Unknown currency cannot yield combined amounts, even after select-all',()=>{
 const loans=[loan('x',100,10,{currency:'UNK'}),loan('y',200,20,{currency:'UNK'})];
 const r=calculate(loans,['x','y'],{currency:'UNK',income:400000});
 for(const group of [r.before,r.after,r.reduction,r.closing_balance]){assert.equal(group.amount,null);assert.equal(group.complete,false);}
 assert.equal(r.after.partial,true);
});
test('Unreconciled source totals keep a select-all result provisional',()=>{
 const r=calculate(base(),['a','b','c'],{...options,sourceUncertain:true});
 assert.equal(r.after.amount,'0.00');assert.equal(r.after.partial,true);assert.equal(r.source_uncertain,true);
});
console.log(`Scenario arithmetic: ${passed} checks passed.`);
