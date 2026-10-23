// spec 0046: renders the entrance sculpture with the app's own three.js. Interwoven gold filaments rise into the three
// points of the Beatris crown, with the coin for its jewel, a bead on each side point, a woven foot and gold dust.
// The background is transparent, so one image serves both tones (the liquid engine samples it by alpha).
//   node scripts/sculpture.mjs [--out=public/media/hero] [--width=2400] [--height=960] [--quality=0.84]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const OUT = path.resolve(ROOT, arg('out') ?? 'public/media/hero');
const W = Number(arg('width') ?? 2400), H = Number(arg('height') ?? 960), QUALITY = Number(arg('quality') ?? 0.84);
const pw = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const { chromium } = pw.default ?? pw;
const port = 7600 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.mjs'], { cwd: ROOT, env: { ...process.env, BEATRIS_DEMO: 'true', BEATRIS_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'sc-')), PORT: String(port), NODE_ENV: 'test' }, stdio: ['ignore', 'ignore', 'inherit'] });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120 && !(await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${base}/intro`);
  const out = await page.evaluate(async ({ W, H, QUALITY }) => {
    const T = await import('/vendor/three.bundle.js');
    let seed = 1405;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const SS = 2; // supersampling
    const canvas = document.createElement('canvas');
    canvas.width = W * SS;
    canvas.height = H * SS;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W * SS, H * SS, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NeutralToneMapping;
    renderer.toneMappingExposure = 0.92;

    // the jeweller's light tent (warm grey walls, softboxes and strips), as a reflection map
    const tent = new T.Scene();
    const room = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0x5a544c, side: T.BackSide }));
    room.scale.set(40, 26, 40);
    room.position.y = 8;
    tent.add(room);
    const panel = (w, h, x, y, z, k, c = 0xffffff) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 2, 0);
      tent.add(m);
    };
    panel(26, 12, 0, 17, 0, 2.1);
    panel(14, 16, -15, 6, 5, 3.4, 0xfff1dc);
    panel(12, 14, 15, 5, 5, 2.0, 0xe6efff);
    panel(30, 3, 0, -2, 0, 1.3, 0xfff6e8);
    panel(16, 5, 0, 4, -16, 3.2);
    panel(1, 14, 9, 6, 13, 11);
    panel(1, 14, -9, 6, -13, 9);
    panel(20, 0.8, 0, 11, 15, 6.5, 0xfff1dc);
    panel(0.8, 18, 0, 6, 16, 7);
    const pm = new T.PMREMGenerator(renderer);
    const env = pm.fromScene(tent, 0.03, 0.1, 100, { size: 512 }).texture;
    const scene = new T.Scene();
    scene.environment = env;

    const gold = new T.MeshPhysicalMaterial({ metalness: 1, roughness: 0.08, envMapIntensity: 1.2 });
    gold.color.setRGB(1.0, 0.66, 0.22, T.LinearSRGBColorSpace);
    const goldSatin = gold.clone();
    goldSatin.roughness = 0.22;
    goldSatin.color.setRGB(0.97, 0.62, 0.2, T.LinearSRGBColorSpace);

    const g = (x, c, s) => Math.exp(-((Math.abs(x - c) / s) ** 1.35));
    const smooth = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // the crown: a low band that rises into three points, the middle one highest
    const crown = (x) => (2.6 + 18 * g(x, 0, 7.2) + 11 * g(x, -22, 6.4) + 11 * g(x, 22, 6.4)) * (1 - 0.7 * smooth(34, 64, Math.abs(x)));
    const tube = (pts, r, mat) => {
      const c = new T.CatmullRomCurve3(pts, false, 'centripetal');
      return new T.Mesh(new T.TubeGeometry(c, Math.max(64, pts.length * 6), r, 14, false), mat);
    };
    const group = new T.Group();
    const N = 18;
    for (let i = 0; i < N; i++) {
      const phi = (2 * Math.PI * i) / N + (rnd() - 0.5) * 0.5;
      const om = 0.15 + rnd() * 0.06;
      const psi = rnd() * 6.28;
      const k = 0.72 + rnd() * 0.3;
      const x0 = -78 + rnd() * 6, x1 = 78 - rnd() * 6;
      const pts = [];
      for (let x = x0; x <= x1; x += 0.8) {
        const th = om * x + phi + 0.9 * Math.sin(0.045 * x + psi);
        const c = crown(x);
        const y = c * k * (0.5 + 0.5 * Math.sin(th)) + 0.35 * Math.sin(0.11 * x + psi);
        const z = (2.4 + 0.2 * c) * Math.cos(th);
        pts.push(new T.Vector3(x, y, z));
      }
      const r = [0.15, 0.2, 0.26, 0.34, 0.44][Math.floor(rnd() * 5)];
      group.add(tube(pts, r, rnd() < 0.3 ? goldSatin : gold));
    }
    // the bar (شمش): low filaments woven tight along the foot, the whole width
    for (let i = 0; i < 7; i++) {
      const phi = (2 * Math.PI * i) / 7 + rnd() * 0.3;
      const pts = [];
      for (let x = -80 + rnd() * 6; x <= 80 - rnd() * 6; x += 0.8) {
        const th = 0.3 * x + phi;
        pts.push(new T.Vector3(x, -1.2 + 0.7 * Math.sin(th) + 0.25 * Math.sin(0.07 * x + i), 1.4 * Math.cos(th)));
      }
      group.add(tube(pts, [0.22, 0.3, 0.36][i % 3], i % 2 ? goldSatin : gold));
    }
    // two beads on the side points, as on the mark
    for (const sx of [-22, 22]) {
      const b = new T.Mesh(new T.SphereGeometry(1.05, 48, 32), gold);
      b.position.set(sx, crown(sx) + 2.2, 0.4);
      group.add(b);
    }
    // the coin, the crown's jewel
    const coin = new T.Mesh(new T.CylinderGeometry(3.1, 3.1, 0.62, 96, 1), gold);
    coin.rotation.set(Math.PI / 2, 0, 0);
    coin.rotation.y = 0;
    const cg = new T.Group();
    cg.add(coin);
    const rim = new T.Mesh(new T.TorusGeometry(3.1, 0.24, 24, 128), goldSatin);
    cg.add(rim);
    const inner = new T.Mesh(new T.TorusGeometry(2.15, 0.09, 16, 96), goldSatin);
    inner.position.z = 0.33;
    cg.add(inner);
    cg.position.set(0, crown(0) + 4.6, 0.6);
    cg.rotation.y = -0.42;
    cg.rotation.x = 0.08;
    group.add(cg);
    // gold dust, thicker over the points
    const dust = new T.InstancedMesh(new T.SphereGeometry(1, 16, 12), gold, 520);
    const m4 = new T.Matrix4();
    let n = 0;
    while (n < 520) {
      const x = (rnd() - 0.5) * 118;
      const c = crown(x);
      if (rnd() > 0.25 + c / 30) continue;
      const y = c * (0.55 + rnd() * 0.75) + (rnd() - 0.3) * 3;
      const z = (rnd() - 0.5) * 9;
      const s = 0.06 + rnd() ** 3 * 0.22;
      m4.makeScale(s, s, s).setPosition(x, y, z);
      dust.setMatrixAt(n++, m4);
    }
    group.add(dust);
    scene.add(group);

    const box = new T.Box3(new T.Vector3(-57, -3, -6), new T.Vector3(57, crown(0) + 8.5, 6));
    const ctr = box.getCenter(new T.Vector3());
    const cam = new T.PerspectiveCamera(16, W / H, 1, 2000);
    const wide = box.max.x - box.min.x;
    const dist = wide / 2 / Math.tan((16 * Math.PI) / 360) / (W / H);
    cam.position.set(ctr.x, ctr.y + dist * 0.06, ctr.z + dist);
    cam.lookAt(ctr.x, ctr.y, ctr.z);
    renderer.render(scene, cam);

    // downsample the supersampled frame, then crop to the art with a margin and the target aspect
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const s2 = small.getContext('2d');
    s2.imageSmoothingQuality = 'high';
    s2.drawImage(canvas, 0, 0, W, H);
    // the tails fade into nothing at both sides, so the sculpture never shows a cut edge however narrow it is laid out
    const fade = s2.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.14, 'rgba(0,0,0,1)');
    fade.addColorStop(0.86, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    s2.globalCompositeOperation = 'destination-in';
    s2.fillStyle = fade;
    s2.fillRect(0, 0, W, H);
    s2.globalCompositeOperation = 'source-over';
    const px = s2.getImageData(0, 0, W, H).data;
    let minY = H, maxY = 0, minX = W, maxX = 0, opaque = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (px[(y * W + x) * 4 + 3] > 8) {
          opaque++;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
    const toB64 = (c, type, q) => new Promise((res) => c.toBlob((b) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(b); }, type, q));
    return { webp: await toB64(small, 'image/webp', QUALITY), bbox: [minX, minY, maxX, maxY], opaque: opaque / (W * H) };
  }, { W, H, QUALITY });
  writeFileSync(path.join(OUT, 'sculpture.webp'), Buffer.from(out.webp, 'base64'));
  console.log(`sculpture.webp ${W}×${H}: art ${out.bbox.join(',')}, ${(out.opaque * 100).toFixed(1)}% gold`);
} finally {
  await browser.close();
  server.kill();
}
