// Signing in the way the page does (spec 0022): number → code → session. Without an SMS service, outside production, the
// server hands the code back («کد آزمایشی»); demo accounts get it the same way. A number in several shops picks
// `tenant` (or the first shop) with the ticket.
export async function smsLogin(base, phone, { tenant, ua } = {}) {
  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(ua ? { 'user-agent': ua } : {}) }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} ${phone} → ${r.status} ${j.error ?? ''}`);
    return j;
  };
  const sent = await post('/api/auth/code', { phone });
  if (!sent.code) throw new Error(`no code came back for ${phone} (via ${sent.via})`);
  let v = await post('/api/auth/verify', { phone, code: sent.code });
  if (v.shops) v = await post('/api/auth/finish', { ticket: v.ticket, tenant: tenant ?? v.shops[0].tenant });
  if (!v.token) throw new Error(`no session for ${phone}: ${JSON.stringify(v).slice(0, 120)}`);
  return v.token;
}
