// Writes a .3dm (Rhino) file with McNeel's rhino3dm (MIT, vendored 8.35.0, see NOTICE). Runs isolated in a worker
// whose own CSP allows the library's WebAssembly and generated bindings; the app page keeps its strict CSP.
/* global rhino3dm */
importScripts('rhino3dm.min.js');
const ready = rhino3dm();
onmessage = async (e) => {
  try {
    const rh = await ready;
    const doc = new rh.File3dm();
    doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
    const attr = (name, rgb) => {
      const a = new rh.ObjectAttributes();
      a.name = String(name || '').slice(0, 80);
      if (rgb)
        try {
          a.colorSource = rh.ObjectColorSource.ColorFromObject;
          a.objectColor = { r: rgb[0], g: rgb[1], b: rgb[2], a: 255 };
        } catch {
          /* colour is optional */
        }
      return a;
    };
    let n = 0;
    for (const m of e.data.meshes ?? []) {
      const mesh = new rh.Mesh(), p = m.position, idx = m.index;
      for (let i = 0; i < p.length; i += 3) mesh.vertices().add(p[i], p[i + 1], p[i + 2]);
      for (let i = 0; i < idx.length; i += 3) mesh.faces().addTriFace(idx[i], idx[i + 1], idx[i + 2]);
      mesh.normals().computeNormals();
      mesh.compact();
      doc.objects().addMesh(mesh, attr(m.name, m.color));
      n++;
    }
    for (const c of e.data.curves ?? []) {
      const rational = !!c.W;
      const nc = new rh.NurbsCurve(3, rational, c.p + 1, c.P.length);
      c.P.forEach((q, i) => {
        const w = rational ? c.W[i] : 1;
        nc.points().set(i, [q[0] * w, q[1] * w, q[2] * w, w]);
      });
      c.U.slice(1, -1).forEach((k, i) => nc.knots().set(i, k)); // openNURBS stores no end knots
      doc.objects().addCurve(nc, attr(c.name));
      n++;
    }
    for (const s of e.data.surfaces ?? []) {
      const rational = !!s.W, nu = s.P.length, nv = s.P[0].length;
      const ns = rh.NurbsSurface.create(3, rational, s.p + 1, s.q + 1, nu, nv);
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const w = rational ? s.W[i][j] : 1, q = s.P[i][j];
          ns.points().set(i, j, [q[0] * w, q[1] * w, q[2] * w, w]);
        }
      s.U.slice(1, -1).forEach((k, i) => ns.knotsU().set(i, k));
      s.V.slice(1, -1).forEach((k, i) => ns.knotsV().set(i, k));
      doc.objects().addSurface(ns, attr(s.name));
      n++;
    }
    const bytes = doc.toByteArray();
    postMessage({ ok: true, bytes, count: n }, [bytes.buffer]);
  } catch (err) {
    postMessage({ ok: false, error: String(err?.message || err) });
  }
};
