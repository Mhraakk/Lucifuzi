// رجیستری عامل‌ها (spec 0016): one place that knows every agent of Beatris — its domain, its instructions, the tools
// it may use (least privilege), which of them need approval, which memory scopes it may touch and whom it may ask.
// A definition that names an unknown tool or agent is refused at start-up, not at the moment it would misbehave.
export const AGENT_IDS = ['accounting-tutor', 'audit', 'curriculum', 'studio-design', 'rhino-cad', 'manufacturing', 'training-tutor', 'assessment'];
const REQUIRED = ['id', 'domain', 'name', 'fa', 'instructions', 'allowedTools', 'approvalPolicy', 'memoryScopes', 'canDelegateTo', 'plan'];

export function createRegistry(defs, { tools }) {
  const map = new Map();
  for (const d of defs) {
    for (const k of REQUIRED) if (d[k] == null) throw new Error(`agent ${d.id ?? '?'}: missing ${k}`);
    if (map.has(d.id)) throw new Error(`agent ${d.id}: defined twice`);
    for (const t of d.allowedTools) if (!tools[t]) throw new Error(`agent ${d.id}: unknown tool ${t}`);
    for (const t of d.approvalPolicy) if (!d.allowedTools.includes(t)) throw new Error(`agent ${d.id}: approval policy names a tool it cannot use (${t})`);
    map.set(d.id, Object.freeze({ ...d, allowedTools: [...d.allowedTools], approvalPolicy: [...d.approvalPolicy], memoryScopes: [...d.memoryScopes], canDelegateTo: [...d.canDelegateTo] }));
  }
  for (const d of map.values()) for (const to of d.canDelegateTo) if (!map.has(to)) throw new Error(`agent ${d.id}: cannot delegate to unknown ${to}`);
  return {
    get: (id) => map.get(id) ?? null,
    has: (id) => map.has(id),
    all: () => [...map.values()],
    /** A public view (no plan code): for the admin page and tests. */
    describe: () => [...map.values()].map((d) => ({ id: d.id, domain: d.domain, name: d.name, fa: d.fa, instructions: d.instructions, allowedTools: d.allowedTools, approvalPolicy: d.approvalPolicy, memoryScopes: d.memoryScopes, canDelegateTo: d.canDelegateTo })),
  };
}
