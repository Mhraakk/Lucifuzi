// قالب‌های داده استودیو (spec 0016): every AI-facing structure of the studio is a schema, and nothing reaches the
// geometry engine before it validates — a model's design intent, a CAD operation, a setting spec, a finding.
import { S } from '../schema.mjs';

export const PRODUCT_TYPES = ['ring', 'necklace', 'bracelet', 'earring', 'pendant', 'bangle', 'chain', 'other'];
export const METHODS = ['casting', 'handmade', 'cnc', 'printing', 'mixed'];
export const STONE_SHAPES = ['round', 'oval', 'pear', 'marquise', 'emerald', 'princess', 'cushion', 'heart'];
export const SETTING_TYPES = ['prong', 'bezel', 'channel', 'pave', 'flush', 'tension', 'halo'];
export const SEVERITIES = ['info', 'warning', 'high', 'critical'];

const num = (o = {}) => S.num({ minimum: 0, ...o });
const vec3 = S.arr(S.num(), { minItems: 3, maxItems: 3 });
const ID = S.str({ pattern: '^[a-z][a-z0-9_-]{0,31}$' });

/** JewelryDesignIntent — the structured meaning of a brief. */
export const DESIGN_INTENT = S.obj({
  productType: S.str({ enum: PRODUCT_TYPES }),
  style: S.arr(S.str({ maxLength: 40 }), { maxItems: 12 }),
  targetKarat: S.int({ minimum: 8, maximum: 24 }),
  material: S.str({ maxLength: 20 }),
  targetWeightGrams: num({ maximum: 500 }),
  weightRangeGrams: S.arr(num({ maximum: 500 }), { minItems: 2, maxItems: 2 }),
  ringSizeIso: num({ minimum: 38, maximum: 76 }),
  dimensions: S.obj({ widthMm: num(), heightMm: num(), depthMm: num() }, []),
  stone: S.obj({ type: S.str({ maxLength: 30 }), shape: S.str({ enum: STONE_SHAPES }), dimensionsMm: S.arr(num({ maximum: 60 }), { maxItems: 3 }), setting: S.str({ enum: SETTING_TYPES }) }, []),
  manufacturingMethod: S.str({ enum: METHODS }),
  constraints: S.arr(S.str({ maxLength: 160 }), { maxItems: 20 }),
  aestheticIntent: S.str({ maxLength: 600 }),
  unparsed: S.arr(S.str({ maxLength: 80 }), { maxItems: 30 }),
}, ['productType', 'style', 'constraints', 'aestheticIntent']);

/** StoneSettingSpec */
export const SETTING_SPEC = S.obj({
  type: S.str({ enum: SETTING_TYPES }),
  stoneShape: S.str({ enum: STONE_SHAPES }),
  stoneType: S.str({ maxLength: 30 }),
  stoneWidthMm: num({ minimum: 0.5, maximum: 40 }),
  stoneLengthMm: num({ minimum: 0.5, maximum: 40 }),
  stoneHeightMm: num({ maximum: 30 }),
  seatDepthMm: num({ maximum: 10 }),
  prongCount: S.int({ minimum: 0, maximum: 12 }),
  prongDiameterMm: num({ maximum: 3 }),
  wallMm: num({ maximum: 5 }),
  metalDepthMm: num({ maximum: 10 }),
  spacingMm: num({ maximum: 5 }),
  beadsPerStone: S.int({ minimum: 0, maximum: 8 }),
  haloStoneMm: num({ maximum: 5 }),
}, ['type', 'stoneShape', 'stoneWidthMm']);

