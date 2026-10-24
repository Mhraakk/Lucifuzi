// امضای مشتری (spec 0040): the customer signs a final document with a finger, a pen or the mouse. Only the finished
// picture is sent; the server keeps it beside the document and logs its hash, and the print shows it in the customer's box.
import { html, api, toast } from './core.mjs';
import { modal } from './dialog.mjs';
import { signaturePad } from './blocks.mjs';

/** Opens the signing dialog for a final document; resolves the saved signature, or null when it closes unsaved. */
export const signDoc = (id, { replace = false } = {}) =>
  new Promise((resolve) => {
    let saved = null;
    let pad = null;
    modal(
      String(html`<h3 class="bk-h">امضای مشتری</h3>
        <p class="small">${replace ? 'امضای تازه جای امضای فعلی را در چاپ می‌گیرد؛ هر دو در دفتر رویداد می‌مانند.' : 'مشتری در کادر زیر با انگشت، قلم یا ماوس امضا می‌کند. امضا کنار سند می‌ماند و در چاپ می‌آید.'}</p>
        <div class="u-sign"><div class="u-sign-line"><canvas data-sign-pad aria-label="کادر امضای مشتری؛ با انگشت، قلم یا ماوس امضا کنید"></canvas></div>
          <div class="actions"><button class="btn" data-sign-save disabled>ثبت امضا</button><button class="btn ghost" data-sign-clear disabled>پاک کردن</button><button class="btn ghost" data-close>انصراف</button></div></div>`),
      (m, close) => {
        const save = m.querySelector('[data-sign-save]');
        const clear = m.querySelector('[data-sign-clear]');
        pad = signaturePad(m.querySelector('[data-sign-pad]'), {
          onChange: (n) => {
            save.disabled = clear.disabled = !n;
          },
        });
        clear.addEventListener('click', () => pad.clear());
        save.addEventListener('click', async () => {
          const png = pad.toPNG();
          if (!png) return;
          save.disabled = true;
          try {
            saved = (await api(`/api/books/docs/${id}/signature`, { method: 'PUT', body: { png } })).signature;
            toast('امضای مشتری کنار سند ثبت شد.', 'ok');
            close();
          } catch (e) {
            toast(e.message, 'error');
            save.disabled = false;
          }
        });
      },
      () => {
        pad?.destroy();
        resolve(saved);
      },
    );
  });
