// Rendering stage for Beatris 3D: physically based lighting tuned for jewellery,
// soft contact shadows, bloom for gem fire, and high-resolution / video export.
// Units are millimetres throughout.
import * as T from '/vendor/three.bundle.js';

export { T };

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
 * @param {object} o  { controls, autoRotate, shadow, bloom, env, backdrop, transparent, fov, interactive }
 */
export function createStage(host, o = {}) {
  const opt = { controls: true, autoRotate: false, shadow: true, bloom: false, env: 'studio', backdrop: 'vault', transparent: false, fov: 30, exposure: 1, ...o };
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  } catch (e) {
    host.innerHTML = '<p class="gl-msg">مرورگر شما WebGL را پشتیبانی نمی‌کند؛ نمای سه‌بعدی در دسترس نیست.</p>';
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 3)); // full density on 4K displays
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  host.append(renderer.domElement);

  let dirty = true;
  let running = true;
  let raf = 0;
  const tickers = new Set();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(opt.fov, 1, 0.5, 4000);
  camera.position.set(0, 14, 62);

  const pmrem = new T.PMREMGenerator(renderer);
  const envCache = new Map();
  function setEnv(kind) {
    opt.env = kind;
    if (!envCache.has(kind)) {
      const src = kind === 'room' ? new T.RoomEnvironment() : lightTent(kind);
      envCache.set(kind, pmrem.fromScene(src, 0.02).texture);
    }
    scene.environment = envCache.get(kind);
    scene.environmentIntensity = kind === 'room' ? 0.9 : 1;
    invalidate();
  }

  // key light only for shadows; the environment does the shading
  const sun = new T.DirectionalLight(0xffffff, 0.6);
  sun.position.set(-20, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8;
  sun.shadow.blurSamples = 20;
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
  const rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
  const composer = new T.EffectComposer(renderer, rt);
  const renderPass = new T.RenderPass(scene, camera);
  const bloom = new T.UnrealBloomPass(new T.Vector2(1, 1), 0.1, 0.18, 1.05);
  const output = new T.OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = opt.exposure;

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
    bloom.enabled = opt.bloom;
    composer.render();
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (!running) return;
    for (const f of tickers) if (f(t) !== false) dirty = true;
    if (controls) {
      controls.update();
      if (controls.autoRotate) dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  }
  raf = requestAnimationFrame(loop);

  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (w === size.x && h === size.y) return;
    size.set(w, h);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    const pr = renderer.getPixelRatio();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

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

  /** Render at an arbitrary resolution. Returns a PNG/JPEG Blob. */
  async function snapshot({ width = 3840, height = 2160, transparent = false, type = 'image/png', quality = 0.95 } = {}) {
    const max = Math.min(renderer.capabilities.maxTextureSize, renderer.capabilities.maxRenderbufferSize ?? 16384);
    const k = Math.min(1, max / Math.max(width, height));
    const W = Math.floor(width * k);
    const H = Math.floor(height * k);
    const prev = { pr: renderer.getPixelRatio(), bg: scene.background, aspect: camera.aspect, w: size.x, h: size.y, floorVis: floor.visible, gridVis: grid.visible };
    grid.visible = false;
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    let blob;
    if (transparent) {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
    } else {
      composer.setPixelRatio(1);
      composer.setSize(W, H);
      draw();
    }
    blob = await new Promise((res) => renderer.domElement.toBlob(res, type, quality));
    // restore
    scene.background = prev.bg;
    grid.visible = prev.gridVis;
    renderer.setPixelRatio(prev.pr);
    size.set(0, 0);
    resize();
    return { blob, width: W, height: H };
  }

  /** 360° turntable recording of the root group. Returns a video Blob (webm or mp4). */
  async function turntable({ seconds = 6, fps = 60, width = 1080, height = 1080, onProgress } = {}) {
    if (!('MediaRecorder' in window) || !renderer.domElement.captureStream) throw new Error('ضبط ویدیو در این مرورگر پشتیبانی نمی‌شود.');
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const prevPR = renderer.getPixelRatio();
    const prevAuto = controls?.autoRotate;
    if (controls) controls.autoRotate = false;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(1);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    running = false;
    const stream = renderer.domElement.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const rot0 = root.rotation.y;
    const frames = Math.round(seconds * fps);
    for (let i = 0; i <= frames; i++) {
      root.rotation.y = rot0 + (i / frames) * Math.PI * 2;
      draw();
      onProgress?.(i / frames);
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
    rec.stop();
    await done;
    root.rotation.y = rot0;
    renderer.setPixelRatio(prevPR);
    if (controls) controls.autoRotate = prevAuto;
    running = true;
    size.set(0, 0);
    resize();
    return new Blob(chunks, { type: mime.split(';')[0] });
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
      controls?.dispose();
      composer.dispose?.();
      rt.dispose();
      for (const t of envCache.values()) t.dispose();
      pmrem.dispose();
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
