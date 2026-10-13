// برگشت سریع (spec 0013): every meaningful change of a working flow is a step that can be taken back at once,
// while the operator is still on the phone. The page hands over get() and set(); a step is the state *before* a
// change, a Persian label of what changed and the field to land on, so the right value can be typed straight away.
// Typing in one field is one step (grouped); a fresh change after an undo drops the redo branch.

const snap = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {{ get: () => any, set: (state: any) => void, limit?: number, groupMs?: number, now?: () => number }} o
 */
export function createHistory({ get, set, limit = 40, groupMs = 1200, now = () => Date.now() }) {
  let past = [], future = [], group = null;
  let cur = snap(get());
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f(h));
  const h = {
    /**
     * Record a change that has already been made to the state. `key` groups typing in one field into one step;
     * `focus` is a selector of the field to land on when this step is taken back.
     */
    commit(label, { key = null, focus = null } = {}) {
      const next = snap(get());
      if (same(next, cur)) return false;
      const t = now();
      if (key && group && group.key === key && t - group.at < groupMs && past.length) {
        past[past.length - 1].label = label; // still typing in the same field: one step, the latest wording
        group.at = t;
      } else {
        past.push({ state: cur, label, focus });
        if (past.length > limit) past.shift();
        group = key ? { key, at: t } : null;
      }
      cur = next;
      future = [];
      emit();
      return true;
    },
    /** Take the last step back; returns the step (label, focus) or null. */
    undo() {
      if (!past.length) return null;
      const step = past.pop();
      future.push({ state: cur, label: step.label, focus: step.focus });
      cur = step.state;
      group = null;
      set(snap(cur));
      emit();
      return step;
    },
    redo() {
      if (!future.length) return null;
      const step = future.pop();
      past.push({ state: cur, label: step.label, focus: step.focus });
      cur = step.state;
      group = null;
      set(snap(cur));
      emit();
      return step;
    },
    /** Take n steps back at once (the dock's list). */
    back(n) {
      let s = null;
      for (let i = 0; i < n && past.length; i++) s = h.undo();
      return s;
    },
    /** The newest steps first, for the dock. */
    steps(n = 5) {
      return past.slice(-n).reverse().map((s) => s.label);
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get size() {
      return past.length;
    },
    get nextRedo() {
      return future.length ? future[future.length - 1].label : null;
    },
    /** A clean start (after a final save or a restored draft): nothing to take back. */
    reset() {
      past = [];
      future = [];
      group = null;
      cur = snap(get());
      emit();
    },
    /** Follow a change that should not be a step (e.g. prices refreshed from the board). */
    sync() {
      cur = snap(get());
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return h;
}

/**
 * The fixed «برگشت» dock for a flow: the last steps by name, one tap or Ctrl+Z to take one back, Ctrl+Shift+Z or
 * Ctrl+Y forward. After a step the cursor lands on its field with the value selected. Returns a cleanup function.
 */
export function mountDock(history, { root, restore, title = 'برگشت' }) {
  if (typeof document === 'undefined') return () => {};
  const dock = document.createElement('div');
  dock.className = 'ud-dock';
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'برگشت سریع');
  document.body.append(dock);
  let open = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  function draw() {
    const steps = history.steps(5);
    dock.classList.toggle('on', history.canUndo || history.canRedo);
    dock.innerHTML = `<div class="ud-row">
      <button type="button" class="ud-back" data-ud="undo" ${history.canUndo ? '' : 'disabled'} aria-keyshortcuts="Control+Z" title="${esc(title)} (Ctrl+Z)">
        <span class="ud-ic" aria-hidden="true">↶</span><span class="ud-t">${esc(title)}</span>${history.canUndo ? `<span class="ud-n">${fa(history.size)}</span>` : ''}</button>
      ${steps[0] ? `<span class="ud-last" aria-live="polite">${esc(steps[0])}</span>` : ''}
      ${history.canRedo ? `<button type="button" class="ud-fwd" data-ud="redo" aria-keyshortcuts="Control+Shift+Z" title="جلو (Ctrl+Shift+Z): ${esc(history.nextRedo)}">↷</button>` : ''}
      ${steps.length > 1 ? `<button type="button" class="ud-more" data-ud="list" aria-expanded="${open}" aria-label="گام‌های قبلی">▾</button>` : ''}
    </div>${open && steps.length > 1 ? `<ol class="ud-list">${steps.map((s, i) => `<li><button type="button" data-ud-back="${i + 1}">${i ? `${fa(i + 1)} گام: ` : ''}${esc(s)}</button></li>`).join('')}</ol>` : ''}`;
  }
  function land(step) {
    if (!step) return;
    restore?.(step);
    if (!step.focus) return;
    requestAnimationFrame(() => {
      const el = root.querySelector(step.focus);
      if (!el) return;
      el.focus({ preventScroll: false });
      el.select?.();
      el.classList.remove('ud-flash');
      void el.offsetWidth;
      el.classList.add('ud-flash');
    });
  }
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ud], [data-ud-back]');
    if (!b) return;
    if (b.dataset.udBack) {
      open = false;
      land(history.back(Number(b.dataset.udBack)));
    } else if (b.dataset.ud === 'undo') land(history.undo());
    else if (b.dataset.ud === 'redo') land(history.redo());
    else if (b.dataset.ud === 'list') {
      open = !open;
      draw();
    }
  });
  const onKey = (e) => {
    if (!root.isConnected || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const z = e.code === 'KeyZ', y = e.code === 'KeyY';
    if (!z && !y) return;
    e.preventDefault();
    land(y || e.shiftKey ? history.redo() : history.undo());
  };
  document.addEventListener('keydown', onKey);
  const off = history.on(draw);
  draw();
  return () => {
    off();
    document.removeEventListener('keydown', onKey);
    dock.remove();
  };
}
