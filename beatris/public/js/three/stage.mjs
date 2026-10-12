// Rendering stage for Beatris 3D: physically based lighting tuned for jewellery,
// soft contact shadows, bloom for gem fire, and high-resolution / video export.
// Units are millimetres throughout. How sharp it all is comes from the device's own limits (spec 0025).
import * as T from '/vendor/three.bundle.js';
import { probe, samplesFor, superFor } from '../quality.mjs';

export { T };

/** The sharpest texture filtering this GPU has (spec 0025): for every photo, scan and metal texture. */
export const maxAnisotropy = () => probe().anisotropy;

/** Jeweller's light tent: large softboxes and thin strip lights, baked into a PMREM environment. */
function lightTent(kind) {
  const scene = new T.Scene();
  const box = new T.BoxGeometry(1, 1, 1);
  // walls: a warm grey tent so polished gold reads as gold, not as a black mirror
  const wall = { white: 0xe8e6e2, dark: 0x0b0a08, sunset: 0x2a1c14, studio: 0x55504a }[kind] ?? 0x55504a;
  const room = new T.Mesh(box, new T.MeshBasicMaterial({ color: wall, side: T.BackSide }));
  room.scale.set(40, 26, 40);
  room.position.y = 8;
  scene.add(room);
  const panel = (w, h, x, y, z, intensity, color = 0xffffff) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 2, 0);
    scene.add(m);
  };
  const warm = 0xfff1dc;
  const cool = 0xe6efff;
  if (kind === 'sunset') {
    panel(24, 6, 0, 18, 0, 3, 0xffd9a0);
    panel(14, 10, -16, 6, 6, 5, 0xffb070);
    panel(6, 12, 16, 5, -4, 2.5, 0xa0b8ff);
    panel(30, 1.2, 0, 1, -18, 4, 0xff9a50);
  } else if (kind === 'dark') {
    panel(1.2, 16, -12, 6, 4, 9, warm);
    panel(1.2, 16, 12, 6, -4, 7, cool);
    panel(18, 1, 0, 17, 0, 5, 0xffffff);
  } else {
    // studio (default) and white share the tent layout
    panel(26, 12, 0, 17, 0, 1.9, 0xffffff); // overhead softbox
    panel(14, 16, -15, 6, 5, 3.2, warm); // key
    panel(12, 14, 15, 5, 5, 1.8, cool); // fill
    panel(30, 3, 0, -2, 0, 1.2, 0xfff6e8); // floor bounce
    panel(16, 5, 0, 4, -16, 3, 0xffffff); // back rim
    panel(1, 14, 9, 6, 13, 10, 0xffffff); // strip for the long highlight on shanks
    panel(1, 14, -9, 6, -13, 8, 0xffffff);
    panel(20, 0.8, 0, 11, 15, 6, warm);
  }
  return scene;
}

export const ENVS = [
  ['studio', 'استودیو'],
  ['dark', 'دراماتیک'],
  ['sunset', 'غروب'],
  ['white', 'سفید'],
  ['room', 'اتاق'],
];
export const BACKDROPS = [
  ['vault', 'سیاه لاکی', 0x0b0907],
  ['ink', 'مشکی مطلق', 0x000000],
  ['velvet', 'مخمل سبز', 0x0f2a23],
  ['lapis', 'لاجوردی', 0x0e1a36],
  ['wine', 'شرابی', 0x2a0c12],
  ['ivory', 'عاجی', 0xefe8da],
  ['white', 'سفید', 0xffffff],
];

/**
 * @param {HTMLElement} host  element that receives the canvas (sized by CSS)
 * @param {object} o  { controls, autoRotate, shadow, bloom, hero, env, backdrop, transparent, fov, interactive }
 *   hero: the page's showpiece (login and home): a gentle glint on the highlights where the GPU allows it
 */
