// The owner's live feed (spec 0053): /api/owner/stream as Server-Sent Events over fetch, so the session travels in the
// Authorization header, never in a URL; it reconnects with a growing pause. Returns stop().
import { auth } from '../core.mjs';

export function ownerFeed(onEvent, onState = () => {}) {
  let stopped = false;
  let ctl = null;
  let wait = 2000;
  (async () => {
    while (!stopped) {
      ctl = new AbortController();
      try {
        const r = await fetch('/api/owner/stream', { headers: auth.token ? { authorization: `Bearer ${auth.token}` } : {}, signal: ctl.signal, cache: 'no-store' });
        if (r.status === 401 || r.status === 403) return onState('off');
        if (!r.ok || !r.body) throw new Error(String(r.status));
        onState('on');
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
            const type = /^event: (\w+)$/m.exec(ev)?.[1];
            const data = /^data: (.*)$/m.exec(ev)?.[1];
            if (!type || !data) continue;
            try {
              onEvent(type, JSON.parse(data));
            } catch {
              /* a malformed event is skipped */
            }
          }
        }
      } catch {
        if (stopped) return;
      }
      onState('wait');
      await new Promise((res) => setTimeout(res, wait));
      wait = Math.min(60000, wait * 2);
    }
  })();
  return () => {
    stopped = true;
    ctl?.abort();
  };
}
