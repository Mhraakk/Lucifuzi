import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Offline-safe educational assistant grounded in approved content */
const KNOWLEDGE: { keys: string[]; answer: string; sopId?: string }[] = [
  {
    keys: ["اجرت"],
    answer:
      "اجرت هزینه‌ای است که بابت ساخت و پرداخت مصنوع طلا به مبلغ ارزش طلا اضافه می‌شود. در گالری آریا اجرت معمولاً بر اساس گرم و سیاست قیمت‌گذاری سازمان محاسبه می‌شود و نباید با «قیمت روز طلا» قاطی شود. جزئیات فرمول در تنظیمات سازمان و درس محاسبات آمده است.",
  },
  {
    keys: ["نیم‌ست", "سرویس", "نیم ست"],
    answer:
      "سرویس معمولاً مجموعه کامل‌تری از قطعات هماهنگ (مثلاً گردنبند، گوشواره، انگشتر و…) است. نیم‌ست اغلب دو قطعه مکمل مثل گردنبند و گوشواره را پوشش می‌دهد. هنگام معرفی، تفاوت تعداد قطعات، هماهنگی و بودجه را شفاف بگویید.",
  },
  {
    keys: ["گرونه", "گران", "قیمت"],
    answer:
      "اعتراض قیمت را شخصی نگیرید. اجزای قیمت (وزن، عیار، اجرت، سود) را ساده توضیح دهید، گزینه هم‌رده با اجرت کمتر پیشنهاد کنید و تخفیف را فقط در چارچوب سیاست شعبه مطرح کنید. درس «مدیریت اعتراض قیمت» را مرور کنید.",
  },
  {
    keys: ["تعمیر", "پذیرش"],
    answer:
      "مراحل استاندارد پذیرش تعمیر: عکس از چند زاویه، ثبت آسیب و متعلقات، وزن قبل از پذیرش، تأیید مشتری، صدور رسید، تحویل به کارگاه. بدون عکس و وزن پذیرش نکنید.",
    sopId: "sop_repair",
  },
  {
    keys: ["ویترین", "تحویل ویترین"],
    answer:
      "تحویل ویترین باید با شمارش مشترک تحویل‌دهنده و گیرنده، تطبیق با سیستم و ثبت مغایرت قبل از جابه‌جایی دسترسی انجام شود. تحویل شفاهی بدون ثبت معتبر نیست.",
    sopId: "sop_vitrin",
  },
  {
    keys: ["پرداخت", "رسید", "انتقال"],
    answer:
      "تصویر رسید موبایل جایگزین تأیید سیستم نیست. کالا را تا تأیید پرداخت در سیستم کنار بگذارید و در صورت اصرار مشتری به مدیر ارجاع دهید.",
    sopId: "sop_emergency",
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const question = (body.question ?? "").trim();
    if (question.length < 3) {
      return NextResponse.json(
        { error: "سؤال را کامل‌تر بنویسید." },
        { status: 400 }
      );
    }

    const hit = KNOWLEDGE.find((k) =>
      k.keys.some((key) => question.includes(key))
    );

    if (hit) {
      return NextResponse.json({ answer: hit.answer, sopId: hit.sopId });
    }

    // Optional OpenAI enrichment when key exists — still refuse inventing policy
    if (process.env.OPENAI_API_KEY) {
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
            { role: "user", content: question },
          ],
        });
        const answer =
          completion.choices[0]?.message?.content?.trim() ??
          "پاسخ در محتوای تأییدشده یافت نشد؛ از مدیر یا SOP بپرسید.";
        return NextResponse.json({ answer });
      } catch {
        /* fall through */
      }
    }

    return NextResponse.json({
      answer:
        "این مورد در دانش‌نامه تأییدشده پیدا نشد. اگر به رویه داخلی مربوط است، دستورالعمل (SOP) مرتبط را باز کنید یا از مدیر بپرسید — دستیار حق جعل سیاست سازمان را ندارد.",
      sopId: "sop_vitrin",
    });
  } catch {
    return NextResponse.json(
      { error: "دریافت اطلاعات با مشکل مواجه شد." },
      { status: 500 }
    );
  }
}