export function createStage(host, o = {}) {
  const opt = { controls: true, autoRotate: false, shadow: true, bloom: false, hero: false, env: 'studio', backdrop: 'vault', transparent: false, fov: 30, exposure: 1, ...o };
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  } catch (e) {
    host.innerHTML = '<p class="gl-msg">مرورگر شما WebGL را پشتیبانی نمی‌کند؛ نمای سه‌بعدی در دسترس نیست.</p>';
    return null;
  }
  const Q = probe(renderer.getContext());
  // the canvas always has the screen's full density (up to the tier's cap), read again when the window changes screens
  const density = () => Math.min(globalThis.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(density());
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.domElement.dataset.quality = Q.tier;
  host.append(renderer.domElement);

  let dirty = true;
  let running = true;
  let raf = 0;
  const tickers = new Set();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(opt.fov, 1, 0.5, 4000);
  camera.position.set(0, 14, 62);

  // Reflection maps as sharp as the tier allows. Each is made by its own generator, which is freed right after, and
  // only the two latest lights are kept (a 1024 map is about 100 MB of GPU memory).
  const envCache = new Map();
  function setEnv(kind) {
    opt.env = kind;
    if (!envCache.has(kind)) {
      const src = kind === 'room' ? new T.RoomEnvironment() : lightTent(kind);
      const gen = new T.PMREMGenerator(renderer);
      envCache.set(kind, gen.fromScene(src, Q.sigma, 0.1, 100, { size: Q.pmrem }).texture);
      gen.dispose();
      src.traverse((x) => {
        x.geometry?.dispose?.();
        x.material?.dispose?.();
      });
      for (const [k, t] of envCache)
        if (envCache.size > 2 && k !== kind && t !== scene.environment) {
          t.dispose();
          envCache.delete(k);
        }
    }
    scene.environment = envCache.get(kind);
    scene.environmentIntensity = kind === 'room' ? 0.9 : 1;
    invalidate();
  }

  // key light only for shadows; the environment does the shading. The soft edge is the same width on every tier;
  // a bigger map only makes it cleaner.
  const sun = new T.DirectionalLight(0xffffff, 0.6);
  sun.position.set(-20, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  sun.shadow.radius = Q.shadowRadius;
  sun.shadow.bias = -0.0004;
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -60;
  sc.right = sc.top = 60;
  sc.near = 1;
  sc.far = 200;
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(600, 600), new T.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new T.GridHelper(200, 40, 0x6b5a3a, 0x2a241a);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.visible = false;
  scene.add(grid);

  const root = new T.Group();
  scene.add(root);

  // post-processing: MSAA HDR target → bloom (gem fire) → tone mapping
  const size = new T.Vector2(1, 1);
  const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: Q.samples });
  const composer = new T.EffectComposer(renderer, rt);
  const renderPass = new T.RenderPass(scene, camera);
  const bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), 0.1, 0.18, 1.05);
  const output = new T.OutputPass();
  output.needsSwap = false; // the picture ends on screen, so one HDR target is enough: the second is never allocated
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = opt.exposure;
  // the showpiece's glint: only the strip lights' reflections (several times brighter than the softboxes) bloom, in a
  // tight halo, so the metal keeps its colour and the page around it stays dark
  const glint = opt.hero && Q.glint;
  if (glint) {
    bloom.strength = 0.24;
    bloom.radius = 0.05;
    bloom.threshold = 2.5;
  }

  let controls = null;
  if (opt.controls) {
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 8;
    controls.maxDistance = 900;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.autoRotate = opt.autoRotate;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener('change', invalidate);
  }

  function setBackdrop(id) {
    opt.backdrop = id;
    const b = BACKDROPS.find((x) => x[0] === id) ?? BACKDROPS[0];
    scene.background = opt.transparent ? null : new T.Color(b[2]);
    floor.material.opacity = b[2] > 0xaaaaaa ? 0.18 : 0.42;
    invalidate();
  }
  setEnv(opt.env);
  setBackdrop(opt.backdrop);

  function invalidate() {
    dirty = true;
  }
  function draw() {
    bloom.enabled = opt.bloom || glint;
    composer.render();
  }

  /**
   * Size the HDR picture: w×h CSS pixels at density pr, with as many MSAA samples as the memory budget allows (never
   * fewer than `least`). The output pass filters it onto the canvas, which keeps the screen's own density.
   */
  function fit(w, h, pr, { budget = Q.msaa, least = 0 } = {}) {
    const n = Math.max(least, samplesFor(w * h * pr * pr, Q.samples, budget));
    // every pass draws into the composer's read buffer; its twin is never touched, but is kept in step
    for (const t of [composer.readBuffer, composer.writeBuffer])
      if (t.samples !== n) {
        t.samples = n;
        t.dispose();
      }
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    const d = renderer.domElement.dataset;
    d.scale = String(Math.round((pr / renderer.getPixelRatio()) * 100) / 100);
    d.samples = String(n);
  }

  // Smooth motion first: while frames slip (over 24 ms on average) the HDR picture steps down 15%, never under the
  // tier's floor, and climbs back after a calm stretch (each climb waits twice as long as the last). A step that does
  // not help (the frame rate is capped elsewhere) is undone and not tried again.
  const pace = { s: 1, ema: 0, n: 0, last: 0, at: 0, before: 0, prev: 1, wait: 4000, stuck: false };
  const floorScale = () => Math.min(1, Q.floor / renderer.getPixelRatio());
  function measure(t) {
    const dt = t - pace.last;
    pace.last = t;
    if (!(dt > 0 && dt < 250)) return void (pace.n = 0);
    pace.ema = pace.n++ ? pace.ema * 0.9 + dt * 0.1 : dt;
    if (pace.n < 30 || t - pace.at < 1000) return;
    let s = pace.s;
    if (pace.ema > 24 && s > floorScale() && !pace.stuck) {
      if (pace.before && pace.ema > pace.before * 0.92) {
        s = pace.prev;
        pace.stuck = true;
      } else {
        pace.before = pace.ema;
        pace.prev = s;
        s = Math.max(floorScale(), s * 0.85);
      }
    } else if (pace.ema < 18 && s < 1 && t - pace.at > pace.wait) {
      s = Math.min(1, s / 0.85);
      pace.before = 0;
      pace.wait = Math.min(60000, pace.wait * 2);
    } else return;
    pace.s = s;
    pace.at = t;
    pace.n = 0;
    fit(size.x, size.y, renderer.getPixelRatio() * s);
  }

  // A still picture is drawn once more at twice the density each way and filtered down (2×2 supersampling) where the
  // GPU has the memory for it; the next movement returns to the moving density. Not when motion already had to step
  // down, and never again on this stage once a sharper still held the next frame back by more than 150 ms.
  let refined = false;
  let lastDraw = 0;
  let refinedAt = 0;
  let refineOff = false;
  let busy = false; // an export owns the canvas
  const canRefine = () => !refineOff && pace.s === 1 && superFor(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), Q.refineMP, Q.exportMax) === 2;
  const onHidden = () => (refinedAt = 0); // a hidden tab stops frames: that gap is not the GPU's
  document.addEventListener('visibilitychange', onHidden);
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (refinedAt) {
      if (t - refinedAt > 150) refineOff = true;
      refinedAt = 0;
    }
    if (!running || busy) return;
    for (const f of tickers) if (f(t) !== false) dirty = true;
    if (controls) {
      controls.update();
      if (controls.autoRotate) dirty = true;
    }
    if (dirty) {
      dirty = false;
      if (refined) {
        refined = false;
        fit(size.x, size.y, renderer.getPixelRatio() * pace.s);
      }
      measure(t);
      draw();
      lastDraw = t;
    } else if (!refined && lastDraw && t - lastDraw > 400 && canRefine()) {
      refined = true;
      pace.last = 0;
      fit(size.x, size.y, renderer.getPixelRatio() * 2);
      draw();
      refinedAt = t;
    }
  }
  raf = requestAnimationFrame(loop);

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const pr = density();
    if (w === size.x && h === size.y && pr === renderer.getPixelRatio()) return;
    size.set(w, h);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    refined = false;
    pace.s = Math.max(pace.s, floorScale());
    fit(w, h, pr * pace.s);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  // the window moved to a screen with another density
  let dppx = null;
  const watchDensity = () => {
    dppx?.removeEventListener('change', onDensity);
    dppx = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`) : null;
    dppx?.addEventListener('change', onDensity);
  };
  function onDensity() {
    resize();
    watchDensity();
  }
  watchDensity();

  // pause when off-screen
  const vis = new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) invalidate();
  });
  vis.observe(host);

  /** Frame the content: camera distance from bounding sphere. */
  function frame(obj = root, { pitch = 0.3, yaw = 0.55, pad = 1.25, instant = false } = {}) {
    const box = new T.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new T.Sphere());
    const fov = (camera.fov * Math.PI) / 180;
    const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
    const dist = (sphere.radius * pad) / Math.sin(fit / 2);
    const target = sphere.center.clone();
    const dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const to = target.clone().add(dir.multiplyScalar(dist));
    camera.near = Math.max(0.1, dist / 100);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    const s = Math.max(40, sphere.radius * 4);
    sc.left = sc.bottom = -s;
    sc.right = sc.top = s;
    sc.far = s * 5;
    sun.position.set(target.x - s * 0.35, target.y + s * 1.2, target.z + s * 0.45);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    sc.updateProjectionMatrix();
    grid.scale.setScalar(Math.max(0.25, sphere.radius / 25));
    if (instant || !controls) {
      camera.position.copy(to);
      camera.lookAt(target);
      if (controls) controls.target.copy(target);
    } else {
      const from = camera.position.clone();
      const fromT = controls.target.clone();
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 700);
        const e = 1 - (1 - k) ** 3;
        camera.position.lerpVectors(from, to, e);
        controls.target.lerpVectors(fromT, target, e);
        if (k >= 1) tickers.delete(tick);
      };
      tickers.add(tick);
    }
    invalidate();
  }

  /** Put the object's lowest point on the floor. */
  function ground(obj = root) {
    const box = new T.Box3().setFromObject(obj);
    if (!box.isEmpty()) floor.position.y = box.min.y - 0.02;
    grid.position.y = floor.position.y + 0.01;
    invalidate();
  }

  /**
   * Render at an arbitrary resolution (up to 8K where the GPU allows). Returns a PNG/JPEG Blob. Pictures within the
   * tier's budget are drawn at twice the size each way and filtered down (2×2 supersampling); bigger ones keep at
   * least 4× MSAA.
   */
  async function snapshot({ width = 3840, height = 2160, transparent = false, type = 'image/png', quality = 0.95 } = {}) {
    const k = Math.min(1, Q.exportMax / Math.max(width, height));
    const W = Math.floor(width * k);
    const H = Math.floor(height * k);
    const ss = superFor(W, H, Q.exportMP, Q.exportMax);
    const prev = { bg: scene.background, gridVis: grid.visible };
    busy = true;
    try {
      grid.visible = false;
      renderer.setPixelRatio(1);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      let src = renderer.domElement;
      if (transparent) {
        // straight onto the canvas, whose own MSAA keeps the see-through edges right, then filtered down
        scene.background = null;
        renderer.setSize(W * ss, H * ss, false);
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, camera);
        if (ss > 1) {
          src = document.createElement('canvas');
          src.width = W;
          src.height = H;
          const g = src.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.drawImage(renderer.domElement, 0, 0, W, H);
        }
      } else {
        renderer.setSize(W, H, false);
        fit(W, H, ss, { budget: Q.exportMsaa, least: ss > 1 ? 0 : Math.min(4, Q.caps.maxSamples ?? 4) });
        draw();
      }
      const blob = await new Promise((res) => src.toBlob(res, type, quality));
      return { blob, width: W, height: H };
    } finally {
      scene.background = prev.bg;
      grid.visible = prev.gridVis;
      busy = false;
      size.set(0, 0);
      resize();
    }
  }

  /**
   * 360° turntable recording of the root group, square by default at the tier's size and bit rate. Returns a video
   * Blob (mp4 or webm). Each drawn turn step is captured as exactly one frame, at even times, and the last step stops
   * one short of the first so the clip loops without a jump.
   */
  async function turntable({ seconds = 6, fps = 60, width = Q.videoMax, height = width, bits = Q.videoBits, onProgress } = {}) {
    if (!('MediaRecorder' in window) || !renderer.domElement.captureStream) throw new Error('ضبط ویدیو در این مرورگر پشتیبانی نمی‌شود.');
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const k = Math.min(1, Q.exportMax / Math.max(width, height));
    const W = 2 * Math.round((width * k) / 2); // video encoders want even sizes
    const H = 2 * Math.round((height * k) / 2);
    const prevAuto = controls?.autoRotate;
    const rot0 = root.rotation.y;
    let stream = null;
    busy = true;
    try {
      if (controls) controls.autoRotate = false;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      fit(W, H, 1);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      stream = renderer.domElement.captureStream(0);
      let track = stream.getVideoTracks()[0];
      if (typeof track?.requestFrame !== 'function') {
        stream.getTracks().forEach((x) => x.stop());
        stream = renderer.domElement.captureStream(fps);
        track = null;
      }
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: bits });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => (rec.onstop = r));
      rec.start();
      const frames = Math.max(1, Math.round(seconds * fps));
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        root.rotation.y = rot0 + (i / frames) * Math.PI * 2;
        draw();
        track?.requestFrame();
        onProgress?.((i + 1) / frames);
        await new Promise((r) => setTimeout(r, Math.max(0, t0 + ((i + 1) * 1000) / fps - performance.now())));
      }
      rec.stop();
      await done;
      return new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] });
    } finally {
      stream?.getTracks().forEach((x) => x.stop());
      root.rotation.y = rot0;
      if (controls) controls.autoRotate = prevAuto;
      busy = false;
      size.set(0, 0);
      resize();
    }
  }

  return {
    T,
    renderer,
    scene,
    camera,
    controls,
    root,
    floor,
    grid,
    bloomPass: bloom,
    opt,
    /** the device's quality settings (spec 0025): tier, samples, sizes, motion… */
    quality: Q,
    invalidate,
    frame,
    ground,
    setEnv,
    setBackdrop,
    snapshot,
    turntable,
    onTick: (f) => (tickers.add(f), () => tickers.delete(f)),
    setBloom(on) {
      opt.bloom = on;
      invalidate();
    },
    setExposure(v) {
      opt.exposure = v;
      renderer.toneMappingExposure = v;
      invalidate();
    },
    setShadow(on) {
      floor.visible = on;
      invalidate();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      vis.disconnect();
      dppx?.removeEventListener('change', onDensity);
      document.removeEventListener('visibilitychange', onHidden);
      controls?.dispose();
      composer.dispose?.();
      rt.dispose();
      for (const t of envCache.values()) t.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) [].concat(o.material).forEach((m) => m.dispose?.());
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
