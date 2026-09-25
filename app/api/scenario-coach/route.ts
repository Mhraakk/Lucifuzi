import { NextRequest, NextResponse } from "next/server";
import { coachScenario } from "@/lib/ai/scenarioCoach";
import { trainingScenarios } from "@/lib/demo-data";

export const runtime = "nodejs";

/**
 * Behavioral coach for completed scenarios.
 * Response always includes grantsWorkAuthorization: false.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scenarioId?: string;
      score?: number;
      maxScore?: number;
      strongTags?: string[];
      weakTags?: string[];
      pathLabels?: string[];
    };

    const scenario = trainingScenarios.find((s) => s.id === body.scenarioId);
    if (!scenario) {
      return NextResponse.json({ error: "سناریو یافت نشد" }, { status: 404 });
    }

    const coach = coachScenario({
      scenario,
      score: body.score ?? 0,
      maxScore: body.maxScore ?? 1,
      strongTags: body.strongTags ?? [],
      weakTags: body.weakTags ?? [],
      pathLabels: body.pathLabels,
    });

    // Optional LLM polish of managerSummary when key present — still evidence-only
    if (process.env.OPENAI_API_KEY && coach.weaknesses.length > 0) {
      try {
        const OpenAI = (await import("openai")).default;
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 280,
          messages: [
            {
              role: "system",
              content:
                "خلاصه مربی آموزشی گالری طلا به فارسی بنویس. کوتاه. هرگز مجوز کار نده. فقط شواهد رفتاری و پیشنهاد تمرین.",
            },
            {
              role: "user",
              content: coach.managerSummary,
            },
          ],
        });
        const polished = completion.choices[0]?.message?.content?.trim();
        if (polished) {
          coach.managerSummary = `${polished}\n\n(یادآوری: این خروجی مجوز کار نیست.)`;
        }
      } catch {
        /* keep rubric summary */
      }
    }

    return NextResponse.json(coach);
  } catch {
    return NextResponse.json(
      { error: "خطا در مربی سناریو" },
      { status: 500 }
    );
  }
}
