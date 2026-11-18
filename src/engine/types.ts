import type { Bars } from "../schemas/bars";
export type Bar = Bars["bars"][number];
export type History = Record<string, readonly Bar[]>;
export interface Feature {
  date: string; S: number; H: number; L: number; REF: number; SPY: number; VIX: number; RF: number;
  RV10: number; RV20: number; RV60: number; RVfast: number; IV_ATM: number;
  REF_SMA50: number; REF_SMA200: number; S_SMA20: number | null; S_SMA50: number | null; S_SMA100: number | null;
  unadj: number; is_expiry: boolean; week_id: string;
}
export interface Gate { a: boolean; b: boolean; c: boolean; gateOn: boolean; mult: number; putOk: boolean }
export interface Position { K: number; expiry: string; qty: number; credit: number; open: string; value: number }
export interface Trade { kind: "P"; open: string; close: string; K: number; Kw: null; credit: number; exit: number; pnl: number; notional: number; assigned: boolean; how: "profit" | "expiry" }
export interface CoreTrade { date: string; qty: number; price: number; slippage: number }
export interface Entry extends Position { mid: number }
export interface ReplayDay {
  date: string; equity: number; core_w: number; put_w: number; regime: boolean; dd: number;
  cash: number; coreQty: number; coreTrade: number; executedTarget: number; previousEquity: number; coreTarget: number; gate: Gate; positions: Position[];
}
export interface EngineState {
  cash: number; positions: Position[]; coreQty: number; coreTarget: number; lastEquity: number;
  previousDate: string | null; enteredWeek: string | null; peak: number; gateOn: boolean;
}
export interface ReplayResult { days: ReplayDay[]; trades: Trade[]; coreTrades: CoreTrade[]; entries: Entry[]; state: EngineState }
