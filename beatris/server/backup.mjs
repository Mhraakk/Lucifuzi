// Disaster recovery (spec 0001 #18): a consistent copy of every shop database with SQLite's VACUUM INTO, checked
// by opening it and running integrity_check; the newest `keep` copies stay. Restore (by hand, server stopped):
//   cp $BEATRIS_DATA_DIR/backups/<stamp>/<name>.db $BEATRIS_DATA_DIR/<same path as the live file>
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const STAMP_RE = /^\d{8}T\d{6}Z$/;
export const stampOf = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** dbs: [[name, db]] (db = openDb handle). Returns what was written, with a check of each copy. */
export function backupAll({ dbs, dir, keep = 14, clock = () => Date.now() }) {
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
  const stamps = readdirSync(dir).filter((d) => STAMP_RE.test(d)).sort();
  for (const old of stamps.slice(0, Math.max(0, stamps.length - keep))) rmSync(path.join(dir, old), { recursive: true, force: true });
  return { stamp, dir: out, files, kept: Math.min(stamps.length, keep) };
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
