import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "../../../lib/openai";
import { buildSystemPrompt, parseAnalysisResponse } from "../../../lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { story } = body as { story: string };

    if (!story || story.trim().length < 20) {
      return NextResponse.json(
        { error: "لطفاً داستان حقوقی خود را با جزئیات بیشتری بنویسید (حداقل ۲۰ کاراکتر)." },
        { status: 400 }
      );
    }

    let client;
    try {
      client = getOpenAIClient();
    } catch {
      return NextResponse.json(
        { error: "کلید API تنظیم نشده است. لطفاً متغیر محیطی OPENAI_API_KEY را در Vercel تنظیم کنید." },
        { status: 500 }
      );
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `داستان حقوقی من:\n\n${story.trim()}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";

    let result;
    try {
      result = parseAnalysisResponse(rawContent);
    } catch {
      return NextResponse.json(
        { error: "خطا در پردازش پاسخ هوش مصنوعی. لطفاً دوباره تلاش کنید." },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "خطای ناشناخته رخ داده است.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
