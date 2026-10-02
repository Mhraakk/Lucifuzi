// Live market board (spec 0001 #6): reads /api/market/stream (Server-Sent Events over fetch, so the session token
// travels in the Authorization header, never in the URL) and reconnects with a growing pause. Returns stop().
import { auth } from './core.mjs';

export function liveBoard(onBoard) {
  let stopped = false;
  let ctl = null;
  let wait = 2000;
  async function run() {
    while (!stopped) {
      ctl = new AbortController();
      try {
        const r = await fetch('/api/market/stream', { headers: auth.token ? { authorization: `Bearer ${auth.token}` } : {}, signal: ctl.signal, cache: 'no-store' });
        if (r.status === 401 || r.status === 403) return; // not allowed (or switched off): stay on polling
        if (!r.ok || !r.body) throw new Error(String(r.status));
        wait = 2000;
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const ev = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = /^data: (.*)$/m.exec(ev)?.[1];
            if (/^event: board$/m.test(ev) && data) {
              try {
                onBoard(JSON.parse(data));
              } catch {
                /* a malformed event is skipped */
              }
            }
          }
        }
      } catch {
        if (stopped) return;
      }
      await new Promise((res) => setTimeout(res, wait));
      wait = Math.min(60000, wait * 2);
    }
  }
  run();
  return () => {
    stopped = true;
    ctl?.abort();
  };
}
