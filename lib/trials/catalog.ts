/**
 * Authentic role trials — separate environments, tools, conditions, 3D.
 * Passing a trial produces evidence; ONLY manager practical assessment
 * grants WorkAuthorization / responsibility (never auto from score).
 */

import type { JobRole, WorkAuthorization } from "@/lib/types";

export type TrialDomainId =
  | "sales"
  | "operations"
  | "craft"
  | "melt"
  | "ideation"
  | "volatility"
  | "trading"
  | "quality";

export type TrialEnvId =
  | "sales_floor"
  | "ops_desk"
  | "craft_bench"
  | "melt_lab"
  | "ideation_studio"
  | "market_desk"
  | "buy_desk"
  | "qc_station";

export type TrialToolId = string;

export type TrialStepKind =
  | "observe"
  | "select_tool"
  | "measure"
  | "decide"
  | "dual_control"
  | "3d_inspect"
  | "price_react"
  | "document";

export type TrialStep = {
  id: string;
  kind: TrialStepKind;
  promptFa: string;
  /** Correct choice ids (multi allowed for checklists) */
  correctIds: string[];
  options: { id: string; labelFa: string }[];
  /** Points if answered correctly */
  points: number;
  hintFa?: string;
  /** Required tool must be active before answering */
  requiresToolId?: string;
};

export type RoleEnvironment = {
  id: TrialEnvId;
  domainId: TrialDomainId;
  titleFa: string;
  roomFa: string;
  conditionFa: string;
  hazardFa: string;
  /** Job roles this env qualifies toward */
  jobRoles: JobRole[];
  competencyId: string;
  /** Arsenal / bench tools available in this room */
  toolIds: TrialToolId[];
  /** 3D scene preset */
  scene3d: "counter" | "safe" | "bench" | "furnace" | "studio" | "ticker" | "assay" | "loupe";
  accent: string;
  passScore: number;
  /** Authorization a manager may grant after pass + practical */
  suggestedAuth: WorkAuthorization;
  responsibilityFa: string;
};

export type RoleTrial = {
  id: string;
  envId: TrialEnvId;
  titleFa: string;
  briefFa: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: TrialStep[];
};

export type TrialTool = {
  id: TrialToolId;
  titleFa: string;
  envIds: TrialEnvId[];
  howFa: string;
};

