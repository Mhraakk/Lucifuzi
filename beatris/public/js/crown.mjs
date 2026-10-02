// تاج — the house mark of «خانه سکه و شمش تاج». A minimal line crown standing on a gold bar (شمش), with a coin (سکه)
// for its jewel: the two things the house trades, drawn as one sign. Pure SVG string, shared by the header and invoices.
/** The house name, printed on the header, the invoice and the receipt unless the owner sets another. */
export const SHOP_NAME = 'خانه سکه و شمش تاج';
let n = 0;
export function crownSvg({ size = 88, ring = true, id = `tj${++n}`, cls = 'crown' } = {}) {
  const g = (k, a, b, c) => `<linearGradient id="${id}${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  // without the ring the mark is cropped to the crown itself, so small sizes (the header) stay legible
  return `<svg class="${cls}" viewBox="${ring ? '0 0 120 120' : '24 11 72 90'}" width="${size}" height="${size}" aria-hidden="true"><defs>${g('a', '#fff4d2', '#e6bd62', '#9a6a1c')}${g('b', '#f3d98f', '#c8963a', '#6e4b12')}${g('c', '#fffbea', '#f1d68c', '#b98a31')}</defs>
${ring ? `<circle cx="60" cy="60" r="56" fill="none" stroke="url(#${id}a)" stroke-width="1.1" opacity=".75"/><circle cx="60" cy="60" r="51" fill="none" stroke="url(#${id}a)" stroke-width=".4" opacity=".45" stroke-dasharray="1.2 3.4"/>` : ''}
<path class="tj-body" d="M31 79 L37 45 L50 63 L60 33 L70 63 L83 45 L89 79 Z" fill="url(#${id}a)" fill-opacity=".14" stroke="url(#${id}a)" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M38 72 H82" stroke="url(#${id}c)" stroke-width="1" stroke-linecap="round" opacity=".7"/>
<circle cx="37" cy="41" r="3.2" fill="url(#${id}c)"/><circle cx="83" cy="41" r="3.2" fill="url(#${id}c)"/>
<g class="tj-coin"><circle cx="60" cy="23" r="7.6" fill="url(#${id}c)"/><circle cx="60" cy="23" r="5" fill="none" stroke="#6e4b12" stroke-width=".8" opacity=".55"/></g>
<path class="tj-bar" d="M29 84 H91 L86 96 H34 Z" fill="url(#${id}b)"/><path d="M31.5 86.2 H88.5" stroke="#fff4d2" stroke-width="1" opacity=".6"/>
<path d="M57 90 L60 87.5 L63 90 L60 92.5 Z" fill="#fffbea" opacity=".9"/>
</svg>`;
}
