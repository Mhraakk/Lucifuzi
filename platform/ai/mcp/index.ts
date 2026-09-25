/**
 * Layer 10 — MCP tool surface (in-process tools the orchestrator can call)
 */

import { quoteGold, explainQuoteToCustomer } from "@/platform/finance/core";
import { getLatest, type Instrument } from "@/platform/market/feed";
import { shopFloorIntel } from "@/platform/quant/engines";
import { platformRagAsk } from "@/platform/ai/rag";

export type McpToolName =
  | "market.get_tick"
  | "finance.quote"
  | "quant.floor_intel"
  | "rag.ask";

export type McpTool = {
  name: McpToolName;
  description: string;
  inputSchema: Record<string, string>;
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "market.get_tick",
    description: "Latest gold/FX tick",
    inputSchema: { instrument: "XAUIRR|XAUUSD|USDIRR" },
  },
  {
    name: "finance.quote",
    description: "Deterministic gold quote from formula + market",
    inputSchema: { weightGrams: "number", karat: "18|21|22|24?" },
  },
  {
    name: "quant.floor_intel",
    description: "Shop-floor market intelligence headline",
    inputSchema: {},
  },
  {
    name: "rag.ask",
    description: "Grounded answer from approved knowledge",
    inputSchema: { question: "string" },
  },
];

export async function callMcpTool(
  name: McpToolName,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "market.get_tick": {
      const instrument = (args.instrument as Instrument) || "XAUIRR";
      return getLatest(instrument);
    }
    case "finance.quote": {
      const weightGrams = Number(args.weightGrams);
      const karat = (args.karat as 18 | 21 | 22 | 24 | undefined) ?? 18;
      const result = quoteGold({
        orgId: String(args.orgId ?? "org_arya"),
        weightGrams,
        karat,
      });
      return { ...result, customerScript: explainQuoteToCustomer(result) };
    }
    case "quant.floor_intel":
      return shopFloorIntel();
    case "rag.ask":
      return platformRagAsk(String(args.question ?? ""));
    default:
      throw new Error(`Unknown MCP tool: ${name as string}`);
  }
}