export const TRIAL_TOOLS: TrialTool[] = [
  { id: "tray_velvet", titleFa: "سینی مخمل ارائه", envIds: ["sales_floor"], howFa: "قطعه را روی سینی به مشتری نشان دهید — هرگز مستقیم روی میز شیشه." },
  { id: "loupe_10x", titleFa: "ذره‌بین ۱۰×", envIds: ["sales_floor", "qc_station", "buy_desk"], howFa: "مهر عیار، خراش، لحیم و نگین را با نور کنترل‌شده ببینید." },
  { id: "price_sheet", titleFa: "برگه شفافیت قیمت", envIds: ["sales_floor", "market_desk"], howFa: "فلز · اجرت · سود · مالیات را جدا بنویسید." },
  { id: "dual_key", titleFa: "کلید دو نفره گاوصندوق", envIds: ["ops_desk"], howFa: "بدون نفر دوم قفل اصلی باز نمی‌شود." },
  { id: "vitrine_log", titleFa: "دفتر ویترین", envIds: ["ops_desk"], howFa: "ورود/خروج قطعه با امضای دو نفر." },
  { id: "alarm_panel", titleFa: "پنل هشدار", envIds: ["ops_desk"], howFa: "تست روزانه زنگ و کد اضطراری." },
  { id: "wax_block", titleFa: "بلوک موم فرم", envIds: ["craft_bench", "ideation_studio"], howFa: "قبل از فلز، حجم را روی موم بیازمایید." },
  { id: "caliper", titleFa: "کولیس دیجیتال", envIds: ["craft_bench", "qc_station"], howFa: "ضخامت، قطر داخلی حلقه، تلرانس ساخت." },
  { id: "file_set", titleFa: "سوهان جواهر", envIds: ["craft_bench"], howFa: "لبه‌های تیز و پخ کنترل‌شده — بدون تراش عیار." },
  { id: "crucible", titleFa: "بوته ذوب", envIds: ["melt_lab"], howFa: "فقط با PPE و تهویه؛ وزن ورودی ثبت شود." },
  { id: "furnace", titleFa: "کوره القایی", envIds: ["melt_lab"], howFa: "دما و زمان ثبت؛ نفر دوم ناظر." },
  { id: "ingot_mold", titleFa: "قالب شمشچه", envIds: ["melt_lab"], howFa: "ریختن فقط با دستکش و سپر صورت." },
  { id: "scale_0_01", titleFa: "ترازو ۰٫۰۱g", envIds: ["melt_lab", "buy_desk", "qc_station"], howFa: "وزن قبل/بعد ذوب و خرید دست‌دوم." },
  { id: "sketch_pad", titleFa: "دفتر اسکیس ایده", envIds: ["ideation_studio"], howFa: "سه واریانت قبل از ساخت ذهنی ۳D." },
  { id: "studio_orbit", titleFa: "دوربین ۳D اوربیت", envIds: ["ideation_studio", "craft_bench"], howFa: "چرخش قطعه برای ارائه و بازرسی." },
  { id: "fx_board", titleFa: "تابلو نرخ لحظه‌ای", envIds: ["market_desk", "buy_desk", "sales_floor"], howFa: "XAU و دلار را قبل از اعلام قیمت چک کنید." },
  { id: "spread_card", titleFa: "کارت اسپرد خرید/فروش", envIds: ["market_desk", "buy_desk"], howFa: "حداقل اسپرد مجاز شعبه را رعایت کنید." },
  { id: "acid_kit", titleFa: "کیت اسید محک", envIds: ["buy_desk", "qc_station"], howFa: "فقط روی نمونه خراش کنترل‌شده؛ PPE اجباری." },
  { id: "xrf_gun", titleFa: "دستگاه XRF", envIds: ["buy_desk", "qc_station"], howFa: "عیار تقریبی — نتیجه را در برگه خرید ثبت کنید." },
  { id: "uv_lamp", titleFa: "لامپ UV اسکناس", envIds: ["buy_desk", "ops_desk"], howFa: "برای اسکناس مشکوک کنار میز خرید." },
  { id: "defect_card", titleFa: "کارت طبقه‌بندی نقص", envIds: ["qc_station"], howFa: "A/B/C نقص ساخت و تصمیم قبول/رد/تعمیر." },
  { id: "ppe_kit", titleFa: "بسته PPE ذوب", envIds: ["melt_lab"], howFa: "دستکش، سپر، پیش‌بند — قبل از روشن کردن کوره." },
];

