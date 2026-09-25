import {
  buildGroundedContext,
  citationsFromHits,
  composeRagAnswer,
  retrieveKnowledge,
  type Citation,
} from "@/lib/knowledge/rag";

export type AssistantRagResult = {
  answer: string;
  citations: Citation[];
  sopId?: string;
  lessonId?: string;
  refused: boolean;
  mode: "rag" | "rag+llm" | "refused";
  error?: string;
};

/** Offline / client RAG entrypoint */
export function answerWithRag(questionRaw: string): AssistantRagResult {
  const question = questionRaw.trim();
  if (question.length < 3) {
    return {
      answer: "",
      citations: [],
      refused: true,
      mode: "refused",
      error: "سؤال را کامل‌تر بنویسید.",
    };
  }

  const hits = retrieveKnowledge(question, 5);
  const composed = composeRagAnswer(question, hits);
  const sopId = composed.citations.find((c) => c.sopId)?.sopId;
  const lessonId = composed.citations.find((c) => c.lessonId)?.lessonId;

  return {
    answer: composed.answer,
    citations: composed.citations,
    sopId,
    lessonId,
    refused: composed.refused,
    mode: composed.refused ? "refused" : "rag",
  };
}

export async function enrichWithLlmIfAvailable(
  question: string,
  base: AssistantRagResult
): Promise<AssistantRagResult> {
  if (base.refused || !process.env.OPENAI_API_KEY) return base;
  const hits = retrieveKnowledge(question, 5);
  if (hits.length === 0) return base;

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context = buildGroundedContext(hits);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 550,
      messages: [
        {
          role: "system",
          content: `شما دستیار شیفت Beatris هستید.
فقط از «منابع تأییدشده» زیر پاسخ بدهید. اگر پاسخ در منابع نیست بگویید پیدا نشد.
سیاست شعبه را اختراع نکنید. فارسی، کوتاه، عملیاتی.
مجوز کار صادر نکنید. در پایان منابع را نام ببرید.`,
        },
        {
          role: "user",
          content: `سؤال:\n${question}\n\nمنابع تأییدشده:\n${context}`,
        },
      ],
    });
    const answer =
      completion.choices[0]?.message?.content?.trim() ?? base.answer;
    return {
      ...base,
      answer,
      citations: citationsFromHits(hits),
      mode: "rag+llm",
    };
  } catch {
    return base;
  }
}

/** @deprecated use answerWithRag — kept for compatibility */
export { answerWithRag as answerAssistantQuestion };
