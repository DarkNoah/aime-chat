import { ToolType } from './tool';

export enum MarketChannel {
  GetMarketData = 'market:getMarketData',
}

export const MARKET_KNOWLEDGE_BASE = 'knowledge-base' as const;

export type MarketDataType =
  | ToolType.SKILL
  | ToolType.MCP
  | typeof MARKET_KNOWLEDGE_BASE;