export const ROLE_ENVIRONMENTS: RoleEnvironment[] = [
  {
    id: "sales_floor",
    domainId: "sales",
    titleFa: "کف فروش — مهمان‌نوازی و بستن",
    roomFa: "ویترین مرکزی · نور گرم · سینی مخمل",
    conditionFa: "مشتری با بودجه محدود؛ نرخ طلا امروز در حال نوسان خفیف است.",
    hazardFa: "فشار فروش، وعدهٔ غیرمستند، ارائه بدون سینی.",
    jobRoles: ["sales_associate", "store_manager", "ideator"],
    competencyId: "comp_sales",
    toolIds: ["tray_velvet", "loupe_10x", "price_sheet", "fx_board"],
    scene3d: "counter",
    accent: "#c9a45c",
    passScore: 75,
    suggestedAuth: "supervised_only",
    responsibilityFa: "ارائه قطعه به مشتری و اعلام قیمت شفاف تحت نظارت",
  },
  {
    id: "ops_desk",
    domainId: "operations",
    titleFa: "میز عملیات — Dual Control",
    roomFa: "گاوصندوق · دفتر ویترین · پنل هشدار",
    conditionFa: "باز کردن شعبه صبح؛ نفر دوم هنوز نرسیده است.",
    hazardFa: "باز کردن قفل تنها، رد کردن تست زنگ، ثبت ناقص ویترین.",
    jobRoles: ["cashier", "store_manager", "inventory", "sales_associate"],
    competencyId: "comp_security",
    toolIds: ["dual_key", "vitrine_log", "alarm_panel", "uv_lamp"],
    scene3d: "safe",
    accent: "#7a6848",
    passScore: 80,
    suggestedAuth: "supervised_only",
    responsibilityFa: "باز/بسته شعبه و جابه‌جایی ویترین با کنترل دوگانه",
  },
  {
    id: "craft_bench",
    domainId: "craft",
    titleFa: "میز ساخت — فرم و تلرانس",
    roomFa: "نیمکت ساخت · موم · کولیس · سوهان",
    conditionFa: "سفارش حلقه ۱۸عیار با نگین؛ تلرانس قطر ۰٫۲mm.",
    hazardFa: "تراش بیش از حد، نادیده گرفتن اندازه، پرش از موم به فلز.",
    jobRoles: ["designer", "repair_intake"],
    competencyId: "comp_craft",
    toolIds: ["wax_block", "caliper", "file_set", "studio_orbit", "loupe_10x"],
    scene3d: "bench",
    accent: "#b8954a",
    passScore: 78,
    suggestedAuth: "supervised_only",
    responsibilityFa: "ساخت/اصلاح فرم قطعه روی میز کار تحت نظارت استادکار",
  },
  {
    id: "melt_lab",
    domainId: "melt",
    titleFa: "آزمایشگاه ذوب",
    roomFa: "کوره · بوته · قالب · تهویه · PPE",
    conditionFa: "۱۲٫۴۰g طلای شکسته ۱۸k برای ریختن شمشچه؛ ناظر آماده است.",
    hazardFa: "ذوب بدون PPE، وزن ثبت‌نشده، ریختن تنها، تهویه خاموش.",
    jobRoles: ["gold_purchasing", "inventory", "back_office"],
    competencyId: "comp_melt",
    toolIds: ["ppe_kit", "scale_0_01", "crucible", "furnace", "ingot_mold"],
    scene3d: "furnace",
    accent: "#8a5a2b",
    passScore: 85,
    suggestedAuth: "supervised_only",
    responsibilityFa: "ذوب و ریختن تحت ناظر Dual Control با ثبت وزن",
  },
  {
    id: "ideation_studio",
    domainId: "ideation",
    titleFa: "استودیو ایده‌پردازی ۳D",
    roomFa: "اسکیس · اوربیت ۳D · سه واریانت ارائه",
    conditionFa: "محصول زنجیر ونیزا؛ مشتری هدیه عروسی می‌خواهد.",
    hazardFa: "یک ایده بدون واریانت، ارائه بدون زاویه، کپی بدون توجیه فروش.",
    jobRoles: ["ideator", "designer", "sales_associate"],
    competencyId: "comp_ideation",
    toolIds: ["sketch_pad", "studio_orbit", "wax_block", "tray_velvet"],
    scene3d: "studio",
    accent: "#d4af37",
    passScore: 72,
    suggestedAuth: "supervised_only",
    responsibilityFa: "ایده‌پردازی و ارائه ۳D برای فروش/ساخت",
  },
  {
    id: "market_desk",
    domainId: "volatility",
    titleFa: "میز نوسان نرخ",
    roomFa: "تابلو XAU/USD · برگه قیمت · اسپرد",
    conditionFa: "نرخ طلا +۱٫۸٪ در ۲۰ دقیقه؛ مشتری منتظر اعلام قیمت است.",
    hazardFa: "اعلام قیمت دیروز، قفل کردن بدون اسپرد، پنهان کردن نوسان.",
    jobRoles: ["sales_associate", "cashier", "accountant", "store_manager"],
    competencyId: "comp_pricing",
    toolIds: ["fx_board", "price_sheet", "spread_card"],
    scene3d: "ticker",
    accent: "#6b8f71",
    passScore: 80,
    suggestedAuth: "supervised_only",
    responsibilityFa: "اعلام قیمت زنده با شفافیت نوسان",
  },
  {
    id: "buy_desk",
    domainId: "trading",
    titleFa: "میز خرید طلا / معامله",
    roomFa: "محک · XRF · ترازو · برگه خرید · UV اسکناس",
    conditionFa: "فروشنده دست‌دوم با ۱۸g ادعایی ۲۱k؛ اسکناس درشت هم همراه دارد.",
    hazardFa: "خرید بدون محک، پرداخت قبل از Dual Control، پذیرش اسکناس جعل.",
    jobRoles: ["gold_purchasing", "store_manager", "accountant"],
    competencyId: "comp_trade",
    toolIds: ["scale_0_01", "acid_kit", "xrf_gun", "spread_card", "uv_lamp", "fx_board"],
    scene3d: "assay",
    accent: "#c9a24a",
    passScore: 85,
    suggestedAuth: "supervised_only",
    responsibilityFa: "خرید طلای دست‌دوم و صحت‌سنجی قبل از پرداخت",
  },
  {
    id: "qc_station",
    domainId: "quality",
    titleFa: "ایستگاه کنترل کیفیت",
    roomFa: "ذره‌بین · کولیس · کارت نقص · نور سرد",
    conditionFa: "قطعه تازه ساخت با لحیم مشکوک و تلرانس مرزی.",
    hazardFa: "قبول نقص بحرانی، رد سلیقه‌ای بدون مدرک، ثبت نکردن کد نقص.",
    jobRoles: ["designer", "repair_intake", "inventory", "store_manager"],
    competencyId: "comp_quality",
    toolIds: ["loupe_10x", "caliper", "defect_card", "scale_0_01", "acid_kit"],
    scene3d: "loupe",
    accent: "#5c7a8a",
    passScore: 82,
    suggestedAuth: "supervised_only",
    responsibilityFa: "قبول/رد/تعمیر قطعه قبل از ویترین",
  },
];

