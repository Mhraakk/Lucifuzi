// Disaster recovery (spec 0001 #18): a consistent copy of every shop database with SQLite's VACUUM INTO, checked
// by opening it and running integrity_check; the newest `keep` copies stay. Restore (by hand, server stopped):
//   cp $BEATRIS_DATA_DIR/backups/<stamp>/<name>.db $BEATRIS_DATA_DIR/<same path as the live file>
//   cp -r $BEATRIS_DATA_DIR/backups/<stamp>/media/. $BEATRIS_DATA_DIR/media/
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const STAMP_RE = /^\d{8}T\d{6}Z$/;
export const stampOf = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/**
 * dbs: [[name, db]] (db = openDb handle); media: the uploaded files' folder, copied beside the databases (spec 0054).
 * Returns what was written, with a check of each copy.
 */
export function backupAll({ dbs, dir, media = null, keep = 14, clock = () => Date.now() }) {
  const stamp = stampOf(clock());
  const out = path.join(dir, stamp);
  mkdirSync(out, { recursive: true });
  const files = [];
  for (const [name, db] of dbs) {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`bad backup name ${name}`);
    const file = path.join(out, `${name}.db`);
    db.raw.prepare('VACUUM INTO ?').run(file);
    const copy = new DatabaseSync(file, { readOnly: true });
    try {
      const ok = copy.prepare('PRAGMA integrity_check').get();
      const tables = copy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
      files.push({ name, bytes: statSync(file).size, integrity: Object.values(ok)[0], tables });
    } finally {
      copy.close();
    }
  }
  let mediaFiles = 0;
  if (media && existsSync(media)) {
    cpSync(media, path.join(out, 'media'), { recursive: true });
    const walk = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(path.join(d, e.name)) : 1), 0);
    mediaFiles = walk(path.join(out, 'media'));
  }
  const stamps = readdirSync(dir).filter((d) => STAMP_RE.test(d)).sort();
  for (const old of stamps.slice(0, Math.max(0, stamps.length - keep))) rmSync(path.join(dir, old), { recursive: true, force: true });
  return { stamp, dir: out, files, media: mediaFiles, kept: Math.min(stamps.length, keep) };
}

export function listBackups(dir) {
  let stamps = [];
  try {
    stamps = readdirSync(dir).filter((d) => STAMP_RE.test(d)).sort().reverse();
  } catch {
    return [];
  }
  return stamps.map((s) => {
    const files = readdirSync(path.join(dir, s)).filter((f) => f.endsWith('.db'));
    return { stamp: s, files: files.length, bytes: files.reduce((a, f) => a + statSync(path.join(dir, s, f)).size, 0) };
  });
}

/**
 * Where a data folder lives (spec 0054): the mount it sits on, and whether that is a volume of its own (a host disk,
 * which survives a redeploy) or the container's root filesystem, which a redeploy wipes. Linux only; null elsewhere.
 */
export function storageOf(dir, mounts = '/proc/mounts') {
  let table;
  try {
    table = readFileSync(mounts, 'utf8');
  } catch {
    return { mount: null, persistent: null };
  }
  const abs = path.resolve(dir);
  let best = '/';
  for (const line of table.split('\n')) {
    const mp = line.split(' ')[1]?.replace(/\\040/g, ' ');
    if (mp && mp.length > best.length && (abs === mp || abs.startsWith(`${mp}/`))) best = mp;
  }
  return { mount: best, persistent: best !== '/' };
}
