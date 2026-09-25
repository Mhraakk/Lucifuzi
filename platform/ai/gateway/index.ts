/**
 * Layer 12 — Model Gateway (provider router + fallbacks)
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ModelRequest = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  prefer?: "openai" | "local";
};

export type ModelResponse = {
  content: string;
  provider: "openai" | "local" | "none";
  latencyMs: number;
};

export async function completeModel(
  req: ModelRequest
): Promise<ModelResponse> {
  const started = Date.now();
  if (req.prefer !== "local" && process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 500,
        messages: req.messages,
      });
      return {
        content: completion.choices[0]?.message?.content?.trim() ?? "",
        provider: "openai",
        latencyMs: Date.now() - started,
      };
    } catch {
      /* fall through */
    }
  }

  // Local deterministic stub — mirrors last user message context length
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  return {
    content:
      lastUser?.content.slice(0, 400) ||
      "پاسخ محلی: مدل در دسترس نیست؛ از RAG استفاده کنید.",
    provider: "local",
    latencyMs: Date.now() - started,
  };
}