export const ROLE_TRIALS: RoleTrial[] = [
  {
    id: "trial_sales_consult",
    envId: "sales_floor",
    titleFa: "فروش مشورتی با بودجه محدود",
    briefFa: "مشتری برای هدیه آمده؛ بودجه مشخص است. از ابزار درست استفاده کنید و شفاف بفروشید.",
    estimatedMinutes: 12,
    difficulty: "intermediate",
    steps: [
      {
        id: "s1",
        kind: "select_tool",
        promptFa: "اولین ابزار درست برای نشان دادن حلقه چیست؟",
        options: [
          { id: "tray_velvet", labelFa: "سینی مخمل" },
          { id: "bare_hand", labelFa: "دست خالی روی شیشه" },
          { id: "pocket", labelFa: "از جیب ویترین بدون ثبت" },
        ],
        correctIds: ["tray_velvet"],
        points: 15,
        requiresToolId: "tray_velvet",
      },
      {
        id: "s2",
        kind: "decide",
        promptFa: "مشتری عیار را می‌پرسد اما روی قطعه مهر خوانا نیست. چه می‌کنید؟",
        options: [
          { id: "guess", labelFa: "۱۸ می‌گویم چون شبیه است" },
          { id: "loupe_check", labelFa: "با ذره‌بین مهر/سند را چک و صادقانه می‌گویم" },
          { id: "upsell", labelFa: "به قطعه گران‌تر بدون جواب عیار هل می‌دهم" },
        ],
        correctIds: ["loupe_check"],
        points: 20,
        requiresToolId: "loupe_10x",
      },
      {
        id: "s3",
        kind: "decide",
        promptFa: "نرخ لحظه‌ای کمی بالا رفته. اعلام قیمت چگونه باشد؟",
        options: [
          { id: "old", labelFa: "قیمت صبح را می‌گویم تا ببندم" },
          { id: "sheet", labelFa: "برگه شفافیت + نرخ فعلی + توضیح نوسان" },
          { id: "hide", labelFa: "فقط مبلغ نهایی بدون تجزیه" },
        ],
        correctIds: ["sheet"],
        points: 25,
        requiresToolId: "price_sheet",
      },
      {
        id: "s4",
        kind: "3d_inspect",
        promptFa: "در نمای ۳D قطعه، کدام زاویه برای ارائه هدیه مناسب‌تر است؟",
        options: [
          { id: "top", labelFa: "از بالا با نور روی نگین" },
          { id: "dark", labelFa: "پشت به نور تا ایراد دیده نشود" },
          { id: "spin_fast", labelFa: "چرخش سریع بدون توقف" },
        ],
        correctIds: ["top"],
        points: 20,
      },
      {
        id: "s5",
        kind: "decide",
        promptFa: "بودجه مشتری کمتر از قطعه ایده‌آل است.",
        options: [
          { id: "pressure", labelFa: "فشار برای خرید قسطی نامشخص" },
          { id: "two_opts", labelFa: "دو گزینه در بودجه + یک ارتقا شفاف" },
          { id: "shame", labelFa: "گفتن که بودجه کافی نیست و خداحافظی سرد" },
        ],
        correctIds: ["two_opts"],
        points: 20,
      },
    ],
  },
  {
    id: "trial_ops_open",
    envId: "ops_desk",
    titleFa: "باز کردن شعبه با Dual Control",
    briefFa: "صبح است. بدون نقض کنترل دوگانه شعبه را امن باز کنید.",
    estimatedMinutes: 10,
    difficulty: "intermediate",
    steps: [
      {
        id: "o1",
        kind: "decide",
        promptFa: "نفر دوم هنوز نیست. گاوصندوق اصلی؟",
        options: [
          { id: "alone", labelFa: "با کلید خودم باز می‌کنم" },
          { id: "wait", labelFa: "صبر / تماس برای Dual Control" },
          { id: "skip", labelFa: "ویترین فرعی را بدون ثبت باز می‌کنم" },
        ],
        correctIds: ["wait"],
        points: 25,
        requiresToolId: "dual_key",
      },
      {
        id: "o2",
        kind: "select_tool",
        promptFa: "قبل از باز کردن ویترین چه باید آماده باشد؟",
        options: [
          { id: "vitrine_log", labelFa: "دفتر ویترین برای امضای دو نفر" },
          { id: "music", labelFa: "فقط پخش موسیقی فروشگاه" },
          { id: "coffee", labelFa: "هیچ — مستقیم قطعه می‌چینم" },
        ],
        correctIds: ["vitrine_log"],
        points: 20,
        requiresToolId: "vitrine_log",
      },
      {
        id: "o3",
        kind: "dual_control",
        promptFa: "تست زنگ اضطراری؟",
        options: [
          { id: "skip_alarm", labelFa: "امروز رد می‌کنم" },
          { id: "test_alarm", labelFa: "تست پنل و ثبت در دفتر" },
          { id: "disable", labelFa: "زنگ را موقتاً خاموش می‌کنم" },
        ],
        correctIds: ["test_alarm"],
        points: 30,
        requiresToolId: "alarm_panel",
      },
      {
        id: "o4",
        kind: "decide",
        promptFa: "اسکناس درشت Verdacht — اقدام؟",
        options: [
          { id: "take", labelFa: "قبول بدون بررسی" },
          { id: "uv", labelFa: "لامپ UV + مغناطیس + پروتکل" },
          { id: "refuse_rude", labelFa: "رد تند بدون توضیح" },
        ],
        correctIds: ["uv"],
        points: 25,
        requiresToolId: "uv_lamp",
      },
    ],
  },
  {
    id: "trial_craft_ring",
    envId: "craft_bench",
    titleFa: "ساخت حلقه — موم تا تلرانس",
    briefFa: "فرم را روی موم بسازید، اندازه بگیرید، سپس در ۳D بازرسی کنید.",
    estimatedMinutes: 14,
    difficulty: "advanced",
    steps: [
      {
        id: "c1",
        kind: "select_tool",
        promptFa: "قبل از فلز، ابزار درست؟",
        options: [
          { id: "wax_block", labelFa: "بلوک موم" },
          { id: "furnace", labelFa: "کوره ذوب مستقیم" },
          { id: "acid_kit", labelFa: "اسید محک روی قطعه نهایی" },
        ],
        correctIds: ["wax_block"],
        points: 20,
        requiresToolId: "wax_block",
      },
      {
        id: "c2",
        kind: "measure",
        promptFa: "قطر داخلی هدف ۱۷٫۳mm با تلرانس ۰٫۲ — ۱۷٫۶ قابل قبول است؟",
        options: [
          { id: "yes", labelFa: "بله داخل تلرانس" },
          { id: "no", labelFa: "خیر خارج از تلرانس" },
          { id: "ignore", labelFa: "اندازه مهم نیست" },
        ],
        correctIds: ["no"],
        points: 25,
        requiresToolId: "caliper",
      },
      {
        id: "c3",
        kind: "3d_inspect",
        promptFa: "در مدل ۳D لبه تیز می‌بینید. اقدام؟",
        options: [
          { id: "ship", labelFa: "همان را برای ویترین می‌فرستم" },
          { id: "file", labelFa: "سوهان کنترل‌شده + بازرسی مجدد" },
          { id: "melt_all", labelFa: "کل قطعه را ذوب می‌کنم" },
        ],
        correctIds: ["file"],
        points: 25,
        requiresToolId: "file_set",
      },
      {
        id: "c4",
        kind: "decide",
        promptFa: "نشست نگین لق است.",
        options: [
          { id: "glue", labelFa: "چسب متفرقه و تحویل" },
          { id: "reseat", labelFa: "بازگردانی به ساخت / ثبت نقص" },
          { id: "hide", labelFa: "با زاویه نور پنهان می‌کنم" },
        ],
        correctIds: ["reseat"],
        points: 30,
      },
    ],
  },
  {
    id: "trial_melt_ingot",
    envId: "melt_lab",
    titleFa: "ذوب کنترل‌شده شمشچه",
    briefFa: "وزن، PPE، Dual Control و ریختن ایمن — بدون میانبر.",
    estimatedMinutes: 15,
    difficulty: "advanced",
    steps: [
      {
        id: "m1",
        kind: "select_tool",
        promptFa: "قبل از روشن کردن کوره؟",
        options: [
          { id: "ppe_kit", labelFa: "PPE کامل + تهویه" },
          { id: "skip_ppe", labelFa: "فقط دستکش نازک آشپزخانه" },
          { id: "open_door", labelFa: "در آزمایشگاه را برای خنکی باز می‌گذارم بدون تهویه" },
        ],
        correctIds: ["ppe_kit"],
        points: 20,
        requiresToolId: "ppe_kit",
      },
      {
        id: "m2",
        kind: "measure",
        promptFa: "وزن ورودی ۱۲٫۴۰g — قبل از ذوب؟",
        options: [
          { id: "weigh", labelFa: "توزین و ثبت با ناظر" },
          { id: "approx", labelFa: "تقریبی می‌گویم ۱۲ گرم" },
          { id: "after", labelFa: "فقط بعد از ذوب وزن می‌کنم" },
        ],
        correctIds: ["weigh"],
        points: 25,
        requiresToolId: "scale_0_01",
      },
      {
        id: "m3",
        kind: "dual_control",
        promptFa: "ناظر برای روشن کردن کوره؟",
        options: [
          { id: "solo", labelFa: "تنها روشن می‌کنم" },
          { id: "dual", labelFa: "تأیید ناظر + ثبت دما/زمان" },
          { id: "intern", labelFa: "کارآموز تازه‌کار به‌جای ناظر" },
        ],
        correctIds: ["dual"],
        points: 30,
        requiresToolId: "furnace",
      },
      {
        id: "m4",
        kind: "decide",
        promptFa: "ریختن در قالب؟",
        options: [
          { id: "pour", labelFa: "با بوته و قالب استاندارد + سپر" },
          { id: "floor", labelFa: "روی سینی فلزی روی زمین" },
          { id: "water", labelFa: "مستقیم در آب سرد برای سرعت" },
        ],
        correctIds: ["pour"],
        points: 25,
        requiresToolId: "ingot_mold",
      },
    ],
  },
  {
    id: "trial_ideate_gift",
    envId: "ideation_studio",
    titleFa: "ایده‌پردازی هدیه با ۳ واریانت ۳D",
    briefFa: "اسکیس، اوربیت ۳D، و انتخاب ارائه فروش.",
    estimatedMinutes: 12,
    difficulty: "intermediate",
    steps: [
      {
        id: "i1",
        kind: "select_tool",
        promptFa: "شروع ایده؟",
        options: [
          { id: "sketch_pad", labelFa: "سه اسکیس سریع" },
          { id: "one_shot", labelFa: "یک رندر نهایی بدون اسکیس" },
          { id: "copy", labelFa: "کپی اینستاگرام بدون تغییر" },
        ],
        correctIds: ["sketch_pad"],
        points: 20,
        requiresToolId: "sketch_pad",
      },
      {
        id: "i2",
        kind: "3d_inspect",
        promptFa: "در اوربیت ۳D چه را بررسی می‌کنید؟",
        options: [
          { id: "silhouette", labelFa: "خط کلی، تناسب، نقطه درخشش برای ارائه" },
          { id: "only_color", labelFa: "فقط رنگ پس‌زمینه" },
          { id: "ignore_3d", labelFa: "۳D لازم نیست" },
        ],
        correctIds: ["silhouette"],
        points: 25,
        requiresToolId: "studio_orbit",
      },
      {
        id: "i3",
        kind: "decide",
        promptFa: "سه واریانت آماده است. به فروشنده چه می‌دهید؟",
        options: [
          { id: "dump", labelFa: "۲۰ فایل بدون توضیح" },
          { id: "card", labelFa: "کارت ایده: مخاطب، تفاوت، جمله ارائه" },
          { id: "secret", labelFa: "نگه‌داشتن ایده‌ها برای خودم" },
        ],
        correctIds: ["card"],
        points: 30,
      },
      {
        id: "i4",
        kind: "decide",
        promptFa: "ارائه روی سینی برای عکس ویترین؟",
        options: [
          { id: "tray_velvet", labelFa: "سینی مخمل + نور کنترل" },
          { id: "messy", labelFa: "روی میز شلوغ انبار" },
          { id: "filter", labelFa: "فیلتر اغراق‌آمیز که رنگ طلا را عوض کند" },
        ],
        correctIds: ["tray_velvet"],
        points: 25,
        requiresToolId: "tray_velvet",
      },
    ],
  },
  {
    id: "trial_vol_spike",
    envId: "market_desk",
    titleFa: "واکنش به جهش نرخ",
    briefFa: "نرخ بالا آمده؛ قیمت را درست و شفاف اعلام کنید.",
    estimatedMinutes: 8,
    difficulty: "intermediate",
    steps: [
      {
        id: "v1",
        kind: "select_tool",
        promptFa: "اولین منبع حقیقت نرخ؟",
        options: [
          { id: "fx_board", labelFa: "تابلو نرخ لحظه‌ای شعبه" },
          { id: "memory", labelFa: "حافظه دیروز" },
          { id: "customer", labelFa: "عددی که مشتری در گروه دیده" },
        ],
        correctIds: ["fx_board"],
        points: 25,
        requiresToolId: "fx_board",
      },
      {
        id: "v2",
        kind: "price_react",
        promptFa: "+۱٫۸٪ در ۲۰ دقیقه — اقدام اعلام؟",
        options: [
          { id: "freeze_old", labelFa: "قفل قیمت صبح بدون اطلاع" },
          { id: "update_sheet", labelFa: "به‌روز کردن برگه + توضیح کوتاه نوسان" },
          { id: "panic", labelFa: "توقف فروش تا فردا" },
        ],
        correctIds: ["update_sheet"],
        points: 30,
        requiresToolId: "price_sheet",
      },
      {
        id: "v3",
        kind: "decide",
        promptFa: "اسپرد خرید/فروش شعبه؟",
        options: [
          { id: "zero", labelFa: "اسپرد صفر برای رقابت" },
          { id: "spread_card", labelFa: "رعایت کارت اسپرد مصوب" },
          { id: "random", labelFa: "هر بار عدد دلبخواه" },
        ],
        correctIds: ["spread_card"],
        points: 25,
        requiresToolId: "spread_card",
      },
      {
        id: "v4",
        kind: "document",
        promptFa: "ثبت در سیستم؟",
        options: [
          { id: "none", labelFa: "لازم نیست" },
          { id: "log", labelFa: "زمان نرخ، منبع، مبلغ اعلام‌شده" },
          { id: "fake", labelFa: "ثبت نرخ پایین‌تر برای آمار" },
        ],
        correctIds: ["log"],
        points: 20,
      },
    ],
  },
  {
    id: "trial_trade_buy",
    envId: "buy_desk",
    titleFa: "خرید دست‌دوم با محک و XRF",
    briefFa: "عیار، وزن، اسکناس و Dual Control قبل از پرداخت.",
    estimatedMinutes: 14,
    difficulty: "advanced",
    steps: [
      {
        id: "t1",
        kind: "measure",
        promptFa: "اولین کار؟",
        options: [
          { id: "pay", labelFa: "پرداخت تقریبی سریع" },
          { id: "weigh", labelFa: "توزین دقیق و ثبت" },
          { id: "melt_now", labelFa: "ذوب فوری بدون محک" },
        ],
        correctIds: ["weigh"],
        points: 20,
        requiresToolId: "scale_0_01",
      },
      {
        id: "t2",
        kind: "decide",
        promptFa: "ادعای ۲۱k — تأیید؟",
        options: [
          { id: "trust", labelFa: "حرف فروشنده کافی است" },
          { id: "assay", labelFa: "محک اسید + XRF و ثبت" },
          { id: "look", labelFa: "فقط رنگ زرد را می‌بینم" },
        ],
        correctIds: ["assay"],
        points: 30,
        requiresToolId: "xrf_gun",
      },
      {
        id: "t3",
        kind: "decide",
        promptFa: "اسکناس درشت همراه معامله؟",
        options: [
          { id: "uv", labelFa: "UV و پروتکل جعل" },
          { id: "ok", labelFa: "قبول بی‌چون‌وچرا" },
          { id: "reject_all", labelFa: "لغو کل خرید بدون توضیح" },
        ],
        correctIds: ["uv"],
        points: 20,
        requiresToolId: "uv_lamp",
      },
      {
        id: "t4",
        kind: "price_react",
        promptFa: "پیشنهاد خرید؟",
        options: [
          { id: "spread_card", labelFa: "بر اساس عیار واقعی + اسپرد مصوب" },
          { id: "retail", labelFa: "قیمت ویترین نو" },
          { id: "lowball", labelFa: "نصف بدون توضیح برگه" },
        ],
        correctIds: ["spread_card"],
        points: 30,
        requiresToolId: "spread_card",
      },
    ],
  },
  {
    id: "trial_qc_pass",
    envId: "qc_station",
    titleFa: "کنترل کیفیت قبل از ویترین",
    briefFa: "نقص را طبقه‌بندی و تصمیم قبول/رد/تعمیر بگیرید.",
    estimatedMinutes: 10,
    difficulty: "intermediate",
    steps: [
      {
        id: "q1",
        kind: "select_tool",
        promptFa: "بازرسی سطح لحیم؟",
        options: [
          { id: "loupe_10x", labelFa: "ذره‌بین ۱۰× با نور سرد" },
          { id: "naked", labelFa: "چشم غیرمسلح از دور" },
          { id: "phone", labelFa: "عکس موبایل با فیلتر زیبایی" },
        ],
        correctIds: ["loupe_10x"],
        points: 20,
        requiresToolId: "loupe_10x",
      },
      {
        id: "q2",
        kind: "measure",
        promptFa: "تلرانس اندازه مرزی است.",
        options: [
          { id: "caliper", labelFa: "کولیس + ثبت عدد" },
          { id: "feel", labelFa: "با انگشت حس می‌کنم" },
          { id: "skip", labelFa: "رد می‌کنم اندازه‌گیری را" },
        ],
        correctIds: ["caliper"],
        points: 25,
        requiresToolId: "caliper",
      },
      {
        id: "q3",
        kind: "decide",
        promptFa: "لحیم متخلخل روی نقطه تنش — کد نقص؟",
        options: [
          { id: "a_cosmetic", labelFa: "A ظاهری جزئی → قبول" },
          { id: "c_critical", labelFa: "C بحرانی → رد/تعمیر اجباری" },
          { id: "ignore", labelFa: "بدون کد به ویترین" },
        ],
        correctIds: ["c_critical"],
        points: 30,
        requiresToolId: "defect_card",
      },
      {
        id: "q4",
        kind: "3d_inspect",
        promptFa: "پس از تعمیر، تأیید نهایی؟",
        options: [
          { id: "reinspect", labelFa: "بازرسی مجدد ۳D/ذره‌بین + ثبت" },
          { id: "trust", labelFa: "حرف سازنده کافی است" },
          { id: "rush", labelFa: "عجله برای ویترین شب" },
        ],
        correctIds: ["reinspect"],
        points: 25,
      },
    ],
  },
];

