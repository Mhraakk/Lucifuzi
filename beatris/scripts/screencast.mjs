// Screen recording for the tutorial films at full quality (spec 0025 §5). The DevTools screencast hands over every
// frame the compositor draws, at the window's own pixel size; each frame is held for as long as it stayed on screen
// and written once, at a constant rate, into a visually lossless H.264 master. The browser must be launched at the
// real density (--force-device-scale-factor): with an emulated density the screencast still gives the CSS size
// (1280×720) and the film would be an enlargement, which is what Playwright's recorder made (also squeezed into a
// 1 Mb/s VP8 stream). recordPage reports the size it was given, so the caller can refuse a smaller one.
import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';

/** The H.264 a film is encoded with: High profile at the level its frame needs (4.0 up to 1920×1080, 5.0 for the
 *  standing 1080×2338), named exactly on the help page so a device that cannot play it takes the VP9 copy. */
export const avc1 = ({ width, height }) => (Math.ceil(width / 16) * Math.ceil(height / 16) > 8192 ? 'avc1.640032' : 'avc1.640028');
/** Encoder settings for a finished film (spec 0025 §5: higher quality than the 720p films, which were CRF 24/28). */
export const h264 = (frame) => ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', avc1(frame) === 'avc1.640032' ? '5.0' : '4.0', '-crf', frame.width < frame.height ? '22' : '20', '-pix_fmt', 'yuv420p', '-r', '25'];
/** The VP9 copy for browsers built without H.264 (was CRF 40). */
export const vp9 = ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'];

/** Width and height of a JPEG from its frame header. */
export function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

/**
 * Start recording `page`; resolves to `stop()`, which finishes the file and returns { frames, seconds, shot } (shot: the
 * size the browser really drew, to check it is the full frame and not an enlargement).
 * @param {import('playwright').Page} page
 * @param {{ width: number, height: number, file: string, fps?: number, ffmpeg?: string }} o the frame size (even numbers)
 */
export async function recordPage(page, { width, height, file, fps = 25, ffmpeg = 'ffmpeg' }) {
  const cdp = await page.context().newCDPSession(page);
  const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-an',
    // a frame a pixel short of the even size (2337 of 2338) is padded, never scaled
    '-vf', `pad=${width}:${height}:0:0:black,crop=${width}:${height}:0:0,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-r', String(fps), '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'inherit'] });
  // the browser draws first: the encoder only keeps up (its input is buffered), so it runs at a lower priority
  try {
    setPriority(enc.pid, 10);
  } catch {
    /* not allowed here: it simply runs at the same priority */
  }
  const finished = new Promise((ok, fail) => enc.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c} for ${file}`)))));
  enc.stdin.on('error', () => {}); // an encoder that stopped early is reported by `finished`, not by a broken pipe
  // times are the browser's own (when the frame reached the screen); the last frame is held until stop() by this
  // process's clock, measured from its arrival, so the two clocks are never mixed
  let last = null, lastT = 0, lastSeen = 0, t0 = null, written = 0, shot = null;
  /** Repeat `buf` until the film's clock reaches `at` seconds: a constant frame rate, like the screen itself. */
  const hold = async (buf, at) => {
    const n = Math.round(at * fps) - written;
    for (let i = 0; i < n; i++) if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    written += Math.max(0, n);
  };
  let queue = Promise.resolve();
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    const seen = performance.now() / 1000;
    const t = f.metadata.timestamp ?? (last ? lastT + (seen - lastSeen) : seen);
    const buf = Buffer.from(f.data, 'base64');
    shot ??= jpegSize(buf);
    queue = queue.then(async () => {
      t0 ??= t;
      if (last) await hold(last, t - t0);
      last = buf;
    });
    lastT = t;
    lastSeen = seen;
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  return async function stop() {
    const end = lastT + (performance.now() / 1000 - lastSeen);
    await cdp.send('Page.stopScreencast').catch(() => {});
    await queue;
    if (last) await hold(last, end - t0 + 1 / fps);
    enc.stdin.end();
    await finished;
    await cdp.detach().catch(() => {});
    return { frames: written, seconds: written / fps, shot };
  };
}
