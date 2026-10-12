// «یک زنجیره، پنج بخش» (spec 0028): the app's one idea drawn as a machine with the anatomy kit. A press on the right
// stamps every event as a numbered link with its code; the links run on one track; each link sends a coin down a
// sorting chute into the drawer of every section it touches (آبشده، سکه، شمش، ارز، وجه); a dial on the left reads how
// many links verify. The numbers come from onechain-model.mjs: the trade engine, sectionsOf and the log's SHA-256 rule.
// The scene is built once; only the links, the coins, the press, the counters and the needle move.
import * as k from '../../vendor/anatomy/iso-kit.mjs';
import { DRAWERS, exampleDocs, chainOf, verify, tamper, drawerCounts, browserSha } from './onechain-model.mjs';

const W = 640, H = 330;
const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const NAME = Object.fromEntries(DRAWERS);

/* ---------------- the world (units ≈ 1 px of the real thing; x along the bench, y toward you, z up) ---------------- */
const PLATE = { x: -170, y: -44, w: 340, d: 92, r: 8 };
const PLATE_H = 8, FOOT_H = 5;
const BODY_H = 40, TOP_Z = 43; // cabinets stand 40 tall, the bench top is 3 thick
const PED_L = { x: -152, y: -24, w: 52, d: 48, r: 2 };
const CAB = { x: -98, y: -24, w: 196, d: 48, r: 2 };
const PED_R = { x: 100, y: -24, w: 52, d: 48, r: 2 };
const BENCH = { x: -154, y: -26, w: 308, d: 52, r: 3 };
const DRAWER = 38, drawerX = (i) => 76 - i * DRAWER; // drawer i = 0 (آبشده) … 4 (وجه), right to left
const FRONT_Y = CAB.y + CAB.d; // the cabinet's front face
const PITCH = 32, linkX = (p) => 114 - p * PITCH; // a link at place p: 0 under the press … 7 at the far end
const TRACK_Y = -11, CHUTE_Y = 10;
const LINK_Z = TOP_Z + 1.4, LINK_H = 3, LINK_TOP = LINK_Z + LINK_H;
const PRESS = [114, TRACK_Y], COLUMN = [134, -17];
const DIE_R = 5, DIE_REST = LINK_TOP + 7, DIE_DOWN = LINK_TOP + 0.2, ARM_Z = 84;
const GAUGE = [-127, 8], GAUGE_R = 12, GAUGE_Z = TOP_Z + 4, GAUGE_TOP = GAUGE_Z + 6;
const DIAL_FROM = -0.75 * Math.PI, DIAL_SPAN = 1.5 * Math.PI;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [COLUMN[0], COLUMN[1], ARM_Z + 10], [PED_R.x + PED_R.w, PED_R.y, ARM_Z + 8], [PLATE.x, PLATE.y + PLATE.d, 0]],
  W,
  H,
  { pad: 22, azimuth: 58 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
/** A closed rectangle in the vertical plane y (the face of a drawer), from x0..x1 and z0..z1. */
const faceRect = (x0, x1, z0, z1, y) => k.pathOf([at([x0, y, z0]), at([x1, y, z0]), at([x1, y, z1]), at([x0, y, z1])], true);
const faceLine = (x0, x1, z, y) => k.pathOf([at([x0, y, z]), at([x1, y, z])]);
const faceText = (x, z, y, text, size, tone, cls = '') => `<text class="iso-face-text${cls ? ` ${cls}` : ''}" data-tone="${tone}" transform="${k.sideMatrix([x, y], z, P, 'left')}" font-size="${size}" text-anchor="middle">${text}</text>`;
const topText = (x, y, z, text, size, tone, cls = '') => `<text class="iso-face-text${cls ? ` ${cls}` : ''}" data-tone="${tone}" transform="${k.topMatrix([x, y], z, P, 'x')}" font-size="${size}" text-anchor="middle">${text}</text>`;

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // the ruler under the chain: a major tick at every place a link can stand
  const strip = { x: linkX(7) - 8, y: PLATE.y + PLATE.d - 12, w: linkX(0) - linkX(7) + 16, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(linkX(7), linkX(0), PITCH / 4, 4, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 2.4, strip.y + 3, 0.6]), at([strip.x + strip.w - 2.4, strip.y + 3, 0.6])], { size: 0.45 }));
  // the maker's plate, front left
  const label = { x: PLATE.x + 14, y: PLATE.y + PLATE.d - 16, w: 30, d: 10, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: 'lo', crease: 'none' }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P), { tone: 'faint' }));
  out.push(...[[6, 24, 3.4], [6, 20, 5.2], [6, 16, 7]].map(([x0, x1, y]) => L(k.lineOnTop([label.x + x0, label.y + y], [label.x + x1, label.y + y], 0.8, P), { tone: 'lo', free: true })));
  out.push(D([at([label.x + 2.6, label.y + 5, 0.8]), at([label.x + label.w - 2.6, label.y + 5, 0.8])], { size: 0.4 }));
  return out.join('');
}

