// One quality probe for every picture the app draws (spec 0025). The device's real limits decide how sharp the 3D
// stage, the canvases and the exports are: a strong GPU is used to the full, a weak phone stays smooth. tierOf() and
// the budget helpers are pure (tested); probe() reads the browser once per page load.

// msaa / exportMsaa: GPU memory budgets in samples × pixels (one HDR sample with its depth is about 12 bytes).
// refineMP / exportMP: the most pixels a 2×2-supersampled still or export may be drawn at.
// sigma: how much the light tent is blurred in reflections (radians); smaller is sharper and needs a bigger map.
const T = {
  ultra: { tier: 'ultra', dpr: 3, samples: 8, msaa: 48e6, exportMsaa: 128e6, pmrem: 1024, sigma: 0.008, shadow: 4096, shadowRadius: 16, floor: 1.25, refineMP: 16e6, exportMP: 20e6, canvasDpr: 4, glint: true, videoMax: 2160, videoBits: 40e6 },
  high: { tier: 'high', dpr: 3, samples: 4, msaa: 24e6, exportMsaa: 64e6, pmrem: 512, sigma: 0.012, shadow: 2048, shadowRadius: 8, floor: 1.5, refineMP: 8e6, exportMP: 10e6, canvasDpr: 4, glint: true, videoMax: 1440, videoBits: 24e6 },
  standard: { tier: 'standard', dpr: 1.5, samples: 2, msaa: 8e6, exportMsaa: 34e6, pmrem: 256, sigma: 0.02, shadow: 1024, shadowRadius: 4, floor: 0.75, refineMP: 0, exportMP: 0, canvasDpr: 2, glint: false, videoMax: 1080, videoBits: 12e6 },
};
export const TIER_NAMES = Object.keys(T);
// renderers that draw on the CPU: the picture is right, but every extra pixel costs the whole machine
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;
const pow2Floor = (x) => 2 ** Math.floor(Math.log2(Math.max(1, x)));

/**
 * The settings for a device. caps: { dpr, cores, memory (GB, null when the browser does not say), webgl2, maxSamples,
 * maxTexture, maxRenderbuffer, maxAnisotropy, renderer, saveData, reducedMotion, mobile, force }.
 * The same caps always give the same settings.
 */
export function tierOf(caps = {}) {
  const c = caps ?? {};
  const memory = Number.isFinite(c.memory) ? c.memory : 8; // Safari and Firefox do not say: a normal device
  const cores = Number.isFinite(c.cores) ? c.cores : 4;
  let tier;
  if (T[c.force]) tier = c.force;
  else if (SOFTWARE.test(c.renderer ?? '') || c.saveData || memory <= 2 || c.webgl2 === false) tier = 'standard';
  else if ((c.maxSamples ?? 0) >= 8 && cores >= 8 && memory >= 8 && !c.mobile) tier = 'ultra';
  else tier = 'high';
  const t = { ...T[tier] };
  const dpr = Number.isFinite(c.dpr) && c.dpr > 0 ? c.dpr : 1;
  const maxTex = Number.isFinite(c.maxTexture) ? c.maxTexture : 4096;
  t.pixelRatio = Math.min(dpr, t.dpr);
  t.canvasRatio = Math.min(Math.max(dpr, 1), t.canvasDpr);
  t.samples = Math.max(0, Math.min(t.samples, Number.isFinite(c.maxSamples) ? pow2Floor(c.maxSamples) : t.samples));
  t.anisotropy = Math.max(1, Math.min(16, Number.isFinite(c.maxAnisotropy) ? c.maxAnisotropy : 1));
  // a reflection map's cube-UV texture is 3×4 times its size: keep it within the GPU's texture limit
  t.pmrem = Math.min(t.pmrem, pow2Floor(maxTex / 4));
  t.shadow = Math.min(t.shadow, pow2Floor(maxTex));
  t.shadowRadius = (t.shadowRadius * t.shadow) / T[tier].shadow; // the same soft edge on a smaller map
  t.exportMax = Math.min(7680, Number.isFinite(c.maxRenderbuffer) ? Math.min(maxTex, c.maxRenderbuffer) : maxTex);
  t.videoMax = Math.min(t.videoMax, t.exportMax);
  t.motion = !c.reducedMotion;
  return t;
}

/** MSAA samples for a target of px pixels: the most the tier allows within its memory budget (0 = none). */
export function samplesFor(px, max, budget) {
  let s = pow2Floor(max);
  while (s >= 2 && px * s > budget) s /= 2;
  return s >= 2 && max >= 2 ? s : 0;
}

/** 2 when a w×h picture can be drawn at twice its size each way (2×2 supersampling) within budget and the GPU's size limit, else 1. */
export function superFor(w, h, budget, maxSide = Infinity) {
  return budget > 0 && 4 * w * h <= budget && 2 * Math.max(w, h) <= maxSide ? 2 : 1;
}

/** Device density for a 2D canvas of w×h CSS pixels: as sharp as the screen, under the browsers' 16.7M-pixel limit. */
export function canvasDensity(w, h, cap = probeLight().canvasRatio) {
  const area = Math.max(1, w) * Math.max(1, h);
  return Math.max(1, Math.min(cap, Math.sqrt(16_700_000 / area)));
}

let light = null;
/** The cheap part of the probe (no WebGL context): for 2D canvases. */
export function probeLight() {
  if (light) return light;
  const g = globalThis;
  const caps = {
    dpr: g.devicePixelRatio || 1,
    cores: g.navigator?.hardwareConcurrency,
    memory: g.navigator?.deviceMemory ?? null,
    saveData: !!g.navigator?.connection?.saveData,
    reducedMotion: typeof g.matchMedia === 'function' && g.matchMedia('(prefers-reduced-motion: reduce)').matches,
    mobile: typeof g.matchMedia === 'function' && g.matchMedia('(pointer: coarse)').matches,
    force: forced(),
  };
  light = tierOf({ ...caps, maxSamples: 8 });
  light.caps = caps;
  return light;
}

let full = null;
/**
 * Everything, including the GPU's limits: for the 3D stage and exports. Reads them from the stage's own WebGL2
 * context when given one, otherwise from a throw-away context.
 */
export function probe(gl = null) {
  if (full) return full;
  const caps = { ...probeLight().caps };
  let own = null;
  try {
    if (!gl) gl = own = document.createElement('canvas').getContext('webgl2');
    caps.webgl2 = !!gl;
    if (gl) {
      caps.maxSamples = gl.getParameter(gl.MAX_SAMPLES);
      caps.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      caps.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      caps.maxAnisotropy = aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      caps.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }
  } catch {
    caps.webgl2 = false;
  } finally {
    own?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  full = tierOf(caps);
  full.caps = caps;
  return full;
}

/** ?quality=ultra|high|standard for a support call or a test; remembered for the tab. */
function forced() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('quality');
    if (q && T[q]) sessionStorage.setItem('beatris.quality', q);
    const s = sessionStorage.getItem('beatris.quality');
    return T[s] ? s : null;
  } catch {
    return null;
  }
}
