// Minimal WebGL2 jewelry renderer: studio-lit metal, dispersive gem, velvet stage, orbit camera.
import { bounds } from './geometry.mjs';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uModel, uVP;
out vec3 vPos; out vec3 vNrm;
void main(){ vec4 w = uModel * vec4(aPos,1.); vPos = w.xyz; vNrm = mat3(uModel) * aNrm; gl_Position = uVP * w; }`;

const ENV = `
vec3 env(vec3 d, float rough){
  d = normalize(d);
  float y = d.y;
  vec3 sky = mix(vec3(0.05,0.10,0.085), vec3(0.95,0.92,0.86), smoothstep(-0.15, 0.95, y));
  vec3 col = mix(vec3(0.015,0.035,0.03), sky, smoothstep(-0.35, 0.05, y));
  float w = 0.035 + rough * 0.5;
  // softboxes: key (upper right), fill (left), rim (back), strip overhead
  col += vec3(4.0,3.8,3.5) * (1. - smoothstep(0.22 - w, 0.22 + w, acos(clamp(dot(d, normalize(vec3(0.7,0.55,0.45))),-1.,1.))));
  col += vec3(1.6,1.7,1.8) * (1. - smoothstep(0.28 - w, 0.28 + w, acos(clamp(dot(d, normalize(vec3(-0.8,0.3,0.4))),-1.,1.))));
  col += vec3(2.4) * (1. - smoothstep(0.16 - w, 0.16 + w, acos(clamp(dot(d, normalize(vec3(0.0,0.35,-1.0))),-1.,1.))));
  col += vec3(2.2,2.1,2.0) * (1. - smoothstep(0.03, 0.03 + w, abs(d.x))) * smoothstep(0.55, 0.8, y);
  col += vec3(0.5,0.42,0.25) * (1. - smoothstep(0.0, 0.06 + w, abs(y - 0.06)));
  return col;
}
vec3 tonemap(vec3 x){ x *= 0.9; vec3 a = (x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14); return pow(clamp(a,0.,1.), vec3(1./2.2)); }`;

const FS_METAL = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; uniform vec3 uEye, uColor; uniform float uRough;
out vec4 o;
${ENV}
void main(){
  vec3 N = normalize(vNrm); vec3 V = normalize(uEye - vPos);
  if (dot(N,V) < 0.) N = -N;
  vec3 R = reflect(-V, N);
  float ndv = clamp(dot(N,V), 0., 1.);
  vec3 F = uColor + (1. - uColor) * pow(1. - ndv, 5.);
  vec3 spec = env(R, uRough) * F;
  vec3 L = normalize(vec3(0.6,0.8,0.5)); vec3 H = normalize(L+V);
  float a = max(uRough*uRough, 0.002); float nh = max(dot(N,H),0.);
  float D = a*a / (3.14159 * pow(nh*nh*(a*a-1.)+1., 2.));
  spec += uColor * D * 0.08 * max(dot(N,L),0.);
  float ao = mix(0.55, 1.0, smoothstep(-0.8, 0.4, N.y));
  o = vec4(tonemap(spec * ao), 1.);
}`;