/** A pedestal or the cabinet body: a box on a recessed plinth, a seam under the top, screws at its front corners. */
function body(plan, tone = 'mid') {
  const out = [S(k.slabOf(k.insetPlan(plan, 1.6), 0, 3, P, 3), { tone: 'lo' })];
  out.push(S(k.slabOf(plan, 3, BODY_H - 3, P, 3, 0.6), { tone, inner: L(k.sideSeam(plan, BODY_H - 4, P, 3), { tone: 'faint' }) }));
  return out.join('');
}

/** The front of drawer i: the plate, its pull, the label card with the section's name and the counter window. */
function drawerFront(i) {
  const [key, name] = DRAWERS[i];
  const cx = drawerX(i), y = FRONT_Y + 1.4;
  const plan = { x: cx - 17.4, y: FRONT_Y, w: 34.8, d: 1.4, r: 0.8 };
  const out = [`<g class="oc-drawer" data-sec="${key}">`];
  out.push(S(k.slabOf(plan, 4, 32, P, 2, 0.4), { tone: 'mid', className: 'oc-front' }));
  // label holder and card
  out.push(L(faceRect(cx - 11, cx + 11, 26, 33, y), { tone: 'lo' }));
  out.push(L(faceRect(cx - 10, cx + 10, 26.8, 32.2, y), { tone: 'faint' }));
  out.push(faceText(cx, 28.2, y, name, 4.4, 'hi', 'oc-name'));
  out.push(D([at([cx - 12.6, y, 29.5]), at([cx + 12.6, y, 29.5])], { size: 0.4 }));
  // the counter: a recessed window with the number of documents in this drawer
  out.push(L(faceRect(cx - 5.2, cx + 5.2, 17.4, 23.6, y), { tone: 'mid' }));
  out.push(L(faceRect(cx - 4.4, cx + 4.4, 18.1, 22.9, y - 0.6), { tone: 'faint' }));
  out.push(faceText(cx, 19.1, y, '۰', 4.6, 'hi', 'oc-count'));
  // the pull: two posts and a bar
  for (const dx of [-7, 7]) out.push(S(k.slabOf({ x: cx + dx - 0.8, y: FRONT_Y + 1.4, w: 1.6, d: 2.2, r: 0.4 }, 10.6, 2.4, P, 2), { tone: 'mid', crease: 'none' }));
  out.push(S(k.slabOf({ x: cx - 8.4, y: FRONT_Y + 3.6, w: 16.8, d: 1.4, r: 0.7 }, 10.2, 3.2, P, 3, 0.3), { tone: 'mid' }));
  out.push('</g>');
  return out.join('');
}

function cabinetry() {
  const out = [body(PED_L), body(CAB), body(PED_R)];
  for (let i = DRAWERS.length - 1; i >= 0; i--) out.push(drawerFront(i)); // far (left) to near (right)
  // the pedestals' fronts: a ventilation slot row on the left, a label plate on the right
  out.push(L([0, 1, 2].map((n) => faceRect(PED_L.x + 12 + n * 10, PED_L.x + 19 + n * 10, 12, 30, FRONT_Y)).join(''), { tone: 'lo' }));
  out.push(L(faceRect(PED_R.x + 10, PED_R.x + 42, 18, 30, FRONT_Y), { tone: 'lo' }));
  out.push(...[[14, 36, 26.4], [14, 30, 23.4], [14, 33, 20.4]].map(([x0, x1, z]) => L(faceLine(PED_R.x + x0, PED_R.x + x1, z, FRONT_Y), { tone: 'faint', free: true })));
  out.push(D([at([PED_R.x + 12, FRONT_Y, 28.4]), at([PED_R.x + 40, FRONT_Y, 28.4])], { size: 0.4 }));
  // the bench top over all three
  out.push(S(k.slabOf(BENCH, BODY_H, TOP_Z - BODY_H, P, 4, 0.6), { tone: 'mid' }));
  out.push(D(k.corners(BENCH, 4).map(([x, y]) => at([x, y, TOP_Z])), { size: 0.45 }));
  return out.join('');
}