/** CadOperation — the only language in which anything may ask the geometry engine for geometry. */
const op = (name, props, req) => S.obj({ op: S.lit(name), ...props }, ['op', ...req]);
export const CAD_OPERATION = S.union(
  op('createCurve', { id: ID, kind: S.str({ enum: ['circle', 'ellipse', 'polyline'] }), center: vec3, radius: num({ maximum: 200 }), rx: num({ maximum: 200 }), ry: num({ maximum: 200 }), points: S.arr(vec3, { minItems: 2, maxItems: 400 }), closed: S.bool() }, ['id', 'kind']),
  op('extrude', { id: ID, curve: ID, height: num({ minimum: 0.01, maximum: 200 }) }, ['id', 'curve', 'height']),
  op('sweep', { id: ID, path: ID, radius: num({ minimum: 0.05, maximum: 20 }) }, ['id', 'path', 'radius']),
  op('revolve', { id: ID, profile: S.arr(S.arr(S.num(), { minItems: 2, maxItems: 2 }), { minItems: 3, maxItems: 200 }), segments: S.int({ minimum: 8, maximum: 256 }), angleDeg: num({ maximum: 360 }) }, ['id', 'profile']),
  op('shank', { id: ID, innerDiameter: num({ minimum: 10, maximum: 30 }), widthTop: num({ minimum: 0.8, maximum: 20 }), widthBottom: num({ minimum: 0.8, maximum: 20 }), thickTop: num({ minimum: 0.4, maximum: 6 }), thickBottom: num({ minimum: 0.4, maximum: 6 }) }, ['id', 'innerDiameter', 'widthTop', 'widthBottom', 'thickTop', 'thickBottom']),
  op('stoneSetting', { id: ID, on: ID, spec: SETTING_SPEC, headHeightMm: num({ minimum: 0.5, maximum: 15 }) }, ['id', 'on', 'spec', 'headHeightMm']),
  op('boolean', { id: ID, kind: S.str({ enum: ['union', 'difference', 'intersection'] }), a: ID, b: ID }, ['id', 'kind', 'a', 'b']),
  op('fillet', { id: ID, target: ID, radius: num({ minimum: 0.05, maximum: 5 }) }, ['id', 'target', 'radius']),
  op('offset', { id: ID, target: ID, distance: S.num({ minimum: -5, maximum: 5 }) }, ['id', 'target', 'distance']),
  op('shell', { id: ID, target: ID, thickness: num({ minimum: 0.2, maximum: 5 }) }, ['id', 'target', 'thickness']),
  op('scale', { target: ID, factors: S.arr(num({ minimum: 0.05, maximum: 20 }), { minItems: 3, maxItems: 3 }), center: vec3 }, ['target', 'factors']),
  op('move', { target: ID, vector: vec3 }, ['target', 'vector']),
  op('mirror', { id: ID, target: ID, axis: S.str({ enum: ['x', 'y', 'z'] }) }, ['id', 'target', 'axis']),
  op('array', { id: ID, target: ID, count: S.int({ minimum: 2, maximum: 64 }), step: vec3, polar: S.bool() }, ['id', 'target', 'count']),
  op('delete', { target: ID }, ['target']),
);
export const CAD_PROGRAM = S.arr(CAD_OPERATION, { minItems: 1, maxItems: 120 });

export const FINDING = S.obj({
  code: S.str({ pattern: '^[A-Z_]{3,40}$' }),
  kind: S.str({ enum: ['engineering', 'aesthetic', 'weight', 'setting'] }),
  severity: S.str({ enum: SEVERITIES }),
  geometryRef: S.str({ maxLength: 40 }),
  titleFa: S.str({ maxLength: 120 }),
  explanationFa: S.str({ maxLength: 600 }),
  measurableEvidence: S.obj({ expected: S.num(), actual: S.num(), unit: S.str({ maxLength: 10 }) }, []),
  recommendedActionFa: S.str({ maxLength: 300 }),
}, ['code', 'kind', 'severity', 'titleFa', 'explanationFa']);

/** The result of grading a studio exercise. */
export const ASSESSMENT = S.obj({
  score: num({ maximum: 1 }),
  passed: S.bool(),
  criteria: { type: 'object' },
  findings: S.arr(FINDING, { maxItems: 60 }),
  skills: { type: 'object' },
}, ['score', 'passed', 'criteria', 'findings', 'skills']);
