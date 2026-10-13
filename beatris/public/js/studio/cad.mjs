// لایه CAD (spec 0016): the CadAdapter boundary and its local implementation. Domain code speaks only CadOperation
// (schemas.mjs); an adapter turns a validated program into geometry. LocalGeometryAdapter is real — it runs every
// operation on the deterministic engine (geometry.mjs) and measures the result. A Rhino adapter (RhinoCommon,
// Rhino.Compute, Grasshopper, a plugin bridge) implements the same four methods elsewhere; nothing here pretends to
// be Rhino.
import { check } from '../schema.mjs';
import { CAD_PROGRAM } from './schemas.mjs';
import * as G from './geometry.mjs';
import { shankMesh, prongHead, caratOf } from './ring.mjs';
import { weightOf, MATERIALS } from './materials.mjs';
import { q, round } from './units.mjs';

export const EXPORT_FORMATS = ['stl', 'obj'];
export class CadError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}
/** Validate a program; throws CadError E_SCHEMA with every problem. */
export function validateProgram(ops) {
  const errs = check(CAD_PROGRAM, ops, 'program');
  if (errs.length) throw new CadError('E_SCHEMA', errs.slice(0, 6).join(' '), { errors: errs });
  return ops;
}

/**
 * The local adapter. Models live in memory keyed by id (the server keeps the program and rebuilds a model from it
 * deterministically). Each model: objects { id: { role: 'metal' | 'stone', mesh, meta } }, curves, the ops applied.
 */
export function createLocalAdapter({ material = 'au18y', idFor = () => `m${Math.random().toString(36).slice(2, 10)}` } = {}) {
  const models = new Map();
  function run(model, ops) {
    for (const o of ops) {
      const obj = (id) => {
        const x = model.objects[id];
        if (!x) throw new CadError('E_REF', `شیء «${id}» در مدل نیست.`);
        return x;
      };
      const put = (id, mesh, role = 'metal', meta = {}) => {
        const wt = G.watertight(mesh);
        model.objects[id] = { role, mesh, meta, closed: wt.closed };
      };
      switch (o.op) {
        case 'createCurve': {
          let pts;
          const c = o.center ?? [0, 0, 0];
          if (o.kind === 'circle') pts = Array.from({ length: 96 }, (_, i) => [c[0] + o.radius * Math.cos((2 * Math.PI * i) / 96), c[1] + o.radius * Math.sin((2 * Math.PI * i) / 96), c[2]]);
          else if (o.kind === 'ellipse') pts = Array.from({ length: 96 }, (_, i) => [c[0] + o.rx * Math.cos((2 * Math.PI * i) / 96), c[1] + o.ry * Math.sin((2 * Math.PI * i) / 96), c[2]]);
          else pts = o.points;
          model.curves[o.id] = { points: pts, closed: o.kind !== 'polyline' || !!o.closed };
          break;
        }
        case 'extrude': {
          const cv = model.curves[o.curve];
          if (!cv?.closed) throw new CadError('E_CURVE', 'برای اکسترود منحنی بسته لازم است.');
          put(o.id, G.translate(G.extrude(cv.points.map(([x, y]) => [x, y]), o.height), [0, 0, cv.points[0][2]]));
          break;
        }
        case 'sweep': {
          const cv = model.curves[o.path];
          if (!cv) throw new CadError('E_REF', `مسیر «${o.path}» نیست.`);
          put(o.id, G.sweep(cv.points, o.radius, { closed: cv.closed }));
          break;
        }
        case 'revolve':
          put(o.id, G.revolve(o.profile, o.segments ?? 96, o.angleDeg != null && o.angleDeg < 360 ? { sweep: (o.angleDeg * Math.PI) / 180 } : {}));
          break;
        case 'shank': {
          const p = { innerDiameter: o.innerDiameter, widthTop: o.widthTop, widthBottom: o.widthBottom, thickTop: o.thickTop, thickBottom: o.thickBottom };
          put(o.id, shankMesh(p), 'metal', { kind: 'shank', params: p });
          break;
        }
        case 'stoneSetting': {
          const base = obj(o.on);
          if (base.meta.kind !== 'shank') throw new CadError('E_REF', 'سر نگین فقط روی رکاب ساخته می‌شود.');
          if (o.spec.type !== 'prong') throw new CadError('E_UNSUPPORTED', `ساخت هندسه «${o.spec.type}» هنوز در موتور محلی نیست؛ فقط اعتبارسنجی آن انجام می‌شود.`);
          const h = prongHead(base.meta.params, o.spec, o.headHeightMm);
          put(o.id, h.metal, 'metal', { kind: 'head', spec: o.spec, measures: h.measures });
          put(`${o.id}_stone`, h.stone, 'stone', { kind: 'stone', spec: o.spec, carats: caratOf(o.spec) });
          break;
        }
        case 'boolean': {
          const a = obj(o.a), b = obj(o.b);
          put(o.id, G.boolean(o.kind, a.mesh, b.mesh), a.role, { kind: 'boolean' });
          break;
        }
        case 'fillet':
          put(o.id, G.fillet(obj(o.target).mesh, o.radius), obj(o.target).role, { kind: 'fillet' });
          break;
        case 'offset':
          put(o.id, G.offset(obj(o.target).mesh, o.distance), obj(o.target).role, { kind: 'offset' });
          break;
        case 'shell':
          put(o.id, G.shell(obj(o.target).mesh, o.thickness), obj(o.target).role, { kind: 'shell' });
          break;
        case 'scale': {
          const t = obj(o.target);
          t.mesh = G.scale(t.mesh, o.factors, o.center ?? [0, 0, 0]);
          t.meta = { ...t.meta, kind: t.meta.kind === 'shank' ? 'scaled' : t.meta.kind };
          break;
        }
        case 'move': {
          const t = obj(o.target);
          t.mesh = G.translate(t.mesh, o.vector);
          break;
        }
        case 'mirror':
          put(o.id, G.mirror(obj(o.target).mesh, o.axis), obj(o.target).role, { kind: 'mirror' });
          break;
        case 'array':
          put(o.id, G.array(obj(o.target).mesh, { count: o.count, step: o.step ?? [0, 0, 0], polar: !!o.polar }), obj(o.target).role, { kind: 'array' });
          break;
        case 'delete':
          obj(o.target);
          delete model.objects[o.target];
          break;
        default:
          throw new CadError('E_OP', `عملیات «${o.op}» شناخته نیست.`);
      }
      model.ops.push(o);
    }
    return model;
  }
  const summary = (id, model) => ({
    modelId: id,
    objects: Object.entries(model.objects).map(([oid, o]) => ({ id: oid, role: o.role, kind: o.meta.kind ?? null, closed: o.closed, volume: round(G.volume(o.mesh), 2) })),
    ops: model.ops.length,
  });
  return {
    name: 'local',
    available: () => true,
    async createGeometry(ops, { id = null, material: mat = material } = {}) {
      validateProgram(ops);
      const modelId = id ?? idFor();
      const model = run({ objects: {}, curves: {}, ops: [], material: mat }, ops);
      models.set(modelId, model);
      return summary(modelId, model);
    },
    async modifyGeometry(modelId, ops) {
      validateProgram(ops);
      const model = models.get(modelId);
      if (!model) throw new CadError('E_MODEL', 'مدل پیدا نشد.');
      // work on a copy: a failing operation leaves the model as it was
      const copy = { objects: Object.fromEntries(Object.entries(model.objects).map(([k, v]) => [k, { ...v }])), curves: { ...model.curves }, ops: [...model.ops], material: model.material };
      run(copy, ops);
      models.set(modelId, copy);
      return summary(modelId, copy);
    },
    async inspectGeometry(modelId, { samples = 300 } = {}) {
      const model = models.get(modelId);
      if (!model) throw new CadError('E_MODEL', 'مدل پیدا نشد.');
      return inspect(model, { samples });
    },
    async exportModel(modelId, format) {
      const model = models.get(modelId);
      if (!model) throw new CadError('E_MODEL', 'مدل پیدا نشد.');
      if (!EXPORT_FORMATS.includes(format)) throw new CadError('E_FORMAT', `خروجی «${format}» در موتور محلی نیست (فقط ${EXPORT_FORMATS.join('، ')}؛ ‎.3dm از ابزار استودیو در مرورگر).`);
      const metal = Object.values(model.objects).filter((o) => o.role === 'metal').map((o) => o.mesh);
      return format === 'stl' ? { format, mime: 'model/stl', text: toStl(G.merge(metal)) } : { format, mime: 'text/plain', text: toObj(G.merge(metal)) };
    },
    model: (id) => models.get(id),
    drop: (id) => models.delete(id),
  };
}

