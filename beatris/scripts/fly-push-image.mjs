// spec 0057: build and push the Fly.io image without Docker or a remote builder, then (with --deploy) deploy it. For a
// session whose network carries only plain HTTPS (no gRPC, no WebSocket, no WireGuard), where `flyctl deploy` cannot
// reach Fly's builders; CI deploys with `flyctl deploy --remote-only` instead (.github/workflows/beatris.yml).
// The image is the Dockerfile's, assembled by hand: node:22-slim's layers copied from Docker Hub, one layer holding the
// repository's tracked files that the server reads at run time (as .dockerignore leaves them) under /app, and the
// config's environment, working directory and command. The app has no runtime dependencies, so no install step.
//   FLY_API_TOKEN=… NODE_USE_ENV_PROXY=1 node scripts/fly-push-image.mjs [--app=beatris] [--deploy]
import { createReadStream, createWriteStream, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const app = arg('app', 'beatris');
const token = process.env.FLY_API_TOKEN;
if (!token) throw new Error('FLY_API_TOKEN is required (the Fly.io token; never commit it).');
if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()) throw new Error('commit first: the image is built from the tracked files of HEAD');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const tag = `deployment-${sha.slice(0, 7)}`;
const WORK = path.join(tmpdir(), `beatris-image-${sha.slice(0, 7)}`);
mkdirSync(path.join(WORK, 'blobs'), { recursive: true });

// ---- the app layer: what .dockerignore keeps, from the tracked files, owned by root, at a fixed time ----
const SKIP = /^(tests|scripts|desktop|shots)\/|(^|\/)\.DS_Store$|\.log$/;
const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
const dirs = new Set();
for (const f of files) {
  const p = f.split('/').slice(0, -1);
  for (let i = 1; i <= p.length; i++) dirs.add(p.slice(0, i).join('/'));
}
writeFileSync(path.join(WORK, 'entries.txt'), [...[...dirs].sort(), ...files].join('\n') + '\n');
const tarFile = path.join(WORK, 'layer.tar'), gzFile = `${tarFile}.gz`;
execFileSync('tar', ['--no-recursion', '-T', path.join(WORK, 'entries.txt'), '--owner=0', '--group=0', '--numeric-owner', '--mtime=2026-01-01 00:00:00', '--transform', 's,^,app/,', '-cf', tarFile], { cwd: ROOT });
execFileSync('sh', ['-c', `gzip -n -6 -c "${tarFile}" > "${gzFile}"`]);
const sha256File = async (f) => {
  const h = createHash('sha256');
  await pipeline(createReadStream(f), h);
  return `sha256:${h.digest('hex')}`;
};
const diffId = await sha256File(tarFile);
console.log(`app layer: ${files.length} files, ${(statSync(gzFile).size / 1048576).toFixed(1)} MB compressed`);

