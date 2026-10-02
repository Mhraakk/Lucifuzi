// شیره (spec 0019): on a phone, the selected tab is a drop of gold that flows to the next tab instead of jumping.
// Two drops, a quick head and a slow tail, sit under an SVG "goo" filter (blur, then a hard alpha threshold), so while
// they are apart a liquid bridge joins them and when they meet they merge back into one. The tab bar is re-drawn on
// every route, so the drop lives outside it in a module variable and remembers where it was.
let from = null;
let defs = false;

function ensureFilter() {
  if (defs || document.getElementById('gooFx')) return (defs = true);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><filter id="gooFx" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter></defs></svg>',
  );
  defs = true;
}

/** Place (and, from the last place, flow) the drop under the current tab of `nav`. */
export function gooTabs(nav, { jump = false } = {}) {
  if (!nav || nav.hidden) return;
  if (jump) from = null;
  ensureFilter();
  const cur = nav.querySelector('a[aria-current="page"]');
  let layer = nav.querySelector(':scope > .goo');
  if (!layer) {
    layer = document.createElement('span');
    layer.className = 'goo';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<b class="goo-head"></b><b class="goo-tail"></b>';
    nav.prepend(layer);
  }
  if (!cur) return void (layer.hidden = true);
  layer.hidden = false;
  const nr = nav.getBoundingClientRect();
  const r = cur.getBoundingClientRect();
  const to = { x: r.left - nr.left + r.width / 2, y: r.top - nr.top + r.height / 2, w: r.width, h: r.height };
  const place = (el, p) => {
    el.style.setProperty('--x', `${p.x}px`);
    el.style.setProperty('--y', `${p.y}px`);
    el.style.setProperty('--w', `${p.w}px`);
    el.style.setProperty('--h', `${p.h}px`);
  };
  const [head, tail] = layer.children;
  if (from && (from.x !== to.x || from.y !== to.y)) {
    layer.classList.add('still');
    place(head, from);
    place(tail, from);
    void layer.offsetWidth; // commit the old place before flowing
    layer.classList.remove('still');
  }
  place(head, to);
  place(tail, to);
  from = to;
}
