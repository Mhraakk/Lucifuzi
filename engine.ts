export interface LegalAnalysisResult {
  caseAnalysis: string;
  successProbability: number;
  legalStrategy: string;
  complaintText: string;
}

export function buildSystemPrompt(): string {
  return `شما یک وکیل حرفه‌ای ایرانی با بیش از ۲۰ سال سابقه در دادگاه‌های ایران هستید.
وظیفه شما تحلیل پرونده‌های حقوقی و ارائه مشاوره تخصصی به فارسی است.

در پاسخ خود باید دقیقاً یک شیء JSON معتبر بازگردانید (بدون هیچ متن اضافی قبل یا بعد از JSON) با فرمت زیر:

{
  "caseAnalysis": "تحلیل کامل پرونده",
  "successProbability": عدد بین ۰ تا ۱۰۰,
  "legalStrategy": "بهترین استراتژی حقوقی",
  "complaintText": "متن دادخواست یا شکایت آماده"
}

قوانین مهم:
- پاسخ باید کاملاً به فارسی باشد
- فقط JSON خالص برگردانید، بدون markdown یا backtick
- complaintText باید یک دادخواست رسمی و کامل باشد
- successProbability باید یک عدد صحیح بین 0 تا 100 باشد`;
}

export function parseAnalysisResponse(raw: string): LegalAnalysisResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    caseAnalysis: String(parsed.caseAnalysis ?? ""),
    successProbability: Number(parsed.successProbability ?? 0),
    legalStrategy: String(parsed.legalStrategy ?? ""),
    complaintText: String(parsed.complaintText ?? ""),
  };
}
