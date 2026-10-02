// «نصب اپ» (the web app): Beatris installs itself as an app on phones, tablets and computers straight from the
// browser (PWA: own window and icon, opens at the shop, updates on its own). Chrome, Edge and Android offer a real
// install prompt, kept here until the user asks; Safari on iPhone/iPad and Firefox get a short how-to instead.
import { html } from './core.mjs';
import { modal } from './bk.mjs';

let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
export const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
const ua = () => navigator.userAgent;
const isIOS = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isWindows = () => /Windows NT/i.test(ua());

let wired = false;
export function initInstall() {
  if (wired) return;
  wired = true;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}
/** Something useful can happen when the user asks to install here. */
export const canInstall = () => !standalone();
export const onInstallChange = (f) => (subs.add(f), () => subs.delete(f));
export const nativePrompt = () => !!deferred;

export async function install() {
  if (deferred) {
    const e = deferred;
    deferred = null;
    e.prompt();
    const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
    notify();
    if (r.outcome === 'accepted') return 'accepted';
  }
  guide();
  return 'guide';
}

function guide() {
  const steps = isIOS()
    ? ['در Safari دکمه «اشتراک‌گذاری» (مربع با فلش رو به بالا) را بزنید.', '«Add to Home Screen / افزودن به صفحه اصلی» را انتخاب کنید.', '«Add / افزودن» را بزنید؛ آیکن بئاتریس روی صفحه اصلی می‌آید و مثل اپ باز می‌شود.']
    : /Android/i.test(ua())
      ? ['در Chrome منوی ⋮ (بالای صفحه) را باز کنید.', '«Install app / نصب برنامه» یا «Add to Home screen» را بزنید.', 'آیکن بئاتریس در صفحه اصلی و فهرست برنامه‌ها می‌آید.']
      : ['در Chrome یا Edge، آیکن «نصب» (صفحه با فلش) را در انتهای نوار نشانی بزنید؛ یا از منوی ⋮ ← «Apps / Install Beatris».', 'بئاتریس در پنجره خودش باز می‌شود و در منوی استارت، نوار وظیفه و دسکتاپ می‌ماند.'];
  modal(String(html`<div class="ins" dir="rtl"><h3 class="bk-h">نصب بئاتریس روی همین دستگاه</h3>
    <p class="small">نسخه وب‌اپ: پنجره و آیکن جدا، باز شدن مستقیم روی فروشگاه، به‌روزرسانی خودکار؛ همان حساب و همان داده‌ها روی گوشی و کامپیوتر.</p>
    <ol>${steps.map((s) => html`<li>${s}</li>`)}</ol>
    ${isWindows() ? html`<p class="small">یا نصب‌کننده ویندوز ۱۱: <a href="/downloads/Beatris-Setup-x64.exe" download>Beatris-Setup-x64.exe</a></p>` : ''}
    <div class="actions"><button class="btn ghost" data-close>باشه</button></div></div>`));
}
