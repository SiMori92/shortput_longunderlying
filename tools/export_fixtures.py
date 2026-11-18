"""Run: pnpm fixtures:export (creates a fresh pinned uv environment)

Imports reference modules read-only. Never imports riskcut_v3 (import runs a battery).
Source substitutions match its gate swap exactly; instrumentation only observes locals.
"""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENG = ROOT.parent / "Backtest/Backtest_app/v2_engine"
sys.path.insert(0, str(ENG))
import numpy as np
import pandas as pd
import scipy
import short_put_engine as E
import risk_v3 as R
E.DATA = str(ENG / "data_merged_2026-11-16")
START, END = "2018-01-01", "2026-11-16"
FEATURES = ["S", "H", "L", "REF", "SPY", "VIX", "RF", "RV10", "RV20", "RV60", "RVfast", "IV_ATM", "REF_SMA50", "REF_SMA200", "S_SMA20", "S_SMA50", "S_SMA100", "unadj", "is_expiry", "week_id"]

def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [clean(v) for v in value]
    if isinstance(value, pd.Timestamp): return value.strftime("%Y-%m-%d")
    if isinstance(value, (np.bool_, bool)): return bool(value)
    if isinstance(value, (np.integer, int)): return int(value)
    if isinstance(value, (np.floating, float)): return float(value) if math.isfinite(value) else None
    return value

def records(frame):
    return clean(frame.reset_index().rename(columns={"index": "date"}).to_dict("records"))

def write(name, value):
    out = ROOT / "tests/fixtures" / name
    temp = out.with_suffix(".tmp")
    temp.write_text(json.dumps(clean(value), allow_nan=False, separators=(",", ":")) + "\n")
    os.replace(temp, out)

source = (ENG / "risk_v3.py").read_text()
source = source[:source.index('if __name__ == "__main__":')]
def observed_run(riskcut):
    src = source
    if riskcut:
        a0 = src.index('        slow = row[f"REF_SMA{c.sma_slow}"]')
        a1 = src.index("        regime = reg_state")
        src = src[:a0] + "        reg_state = bool(row.GATE)\n" + src[a1:]
        src = src.replace("if regime and entered_week != wk", "if regime and row.PUTOK and entered_week != wk")
        src = src.replace("            w *= thr\n", "            w *= thr * row.MULT\n")
        assert "row.PUTOK" in src and "row.MULT" in src
    src = src.replace("        row = d.loc[t];", "        before_core = core_qty; executed_target = core_tgt_w; previous_equity = last_eq\n        row = d.loc[t];")
    src = src.replace("        core_tgt_w = w\n", """        core_tgt_w = w
        _trace.append(dict(date=t, cash=cash, coreQty=core_qty, coreTrade=core_qty-before_core,
                           executedTarget=executed_target, previousEquity=previous_equity,
                           coreTarget=w, positions=[dict(K=p.K, expiry=p.expiry, qty=p.qty,
                           credit=p.credit, open=p.open, value=p.value) for p in pos]))
""")
    ns = {"_trace": []}
    exec(compile(src, "observed_risk_v3", "exec"), ns)
    return ns

df = R.prep(E.build_features())
write("features.json", records(df[FEATURES]))
for key, riskcut in [("v3_archived", False), ("v3_1", True)]:
    d = df.copy()
    if riskcut:
        sf, ss = d.REF.rolling(50).mean(), d.REF.rolling(200).mean()
        a = d.REF > ss
        d["GATE"] = (sf > ss) & ~(d.RV10 / d.RV60 > 1.6)
        d["MULT"] = np.where(a, 1.0, 0.5)
        d["PUTOK"] = a
    ns = observed_run(riskcut)
    eq, tr = ns["run3"](d, R.C3(key, **R.V3_BALANCED), start=START, end=END)
    # Assert observation has not changed the original archived loop.
    if not riskcut:
        baseline, baseline_trades = R.run3(d, R.C3(key, **R.V3_BALANCED), start=START, end=END)
        pd.testing.assert_frame_equal(eq, baseline)
        pd.testing.assert_frame_equal(tr, baseline_trades)
    metrics, yearly = R.summarize(eq.equity, d.RF, tr, key)
    monthly = eq.equity.resample("ME").last()
    monthly = pd.concat([pd.Series([eq.equity.iloc[0]], [eq.index[0] - pd.Timedelta(days=1)]), monthly]).pct_change().dropna()
    days = []
    for record, trace in zip(records(eq), clean(ns["_trace"]), strict=True):
        t = pd.Timestamp(record["date"]); row = d.loc[t]
        a = bool(row.PUTOK) if riskcut else bool(row.REF > row.REF_SMA200)
        b = bool(row.REF_SMA50 > row.REF_SMA200)
        if riskcut: b = bool(sf.loc[t] > ss.loc[t])
        c = not (row.RV60 > 0 and row.RV10 / row.RV60 > 1.6)
        days.append({**record, **trace, "gate": dict(a=a, b=b, c=bool(c), gateOn=record["regime"], mult=float(row.MULT) if riskcut else 1.0, putOk=a if riskcut else True)})
    write(key + ".json", dict(rulesId=key, start=START, end=END, capital=1e6, days=days,
         trades=clean(tr.to_dict("records")), metrics=metrics,
         yearly={str(t.year): v for t, v in yearly.items()},
         monthly={t.strftime("%Y-%m"): v for t, v in monthly.items()}))
    print(f"{key}: days={len(eq)} trades={len(tr)} final={eq.equity.iloc[-1]:.12f} CAGR={metrics['CAGR']:.12f} MDD={metrics['MDD']:.12f}")
# Independent numerical fixtures from scipy, including far tails and negative rates.
from scipy.special import ndtr
write("math.json", dict(cdf=[dict(x=float(x), value=float(ndtr(x))) for x in [-38,-12,-8,-4,-2,-1,-.5,0,.5,1,2,4,8,12,38]],
    options=[dict(S=S,K=K,T=T,r=r,iv=iv,value=float(E.bs_put(S,K,T,r,iv))) for S,K,T,r,iv in [(100,90,11/365,.04,1.2),(100,100,0,.04,1),(50,60,-1/365,0,.5),(5,4,.1,-.01,.3),(100,110,.01,.05,3)] ]))
write("provenance.json", dict(python=sys.version.split()[0],pandas=pd.__version__,numpy=np.__version__,scipy=scipy.__version__,
    sources={name:hashlib.sha256((ENG/name).read_bytes()).hexdigest() for name in ["short_put_engine.py","risk_v3.py","riskcut_v3.py"]},
    bars={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(E.DATA).glob("*.csv"))}))
