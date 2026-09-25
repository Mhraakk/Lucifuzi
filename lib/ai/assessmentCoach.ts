/**
 * Manager practical-assessment coach — suggests checklist + structured notes.
 * Never grants WorkAuthorization; human manager decides.
 */

import type { Competency, PracticalStatus } from "@/lib/types";
import { domainsForCompetency } from "@/lib/standards";

export type AssessmentCoachSuggestion = {
  competencyId: string;
  domainCodes: string[];
  checklist: string[];
  suggestedNotes: string;
  evidenceNeeded: string[];
  renewalHint: string | null;
  /** Product rule */
  grantsWorkAuthorization: false;
};

const DOMAIN_CHECKLIST: Record<string, string[]> = {
  "ARYA-SEC": [
    "Dual Control در باز/بسته رعایت شد",
    "شمارش ویترین با شاهد ثبت شد",
    "کلید/رمز بدون اشتراک‌گذاری استفاده شد",
    "مورد مشکوک طبق SOP گزارش شد",
  ],
  "ARYA-SAL": [
    "نیازسنجی مناسبت و بودجه بدون فشار",
    "حداکثر دو گزینه شفاف ارائه شد",
    "اجزای قیمت به‌زبان مشتری توضیح داده شد",
    "لحن quiet luxury حفظ شد",
  ],
  "ARYA-INT": [
    "نشانه‌های تقلب بدون اتهام مستقیم شناسایی شد",
    "کالا تا تأیید امن نگه داشته شد",
    "مدیر/امنیت طبق زنجیره خبردار شد",
    "ثبت مستند بدون تأخیر انجام شد",
  ],
  "ARYA-PRI": [
    "فرمول قیمت سازمان اعمال شد (نه حدس)",
    "اجرت و مالیات جداگانه توضیح داده شد",
    "ماشین‌حساب/نرخ روز درست استفاده شد",
  ],
  "ARYA-OPS": [
    "رویه تحویل/تعمیر طبق SOP",
    "رسید و امضا کامل است",
    "زمان‌بندی پیگیری به مشتری اعلام شد",
  ],
};

const DEFAULT_CHECKLIST = [
  "شمارش / کنترل",
  "ثبت مستندات",
  "نحوه کار با کالا",
  "رعایت رویه شعبه",
];

export function suggestAssessmentCoach(input: {
  competency: Competency;
  employeeName: string;
  knowledgeLevel: number;
  currentAuth: string;
  practicalStatus?: PracticalStatus;
  sopLagCount?: number;
  failedExamRecently?: boolean;
}): AssessmentCoachSuggestion {
  const fromAtlas = domainsForCompetency(input.competency.id).map((d) => d.code);
  const domains =
    fromAtlas.length > 0
      ? fromAtlas
      : [input.competency.code].filter(Boolean);
  const fromDomain = domains.flatMap((code) => DOMAIN_CHECKLIST[code] ?? []);
  const checklist =
    fromDomain.length > 0
      ? fromDomain.slice(0, 5)
      : DEFAULT_CHECKLIST;

  const evidenceNeeded = [
    "مشاهده مستقیم در شیفت (نه فقط نمره آزمون)",
    "حداقل یک نمونه کار واقعی یا شبیه‌سازی تحت نظارت",
  ];
  if (domains.includes("ARYA-SEC")) {
    evidenceNeeded.push("ثبت Dual Control با timestamp");
  }

  const notesParts = [
    `ارزیابی عملی «${input.competency.title}» برای ${input.employeeName}.`,
    `سطح دانش ثبت‌شده: ${input.knowledgeLevel}٪ (دانش ≠ مجوز کار).`,
  ];
  if (input.failedExamRecently) {
    notesParts.push(
      "آزمون اخیر ضعیف بوده؛ قبل از مجوز مستقل، بازآموزی و مشاهده مجدد لازم است."
    );
  }
  if ((input.sopLagCount ?? 0) > 0) {
    notesParts.push(
      `${input.sopLagCount} دستورالعمل بدون تأیید — تا ack کامل، مجوز مستقل توصیه نمی‌شود.`
    );
  }
  notesParts.push(
    "تصمیم مجوز فقط پس از مشاهده معیارهای چک‌لیست توسط مدیر صادر می‌شود."
  );

  let renewalHint: string | null = null;
  if (input.currentAuth === "independent") {
    renewalHint =
      "مجوز مستقل فعال است — در صورت مردودی آزمون اجباری یا SOP عقب‌افتاده، revoke/تمدید را بررسی کنید.";
  } else if (input.knowledgeLevel < 70) {
    renewalHint =
      "دانش زیر حد نصاب: تکلیف remediation بدهید؛ هنوز ارزیابی عملی نهایی نکنید.";
  }

  return {
    competencyId: input.competency.id,
    domainCodes: domains,
    checklist: checklist.length ? checklist : DEFAULT_CHECKLIST,
    suggestedNotes: notesParts.join(" "),
    evidenceNeeded,
    renewalHint,
    grantsWorkAuthorization: false,
  };
}