const FS_GEM = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; uniform vec3 uEye, uColor; uniform float uTime;
out vec4 o;
${ENV}
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec3 N = normalize(vNrm); vec3 V = normalize(uEye - vPos);
  if (dot(N,V) < 0.) N = -N;
  float ndv = clamp(dot(N,V),0.,1.);
  float F = 0.17 + 0.83 * pow(1.-ndv, 5.);
  vec3 refl = env(reflect(-V,N), 0.0);
  vec3 inner = vec3(0.);
  vec3 ior = vec3(2.40, 2.42, 2.45);
  for (int c=0;c<3;c++){
    vec3 T = refract(-V, N, 1./ior[c]);
    vec3 b = reflect(T, normalize(N * vec3(-1.,-1.,1.) + vec3(0.,-0.8,0.)));
    b = reflect(b, normalize(vec3(sin(h(N)*6.28), -1.2, cos(h(N)*6.28))));
    inner[c] = env(b, 0.0)[c];
  }
  float sparkle = pow(h(floor(N*9.) + floor(uTime*0.6)), 18.) * 6.;
  vec3 col = refl * F + inner * uColor * (1.-F) * 1.25 + sparkle * vec3(1.);
  o = vec4(tonemap(col), 1.);
}`;

const VS_FLOOR = `#version 300 es
layout(location=0) in vec2 aXZ;
uniform mat4 uVP; uniform float uY, uR; out vec2 vUV;
void main(){ vUV = aXZ; gl_Position = uVP * vec4(aXZ.x*uR, uY, aXZ.y*uR, 1.); }`;
const FS_FLOOR = `#version 300 es
precision highp float; in vec2 vUV; uniform vec2 uShadow; out vec4 o;
void main(){
  float r = length(vUV);
  if (r > 1.) discard;
  vec3 velvet = vec3(0.055,0.13,0.11);
  float sheen = 0.35 * smoothstep(0.3, 1.0, r) * (0.8 + 0.2*sin(vUV.x*140.)*sin(vUV.y*140.));
  float sh = exp(-pow(length(vUV / uShadow), 2.) * 2.2);
  vec3 c = velvet * (1. + sheen) * (1. - 0.7*sh);
  float fade = 1. - smoothstep(0.55, 1.0, r);
  o = vec4(pow(c, vec3(1./2.2)), fade);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

/* --- tiny mat4 --- */
const perspective = (fov, asp, n, f) => {
  const t = 1 / Math.tan(fov / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0];
};
function lookAt(e, c, up) {
  const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
export function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
export function translate(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
export const compose = (...ms) => ms.reduce((a, b) => mul(a, b));
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]];

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * createViewer(container, { autoRotate, pitch, onFrame })
 * scene item: { mesh, kind: 'metal'|'gem', color:[r,g,b], rough, model: mat4 }
 */
export function createViewer(container, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opts.label ?? 'نمای سه‌بعدی قطعه');
  container.append(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) {
    container.classList.add('gl-fallback');
    container.insertAdjacentHTML('beforeend', '<p class="gl-msg">مرورگر این دستگاه نمای سه‌بعدی (WebGL2) را پشتیبانی نمی‌کند.</p>');
    return { setScene() {}, setLabels() {}, destroy() {}, ok: false };
  }
  const metal = compile(gl, VS, FS_METAL);
  const gem = compile(gl, VS, FS_GEM);
  const floor = compile(gl, VS_FLOOR, FS_FLOOR);
  const floorVao = gl.createVertexArray();
  gl.bindVertexArray(floorVao);
  const fb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const cam = { theta: opts.theta ?? 0.6, phi: opts.pitch ?? 0.42, dist: 1, target: [0, 0, 0], fit: 1 };
  let items = [];
  let labels = [];
  let floorY = 0;
  let floorR = 1;
  let shadow = [0.3, 0.3];
  let auto = opts.autoRotate !== false && !reduced();
  let dirty = true;
  let raf = 0;
  let visible = true;
  let lastInteract = 0;
  const t0 = performance.now();

  function upload(mesh) {
    if (mesh._vao) return mesh;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    Object.defineProperty(mesh, '_vao', { value: vao, enumerable: false });
    Object.defineProperty(mesh, '_bufs', { value: [pb, nb, ib], enumerable: false });
    return mesh;
  }
  function release(mesh) {
    if (!mesh._vao) return;
    gl.deleteVertexArray(mesh._vao);
    mesh._bufs.forEach((b) => gl.deleteBuffer(b));
  }

  function worldBounds(list) {
    const pts = [];
    for (const it of list) {
      const p = it.mesh.pos;
      const step = Math.max(3, Math.floor(p.length / 3 / 400) * 3);
      for (let i = 0; i < p.length; i += step) pts.push(apply(it.model, [p[i], p[i + 1], p[i + 2]]));
    }
    return bounds([{ pos: pts.flat() }]);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(container.clientWidth * dpr));
    const h = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    resize();
    const t = (now - t0) / 1000;
    if (auto && now - lastInteract > 2500) {
      cam.theta += 0.004;
      dirty = true;
    }
    const hasGem = items.some((i) => i.kind === 'gem');
    if (dirty || hasGem) draw(t);
    dirty = false;
    if (auto || hasGem) raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    dirty = true;
    if (!raf && visible) raf = requestAnimationFrame(frame);
  };

  function draw(t) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const asp = canvas.width / canvas.height;
    const d = cam.dist * cam.fit;
    const eye = [cam.target[0] + d * Math.cos(cam.phi) * Math.sin(cam.theta), cam.target[1] + d * Math.sin(cam.phi), cam.target[2] + d * Math.cos(cam.phi) * Math.cos(cam.theta)];
    const vp = mul(perspective(0.6, asp, d * 0.05, d * 10), lookAt(eye, cam.target, [0, 1, 0]));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(floor.p);
    gl.uniformMatrix4fv(floor.u.uVP, false, vp);
    gl.uniform1f(floor.u.uY, floorY);
    gl.uniform1f(floor.u.uR, floorR);
    gl.uniform2f(floor.u.uShadow, shadow[0], shadow[1]);
    gl.bindVertexArray(floorVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    for (const it of items) {
      const prog = it.kind === 'gem' ? gem : metal;
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.u.uVP, false, vp);
      gl.uniformMatrix4fv(prog.u.uModel, false, it.model);
      gl.uniform3fv(prog.u.uEye, eye);
      gl.uniform3fv(prog.u.uColor, it.color);
      if (prog.u.uRough) gl.uniform1f(prog.u.uRough, it.rough ?? 0.12);
      if (prog.u.uTime) gl.uniform1f(prog.u.uTime, t);
      gl.bindVertexArray(it.mesh._vao);
      gl.drawElements(gl.TRIANGLES, it.mesh.idx.length, gl.UNSIGNED_INT, 0);
    }
    for (const lb of labels) {
      const c = apply(vp, lb.pos);
      if (c[3] <= 0) continue;
      const x = (c[0] / c[3] * 0.5 + 0.5) * container.clientWidth;
      const y = (1 - (c[1] / c[3] * 0.5 + 0.5)) * container.clientHeight;
      lb.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    opts.onFrame?.(cam);
  }

  /* --- input --- */
  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    lastInteract = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    lastInteract = performance.now();
    if (pointers.size === 1) {
      cam.theta -= (e.clientX - prev[0]) * 0.01;
      cam.phi = Math.max(-0.2, Math.min(1.45, cam.phi + (e.clientY - prev[1]) * 0.008));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) cam.dist = Math.max(0.45, Math.min(2.5, cam.dist * (pinch / dd)));
      pinch = dd;
    }
    kick();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.dist = Math.max(0.45, Math.min(2.5, cam.dist * Math.exp(e.deltaY * 0.001)));
      lastInteract = performance.now();
      kick();
    },
    { passive: false },
  );
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
    if (!k) return;
    e.preventDefault();
    cam.theta += k[0];
    cam.phi = Math.max(-0.2, Math.min(1.45, cam.phi + k[1]));
    lastInteract = performance.now();
    kick();
  });

  const ro = new ResizeObserver(() => kick());
  ro.observe(container);
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting && !document.hidden;
    if (visible) kick();
  });
  io.observe(container);
  const onVis = () => {
    visible = !document.hidden;
    if (visible) kick();
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    ok: true,
    /** Replace the scene. `refit` recentres the camera on the new bounds. */
    setScene(list, { refit = true } = {}) {
      const keep = new Set(list.map((i) => i.mesh));
      for (const it of items) if (!keep.has(it.mesh)) release(it.mesh);
      items = list.map((it) => ({ ...it, model: it.model ?? translate(0, 0, 0), mesh: upload(it.mesh) }));
      const b = worldBounds(items);
      if (refit) {
        cam.target = b.center;
        cam.fit = b.radius * (opts.fit ?? 3.1);
        cam.target[1] += b.radius * (opts.shiftY ?? 0);
      }
      floorY = b.min[1] - b.radius * 0.02;
      floorR = b.radius * 3.2;
      shadow = [Math.max(0.12, (b.max[0] - b.min[0]) / 2 / floorR * 1.1), Math.max(0.12, (b.max[2] - b.min[2]) / 2 / floorR * 1.1)];
      kick();
    },
    setLabels(list) {
      labels.forEach((l) => l.el.remove());
      labels = list.map((l) => {
        const el = document.createElement('span');
        el.className = 'gl-label';
        el.textContent = l.text;
        container.append(el);
        return { el, pos: [...l.pos, 1].slice(0, 3).concat(1) };
      });
      kick();
    },
    setAutoRotate(on) {
      auto = on && !reduced();
      kick();
    },
    snapshot() {
      draw((performance.now() - t0) / 1000);
      return canvas.toDataURL('image/png');
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      items.forEach((i) => release(i.mesh));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      container.innerHTML = '';
    },
  };
}
