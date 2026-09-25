import { NextRequest, NextResponse } from "next/server";
import {
  answerWithRag,
  enrichWithLlmIfAvailable,
} from "@/lib/assistant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const question = (body.question ?? "").trim();
    const base = answerWithRag(question);
    if (base.error) {
      return NextResponse.json({ error: base.error }, { status: 400 });
    }

    const result = await enrichWithLlmIfAvailable(question, base);

    return NextResponse.json({
      answer: result.answer,
      citations: result.citations,
      sopId: result.sopId,
      lessonId: result.lessonId,
      refused: result.refused,
      mode: result.mode,
    });
  } catch {
    return NextResponse.json(
      { error: "دریافت اطلاعات با مشکل مواجه شد." },
      { status: 500 }
    );
  }
}
