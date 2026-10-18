/* Smart Track local calculation core. No network, storage, or POS writes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmartTrackCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000, MONTH_DAYS = 365.25 / 12;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const nullable = v => v === null || num(v);
  const uid = () => 'st-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const sum = a => a.reduce((s, n) => s + n, 0);
  const completeSum = a => a.length && a.every(num) ? sum(a) : null;
  const subtract = (a, b) => num(a) && num(b) ? a - b : null;
  const clone = v => JSON.parse(JSON.stringify(v));
  const dateMs = s => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    const n = Date.parse(s + 'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === s ? n : NaN;
  };
  const dateOK = s => Number.isFinite(dateMs(s));
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const days = (a, b) => (dateMs(b) - dateMs(a)) / DAY + 1;
  const previousDay = s => iso(dateMs(s) - DAY);
  function addMonths(s, n) {
    const d = new Date(dateMs(s));
    const day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return iso(d.getTime());
  }
  const sortedChanges = m => (m.changes || []).slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));
  function createMerchant(values) {
    return Object.assign({id: uid(), name: '', address: '', mid: '', timezone: 'America/New_York', baselineDate: new Date().toISOString().slice(0, 10), openingRebateBalance: null, items: [], changes: [], sales: [], finances: [], proposals: []}, values || {});
  }
  function createDB() { return {schemaVersion: 1, merchants: []}; }
  function priceAt(m, itemId, date) {
    const item = (m.items || []).find(i => i.id === itemId);
    if (!item || !num(item.price) || !dateOK(date) || date < m.baselineDate) return null;
    let price = item.price;
    for (const change of sortedChanges(m)) {
      if (change.effectiveDate <= date && own(change.prices, itemId)) price = change.prices[itemId];
    }
    return price;
  }
  function validateDB(db) {
    const errors = [], warnings = [];
    const err = (p, message) => errors.push(p + ': ' + message);
    const warn = (p, message) => warnings.push(p + ': ' + message);
    const textField = (v, p) => { if (typeof v !== 'string' || v.length > 10000) err(p, 'must be text, at most 10,000 characters'); };
    const ids = (rows, p) => {
      const seen = new Set();
      for (const r of rows) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) { err(p, 'each row must be an object'); continue; }
        if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) err(p, 'IDs must be nonempty and unique');
        seen.add(r.id);
      }
    };
    const costs = (rows, p) => {
      if (rows === null) return;
      if (!Array.isArray(rows)) { err(p, 'must be an array, or null for unknown'); return; }
      const names = new Set();
      for (const c of rows) {
        if (!c || typeof c.name !== 'string' || !c.name.trim()) { err(p, 'cost name is required'); continue; }
        if (names.has(c.name.trim().toLowerCase())) err(p, 'duplicate cost category would count the same cost twice');
        names.add(c.name.trim().toLowerCase());
        if (!nullable(c.baseline) || !nullable(c.actual) || c.baseline < 0 || c.actual < 0) err(p, 'cost amounts must be nonnegative numbers or null');
      }
    };
    if (!db || db.schemaVersion !== 1 || !Array.isArray(db.merchants)) return {valid: false, errors: ['Expected Smart Track schemaVersion 1 with a merchants array.'], warnings};
    ids(db.merchants, 'merchants');
    if (db.merchants.length > 1000) err('merchants', 'too many profiles for this local preview');
    for (const m of db.merchants) {
      if (!m || typeof m !== 'object') continue;
      const p = 'Merchant ' + (m.name || m.id || '?');
      ['name', 'address', 'mid', 'timezone'].forEach(k => textField(m[k], p + '.' + k));
      try { new Intl.DateTimeFormat('en-US', {timeZone: m.timezone}).format(); } catch (_) { err(p, 'timezone must be a valid IANA timezone'); }
      if (!dateOK(m.baselineDate)) err(p, 'valid baselineDate required');
      if (!nullable(m.openingRebateBalance)) err(p, 'openingRebateBalance must be a number or null');
      let arraysOK = true;
      for (const k of ['items', 'changes', 'sales', 'finances', 'proposals']) {
        if (!Array.isArray(m[k])) { err(p + '.' + k, 'must be an array'); arraysOK = false; }
        else { ids(m[k], p + '.' + k); if (m[k].length > 100000) err(p + '.' + k, 'too many rows'); }
      }
      if (!arraysOK) continue;
      const itemIds = new Set();
      for (const i of m.items) {
        if (!i || typeof i !== 'object') continue;
        itemIds.add(i.id); textField(i.name, p + '.item name');
        if (!num(i.price) || i.price < 0) err(p, 'baseline item prices must be nonnegative numbers');
      }
      const validatePrices = (prices, path) => {
        if (!prices || typeof prices !== 'object' || Array.isArray(prices) || !Object.keys(prices).length) { err(path, 'at least one absolute item price required'); return; }
        for (const [id, price] of Object.entries(prices)) if (!itemIds.has(id) || !num(price) || price < 0) err(path, 'unknown item or invalid nonnegative absolute price: ' + id);
      };
      const changeDays = new Set();
      for (const c of m.changes) {
        if (!c || typeof c !== 'object') continue;
        if (!dateOK(c.effectiveDate) || c.effectiveDate < m.baselineDate) err(p, 'change date must be on or after original baseline');
        validatePrices(c.prices, p + '.change');
        for (const id of Object.keys(c.prices || {})) {
          const key = c.effectiveDate + '|' + id;
          if (changeDays.has(key)) err(p, 'conflicting item prices on the same effective date');
          changeDays.add(key);
        }
      }
      for (const s of m.sales) {
        if (!s || typeof s !== 'object') continue;
        if (!dateOK(s.date) || s.date < m.baselineDate) err(p, 'sales date must be on or after baseline');
        if (s.priceDate !== null && s.priceDate !== undefined && (!dateOK(s.priceDate) || s.priceDate < m.baselineDate || s.priceDate > s.date)) err(p, 'priceDate must be original sale date between baseline and transaction date');
        if (!itemIds.has(s.itemId)) err(p, 'sales line references unknown item ' + s.itemId);
        if (!num(s.quantity) || s.quantity === 0 || !num(s.unitPrice) || s.unitPrice < 0) err(p, 'nonzero signed quantity and nonnegative unitPrice required');
        if (!num(s.discountPct) || s.discountPct < 0 || s.discountPct > 100 || !num(s.discountAmount)) err(p, 'discountPct must be 0–100 and discountAmount a signed number');
        if (num(s.quantity) && num(s.discountAmount) && s.quantity * s.discountAmount < 0) err(p, 'refund discountAmount must reverse the original discount with the same sign as quantity');
        if (num(s.quantity) && num(s.unitPrice) && num(s.discountPct) && num(s.discountAmount) && Math.abs(s.discountAmount) > Math.abs(s.quantity * s.unitPrice * (1 - s.discountPct / 100)) + 1e-8) err(p, 'flat discount cannot exceed the remaining line value');
        if (!['cash', 'card', 'unknown'].includes(s.tender)) err(p, 'tender must be cash, card, or unknown');
        if (s.quantity < 0 && !s.priceDate) warn(p, 'refund ' + s.id + ' lacks original sale date; version attribution unavailable');
      }
      const finances = m.finances.filter(Boolean).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
      for (let n = 0; n < finances.length; n++) {
        const f = finances[n];
        if (!dateOK(f.start) || !dateOK(f.end) || f.end < f.start || f.start < m.baselineDate) err(p, 'finance period dates must be valid and on or after baseline');
        if (n && f.start <= finances[n - 1].end) err(p, 'finance periods must not overlap; costs and rebates would be counted twice');
        for (const k of ['feeActual', 'feeBaseline', 'rebateEarned', 'rebateBaseline', 'rebatePaid', 'cardSettled']) if (!nullable(f[k])) err(p + '.' + k, 'must be a number or null');
        if (typeof f.baselineLabel !== 'string' || !f.baselineLabel.trim()) warn(p, 'finance comparison basis is missing; contribution will be unavailable');
        costs(f.costs, p + '.finances.costs');
      }
      for (const q of m.proposals) {
        if (!q || typeof q !== 'object') continue;
        if (!dateOK(q.startDate) || q.startDate <= m.baselineDate || !dateOK(q.historyStart) || !dateOK(q.historyEnd) || q.historyEnd < q.historyStart || q.historyStart < m.baselineDate || q.historyEnd >= q.startDate) err(p, 'proposal needs a future start after its historical basket and original baseline');
        if (!Number.isInteger(q.months) || q.months < 1 || q.months > 120) err(p, 'projection months must be 1–120');
        if (!num(q.declinePct) || q.declinePct < 0 || q.declinePct > 100) err(p, 'volume decline must be 0–100%');
        for (const k of ['feePct', 'rebatePct', 'baselineRebatePct']) if (!nullable(q[k]) || q[k] < 0 || q[k] > 100) err(p + '.' + k, 'must be 0–100 or null');
        if (!nullable(q.goalAmount) || q.goalAmount < 0) err(p, 'goalAmount must be nonnegative or null');
        costs(q.costs, p + '.proposal.costs');
        if (!Array.isArray(q.allocations) || q.allocations.some(a => !a || typeof a.name !== 'string' || !num(a.amount) || a.amount < 0)) err(p, 'allocations need names and nonnegative amounts');
        if (!Array.isArray(q.changes)) { err(p, 'proposal changes must be an array'); continue; }
        const seen = new Set(), stepIds = new Set();
        for (const c of q.changes) {
          if (!c || !dateOK(c.date) || c.date < q.startDate) { err(p, 'proposed changes must be on or after startDate'); continue; }
          if (c.id !== undefined && (typeof c.id !== 'string' || !c.id || stepIds.has(c.id))) err(p, 'explicit proposal change IDs must be nonempty and unique');
          if (c.id !== undefined) stepIds.add(c.id);
          validatePrices(c.prices, p + '.proposal.change');
          for (const id of Object.keys(c.prices || {})) {
            const key = c.date + '|' + id;
            const applied = m.changes.find(a => a && a.effectiveDate === c.date && a.prices && own(a.prices, id));
            const sameRecordedProposal = applied && applied.proposalId === q.id && applied.prices[id] === c.prices[id];
            if (seen.has(key) || (changeDays.has(key) && !sameRecordedProposal)) err(p, 'proposal conflicts with another price on the same effective date');
            seen.add(key);
          }
        }
      }
    }
    return {valid: errors.length === 0, errors, warnings};
  }
  function costDelta(costs) { return Array.isArray(costs) && costs.every(c => num(c.actual) && num(c.baseline)) ? sum(costs.map(c => c.actual - c.baseline)) : null; }
  function financeCoverage(finances, from, to) {
    const overlap = finances.filter(f => f.start <= to && f.end >= from).slice().sort((a, b) => a.start.localeCompare(b.start));
    const partial = overlap.some(f => f.start < from || f.end > to);
    const overlapping = overlap.some((f, i) => i > 0 && f.start <= overlap[i - 1].end);
    const included = overlap.filter(f => f.start >= from && f.end <= to);
    const coveredDays = sum(included.map(f => days(f.start, f.end)));
    const requestedDays = days(from, to);
    return {complete: !partial && !overlapping && coveredDays === requestedDays, partial, overlapping, coveredDays, requestedDays, periods: included};
  }
  function report(m, from, to) {
    if (!dateOK(from) || !dateOK(to) || from > to) throw new Error('Choose a valid reporting date range.');
    const issues = [], rows = m.sales.filter(s => s.date >= from && s.date <= to), changes = sortedChanges(m);
    const versionEffects = changes.filter(c => c.effectiveDate <= to).map(c => ({id: c.id, label: c.label || 'Price change', effectiveDate: c.effectiveDate, amount: 0}));
    const versionMap = new Map(versionEffects.map(v => [v.id, v]));
    const totals = {receipts: 0, cashReceipts: 0, cardReceipts: 0, unknownTenderReceipts: 0, baselineReceipts: 0, priceEffect: 0, promotionEffect: 0, combinedEffect: 0, priceUpliftAfterSamePromotion: 0, quantity: 0, unattributedPriceEffect: 0, unexplainedPriceEffect: 0};
    for (const s of rows) {
      const item = m.items.find(i => i.id === s.itemId);
      if (!item) { issues.push('Unknown item in sale ' + s.id); continue; }
      const gross = s.quantity * s.unitPrice, net = gross * (1 - s.discountPct / 100) - s.discountAmount;
      const effect = s.quantity * (s.unitPrice - item.price);
      totals.receipts += net; totals.quantity += s.quantity; totals.baselineReceipts += s.quantity * item.price;
      totals.priceEffect += effect; totals.promotionEffect += net - gross;
      totals.priceUpliftAfterSamePromotion += effect * (1 - s.discountPct / 100);
      totals[s.tender === 'cash' ? 'cashReceipts' : s.tender === 'card' ? 'cardReceipts' : 'unknownTenderReceipts'] += net;
      if (s.quantity < 0 && !s.priceDate) { totals.unattributedPriceEffect += effect; issues.push('Refund ' + s.id + ' has no original sale date; its price effect is not assigned to a version.'); continue; }
      const effective = s.priceDate || s.date;
      let last = item.price;
      for (const c of changes) {
        if (c.effectiveDate <= effective && own(c.prices, item.id)) {
          const delta = s.quantity * (c.prices[item.id] - last);
          if (versionMap.has(c.id)) versionMap.get(c.id).amount += delta;
          last = c.prices[item.id];
        }
      }
      totals.unexplainedPriceEffect += s.quantity * (s.unitPrice - last);
    }
    totals.combinedEffect = totals.priceEffect + totals.promotionEffect;
    if (!rows.length) { Object.keys(totals).forEach(k => { totals[k] = null; }); issues.push('No sales rows recorded for this range. Missing sales are not zero sales.'); }
    if (rows.some(s => s.tender === 'unknown')) issues.push('Some sales have unknown tender; cash/card totals contain only linked sales.');
    if (num(totals.unexplainedPriceEffect) && Math.abs(totals.unexplainedPriceEffect) > 0.005) issues.push('Entered line prices differ from recorded price history; unexplained effects are shown separately.');
    const coverage = financeCoverage(m.finances, from, to), fs = coverage.periods;
    if (!coverage.complete) issues.push(coverage.partial ? 'Finance period overlaps this range only partly. No daily proration of fees, costs, or rebates was assumed.' : 'Finance records do not completely cover this range; contribution is unavailable.');
    const baselineKnown = coverage.complete && fs.every(f => typeof f.baselineLabel === 'string' && f.baselineLabel.trim());
    if (coverage.complete && !baselineKnown) issues.push('Enter the same-period comparison basis for baseline fees, rebates, and costs.');
    for (const k of ['feeActual', 'feeBaseline', 'rebateEarned', 'rebateBaseline', 'rebatePaid', 'cardSettled']) totals[k] = coverage.complete ? completeSum(fs.map(f => f[k])) : null;
    if (!baselineKnown) { totals.feeBaseline = null; totals.rebateBaseline = null; }
    totals.feeSavings = subtract(totals.feeBaseline, totals.feeActual);
    totals.rebateIncrement = subtract(totals.rebateEarned, totals.rebateBaseline);
    totals.costIncrease = baselineKnown ? completeSum(fs.map(f => costDelta(f.costs))) : null;
    totals.cardProceeds = rows.length && !rows.some(s => s.tender === 'unknown') ? subtract(totals.cardReceipts, totals.feeActual) : null;
    const parts = [totals.combinedEffect, totals.feeSavings, totals.rebateIncrement, totals.costIncrease];
    totals.incrementalContribution = parts.every(num) ? parts[0] + parts[1] + parts[2] - parts[3] : null;
    totals.additionalContribution = totals.incrementalContribution;
    totals.costRecovery = num(totals.combinedEffect) && num(totals.costIncrease) ? Math.min(Math.max(0, totals.combinedEffect), Math.max(0, totals.costIncrease)) : null;
    const lifetimeCoverage = from >= m.baselineDate ? financeCoverage(m.finances, m.baselineDate, to) : {complete: false, periods: []};
    const earned = completeSum(lifetimeCoverage.periods.map(f => f.rebateEarned)), paid = completeSum(lifetimeCoverage.periods.map(f => f.rebatePaid));
    totals.rebateOutstanding = lifetimeCoverage.complete && num(m.openingRebateBalance) && num(earned) && num(paid) ? m.openingRebateBalance + earned - paid : null;
    if (totals.rebateOutstanding === null) issues.push('Rebate balance needs opening balance plus continuous earned and paid records through this date.');
    if (totals.incrementalContribution === null) issues.push('Contribution requires comparable processing fees, rebates, and incremental operating costs; enter explicit zero where confirmed.');
    if (rows.length) issues.push('Same-basket repricing is a comparison using recorded quantities. It does not establish that pricing caused demand growth.');
    const assumptions = [
      'priceEffect is quantity × (entered unit price − original baseline list price), before promotions.',
      'promotionEffect records actual percentage and flat discounts, including signed refund reversals. combinedEffect compares actual receipts with the original undiscounted basket; it is not a comparison with prior realized receipts.',
      'priceUpliftAfterSamePromotion compares original and current prices with the same percentage promotion. The same flat promotion cancels in this comparison.',
      'Version effects telescope from the original baseline. Unexplained entered prices and refunds without an original sale date remain separate.',
      'Contribution compares the original undiscounted basket with recorded receipts and same-period baseline costs, fees, and rebates. It is before unentered expenses and taxes, not reconciled cash available to withdraw.'
    ];
    return {from, to, lineCount: rows.length, totals, versionEffects, financeCoverage: Object.assign({}, coverage, {periods: fs.map(f => f.id)}), issues: [...new Set(issues)], assumptions, reconciliation: 'needs reconciliation'};
  }
  function proposalProblems(m, p) {
    const scratch = createDB(); scratch.merchants = [Object.assign({}, m, {proposals: [p]})];
    return validateDB(scratch).errors;
  }
  function projection(m, p) {
    const issues = proposalProblems(m, p), assumptions = [
      'Historical signed item quantities and transaction discounts are normalized to a 30.4375-day month.',
      'Baseline prices are recorded prices immediately before the proposal start. Future dated prices are absolute replacements, prorated daily within each projection month.',
      'No organic growth, investment return, interest, automatic repricing, or guaranteed payout is assumed.',
      'Volume decline applies to all items and tenders; historical tender mix and promotion behavior stay unchanged.',
      'Operating costs are entered monthly comparison amounts, subtracted once per month. Earned rebates are not paid cash.'
    ];
    const failure = () => ({valid: false, monthly: [], totals: {}, averageMonthly: {}, allocation: {planned: 0, capacity: null, valid: false}, assumptions, issues});
    if (issues.length) return failure();
    const basket = m.sales.filter(s => s.date >= p.historyStart && s.date <= p.historyEnd);
    if (!basket.length || sum(basket.map(s => s.quantity)) <= 0) { issues.push('Choose a historical basket with positive net item quantities.'); return failure(); }
    const qByItem = new Map(); basket.forEach(s => qByItem.set(s.itemId, (qByItem.get(s.itemId) || 0) + s.quantity));
    if ([...qByItem.values()].some(q => q < 0)) { issues.push('This basket contains an item with more refunds than sales. Choose a reconciled representative period.'); return failure(); }
    const ratio = MONTH_DAYS / days(p.historyStart, p.historyEnd), factor = 1 - p.declinePct / 100;
    const baseDate = previousDay(p.startDate), basePrices = Object.fromEntries(m.items.map(i => [i.id, priceAt(m, i.id, baseDate)]));
    if (Object.values(basePrices).some(v => !num(v))) { issues.push('Baseline prices are unavailable immediately before the proposal.'); return failure(); }
    const proposedTimeline = p.changes.map((c, i) => {
      const prices = Object.fromEntries(Object.entries(c.prices).filter(([id, price]) => !m.changes.some(a => a.proposalId === p.id && a.effectiveDate === c.date && a.prices && a.prices[id] === price)));
      return {id: 'proposed:' + i, label: c.label || 'Proposed change ' + (i + 1), date: c.date, prices};
    }).filter(c => Object.keys(c.prices).length);
    const timeline = sortedChanges(m).filter(c => c.effectiveDate >= p.startDate).map(c => ({id: 'recorded:' + c.id, label: c.label || 'Recorded future change', date: c.effectiveDate, prices: c.prices})).concat(proposedTimeline).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const end = previousDay(addMonths(p.startDate, p.months));
    if (timeline.some(c => c.date > end)) issues.push('A future price change falls outside the selected projection horizon.');
    const unknownTender = basket.some(s => s.tender === 'unknown'), costIncrease = costDelta(p.costs);
    if (unknownTender) issues.push('Historical tender is incomplete; processing, rebate, and contribution estimates are unavailable.');
    if (!num(p.feePct) || !num(p.rebatePct) || !num(p.baselineRebatePct) || costIncrease === null) issues.push('Enter processing, rebate assumptions and operating costs, including explicit zero where confirmed, to estimate contribution.');
    const monthly = [];
    for (let month = 0; month < p.months; month++) {
      const start = addMonths(p.startDate, month), stop = previousDay(addMonths(p.startDate, month + 1)), monthDays = days(start, stop);
      const r = {month: month + 1, start, end: stop, receipts: 0, baselineReceipts: 0, cashReceipts: 0, cardReceipts: 0, unknownTenderReceipts: 0, priceEffect: 0, volumeEffect: 0, baselineCardReceipts: 0, baselineCashReceipts: 0};
      const effects = new Map(timeline.filter(c => c.date <= stop).map(c => [c.id, {id: c.id, label: c.label, effectiveDate: c.date, amount: 0}]));
      for (let t = dateMs(start); t <= dateMs(stop); t += DAY) {
        const date = iso(t), weight = ratio / monthDays;
        for (const sale of basket) {
          const base = basePrices[sale.itemId], promoFactor = 1 - sale.discountPct / 100;
          let current = base;
          for (const c of timeline) if (c.date <= date && own(c.prices, sale.itemId)) {
            effects.get(c.id).amount += sale.quantity * (c.prices[sale.itemId] - current) * promoFactor * factor * weight;
            current = c.prices[sale.itemId];
          }
          if (Math.abs(sale.discountAmount) > Math.abs(sale.quantity * Math.min(base, current) * promoFactor) + 1e-8) {
            issues.push('Historical flat promotion on item ' + sale.itemId + ' exceeds a projected or baseline line value. Revise the price or choose a different historical basket; no discount cap was assumed.');
            return failure();
          }
          const baseline = (sale.quantity * base * promoFactor - sale.discountAmount) * weight;
          const projected = (sale.quantity * current * promoFactor - sale.discountAmount) * factor * weight;
          r.receipts += projected; r.baselineReceipts += baseline;
          r.priceEffect += sale.quantity * (current - base) * promoFactor * factor * weight;
          r.volumeEffect += baseline * (factor - 1);
          r[sale.tender === 'card' ? 'cardReceipts' : sale.tender === 'cash' ? 'cashReceipts' : 'unknownTenderReceipts'] += projected;
          if (sale.tender === 'card') r.baselineCardReceipts += baseline;
          if (sale.tender === 'cash') r.baselineCashReceipts += baseline;
        }
      }
      r.receiptEffect = r.receipts - r.baselineReceipts;
      r.feeActual = !unknownTender && num(p.feePct) ? r.cardReceipts * p.feePct / 100 : null;
      r.feeBaseline = !unknownTender && num(p.feePct) ? r.baselineCardReceipts * p.feePct / 100 : null;
      r.feeIncrement = subtract(r.feeActual, r.feeBaseline);
      r.rebateEarned = !unknownTender && num(p.rebatePct) ? r.cardReceipts * p.rebatePct / 100 : null;
      r.rebateBaseline = !unknownTender && num(p.baselineRebatePct) ? r.baselineCardReceipts * p.baselineRebatePct / 100 : null;
      r.rebateIncrement = subtract(r.rebateEarned, r.rebateBaseline);
      r.rebatePaid = null; r.cardSettled = null;
      r.cardProceeds = subtract(r.cardReceipts, r.feeActual);
      r.costIncrease = costIncrease;
      r.contribution = [r.feeIncrement, r.rebateIncrement, r.costIncrease].every(num) ? r.receiptEffect - r.feeIncrement + r.rebateIncrement - r.costIncrease : null;
      r.additionalContribution = r.contribution;
      r.costRecovery = num(costIncrease) ? Math.min(Math.max(0, r.receiptEffect), Math.max(0, costIncrease)) : null;
      r.versionEffects = [...effects.values()];
      monthly.push(r);
    }
    const totals = {}, averageMonthly = {};
    for (const k of Object.keys(monthly[0]).filter(k => !['month', 'start', 'end', 'versionEffects'].includes(k))) {
      totals[k] = completeSum(monthly.map(r => r[k])); averageMonthly[k] = num(totals[k]) ? totals[k] / monthly.length : null;
    }
    const planned = sum(p.allocations.map(a => a.amount)), capacity = monthly.every(r => num(r.contribution)) ? Math.max(0, Math.min(...monthly.map(r => r.contribution))) : null;
    const allocation = {planned, capacity, valid: num(capacity) && planned <= capacity + 0.005, unallocated: num(capacity) ? capacity - planned : null, basis: 'Minimum projected monthly contribution across this horizon; a funding plan, not withdrawable cash.'};
    if (!allocation.valid && planned > 0) issues.push(capacity === null ? 'Funding allocation cannot be validated until contribution is known.' : 'Planned monthly allocations exceed projected monthly contribution.');
    return {valid: true, monthly, totals, averageMonthly, allocation, assumptions, issues, normalizationDays: MONTH_DAYS, historicalDays: days(p.historyStart, p.historyEnd), historicalLineCount: basket.length, baselinePrices: basePrices, timeline};
  }
  function solveGoal(m, p, itemIds) {
    const selected = itemIds && itemIds.length ? itemIds : m.items.map(i => i.id);
    const issues = [];
    if (!num(p.goalAmount) || p.goalAmount < 0) return {valid: false, percent: null, prices: {}, projection: null, issues: ['Enter a nonnegative monthly contribution goal.']};
    const invalid = proposalProblems(m, p);
    if (invalid.length) return {valid: false, percent: null, prices: {}, projection: null, issues: invalid};
    if (selected.some(id => !m.items.some(i => i.id === id))) return {valid: false, percent: null, prices: {}, projection: null, issues: ['Choose existing items for the goal calculation.']};
    const base = Object.fromEntries(selected.map(id => [id, priceAt(m, id, previousDay(p.startDate))]));
    const run = pct => {
      const prices = Object.fromEntries(Object.entries(base).map(([id, value]) => [id, value * (1 + pct / 100)]));
      const proposal = Object.assign({}, p, {changes: [{date: p.startDate, prices}], allocations: []});
      return {prices, result: projection(m, proposal)};
    };
    let low = 0, high = 100, initial = run(0);
    if (!initial.result.valid || !num(initial.result.averageMonthly.contribution)) return {valid: false, percent: null, prices: {}, projection: initial.result, issues: initial.result.issues.concat('Goal solving requires complete projection inputs.')};
    let solved = initial;
    if (initial.result.averageMonthly.contribution < p.goalAmount) {
      let upper = run(high);
      while (upper.result.valid && upper.result.averageMonthly.contribution < p.goalAmount && high < 10000) { high = Math.min(10000, high * 2); upper = run(high); }
      if (!upper.result.valid || !num(upper.result.averageMonthly.contribution) || upper.result.averageMonthly.contribution < p.goalAmount || upper.result.averageMonthly.contribution <= initial.result.averageMonthly.contribution) return {valid: false, percent: null, prices: {}, projection: upper.result, issues: ['Goal is not attainable under these quantities, costs, decline, and selected items within the solver limit.']};
      for (let i = 0; i < 48; i++) {
        const mid = (low + high) / 2, attempt = run(mid);
        if (attempt.result.averageMonthly.contribution < p.goalAmount) low = mid; else high = mid;
      }
      solved = run(high);
    } else high = 0;
    const rounded = Object.fromEntries(Object.entries(solved.prices).map(([id, price]) => [id, Math.ceil((price - 1e-10) * 100) / 100]));
    const finalProposal = Object.assign({}, p, {changes: [{date: p.startDate, prices: rounded}]});
    issues.push('Goal solver replaces this proposal schedule with one uniform increase at its start, then rounds item prices up to cents. This is a scenario, not a POS update.');
    return {valid: true, percent: high, prices: rounded, projection: projection(m, finalProposal), issues};
  }
  function compareActual(m, p, from, to) {
    const issues = [], basis = 'Actual and planned prices are compared with recorded prices immediately before the proposal start, using the same actual quantities and percentage promotions. Saved proposal steps define the plan.';
    const limitations = [
      'Comparison covers complete projection months only. Entered sales are not proof that the POS export is complete or reconciled.',
      'Price execution variance is actual price effect minus planned effect on the actual basket. The remaining basket/promotion/volume variance is descriptive, not evidence that the price change caused demand changes.',
      'Identical signed flat promotions cancel in the same-basket price comparison. Fees, operating costs, rebates, taxes, and settlement are outside this price-only comparison.',
      'Later recorded price changes that were not in the saved proposal do not rewrite this comparison plan. Refunds use their original sale date; returns of pre-plan sales use the original recorded price history.'
    ];
    const result = {valid: false, from, to, actualPriceEffect: null, plannedOnActualBasket: null, projectedPriceEffect: null, priceExecutionVariance: null, basketPromotionVolumeVariance: null, totalVariance: null, months: [], lineCount: 0, issues, basis, limitations};
    if (!dateOK(from) || !dateOK(to) || from > to || !dateOK(p.startDate)) { issues.push('Choose valid dates and a valid proposal start.'); return result; }
    const planMerchant = Object.assign({}, m, {changes: m.changes.filter(c => c.effectiveDate < p.startDate), proposals: []});
    const projected = projection(planMerchant, p);
    if (!projected.valid) { issues.push(...projected.issues); return result; }
    const months = projected.monthly.filter(r => r.start >= from && r.end <= to);
    result.months = months.map(r => ({start: r.start, end: r.end}));
    if (!months.length || months[0].start !== from || months[months.length - 1].end !== to || sum(months.map(r => days(r.start, r.end))) !== days(from, to)) {
      issues.push('Choose one or more complete proposal months within its projection horizon to compare actuals. No partial-month forecast allocation was assumed.'); return result;
    }
    const rows = m.sales.filter(s => s.date >= from && s.date <= to); result.lineCount = rows.length;
    if (months.some(month => !rows.some(s => s.date >= month.start && s.date <= month.end))) {
      issues.push('At least one comparison month has no recorded sales. Missing actual sales are unavailable, not zero.'); return result;
    }
    if (rows.some(s => s.quantity < 0 && !s.priceDate)) { issues.push('A refund lacks its original sale date; actual-versus-plan attribution is unavailable until it is matched.'); return result; }
    let actual = 0, planned = 0;
    const steps = p.changes.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const s of rows) {
      const originalDate = s.priceDate || s.date, base = projected.baselinePrices[s.itemId];
      let expected = originalDate < p.startDate ? priceAt(planMerchant, s.itemId, originalDate) : base;
      if (originalDate >= p.startDate) for (const step of steps) if (step.date <= originalDate && own(step.prices, s.itemId)) expected = step.prices[s.itemId];
      if (!num(base) || !num(expected)) { issues.push('A comparison baseline or original refund price is unavailable.'); return result; }
      actual += s.quantity * (s.unitPrice - base) * (1 - s.discountPct / 100);
      planned += s.quantity * (expected - base) * (1 - s.discountPct / 100);
    }
    result.valid = true;
    result.actualPriceEffect = actual; result.plannedOnActualBasket = planned;
    result.projectedPriceEffect = sum(months.map(r => r.priceEffect));
    result.priceExecutionVariance = actual - planned;
    result.basketPromotionVolumeVariance = planned - result.projectedPriceEffect;
    result.totalVariance = actual - result.projectedPriceEffect;
    if (rows.some(s => s.quantity < 0 && s.priceDate < p.startDate)) issues.push('This comparison includes refunds of sales from before the proposal; these returns affect the recorded period.');
    return result;
  }
  function parseCSV(text) {
    const errors = [], cells = []; let row = [], value = '', quoted = false, closedQuote = false;
    if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) return {rows: [], errors: ['CSV must be text smaller than 10 MB.']};
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (!quoted && value.length) { errors.push('Unexpected quote in CSV.'); break; }
        else if (closedQuote) { errors.push('Unexpected quote after a closed CSV field.'); break; }
        else { quoted = !quoted; if (!quoted) closedQuote = true; }
      } else if (c === ',' && !quoted) { row.push(value); value = ''; closedQuote = false; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value); cells.push(row); row = []; value = ''; closedQuote = false;
      } else if (closedQuote && !quoted) {
        if (c !== ' ' && c !== '\t') { errors.push('Unexpected text after a quoted CSV field.'); break; }
      } else value += c;
    }
    if (quoted) errors.push('Unclosed quoted field in CSV.');
    if (value.length || row.length) { row.push(value); cells.push(row); }
    const nonempty = cells.filter(r => r.some(v => v.trim()));
    if (!nonempty.length) return {rows: [], errors: ['CSV is empty.']};
    const header = nonempty.shift().map(v => v.trim());
    for (const key of ['id', 'date', 'itemId', 'quantity', 'unitPrice', 'tender']) if (!header.includes(key)) errors.push('Missing column: ' + key);
    if (new Set(header).size !== header.length) errors.push('Duplicate CSV column names.');
    const allowed = ['id', 'date', 'priceDate', 'itemId', 'quantity', 'unitPrice', 'discountPct', 'discountAmount', 'tender'];
    for (const key of header) if (!allowed.includes(key)) errors.push('Unsupported column: ' + key + '. Use the neutral sales template.');
    const seen = new Set(), rows = [];
    nonempty.forEach((r, index) => {
      const line = index + 2;
      if (r.length !== header.length) { errors.push('Row ' + line + ': column count does not match header.'); return; }
      const raw = Object.fromEntries(header.map((h, i) => [h, r[i].trim()]));
      const numeric = (key, fallback) => {
        const v = raw[key];
        if (v === undefined || v === '') return fallback;
        return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) ? Number(v) : NaN;
      };
      const record = {id: raw.id || '', date: raw.date, priceDate: raw.priceDate || null, itemId: raw.itemId, quantity: numeric('quantity', NaN), unitPrice: numeric('unitPrice', NaN), discountPct: numeric('discountPct', 0), discountAmount: numeric('discountAmount', 0), tender: raw.tender};
      if (!record.id) errors.push('Row ' + line + ': a stable nonblank sale-line ID is required to prevent repeated imports.');
      if (seen.has(record.id)) errors.push('Row ' + line + ': duplicate sale ID.');
      seen.add(record.id);
      if (!dateOK(record.date) || (record.priceDate && (!dateOK(record.priceDate) || record.priceDate > record.date))) errors.push('Row ' + line + ': invalid date or original sale date.');
      if (!record.itemId || !num(record.quantity) || !record.quantity || !num(record.unitPrice) || record.unitPrice < 0 || !num(record.discountPct) || record.discountPct < 0 || record.discountPct > 100 || !num(record.discountAmount)) errors.push('Row ' + line + ': invalid item, quantity, price, or discount.');
      if (!['cash', 'card', 'unknown'].includes(record.tender)) errors.push('Row ' + line + ': tender must be cash, card, or unknown.');
      if (record.quantity * record.discountAmount < 0 || Math.abs(record.discountAmount) > Math.abs(record.quantity * record.unitPrice * (1 - record.discountPct / 100)) + 1e-8) errors.push('Row ' + line + ': flat discount sign or amount is invalid.');
      rows.push(record);
    });
    return {rows: errors.length ? [] : rows, errors};
  }
  function salesCSVTemplate() { return 'id,date,priceDate,itemId,quantity,unitPrice,discountPct,discountAmount,tender\n'; }
  function serializeDB(db) {
    const validation = validateDB(db);
    if (!validation.valid) throw new Error(validation.errors.join('\n'));
    return JSON.stringify(db, null, 2);
  }
  function parseDB(text) {
    if (typeof text !== 'string' || text.length > 25 * 1024 * 1024) throw new Error('Backup must be JSON text smaller than 25 MB.');
    const db = JSON.parse(text, (key, value) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe property in backup.');
      return value;
    });
    const validation = validateDB(db);
    if (!validation.valid) throw new Error(validation.errors.join('\n'));
    return db;
  }
  function demoDB() {
    const m = createMerchant({id: 'fictional-demo', name: 'Fictional Demo Café', address: '123 Example Street, Demo City, FL 00000', mid: 'DEMO ONLY', baselineDate: '2026-01-01', openingRebateBalance: 0});
    m.items = [{id: 'coffee', name: 'Coffee', price: 5}, {id: 'lunch', name: 'Lunch', price: 10}];
    m.changes = [{id: 'jan-change', label: 'January price increase', effectiveDate: '2026-01-15', prices: {coffee: 5.5, lunch: 11}}, {id: 'feb-change', label: 'Lunch price reduction', effectiveDate: '2026-02-10', prices: {lunch: 10.5}}];
    for (let t = dateMs('2026-01-01'); t <= dateMs('2026-02-28'); t += DAY) {
      const date = iso(t);
      for (const item of m.items) for (const tender of ['cash', 'card']) {
        m.sales.push({id: date + '-' + item.id + '-' + tender, date, priceDate: null, itemId: item.id, quantity: tender === 'card' ? 30 : 10, unitPrice: priceAt(m, item.id, date), discountPct: item.id === 'coffee' && date.endsWith('20') ? 10 : 0, discountAmount: 0, tender});
      }
    }
    m.sales.push({id: 'demo-refund', date: '2026-02-12', priceDate: '2026-02-08', itemId: 'lunch', quantity: -2, unitPrice: 11, discountPct: 0, discountAmount: 0, tender: 'card'});
    for (const [start, end, id] of [['2026-01-01', '2026-01-31', 'jan'], ['2026-02-01', '2026-02-28', 'feb']]) {
      const rows = m.sales.filter(s => s.date >= start && s.date <= end && s.tender === 'card');
      const actual = sum(rows.map(s => s.quantity * s.unitPrice * (1 - s.discountPct / 100) - s.discountAmount));
      const baseline = sum(rows.map(s => s.quantity * m.items.find(i => i.id === s.itemId).price));
      m.finances.push({id, start, end, baselineLabel: 'Fictional same-period baseline basket, same 3% processing; explicit monthly operating comparison', feeActual: actual * .03, feeBaseline: baseline * .03, rebateEarned: actual * .002, rebateBaseline: 0, rebatePaid: id === 'feb' ? 30 : 0, cardSettled: actual * .97, costs: [{name: 'Food', baseline: 4000, actual: 4300}, {name: 'Labor', baseline: 5000, actual: 5100}]});
    }
    m.proposals = [{id: 'demo-proposal', name: 'Fictional equipment goal', startDate: '2026-03-01', historyStart: '2026-02-01', historyEnd: '2026-02-28', months: 12, declinePct: 0, feePct: 3, baselineRebatePct: .2, rebatePct: .2, costs: [{name: 'Food', baseline: 4300, actual: 4400}], goalAmount: 500, purpose: 'Equipment', allocations: [{name: 'Equipment', amount: 300}], changes: [{date: '2026-03-01', prices: {coffee: 6, lunch: 11}}, {date: '2026-09-01', prices: {coffee: 6.25}}]}];
    return {schemaVersion: 1, merchants: [m]};
  }
  return {createDB, createMerchant, validateDB, priceAt, report, projection, solveGoal, compareActual, parseCSV, salesCSVTemplate, serializeDB, parseDB, demoDB, MONTH_DAYS};
});
