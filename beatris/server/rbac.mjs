// Roles → capabilities (spec 0001 #4): one table that says who may do what. Row-level isolation between shops is
// stronger than RLS here: every shop has its own database file, and a session token only opens its own shop.
// `vendor` capabilities exist only for the owner of the main shop.
import { ROLES, STAFF_ROLES, ADMIN_ROLES } from './auth.mjs';

export const CAPS = {
  'books.use': 'کار با دفاتر: میز معامله، روزنگار، مشتریان، گاوصندوق',
  'books.admin': 'گزارش‌ها، تنظیمات، رویدادها، داشبورد مدیریت، بازپخش دفتر',
  'staff.view': 'تیم، صف کف فروشگاه، تکلیف آموزشی',
  'ai.keys': 'کلیدهای هوش مصنوعی فروشگاه',
  'peers.manage': 'تطبیق با همکار',
  'vendor.console': 'کنسول ارائه‌دهنده: فروشگاه‌ها و حساب‌ها',
  'ops.view': 'عملیات: سلامت، متریک، صف، پشتیبان، پرچم‌ها',
};

const VENDOR_CAPS = new Set(['vendor.console', 'ops.view']);

/** Capabilities of a role; vendor ones only in the main shop. */
export function capsOf(role, { main = false } = {}) {
  if (!ROLES.includes(role)) return [];
  const out = ['books.use'];
  if (STAFF_ROLES.has(role)) out.push('staff.view');
  if (ADMIN_ROLES.has(role)) out.push('books.admin', 'ai.keys', 'peers.manage');
  if (main && role === 'owner') out.push(...VENDOR_CAPS);
  return out;
}
export const can = (user, cap, opts = {}) => !!user && user.active !== 0 && capsOf(user.role, opts).includes(cap);
