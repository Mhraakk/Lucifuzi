// فضای کاری هر نقش (spec 0038): one shape of the app per person — where they start, what is pinned at hand, how dense
// the screen is. A profile never grants anything: permissions stay with the role (rbac), so a seller who picks «رئیس»
// gets the boss's layout with only what a seller may see. Shared by the server (validation) and the app (rendering).

/** The pins a profile may show, each a place in the app; `admin` ones show only to owners and managers. */
export const ACTIONS = {
  sell: { label: 'میز فروش', href: '/books/sell', hint: 'فروش، معاوضه و پرداخت در یک صفحه' },
  screen: { label: 'صفحه‌ی مشتری', href: '/books/sell/screen', hint: 'نمایشگر دوم، رو به مشتری', blank: true },
  desk: { label: 'میز معامله', href: '/books/desk', hint: 'آبشده، سکه، شمش و ارز با صفحه‌کلید' },
  new: { label: 'فاکتور جدید', href: '/books/new/sale', hint: 'فرم کامل فاکتور' },
  reserved: { label: 'رزروها', href: '/books/docs?type=proforma', hint: 'پیش‌فاکتورها و قطعه‌های کنار گذاشته' },
  parties: { label: 'مشتریان', href: '/books/parties', hint: 'پرونده و مانده‌ی هر مشتری' },
  products: { label: 'محصولات و موجودی', href: '/books/products', hint: 'ویترین، بارکد و موجودی' },
  day: { label: 'روزنگار', href: '/books/day', hint: 'هر رقم امروز، بخش‌به‌بخش' },
  find: { label: 'سرنخ‌یاب', href: '/books/find', hint: 'یک تکه نام یا رقم، و سند پیدا می‌شود' },
  trace: { label: 'رهگیری', href: '/books/trace', hint: 'کد رهگیری، اصالت یا پیگیری' },
  hawala: { label: 'حواله', href: '/books/desk?act=hawala', hint: 'از یک طرف حساب به دیگری' },
  cash: { label: 'صندوق و بانک', href: '/books/cash', hint: 'نقد، بانک و چک' },
  pulse: { label: 'نبض', href: '/books/pulse', hint: 'حال فروشگاه در یک نگاه' },
  dashboard: { label: 'داشبورد مدیریت', href: '/books/dashboard', hint: 'سود، موجودی و روند', admin: true },
  control: { label: 'کنترل', href: '/books/control', hint: 'تأییدها، استثناها و قفل دوره', admin: true },
  reports: { label: 'گزارش‌ها', href: '/books/reports', hint: 'سود و زیان، مالیات، خروجی', admin: true },
  team: { label: 'تیم', href: '/staff', hint: 'همکاران، حضور و آموزش', admin: true },
  learn: { label: 'آموزش', href: '/learn', hint: 'دوره‌ها و درس بعدی' },
  practice: { label: 'تمرین', href: '/practice', hint: 'سناریو، کارت مرور و تمرین سرعت' },
  tools: { label: 'ابزار', href: '/tools', hint: 'ماشین‌حساب‌ها و بازرسی' },
  market: { label: 'بازار', href: '/market', hint: 'قیمت طلا، سکه و ارز' },
  studio: { label: 'استودیو', href: '/studio', hint: 'طراحی سه‌بعدی جواهر' },
};

/** The four ways of working. `start` is where sign-in lands; `/work` is each profile's own home. */
export const PROFILES = {
  boss: { label: 'رئیس', note: 'نبض فروشگاه، تأییدها، استثناها و فروش امروز در یک نگاه', start: '/work', pins: ['pulse', 'dashboard', 'control', 'reports', 'sell', 'day', 'team'] },
  operator: { label: 'اپراتور', note: 'میز معامله با صفحه‌کلید، ورود تک‌خطی و صف ارسال؛ صفحه‌ی فشرده', start: '/books/desk', pins: ['desk', 'day', 'find', 'trace', 'hawala', 'parties', 'cash'] },
  seller: { label: 'فروشنده', note: 'میز فروش زنده، رزروها و مشتری‌های امروز', start: '/books/sell', pins: ['sell', 'screen', 'parties', 'products', 'reserved', 'trace'] },
  staff: { label: 'کارمند', note: 'آموزش، تمرین، ابزار و دستورالعمل‌ها', start: '/', pins: ['learn', 'practice', 'tools', 'market', 'studio'] },
};
export const DEFAULT_BY_ROLE = { owner: 'boss', manager: 'boss', employee: 'seller', trainer: 'staff' };
export const DENSITIES = { comfort: 'راحت', compact: 'فشرده' };
export const MAX_PINS = 8;

/** A person's workspace as it applies: their choices where valid, the role's defaults for the rest. */
export function normalizeWorkspace(raw, role) {
  const w = raw && typeof raw === 'object' ? raw : {};
  const profile = PROFILES[w.profile] ? w.profile : (DEFAULT_BY_ROLE[role] ?? 'staff');
  const density = DENSITIES[w.density] ? w.density : profile === 'operator' ? 'compact' : 'comfort';
  const pins = [...new Set((Array.isArray(w.pins) ? w.pins : PROFILES[profile].pins).filter((k) => ACTIONS[k]))].slice(0, MAX_PINS);
  return { profile, density, pins, start: PROFILES[profile].start, chosen: !!PROFILES[w.profile] };
}

/** What a body may set: a known profile, a known density, up to eight known pins. Throws a Persian sentence. */
export function cleanWorkspace(body) {
  const out = {};
  if (body.profile !== undefined) {
    if (body.profile !== null && !PROFILES[body.profile]) throw new Error('نیمرخ کاری نامعتبر است.');
    out.profile = body.profile;
  }
  if (body.density !== undefined) {
    if (!DENSITIES[body.density]) throw new Error('تراکم صفحه نامعتبر است.');
    out.density = body.density;
  }
  if (body.pins !== undefined) {
    if (!Array.isArray(body.pins) || body.pins.some((k) => !ACTIONS[k])) throw new Error('میان‌بر نامعتبر است.');
    if (new Set(body.pins).size > MAX_PINS) throw new Error(`حداکثر ${MAX_PINS} میان‌بر.`);
    out.pins = [...new Set(body.pins)];
  }
  return out;
}

/** The pins this person may actually open (admin-only places drop out for staff, whatever they pinned). */
export const reachable = (pins, { admin = false } = {}) => pins.filter((k) => ACTIONS[k] && (!ACTIONS[k].admin || admin));
