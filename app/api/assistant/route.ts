import { NextRequest, NextResponse } from "next/server";
import { answerAssistantQuestion } from "@/lib/assistant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const result = answerAssistantQuestion(body.question ?? "");
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (process.env.OPENAI_API_KEY && !result.sopId) {
      const isFallback = result.answer.includes("دانش‌نامه تأییدشده");
      if (isFallback) {
        try {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 500,
            messages: [
              {
                role: "system",
                content: `شما دستیار آموزشی داخلی گالری طلای آریا هستید. فقط درباره آموزش فروشگاه طلا به فارسی پاسخ دهید.
اگر سؤال به سیاست داخلی فروشگاه وابسته است، بگویید باید به SOP مراجعه شود و سیاست را اختراع نکنید.
پاسخ کوتاه، عملیاتی و محترمانه باشد.`,
              },
              { role: "user", content: (body.question ?? "").trim() },
            ],
          });
          const answer =
            completion.choices[0]?.message?.content?.trim() ?? result.answer;
          return NextResponse.json({ answer });
        } catch {
          /* fall through */
        }
      }
    }

    return NextResponse.json({
      answer: result.answer,
      sopId: result.sopId,
    });
  } catch {
    return NextResponse.json(
      { error: "دریافت اطلاعات با مشکل مواجه شد." },
      { status: 500 }
    );
  }
}
