// اعتبارسنجی ورودی ابزارها (spec 0015): a small, strict subset of JSON Schema — the project has no runtime
// dependencies, so this stands where a library like Zod would. Supported: type (string, number, integer, boolean,
// object, array, null, or a list of them), properties, required, additionalProperties: false, items, enum, minimum,
// maximum, minLength, maxLength, pattern, minItems, maxItems. Unknown keywords are refused, so a schema cannot
// silently promise a check it does not get.
const KNOWN = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'description']);

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (t, v) => {
  const actual = typeOf(v);
  return t === actual || (t === 'number' && (actual === 'integer' || actual === 'number') && Number.isFinite(v));
};

/** Errors of `value` against `schema` ([] = valid). Paths read like «entry.lines[2].account». */
export function check(schema, value, path = 'ورودی') {
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema keyword «${k}» is not supported`);
  const errs = [];
  const types = schema.type == null ? null : [].concat(schema.type);
  if (types && !types.some((t) => fits(t, value))) return [`${path}: نوع ${types.join('|')} لازم است.`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: یکی از ${schema.enum.join('، ')}.`);
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: دست‌کم ${schema.minimum}.`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: حداکثر ${schema.maximum}.`);
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: کوتاه است.`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: بلند است.`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errs.push(`${path}: قالب نادرست.`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: دست‌کم ${schema.minItems} مورد.`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: حداکثر ${schema.maxItems} مورد.`);
    if (schema.items) value.forEach((v, i) => errs.push(...check(schema.items, v, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const props = schema.properties ?? {};
    for (const r of schema.required ?? []) if (value[r] === undefined) errs.push(`${path}.${r}: لازم است.`);
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...check(props[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: مجاز نیست.`);
    }
  }
  return errs;
}

export class SchemaError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.errors = errors;
    this.code = 'E_SCHEMA';
  }
}
/** Throw unless valid; returns the value (typed by the schema from here on). */
export function parse(schema, value) {
  const e = check(schema, value);
  if (e.length) throw new SchemaError(e);
  return value;
}

/* building blocks */
export const S = {
  obj: (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false }),
  str: (o = {}) => ({ type: 'string', maxLength: 400, ...o }),
  int: (o = {}) => ({ type: 'integer', ...o }),
  num: (o = {}) => ({ type: 'number', ...o }),
  bool: () => ({ type: 'boolean' }),
  arr: (items, o = {}) => ({ type: 'array', items, maxItems: 200, ...o }),
  any: () => ({}),
};
/** A journal line as an agent or a trainee may write it. */
export const LINE = S.obj({
  account: S.str({ pattern: '^\\d{4}$' }),
  dr: S.num({ minimum: 0 }),
  cr: S.num({ minimum: 0 }),
  party: S.str({ maxLength: 120 }),
  product: S.str({ maxLength: 60 }),
  grams: S.num({ minimum: 0, maximum: 1e6 }),
  fineness: S.num({ minimum: 0, maximum: 1000 }),
  fine750: S.num({ minimum: 0 }),
  qty: S.int({ minimum: 0 }),
  memo: S.str(),
  adjust: S.str({ enum: ['purity'] }),
  unit: S.str({ enum: ['IRR', 'G750'] }),
  pure: S.num({ minimum: 0 }), // derived by the kernel; accepted, recomputed
}, ['account', 'dr', 'cr']);
export const ENTRY = S.obj({
  date: S.str({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  kind: S.str({ maxLength: 40 }),
  memo: S.str(),
  ref: S.str({ maxLength: 120 }),
  key: S.str({ pattern: '^[A-Za-z0-9:_-]{6,96}$' }),
  lines: S.arr(LINE, { minItems: 1, maxItems: 40 }),
}, ['lines']);