export function envById(id: TrialEnvId): RoleEnvironment | undefined {
  return ROLE_ENVIRONMENTS.find((e) => e.id === id);
}

export function trialsForEnv(envId: TrialEnvId): RoleTrial[] {
  return ROLE_TRIALS.filter((t) => t.envId === envId);
}

export function toolsForEnv(envId: TrialEnvId): TrialTool[] {
  const env = envById(envId);
  if (!env) return TRIAL_TOOLS.filter((t) => t.envIds.includes(envId));
  return env.toolIds
    .map((id) => TRIAL_TOOLS.find((t) => t.id === id))
    .filter((t): t is TrialTool => Boolean(t));
}

export function trialById(id: string): RoleTrial | undefined {
  return ROLE_TRIALS.find((t) => t.id === id);
}

export function maxScore(trial: RoleTrial): number {
  return trial.steps.reduce((s, step) => s + step.points, 0);
}

export function scoreTrial(
  trial: RoleTrial,
  answers: Record<string, string[]>
): { score: number; max: number; percent: number; passed: boolean; missed: string[] } {
  const env = envById(trial.envId);
  const pass = env?.passScore ?? 75;
  let score = 0;
  const missed: string[] = [];
  for (const step of trial.steps) {
    const given = new Set(answers[step.id] ?? []);
    const ok =
      step.correctIds.length === given.size &&
      step.correctIds.every((id) => given.has(id));
    if (ok) score += step.points;
    else missed.push(step.id);
  }
  const max = maxScore(trial);
  const percent = max ? Math.round((score / max) * 100) : 0;
  return { score, max, percent, passed: percent >= pass, missed };
}
