// کدینگ حساب‌های فروشگاه طلا (spec 0015): the chart of accounts of the training kernel. Every account has a type, a
// normal side and what it carries: money (rial, integer), a weight of gold (grams + fineness → fine 750-equivalent)
// or a count of coins. The tutor, the auditor and the scenarios speak in these codes; nothing else is postable.

/** type: asset | liability | equity | revenue | contra | expense. normal: the side that increases it. */
export const ACCOUNTS = [
  { code: '1110', fa: 'صندوق', type: 'asset', normal: 'dr', tag: 'cash' },
  { code: '1120', fa: 'بانک', type: 'asset', normal: 'dr', tag: 'bank' },
  { code: '1210', fa: 'حساب‌های دریافتنی مشتریان', type: 'asset', normal: 'dr', tag: 'receivable', party: 'customer' },
  { code: '1220', fa: 'پیش‌پرداخت به تأمین‌کنندگان', type: 'asset', normal: 'dr', tag: 'prepaid', party: 'supplier' },
  { code: '1310', fa: 'موجودی طلای آبشده', type: 'asset', normal: 'dr', tag: 'inventory', measure: 'weight' },
  { code: '1320', fa: 'موجودی مصنوعات طلا', type: 'asset', normal: 'dr', tag: 'inventory', measure: 'weight' },
  { code: '1330', fa: 'موجودی سکه', type: 'asset', normal: 'dr', tag: 'inventory', measure: 'count' },
  { code: '2110', fa: 'حساب‌های پرداختنی تأمین‌کنندگان', type: 'liability', normal: 'cr', tag: 'payable', party: 'supplier' },
  { code: '2120', fa: 'پیش‌دریافت از مشتریان', type: 'liability', normal: 'cr', tag: 'deposit', party: 'customer' },
  { code: '2130', fa: 'مالیات بر ارزش افزوده پرداختنی', type: 'liability', normal: 'cr', tag: 'tax' },
  { code: '2140', fa: 'کمیسیون پرداختنی', type: 'liability', normal: 'cr', tag: 'commission' },
  { code: '2210', fa: 'بدهی وزنی به مشتریان (امانی)', type: 'liability', normal: 'cr', tag: 'gold-deposit', party: 'customer', unit: 'G750' },
  { code: '1350', fa: 'طلای امانی نزد ما', type: 'asset', normal: 'dr', tag: 'gold-held', unit: 'G750' },
  { code: '3100', fa: 'سرمایه', type: 'equity', normal: 'cr', tag: 'capital' },
  { code: '3200', fa: 'سود (زیان) انباشته', type: 'equity', normal: 'cr', tag: 'retained' },
  { code: '4110', fa: 'فروش طلا (ارزش طلا)', type: 'revenue', normal: 'cr', tag: 'sales' },
  { code: '4120', fa: 'درآمد اجرت ساخت', type: 'revenue', normal: 'cr', tag: 'making' },
  { code: '4130', fa: 'درآمد سود فروش', type: 'revenue', normal: 'cr', tag: 'profit' },
  { code: '4140', fa: 'درآمد حق‌العمل (کمیسیون)', type: 'revenue', normal: 'cr', tag: 'commission-income' },
  { code: '4910', fa: 'اضافه صندوق', type: 'revenue', normal: 'cr', tag: 'overage' },
  { code: '4180', fa: 'برگشت از فروش', type: 'contra', normal: 'dr', tag: 'returns' },
  { code: '4190', fa: 'تخفیفات فروش', type: 'contra', normal: 'dr', tag: 'discount' },
  { code: '5110', fa: 'بهای تمام‌شده طلای فروش‌رفته', type: 'expense', normal: 'dr', tag: 'cogs' },
  { code: '6110', fa: 'هزینه کمیسیون', type: 'expense', normal: 'dr', tag: 'commission-expense' },
  { code: '6120', fa: 'کسری صندوق', type: 'expense', normal: 'dr', tag: 'shortage' },
  { code: '6130', fa: 'زیان مغایرت وزن و عیار', type: 'expense', normal: 'dr', tag: 'gold-loss' },
  { code: '6190', fa: 'هزینه‌های عمومی', type: 'expense', normal: 'dr', tag: 'general' },
];

export const ACCOUNT = Object.fromEntries(ACCOUNTS.map((a) => [a.code, { unit: 'IRR', ...a }]));
export const byTag = (tag) => ACCOUNTS.find((a) => a.tag === tag)?.code;
export const accountName = (code) => ACCOUNT[code]?.fa ?? code;
/** Accounts whose balance rolls into the result of the period (closed to 3200 at period end). */
export const TEMPORARY = new Set(ACCOUNTS.filter((a) => ['revenue', 'contra', 'expense'].includes(a.type)).map((a) => a.code));
export const TYPE_FA = { asset: 'دارایی', liability: 'بدهی', equity: 'سرمایه', revenue: 'درآمد', contra: 'کاهنده درآمد', expense: 'هزینه' };
