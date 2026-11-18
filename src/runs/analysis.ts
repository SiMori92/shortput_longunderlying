import { snapshotBasis } from "../portfolio/basis";
import type { Rules } from "../schemas/config";
import type { PortfolioEntry } from "../schemas/portfolio";
import { RunResultSchema, type RunResult } from "../schemas/run";
import type { DataIssue } from "../schemas/market";
import { coreRebalance, coreTarget, evaluateGate, gateState, initialState, modelPutValue, prepareGates, putDelta, putSizing, roundContracts, roundTargetShares, skewedIv, stepDay, type Feature, type History, type Position, weekId } from "../engine";
import { futureExpiries } from "../market/calendar";
import { dataIssue } from "../market/validation";
type Base = Pick<RunResult, "type" | "timestamp" | "asOf">;
export function analyzeRun(base: Base, features: readonly Feature[], rules: Rules, history: History, snapshots: readonly PortfolioEntry[], issues: readonly DataIssue[], symbols: RunResult["freshness"]["symbols"]): RunResult {
  const problems = [...issues];
  if (features.filter(f => f.date <= base.asOf).length < rules.smaSlow) problems.push(dataIssue("history", "SOXX", "Insufficient post-feature-drop gate SMA history"));
  const row = features.find(f => f.date === base.asOf), marketBlocked = problems.some(i => i.blocking) || !row;
  if (!row) problems.push(dataIssue("history", "SOXL", "No fully warmed-up feature row at run date"));
  const snapshot = snapshots.find(s => s.date === base.asOf);
  if (!snapshot) problems.push(dataIssue("account", null, "Current account snapshot unconfirmed; recommendations blocked"));
  if (snapshot?.openPuts.some(p => p.symbol !== "SOXL")) problems.push(dataIssue("account", null, "Non-SOXL puts in snapshot cannot be valued by this strategy"));
  let gate: RunResult["gate"] = null, core: RunResult["core"] = null, put: RunResult["put"] = null, account: RunResult["account"] = null;
  let openPutActions: RunResult["openPutActions"] = [];
  const rawGate = row ? prepareGates(features, rules)[features.indexOf(row)] ?? evaluateGate(row, rules) : null;
  const working: RunResult["working"] = {};
  const work = (key: string, formula: string, inputs: Record<string, number | string | boolean | null>, result: number | string | boolean | null) => { working[key] = { formula, inputs, result }; };
  work("account.snapshot", "Entered snapshot used for this run; changes require a fresh run", { date: base.asOf }, snapshot ? snapshotBasis(snapshots, base.asOf) : null);
  if (row && rawGate && !marketBlocked) {
    const gates = features.filter(f => f.date <= base.asOf), tail = gates.slice(-rules.smaSlow);
    const slow = tail.reduce((s, f) => s + f.REF, 0) / tail.length;
    const fastTail = gates.slice(-rules.smaFast), fast = fastTail.reduce((s, f) => s + f.REF, 0) / fastTail.length;
    const ratio = row.RV60 > 0 ? row.RV10 / row.RV60 : 0;
    const condition = (value: number, threshold: number, passes: boolean, reverse = false) => {
      const distance = (reverse ? threshold - value : value - threshold) / threshold;
      return { value, threshold, distance, passes, closeCall: base.type === "preview" && Math.abs(distance) <= .01 };
    };
    gate = { a: condition(row.REF, slow, rawGate.a), b: condition(fast, slow, rawGate.b), c: condition(ratio, rules.rvSpike, rawGate.c, true), state: gateState(rawGate, null, rules), gateOn: rawGate.gateOn, multiplier: rawGate.mult, putOk: rawGate.putOk };
    work("gate.a.value", "SOXX raw close", { date: row.date, symbol: "SOXX" }, row.REF);
    work("gate.a.threshold", "mean(last smaSlow SOXX closes after feature warm-up)", { n: rules.smaSlow, sum: tail.reduce((s, f) => s + f.REF, 0) }, slow);
    work("gate.b.value", "mean(last smaFast SOXX closes after feature warm-up)", { n: rules.smaFast, sum: fastTail.reduce((s, f) => s + f.REF, 0) }, fast);
    work("gate.b.threshold", "gate.a.threshold", { SMA200: slow }, slow);
    work("gate.c.value", "RV60 > 0 ? RV10 / RV60 : 0", { RV10: row.RV10, RV60: row.RV60 }, ratio);
    work("gate.c.threshold", "rules.rvSpike", { rvSpike: rules.rvSpike }, rules.rvSpike);
    for (const key of ["a", "b", "c"] as const) work(`gate.${key}.distance`, key === "c" ? "(threshold - value) / threshold" : "(value - threshold) / threshold", { value: gate[key].value, threshold: gate[key].threshold }, gate[key].distance);
    work("gate.multiplier", "a ? 1 : riskCutMultiplier", { a: rawGate.a, riskCutMultiplier: rules.riskCutMultiplier }, rawGate.mult);
    if (snapshot && !problems.some(i => i.code === "account" && i.blocking)) {
      const positions: Position[] = snapshot.openPuts.map(p => ({ K: p.strike, expiry: p.expiry, qty: p.contracts * 100, credit: p.credit, open: p.opened, value: 0 }));
      // Snapshot accountValue is entered NAV: derive cash from NAV and current model liabilities.
      // No historical model holdings or hypothetical replay drawdown are substituted for an account.
      const peak = Math.max(snapshot.accountValue, ...snapshots.filter(s => s.date <= base.asOf).map(s => s.accountValue));
      const drawdown = snapshot.accountValue / peak - 1, kill = drawdown <= rules.killDrawdown;
      const modelState = initialState(snapshot.accountValue);
      modelState.coreQty = snapshot.shares; modelState.peak = peak;
      positions.forEach(p => { p.value = modelPutValue(row, p, rules); });
      modelState.positions = positions;
      modelState.cash = snapshot.accountValue - snapshot.shares * row.S + positions.reduce((s, p) => s + p.value * p.qty, 0);
      // Hold the entered core while evaluating today's put loop. Tomorrow's core
      // recommendation is computed separately at today's price as an estimate.
      modelState.coreTarget = snapshot.shares * row.S / snapshot.accountValue;
      modelState.enteredWeek = snapshots.filter(s => s.date <= base.asOf).some(s => s.openPuts.some(p => weekId(p.opened) === row.week_id)) ? row.week_id : null;
      const expiry = futureExpiries(base.asOf);
      const result = stepDay(modelState, row, kill ? { ...rawGate, gateOn: false, putOk: false } : rawGate, expiry, rules);
      const target = coreTarget(row, rawGate, rules), rebalance = coreRebalance(target, snapshot.accountValue, row.S, snapshot.shares, rules);
      const roundedShares = roundTargetShares(rebalance.targetShares), deltaShares = roundedShares - snapshot.shares;
      core = { price: row.S, rvFast: row.RVfast, previousEquity: snapshot.accountValue, targetWeight: target, modelShares: rebalance.targetShares, roundedShares, bandValue: rebalance.bandValue, timing: "next-close-estimate", trade: rebalance.shouldTrade && (!kill || deltaShares < 0) ? { kind: "core", description: "Next close estimate · recompute at execution price", modelQuantity: rebalance.tradeShares, roundedQuantity: deltaShares, modelPrice: row.S } : null };
      const size = putSizing(snapshot.accountValue, row.S, row.S, snapshot.shares, positions, rules);
      account = { equity: snapshot.accountValue, peak, peakBasis: "entered-snapshots", drawdown, coreWeight: snapshot.shares * row.S / snapshot.accountValue, putNotionalWeight: positions.reduce((s, p) => s + p.K * p.qty, 0) / snapshot.accountValue, gapUsed: size.used, kill };
      gate.state = gateState(rawGate, drawdown, rules);
      openPutActions = result.trades.map(t => ({ kind: t.how === "expiry" ? "expiry" : "buy-back", description: `${t.close} ${t.K} put · model ${t.how}`, modelQuantity: t.notional / t.K, roundedQuantity: roundContracts(t.notional / t.K), modelPrice: t.exit }));
      const entry = result.entry;
      if (entry && !kill) {
        const limits = putSizing(result.day.equity, row.S, entry.K, snapshot.shares, result.state.positions.filter(p => p !== result.state.positions.at(-1)), rules);
        const T = (Date.parse(entry.expiry) - Date.parse(base.asOf)) / 86400000 / 365;
        put = { pricing: "model", strike: entry.K, expiry: entry.expiry, delta: putDelta(row.S, entry.K, T, row.RF, skewedIv(row.IV_ATM, row.S, entry.K, rules.skew)), mid: entry.mid, credit: entry.credit, limits: (["weekly", "total", "gap"] as const).map(name => ({ name, modelQuantity: limits[name], binds: limits.binding.includes(name) })), modelContracts: entry.qty / 100, contracts: roundContracts(entry.qty), eligible: roundContracts(entry.qty) > 0 };
        work("put.strike", "60-step bisection on [0.3 S,S] for -putDelta=targetDelta with skewed IV", { S: row.S, T, r: row.RF, atm: row.IV_ATM, skew: rules.skew, targetDelta: rules.targetDelta }, entry.K);
        work("put.delta", "N(d1)-1 with skewed IV", { S: row.S, K: entry.K, T, r: row.RF, iv: skewedIv(row.IV_ATM, row.S, entry.K, rules.skew) }, put.delta);
        work("put.mid", "Black-Scholes put with skewed IV (model)", { S: row.S, K: entry.K, T, r: row.RF, iv: skewedIv(row.IV_ATM, row.S, entry.K, rules.skew) }, put.mid);
        work("put.credit", "mid*(1-premiumSlippage)-commission/(100*splitFactor)", { mid: entry.mid, premiumSlippage: rules.premiumSlippage, commission: rules.commission, splitFactor: row.unadj / row.S }, put.credit);
        work("put.modelContracts", "min(weekly,total,gap)/100", { weekly: limits.weekly, total: limits.total, gap: limits.gap }, put.modelContracts);
        work("put.contracts", "floor(modelContracts)", { modelContracts: put.modelContracts }, put.contracts);
        const formulas = { weekly: "notionalPerWeek*equity/K", total: "max(0,maxPutNotional*equity-openNotional)/K", gap: "unit>0?max(0,(gapBudget*equity-used)/unit):unlimited" };
        put.limits.forEach((l, i) => work(`put.limits.${i}.modelQuantity`, formulas[l.name], { equity: result.day.equity, K: entry.K, notionalPerWeek: rules.notionalPerWeek, maxPutNotional: rules.maxPutNotional, openNotional: limits.openNotional, gapBudget: rules.gapBudget, used: limits.used, unit: limits.unit }, l.modelQuantity));
      }
      work("core.price", "SOXL raw close (provisional quote during preview)", { date: row.date }, row.S);
      work("core.rvFast", "max(RV10,RV20)", { RV10: row.RV10, RV20: row.RV20 }, row.RVfast);
      work("core.previousEquity", "Entered NAV at decision close; yesterday equity for next-close execution", { snapshotDate: snapshot.date }, snapshot.accountValue);
      work("core.targetWeight", "gateOn?min(min(coreCap,coreVolTarget/max(RVfast,1e-6))*mult,gapBudget/gapSize):0", { gateOn: rawGate.gateOn, coreCap: rules.coreCap, coreVolTarget: rules.coreVolTarget, RVfast: row.RVfast, mult: rawGate.mult, gapBudget: rules.gapBudget, gapSize: rules.gapSize }, target);
      work("core.modelShares", "targetWeight*previousEquity/price", { targetWeight: target, previousEquity: snapshot.accountValue, price: row.S }, core.modelShares);
      work("core.roundedShares", "floor(modelShares)", { modelShares: core.modelShares }, roundedShares);
      work("core.bandValue", "coreBand*max(targetWeight,1e-9)*previousEquity", { coreBand: rules.coreBand, targetWeight: target, previousEquity: snapshot.accountValue }, core.bandValue);
      if (core.trade) {
        work("core.trade.modelQuantity", "targetShares-heldShares", { targetShares: core.modelShares, heldShares: snapshot.shares }, core.trade.modelQuantity);
        work("core.trade.roundedQuantity", "floor(targetShares)-heldShares", { targetShares: core.modelShares, heldShares: snapshot.shares }, core.trade.roundedQuantity);
        work("core.trade.modelPrice", "SOXL decision close; future execution price unconfirmed", { S: row.S }, row.S);
      }
      work("account.equity", "Entered account NAV, not replay equity", { snapshotDate: snapshot.date }, account.equity);
      work("account.peak", "max(entered NAV snapshots through run date)", { count: snapshots.filter(s => s.date <= base.asOf).length }, peak);
      work("account.drawdown", "equity/observedPeak-1", { equity: account.equity, observedPeak: peak }, drawdown);
      work("account.coreWeight", "shares*S/equity", { shares: snapshot.shares, S: row.S, equity: snapshot.accountValue }, account.coreWeight);
      work("account.putNotionalWeight", "sum(K*contracts*100)/equity", { notional: positions.reduce((s, p) => s + p.K * p.qty, 0), equity: snapshot.accountValue }, account.putNotionalWeight);
      work("account.gapUsed", "shares*S*gapSize+sum((max(K-S*(1-gapSize),0)-modelValue)*qty)", { core: size.coreGap, puts: size.putGap, shockPrice: size.shockPrice }, size.used);
      openPutActions.forEach((a, i) => {
        const trade = result.trades[i]!, p = positions.find(p => p.open === trade.open && p.K === trade.K && p.credit === trade.credit)!;
        work(`openPutActions.${i}.modelQuantity`, "entered contracts*100", { contracts: p.qty / 100 }, a.modelQuantity);
        work(`openPutActions.${i}.roundedQuantity`, "floor(modelQuantity/100)", { modelQuantity: p.qty }, a.roundedQuantity);
        work(`openPutActions.${i}.modelPrice`, trade.how === "expiry" ? "max(K-S,0); ITM cash also includes S*qty*stockSlippage" : "modelValue*(1+premiumSlippage)+commission/(100*splitFactor)", { K: p.K, S: row.S, modelValue: modelPutValue(row, p, rules), premiumSlippage: rules.premiumSlippage, commission: rules.commission, splitFactor: row.unadj / row.S }, a.modelPrice);
      });
    }
  }
  const actionsBlocked = marketBlocked || problems.some(p => p.blocking) || account === null;
  const result: RunResult = { schemaVersion: 1, id: `${base.asOf}_${base.type}`, ...base, rulesId: "v3_1", freshness: { status: marketBlocked ? "blocked" : base.type === "preview" ? "provisional" : "valid", issues: problems, symbols, actionsBlocked }, gate, core, put, openPutActions, account,
    spax: { verdict: "NOT READY", checks: ["history", "trend", "vol", "premium", "options", "unlocks"].map(id => ({ id: id as RunResult["spax"]["checks"][number]["id"], status: "unconfirmed", value: id === "history" ? `${history.SPCX?.length ?? 0} SPCX / ${history.SPAX?.length ?? 0} SPAX bars` : null })), warnings: ["Monitor only; full qualification and manual option inputs arrive in M6", ...problems.filter(p => p.symbol === "SPAX" || p.symbol === "SPCX").map(p => p.message)] }, changesSincePreview: [], working };
  // Source counts are numeric too; every numeric leaf has an in-place working entry.
  symbols.forEach((s, i) => work(`freshness.symbols.${i}.count`, "count(validated bars through asOf)", { symbol: s.symbol, asOf: base.asOf }, s.count));
  return RunResultSchema.parse(result);
}
