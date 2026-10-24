import { html } from '../core.mjs';
import { createViewer } from '../gl/viewer.mjs';
import { ringScene, gemScene } from '../gl/pieces.mjs';
import { fmt, ALLOYS } from '../calc.mjs';

export function mountModelBlock(stage, view) {
  if (view === 'gem') {
    const v = createViewer(stage, { pitch: 0.35, label: 'آناتومی برلیان' });
    const s = gemScene({ gemMm: 8 });
    v.setScene(s.items);
    v.setLabels(s.labels);
    return () => v.destroy();
  }
  // karat comparison
  const bar = document.createElement('div');
  bar.className = 'model-ctl';
  stage.after(bar);
  const v = createViewer(stage, { pitch: 0.3, label: 'مقایسه وزن یک انگشتر در آلیاژهای مختلف' });
  const list = ['au24', 'au22', 'au18y', 'au18r', 'au18w', 'au14y', 'ag925', 'pt950'].map((id) => ALLOYS.find((a) => a.id === id));
  let cur = 'au18y';
  const draw = () => {
    const s = ringScene({ alloy: cur, diameter: 54 / Math.PI, width: 5, thickness: 2 });
    v.setScene(s.items, { refit: false });
    bar.innerHTML = String(html`<div><b>${fmt(s.grams, 2)}</b> گرم <span class="small" style="color:var(--ink-2)">· حجم ${fmt(s.volume / 1000, 3)} سانتی‌متر مکعب</span></div>
      <div class="seg" role="group" aria-label="آلیاژ">${list.map((a) => html`<button data-alloy="${a.id}" aria-pressed="${a.id === cur}">${a.label}</button>`)}</div>`);
  };
  const first = ringScene({ alloy: cur, diameter: 54 / Math.PI, width: 5, thickness: 2 });
  v.setScene(first.items);
  draw();
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-alloy]');
    if (!b) return;
    cur = b.dataset.alloy;
    draw();
  });
  return () => {
    v.destroy();
    bar.remove();
  };
}