/** The track (back) and the sorting chute (front), each a base strip between two lips; the chute has five slots. */
const TRACK = { x: linkX(7) - 22, y: TRACK_Y - 9, w: linkX(0) - linkX(7) + 36, d: 18, r: 1.4 };
const CHUTE = { x: drawerX(4) - 22, y: CHUTE_Y - 5, w: PRESS[0] - drawerX(4) + 26, d: 10, r: 1.4 };
const lip = (plan, y, d) => ({ x: plan.x, y, w: plan.w, d, r: 0.6 });
function railsBack() {
  const out = [S(k.slabOf(TRACK, TOP_Z, 1.4, P, 3), { tone: 'lo', crease: 'none' })];
  out.push(S(k.slabOf(lip(TRACK, TRACK.y - 1.6, 1.6), TOP_Z, 4.4, P, 2, 0.3), { tone: 'mid' }));
  out.push(L(k.lineOnTop([TRACK.x + 2, TRACK_Y], [TRACK.x + TRACK.w - 2, TRACK_Y], TOP_Z + 1.4, P), { tone: 'faint' }));
  out.push(S(k.slabOf(CHUTE, TOP_Z, 1.2, P, 3), { tone: 'lo', crease: 'none' }));
  out.push(S(k.slabOf(lip(CHUTE, CHUTE.y - 1.4, 1.4), TOP_Z, 3.6, P, 2, 0.3), { tone: 'mid' }));
  for (let i = 0; i < DRAWERS.length; i++) {
    const slot = { x: drawerX(i) - 5.5, y: CHUTE_Y - 3, w: 11, d: 6, r: 2.6 };
    out.push(S(k.slabOf(slot, TOP_Z + 1.2, 0.01, P, 4), { tone: 'lo', flat: true, className: 'oc-slot' }));
    out.push(L(k.planOutline(k.insetPlan(slot, 0.8), TOP_Z + 1.2, P, 4), { tone: 'faint' }));
  }
  return out.join('');
}
function railsFront() {
  const out = [S(k.slabOf(lip(TRACK, TRACK.y + TRACK.d, 1.6), TOP_Z, 4.4, P, 2, 0.3), { tone: 'mid' })];
  out.push(S(k.slabOf(lip(CHUTE, CHUTE.y + CHUTE.d, 1.4), TOP_Z, 3.6, P, 2, 0.3), { tone: 'mid' }));
  // end stops: the chain's far end on the left, the chute's end on the left
  out.push(S(k.slabOf({ x: TRACK.x - 3, y: TRACK.y - 1.6, w: 3, d: TRACK.d + 3.2, r: 0.8 }, TOP_Z, 7, P, 2, 0.4), { tone: 'mid' }));
  out.push(D([at([TRACK.x - 1.5, TRACK_Y - 5, TOP_Z + 7]), at([TRACK.x - 1.5, TRACK_Y + 5, TOP_Z + 7])], { size: 0.4 }));
  out.push(S(k.slabOf({ x: CHUTE.x - 3, y: CHUTE.y - 1.4, w: 3, d: CHUTE.d + 2.8, r: 0.8 }, TOP_Z, 5.4, P, 2, 0.4), { tone: 'mid' }));
  return out.join('');
}

/** One link, built at x = 0 and moved along the track: a rounded plate with two rivets, its number and code. */
function link(doc) {
  const plan = { x: -13, y: TRACK_Y - 4.5, w: 26, d: 9, r: 4.5 };
  const out = [`<g class="oc-link" data-link="${doc.no}" opacity="0">`];
  if (doc.no > 1) {
    // the joint to the older link on its left
    out.push(S(k.slabOf({ x: -20.5, y: TRACK_Y - 2, w: 9, d: 4, r: 1.2 }, LINK_Z + 0.6, 1.8, P, 2), { tone: 'mid', crease: 'none' }));
    out.push(D([at([-16, TRACK_Y, LINK_Z + 2.4])], { size: 0.55, tone: 'hi' }));
  }
  out.push(S(k.slabOf(plan, LINK_Z, LINK_H, P, 6, 0.5), { tone: 'hi', className: 'oc-plate' }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), LINK_TOP, P, 6), { tone: 'faint' }));
  out.push(D([at([-9.6, TRACK_Y, LINK_TOP]), at([9.6, TRACK_Y, LINK_TOP])], { size: 0.5, tone: 'mid' }));
  out.push(`<g class="oc-stamp">${topText(-2.6, TRACK_Y + 1.4, LINK_TOP, fa(doc.no), 4.6, 'hi', 'oc-no')}${topText(4.4, TRACK_Y + 1.1, LINK_TOP, doc.code, 2.4, 'mid', 'oc-code')}</g>`);
  out.push('</g>');
  return out.join('');
}

