import type { PortfolioEntry } from "../schemas/portfolio";
// Roadmap contracts only. No provider, connection, order or alert implementation.
export interface QuoteProvider {
  getQuote(symbol: string): Promise<unknown>; // Future provider must validate its external payload.
}
export interface PositionProvider {
  getPositions(): Promise<PortfolioEntry>;
}