/** Everything measurable about a model, in units. */
export function inspect(model, { samples = 300 } = {}) {
  const mat = MATERIALS[model.material] ?? MATERIALS.au18y;
  const metal = Object.entries(model.objects).filter(([, o]) => o.role === 'metal');
  const objects = metal.map(([id, o]) => {
    // a head is several touching tubes: its rays meet inner faces, so its strength comes from the prong diameter, not a ray
    const wt = o.meta.kind === 'head' ? null : G.wallThickness(o.mesh, { samples });
    return { id, kind: o.meta.kind ?? null, closed: o.closed, volume: round(G.volume(o.mesh), 2), area: round(G.surfaceArea(o.mesh), 1), size: G.bounds(o.mesh).size.map((s) => round(s, 2)), wall: wt && { min: round(wt.min, 3), p05: round(wt.p05, 3), median: round(wt.median, 3), at: wt.at }, params: o.meta.params ?? null, measures: o.meta.measures ?? null, spec: o.meta.spec ?? null };
  });
  const metalVolume = q(objects.reduce((s, o) => s + o.volume.value, 0), 'mm3');
  const stones = Object.entries(model.objects).filter(([, o]) => o.role === 'stone').map(([id, o]) => ({ id, spec: o.meta.spec, carats: o.meta.carats }));
  const allMetal = metal.map(([, o]) => o.mesh);
  return {
    material: model.material,
    materialFa: mat.fa,
    objects,
    metalVolume: round(metalVolume, 2),
    weight: weightOf(metalVolume, model.material),
    solids: allMetal.length ? G.solidComponents(allMetal) : 0,
    closed: objects.every((o) => o.closed),
    bounds: allMetal.length ? G.bounds(G.merge(allMetal)).size.map((s) => round(s, 2)) : null,
    stones,
  };
}

function toStl({ position: p, index: idx }) {
  const lines = ['solid beatris'];
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    lines.push(` facet normal ${n.map((x) => (x / l).toFixed(6)).join(' ')}`, '  outer loop', ...[a, b, c].map((k) => `   vertex ${p[k].toFixed(5)} ${p[k + 1].toFixed(5)} ${p[k + 2].toFixed(5)}`), '  endloop', ' endfacet');
  }
  lines.push('endsolid beatris');
  return lines.join('\n');
}
function toObj({ position: p, index: idx }) {
  const out = ['# Beatris studio (mm)'];
  for (let i = 0; i < p.length; i += 3) out.push(`v ${p[i].toFixed(5)} ${p[i + 1].toFixed(5)} ${p[i + 2].toFixed(5)}`);
  for (let i = 0; i < idx.length; i += 3) out.push(`f ${idx[i] + 1} ${idx[i + 1] + 1} ${idx[i + 2] + 1}`);
  return out.join('\n');
}
