// Feature flags (spec 0001 #19): each risky or optional capability can be switched off for everyone or for one shop
// by the vendor, without a deploy. Stored in the main database (settings key «flags»): { all: {k: bool}, shops: {id: {k: bool}} }.
// Resolution: shop override → global override → default.

export const FLAGS = {
  'ai.external': { label: 'دستیار با سرویس‌های بیرونی (کلیدهای فروشگاه)', default: true },
  'ai.knowledge': { label: 'جستجو در راهنما برای دستیار', default: true },
  peers: { label: 'تطبیق با همکار', default: true },
  'market.stream': { label: 'قیمت زنده (جریان رویداد)', default: true },
  'books.replay': { label: 'بازپخش و وارسی دفتر', default: true },
};

export function createFlags({ db, clock = () => new Date() }) {
  let cache = null;
  const read = () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(db.get("SELECT value_json FROM settings WHERE key='flags'")?.value_json ?? '{}');
    } catch {
      cache = {};
    }
    cache.all ??= {};
    cache.shops ??= {};
    return cache;
  };
  /** Every flag's value for one shop. */
  function forShop(shop) {
    const s = read();
    return Object.fromEntries(Object.entries(FLAGS).map(([k, f]) => [k, s.shops[shop]?.[k] ?? s.all[k] ?? f.default]));
  }
  const on = (shop, key) => forShop(shop)[key] !== false;
  /** scope: 'all' or a shop id; value: true / false / null (= back to the default). */
  function set(scope, key, value, by = null) {
    if (!FLAGS[key]) throw new Error('پرچم ناشناخته است.');
    if (value !== null && typeof value !== 'boolean') throw new Error('مقدار پرچم باید روشن، خاموش یا پیش‌فرض باشد.');
    const s = structuredClone(read());
    const target = scope === 'all' ? s.all : (s.shops[scope] ??= {});
    if (value === null) delete target[key];
    else target[key] = value;
    if (scope !== 'all' && !Object.keys(s.shops[scope]).length) delete s.shops[scope];
    db.run('INSERT INTO settings(key,value_json,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by', 'flags', JSON.stringify(s), clock().toISOString(), by);
    cache = s;
    return s;
  }
  const list = () => ({ flags: Object.entries(FLAGS).map(([key, f]) => ({ key, label: f.label, default: f.default })), ...structuredClone(read()) });
  return { forShop, on, set, list };
}