/** A coin on the chute, built at the press end. */
const coin = (n) => `<g class="oc-coin" data-coin="${n}" opacity="0">${S(k.cylinder(0, CHUTE_Y, 3.4, TOP_Z + 1.2, 1.2, P, 24, 0.3), { tone: 'hi', lit: true })}${L(k.ring(0, CHUTE_Y, 2.2, TOP_Z + 2.4, P, 20), { tone: 'lo' })}</g>`;

/** The press over place 0: a column, an arm, a rod with a spring and the die that stamps the link. */
function pressBack() {
  const [x, y] = COLUMN;
  const out = [S(k.cylinder(x, y, 6.5, TOP_Z, 3, P, 32, 0.4), { tone: 'mid' })];
  out.push(D(Array.from({ length: 4 }, (_, i) => at([x + Math.cos((i * Math.PI) / 2 + 0.8) * 5, y + Math.sin((i * Math.PI) / 2 + 0.8) * 5, TOP_Z + 3])), { size: 0.4 }));
  out.push(S(k.cylinder(x, y, 3.6, TOP_Z + 3, ARM_Z - TOP_Z - 3, P, 28), { tone: 'mid', crease: 'none', inner: L([60, 70].map((z) => k.sideArc(x, y, 3.6, z, P, 16)).join(''), { tone: 'faint' }) }));
  return out.join('');
}
const ROD_LEN = ARM_Z - DIE_REST - 1.5;
function pressRod() {
  const [x, y] = PRESS;
  // the rod and the spring stand on the die, so the die is painted first and both are seen down to its face
  return `<g data-part="die">${S(k.cylinder(x, y, DIE_R, DIE_REST, 3, P, 32, 0.4), { tone: 'hi', className: 'oc-die' })}${L(k.ring(x, y, DIE_R - 1.6, DIE_REST + 3, P, 28), { tone: 'faint' })}</g><g data-part="rod">${S(k.cylinder(x, y, ROD_R, DIE_REST + 3, ROD_LEN + 6, P, 20), { tone: 'mid', crease: 'none' })}</g><path data-part="spring" class="iso-line" data-tone="lo" d=""/>`;
}
function pressFront() {
  const [x, y] = COLUMN;
  const arm = { x: PRESS[0] - 8, y: y - 6, w: x - PRESS[0] + 14, d: PRESS[1] - y + 14, r: 3 };
  const out = [S(k.cylinder(x, y, 4.6, ARM_Z - 4, 4, P, 28, 0.4), { tone: 'mid' })];
  out.push(S(k.slabOf(arm, ARM_Z, 6, P, 4, 0.6), { tone: 'mid', inner: L(k.sideSeam(arm, ARM_Z + 3, P, 4), { tone: 'faint' }) }));
  out.push(D([at([arm.x + 4, arm.y + 4, ARM_Z + 6]), at([arm.x + arm.w - 4, arm.y + 4, ARM_Z + 6]), at([arm.x + 4, arm.y + arm.d - 4, ARM_Z + 6])], { size: 0.45 }));
  out.push(S(k.cylinder(PRESS[0], PRESS[1], 3.4, ARM_Z - 2.6, 2.6, P, 24), { tone: 'mid' })); // the rod's guide under the arm
  // the lever and its knob
  out.push(S(k.slabOf({ x: x + 4, y: y + 1.6, w: 18, d: 3, r: 1 }, ARM_Z + 6, 2, P, 2, 0.3), { tone: 'mid' }));
  out.push(S(k.cylinder(x + 24, y + 3.1, 3.4, ARM_Z + 4.6, 6, P, 24, 0.3), { tone: 'mid' }));
  out.push(L(k.knurl(x + 24, y + 3.1, 3.4, ARM_Z + 4.6, ARM_Z + 10.6, 22, P), { tone: 'lo' }));
  return out.join('');
}

