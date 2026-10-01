// Interactive editing in the studio (spec 0010): control points of curves and NURBS surfaces, the SubD cage
// (move points, extrude faces, crease), and sculpting brushes on free solids. All edits commit as ordinary
// part data, so undo, saving, weight and export follow.
import { html, fa, toast, $ } from '../core.mjs';
import { fmt } from '../calc.mjs';

/** ctx: { T, D, NB, SD, S, cur, objs, stage, camera, vp, rebuild, renderPanel, pushHistory, encodeGeo, replaceWithMesh } */
export function wireEdit(ctx) {
  const { T, stage } = ctx;
  const canvas = stage.renderer.domElement;
  const tc = new T.TransformControls(ctx.camera, canvas);
  tc.setSize(0.6);
  ctx.scene.add(tc.getHelper());
  tc.addEventListener('dragging-changed', (e) => {
    stage.controls.enabled = !e.value;
    if (!e.value) commit();
  });
  tc.addEventListener('change', stage.invalidate);
  tc.addEventListener('objectChange', () => live());
  let E = null; // { mode, part, group, handles, data, sel, face, bar }

  const bar = (inner) => {
    E.bar?.remove();
    const b = document.createElement('div');
    b.className = 'edit-bar';
    b.innerHTML = String(inner);
    ctx.vp.append(b);
    E.bar = b;
    b.addEventListener('click', onBar);
    b.addEventListener('input', onBarInput);
  };
  function exit(save = true) {
    if (!E) return;
    const e = E;
    if (e.mode === 'sculpt' && save) sculptCommit();
    tc.detach();
    e.group?.remove(e.handles);
    e.handles?.traverse((o) => o.geometry?.dispose());
    e.bar?.remove();
    stage.controls.enabled = true;
    E = null;
    stage.invalidate();
  }

  /* ---------------------------------------------------------------- control points */
  const pointsOf = (p) => {
    if (p.type === 'curve') {
      const c = JSON.parse(p.opts.data);
      return { kind: 'curve', c, pts: c.nurbs ? c.nurbs.P : c.pts };
    }
    if (p.type === 'nsurf') {
      const d = JSON.parse(p.opts.srf);
      return { kind: 'srf', d, pts: d.s.P.flat() };
    }
    if (p.type === 'subd') {
      const d = JSON.parse(p.opts.cage);
      return { kind: 'subd', d, pts: d.v };
    }
    return null;
  };
  function startPoints() {
    const p = ctx.cur();
    const info = p && pointsOf(p);
    if (!info) return toast('اول یک منحنی، سطح NURBS یا جسم SubD را انتخاب کنید. برای جسم‌های دیگر «حجاری» را بزنید.', 'error');
    const group = ctx.objs.get(p.id)?.group;
    E = { mode: 'points', part: p, group, info, sel: -1, face: -1 };
    const size = new T.Box3().setFromObject(group).getSize(new T.Vector3()).length() / group.scale.x;
    E.r = Math.max(0.12, size * 0.012);
    drawHandles();
    bar(html`<b>${info.kind === 'subd' ? 'ویرایش قفس SubD' : 'ویرایش نقاط کنترل'}</b> · روی یک نقطه کلیک کنید و با پیکان‌ها جابه‌جا کنید${info.kind === 'subd' ? ' · روی یک وجه قفس کلیک کنید تا اکسترود یا تیز شود' : ''}
      ${info.kind === 'subd' ? html`<span class="edit-sub" hidden data-faceops><label>فاصله<input type="number" class="input ltr xs" value="2" step="0.1" data-ext></label><button class="btn small" data-eb="extrude">اکسترود وجه</button><button class="btn small ghost" data-eb="crease">لبه‌های تیز / نرم</button><label>سطح نرمی<input type="number" class="input ltr xs" value="${info.d.levels ?? 3}" min="1" max="4" data-lv></label></span>` : ''}
      ${info.kind === 'srf' ? html`<label>ضخامت<input type="number" class="input ltr xs" value="${info.d.t}" step="0.05" min="0.05" data-th></label>` : ''}
      <button class="btn small ghost" data-eb="done">پایان (Esc)</button>`);
  }
  function drawHandles() {
    E.group.remove(E.handles ?? new T.Group());
    const h = new T.Group();
    h.userData.editHandles = true;
    const geo = new T.SphereGeometry(E.r, 12, 8);
    E.info.pts.forEach((q, i) => {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: i === E.sel ? 0xff3b30 : 0xf0c75e, depthTest: false }));
      m.position.set(...q);
      m.renderOrder = 12;
      m.userData.handle = i;
      h.add(m);
    });
    // control polygon / cage wires
    const segs = [];
    if (E.info.kind === 'curve') for (let i = 0; i + 1 < E.info.pts.length; i++) segs.push(E.info.pts[i], E.info.pts[i + 1]);
    if (E.info.kind === 'srf') {
      const P = E.info.d.s.P;
      for (let i = 0; i < P.length; i++) for (let j = 0; j < P[0].length; j++) (j + 1 < P[0].length && segs.push(P[i][j], P[i][j + 1]), i + 1 < P.length && segs.push(P[i][j], P[i + 1][j]));
    }
    if (E.info.kind === 'subd') {
      const v = E.info.d.v;
      for (const f of E.info.d.f) f.forEach((a, k) => segs.push(v[a], v[f[(k + 1) % f.length]]));
      // pickable cage faces (invisible)
      const pos = [], fid = [];
      E.info.d.f.forEach((f, fi) => {
        for (let k = 1; k < f.length - 1; k++) (pos.push(...v[f[0]], ...v[f[k]], ...v[f[k + 1]]), fid.push(fi));
      });
      const fg = new T.BufferGeometry();
      fg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      const fm = new T.Mesh(fg, new T.MeshBasicMaterial({ color: 0xf0c75e, transparent: true, opacity: 0.08, depthWrite: false, side: T.DoubleSide }));
      fm.userData.faces = fid;
      h.add(fm);
      if (E.face >= 0) {
        const f = E.info.d.f[E.face], hp = [];
        for (let k = 1; k < f.length - 1; k++) hp.push(...v[f[0]], ...v[f[k]], ...v[f[k + 1]]);
        const hg = new T.BufferGeometry();
        hg.setAttribute('position', new T.Float32BufferAttribute(hp, 3));
        h.add(new T.Mesh(hg, new T.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.45, depthTest: false, side: T.DoubleSide })));
      }
    }
    if (segs.length) {
      const lg = new T.BufferGeometry().setFromPoints(segs.map((q) => new T.Vector3(...q)));
      const l = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xf0c75e, transparent: true, opacity: 0.7, depthTest: false }));
      l.renderOrder = 11;
      h.add(l);
    }
    E.handles = h;
    E.group.add(h);
    stage.invalidate();
  }
  /** Write the edited points back into the part data (JSON) */
  function writeBack() {
    const { info, part: p } = E;
    if (info.kind === 'curve') {
      if (info.c.nurbs) info.c.pts = ctx.NB.sampleCurve(info.c.nurbs, 64);
      p.opts.data = JSON.stringify(info.c);
    } else if (info.kind === 'srf') {
      const m = info.d.s.P[0].length;
      info.pts.forEach((q, k) => (info.d.s.P[Math.floor(k / m)][k % m] = q));
      p.opts.srf = JSON.stringify(info.d);
    } else p.opts.cage = JSON.stringify(info.d);
  }
  let liveRaf = 0;
  function live() {
    if (!E || E.mode !== 'points' || E.sel < 0) return;
    const h = E.handles.children.find((o) => o.userData.handle === E.sel);
    E.info.pts[E.sel] = h.position.toArray().map((v) => +v.toFixed(4));
    cancelAnimationFrame(liveRaf);
    liveRaf = requestAnimationFrame(async () => {
      writeBack();
      await rebuildKeep();
    });
  }
  /** Rebuild the part and carry the handles over to its new group. */
  async function rebuildKeep() {
    const p = E.part;
    await ctx.rebuild(p);
    if (!E) return;
    const g = ctx.objs.get(p.id)?.group;
    if (g && g !== E.group) {
      E.group.remove(E.handles);
      E.group = g;
      g.add(E.handles);
      const h = E.handles.children.find((o) => o.userData.handle === E.sel);
      if (h && tc.object !== h) tc.attach(h);
    }
  }
  async function commit() {
    if (!E || E.mode !== 'points') return;
    writeBack();
    await rebuildKeep();
    drawHandles();
    const h = E.handles.children.find((o) => o.userData.handle === E.sel);
    if (h) tc.attach(h);
    ctx.pushHistory();
  }

  /* ---------------------------------------------------------------- sculpt */
  async function startSculpt() {
    let p = ctx.cur();
    if (!p) return toast('اول یک قطعه انتخاب کنید.', 'error');
    if (p.type !== 'mesh') {
      p = await ctx.replaceWithMesh(p);
      if (!p) return;
    }
    const group = ctx.objs.get(p.id)?.group, mesh = group?.children.find((m) => m.isMesh);
    if (!mesh) return;
    // an indexed working copy, refined until the brush has vertices to move
    let g = ctx.D.toIndexed(mesh.geometry);
    for (let k = 0; k < 2 && g.index.count / 3 < 60000; k++) g = ctx.D.toIndexed(ctx.D.subdivide(g, { levels: 1, smooth: false }));
    g.computeVertexNormals();
    const old = mesh.geometry;
    mesh.geometry = g;
    old.dispose();
    const n = g.attributes.position.count, idx = g.index.array, nb = Array.from({ length: n }, () => []);
    for (let i = 0; i < idx.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const a = idx[i + k], b = idx[i + ((k + 1) % 3)];
        nb[a].push(b);
        nb[b].push(a);
      }
    const size = new T.Box3().setFromBufferAttribute(g.attributes.position).getSize(new T.Vector3()).length();
    E = { mode: 'sculpt', part: p, group, mesh, nb, tool: 'draw', radius: +(size * 0.08).toFixed(2), strength: 0.5, undo: [] };
    bar(html`<b>حجاری</b> · روی قطعه بکشید (Shift: برعکس)
      <span class="chips">${[['draw', 'برآمدگی'], ['inflate', 'باد کردن'], ['smooth', 'صاف کردن'], ['flatten', 'تخت کردن'], ['pinch', 'جمع کردن'], ['grab', 'کشیدن']].map(([k, l]) => html`<button class="chip" data-tool="${k}" aria-pressed="${k === 'draw'}">${l}</button>`)}</span>
      <label>شعاع (mm)<input type="number" class="input ltr xs" value="${E.radius}" step="0.1" min="0.1" data-rad></label><label>شدت<input type="range" min="0.05" max="1" step="0.05" value="0.5" data-str></label>
      <button class="btn small ghost" data-eb="undo">بازگشت ضربه</button><button class="btn small" data-eb="done">پایان و ذخیره</button>`);
    toast(`حجاری روی ${fa(g.index.count / 3)} مثلث. شعاع و ابزار را از نوار بالای صحنه انتخاب کنید.`);
  }
  let stroke = null;
  const hitOn = (e) => {
    const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
    return ray.intersectObject(E.mesh, false)[0] ?? null;
  };
  function dab(hit, invert, delta) {
    const { mesh, nb, tool, strength } = E;
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal, P = pos.array, Nn = nor.array;
    const inv = new T.Matrix4().copy(mesh.matrixWorld).invert(), p = hit.point.clone().applyMatrix4(inv);
    const sc = mesh.matrixWorld.getMaxScaleOnAxis(), R = E.radius / sc, R2 = R * R;
    const hn = hit.face.normal.clone();
    const sign = invert ? -1 : 1, k = strength * R * 0.12 * sign;
    const touched = [];
    for (let i = 0; i < pos.count; i++) {
      const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R2) touched.push([i, (1 - d2 / R2) ** 2]);
    }
    if (!touched.length) return;
    if (tool === 'grab' && delta) {
      for (const [i, w] of stroke.grab) (P[i * 3] += delta.x * w), (P[i * 3 + 1] += delta.y * w), (P[i * 3 + 2] += delta.z * w);
    } else
      for (const [i, w] of touched) {
        if (tool === 'draw') (P[i * 3] += hn.x * k * w), (P[i * 3 + 1] += hn.y * k * w), (P[i * 3 + 2] += hn.z * k * w);
        else if (tool === 'inflate') (P[i * 3] += Nn[i * 3] * k * w), (P[i * 3 + 1] += Nn[i * 3 + 1] * k * w), (P[i * 3 + 2] += Nn[i * 3 + 2] * k * w);
        else if (tool === 'smooth') {
          let x = 0, y = 0, z = 0;
          for (const j of nb[i]) (x += P[j * 3]), (y += P[j * 3 + 1]), (z += P[j * 3 + 2]);
          const c = nb[i].length || 1, f = Math.min(1, strength * w);
          P[i * 3] += (x / c - P[i * 3]) * f;
          P[i * 3 + 1] += (y / c - P[i * 3 + 1]) * f;
          P[i * 3 + 2] += (z / c - P[i * 3 + 2]) * f;
        } else if (tool === 'flatten') {
          const s = (P[i * 3] - p.x) * hn.x + (P[i * 3 + 1] - p.y) * hn.y + (P[i * 3 + 2] - p.z) * hn.z, f = Math.min(1, strength * w);
          P[i * 3] -= hn.x * s * f;
          P[i * 3 + 1] -= hn.y * s * f;
          P[i * 3 + 2] -= hn.z * s * f;
        } else if (tool === 'pinch') {
          const f = strength * w * 0.25 * sign;
          P[i * 3] += (p.x - P[i * 3]) * f;
          P[i * 3 + 1] += (p.y - P[i * 3 + 1]) * f;
          P[i * 3 + 2] += (p.z - P[i * 3 + 2]) * f;
        }
      }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    stage.invalidate();
  }
  function sculptCommit() {
    const p = E.part;
    p.opts.geo = ctx.encodeGeo(E.mesh.geometry);
    ctx.rebuild(p).then(() => ctx.renderPanel());
    ctx.pushHistory();
  }

  /* ---------------------------------------------------------------- pointer + bar */
  let downAt = null;
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (!E) return;
      downAt = [e.clientX, e.clientY];
      if (E.mode === 'sculpt') {
        const hit = hitOn(e);
        if (!hit) return;
        e.stopImmediatePropagation();
        stage.controls.enabled = false;
        E.undo.push(Float32Array.from(E.mesh.geometry.attributes.position.array));
        if (E.undo.length > 12) E.undo.shift();
        const inv = new T.Matrix4().copy(E.mesh.matrixWorld).invert(), p = hit.point.clone().applyMatrix4(inv);
        const sc = E.mesh.matrixWorld.getMaxScaleOnAxis(), R2 = (E.radius / sc) ** 2, P = E.mesh.geometry.attributes.position.array, grab = [];
        for (let i = 0; i < P.length / 3; i++) {
          const d2 = (P[i * 3] - p.x) ** 2 + (P[i * 3 + 1] - p.y) ** 2 + (P[i * 3 + 2] - p.z) ** 2;
          if (d2 < R2) grab.push([i, (1 - d2 / R2) ** 2]);
        }
        // grab moves along the screen plane through the hit point
        const plane = new T.Plane().setFromNormalAndCoplanarPoint(ctx.camera.getWorldDirection(new T.Vector3()), hit.point);
        stroke = { last: p, grab, plane, prevWorld: hit.point.clone() };
        if (E.tool !== 'grab') dab(hit, e.shiftKey);
      }
    },
    true,
  );
  canvas.addEventListener('pointermove', (e) => {
    if (!E || E.mode !== 'sculpt' || !stroke) return;
    if (E.tool === 'grab') {
      const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
      const at = new T.Vector3();
      if (!ray.ray.intersectPlane(stroke.plane, at)) return;
      const inv = new T.Matrix4().copy(E.mesh.matrixWorld).invert();
      const delta = at.clone().applyMatrix4(inv).sub(stroke.prevWorld.clone().applyMatrix4(inv));
      stroke.prevWorld = at;
      dab({ point: at, face: { normal: new T.Vector3(0, 1, 0) } }, false, delta);
      return;
    }
    const hit = hitOn(e);
    if (!hit) return;
    const inv = new T.Matrix4().copy(E.mesh.matrixWorld).invert(), p = hit.point.clone().applyMatrix4(inv);
    if (p.distanceTo(stroke.last) < (E.radius / E.mesh.matrixWorld.getMaxScaleOnAxis()) * 0.2) return;
    stroke.last = p;
    dab(hit, e.shiftKey);
  });
  addEventListener('pointerup', () => {
    if (stroke) (stroke = null), (stage.controls.enabled = true);
  });
  canvas.addEventListener(
    'pointerup',
    (e) => {
      if (!E || E.mode !== 'points' || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || tc.dragging) return;
      e.stopImmediatePropagation();
      const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.camera);
      const hits = ray.intersectObjects(E.handles.children, false);
      const hp = hits.find((h) => h.object.userData.handle !== undefined);
      if (hp) {
        E.sel = hp.object.userData.handle;
        E.face = -1;
        drawHandles();
        tc.attach(E.handles.children.find((o) => o.userData.handle === E.sel));
        $('[data-faceops]', E.bar)?.setAttribute('hidden', '');
        return;
      }
      const hf = hits.find((h) => h.object.userData.faces);
      if (hf && E.info.kind === 'subd') {
        E.face = hf.object.userData.faces[hf.faceIndex];
        E.sel = -1;
        tc.detach();
        drawHandles();
        $('[data-faceops]', E.bar)?.removeAttribute('hidden');
      }
    },
    true,
  );
  async function onBar(e) {
    const b = e.target.closest('[data-eb], [data-tool]');
    if (!b || !E) return;
    if (b.dataset.tool) {
      E.tool = b.dataset.tool;
      E.bar.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      return;
    }
    const a = b.dataset.eb;
    if (a === 'done') return exit(true);
    if (a === 'undo' && E.mode === 'sculpt' && E.undo.length) {
      E.mesh.geometry.attributes.position.array.set(E.undo.pop());
      E.mesh.geometry.attributes.position.needsUpdate = true;
      E.mesh.geometry.computeVertexNormals();
      return stage.invalidate();
    }
    if ((a === 'extrude' || a === 'crease') && E.face >= 0) {
      const d = E.info.d, next = a === 'extrude' ? ctx.SD.extrudeFace(d, E.face, Number($('[data-ext]', E.bar).value) || 1) : ctx.SD.creaseFace(d, E.face);
      E.info.d = { ...next, levels: d.levels ?? 3 };
      E.info.pts = E.info.d.v;
      E.sel = -1;
      writeBack();
      await rebuildKeep();
      drawHandles();
      ctx.pushHistory();
      toast(a === 'extrude' ? `وجه اکسترود شد؛ قفس: ${fa(E.info.d.f.length)} وجه.` : 'لبه‌های این وجه تیز/نرم شد.', 'ok');
    }
  }
  async function onBarInput(e) {
    if (!E) return;
    const t = e.target;
    if (t.matches('[data-rad]')) E.radius = Math.max(0.05, Number(t.value) || E.radius);
    else if (t.matches('[data-str]')) E.strength = Number(t.value);
    else if (t.matches('[data-th]') && E.info?.kind === 'srf') {
      E.info.d.t = Math.min(30, Math.max(0.05, Number(t.value) || E.info.d.t));
      writeBack();
      await rebuildKeep();
      ctx.pushHistory();
    } else if (t.matches('[data-lv]') && E.info?.kind === 'subd') {
      E.info.d.levels = Math.min(4, Math.max(1, Math.round(Number(t.value) || 3)));
      writeBack();
      await rebuildKeep();
      ctx.pushHistory();
    }
  }
  const onKey = (e) => {
    if (E && e.key === 'Escape') {
      exit(true);
      e.stopImmediatePropagation();
    }
  };
  addEventListener('keydown', onKey, true);
  return {
    start(kind) {
      exit(true);
      if (kind === 'sculpt') startSculpt();
      else startPoints();
    },
    active: () => !!E,
    exit,
    dispose() {
      exit(false);
      removeEventListener('keydown', onKey, true);
      tc.dispose();
    },
    info: () => (E ? { mode: E.mode, sel: E.sel, face: E.face, kind: E.info?.kind, tris: E.mesh ? E.mesh.geometry.index.count / 3 : 0, radius: E.radius } : null),
    /** test hook: move control point i by a vector, as a drag would */
    async movePoint(i, d) {
      if (!E || E.mode !== 'points') return;
      E.sel = i;
      E.info.pts[i] = E.info.pts[i].map((v, k) => v + d[k]);
      await commit();
    },
    async faceOp(op, fi, dist = 2) {
      if (!E || E.info?.kind !== 'subd') return;
      E.face = fi;
      const inp = $('[data-ext]', E.bar);
      if (inp) inp.value = String(dist);
      await onBar({ target: E.bar.querySelector(`[data-eb="${op}"]`) });
    },
    fmtRadius: () => (E?.radius ? fmt(E.radius, 2) : ''),
  };
}
