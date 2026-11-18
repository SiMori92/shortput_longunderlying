import { cookies } from "next/headers";
import { parseStrategy, STRATEGY_COOKIE, type StrategySymbol } from "./symbols";
export async function selectedStrategy(): Promise<StrategySymbol> {
  return parseStrategy((await cookies()).get(STRATEGY_COOKIE)?.value);
}