// ---- registries ----
const FLY = 'https://registry.fly.io';
const flyAuth = `Basic ${Buffer.from(`x:${token}`).toString('base64')}`;
const ACCEPT = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].join(', ');
async function ok(r, what) {
  if (r.ok) return r;
  throw new Error(`${what}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}
const hubTok = (await (await ok(await fetch('https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull'), 'hub token')).json()).token;
const hub = (p, accept = ACCEPT) => fetch(`https://registry-1.docker.io/v2/library/node/${p}`, { headers: { authorization: `Bearer ${hubTok}`, accept } });
const fly = (p, init = {}) => fetch(p.startsWith('http') ? p : `${FLY}${p}`, { ...init, headers: { authorization: flyAuth, ...(init.headers ?? {}) } });
const hasBlob = async (digest) => (await fly(`/v2/${app}/blobs/${digest}`, { method: 'HEAD' })).status === 200;
async function pushBlob(file, digest) {
  if (await hasBlob(digest)) return console.log(`  ${digest.slice(7, 19)} already there`);
  const size = statSync(file).size, CHUNK = 64 << 20;
  let loc = (await ok(await fly(`/v2/${app}/blobs/uploads/`, { method: 'POST' }), 'start upload')).headers.get('location');
  for (let start = 0; start < size; start += CHUNK) {
    const end = Math.min(size, start + CHUNK) - 1;
    const r = await ok(await fly(loc, { method: 'PATCH', headers: { 'content-type': 'application/octet-stream', 'content-range': `${start}-${end}`, 'content-length': String(end - start + 1) }, body: Readable.toWeb(createReadStream(file, { start, end })), duplex: 'half' }), `chunk ${start}`);
    loc = r.headers.get('location');
  }
  const done = new URL(loc, FLY);
  done.searchParams.set('digest', digest);
  await ok(await fly(done.href, { method: 'PUT', headers: { 'content-length': '0' } }), 'finish upload');
  console.log(`  ${digest.slice(7, 19)} pushed (${(size / 1048576).toFixed(1)} MB)`);
}

// ---- the base image (node:22-slim, linux/amd64), its layers copied over ----
let man = await (await ok(await hub('manifests/22-slim'), 'base index')).json();
if (man.manifests) man = await (await ok(await hub(`manifests/${man.manifests.find((x) => x.platform?.architecture === 'amd64' && x.platform?.os === 'linux').digest}`), 'base manifest')).json();
const oci = (man.mediaType ?? '').includes('oci');
const base = await (await ok(await hub(`blobs/${man.config.digest}`, '*/*'), 'base config')).json();
for (const l of man.layers) {
  if (await hasBlob(l.digest)) {
    console.log(`  ${l.digest.slice(7, 19)} already there`);
    continue;
  }
  const f = path.join(WORK, 'blobs', l.digest.slice(7));
  if (!existsSync(f) || (await sha256File(f)) !== l.digest) await pipeline(Readable.fromWeb((await ok(await hub(`blobs/${l.digest}`, '*/*'), `base layer ${l.digest}`)).body), createWriteStream(f));
  await pushBlob(f, l.digest);
}
const layerDigest = await sha256File(gzFile);
await pushBlob(gzFile, layerDigest);

// ---- config and manifest: the Dockerfile's ENV, WORKDIR, EXPOSE and CMD ----
const env = new Map(base.config.Env.map((e) => [e.split('=')[0], e]));
for (const [k, v] of [['NODE_ENV', 'production'], ['PORT', '8080'], ['BEATRIS_BUILD', sha]]) env.set(k, `${k}=${v}`);
const now = new Date().toISOString();
const config = { ...base, created: now, config: { ...base.config, Env: [...env.values()], WorkingDir: '/app', Cmd: ['npm', 'start'], ExposedPorts: { '8080/tcp': {} } }, rootfs: { ...base.rootfs, diff_ids: [...base.rootfs.diff_ids, diffId] }, history: [...(base.history ?? []), { created: now, created_by: `beatris ${sha} (scripts/fly-push-image.mjs)` }] };
const cfgBytes = Buffer.from(JSON.stringify(config));
const cfgDigest = `sha256:${createHash('sha256').update(cfgBytes).digest('hex')}`;
writeFileSync(path.join(WORK, 'config.json'), cfgBytes);
await pushBlob(path.join(WORK, 'config.json'), cfgDigest);
const manifest = {
  schemaVersion: 2,
  mediaType: oci ? 'application/vnd.oci.image.manifest.v1+json' : 'application/vnd.docker.distribution.manifest.v2+json',
  config: { mediaType: oci ? 'application/vnd.oci.image.config.v1+json' : 'application/vnd.docker.container.image.v1+json', digest: cfgDigest, size: cfgBytes.length },
  layers: [...man.layers, { mediaType: oci ? 'application/vnd.oci.image.layer.v1.tar+gzip' : 'application/vnd.docker.image.rootfs.diff.tar.gzip', digest: layerDigest, size: statSync(gzFile).size }],
};
await ok(await fly(`/v2/${app}/manifests/${tag}`, { method: 'PUT', headers: { 'content-type': manifest.mediaType }, body: JSON.stringify(manifest) }), 'manifest');
const image = `registry.fly.io/${app}:${tag}`;
console.log(`pushed ${image}`);
if (process.argv.includes('--deploy')) execFileSync('flyctl', ['deploy', '--app', app, '--image', image], { cwd: ROOT, stdio: 'inherit' });