/** The dial that reads how many links verify: eight marks on a 270° scale, a needle and its hub. */
function gauge() {
  const [x, y] = GAUGE;
  const out = [S(k.cylinder(x, y, 4.4, TOP_Z, 1.4, P, 24), { tone: 'lo' })];
  out.push(S(k.cylinder(x, y, 2.6, TOP_Z + 1.4, GAUGE_Z - TOP_Z - 1.4, P, 20), { tone: 'mid', crease: 'none' }));
  out.push(S(k.cylinder(x, y, GAUGE_R, GAUGE_Z, GAUGE_TOP - GAUGE_Z, P, 64, 0.6), { tone: 'hi', crease: 'lo' }));
  out.push(L(k.knurl(x, y, GAUGE_R, GAUGE_TOP - 2.6, GAUGE_TOP, 72, P, 0.3), { tone: 'lo' }));
  out.push(L(k.sideArc(x, y, GAUGE_R, GAUGE_TOP - 2.6, P, 40), { tone: 'faint' }));
  out.push(L(k.ring(x, y, GAUGE_R - 1.8, GAUGE_TOP, P, 64), { tone: 'lo' }));
  const t = k.radialTicks(x, y, GAUGE_R - 2.4, 32, 4, GAUGE_TOP, [1.1, 2.4], P, DIAL_FROM, DIAL_SPAN + 1e-6);
  out.push(L(t.minor, { tone: 'lo' }), L(t.major, { tone: 'mid' }));
  out.push(S(k.slabOf({ x: x + GAUGE_R - 1, y: y - 2, w: 4.6, d: 4, r: 1 }, GAUGE_Z + 1.4, 3.4, P, 2), { tone: 'mid' }));
  out.push(`<path data-part="needle" class="iso-line oc-needle" data-tone="lit" data-free="start" d=""/>`);
  out.push(L(k.ring(x, y, 1.4, GAUGE_TOP + 0.1, P, 16), { tone: 'mid' }));
  return out.join('');
}
const needleAt = (share) => {
  const a = DIAL_FROM + DIAL_SPAN * share;
  const [x, y] = GAUGE;
  // radialTicks: angle 0 points to −y and grows clockwise seen from above
  return k.lineOnTop([x - Math.sin(a) * 2.6, y + Math.cos(a) * 2.6], [x + Math.sin(a) * (GAUGE_R - 3.4), y - Math.cos(a) * (GAUGE_R - 3.4)], GAUGE_TOP + 0.2, P);
};
/** The spring: one wire wound round the rod from the die to the guide. Its turns show in front of the rod and beside
 * it; right behind the rod they are hidden, so every stretch of wire ends on the rod's edge. */
const ROD_R = 1.6, COIL_R = 2.8, BEHIND = Math.asin(ROD_R / COIL_R);
const springAt = (dieZ) => {
  const from = dieZ + 3.3, top = ARM_Z - 2.6, turns = 7;
  const [vx, vy] = k.towardViewer(P);
  const back = Math.atan2(vy, vx) + Math.PI; // the wire starts and ends right behind the rod
  const zOf = (a) => from + ((top - from) * (a - back)) / (2 * Math.PI * turns);
  return Array.from({ length: turns }, (_, j) => {
    const a0 = back + BEHIND + 2 * Math.PI * j, a1 = back + 2 * Math.PI * (j + 1) - BEHIND;
    return k.pathOf(Array.from({ length: 41 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 40;
      return at([PRESS[0] + COIL_R * Math.cos(a), PRESS[1] + COIL_R * Math.sin(a), zOf(a)]);
    }));
  }).join('');
};

/* ---------------- the page ---------------- */
const STEP = 3.6, HOLD = 4.5, FADE = 0.6;
const TOUR = 8 * STEP + HOLD;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const span = (u, a, b) => ease((u - a) / (b - a));

/**
 * Mount the figure in `el`. Resolves to { stop } so the page can end it when it leaves.
 * The readout, the drawer buttons and the two chain buttons live in the card under the drawing.
 */
