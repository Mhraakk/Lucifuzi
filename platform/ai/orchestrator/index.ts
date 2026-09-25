/**
 * Layer 9 — AI Orchestrator
 * Plans tool use → MCP → RAG → Model Gateway → Guardrails
 */

import { callMcpTool, type McpToolName } from "@/platform/ai/mcp";
import { completeModel } from "@/platform/ai/gateway";
import { runGuardrails } from "@/platform/ai/guardrails";
import { remember } from "@/platform/memory";
import { publish } from "@/platform/events/bus";

export type OrchestratorRequest = {
  orgId: string;
  userId: string;
  question: string;
  correlationId?: string;
};

export type OrchestratorResponse = {
  answer: string;
  toolsUsed: McpToolName[];
  refused: boolean;
  provider: string;
  guardrailReasons: string[];
  citations?: unknown[];
};

function planTools(question: string): McpToolName[] {
  const q = question.toLowerCase();
  const tools: McpToolName[] = [];
  if (/قیمت|اجرت|وزن|گرم|عیار|quote|price/.test(q)) {
    tools.push("finance.quote", "market.get_tick");
  }
  if (/بازار|نوسان|مومنتوم|طلای\s*جهانی/.test(q)) {
    tools.push("quant.floor_intel", "market.get_tick");
  }
  tools.push("rag.ask");
  return Array.from(new Set(tools));
}

function extractWeight(q: string): number {
  const m = q.match(/(\d+(?:\.\d+)?)\s*گرم/);
  return m ? Number(m[1]) : 10;
}

export async function orchestrateAsk(
  req: OrchestratorRequest
): Promise<OrchestratorResponse> {
  const inbound = runGuardrails({ text: req.question, kind: "user_prompt" });
  if (!inbound.allowed) {
    await publish("ai.refused", req.orgId, {
      userId: req.userId,
      reasons: inbound.reasons,
    });
    return {
      answer:
        "درخواست رد شد (گاردریل). مجوز کار یا دستور تزریق‌شده قابل پردازش نیست.",
      toolsUsed: [],
      refused: true,
      provider: "none",
      guardrailReasons: inbound.reasons,
    };
  }

  const tools = planTools(req.question);
  const toolNotes: string[] = [];
  let citations: unknown[] | undefined;
  let refused = false;

  for (const tool of tools) {
    if (tool === "finance.quote") {
      const out = (await callMcpTool("finance.quote", {
        orgId: req.orgId,
        weightGrams: extractWeight(req.question),
        karat: 18,
      })) as { customerScript?: string };
      if (out.customerScript) toolNotes.push(out.customerScript);
    } else if (tool === "market.get_tick") {
      const tick = await callMcpTool("market.get_tick", {
        instrument: "XAUIRR",
      });
      toolNotes.push(`بازار: ${JSON.stringify(tick)}`);
    } else if (tool === "quant.floor_intel") {
      const intel = (await callMcpTool("quant.floor_intel", {})) as {
        headlineFa?: string;
      };
      if (intel.headlineFa) toolNotes.push(intel.headlineFa);
    } else if (tool === "rag.ask") {
      const rag = (await callMcpTool("rag.ask", {
        question: req.question,
      })) as {
        answer: string;
        refused: boolean;
        citations: unknown[];
      };
      toolNotes.push(rag.answer);
      citations = rag.citations;
      refused = rag.refused;
    }
  }

  const grounded = toolNotes.join("\n\n");
  const model = await completeModel({
    prefer: process.env.OPENAI_API_KEY ? "openai" : "local",
    messages: [
      {
        role: "system",
        content:
          "دستیار شیفت آریا. فقط از شواهد ابزار/RAG بگو. مجوز کار نده. فارسی کوتاه.",
      },
      {
        role: "user",
        content: `سؤال: ${req.question}\n\nشواهد:\n${grounded}`,
      },
    ],
  });

  const outbound = runGuardrails({
    text: model.content || grounded,
    kind: "model_output",
  });

  const answer = outbound.allowed
    ? outbound.redactedText
    : grounded || "پاسخ به‌خاطر گاردریل منتشر نشد؛ به SOP مراجعه کنید.";

  await remember({
    scope: "user",
    userId: req.userId,
    key: "last_ai_answer",
    value: answer.slice(0, 500),
  });

  await publish(
    refused ? "ai.refused" : "ai.ask",
    req.orgId,
    {
      userId: req.userId,
      tools: tools.join(","),
      provider: model.provider,
    },
    req.correlationId
  );

  return {
    answer,
    toolsUsed: tools,
    refused,
    provider: model.provider,
    guardrailReasons: outbound.reasons,
    citations,
  };
}
