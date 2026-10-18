/* Smart Track: local UI only. Calculations and validated import live in smart-track-core.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), C = window.SmartTrackCore;
  const KEY = 's2s_smart_track_v1', ACTIVE_KEY = KEY + '_active';
  const clone = x => JSON.parse(JSON.stringify(x));
  const id = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = n => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
  const text = (key, value) => { $(key).textContent = value; };
  const number = key => $(key).value.trim() === '' ? null : Number($(key).value);
  const value = (key, val) => { $(key).value = val == null ? '' : val; };
  const today = timezone => {
    try { const parts = new Intl.DateTimeFormat('en-CA', {timeZone:timezone || 'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(type => parts.find(p=>p.type===type).value).join('-'); }
    catch { return new Date().toISOString().slice(0,10); }
  };
  const addDays = (date, days) => { const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); };
  const categories = ['Food / materials','Labor','Rent','Other'];
  let db, activeId = '', mode = 'actual', draft = null, reportResult = null, projectionResult = null;
  let blockedStorage = false, messageTimer;
  function message(msg, error=false) {
    clearTimeout(messageTimer); text('message',msg); $('message').className='message '+(error?'error':'success'); $('message').hidden=false;
    if (!error) messageTimer=setTimeout(()=>{$('message').hidden=true;},6500);
  }
  function guarded(fn) { return (...args) => { try { const result=fn(...args); if(result?.catch) result.catch(e=>message(e.message || String(e),true)); } catch(e) { message(e.message || String(e),true); } }; }
  function merchant() { return db.merchants.find(m=>m.id===activeId) || null; }
  function commit(next, success) {
    if(blockedStorage) throw new Error('Existing local data could not be read safely. Restore a valid backup before saving; no records were overwritten.');
    const serialized=C.serializeDB(next);
    try { localStorage.setItem(KEY,serialized); } catch { throw new Error('Could not save on this device. Storage may be full or disabled. Your saved records were not changed; download a backup and check browser storage.'); }
    db=next; text('saveStatus','Saved on this device · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
    if(success) message(success);
  }
  function updateMerchant(fn, success, merchantId=activeId) { const next=clone(db), m=next.merchants.find(m=>m.id===merchantId); if(!m) throw new Error('Choose a business first.'); fn(m); commit(next,success); }
  function selectedMerchant(idToSelect, resetDates=true) {
    activeId=idToSelect; try{localStorage.setItem(ACTIVE_KEY,activeId);}catch{}
    resetSale();resetFinance();$('itemForm').reset();value('editItemId','');$('itemCode').readOnly=false;
    const m=merchant(); if(m){const saved=m.proposals[0]; draft=saved?clone(saved):freshPlan(m); if(resetDates)setReportDates(m);}
    render(); if(m)fillPlan();
  }
  function setReportDates(m) {
    const dates=m.sales.map(s=>s.date).sort(), last=dates.at(-1)||today(m.timezone);
    value('reportFrom',dates[0]||last.slice(0,7)+'-01'); value('reportTo',last);
  }
  function freshPlan(m) {
    const dates=m.sales.map(s=>s.date).sort(), end=dates.at(-1)||today(m.timezone);
    const start=[addDays(end,1),addDays(m.baselineDate,1),today(m.timezone)].sort().at(-1);
    return {id:id('proposal'),name:'Next pricing step',startDate:start,historyStart:dates[0]||end.slice(0,7)+'-01',historyEnd:end,months:12,declinePct:0,feePct:null,baselineRebatePct:null,rebatePct:null,costs:null,goalAmount:null,purpose:'',allocations:[],changes:[]};
  }
  function createBusiness() {
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const m=C.createMerchant({id:id('merchant'),name:'New business',address:'',mid:'',timezone:zone,baselineDate:today(zone),openingRebateBalance:null});
    const next=clone(db); next.merchants.push(m);commit(next,'Business added. Enter your identity and original item prices below.');selectedMerchant(m.id);$('merchantDetails').open=true;$('merchantDetails').scrollIntoView({behavior:'smooth',block:'start'});$('businessName').focus();
  }
  function table(target,headers,rows) {
    $(target).innerHTML=rows.length?'<table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p class="empty-table">No records yet.</p>';
  }
  const editButton=(action,recordId,label='Edit')=>'<button type="button" class="small-button" data-action="'+action+'" data-id="'+escape(recordId)+'">'+escape(label)+'</button>';
  function options(items,selected) { return items.map(([v,t])=>'<option value="'+escape(v)+'"'+(v===selected?' selected':'')+'>'+escape(t)+'</option>').join(''); }
  function render() {
    const m=merchant();$('empty').hidden=!!m;$('workspace').hidden=!m;
    $('merchantSelect').innerHTML=options(db.merchants.map(m=>[m.id,m.name+(m.demo?' · fictional demo':'')]),activeId);$('merchantSelect').disabled=!db.merchants.length;
    if(!m)return;
    text('merchantTitle',m.name);text('merchantIdentity',[m.address,m.mid?'MID: '+m.mid:'MID: not entered','Time zone: '+m.timezone].filter(Boolean).join(' · '));$('demoLabel').hidden=!m.demo;
    text('baselineSummary',(m.items.length||0)+' baseline items · '+m.baselineDate);text('salesSummary',m.sales.length+' recorded sales / refund lines');
    value('businessName',m.name);value('businessAddress',m.address);value('businessMid',m.mid);value('businessTimezone',m.timezone);value('baselineDate',m.baselineDate);value('openingRebate',m.openingRebateBalance);
    const currentSale=$('saleItem').value; $('saleItem').innerHTML=options(m.items.map(i=>[i.id,i.name+' ('+i.id+')']),currentSale);
    const currentItem=$('changeItem').value; $('changeItem').innerHTML=options([['all','All baseline items'],...m.items.map(i=>[i.id,i.name])],currentItem||'all');
    $('proposalSelect').innerHTML=options([['','Unsaved / new proposal'],...m.proposals.map(p=>[p.id,p.name])],m.proposals.some(p=>p.id===draft?.id)?draft.id:'');
    table('itemTable',['Item ID','Name','Original price',''],m.items.map(i=>[escape(i.id),escape(i.name),money(i.price),editButton('editItem',i.id)+' '+editButton('deleteItem',i.id,'Remove')]));
    const sorted=m.changes.slice().sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
    const prior={};m.items.forEach(i=>{prior[i.id]=i.price;});
    table('historyTable',['Effective','Change','Item','Old → new',''],sorted.flatMap(c=>Object.entries(c.prices).map(([iid,price])=>{const old=prior[iid];prior[iid]=price;return [escape(c.effectiveDate),escape(c.label),escape(m.items.find(i=>i.id===iid)?.name||iid),money(old)+' → '+money(price),editButton('deleteChange',c.id,'Remove change')];})));
    table('salesTable',['Date','Item','Qty','List price','Promotions','Tender',''],m.sales.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,250).map(s=>[escape(s.date)+(s.priceDate?'<small>Original: '+escape(s.priceDate)+'</small>':''),escape(m.items.find(i=>i.id===s.itemId)?.name||s.itemId),escape(s.quantity),money(s.unitPrice),escape(s.discountPct||0)+'% + '+money(s.discountAmount||0),escape(s.tender),editButton('editSale',s.id)+' '+editButton('deleteSale',s.id,'Remove')]));
    if(m.sales.length>250)$('salesTable').insertAdjacentHTML('beforeend','<p class="small">Showing the latest 250 lines. Reports and backups include all '+m.sales.length+' lines.</p>');
    table('financeTable',['Period','Comparison','Fees','Costs added','Rebate earned / paid',''],m.finances.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(f=>[escape(f.start)+' → '+escape(f.end),escape(f.baselineLabel),money(f.feeActual),f.costs==null||f.costs.some(c=>c.actual==null||c.baseline==null)?'—':money(f.costs.reduce((n,c)=>n+c.actual-c.baseline,0)),money(f.rebateEarned)+' / '+money(f.rebatePaid),editButton('editFinance',f.id)+' '+editButton('deleteFinance',f.id,'Remove')]));
    if(!$('saleDate').value)value('saleDate',today(m.timezone));
    renderDashboard();
  }
  function costsEditor(prefix,costs) {
    const existing=costs?.length?costs:categories.map(name=>({name,baseline:null,actual:null}));
    $(prefix+'Costs').innerHTML=existing.map((c,i)=>'<div class="cost-grid" data-cost-row><span class="cost-name">'+escape(c.name)+'</span><label>Baseline ($)<input type="number" step="0.01" data-cost="baseline" data-name="'+escape(c.name)+'" value="'+escape(c.baseline??'')+'" aria-label="'+escape(c.name)+' baseline"></label><label>Actual / planned ($)<input type="number" step="0.01" data-cost="actual" value="'+escape(c.actual??'')+'" aria-label="'+escape(c.name)+' actual or planned"></label></div>').join('');
    $(prefix+'NoCosts').checked=Array.isArray(costs)&&costs.length===0;toggleCosts(prefix);
  }
  function toggleCosts(prefix){ const checked=$(prefix+'NoCosts').checked;$(prefix+'Costs').querySelectorAll('input').forEach(i=>{i.disabled=checked;}); }
  function readCosts(prefix) {
    if($(prefix+'NoCosts').checked)return [];
    const rows=[];$(prefix+'Costs').querySelectorAll('[data-cost-row]').forEach(row=>{const a=row.querySelector('[data-cost="baseline"]'),b=row.querySelector('[data-cost="actual"]');if(a.value===''&&b.value==='')return;if(a.value===''||b.value==='')throw new Error('Enter both baseline and actual amounts for '+a.dataset.name+', or leave both blank.');rows.push({name:a.dataset.name,baseline:Number(a.value),actual:Number(b.value)});});return rows.length?rows:null;
  }
  function fillPlan(){
    const p=draft;if(!p)return;
    if(![1,3,12,36,60,120].includes(p.months)&&!$('horizon').querySelector('option[value="'+p.months+'"]'))$('horizon').insertAdjacentHTML('beforeend','<option value="'+p.months+'">'+p.months+' months</option>');
    ['name','goalAmount','purpose','startDate','historyStart','historyEnd','months','declinePct','feePct','baselineRebatePct','rebatePct'].forEach(k=>value(({name:'planName',startDate:'planStart',months:'horizon',feePct:'planFee'})[k]||k,p[k]));
    value('changeDate',p.startDate);costsEditor('plan',p.costs);renderAllocations();renderPlanChanges();
  }
  function readPlan(){
    if(!draft)throw new Error('Choose a business first.');
    const p=clone(draft);Object.assign(p,{name:$('planName').value.trim()||'Untitled proposal',startDate:$('planStart').value,historyStart:$('historyStart').value,historyEnd:$('historyEnd').value,months:Number($('horizon').value),declinePct:number('declinePct'),feePct:number('planFee'),baselineRebatePct:number('baselineRebatePct'),rebatePct:number('rebatePct'),costs:readCosts('plan'),goalAmount:number('goalAmount'),purpose:$('purpose').value.trim()});
    p.allocations=[...$('allocationRows').querySelectorAll('.allocation-row')].map(row=>({name:row.querySelector('[data-allocation="name"]').value.trim(),amount:Number(row.querySelector('[data-allocation="amount"]').value)})).filter(a=>a.name||a.amount);
    if(!p.startDate||!p.historyStart||!p.historyEnd)throw new Error('Enter the plan start and the historical quantity period.');
    if(p.allocations.some(a=>!a.name||!Number.isFinite(a.amount)||a.amount<0))throw new Error('Each allocation needs a name and a non-negative monthly amount.');
    if(p.changes.some(c=>c.date<p.startDate))throw new Error('A proposed price date cannot be before the plan starts.');
    return p;
  }
  function renderAllocations(){ $('allocationRows').innerHTML=(draft.allocations||[]).map((a,i)=>'<div class="allocation-row"><label>Purpose<input data-allocation="name" value="'+escape(a.name)+'" placeholder="Equipment"></label><label>Per month ($)<input data-allocation="amount" type="number" min="0" step="0.01" value="'+escape(a.amount)+'"></label><button type="button" class="quiet small-button" data-action="removeAllocation" data-id="'+i+'">Remove</button></div>').join(''); }
  function proposalPrice(p,itemId,date,includeSame=true){
    const m=merchant(), original=C.priceAt(m,itemId,addDays(p.startDate,-1));let price=original;
    const steps=m.changes.filter(c=>c.effectiveDate>=p.startDate).map(c=>({date:c.effectiveDate,prices:c.prices})).concat(p.changes).sort((a,b)=>a.date.localeCompare(b.date));
    steps.forEach(c=>{if((includeSame?c.date<=date:c.date<date)&&Object.hasOwn(c.prices,itemId))price=c.prices[itemId];});return price;
  }
  function renderPlanChanges(){
    const m=merchant();if(!m||!draft)return;
    const prior={};m.items.forEach(i=>{prior[i.id]=C.priceAt(m,i.id,addDays(draft.startDate,-1));});
    table('planChanges',['Proposed date','Item','Old → new','Change',''],draft.changes.slice().sort((a,b)=>a.date.localeCompare(b.date)).flatMap(c=>Object.entries(c.prices).map(([iid,price])=>{const old=proposalPrice(draft,iid,c.date,false);const delta=old==null?null:price-old;return [escape(c.date),escape(m.items.find(i=>i.id===iid)?.name||iid),money(old)+' → '+money(price),money(delta)+(old? ' ('+((price-old)/old*100).toFixed(2)+'%)':''),editButton('removePlanChange',c.date,'Remove step')];})));
  }
  function setMode(next){mode=next;$('actualMode').classList.toggle('on',mode==='actual');$('planMode').classList.toggle('on',mode==='plan');$('actualMode').setAttribute('aria-pressed',mode==='actual');$('planMode').setAttribute('aria-pressed',mode==='plan');$('actualDates').hidden=mode==='plan';$('planSection').hidden=mode!=='plan';renderDashboard();}
  function showMetric(key,n){text(key,money(n));$(key).classList.toggle('negative',n!=null&&n<0);}
  function issues(list){const unique=[...new Set((list||[]).map(x=>typeof x==='string'?x:JSON.stringify(x)))];$('issues').hidden=!unique.length;$('issues').innerHTML='<ul>'+unique.slice(0,8).map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>'+(unique.length>8?'<p>'+ (unique.length-8)+' more data checks appear in the calculation details.</p>':'');}
  function renderDashboard(){
    const m=merchant();if(!m)return;
    if(mode==='plan')renderProjection();else renderActual();
  }
  function renderActual(){
    const m=merchant(),from=$('reportFrom').value,to=$('reportTo').value;
    if(!from||!to||from>to){reportResult=null;['pricingValue','costValue','contributionValue'].forEach(k=>showMetric(k,null));text('periodLabel','Choose a valid reporting range');issues(['Choose a valid reporting range.']);return;}
    reportResult=C.report(m,from,to); const t=reportResult.totals, has=reportResult.lineCount>0;
    text('viewEyebrow',m.demo?'FICTIONAL DEMO · RECORDED RESULTS':'RECORDED RESULTS');text('viewTitle','Your pricing, made clear.');text('periodLabel',from+' through '+to);
    showMetric('pricingValue',has?t.combinedEffect:null);showMetric('costValue',has&&t.costIncrease!=null&&t.feeSavings!=null?t.costIncrease-t.feeSavings:null);showMetric('contributionValue',has?t.incrementalContribution:null);
    text('pricingNote','Same recorded basket vs original list prices; promotions included.');text('costNote','Added operating costs + added processing. Negative means cost savings. Rebate earnings are separate.');text('contributionNote',t.incrementalContribution==null?'Needs complete fees, rebate baseline and incremental cost inputs.':'After accounted cost differences and rebate earnings. Before unentered costs and taxes.');
    text('calculationNote','Pricing revenue − added costs + incremental rebate earned = contribution. Recorded inputs are not verified POS data. Same-basket repricing does not prove causal demand growth.');
    issues([...(reportResult.issues||[]),...(!has?['No recorded sales lines in this range. Add sales or choose another period.']:[])]);
    const fields=[['Total sales receipts','receipts'],['Cash receipts','cashReceipts'],['Card receipts','cardReceipts'],['Unknown-tender receipts','unknownTenderReceipts'],['Original-list-price basket','baselineReceipts'],['Gross permanent price effect','priceEffect'],['Transaction promotion effect','promotionEffect'],['Price effect, same promotions held constant','priceUpliftAfterSamePromotion'],['Total processing fees','feeActual'],['Baseline processing fees','feeBaseline'],['Fee savings / (added fees)','feeSavings'],['Card proceeds after processing','cardProceeds'],['Card funds actually settled','cardSettled'],['Operating cost increase / (decrease)','costIncrease'],['Rebate earned','rebateEarned'],['Baseline rebate earned','rebateBaseline'],['Incremental rebate earned','rebateIncrement'],['Rebate actually paid','rebatePaid'],['Rebate outstanding','rebateOutstanding']];
    renderBreakdown(fields.map(([label,key])=>[label,has||['feeActual','feeBaseline','rebateEarned','rebatePaid','cardSettled'].includes(key)?t[key]:null]));
    const p=merchant().proposals.find(p=>p.id===draft?.id)||draft;renderGoal(p,t.incrementalContribution,false,from,to);
    table('versionTable',['Date','Recorded change','Gross price effect'],(reportResult.versionEffects||[]).map(v=>[escape(v.effectiveDate),escape(v.label),money(v.amount)]).concat([['','Unattributed price effect',money(t.unattributedPriceEffect)],['','Unexplained price variance',money(t.unexplainedPriceEffect)]]));
    renderReportRows();renderComparison();
  }
  function renderBreakdown(fields){$('breakdown').innerHTML=fields.map(([name,n])=>'<div class="breakdown-item"><span>'+escape(name)+'</span><strong'+(n!=null&&n<0?' class="negative"':'')+'>'+money(n)+'</strong></div>').join('');}
  function renderGoal(p,contribution,projected,from,to){
    const goal=p?.goalAmount; text('goalSummary',money(goal));
    let monthly=contribution;
    if(!projected&&from&&to){const days=(Date.parse(to)-Date.parse(from))/86400000+1;monthly=contribution==null?null:contribution/(days/30.4375);}
    const percent=goal>0&&monthly!=null?Math.max(0,Math.min(100,monthly/goal*100)):0;
    $('goalProgress').style.width=percent+'%';$('goalProgress').parentElement.setAttribute('aria-valuenow',String(Math.round(percent)));
    text('goalProgressText',goal>0?(monthly==null?'Add the missing inputs to measure progress toward ': (projected?'Projected ': 'Recorded period normalized to a month: ')+money(monthly)+' toward ')+money(goal)+' / month'+(p.purpose?' for '+p.purpose:'')+'.': 'Set a monthly goal in your plan. A target is a planning tool, not a promised result.');
    const planned=p?.allocations?.reduce((sum,a)=>sum+a.amount,0)||0;showMetric('allocationValue',p?planned:null);text('allocationNote',(!projected?'Planning amount only · ':'')+'needs reconciliation');
  }
  function renderProjection(){
    const m=merchant();if(!draft)return;
    projectionResult=C.projection(m,draft);const r=projectionResult,a=r.averageMonthly||{},t=r.totals||{};
    text('viewEyebrow',m.demo?'FICTIONAL DEMO · PROJECTION':'PROJECTION · ESTIMATE');text('viewTitle','What your next changes could contribute.');text('periodLabel',draft.months+' months from '+draft.startDate);
    showMetric('pricingValue',a.priceEffect);showMetric('costValue',a.costIncrease!=null&&a.feeIncrement!=null?a.costIncrease+a.feeIncrement:null);showMetric('contributionValue',a.contribution);
    text('pricingNote','Average per month. Same-basket price effect vs prices before this plan; historical promotions retained.');text('costNote','Average monthly added operating + processing costs. Negative means cost savings.');text('contributionNote',a.contribution==null?'Enter fees, rebate assumptions and additional costs.':'Average monthly contribution, including chosen volume sensitivity. Before unentered costs and taxes.');
    text('calculationNote','Pricing effect + volume effect − added costs + incremental rebate earned = projected contribution. Historical quantities and tender mix are selected below. No organic growth or investment return is assumed.');issues(r.issues||[]);
    renderBreakdown([['Projected monthly receipts',a.receipts],['Projected monthly cash receipts',a.cashReceipts],['Projected monthly card receipts',a.cardReceipts],['Unknown-tender receipts',a.unknownTenderReceipts],['Same-basket pricing effect',a.priceEffect],['Effect of chosen volume decline',a.volumeEffect],['Added processing cost',a.feeIncrement],['Added operating costs',a.costIncrease],['Rebate earned, monthly estimate',a.rebateEarned],['Baseline rebate earned',a.rebateBaseline],['Incremental rebate earned',a.rebateIncrement],['Rebate payment timing',null],['Actually received / settled',null]]);
    renderGoal(draft,a.contribution,true);showMetric('forecastRevenue',t.priceEffect);showMetric('forecastContribution',t.contribution);text('forecastHorizon',draft.months+' months');
    text('planStatus',r.valid?'Projection updated. Saving keeps a proposal; applying requires a separate action.':'Some inputs need attention. Unavailable amounts stay blank.');
    table('projectionTable',['Month','Pricing effect','Volume effect','Higher op. costs','Added processing','Rebate earned','Contribution'],(r.monthly||[]).map(row=>[escape(row.month||row.start),money(row.priceEffect),money(row.volumeEffect),money(row.costIncrease),money(row.feeIncrement),money(row.rebateEarned),money(row.contribution)]));
    $('assumptions').innerHTML=(r.assumptions||[]).map(a=>'<li>'+escape(typeof a==='string'?a:JSON.stringify(a))+'</li>').join('');
    if(r.allocation&&!r.allocation.valid){text('allocationNote','Planned amount exceeds contribution or contribution is unknown.');}
    const sensitivity=[0,5,10].map(decline=>{const alt=C.projection(m,{...clone(draft),declinePct:decline});return decline+'% lower volume: '+money(alt.averageMonthly?.contribution)+' / mo';});text('sensitivity','Volume sensitivity — '+sensitivity.join(' · '));
  }
  function reportBuckets(){
    const from=$('reportFrom').value,to=$('reportTo').value,group=$('reportGroup').value;
    if(!from||!to||from>to)return [];
    if(group==='cumulative')return [{from,to,label:from+' → '+to}];
    let cursor=from;const list=[];
    while(cursor<=to&&list.length<1500){let end=cursor;if(group==='monthly'){const d=new Date(cursor+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1,0);end=d.toISOString().slice(0,10);if(end>to)end=to;}list.push({from:cursor,to:end,label:group==='monthly'?cursor.slice(0,7):cursor});cursor=addDays(end,1);}return list;
  }
  function renderReportRows(){const rows=reportBuckets().map(b=>{const r=C.report(merchant(),b.from,b.to),t=r.totals;return [escape(b.label),money(r.lineCount?t.receipts:null),money(r.lineCount?t.combinedEffect:null),money(t.costIncrease),money(t.incrementalContribution),escape(r.reconciliation||'needs reconciliation')];});table('reportTable',['Period','Receipts','Pricing + promotions','Added op. costs','Contribution','Status'],rows);if(rows.length===1500)$('reportTable').insertAdjacentHTML('beforeend','<p class="small">Showing the first 1,500 daily periods. Narrow your date range for later days.</p>');}
  function renderComparison(){
    const m=merchant(),p=m.proposals.find(p=>p.id===draft?.id);
    if(!p){text('comparison','Save a proposal to compare a complete later actual month against its forecast.');return;}
    const from=$('reportFrom').value,to=$('reportTo').value;
    const comparison=C.compareActual(m,p,from,to);
    if(!comparison.valid){text('comparison','Saved plan “'+p.name+'”: '+(comparison.issues||[]).join(' '));return;}
    const rows=[['Original forecast, matched months',comparison.projectedPriceEffect],['Planned prices on actual basket',comparison.plannedOnActualBasket],['Actual prices on actual basket',comparison.actualPriceEffect],['Price execution difference',comparison.priceExecutionVariance],['Basket / promotion / volume difference',comparison.basketPromotionVolumeVariance],['Total difference from forecast',comparison.totalVariance]];
    $('comparison').innerHTML='<h3>Actual vs saved plan: '+escape(p.name)+'</h3><div class="breakdown-grid">'+rows.map(([label,amount])=>'<div class="breakdown-item"><span>'+escape(label)+'</span><strong>'+money(amount)+'</strong></div>').join('')+'</div><p class="small">'+escape(comparison.basis)+'</p><p class="small">'+(comparison.limitations||[]).map(escape).join(' ')+'</p>';
  }
  function download(name,content,type='application/json'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const csvCell=x=>{let s=String(x??'');if(/^[=+\-@\t\r]/.test(s)&&typeof x!=='number')s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  function reportCSV(){
    if(mode==='actual'&&!reportBuckets().length)throw new Error('Choose a valid reporting date range before exporting.');
    if(mode==='plan'){draft=readPlan();renderProjection();}
    const m=merchant(),tag=m.demo?'FICTIONAL DEMO':'USER-ENTERED DATA';const rows=[['Smart Track report',tag],['Business',m.name],['Address',m.address],['MID',m.mid],['Time zone',m.timezone],['View',mode==='plan'?'PROJECTION — ESTIMATE':'RECORDED INPUTS'],['Baseline',mode==='plan'?'Prices before proposal start; historical promotions retained':'Original list prices; promotions included'],[]];
    if(mode==='plan'){rows.push(['Plan',draft.name],['Start',draft.startDate],['Months',draft.months],['Month','Pricing effect','Volume effect','Added operating costs','Added processing','Rebate earned','Contribution']);(projectionResult?.monthly||[]).forEach(r=>rows.push([r.month||r.start,r.priceEffect,r.volumeEffect,r.costIncrease,r.feeIncrement,r.rebateEarned,r.contribution]));}
    else{rows.push(['Period','Receipts','Pricing + promotion effect','Added operating costs','Fees','Rebate earned','Rebate paid','Contribution','Status']);reportBuckets().forEach(b=>{const r=C.report(m,b.from,b.to),t=r.totals;rows.push([b.label,r.lineCount?t.receipts:null,r.lineCount?t.combinedEffect:null,t.costIncrease,t.feeActual,t.rebateEarned,t.rebatePaid,t.incrementalContribution,'Needs reconciliation']);});}
    if(mode==='actual'&&reportBuckets().length===1500)rows.push(['Display/export capped at 1,500 periods. Narrow the date range to include later days.']);
    rows.push([],['Blank amounts mean unavailable, never confirmed zero.'],['Contribution is before unentered costs and taxes; no cash available to withdraw is established.'],['Same-basket price effects do not prove causal demand growth.']);download((m.demo?'FICTIONAL-DEMO-':'')+'smart-track-report-'+today(m.timezone)+'.csv',rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function saveDraft(){draft=readPlan();const result=C.projection(merchant(),draft);if(result.allocation?.planned>0&&!result.allocation.valid)throw new Error('Reduce planned allocations to the positive projected contribution, or enter missing assumptions first.');updateMerchant(m=>{const idx=m.proposals.findIndex(p=>p.id===draft.id);if(idx>=0)m.proposals[idx]=clone(draft);else m.proposals.push(clone(draft));},'Proposal saved locally. No prices were applied.');render();}
  function resetSale(){ $('saleForm').reset();value('editSaleId','');value('saleDate',today(merchant()?.timezone)); }
  function resetFinance(){ $('financeForm').reset();value('editFinanceId','');costsEditor('finance',null); }
  function wire(){
    $('restoreBackup').onclick=()=>{$('backupFile').click();};
    $('newMerchant').onclick=guarded(createBusiness);$('start').onclick=guarded(createBusiness);
    $('merchantSelect').onchange=guarded(()=>selectedMerchant($('merchantSelect').value));
    $('demo').onclick=guarded(()=>{const demo=C.demoDB(),next=clone(db);demo.merchants.forEach(m=>{m.id=id('demo');m.demo=true;next.merchants.push(m);});commit(next,'Fictional demo added as a separate business. Your other records are unchanged.');selectedMerchant(next.merchants.at(-1).id);});
    $('actualMode').onclick=guarded(()=>setMode('actual'));$('planMode').onclick=guarded(()=>setMode('plan'));
    const openPlan=guarded(()=>{setMode('plan');$('planSection').scrollIntoView({behavior:'smooth',block:'start'});});$('openPlan').onclick=openPlan;$('goHistoryPlan').onclick=openPlan;
    ['reportFrom','reportTo','reportGroup'].forEach(k=>$(k).onchange=guarded(renderActual));
    $('planSection').addEventListener('input',()=>text('planStatus','Inputs changed. Choose Update projection to refresh the estimated numbers.'));
    $('planNoCosts').onchange=()=>toggleCosts('plan');$('financeNoCosts').onchange=()=>toggleCosts('finance');
    $('proposalSelect').onchange=guarded(()=>{const selected=merchant().proposals.find(p=>p.id===$('proposalSelect').value);draft=selected?clone(selected):freshPlan(merchant());fillPlan();renderDashboard();});
    $('newPlan').onclick=guarded(()=>{draft=freshPlan(merchant());fillPlan();render();});
    $('calculatePlan').onclick=guarded(()=>{draft=readPlan();renderPlanChanges();renderProjection();});
    $('savePlan').onclick=guarded(saveDraft);
    $('addAllocation').onclick=guarded(()=>{draft=readPlan();draft.allocations.push({name:'',amount:0});renderAllocations();});
    $('addPlanChange').onclick=guarded(()=>{
      const p=readPlan(),date=$('changeDate').value,amount=number('changeAmount'),kind=$('changeKind').value,selected=$('changeItem').value,m=merchant();
      if(!date||date<p.startDate)throw new Error('Choose an effective date on or after the plan starts.');if(amount==null||!Number.isFinite(amount))throw new Error('Enter a signed percentage, dollar adjustment, or new item price.');if(!m.items.length)throw new Error('Add original baseline items first.');if(kind==='absolute'&&selected==='all')throw new Error('Choose one item for an absolute new price. Use a percentage or dollar adjustment for all items.');
      if(p.changes.some(c=>c.date>date))throw new Error('Add proposed steps in date order, or remove later steps before inserting an earlier date. This preserves each later absolute price.');
      const ids=selected==='all'?m.items.map(i=>i.id):[selected],prices=Object.create(null);ids.forEach(iid=>{const old=proposalPrice(p,iid,date);if(old==null)throw new Error('A baseline price is missing for '+iid);const price=kind==='percent'?old*(1+amount/100):kind==='dollar'?old+amount:amount;if(price<0)throw new Error('A resulting price cannot be negative.');prices[iid]=Math.round((price+Number.EPSILON)*10000)/10000;});
      const same=p.changes.find(c=>c.date===date);if(same)Object.assign(same.prices,prices);else p.changes.push({date,prices});draft=p;renderPlanChanges();renderProjection();message('Dated step added to the proposal. Nothing has been applied.');
    });
    $('solveGoal').onclick=guarded(()=>{const p=readPlan();if(!(p.goalAmount>0))throw new Error('Enter a positive monthly contribution goal first.');if(p.changes.length&&!confirm('Replace the proposed price steps with one goal-based increase? Your applied history stays unchanged.'))return;const item=$('changeItem').value,r=C.solveGoal(merchant(),p,item==='all'?undefined:[item]);if(!r.valid)throw new Error((r.issues||['The goal cannot be solved with these inputs.']).join(' '));draft={...p,changes:[{date:p.startDate,prices:r.prices}]};renderPlanChanges();renderProjection();message('Proposed increase: '+Number(r.percent).toFixed(2)+'%. Review the prices, costs and volume assumptions before saving.');});
    $('applyPlan').onclick=guarded(()=>{
      const p=readPlan(),m=merchant(),cutoff=today(m.timezone),eligible=p.changes.filter(c=>c.date<=cutoff&&!m.changes.some(h=>h.proposalId===p.id&&h.effectiveDate===c.date));
      if(!eligible.length)throw new Error('There are no unrecorded steps effective today or earlier. Future steps remain proposals.');
      if(!confirm('Record '+eligible.length+' effective step(s) as actually applied? Confirm these dates and prices match what you changed in your business. This updates tracking only, never your POS.'))return;
      draft=p;updateMerchant(mm=>{eligible.forEach(c=>mm.changes.push({id:id('change'),label:p.name,effectiveDate:c.date,prices:clone(c.prices),proposalId:p.id}));const idx=mm.proposals.findIndex(x=>x.id===p.id);if(idx>=0)mm.proposals[idx]=clone(p);else mm.proposals.push(clone(p));},'Effective price steps recorded. Future proposed steps remain separate.');render();
    });
    $('merchantForm').onsubmit=guarded(e=>{e.preventDefault();const m=merchant(),date=$('baselineDate').value;if((m.sales.length||m.changes.length)&&date!==m.baselineDate&&!confirm('Changing the original baseline date recalculates historical comparisons. Save this correction?'))return;updateMerchant(mm=>Object.assign(mm,{name:$('businessName').value.trim(),address:$('businessAddress').value.trim(),mid:$('businessMid').value.trim(),timezone:$('businessTimezone').value.trim(),baselineDate:date,openingRebateBalance:number('openingRebate')}),'Business details saved.');render();});
    $('itemForm').onsubmit=guarded(e=>{e.preventDefault();const oldId=$('editItemId').value,newId=$('itemCode').value.trim(),m=merchant();if(oldId&&newId!==oldId)throw new Error('An existing item ID cannot be renamed. Keep its stable identifier for sales and history.');if(oldId&&(m.sales.length||m.changes.length)&&!confirm('Editing an original price recalculates all historical comparisons. Save this baseline correction?'))return;updateMerchant(mm=>{const item={id:newId,name:$('itemName').value.trim(),price:number('itemPrice')};const idx=oldId?mm.items.findIndex(i=>i.id===oldId):-1;if(idx>=0)mm.items[idx]=item;else mm.items.push(item);},'Baseline item saved.');$('itemForm').reset();value('editItemId','');$('itemCode').readOnly=false;render();});
    $('saleForm').onsubmit=guarded(e=>{e.preventDefault();const sid=$('editSaleId').value||id('sale');const row={id:sid,date:$('saleDate').value,priceDate:$('salePriceDate').value||null,itemId:$('saleItem').value,quantity:number('saleQuantity'),unitPrice:number('salePrice'),discountPct:number('saleDiscountPct'),discountAmount:number('saleDiscountAmount'),tender:$('saleTender').value};updateMerchant(m=>{const idx=m.sales.findIndex(s=>s.id===sid);if(idx>=0)m.sales[idx]=row;else m.sales.push(row);},'Sales line saved.');resetSale();render();});
    $('cancelSale').onclick=resetSale;
    $('saleItem').onchange=()=>{const m=merchant(),date=$('salePriceDate').value||$('saleDate').value;if(m&&date)value('salePrice',C.priceAt(m,$('saleItem').value,date));};
    $('financeForm').onsubmit=guarded(e=>{e.preventDefault();const fid=$('editFinanceId').value||id('finance');const record={id:fid,start:$('financeStart').value,end:$('financeEnd').value,baselineLabel:$('financeBaseline').value.trim(),costs:readCosts('finance')};['feeActual','feeBaseline','rebateEarned','rebateBaseline','rebatePaid','cardSettled'].forEach(k=>{record[k]=number(k);});updateMerchant(m=>{const idx=m.finances.findIndex(f=>f.id===fid);if(idx>=0)m.finances[idx]=record;else m.finances.push(record);},'Finance period saved.');resetFinance();render();});
    $('cancelFinance').onclick=resetFinance;
    $('csvTemplate').onclick=()=>download('smart-track-sales-template.csv',C.salesCSVTemplate(),'text/csv;charset=utf-8');
    $('salesFile').onchange=guarded(async()=>{const input=$('salesFile'),file=input.files[0],targetId=activeId,targetName=merchant()?.name;input.value='';if(!file)return;if(file.size>10*1024*1024)throw new Error('Use a CSV file smaller than 10 MB.');const parsed=C.parseCSV(await file.text());if(parsed.errors.length)throw new Error('CSV not imported: '+parsed.errors.slice(0,5).join(' '));if(!parsed.rows.length)throw new Error('The CSV contains no sales lines.');updateMerchant(m=>{m.sales.push(...parsed.rows);},parsed.rows.length+' sales lines imported locally into '+targetName+'.',targetId);render();});
    $('backup').onclick=guarded(()=>download('smart-track-backup-'+today()+'.json',C.serializeDB(db)));
    $('backupFile').onchange=guarded(async()=>{const input=$('backupFile'),file=input.files[0];input.value='';if(!file)return;if(file.size>20*1024*1024)throw new Error('Use a backup smaller than 20 MB.');const next=C.parseDB(await file.text());if(!confirm('Replace all local Smart Track records with this validated backup ('+next.merchants.length+' businesses)? Download a backup of your current data first.'))return;const wasBlocked=blockedStorage;blockedStorage=false;try{commit(next,'Backup restored locally.');}catch(e){blockedStorage=wasBlocked;throw e;}$('fatal').hidden=true;selectedMerchant(db.merchants[0]?.id||'');});
    $('downloadReport').onclick=guarded(reportCSV);$('printReport').onclick=()=>window.print();
    document.addEventListener('click',guarded(e=>{
      const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,rid=button.dataset.id,m=merchant();
      if(action==='editItem'){const row=m.items.find(i=>i.id===rid);value('editItemId',row.id);value('itemCode',row.id);value('itemName',row.name);value('itemPrice',row.price);$('itemCode').readOnly=true;$('itemName').focus();}
      if(action==='deleteItem'){if(!confirm('Remove this original item? It can only be removed if no sales, changes or proposals use it.'))return;updateMerchant(mm=>{mm.items=mm.items.filter(i=>i.id!==rid);},'Unused item removed.');render();}
      if(action==='deleteChange'){if(!confirm('Remove this applied change and recalculate history? Later absolute prices remain recorded.'))return;updateMerchant(mm=>{mm.changes=mm.changes.filter(c=>c.id!==rid);},'Applied change removed; history recalculated.');render();}
      if(action==='editSale'){const s=m.sales.find(s=>s.id===rid);value('editSaleId',s.id);value('saleDate',s.date);value('salePriceDate',s.priceDate);value('saleItem',s.itemId);value('saleQuantity',s.quantity);value('salePrice',s.unitPrice);value('saleDiscountPct',s.discountPct);value('saleDiscountAmount',s.discountAmount);value('saleTender',s.tender);$('saleDate').focus();}
      if(action==='deleteSale'){if(!confirm('Remove this sales line and recalculate reports?'))return;updateMerchant(mm=>{mm.sales=mm.sales.filter(s=>s.id!==rid);},'Sales line removed.');render();}
      if(action==='editFinance'){const f=m.finances.find(f=>f.id===rid);value('editFinanceId',f.id);value('financeStart',f.start);value('financeEnd',f.end);value('financeBaseline',f.baselineLabel);['feeActual','feeBaseline','rebateEarned','rebateBaseline','rebatePaid','cardSettled'].forEach(k=>value(k,f[k]));costsEditor('finance',f.costs);$('financeStart').focus();}
      if(action==='deleteFinance'){if(!confirm('Remove this finance period? Its fees, rebate and costs will become unavailable in reports.'))return;updateMerchant(mm=>{mm.finances=mm.finances.filter(f=>f.id!==rid);},'Finance period removed.');render();}
      if(action==='removeAllocation'){draft=readPlan();draft.allocations.splice(Number(rid),1);renderAllocations();}
      if(action==='removePlanChange'){draft=readPlan();draft.changes=draft.changes.filter(c=>c.date!==rid);renderPlanChanges();renderProjection();}
    }));
  }
  function boot(){
    if(!C){text('fatal','The local calculation file did not load. Open Smart Track with smart-track-core.js beside this page. No data has been changed.');$('fatal').hidden=false;return;}
    db=C.createDB();
    try{const stored=localStorage.getItem(KEY);if(stored)db=C.parseDB(stored);activeId=localStorage.getItem(ACTIVE_KEY)||'';}catch(e){blockedStorage=true;text('fatal','Existing browser data could not be loaded safely: '+e.message+'. No saved data was overwritten. Restore a validated backup before making changes.');$('fatal').hidden=false;}
    if(!db.merchants.some(m=>m.id===activeId))activeId=db.merchants[0]?.id||'';
    wire();costsEditor('finance',null);selectedMerchant(activeId);
  }
  boot();
})();