const LABEL = 'ماشین یک زنجیره: یک پرس هر رویداد را حلقه‌ای شماره‌دار با کد می‌کند؛ حلقه‌ها روی یک ریل پشت سر هم می‌آیند و هر حلقه از ناودان، برای هر بخشی که به آن مربوط است، یک سکه در کشوی همان بخش می‌اندازد: آبشده، سکه، شمش، ارز و وجه. صفحه مدرج سمت چپ تعداد حلقه‌های درست را نشان می‌دهد.';
/** The whole drawing for these links, back to front (pure: the test counts its parts). */
export const sceneSvg = (links) =>
  k.figureSvg({
    width: W,
    height: H,
    label: LABEL,
    className: 'oc-svg',
    body: [base(), cabinetry(), railsBack(), pressBack(), links.map(link).join(''), [0, 1, 2].map(coin).join(''), railsFront(), pressRod(), pressFront(), gauge()],
  });

/** manual: no clock of its own (no tour, no observer); the caller drives it with seek(t) (the teaser, spec 0031). */
export async function mountOneChain(el, { manual = false } = {}) {
  const links = await chainOf(exampleDocs(), browserSha);
  const total = drawerCounts(links);
  const label = LABEL;
  const svg = sceneSvg(links);
  el.innerHTML = `<figure class="iso-figure oc-fig">
    <div class="iso-plate iso">
      <div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">شکل ۱</span><span class="iso-plate-corner" data-corner="title">یک زنجیره، پنج بخش</span></div>
      <div class="iso-stage" tabindex="0" role="group" aria-roledescription="شکل" aria-label="${label}">${svg}</div>
      <p class="iso-plate-corner oc-readout" data-corner="readout" data-readout aria-live="polite"></p>
    </div>
    <figcaption class="iso-legend">
      <span class="oc-hint">هر بخش را لمس کنید تا حلقه‌هایش روشن شود؛ روی شکل، پیکان‌ها حلقه به حلقه می‌روند.</span>
      <span class="iso-keys oc-keys">${DRAWERS.map(([key, name]) => `<button type="button" class="chip oc-key" data-sec="${key}">${name} <b>${fa(total[key])}</b></button>`).join('')}</span>
      <span class="iso-caption">نمونه: هشت رویداد واقعی از همین فهرست، با همان موتور میز معامله ثبت شده‌اند. هر سند یک حلقه است با کد ${'SHA-256'} از حلقه قبلی و خودش؛ هر بخش (و روزنگار هر بخش) از همین یک زنجیره پر می‌شود و دفتر جدایی ندارد. اگر کسی عددی را در یک حلقه دست ببرد، از همان حلقه به بعد زنجیره درست درنمی‌آید.</span>
      <span class="oc-acts"><button type="button" class="btn ghost sm" data-act="tamper">دستکاری حلقه ۴</button><button type="button" class="btn ghost sm" data-act="mend" hidden>درست کن</button></span>
    </figcaption>
  </figure>`;
  const stage = el.querySelector('.iso-stage');
  const readout = el.querySelector('[data-readout]');
  const linkEls = [...el.querySelectorAll('.oc-link')];
  const coinEls = [...el.querySelectorAll('.oc-coin')];
  const counts = Object.fromEntries([...el.querySelectorAll('.oc-drawer')].map((d) => [d.dataset.sec, d.querySelector('.oc-count')]));
  const fronts = Object.fromEntries([...el.querySelectorAll('.oc-drawer')].map((d) => [d.dataset.sec, d.querySelector('.oc-front')]));
  const die = el.querySelector('[data-part="die"]'), rod = el.querySelector('[data-part="rod"]'), spring = el.querySelector('[data-part="spring"]'), needle = el.querySelector('[data-part="needle"]');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const say = (text) => readout.textContent !== text && (readout.textContent = text);
  const secNames = (l) => l.secs.map((s) => NAME[s]).join('، ');

  // the chain as it stands (a tampered body changes what verify sees, never the stamped codes)
  let current = links, check = { ok: true, brokenAt: null, checked: links.length };
  let picked = null, focus = null; // a section (hover) or a link (keys)

  /** Everything at tour time t (seconds): pure, so a still frame and the live loop draw the same thing. */
  function frame(t) {
    const step = Math.min(8, Math.floor(t / STEP) + 1), u = t - (step - 1) * STEP; // step j: link j is stamped
    const end = t >= 8 * STEP;
    const fade = end ? 1 - span(t, TOUR - FADE, TOUR) : 1;
    // links: link i stands at place step - i, moving one place in the step's first 0.7 s
    for (const [n, g] of linkEls.entries()) {
      const i = n + 1;
      let p, o;
      if (end) (p = 8 - i), (o = fade);
      else if (i < step) (p = step - 1 - i + span(u, 0, 0.7)), (o = 1);
      else if (i === step) (p = 0), (o = span(u, 0.45, 0.7));
      else (p = 0), (o = 0);
      g.setAttribute('transform', k.translateAlong(P, [linkX(p), 0, 0]));
      g.setAttribute('opacity', o.toFixed(3));
      g.querySelector('.oc-stamp').setAttribute('opacity', i < step || end ? '1' : i === step ? span(u, 1.0, 1.25).toFixed(3) : '0');
      const lit = focus === i || (picked ? current[n].secs.includes(picked) && (i < step || end || u >= 1.0) : !end && i === step && u >= 0.9);
      g.querySelector('.oc-plate').toggleAttribute('data-lit', lit);
      g.toggleAttribute('data-broken', !check.ok && i >= check.brokenAt);
    }
    // the press: down 0.7–0.9 s, a beat, back up by 1.3 s
    const press = end ? 0 : span(u, 0.7, 0.9) * (1 - span(u, 1.0, 1.3));
    const dz = (DIE_DOWN - DIE_REST) * press;
    die.setAttribute('transform', k.translateAlong(P, [0, 0, dz]));
    rod.setAttribute('transform', k.translateAlong(P, [0, 0, dz]));
    spring.setAttribute('d', springAt(DIE_REST + dz));
    die.querySelector('.oc-die').toggleAttribute('data-lit', press > 0.5);
    // coins: one per section of the link just stamped, rolling from the press to its drawer's slot, then dropping in
    const doc = links[step - 1];
    const landed = Object.fromEntries(DRAWERS.map(([s]) => [s, 0]));
    for (const l of links.slice(0, end ? 8 : step - 1)) for (const s of l.secs) landed[s]++;
    coinEls.forEach((c, n) => {
      const s = !end && doc.secs[n];
      if (!s) return c.setAttribute('opacity', '0');
      const x1 = drawerX(DRAWERS.findIndex(([d]) => d === s));
      const start = 1.3 + 0.28 * n, roll = (0.35 * (PRESS[0] - x1)) / 100 + 0.3;
      const a = span(u, start, start + roll), drop = span(u, start + roll, start + roll + 0.3);
      const x = PRESS[0] - 6 + (x1 - PRESS[0] + 6) * a;
      c.setAttribute('transform', k.translateAlong(P, [x, 0, -4 * drop]));
      c.setAttribute('opacity', (u < start ? 0 : 1 - drop).toFixed(3));
      if (drop >= 1) landed[s]++;
    });
    for (const [s] of DRAWERS) {
      const text = fa(landed[s]);
      if (counts[s].textContent !== text) counts[s].textContent = text;
      fronts[s].toggleAttribute('data-lit', picked === s || (!end && !picked && doc.secs.includes(s) && coinEls.some((c, n) => doc.secs[n] === s && +c.getAttribute('opacity') > 0.05)));
    }
    // the dial: how many stamped links verify
    const stamped = end ? 8 : step - 1 + (u >= 1.0 ? 1 : 0);
    const good = check.ok ? stamped : Math.min(stamped, check.checked);
    needle.setAttribute('d', needleAt(good / 8));
    // what the card says
    if (focus) {
      const l = links[focus - 1];
      say(`سند ${fa(l.no)}، ${l.title} ← ${secNames(l)}؛ کد ${l.code}`);
    } else if (picked) {
      const nos = links.filter((l) => l.secs.includes(picked)).map((l) => fa(l.no)).join('، ');
      say(`${NAME[picked]}: ${fa(total[picked])} سند از ۸ — حلقه‌های ${nos}؛ روزنگار این بخش همین‌ها را نشان می‌دهد`);
    } else if (!check.ok) {
      say(`زنجیره از حلقه ${fa(check.brokenAt)} شکسته است: کد حلقه ${fa(check.brokenAt)} با آنچه حالا در آن است درنمی‌آید`);
    } else if (end) {
      say(`۸ سند در یک زنجیره، همه درست؛ ${DRAWERS.map(([s, nm]) => `${nm} ${fa(total[s])}`).join('، ')}`);
    } else if (u >= 1.0) {
      say(`سند ${fa(doc.no)}، ${doc.title} ← ${secNames(doc)}؛ کد ${doc.code}`);
    } else say(`سند ${fa(step)} زیر پرس…`);
  }

  // the clock: the tour loops while visible and untouched; a touch or a key holds it for a while
  let t = still.matches ? 8 * STEP + 0.01 : 0, last = 0, raf = 0, visible = false, held = 0, holdTimer = 0, stopped = false;
  const touring = () => !manual && !still.matches && !held && check.ok && !picked && !focus;
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (touring()) t = (t + dt) % TOUR;
    frame(t);
    if (visible && touring() && !stopped) raf = requestAnimationFrame(tick);
  }
  const run = () => {
    if (!raf && visible && !stopped) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  };
  const hold = (ms = 4000) => {
    held = 1;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = 0;
      run();
    }, ms);
  };
  const io = manual ? null : new IntersectionObserver((e) => {
    visible = e[e.length - 1].isIntersecting && document.visibilityState === 'visible';
    if (visible) run();
  }, { rootMargin: '80px 0px' });
  io?.observe(stage);
  const onVis = () => {
    visible = document.visibilityState === 'visible';
    if (visible) run();
  };
  if (!manual) document.addEventListener('visibilitychange', onVis);

  // a section: hover or focus a drawer button (or the drawer itself) lights its links
  const pick = (s) => {
    picked = s;
    focus = null;
    if (s) t = Math.max(t, 8 * STEP + 0.01); // the whole chain, so every link of the section is there
    el.querySelectorAll('.oc-key').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sec === s)));
    frame(t);
    if (!s) hold(2500);
  };
  for (const b of el.querySelectorAll('.oc-key')) {
    b.addEventListener('mouseenter', () => pick(b.dataset.sec));
    b.addEventListener('focus', () => pick(b.dataset.sec));
    b.addEventListener('click', () => pick(picked === b.dataset.sec ? null : b.dataset.sec));
    b.addEventListener('mouseleave', () => document.activeElement !== b && pick(null));
    b.addEventListener('blur', () => pick(null));
  }
  for (const d of el.querySelectorAll('.oc-drawer')) {
    d.addEventListener('pointerenter', () => pick(d.dataset.sec));
    d.addEventListener('pointerleave', () => pick(null));
  }
  // links by keys: ← older, → newer (the chain runs from the press on the right)
  stage.addEventListener('keydown', (ev) => {
    const keys = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 };
    if (!(ev.key in keys) && ev.key !== 'Home' && ev.key !== 'End' && ev.key !== 'Escape') return;
    ev.preventDefault();
    t = Math.max(t, 8 * STEP + 0.01);
    picked = null;
    if (ev.key === 'Escape') focus = null;
    else if (ev.key === 'Home') focus = 8;
    else if (ev.key === 'End') focus = 1;
    else focus = Math.min(8, Math.max(1, (focus ?? 9) - keys[ev.key]));
    frame(t);
    hold(6000);
  });
  stage.addEventListener('blur', () => {
    focus = null;
    frame(t);
  });

  // tamper with link 4, and mend it
  const tamperBtn = el.querySelector('[data-act="tamper"]'), mendBtn = el.querySelector('[data-act="mend"]');
  async function setTampered(on) {
    current = on ? links.map((l) => (l.no === 4 ? tamper(l) : l)) : links;
    check = await verify(current, browserSha);
    if (on) (t = 8 * STEP + 0.01), (picked = focus = null);
    tamperBtn.hidden = on;
    mendBtn.hidden = !on;
    el.querySelector('.oc-fig').toggleAttribute('data-broken', on);
    frame(t);
  }
  tamperBtn.addEventListener('click', async () => {
    await setTampered(true);
    mendBtn.focus();
  });
  mendBtn.addEventListener('click', async () => {
    await setTampered(false);
    hold(3000);
    tamperBtn.focus();
  });

  frame(t);
  return {
    links,
    /** The tour at time tt (seconds), drawn at once: the same pure frame the live loop draws. */
    seek(tt) {
      t = tt;
      frame(t);
    },
    /** Light a section's links (null: none), as hovering its drawer does. */
    show(s) {
      picked = s;
      focus = null;
      el.querySelectorAll('.oc-key').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sec === s)));
      frame(t);
    },
    /** Alter link 4 (true) or put it back (false); resolves when the chain has been verified again. */
    tamper: setTampered,
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(holdTimer);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
